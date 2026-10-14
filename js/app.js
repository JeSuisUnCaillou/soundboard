// Soundboard — wiring. Holds the open board, answers taps and keys, and keeps
// the drawing in step with what the audio engine is actually doing.

import { Library, CAN_PERSIST } from './library.js';
import { Engine, probeDuration } from './engine.js';
import { store, prefs } from './store.js';
import {
  newBoard, newPad, migrate, setCols, setRows, fitPads, filled, slug, move, padByKey, rowCol, padTitle,
  tapForLength,
} from './model.js';
import { bundledPaths } from './bundled.js';
import { PadEditor, SetupSheet } from './editor.js';
import {
  refs, bindRefs, drawGrid, paintPads, drawLibrary,
  drawStop, setPanel, setBook, markPreview, say, toast,
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
      drawStop(this.engine);
      markPreview(this.engine.previewPath);
      this.paint();
      this.run();
    };
  }

  async boot() {
    bindRefs();
    this.padEditor = new PadEditor({
      library: this.library,
      onSave: (i, pad) => this.setPad(i, pad),
      onClear: (i) => this.setPad(i, null),
      onLevel: (i, level) => this.engine.setPadLevel(i, level),
      onHear: (path) => this.preview(path),
    });
    this.setup = new SetupSheet({
      onApply: (values) => this.applySetup(values),
      onExport: () => this.exportBoard(),
      onImport: (file) => this.importBoard(file),
    });

    // Read where the operator was before anything here overwrites it.
    const was = { editing: prefs.get('editing', false), book: prefs.get('book', false) };

    this.wire();
    setPanel(false);
    // The sounds that come with the app are there at every launch, whatever
    // else is open.
    this.library.addBundled();
    refs.libFilter.value = prefs.get('filter', '');
    this.redraw();
    await this.restore();

    this.keepAwake();

    // A reload should land where they left off, not at the beginning.
    if (this.board && was.editing) {
      this.setEditing(true);
      if (NARROW.matches && was.book) setBook(true);
    }
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

    refs.btnBrowse.addEventListener('click', () => setBook(true));
    refs.btnBrowseDone.addEventListener('click', () => setBook(false));
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
      prefs.set('filter', refs.libFilter.value);
      if (this.board) drawLibrary(this.board, this.library, refs.libFilter.value);
    });

    refs.grid.addEventListener('click', (e) => {
      const el = e.target.closest('.pad');
      if (!el) return;
      if (this.dragged) return;           // that click is the tail of a drag
      const i = Number(el.dataset.i);
      const pad = this.board.pads[i];
      // An empty pad has nothing to set up: it wants a sound, which is in the
      // folder.
      if (this.editing && (!pad || !pad.file)) {
        if (NARROW.matches) setBook(true);
        else toast('Drag a sound from the folders, or click its + icon.');
        return;
      }
      // While editing: the pencil sets the pad up, the pad itself is heard.
      if (this.editing && e.target.closest('.pad__pencil')) {
        this.padEditor.open(this.board, i);
        return;
      }
      if (this.editing && e.shiftKey) {
        this.padEditor.open(this.board, i);
        return;
      }
      this.tap(i);
    });

    refs.lib.addEventListener('click', (e) => {
      const item = e.target.closest('.lib__item');
      if (!item) return;
      // Dragging a sound onto a pad has no equivalent under a finger, so the
      // plus puts it on the first free pad; the row itself is just heard.
      if (e.target.closest('.lib__add')) this.assignToFreePad(item.dataset.path);
      else this.preview(item.dataset.path);
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
    this.placeEmptyButton();
    // Taken again on every press, and checked between them: a release can come
    // from the system without a word.
    document.addEventListener('pointerdown', () => this.keepAwake());
    setInterval(() => this.keepAwake(), 30000);
    NARROW.addEventListener('change', (e) => {
      this.placeEmptyButton();
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
   * Dragging a pad somewhere else. Pointer events rather than HTML5 drag and
   * drop, which does not exist under a finger.
   *
   * With a mouse the whole pad is a handle: press anywhere but the pencil and
   * move, and the pad comes with you; press and release without moving and it
   * simply plays. A touch that starts on a pad is left to scroll the board — a
   * pad is moved under a finger by typing its row and column in its settings.
   */
  wirePadDragging() {
    let drag = null;
    let armed = null;        // pressed, not yet a drag
    const SLOP = 6;          // how far a mouse moves before it means to drag
    const HOLD = 400;        // how long a finger rests before it picks a pad up

    /** Where the pad would land: another pad, or somewhere that takes it off. */
    const at = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return null;
      if (el.closest('#book')) return refs.book;
      if (el.closest('#browse')) return refs.browse;
      const pad = el.closest('.pad');
      return pad && pad !== drag.el ? pad : null;
    };

    const removes = (el) => el === refs.book || el === refs.browse;

    const over = (el) => {
      if (drag.target === el) return;
      drag.target?.classList.remove('pad--drop', 'drop--off');
      drag.target = el;
      drag.target?.classList.add(removes(el) ? 'drop--off' : 'pad--drop');
      drag.ghost.classList.toggle('pad--ghost-off', removes(el));
    };

    const begin = (el, from, e, handle) => {
      const box = el.getBoundingClientRect();
      const ghost = el.cloneNode(true);
      ghost.classList.add('pad--ghost');
      ghost.style.width = `${box.width}px`;
      ghost.style.height = `${box.height}px`;
      ghost.style.transform = `translate(${box.left}px, ${box.top}px)`;
      document.body.append(ghost);

      drag = { from, el, ghost, dx: e.clientX - box.left, dy: e.clientY - box.top, target: null };
      el.classList.add('pad--dragging');
      this.dragged = true;                  // the click that follows is not a tap
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* without capture the grid's own listeners still see the move */
      }
    };

    const disarm = () => {
      if (armed) clearTimeout(armed.timer);
      armed = null;
    };

    refs.grid.addEventListener('pointerdown', (e) => {
      disarm();
      const el = e.target.closest('.pad');
      if (!el || !this.editing || e.button > 0) return;
      if (e.target.closest('.pad__pencil')) return;      // the corner is for settings
      const from = Number(el.dataset.i);
      if (!this.board.pads[from] || !this.board.pads[from].file) return;

      armed = { el, from, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType === 'touch', timer: null };
      if (!armed.touch) return;

      // A finger has to be able to scroll the board, so it picks a pad up by
      // resting on it rather than by moving: hold, and the pad comes away.
      const point = { clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId };
      armed.timer = setTimeout(() => {
        const { el: held, from: which } = armed;
        armed = null;
        begin(held, which, point, held);
        if (navigator.vibrate) navigator.vibrate(12);
        over(at(point));
      }, HOLD);
    });

    refs.grid.addEventListener('pointermove', (e) => {
      if (!drag) {
        if (!armed || e.pointerId !== armed.id) return;
        const moved = Math.hypot(e.clientX - armed.x, e.clientY - armed.y);
        // A finger that moves before the hold is up is scrolling, not dragging.
        if (armed.touch) {
          if (moved > 12) disarm();
          return;
        }
        if (moved < SLOP) return;
        const { el, from } = armed;
        armed = null;
        begin(el, from, e, el);
      }
      drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;
      over(at(e));
    });

    // Once a pad is in hand the board must hold still under it. The pad's own
    // touch-action cannot say so — it is fixed when the finger lands, long
    // before the hold is up — so the scroll is refused here instead.
    refs.grid.addEventListener('touchmove', (e) => {
      if (drag) e.preventDefault();
    }, { passive: false });

    const end = (e, drop) => {
      disarm();
      if (!drag) return;
      // A click may follow this pointerup; it belongs to the drag, not the pad.
      setTimeout(() => {
        this.dragged = false;
      }, 0);
      const { from, target } = drag;
      drag.ghost.remove();
      drag.el.classList.remove('pad--dragging');
      target?.classList.remove('pad--drop', 'drop--off');
      drag = null;
      if (!drop || !target) return;

      if (removes(target)) {
        const pad = this.board.pads[from];
        this.setPad(from, null);
        toast(`${padTitle(pad)} is off the board. The sound is still under Sounds.`);
        say('Taken off the board');
        return;
      }

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
        || newBoard({ id, cols: await store.getMeta('cols'), rows: await store.getMeta('rows') }));
      await store.setMeta('last', this.board.id);
    }

    // The first sounds to arrive lay themselves out, so there is a board to
    // look at. After that the board belongs to the operator: anything added
    // waits in the tree until they put it somewhere.
    const startedEmpty = filled(this.board).length === 0;
    this.waiting = 0;
    const placed = startedEmpty ? this.place(added) : 0;
    const waiting = startedEmpty ? this.waiting : added.length;

    // Places waiting to be reconnected are still this board's places: adding a
    // sound while they are disconnected must not forget them.
    const places = [...(this.pendingHandles || []), ...this.library.handles];
    if (places.length) await store.saveHandles(this.board.id, places);
    this.pendingHandles = null;
    if (refs.picker.open) refs.picker.close();

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
      toast(`${waiting} sound${waiting === 1 ? '' : 's'} added, under Sounds in edit mode. `
        + 'The board is left as it is.');
    } else if (announce) toast('Those sounds are already loaded.');
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
      const i = this.board.pads.findIndex((pad) => !pad || !pad.file);
      if (i === -1) {                       // the board is full; the rest wait
        this.waiting = (this.waiting || 0) + 1;
        continue;
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
      await this.firstBoard();
      return;
    }

    // The board comes back whatever its sounds can be read from: the copies it
    // keeps, the ones that ship with the app, or — in a moment — the folder.
    const saved = await store.loadBoard(lastId);
    const board = saved && migrate(saved, { id: lastId });
    if (board) {
      this.useBoard(board);
      const kept = await store.soundsFor(lastId);
      if (kept.length) this.library.addCached(kept);
      await this.absorb([]);
    }

    const silent = !board || !filled(board).some(({ pad }) => this.library.has(pad.file));
    const handles = await store.loadHandles(lastId);

    if (!handles.length) {
      // Nothing here can be played: ask for the sounds rather than leave a
      // board of pads that do nothing.
      if (silent) {
        this.openPicker();
        if (board) {
          refs.pickerBlurb.textContent = 'The board is here, with its pads. Point it at the sounds again to play them.';
        }
      }
      return;
    }

    const states = await Promise.all(handles.map((h) => h.queryPermission({ mode: 'read' })));
    if (states.every((state) => state === 'granted')) {
      await this.reconnect(handles);
      return;
    }

    // Whatever can be played is playing meanwhile; reconnecting is an offer,
    // not a toll gate.
    this.pendingHandles = handles;
    refs.btnReconnect.hidden = silent;
    if (!silent) {
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

  /** A board to edit when there is none: empty, and saved from the start. */
  blankBoard() {
    this.useBoard(newBoard({ id: slug(this.library.rootName || 'board') }));
    store.setMeta('last', this.board.id).catch(() => {});
    this.saveNow();
  }

  /**
   * Nothing has ever been opened here: lay out the sounds that came with the
   * app so there is a board to press, rather than an empty screen and a
   * question.
   */
  async firstBoard() {
    this.useBoard(newBoard({
      id: 'default-board',
      cols: await store.getMeta('cols'),
      rows: await store.getMeta('rows'),
    }));
    await store.setMeta('last', this.board.id);
    this.place(bundledPaths());
    this.redraw();
    this.saveNow();
    this.primeAll();
    this.measure();
    this.keepAwake();
    toast('A board to start with. Add files when you have your own.');
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
   * Keep a copy of every sound that has been loaded, so the next launch comes
   * back with the whole folder — pads playing and the tree intact — before the
   * browser has granted anything. Pads are copied first, because those are the
   * ones a show needs; copies of sounds that have gone are dropped.
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
      const onPads = filled(this.board).map(({ pad }) => pad.file);
      const wanted = [...new Set([...onPads, ...this.library.list.map((e) => e.path)])];
      const inLibrary = new Set(wanted);
      const have = new Map((await store.soundsFor(id)).map((rec) => [rec.path, rec]));

      for (const path of have.keys()) {
        if (!inLibrary.has(path)) await store.deleteSound(id, path);
      }

      let copied = 0;
      for (const path of wanted) {
        if (!this.library.has(path) || this.library.isCached(path) || this.library.isBundled(path)) continue;
        const file = await this.library.file(path);
        const rec = have.get(path);
        if (rec && rec.size === file.size && rec.lastModified === (file.lastModified || 0)) continue;
        await store.putSound(id, path, file);
        copied += 1;
      }
      if (copied > 20) toast(`${copied} sounds kept in this browser, ready for next time.`);
    } catch (err) {
      if (err && err.name === 'QuotaExceededError') {
        this.outOfRoom = true;
        toast('This browser is out of room. What is already kept will come back; the rest needs the folder again.');
      }
    } finally {
      this.keeping = false;
    }
  }

  setPad(i, pad) {
    this.board.pads[i] = pad;
    fitPads(this.board);
    this.engine.stop(i, { fade: 0 });
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
      toast('Every pad is taken. Add rows in Board settings, or tap a pad to replace what is on it.');
      return;
    }
    this.setPad(free, newPad(this.board, free, path));
    const { row, col } = rowCol(this.board, free);
    // Show the pad it landed on rather than the list it came from.
    if (NARROW.matches) setBook(false);
    toast(`${padTitle(this.board.pads[free])} is on row ${row + 1}, column ${col + 1}.`);
  }

  applySetup({ cols, rows, fadeIn, fadeOut }) {
    if (!this.board) return;
    this.board.defaults = { fadeIn, fadeOut };
    // The pads keep their order and re-wrap. A smaller board has fewer places
    // to wrap them into, and says what it could not keep.
    let lost = 0;
    if (cols !== this.board.cols) {
      lost += setCols(this.board, cols);
      store.setMeta('cols', this.board.cols).catch(() => {});
    }
    if (rows !== this.board.rows) {
      lost += setRows(this.board, rows);
      store.setMeta('rows', this.board.rows).catch(() => {});
    }
    if (lost) {
      this.engine.reset();
      this.primeAll();
      toast(`${lost} sound${lost === 1 ? '' : 's'} came off the board. They are still under Sounds.`);
    }
    this.redraw();
    this.queueSave();
  }

  async exportBoard() {
    const data = JSON.stringify({ ...this.board, savedAt: new Date().toISOString() }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(this.board.id)}.soundboard.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Board saved to your downloads.');
  }

  async importBoard(file) {
    try {
      const raw = JSON.parse(await file.text());
      const board = migrate(raw, { id: this.board.id });
      if (!board) throw new Error('that file is not a board');
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

  /** Hear a sound from the folder, on or off the board. */
  async preview(path) {
    if (!this.library.has(path)) {
      toast(`“${path}” is not among the sounds that are open.`);
      return;
    }
    try {
      await this.engine.preview(path);
      markPreview(this.engine.previewPath);
      say(this.engine.previewPath ? `Hearing ${path.split('/').pop()}` : 'Stopped');
    } catch (err) {
      markPreview(null);
      toast(`“${path}” would not play: ${err.message}`);
    }
  }

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
      say(padTitle(pad));
    } catch (err) {
      toast(`“${padTitle(pad)}” would not play: ${err.message}`);
    }
  }

  /** Stop what is playing, each pad taking its own fade out with it. */
  stop() {
    const live = this.engine.active();
    if (!live.length) return;
    for (const { i, pad } of live) {
      this.engine.stop(i, { fade: pad.fadeOut ?? this.fadeTime() });
    }
    say(live.length === 1 ? `Stopping ${padTitle(live[0].pad)}` : `Stopping ${live.length} sounds`);
  }

  /**
   * Empty the board sits with the other board buttons where there is room for
   * it, and with the editing controls where there is not: a fourth button in
   * the rail wraps it onto a second line, which shortens every pad underneath.
   */
  placeEmptyButton() {
    if (NARROW.matches) refs.browse.prepend(refs.btnEmpty);
    else refs.btnSetup.before(refs.btnEmpty);
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
    // A board with nothing on it is still a board to arrange: editing does not
    // wait for sounds to arrive.
    if (on && !this.board) this.blankBoard();
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
    refs.stageEmpty.hidden = !!this.board;
    refs.grid.hidden = !this.board;
    if (!this.board) return;
    drawGrid(this.board, { editing: this.editing, missing: (path) => !this.library.has(path) });
    drawStop(this.engine);
    if (this.editing) drawLibrary(this.board, this.library, refs.libFilter.value);
    this.paint();
    this.run();
  }

  paint() {
    if (!this.board) return;
    paintPads(this.board, this.engine);
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

  /** Read the length of each sound once, for the pads, three at a time. */
  async measure() {
    if (this.measuring) return;
    this.measuring = true;
    const todo = filled(this.board).filter(({ pad }) => !pad.duration && this.library.has(pad.file));
    const next = async () => {
      const job = todo.pop();
      if (!job) return;
      try {
        job.pad.duration = await probeDuration(await this.library.url(job.pad.file));
        // The length is known only now, so this is where a short sound gets
        // the tap that suits it — never over an answer already given.
        if (job.pad.tap === 'fadeout') job.pad.tap = tapForLength(job.pad.duration);
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

  /**
   * A show has long minutes in it where nothing is pressed, and a phone that
   * locks in one of them is a phone that has to be unlocked before the next
   * cue. The lock is asked for as soon as there is a board, taken again
   * whenever the system drops it — switching apps releases it — and checked on
   * a timer, because nothing announces a release that came from elsewhere.
   */
  async keepAwake() {
    if (!this.board || document.hidden) return;
    if (!('wakeLock' in navigator)) {
      this.sayUnlocked();
      return;
    }
    if (this.wakeLock) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });
    } catch {
      // Refused: the tab is not visible, or the phone is in low power mode.
      this.sayUnlocked();
    }
  }

  sayUnlocked() {
    if (this.warnedAwake) return;
    this.warnedAwake = true;
    toast('This browser will not hold the screen awake. Set the phone not to lock before the show.');
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
  // updateViaCache: 'none' so the worker script itself is never answered from
  // the HTTP cache — otherwise a deploy can sit behind a ten-minute max-age.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}

const app = new App();
app.boot().catch((err) => {
  console.error(err);
  toast(`The board could not start: ${err.message}`);
});

