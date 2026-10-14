// Soundboard — wiring. Holds the open board, answers taps and keys, and keeps
// the drawing in step with what the audio engine is actually doing.

import { Library, CAN_PERSIST } from './library.js';
import { Engine, probeDuration } from './engine.js';
import { store } from './store.js';
import {
  newBoard, newPad, migrate, resize, fitPads, filled, slug, move, padByKey, nextCue, rowCol,
  MAX_ROWS, MAX_COLS,
} from './model.js';
import { PadEditor, SetupSheet } from './editor.js';
import {
  refs, bindRefs, drawGrid, paintPads, drawCues, markCues, drawLibrary, drawPlaying,
  paintPlaying, drawStandby, drawFolder, setPanel, setBook, bookOpen, say, toast,
} from './ui.js';

const PATH_TYPE = 'application/x-soundboard-path';
const PAD_TYPE = 'application/x-soundboard-pad';

// Below this width the prompt book covers the pads instead of sitting beside them.
const NARROW = window.matchMedia('(max-width: 900px)');

class App {
  constructor() {
    this.library = new Library();
    this.engine = new Engine(this.library);
    this.board = null;
    this.editing = false;
    this.standby = null;
    this.raf = null;
    this.saveTimer = null;
    this.pendingHandle = null;
    this.wakeLock = null;

    this.engine.onchange = () => {
      drawPlaying(this.board, this.engine);
      this.paint();
      this.run();
    };
  }

  async boot() {
    bindRefs();
    this.padEditor = new PadEditor({
      library: this.library,
      onSave: (i, pad, moveTo) => this.setPad(i, pad, moveTo),
      onClear: (i) => this.setPad(i, null),
      onLevel: (i, level) => this.engine.setPadLevel(i, level),
    });
    this.setup = new SetupSheet({
      onApply: (values) => this.applySetup(values),
      onExport: () => this.exportBoard(),
      onImport: (file) => this.importBoard(file),
    });

    this.wire();
    // Where a folder cannot be held on to, offer picking the sounds directly:
    // iOS has no folder picker at all.
    refs.btnOpenFiles.hidden = CAN_PERSIST;
    refs.welcomeNote.textContent = CAN_PERSIST
      ? 'This browser can reopen the same folder next time, with one click to confirm.'
      : 'This browser cannot hold on to a folder between visits, so the board asks for it again each launch. '
        + 'The pads themselves are remembered.';

    await this.restore();
  }

  // ── events ──────────────────────────────────────────────────────────────

  wire() {
    refs.btnOpen.addEventListener('click', () => this.openFolder());
    refs.btnOpenBig.addEventListener('click', () => (this.pendingHandle ? this.reopen() : this.openFolder()));
    refs.btnOpenFiles.addEventListener('click', () => this.openFiles());
    refs.btnEdit.addEventListener('click', () => this.setEditing(!this.editing));
    refs.btnSetup.addEventListener('click', () => this.board && this.setup.open(this.board));

    refs.btnBook.addEventListener('click', () => setBook(!bookOpen(), this.editing));
    refs.btnGo.addEventListener('click', () => this.go());
    refs.btnFadeAll.addEventListener('click', () => this.engine.stopAll({ fade: this.fadeTime() }));
    refs.btnStopAll.addEventListener('click', () => this.engine.stopAll({ fade: 0 }));

    refs.master.addEventListener('input', (e) => {
      const level = Number(e.target.value) / 100;
      refs.masterValue.textContent = e.target.value;
      this.engine.setMaster(level);
      if (this.board) {
        this.board.master = level;
        this.queueSave();
      }
    });

    refs.libFilter.addEventListener('input', () => {
      if (this.board) drawLibrary(this.board, this.library, refs.libFilter.value);
    });

    refs.grid.addEventListener('click', (e) => {
      const el = e.target.closest('.pad');
      if (!el) return;
      const i = Number(el.dataset.i);
      if (this.editing) this.padEditor.open(this.board, i);
      else this.tap(i);
    });

    refs.cues.addEventListener('click', (e) => {
      const el = e.target.closest('.cue');
      if (!el) return;
      const i = Number(el.dataset.i);
      this.setStandby(i);
      if (NARROW.matches) setBook(false, this.editing);
      else refs.grid.querySelector(`.pad[data-i="${i}"]`)?.focus();
    });

    // Dragging a sound onto a pad has no equivalent under a finger, so a tap
    // puts it on the first free pad instead.
    refs.lib.addEventListener('click', (e) => {
      const item = e.target.closest('.lib__item');
      if (item) this.assignToFreePad(item.dataset.path);
    });

    // First touch or key: let the audio out, and keep the screen awake.
    const woken = () => {
      this.engine.wake();
      this.keepAwake();
      document.removeEventListener('pointerdown', woken);
      document.removeEventListener('keydown', woken);
    };
    document.addEventListener('pointerdown', woken);
    document.addEventListener('keydown', woken);

    this.wireDragging();
    document.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('beforeunload', () => this.saveNow());
    document.addEventListener('visibilitychange', () => {
      this.run();
      if (!document.hidden) this.keepAwake();
    });
    NARROW.addEventListener('change', (e) => {
      if (!e.matches) setBook(false, this.editing);
    });
  }

  wireDragging() {
    refs.lib.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.lib__item');
      if (!item) return;
      e.dataTransfer.setData(PATH_TYPE, item.dataset.path);
      e.dataTransfer.setData('text/plain', item.dataset.path);
      e.dataTransfer.effectAllowed = 'copy';
    });

    refs.grid.addEventListener('dragstart', (e) => {
      const el = e.target.closest('.pad');
      if (!el || !this.editing || !this.board.pads[Number(el.dataset.i)]) return;
      e.dataTransfer.setData(PAD_TYPE, el.dataset.i);
      e.dataTransfer.effectAllowed = 'move';
      el.classList.add('pad--dragging');
    });

    refs.grid.addEventListener('dragend', (e) => {
      e.target.closest('.pad')?.classList.remove('pad--dragging');
    });

    refs.grid.addEventListener('dragover', (e) => {
      const el = e.target.closest('.pad');
      const types = e.dataTransfer.types;
      if (!el || !(types.includes(PATH_TYPE) || types.includes(PAD_TYPE))) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = types.includes(PAD_TYPE) ? 'move' : 'copy';
      el.classList.add('pad--drop');
    });

    refs.grid.addEventListener('dragleave', (e) => {
      e.target.closest('.pad')?.classList.remove('pad--drop');
    });

    refs.grid.addEventListener('drop', (e) => {
      const el = e.target.closest('.pad');
      if (!el) return;
      e.preventDefault();
      el.classList.remove('pad--drop');
      const to = Number(el.dataset.i);
      const path = e.dataTransfer.getData(PATH_TYPE);
      const from = e.dataTransfer.getData(PAD_TYPE);

      if (path && this.library.has(path)) {
        const existing = this.board.pads[to];
        this.setPad(to, existing ? { ...existing, file: path, duration: 0 } : newPad(this.board, to, path));
      } else if (from !== '') {
        move(this.board, Number(from), to);
        this.engine.reset();
        this.redraw();
        this.queueSave();
        this.primeAll();
      }
    });

    // A folder dropped anywhere on the window opens it.
    document.addEventListener('dragover', (e) => {
      if (e.dataTransfer && e.dataTransfer.types.includes('Files')) e.preventDefault();
    });
    document.addEventListener('drop', async (e) => {
      if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      try {
        const count = await this.library.useDrop(e.dataTransfer);
        if (!count) {
          toast('Drop a folder, not a single file.');
          return;
        }
        await this.afterFolder();
      } catch (err) {
        toast(`That folder could not be read: ${err.message}`);
      }
    });
  }

  onKey(e) {
    if (document.querySelector('dialog[open]')) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.matches('input, select, textarea') || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!this.board) return;

    if (e.key === ' ') {
      e.preventDefault();
      this.go();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      const fade = e.shiftKey ? 0 : this.fadeTime();
      this.engine.stopAll({ fade });
      say(e.shiftKey ? 'Everything cut' : 'Everything fading out');
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.moveStandby(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (e.key.length === 1) {
      const hit = padByKey(this.board, e.key);
      if (hit) {
        e.preventDefault();
        this.tap(hit.i);
      }
    }
  }

  // ── folder and board lifecycle ──────────────────────────────────────────

  async restore() {
    const lastId = await store.getMeta('last');
    if (!lastId) return;

    if (CAN_PERSIST) {
      const handle = await store.loadHandle(lastId);
      if (handle) {
        try {
          if (await this.library.tryHandle(handle)) {
            await this.afterFolder();
            return;
          }
          this.pendingHandle = handle;
          refs.btnOpenBig.textContent = `Reopen “${handle.name}”`;
          refs.welcomeNote.textContent = 'Browsers ask again for permission to read a folder each time the page loads.';
          return;
        } catch {
          /* fall through to a plain open */
        }
      }
    }

    const saved = await store.loadBoard(lastId);
    if (saved) {
      refs.welcomeNote.textContent = `“${saved.name}” is ready. Point it at its folder again to use it.`;
    }
  }

  async reopen() {
    try {
      await this.library.useHandle(this.pendingHandle);
      this.pendingHandle = null;
      await this.afterFolder();
    } catch (err) {
      toast(err.name === 'NotAllowedError' ? 'Without permission to read the folder, there is nothing to play.' : err.message);
    }
  }

  async openFolder() {
    try {
      if (!(await this.library.pick())) return;
      await this.afterFolder();
    } catch (err) {
      toast(`That folder could not be opened: ${err.message}`);
    }
  }

  async openFiles() {
    try {
      if (!(await this.library.pickFiles())) return;
      await this.afterFolder();
    } catch (err) {
      toast(`Those files could not be opened: ${err.message}`);
    }
  }

  /** A folder is open: find or build its board, then draw everything. */
  async afterFolder() {
    this.engine.reset();
    const id = slug(this.library.name);
    const saved = await store.loadBoard(id);
    this.board = (saved && migrate(saved, { id })) || newBoard({ id, name: this.library.name });
    fitPads(this.board);

    if (!filled(this.board).length) this.autoFill();

    this.pendingHandle = null;
    refs.welcome.hidden = true;
    refs.master.value = Math.round(this.board.master * 100);
    refs.masterValue.textContent = String(Math.round(this.board.master * 100));
    this.engine.setMaster(this.board.master);

    if (this.library.mode === 'handle' && this.library.handle) {
      await store.saveHandle(id, this.library.handle);
    }
    await store.setMeta('last', id);

    this.standby = filled(this.board)[0]?.i ?? null;
    this.redraw();
    this.saveNow();

    const missing = filled(this.board).filter(({ pad }) => !this.library.has(pad.file)).length;
    if (missing) toast(`${missing} pad${missing === 1 ? '' : 's'} point at files that are not in this folder.`);

    this.primeAll();
    this.measure();
    say(`${this.library.name} open, ${this.library.entries.size} sounds`);
  }

  /** First time with a folder: lay the sounds out in order so there is a board. */
  autoFill() {
    // Shape the grid to the number of sounds, so pads start big rather than
    // scattered across a board that is mostly empty.
    const n = Math.min(this.library.entries.size, MAX_ROWS * MAX_COLS);
    if (n) {
      const cols = Math.min(MAX_COLS, Math.max(3, Math.ceil(Math.sqrt(n * 1.6))));
      resize(this.board, Math.min(MAX_ROWS, Math.max(2, Math.ceil(n / cols))), cols);
    }

    const files = this.library.list.slice(0, this.board.pads.length);
    files.forEach((entry, i) => {
      this.board.pads[i] = newPad(this.board, i, entry.path);
      this.board.pads[i].cue = String(i + 1);
    });
    if (files.length) {
      toast(`${files.length} sound${files.length === 1 ? '' : 's'} laid out in order. Edit the board to rearrange.`);
    }
  }

  setPad(i, pad, moveTo = null) {
    this.board.pads[i] = pad;
    if (pad && !pad.cue) pad.cue = nextCue(this.board);
    this.engine.stop(i, { fade: 0 });
    if (moveTo != null && moveTo !== i && moveTo >= 0 && moveTo < this.board.pads.length) {
      move(this.board, i, moveTo);
      this.engine.reset();
      this.primeAll();
      const { row, col } = rowCol(this.board, moveTo);
      toast(`Moved to row ${row + 1}, column ${col + 1}.`);
    }
    this.redraw();
    this.queueSave();
    if (pad) {
      this.engine.prime(i, pad);
      if (!pad.duration) this.measure();
    }
    if (this.standby == null) this.standby = filled(this.board)[0]?.i ?? null;
  }

  /** Tap a sound in the folder panel: it lands on the first pad with nothing on it. */
  assignToFreePad(path) {
    if (!this.board || !this.library.has(path)) return;
    const free = this.board.pads.findIndex((pad) => !pad || !pad.file);
    if (free === -1) {
      toast('Every pad is taken. Add rows in Board setup, or tap a pad to replace what is on it.');
      return;
    }
    this.setPad(free, newPad(this.board, free, path));
    const { row, col } = rowCol(this.board, free);
    toast(`${this.board.pads[free].name} is on row ${row + 1}, column ${col + 1}.`);
  }

  applySetup({ name, rows, cols, fadeIn, fadeOut }) {
    if (!this.board) return;
    this.board.name = name;
    this.board.defaults = { fadeIn, fadeOut };
    if (rows !== this.board.rows || cols !== this.board.cols) {
      const dropped = resize(this.board, rows, cols);
      this.engine.reset();
      if (dropped) toast(`${dropped} pad${dropped === 1 ? '' : 's'} came off the board.`);
      this.primeAll();
    }
    if (this.standby != null && !this.board.pads[this.standby]) this.standby = filled(this.board)[0]?.i ?? null;
    this.redraw();
    this.queueSave();
  }

  async exportBoard() {
    const data = JSON.stringify({ ...this.board, savedAt: new Date().toISOString() }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(this.board.name)}.soundboard.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Board saved to your downloads.');
  }

  async importBoard(file) {
    try {
      const raw = JSON.parse(await file.text());
      const board = migrate(raw, { id: this.board.id });
      if (!board) throw new Error('that file is not a board');
      board.name = raw.name || this.board.name;
      this.board = board;
      this.engine.reset();
      this.standby = filled(board)[0]?.i ?? null;
      refs.master.value = Math.round(board.master * 100);
      refs.masterValue.textContent = String(Math.round(board.master * 100));
      this.engine.setMaster(board.master);
      this.redraw();
      this.saveNow();
      this.primeAll();
      this.measure();

      const missing = filled(board).filter(({ pad }) => !this.library.has(pad.file)).length;
      toast(missing
        ? `Board loaded. ${missing} pad${missing === 1 ? '' : 's'} point at files this folder does not have.`
        : 'Board loaded.');
    } catch (err) {
      toast(`That board file could not be read: ${err.message}`);
    }
  }

  // ── playing ─────────────────────────────────────────────────────────────

  async tap(i) {
    const pad = this.board.pads[i];
    if (!pad || !pad.file) {
      if (!this.editing) toast('That pad is empty. Switch on Edit board to fill it.');
      return;
    }
    if (!this.library.has(pad.file)) {
      toast(`“${pad.file}” is not in the open folder.`);
      return;
    }
    try {
      await this.engine.fire(i, pad);
      say(`${pad.cue ? `Cue ${pad.cue}, ` : ''}${pad.name || pad.file}`);
    } catch (err) {
      toast(`“${pad.name || pad.file}” would not play: ${err.message}`);
    }
  }

  async go() {
    if (this.standby == null) return;
    const i = this.standby;
    await this.tap(i);
    this.moveStandby(1);
  }

  setStandby(i) {
    this.standby = i;
    drawStandby(this.board, this.standby);
    this.paint();
  }

  moveStandby(step) {
    const list = filled(this.board);
    if (!list.length) {
      this.standby = null;
      drawStandby(this.board, null);
      return;
    }
    const at = list.findIndex((entry) => entry.i === this.standby);
    const next = at === -1 ? 0 : Math.min(list.length - 1, Math.max(0, at + step));
    this.setStandby(list[next].i);
    const pad = list[next].pad;
    say(`Standing by ${pad.cue ? `cue ${pad.cue}, ` : ''}${pad.name || pad.file}`);
  }

  setEditing(on) {
    if (!this.board) {
      toast('Open a folder first — there is nothing to put on the pads yet.');
      return;
    }
    this.editing = on;
    setPanel(on);
    if (on) drawLibrary(this.board, this.library, refs.libFilter.value);
    if (NARROW.matches) setBook(on, on);
    this.redraw();
  }

  // ── drawing and housekeeping ────────────────────────────────────────────

  fadeTime() {
    return (this.board && this.board.defaults.fadeOut) || 1.5;
  }

  redraw() {
    if (!this.board) return;
    drawFolder(this.library);
    drawGrid(this.board, { editing: this.editing, missing: (path) => !this.library.has(path) });
    drawCues(this.board, this.standby);
    drawPlaying(this.board, this.engine);
    drawStandby(this.board, this.standby);
    if (this.editing) drawLibrary(this.board, this.library, refs.libFilter.value);
    this.paint();
    this.run();
  }

  paint() {
    if (!this.board) return;
    paintPads(this.board, this.engine, this.standby);
    markCues(this.board, this.engine, this.standby);
    paintPlaying(this.board, this.engine);
  }

  run() {
    if (this.raf || document.hidden || !this.engine.anyPlaying) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      this.engine.tick();
      this.paint();
      this.run();
    });
  }

  primeAll() {
    filled(this.board).slice(0, 48).forEach(({ i, pad }) => this.engine.prime(i, pad));
  }

  /** Read the length of each sound once, for the cue sheet, three at a time. */
  async measure() {
    if (this.measuring) return;
    this.measuring = true;
    const todo = filled(this.board).filter(({ pad }) => !pad.duration && this.library.has(pad.file));
    const next = async () => {
      const job = todo.pop();
      if (!job) return;
      try {
        job.pad.duration = await probeDuration(await this.library.url(job.pad.file));
      } catch {
        job.pad.duration = 0;
      }
      await next();
    };
    await Promise.all([next(), next(), next()]);
    this.measuring = false;
    if (this.board) {
      drawCues(this.board, this.standby);
      this.paint();
      this.queueSave();
    }
  }

  /** A show lasts longer than a tablet's screen timeout. */
  async keepAwake() {
    if (!('wakeLock' in navigator) || !this.board || document.hidden) return;
    if (this.wakeLock && !this.wakeLock.released) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });
    } catch {
      /* the browser said no; the board works all the same */
    }
  }

  queueSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 500);
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    if (this.board) store.saveBoard(structuredClone(this.board)).catch(() => {});
  }
}

const app = new App();
app.boot().catch((err) => {
  console.error(err);
  toast(`The board could not start: ${err.message}`);
});
