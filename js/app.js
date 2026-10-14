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

// How many of a folder's sounds land on the board by themselves. The rest are
// in the panel, to be put where the operator wants them.
const AUTO_PLACE = 10;

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
    this.pendingHandles = null;
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
    this.redraw();
    await this.restore();
  }

  // ── events ──────────────────────────────────────────────────────────────

  wire() {
    refs.btnAdd.addEventListener('click', () => this.openPicker());
    refs.btnAddEmpty.addEventListener('click', () => this.openPicker());
    refs.btnAddFolder.addEventListener('click', () => this.add('folder'));
    refs.btnAddFiles.addEventListener('click', () => this.add('files'));
    refs.btnReopen.addEventListener('click', () => this.reconnect(this.pendingHandles || []));
    refs.btnReconnect.addEventListener('click', () => this.reconnect(this.pendingHandles || []));
    refs.pickerClose.addEventListener('click', () => refs.picker.close());
    refs.btnEdit.addEventListener('click', () => this.setEditing(!this.editing));
    refs.btnEmpty.addEventListener('click', () => this.emptyBoard());
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
        const added = await this.library.addDrop(e.dataTransfer);
        if (!added.length) {
          toast('Nothing there the board can play.');
          return;
        }
        await this.absorb(added, { announce: true });
      } catch (err) {
        toast(`That could not be read: ${err.message}`);
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

  // ── sounds and board lifecycle ──────────────────────────────────────────

  /**
   * The one way sounds get in: a folder, or files one by one, added to
   * whatever is already open rather than replacing it.
   */
  openPicker() {
    const first = !this.library.isOpen;
    refs.pickerTitle.textContent = first ? "Point it at the show's sounds" : 'Add more sounds';
    refs.pickerBlurb.textContent = first
      ? "Choose the folder that holds this show's audio, or pick the sounds one by one. They are read "
        + 'straight off your disk and stay there — nothing is uploaded, and the board works with the network off.'
      : 'Whatever you add joins the sounds already open, and lands on the first free pads.';
    refs.pickerKeys.hidden = !first;
    refs.btnReopen.hidden = !this.pendingHandles;
    refs.pickerNote.textContent = CAN_PERSIST
      ? 'Install the board from the browser menu and it can hold on to these folders instead of asking at every launch.'
      : 'This browser cannot hold on to a folder between visits, so the sounds are chosen again each launch. '
        + 'The pads themselves are remembered.';
    refs.picker.showModal();
    (this.pendingHandles ? refs.btnReopen : refs.btnAddFolder).focus();
  }

  async add(what) {
    try {
      const added = what === 'folder' ? await this.library.addFolder() : await this.library.addSounds();
      if (added === null) return;            // the picker was dismissed
      await this.absorb(added, { announce: true });
    } catch (err) {
      toast(err.name === 'NotAllowedError'
        ? 'Without permission to read them, there is nothing to play.'
        : `That could not be opened: ${err.message}`);
    }
  }

  /** Sounds have arrived: make sure there is a board, and put them on it. */
  async absorb(added, { announce = false } = {}) {
    if (!this.board) {
      const id = slug(this.library.rootName);
      const saved = await store.loadBoard(id);
      // A board built today starts as wide as the last one the operator set.
      this.useBoard((saved && migrate(saved, { id }))
        || newBoard({ id, name: this.library.rootName, cols: await store.getMeta('cols') }));
      await store.setMeta('last', this.board.id);
    }

    this.waiting = 0;
    const placed = this.place(added);
    const waiting = this.waiting;
    this.pendingHandles = null;
    if (refs.picker.open) refs.picker.close();

    // Places waiting to be reconnected are still this board's places: adding a
    // sound while they are disconnected must not forget them.
    const places = [...(this.pendingHandles || []), ...this.library.handles];
    if (places.length) await store.saveHandles(this.board.id, places);

    this.redraw();
    this.saveNow();
    this.primeAll();
    this.measure();
    this.keepAwake();
    this.keepSounds();

    const missing = filled(this.board).filter(({ pad }) => !this.library.has(pad.file)).length;
    if (placed && waiting) {
      toast(`${placed} sound${placed === 1 ? '' : 's'} on the board. The other ${waiting} are under Sounds, `
        + 'in edit mode, ready to put where you want them.');
    } else if (placed) {
      toast(`${placed} sound${placed === 1 ? '' : 's'} added to the board.`);
    } else if (waiting) {
      toast(`${waiting} sound${waiting === 1 ? '' : 's'} added, under Sounds in edit mode.`);
    } else if (announce) toast('Those sounds are already on the board.');
    else if (missing) toast(`${missing} pad${missing === 1 ? '' : 's'} point at sounds that are not open.`);
    say(`${this.library.entries.size} sounds open`);
  }

  /**
   * The first few new sounds go on the first free pads, in the order they were
   * found. A folder of two hundred effects is a library, not a board.
   */
  place(paths) {
    const onBoard = new Set(filled(this.board).map(({ pad }) => pad.file));
    let placed = 0;
    for (const path of paths) {
      if (onBoard.has(path)) continue;
      if (placed >= AUTO_PLACE) {
        this.waiting = (this.waiting || 0) + 1;
        continue;
      }
      let i = this.board.pads.findIndex((pad) => !pad || !pad.file);
      if (i === -1) {
        i = this.board.pads.length;
        for (let c = 0; c < this.board.cols; c += 1) this.board.pads.push(null);
      }
      this.board.pads[i] = newPad(this.board, i, path);
      onBoard.add(path);
      placed += 1;
    }
    fitPads(this.board);
    return placed;
  }

  /**
   * On launch: the board that was open last, playing from the copies it keeps,
   * and then from the real files as soon as the browser allows it.
   */
  async restore() {
    const lastId = await store.getMeta('last');
    if (!lastId) {
      this.openPicker();
      return;
    }

    const saved = await store.loadBoard(lastId);
    const board = saved && migrate(saved, { id: lastId });
    const kept = board ? await store.soundsFor(lastId) : [];
    if (board && kept.length) {
      this.useBoard(board);
      this.library.addCached(kept, board.name);
      await this.absorb([]);
    }

    const handles = await store.loadHandles(lastId);
    if (!handles.length) {
      if (!this.board) {
        this.openPicker();
        if (board) {
          refs.pickerBlurb.textContent = `“${board.name}” is here, with its pads. Point it at the sounds again to play them.`;
        }
      }
      return;
    }

    const states = await Promise.all(handles.map((h) => h.queryPermission({ mode: 'read' })));
    if (states.every((state) => state === 'granted')) {
      await this.reconnect(handles);
      return;
    }

    // The board plays from its own copies meanwhile; reconnecting is an offer,
    // not a toll gate.
    this.pendingHandles = handles;
    refs.btnReconnect.hidden = !this.board;
    if (this.board) {
      refs.btnReconnect.textContent = handles.length === 1
        ? `Reconnect “${handles[0].name}”`
        : `Reconnect ${handles.length} places`;
      return;
    }
    refs.btnReopen.hidden = false;
    refs.btnReopen.textContent = handles.length === 1
      ? `Reopen “${handles[0].name}”`
      : `Reopen ${handles.length} places`;
    this.openPicker();
    refs.pickerBlurb.textContent = 'The board is here. Browsers ask again for permission to read your '
      + 'sounds each time the page loads — once you have granted it, everything is where you left it.';
  }

  /** Put the real files back behind the pads, in place of the kept copies. */
  async reconnect(handles) {
    try {
      for (const handle of handles) await this.library.addHandle(handle);
      this.pendingHandles = null;
      refs.btnReconnect.hidden = true;
      refs.btnReopen.hidden = true;
      this.engine.reset();                   // drop anything primed from a copy
      await this.absorb([]);
    } catch (err) {
      toast(err.name === 'NotAllowedError'
        ? 'Without permission to read them, the board stays on the copies it kept.'
        : `Those sounds could not be reopened: ${err.message}`);
    }
  }

  useBoard(board) {
    this.board = board;
    fitPads(board);
    refs.master.value = Math.round(board.master * 100);
    refs.masterValue.textContent = String(Math.round(board.master * 100));
    this.engine.setMaster(board.master);
  }

  /**
   * Keep a copy of every sound that is on a pad, so the next launch has
   * something to play before the browser has granted anything. Copies for
   * pads that have gone are dropped.
   */
  async keepSounds() {
    if (!this.board || this.keeping || this.outOfRoom) return;
    this.keeping = true;
    const id = this.board.id;
    try {
      // Ask the browser not to throw the show away when it wants space back.
      if (!this.askedToPersist && navigator.storage && navigator.storage.persist) {
        this.askedToPersist = true;
        navigator.storage.persist().catch(() => {});
      }
      const wanted = new Set(filled(this.board).map(({ pad }) => pad.file));
      const have = new Map((await store.soundsFor(id)).map((rec) => [rec.path, rec]));

      for (const path of have.keys()) {
        if (!wanted.has(path)) await store.deleteSound(id, path);
      }

      for (const path of wanted) {
        if (!this.library.has(path) || this.library.isCached(path)) continue;
        const file = await this.library.file(path);
        const rec = have.get(path);
        if (rec && rec.size === file.size && rec.lastModified === (file.lastModified || 0)) continue;
        await store.putSound(id, path, file);
      }
    } catch (err) {
      if (err && err.name === 'QuotaExceededError') {
        this.outOfRoom = true;
        toast('This browser is out of room, so the board will ask for the sounds again next launch.');
      }
    } finally {
      this.keeping = false;
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
    this.keepSounds();
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

  /** Take every sound off the board, keeping the sounds themselves. Twice, to mean it. */
  emptyBoard() {
    if (!this.board) return;
    if (!this.armed) {
      this.armed = true;
      refs.btnEmpty.textContent = 'Really empty it?';
      refs.btnEmpty.classList.add('btn--danger');
      clearTimeout(this.armTimer);
      this.armTimer = setTimeout(() => this.disarm(), 4000);
      return;
    }
    this.disarm();
    this.engine.stopAll({ fade: 0 });
    this.engine.reset();
    this.board.pads = [];
    fitPads(this.board);
    this.redraw();
    this.saveNow();
    this.keepSounds();
    toast('The board is empty. The sounds are still under Sounds.');
  }

  disarm() {
    clearTimeout(this.armTimer);
    this.armed = false;
    refs.btnEmpty.textContent = 'Empty the board';
    refs.btnEmpty.classList.remove('btn--danger');
  }

  setEditing(on) {
    if (!this.board) {
      toast('Open a folder first — there is nothing to put on the pads yet.');
      return;
    }
    this.editing = on;
    this.disarm();
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
    drawFolder(this.library);
    refs.stageEmpty.hidden = !!this.board;
    refs.grid.hidden = !this.board;
    if (!this.board) return;
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
