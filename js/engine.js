// The audio side of the board.
//
// Each pad owns one media element, wired through its own gain node into a
// master gain. The element is created the first time the pad is set up and
// then kept, with the file already buffered, so a tap plays on the beat
// instead of after a fetch. Pads set to layer get extra throwaway voices.
//
// Fades are ramps on the gain node, not on element volume, so a fade out can
// be interrupted by a fade in without a click.

const FLOOR = 0.0001;
const EPS = 0.02;

// Previews are voices like any other, on a channel no pad can have.
export const PREVIEW = -1;

export class Engine {
  constructor(library) {
    this.lib = library;
    this.ctx = null;
    this.out = null;
    this.channels = new Map(); // pad index -> channel
    this.extras = new Set();   // layered one-shot voices
    this.masterLevel = 0.8;
    this.onchange = () => {};
  }

  /**
   * Make sure there is a running context. Outside a click or a key press the
   * browser leaves resume() pending, so buffering work passes wait = false
   * rather than hanging until the operator touches something.
   */
  async unlock(wait = true) {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.out = this.ctx.createGain();
      this.out.gain.value = this.masterLevel;
      this.out.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') {
      const resumed = this.ctx.resume();
      if (wait) await resumed;
      else resumed.catch(() => {});
    }
    return this.ctx;
  }

  setMaster(level) {
    this.masterLevel = level;
    if (this.out) this.out.gain.setTargetAtTime(level, this.ctx.currentTime, 0.015);
  }

  /**
   * iOS will not let a media element make a sound until that element has been
   * started inside a gesture, however willing the audio context is. On the
   * first touch every primed element is nudged at silence so that the pad it
   * belongs to answers the next tap instead of the one after.
   */
  async wake() {
    await this.unlock();
    this.woke = true;
    await Promise.all([...this.channels.values()].map((ch) => this._nudge(ch)));
  }

  async _nudge(ch) {
    if (ch.state !== 'idle') return;
    this._set(ch.gain, FLOOR);
    try {
      await ch.el.play();
      // A pad fired in the meantime owns this element now; leave it alone.
      if (ch.state !== 'idle') return;
      ch.el.pause();
      ch.el.currentTime = (ch.pad && ch.pad.trimStart) || 0;
    } catch {
      /* no gesture yet, or nothing loaded: the pad's own tap will do it */
    }
  }

  /** Buffer a pad's file ahead of the show without playing it. */
  async prime(i, pad) {
    if (!pad || !pad.file || !this.lib.has(pad.file)) return;
    try {
      await this._channel(i, pad);
    } catch {
      /* a file that will not load shows up when the pad is fired */
    }
  }

  /**
   * Hear a sound that is not on a pad yet — or one that is, straight from the
   * folder. Tapping the same sound again stops it.
   */
  async preview(path) {
    const was = this.previewPath;
    this.stopPreview();
    if (was === path) return null;
    this.previewPath = path;
    const pad = {
      file: path,
      name: path.split('/').pop(),
      gel: 'straw',
      gain: 1,
      fadeIn: 0,
      fadeOut: 0.15,
      preview: true,
    };
    try {
      return await this.start(PREVIEW, pad, { layer: true });
    } catch (err) {
      this.previewPath = null;
      throw err;
    }
  }

  stopPreview() {
    if (!this.previewPath) return;
    this.previewPath = null;
    this.stop(PREVIEW, { fade: 0 });
  }

  /** What tapping the pad does, given what it is doing now. */
  async fire(i, pad) {
    const ch = this.channels.get(i);
    // A sound fading out has already been stopped: tapping it again starts it
    // afresh rather than stopping it a second time.
    const live =
      (ch && ch.state !== 'idle' && !ch.fading) || this._extrasFor(i).some((v) => !v.fading);
    if (!live) return this.start(i, pad);

    switch (pad.tap) {
      case 'restart':
        return this.start(i, pad, { fadeIn: 0 });
      case 'pause':
        return ch && ch.state === 'paused' ? this.resume(i) : this.pause(i);
      case 'overlay':
        return this.start(i, pad, { layer: true });
      case 'ignore':
        return undefined;
      case 'fadeout':
      default:
        return this.stop(i, { fade: pad.fadeOut });
    }
  }

  async start(i, pad, { fadeIn, layer = false } = {}) {
    await this.unlock();
    if (pad.solo) await this.stopAll({ fade: pad.fadeOut ?? 1, except: i });

    const voice = layer ? await this._extra(i, pad) : await this._channel(i, pad);
    clearTimeout(voice.stopTimer);
    voice.stopTimer = null;
    voice.pad = pad;
    voice.fading = false;
    voice.state = 'starting'; // claimed, so a silent wake nudge cannot pause it

    const level = clamp01(pad.gain ?? 1);
    const fade = Math.max(0, fadeIn ?? pad.fadeIn ?? 0);
    voice.el.loop = !!pad.loop && !pad.trimEnd && !pad.trimStart;
    await seek(voice.el, pad.trimStart || 0);
    this._set(voice.gain, fade > 0 ? FLOOR : level);

    try {
      await voice.el.play();
    } catch (err) {
      voice.state = 'idle';
      this._drop(voice);
      throw err;
    }

    if (fade > 0) this._ramp(voice.gain, level, fade);
    voice.state = 'playing';
    this.onchange();
    return voice;
  }

  stop(i, { fade = 0 } = {}) {
    const voices = [this.channels.get(i), ...this._extrasFor(i)].filter(Boolean);
    for (const v of voices) this._stopVoice(v, fade);
    this.onchange();
  }

  async stopAll({ fade = 0, except = null } = {}) {
    if (except !== PREVIEW) this.previewPath = null;
    for (const [i, ch] of this.channels) {
      if (i !== except) this._stopVoice(ch, fade);
    }
    for (const v of this.extras) {
      if (v.i !== except) this._stopVoice(v, fade);
    }
    this.onchange();
  }

  pause(i) {
    const ch = this.channels.get(i);
    if (!ch || ch.state !== 'playing') return;
    ch.el.pause();
    ch.state = 'paused';
    this.onchange();
  }

  async resume(i) {
    const ch = this.channels.get(i);
    if (!ch || ch.state !== 'paused') return;
    await this.unlock();
    this._set(ch.gain, clamp01(ch.pad.gain ?? 1));
    await ch.el.play();
    ch.state = 'playing';
    this.onchange();
  }

  /** Level change while a pad is playing, as a fader move rather than a jump. */
  setPadLevel(i, level) {
    const ch = this.channels.get(i);
    if (ch && ch.state !== 'idle' && !ch.fading) {
      ch.gain.gain.setTargetAtTime(Math.max(clamp01(level), FLOOR), this.ctx.currentTime, 0.02);
    }
  }

  state(i) {
    const ch = this.channels.get(i);
    const extras = this._extrasFor(i);
    const live = ch && ch.state !== 'idle' ? ch : extras[0];
    if (!live) return null;
    return {
      state: live.state,
      position: live.el.currentTime,
      duration: Number.isFinite(live.el.duration) ? live.el.duration : 0,
      stack: (ch && ch.state !== 'idle' ? 1 : 0) + extras.length,
      fading: live.fading,
    };
  }

  active() {
    const out = [];
    for (const [i, ch] of this.channels) if (ch.state !== 'idle') out.push({ i, pad: ch.pad, voice: ch });
    for (const v of this.extras) out.push({ i: v.i, pad: v.pad, voice: v });
    return out;
  }

  get anyPlaying() {
    return this.active().length > 0;
  }

  /** Called once per frame: honours stop points, loop points and fade tails. */
  tick() {
    for (const { pad, voice } of this.active()) {
      if (voice.state !== 'playing') continue;
      const end = pad.trimEnd || 0;
      const t = voice.el.currentTime;

      if (end > 0) {
        if (t >= end - EPS) {
          if (pad.loop) {
            voice.el.currentTime = pad.trimStart || 0;
          } else {
            this._stopVoice(voice, 0);
            this.onchange();
          }
          continue;
        }
        // Start the fade early enough that it lands on the stop point.
        const fade = pad.fadeOut || 0;
        if (fade > 0 && !voice.fading && end - t <= fade) this._stopVoice(voice, end - t);
      } else if (pad.loop && pad.trimStart && voice.el.ended) {
        voice.el.currentTime = pad.trimStart;
        voice.el.play().catch(() => {});
      }
    }
  }

  /** Drop every element: the folder, and so every blob URL, has changed. */
  reset() {
    for (const ch of this.channels.values()) this._teardown(ch);
    for (const v of this.extras) this._teardown(v);
    this.channels.clear();
    this.extras.clear();
    this.onchange();
  }

  // ── internals ───────────────────────────────────────────────────────────

  async _channel(i, pad) {
    let ch = this.channels.get(i);
    if (!ch) {
      await this.unlock(false);
      const el = new Audio();
      el.preload = 'auto';
      const src = this.ctx.createMediaElementSource(el);
      const gain = this.ctx.createGain();
      gain.gain.value = FLOOR;
      src.connect(gain).connect(this.out);
      ch = { i, el, src, gain, pad, path: null, state: 'idle', fading: false, stopTimer: null };
      ch.onEnded = () => {
        if (!ch.el.loop) {
          ch.state = 'idle';
          this.onchange();
        }
      };
      el.addEventListener('ended', ch.onEnded);
      this.channels.set(i, ch);
      if (this.woke) this._nudge(ch);
    }
    if (ch.path !== pad.file) {
      ch.el.src = await this.lib.url(pad.file);
      ch.path = pad.file;
      ch.el.load();
    }
    return ch;
  }

  async _extra(i, pad) {
    await this.unlock(false);
    const el = new Audio();
    el.preload = 'auto';
    el.src = await this.lib.url(pad.file);
    const src = this.ctx.createMediaElementSource(el);
    const gain = this.ctx.createGain();
    gain.gain.value = FLOOR;
    src.connect(gain).connect(this.out);
    const voice = { i, el, src, gain, pad, path: pad.file, state: 'idle', fading: false, stopTimer: null, transient: true };
    voice.onEnded = () => {
      if (voice.i === PREVIEW) this.previewPath = null;
      this._drop(voice);
      this.onchange();
    };
    el.addEventListener('ended', voice.onEnded);
    this.extras.add(voice);
    return voice;
  }

  _extrasFor(i) {
    return [...this.extras].filter((v) => v.i === i);
  }

  _stopVoice(voice, fade) {
    if (!voice || voice.state === 'idle') return;
    const seconds = Math.max(0, fade || 0);
    clearTimeout(voice.stopTimer);

    const settle = () => {
      voice.el.pause();
      voice.fading = false;
      voice.stopTimer = null;
      if (voice.transient) {
        this._drop(voice);
      } else {
        voice.state = 'idle';
        try {
          voice.el.currentTime = (voice.pad && voice.pad.trimStart) || 0;
        } catch {
          /* seeking a not-yet-loaded element is harmless to skip */
        }
      }
      this.onchange();
    };

    if (seconds > 0.02) {
      voice.fading = true;
      this._ramp(voice.gain, FLOOR, seconds);
      voice.stopTimer = setTimeout(settle, seconds * 1000 + 30);
      this.onchange();
    } else {
      this._set(voice.gain, FLOOR);
      settle();
    }
  }

  _drop(voice) {
    this._teardown(voice);
    this.extras.delete(voice);
  }

  _teardown(voice) {
    clearTimeout(voice.stopTimer);
    voice.el.removeEventListener('ended', voice.onEnded);
    try {
      voice.el.pause();
      voice.src.disconnect();
      voice.gain.disconnect();
    } catch {
      /* already detached */
    }
    voice.el.removeAttribute('src');
    voice.state = 'idle';
  }

  _set(gain, value) {
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(value, FLOOR), now);
  }

  _ramp(gain, target, seconds) {
    const now = this.ctx.currentTime;
    const from = Math.max(gain.gain.value, FLOOR);
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(from, now);
    // Exponential, so the ramp sounds even to the ear rather than to the meter.
    gain.gain.exponentialRampToValueAtTime(Math.max(target, FLOOR), now + Math.max(seconds, 0.01));
  }
}

function clamp01(v) {
  return Math.min(1, Math.max(0, Number(v) || 0));
}

function seek(el, time) {
  const target = Math.max(0, Number(time) || 0);
  if (Math.abs(el.currentTime - target) < 0.01 && el.readyState >= 1) return Promise.resolve();
  if (el.readyState >= 1) {
    try {
      el.currentTime = target;
    } catch {
      /* ignore: the element will start from wherever it can */
    }
    return Promise.resolve();
  }
  if (target === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      try {
        el.currentTime = target;
      } catch { /* ignore */ }
      resolve();
    };
    el.addEventListener('loadedmetadata', done, { once: true });
    el.addEventListener('error', resolve, { once: true });
    setTimeout(resolve, 1500);
  });
}

/** Length of a file in seconds, for the cue sheet. 0 if it cannot be read. */
export function probeDuration(url) {
  return new Promise((resolve) => {
    const el = new Audio();
    el.preload = 'metadata';
    const done = (value) => {
      el.removeAttribute('src');
      resolve(value);
    };
    el.addEventListener('loadedmetadata', () => done(Number.isFinite(el.duration) ? el.duration : 0), { once: true });
    el.addEventListener('error', () => done(0), { once: true });
    setTimeout(() => done(0), 6000);
    el.src = url;
  });
}
