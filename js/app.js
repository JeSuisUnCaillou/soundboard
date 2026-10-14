// Soundboard — wiring. Holds the open board, answers taps and keys, and keeps
// the drawing in step with what the audio engine is actually doing.

import { Library, CAN_PERSIST } from './library.js';
import { Engine, probeDuration } from './engine.js';
import { store } from './store.js';
import {
  newBoard, newPad, migrate, setCols, fitPads, filled, slug, move, padByKey, nextCue, rowCol,
} from './model.js';
import { PadEditor, SetupSheet } from './editor.js';
import {
  refs, bindRefs, drawGrid, paintPads, drawLibrary, drawPlaying,
  paintPlaying, drawStop, drawFolder, setPanel, setBook, bookOpen, say, toast,
} from './ui.js';

const PATH_TYPE = 'application/x-soundboard-path';

// Below this width the sounds list slides over the pads instead of sitting beside them.
const NARROW = window.matchMedia('(max-width: 900px)');

class App {
  constructor() {
    this.library = new Library();
    this.engine = new Engine(this.library);
    this.board = null;
    this.editing = false;
    this.raf = null;
    this.saveTimer = null;
    this.pendingHandle = null;
    this.wakeLock = null;

    this.engine.onchange = () => {
      drawPlaying(this.board, this.engine);
      drawStop(this.engine);
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
    setPanel(false);
    // Where a folder cannot be held on to, offer picking the sounds directly:
    // iOS has no folder picker at all.
    refs.btnOpenFiles.hidden = CAN_PERSIST;
    refs.welcomeNote.textContent = CAN_PERSIST
      ? 'This browser reopens the same folder next time. Install the board from the browser menu '
        + 'and it can keep that permission instead of asking at every launch.'
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

    refs.btnBook.addEventListener('click', () => setBook(!bookOpen()));
    refs.btnStop.addEventListener('click', () => this.stop());

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
      if (!e.matches) setBook(false);
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

    refs.grid.addEventListener('dragover', (e) => {
      const el = e.target.closest('.pad');
      if (!el || !e.dataTransfer.types.includes(PATH_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
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
      if (!path || !this.library.has(path)) return;
      const existing = this.board.pads[to];
      this.setPad(to, existing ? { ...existing, file: path, duration: 0 } : newPad(this.board, to, path));
    });

    this.wirePadDragging();

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

  /**
   * Dragging a pad to another place on the board. Pointer events rather than
   * HTML5 drag and drop, because the latter does not exist under a finger, and
   * only the grip takes the pointer so the board still scrolls.
   */
  wirePadDragging() {
    let drag = null;

    const at = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      return el && el.closest('.pad');
    };

    const over = (el) => {
      if (drag.target === el) return;
      drag.target?.classList.remove('pad--drop');
      drag.target = el && el !== drag.el ? el : null;
      drag.target?.classList.add('pad--drop');
    };

    refs.grid.addEventListener('pointerdown', (e) => {
      const grip = e.target.closest('.pad__grip');
      if (!grip || !this.editing || e.button > 0) return;
      const el = grip.closest('.pad');
      const from = Number(el.dataset.i);
      if (!this.board.pads[from]) return;
      e.preventDefault();

      const box = el.getBoundingClientRect();
      const ghost = el.cloneNode(true);
      ghost.classList.add('pad--ghost');
      ghost.style.width = `${box.width}px`;
      ghost.style.height = `${box.height}px`;
      document.body.append(ghost);

      drag = { from, el, ghost, dx: e.clientX - box.left, dy: e.clientY - box.top, target: null };
      el.classList.add('pad--dragging');
      try {
        grip.setPointerCapture(e.pointerId);
      } catch {
        /* without capture the grid's own listeners still see the move */
      }
      ghost.style.transform = `translate(${box.left}px, ${box.top}px)`;
    });

    refs.grid.addEventListener('pointermove', (e) => {
      if (!drag) return;
      drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;
      over(at(e));
    });

    const end = (e, drop) => {
      if (!drag) return;
      const { from, target } = drag;
      drag.ghost.remove();
      drag.el.classList.remove('pad--dragging');
      target?.classList.remove('pad--drop');
      drag = null;
      if (!drop || !target) return;

      const to = Number(target.dataset.i);
      move(this.board, from, to);
      fitPads(this.board);
      this.engine.reset();
      this.redraw();
      this.queueSave();
      this.primeAll();
      const { row, col } = rowCol(this.board, to);
      say(`Moved to row ${row + 1}, column ${col + 1}`);
    };

    refs.grid.addEventListener('pointerup', (e) => end(e, true));
    refs.grid.addEventListener('pointercancel', (e) => end(e, false));
  }

  onKey(e) {
    if (document.querySelector('dialog[open]')) return;
    const t = e.target;
    if (t instanceof HTMLElement && (t.matches('input, select, textarea') || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!this.board) return;

    if (e.key === ' ') {
      e.preventDefault();
      this.stop();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.engine.stopAll({ fade: 0 });
      say('Everything cut');
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
    // A board built today starts as wide as the last one the operator set.
    this.board = (saved && migrate(saved, { id }))
      || newBoard({ id, name: this.library.name, cols: await store.getMeta('cols') });
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

    this.redraw();
    this.saveNow();

    const missing = filled(this.board).filter(({ pad }) => !this.library.has(pad.file)).length;
    if (missing) toast(`${missing} pad${missing === 1 ? '' : 's'} point at files that are not in this folder.`);

    this.primeAll();
    this.measure();
    say(`${this.library.name} open, ${this.library.entries.size} sounds`);
  }

  /**
   * First time with a folder: lay the sounds out in order so there is a board.
   * The column count is the operator's, not the folder's, so it is left alone.
   */
  autoFill() {
    const files = this.library.list;
    files.forEach((entry, i) => {
      this.board.pads[i] = newPad(this.board, i, entry.path);
      this.board.pads[i].cue = String(i + 1);
    });
    fitPads(this.board);
    if (files.length) {
      toast(`${files.length} sound${files.length === 1 ? '' : 's'} laid out in order. Edit the board to rearrange.`);
    }
  }

  setPad(i, pad, moveTo = null) {
    this.board.pads[i] = pad;
    fitPads(this.board);
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
    // Show the pad it landed on rather than the list it came from.
    if (NARROW.matches) setBook(false);
    toast(`${this.board.pads[free].name} is on row ${row + 1}, column ${col + 1}.`);
  }

  applySetup({ name, cols, fadeIn, fadeOut }) {
    if (!this.board) return;
    this.board.name = name;
    this.board.defaults = { fadeIn, fadeOut };
    // Only the column count is set: the pads keep their order and re-wrap, so
    // nothing comes off the board and nothing needs reloading.
    if (cols !== this.board.cols) {
      setCols(this.board, cols);
      store.setMeta('cols', this.board.cols).catch(() => {});
    }
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

  /** Stop what is playing, each pad taking its own fade out with it. */
  stop() {
    const live = this.engine.active();
    if (!live.length) return;
    for (const { i, pad } of live) {
      this.engine.stop(i, { fade: pad.fadeOut ?? this.fadeTime() });
    }
    say(live.length === 1 ? `Stopping ${live[0].pad.name || live[0].pad.file}` : `Stopping ${live.length} sounds`);
  }

  setEditing(on) {
    if (!this.board) {
      toast('Open a folder first — there is nothing to put on the pads yet.');
      return;
    }
    this.editing = on;
    setPanel(on);
    if (on) drawLibrary(this.board, this.library, refs.libFilter.value);
    // The board stays in view: the sounds list is opened from the button when
    // it is wanted, and never covers what is being rearranged.
    if (!on) setBook(false);
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
    drawPlaying(this.board, this.engine);
    drawStop(this.engine);
    if (this.editing) drawLibrary(this.board, this.library, refs.libFilter.value);
    this.paint();
    this.run();
  }

  paint() {
    if (!this.board) return;
    paintPads(this.board, this.engine);
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
      this.redraw();
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

// Installed, the board keeps working with the network off — and Chrome will
// hold on to the folder permission for an installed app instead of asking for
// it on every launch.
const SECURE = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && SECURE) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

const app = new App();
app.boot().catch((err) => {
  console.error(err);
  toast(`The board could not start: ${err.message}`);
});
