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
    this.broken = new Map();   // pad index -> the file it would not load
    this.onbroken = () => {};  // (i, broken): a pad's file failed, or loaded after all
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
    if (!this.live(i).length) {
      // A sound told to stop and still fading out is a stop the operator is
      // taking back: it comes back from where it is, not from the top.
      if (this._fadingOut(i)) return this.start(i, pad, { back: true });
      return this.start(i, pad);
    }

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

  async start(i, pad, { fadeIn, layer = false, back = false } = {}) {
    await this.unlock();
    // Everything else goes out on its own fade out, as Stop takes it.
    if (pad.solo) await this.stopAll({ own: true, except: i });

    const voice = layer ? await this._extra(i, pad) : await this._channel(i, pad);
    // A voice tapped back on while it fades out is still sounding: it comes
    // back up from where the fade had got to, rather than dropping to silence
    // first.
    const sounding = voice.state !== 'idle' && voice.fading;
    clearTimeout(voice.stopTimer);
    voice.stopTimer = null;
    voice.pad = pad;
    voice.fading = false;
    voice.released = false;
    voice.state = 'starting'; // claimed, so a silent wake nudge cannot pause it
    const claim = (voice.claim = (voice.claim || 0) + 1);

    const level = clamp01(pad.gain ?? 1);
    const fade = Math.max(0, fadeIn ?? pad.fadeIn ?? 0);
    voice.el.loop = !!pad.loop && !pad.trimEnd && !pad.trimStart;
    if (!(back && sounding)) await seek(voice.el, pad.trimStart || 0);
    if (fade <= 0) this._set(voice.gain, level);
    else this._set(voice.gain, sounding ? voice.gain.gain.value : FLOOR);

    try {
      await voice.el.play();
    } catch (err) {
      // Stopped, or started afresh, while play() was still pending: the
      // pause() that did it rejects the promise, and that is no failure.
      if (voice.claim !== claim || voice.state !== 'starting') return null;
      // Anything else leaves the element unusable. Let it go, so that the
      // next tap builds the pad a new one instead of lighting up in silence.
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
    for (const v of voices) this._release(v, fade);
    this.onchange();
  }

  /** Stop every voice, on one fade or (own) on each pad's own fade out. */
  async stopAll({ fade = 0, own = false, except = null } = {}) {
    if (except !== PREVIEW) this.previewPath = null;
    const fadeOf = (v) => (own && v.pad ? v.pad.fadeOut ?? fade : fade);
    for (const [i, ch] of this.channels) {
      if (i !== except) this._release(ch, fadeOf(ch));
    }
    for (const v of this.extras) {
      if (v.i !== except) this._release(v, fadeOf(v));
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

  /**
   * What a pad shows: the voices nobody has told to stop, or else its own
   * sound still fading out after it was told, with how loud it still is
   * (level, 1 at the pad's level down to 0 well before the fade ends). The
   * hall still hears that one, and a tap brings it back.
   */
  state(i) {
    const live = this.live(i);
    if (live.length) return { ...this._shown(live[0].voice), stack: live.length };
    const ch = this._fadingOut(i);
    if (!ch) return null;
    return { ...this._shown(ch), state: 'fading', level: this._loudness(ch), stack: 1 };
  }

  /** The pad's channel, if it was told to stop and is still heard fading out. */
  _fadingOut(i) {
    const ch = this.channels.get(i);
    return ch && ch.released && ch.state !== 'idle' ? ch : null;
  }

  _shown(voice) {
    return {
      state: voice.state,
      position: voice.el.currentTime,
      duration: Number.isFinite(voice.el.duration) ? voice.el.duration : 0,
    };
  }

  /**
   * How loud a voice is against its pad's level, as the ear hears it: the
   * fade is even in decibels, so the light goes down with it evenly, and is
   * out once the sound is 60 dB down, where the hall no longer hears it.
   */
  _loudness(voice) {
    const full = Math.max(clamp01(voice.pad?.gain ?? 1), FLOOR);
    const db = 20 * Math.log10(Math.max(voice.gain.gain.value, FLOOR) / full);
    return clamp01(1 + db / 60);
  }

  /** Every voice still sounding, fading out or not; the channel first. */
  active() {
    const out = [];
    for (const [i, ch] of this.channels) if (ch.state !== 'idle') out.push({ i, pad: ch.pad, voice: ch });
    for (const v of this.extras) out.push({ i: v.i, pad: v.pad, voice: v });
    return out;
  }

  /**
   * The voices still sounding that nobody has told to stop — of one pad, or
   * of the whole board. A fade towards a pad's own stop point does not count
   * as being told: the pad is still playing out, and answers a tap as usual.
   */
  live(i = null) {
    return this.active().filter(({ i: j, voice }) => !voice.released && (i == null || j === i));
  }

  get anyPlaying() {
    return this.active().length > 0;
  }

  /** Called every frame (on a timer while the tab is hidden): honours stop points, loop points and fade tails. */
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
        // Start the fade early enough that it lands on the stop point. A loop
        // goes round instead of stopping there, so it has nothing to fade to.
        const fade = pad.fadeOut || 0;
        if (fade > 0 && !pad.loop && !voice.fading && end - t <= fade) this._stopVoice(voice, end - t);
      }
    }
  }

  /**
   * The same sounds now come from somewhere else — the real files in place of
   * the kept copies. Silent pads are rebuilt from the new files; a pad still
   * sounding keeps the element it is playing from, so pressing Reconnect in
   * the middle of a cue cuts nothing, and is rebuilt once it falls silent.
   */
  repoint() {
    for (const ch of [...this.channels.values()]) {
      if (ch.state === 'idle') this._drop(ch);
      else ch.stale = true;
    }
    for (const v of [...this.extras]) if (v.state === 'idle') this._drop(v);
    this.onchange();
  }

  /** Drop every element: the folder, and so every blob URL, has changed. */
  reset() {
    for (const ch of this.channels.values()) this._teardown(ch);
    for (const v of this.extras) this._teardown(v);
    this.channels.clear();
    this.extras.clear();
    this.broken.clear();       // the files may come from somewhere else now
    this.onchange();
  }

  /**
   * Whether a pad's file was tried and would not load. Kept apart from the
   * channel, which a failed tap throws away, and tied to the file, so a pad
   * given another sound is not drawn as broken before it has been tried.
   */
  wontLoad(i, pad) {
    return !!pad && this.broken.get(i) === pad.file;
  }

  _loaded(i, path, ok) {
    if (ok ? this.broken.get(i) !== path : this.broken.get(i) === path) return;
    if (ok) this.broken.delete(i);
    else this.broken.set(i, path);
    this.onbroken(i, !ok);
  }

  // ── internals ───────────────────────────────────────────────────────────

  async _channel(i, pad) {
    let ch = this.channels.get(i);
    if (!ch) {
      await this.unlock(false);
      const el = voiceElement();
      const src = this.ctx.createMediaElementSource(el);
      const gain = this.ctx.createGain();
      gain.gain.value = FLOOR;
      src.connect(gain).connect(this.out);
      ch = { i, el, src, gain, pad, path: null, state: 'idle', fading: false, stopTimer: null };
      ch.onEnded = () => {
        if (ch.el.loop || this._goRound(ch)) return;
        ch.state = 'idle';
        this._renew(ch);
        this.onchange();
      };
      el.addEventListener('ended', ch.onEnded);
      // Found out while the board is being set up, not at the tap in the
      // show: a file the browser cannot read, or one player too many.
      el.addEventListener('error', () => {
        if (this.channels.get(i) === ch && ch.path) this._loaded(i, ch.path, false);
      });
      el.addEventListener('loadeddata', () => {
        if (this.channels.get(i) === ch && ch.path) this._loaded(i, ch.path, true);
      });
      this.channels.set(i, ch);
      if (this.woke) this._nudge(ch);
    }
    if (ch.path !== pad.file) {
      ch.el.src = await this.lib.url(pad.file);
      ch.path = pad.file;
      ch.el.load();
    } else if (ch.el.error) {
      ch.el.load();   // try again: whatever stopped it may have passed
    }
    return ch;
  }

  async _extra(i, pad) {
    await this.unlock(false);
    const el = voiceElement();
    el.src = await this.lib.url(pad.file);
    const src = this.ctx.createMediaElementSource(el);
    const gain = this.ctx.createGain();
    gain.gain.value = FLOOR;
    src.connect(gain).connect(this.out);
    const voice = { i, el, src, gain, pad, path: pad.file, state: 'idle', fading: false, stopTimer: null, transient: true };
    voice.onEnded = () => {
      if (this._goRound(voice)) return;
      if (voice.i === PREVIEW) this.previewPath = null;
      this._drop(voice);
      this.onchange();
    };
    el.addEventListener('ended', voice.onEnded);
    this.extras.add(voice);
    return voice;
  }

  /**
   * A loop with a start or stop point is looped by hand, as the element's own
   * loop would go back to the top of the file. If the file runs out before
   * the stop point — or there is none — go back to the start point here.
   */
  _goRound(voice) {
    const pad = voice.pad;
    if (!pad || !pad.loop || voice.state !== 'playing') return false;
    voice.el.currentTime = pad.trimStart || 0;
    voice.el.play().catch(() => {});
    return true;
  }

  _extrasFor(i) {
    return [...this.extras].filter((v) => v.i === i);
  }

  /**
   * Stop a voice because someone asked to. One already on its way out keeps
   * the fade it has, unless this is a hard cut.
   */
  _release(voice, fade) {
    if (!voice || voice.state === 'idle') return;
    if (voice.released && fade > 0) return;
    voice.released = true;
    this._stopVoice(voice, fade);
  }

  _stopVoice(voice, fade) {
    if (!voice || voice.state === 'idle') return;
    const seconds = Math.max(0, fade || 0);
    clearTimeout(voice.stopTimer);

    const settle = () => {
      voice.el.pause();
      voice.fading = false;
      voice.released = false;
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
        this._renew(voice);
      }
      this.onchange();
    };

    if (seconds > 0.02) {
      voice.fading = true;
      this._ramp(voice.gain, FLOOR, seconds);
      voice.stopTimer = setTimeout(settle, seconds * 1000 + 30);
    } else {
      this._set(voice.gain, FLOOR);
      settle();
    }
  }

  /** A channel left playing through a repoint() is rebuilt once it is silent. */
  _renew(ch) {
    if (!ch.stale) return;
    this._drop(ch);
    this.prime(ch.i, ch.pad);
  }

  _drop(voice) {
    this._teardown(voice);
    this.extras.delete(voice);
    if (this.channels.get(voice.i) === voice) this.channels.delete(voice.i);
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

/**
 * A media element for the gain chain. It asks for its file with CORS: a host
 * may hand a file over from another origin (a proxy redirecting to where the
 * repository keeps its files, a CDN), and the audio graph plays a media
 * element from another origin as silence unless it was fetched that way.
 * Files from the board's own origin, or from disk, are not affected.
 */
function voiceElement() {
  const el = new Audio();
  el.crossOrigin = 'anonymous';
  el.preload = 'auto';
  return el;
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
