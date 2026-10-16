// Soundboard — wiring. Holds the open board, answers taps, Space and Escape, and keeps
// the drawing in step with what the audio engine is actually doing.

import { Library, CAN_PERSIST } from './library.js';
import { Engine, probeDuration } from './engine.js';
import { store, prefs } from './store.js';
import {
  newBoard, newPad, migrate, resize, fitPads, filled, slug, move, rowCol, padTitle,
  applyLengthDefaults, giveSound, remember, recall, forgetPlaces,
} from './model.js';
import { bundledPaths, bundledSetup, isBundledPath } from './bundled.js';
import { PadEditor, SetupSheet } from './editor.js';
import {
  refs, bindRefs, drawGrid, paintPads, drawLibrary,
  drawStop, setPanel, setBook, markPreview, say, toast, fitNames, drawEdges,
} from './ui.js';

const PATH_TYPE = 'application/x-soundboard-path';

// Below this width the sounds list slides over the pads instead of sitting beside them.
const NARROW = window.matchMedia('(max-width: 900px)');
// Milliseconds within which a second tap on a pad is the same tap.
const DOUBLE_TAP = 300;

// Fields that take typing, where a space is a space and not Stop. A slider, a
// checkbox or a button keeps the focus after a click but takes no text, so
// Space and Escape still work while one is focused.
const TYPED = 'textarea, select, '
  + 'input:not([type=range]):not([type=checkbox]):not([type=radio])'
  + ':not([type=button]):not([type=submit]):not([type=reset]):not([type=color]):not([type=file])';

/** Names as a sentence says them: "A, B and C", or the first four and how many more. */
function listOf(names) {
  const shown = names.length > 5 ? [...names.slice(0, 4), `${names.length - 4} more`] : names;
  return shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`;
}

/** The pad under a node: the pad itself, or the pad whose pencil it is. */
function padOf(node) {
  const pen = node.closest('.pad__pencil');
  if (pen) return refs.grid.querySelector(`.pad[data-i="${pen.dataset.i}"]`);
  return node.closest('.pad');
}

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
    this.padWanting = -1;      // the empty pad that asked for a sound
    this.toldBroken = new Set(); // files already said not to load, this session
    this.tapped = new Map();   // pad index -> when it was last tapped

    this.engine.onchange = () => {
      drawStop(this.engine);
      markPreview(this.engine.previewPath);
      this.paint();
      this.run();
    };
    this.engine.onbroken = (i, broken) => {
      this.redraw();
      if (!this.board) return;
      // Each file's trouble is said once while it is on the board (redraw
      // forgets the files taken off it). A move or a smaller board primes
      // every pad again, and the same file failing again is not news.
      if (!broken) {
        this.toldBroken.delete(this.board.pads[i]?.file);
        return;
      }
      const all = filled(this.board).filter(({ i: at, pad }) => this.engine.wontLoad(at, pad));
      if (all.every(({ pad }) => this.toldBroken.has(pad.file))) return;
      for (const { pad } of all) this.toldBroken.add(pad.file);
      if (all.length === 1) toast(`“${padTitle(all[0].pad)}” will not load, so it will not play.`);
      else if (all.length) toast(`${all.length} pads will not load, so they will not play.`);
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
      // The pencil sets the pad up; it sits beside the pad, not inside it.
      const pen = e.target.closest('.pad__pencil');
      if (pen && this.editing) {
        this.padEditor.open(this.board, Number(pen.dataset.i));
        return;
      }
      const el = e.target.closest('.pad');
      if (!el) return;
      if (this.dragged) return;           // that click is the tail of a drag
      const i = Number(el.dataset.i);
      const pad = this.board.pads[i];
      // An empty pad has nothing to set up: it wants a sound, which is in the
      // folder. It holds the place until one is picked.
      if (this.editing && (!pad || !pad.file)) {
        this.wantSound(i === this.padWanting ? -1 : i);
        if (NARROW.matches && this.padWanting === i) setBook(true);
        else if (this.padWanting === i) toast('Now pick a sound — its + puts it here.');
        return;
      }
      // While editing the pad itself is heard; with Shift, it is set up.
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
      // plus puts it on the pad that asked for one, or on the first free pad;
      // the row itself is just heard.
      if (e.target.closest('.lib__add')) this.assignToPad(item.dataset.path);
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
    // A phone often closes a page without beforeunload: switching apps hides
    // it, and the system may then drop it without another word.
    window.addEventListener('beforeunload', () => this.saveNow());
    window.addEventListener('pagehide', () => this.saveNow());
    document.addEventListener('visibilitychange', () => {
      this.run();
      if (document.hidden) this.saveNow();
      else this.keepAwake();
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
      const el = padOf(e.target);
      if (!el || !e.dataTransfer.types.includes(PATH_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      el.classList.add('pad--drop');
    });

    refs.grid.addEventListener('dragleave', (e) => {
      padOf(e.target)?.classList.remove('pad--drop');
    });

    refs.grid.addEventListener('drop', async (e) => {
      const el = padOf(e.target);
      if (!el) return;
      e.preventDefault();
      el.classList.remove('pad--drop');
      const to = Number(el.dataset.i);
      const path = e.dataTransfer.getData(PATH_TYPE);
      if (!path || !this.library.has(path)) return;
      const existing = this.board.pads[to];
      if (!existing) {
        this.setPad(to, await this.padFor(to, path));
        return;
      }
      this.setPad(to, giveSound(this.board, existing, path, await this.lengthOf(path)));
    });

    this.wirePadDragging();
    this.wireStage();

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

  /** The names fit and the edges are marked again whenever the board changes size. */
  wireStage() {
    refs.stage.addEventListener('scroll', () => drawEdges(), { passive: true });
    let sized = null;
    const sizes = new ResizeObserver(() => {
      cancelAnimationFrame(sized);
      sized = requestAnimationFrame(() => {
        fitNames();
        drawEdges();
      });
    });
    sizes.observe(refs.stage);
    sizes.observe(refs.grid);
    // A name measured in the stand-in font before the board's own has loaded
    // is measured again in it.
    document.fonts?.ready.then(() => fitNames());
  }

  /**
   * Dragging a pad somewhere else. Pointer events rather than HTML5 drag and
   * drop, which does not exist under a finger.
   *
   * The whole pad is a handle, under a mouse or a finger: press anywhere but
   * the pencil and move, and the pad comes with you; press and release without
   * moving and it simply plays. While editing, a filled pad does not scroll the
   * board (its touch-action is none); the empty places and the gaps do.
   */
  wirePadDragging() {
    let drag = null;
    let armed = null;        // pressed, not yet a drag
    const SLOP = 6;          // how far a mouse moves before it means to drag
    const TOUCH_SLOP = 10;   // a finger wobbles more on a tap

    /** Where the pad would land: another pad, or somewhere that takes it off. */
    const at = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return null;
      if (el.closest('#book')) return refs.book;
      if (drag.bar && el.closest('#transport')) return refs.transport;
      const pad = padOf(el);
      return pad && pad !== drag.el ? pad : null;
    };

    const removes = (el) => el === refs.book || el === refs.transport;

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

      // Where Browse files shows, the whole bar it sits in takes a pad off.
      const bar = refs.browse.offsetParent !== null;
      drag = { from, el, ghost, bar, dx: e.clientX - box.left, dy: e.clientY - box.top, target: null };
      el.classList.add('pad--dragging');
      // Show where it can be dropped off the board before it gets there.
      refs.book.classList.add('drop--ready');
      refs.transport.classList.toggle('drop--ready', bar);
      this.dragged = true;                  // the click that follows is not a tap
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* without capture the grid's own listeners still see the move */
      }
    };

    const disarm = () => {
      armed = null;
    };

    refs.grid.addEventListener('pointerdown', (e) => {
      disarm();
      const el = e.target.closest('.pad');
      if (!el || !this.editing || e.button > 0) return;
      const from = Number(el.dataset.i);
      if (!this.board.pads[from] || !this.board.pads[from].file) return;

      armed = { el, from, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType === 'touch' };
    });

    refs.grid.addEventListener('pointermove', (e) => {
      if (!drag) {
        if (!armed || e.pointerId !== armed.id) return;
        const moved = Math.hypot(e.clientX - armed.x, e.clientY - armed.y);
        if (moved < (armed.touch ? TOUCH_SLOP : SLOP)) return;
        const { el, from, touch } = armed;
        armed = null;
        begin(el, from, e, el);
        if (touch && navigator.vibrate) navigator.vibrate(12);
      }
      drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;
      over(at(e));
    });

    // Once a pad is in hand the board must hold still under it. The pad's
    // touch-action already says so; this covers a browser that ignores it.
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
      refs.book.classList.remove('drop--ready');
      refs.transport.classList.remove('drop--ready');
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
      this.saveNow();
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
    if (t instanceof HTMLElement && (t.matches(TYPED) || t.isContentEditable)) return;
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
      : 'Whatever you add joins the sounds already open, under Sounds, ready to put on a pad.';
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

  /**
   * Sounds have arrived: make sure there is a board, and keep them. They wait
   * in the tree until the operator puts them somewhere — the board is theirs,
   * empty or not.
   */
  async absorb(added, { announce = false } = {}) {
    if (!this.board) {
      const id = slug(this.library.rootName);
      const saved = await this.remembered(store.loadBoard(id));
      // A board built today starts as wide as the last one the operator set.
      this.useBoard((saved && migrate(saved, { id })) || newBoard({
        id,
        cols: await this.remembered(store.getMeta('cols')),
        rows: await this.remembered(store.getMeta('rows')),
      }));
      await this.write(() => store.setMeta('last', this.board.id));
    }

    // Places waiting to be reconnected are still this board's places: adding a
    // sound while they are disconnected must not forget them.
    const places = [...(this.pendingHandles || []), ...this.library.handles];
    if (places.length) await this.write(() => store.saveHandles(this.board.id, places));
    this.pendingHandles = null;
    if (refs.picker.open) refs.picker.close();

    this.redraw();
    this.saveNow();
    this.primeAll();
    this.measure();
    this.keepAwake();
    this.keepSounds();

    const missing = filled(this.board).filter(({ pad }) => !this.library.has(pad.file)).length;
    if (added.length) {
      toast(`${added.length} sound${added.length === 1 ? '' : 's'} added, under Sounds in edit mode. `
        + 'The board is left as it is.');
    } else if (announce) toast('Those sounds are already loaded.');
    else if (missing) toast(`${missing} pad${missing === 1 ? '' : 's'} point at sounds that are not open.`);
    say(`${this.library.entries.size} sounds open`);
  }

  /**
   * Sounds on the first free pads, in order, for as many as there are pads.
   * `fresh` sets them up anew, forgetting what they had before.
   */
  async place(paths, { fresh = false } = {}) {
    const onBoard = new Set(filled(this.board).map(({ pad }) => pad.file));
    const taking = [];
    for (const path of paths) {
      if (onBoard.has(path)) continue;
      const i = this.board.pads.findIndex((pad, at) => (!pad || !pad.file) && !taking.some((t) => t.i === at));
      if (i === -1) break;                  // the board is full
      taking.push({ i, path });
      onBoard.add(path);
    }
    // Measured together, so the whole lot is drawn once, in the right colours.
    const pads = await Promise.all(taking.map(({ i, path }) => this.padFor(i, path, { fresh })));
    taking.forEach(({ i }, n) => {
      this.board.pads[i] = pads[n];
    });
    fitPads(this.board);
    return taking.length;
  }

  /**
   * On launch: the board that was open last, playing from the copies it keeps,
   * and then from the real files as soon as the browser allows it.
   */
  async restore() {
    const lastId = await this.remembered(store.getMeta('last'));
    if (!lastId) {
      await this.firstBoard();
      return;
    }

    // The board comes back whatever its sounds can be read from: the copies it
    // keeps, the ones that ship with the app, or — in a moment — the folder.
    const saved = await this.remembered(store.loadBoard(lastId));
    const board = saved && migrate(saved, { id: lastId });
    if (board) {
      this.useBoard(board);
      const kept = await this.remembered(store.soundsFor(lastId), []);
      if (kept.length) this.library.addCached(kept);
      await this.absorb([]);
    }

    const silent = !board || !filled(board).some(({ pad }) => this.library.has(pad.file));
    const handles = await this.remembered(store.loadHandles(lastId), []);

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

    // A handle that cannot even be asked is one to reconnect by hand.
    const states = await Promise.all(handles.map((h) => Promise.resolve()
      .then(() => h.queryPermission({ mode: 'read' }))
      .catch(() => 'prompt')));
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
    this.write(() => store.setMeta('last', this.board.id));
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
      cols: await this.remembered(store.getMeta('cols')),
      rows: await this.remembered(store.getMeta('rows')),
    }));
    await this.write(() => store.setMeta('last', this.board.id));
    await this.layDefault();
    this.redraw();
    this.saveNow();
    this.primeAll();
    this.measure();
    this.keepAwake();
    // A warning that nothing will be kept matters more than the welcome.
    if (!this.warnedForgetful) toast('A board to start with. Add files when you have your own.');
  }

  /** Put the real files back behind the pads, in place of the kept copies. */
  async reconnect(handles) {
    try {
      for (const handle of handles) await this.library.addHandle(handle);
      this.pendingHandles = null;
      refs.btnReconnect.hidden = true;
      refs.btnReopen.hidden = true;
      this.engine.repoint();                 // off the copies, without cutting a cue
      await this.absorb([]);
    } catch (err) {
      toast(err.name === 'NotAllowedError'
        ? 'Without permission to read them, the board stays on the copies it kept.'
        : `Those sounds could not be reopened: ${err.message}`);
    }
  }

  /**
   * What the board reads from or writes to storage, or the fallback if the
   * browser will not keep anything: the show goes on without it, and the
   * operator is told once that nothing done now will be kept.
   */
  async remembered(promise, fallback = undefined) {
    try {
      return await promise;
    } catch (err) {
      console.error(err);
      if (!this.warnedForgetful) {
        this.warnedForgetful = true;
        toast("The browser's storage is not answering, so nothing done now will be kept.");
      }
      return fallback;
    }
  }

  /**
   * Write to storage, unless a read failed this session: the board on screen
   * may then be a stand-in for the one that could not be read, and writing it
   * would put the stand-in in that board's place.
   */
  write(save) {
    if (this.warnedForgetful) return Promise.resolve();
    return save().catch((err) => console.error(err));
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
   * ones a show needs; copies of sounds that have gone are dropped. Asked again
   * while copying, it goes round once more when it is done, so sounds that
   * arrived meanwhile are kept too.
   */
  async keepSounds() {
    if (!this.board || this.outOfRoom || this.warnedForgetful) return;
    if (this.keeping) {
      this.keepAgain = true;
      return;
    }
    this.keeping = true;
    try {
      do {
        this.keepAgain = false;
        await this.keepPass();
      } while (this.keepAgain && this.board && !this.outOfRoom);
    } finally {
      this.keeping = false;
    }
  }

  async keepPass() {
    const id = this.board.id;
    // Ask the browser not to throw the show away when it wants space back.
    if (!this.askedToPersist && navigator.storage && navigator.storage.persist) {
      this.askedToPersist = true;
      navigator.storage.persist().catch(() => {});
    }
    if (!this.forgotOthers) {
      // Room for this board's copies matters more than tidying: a failure
      // here is tried again next time, and the copying goes on.
      this.forgotOthers = await store.forgetOtherBoards(id).then(() => true, () => false);
    }
    const onPads = filled(this.board).map(({ pad }) => pad.file);
    const wanted = [...new Set([...onPads, ...this.library.list.map((e) => e.path)])];
    const inLibrary = new Set(wanted);
    let have;
    try {
      have = new Map((await store.soundsFor(id)).map((rec) => [rec.path, rec]));
      for (const path of have.keys()) {
        if (!inLibrary.has(path)) await store.deleteSound(id, path);
      }
    } catch {
      return; // storage is not answering; the next change tries again
    }

    let copied = 0;
    const missed = [];
    for (const path of wanted) {
      if (!this.library.has(path) || this.library.isCached(path) || this.library.isBundled(path)) continue;
      // One sound that cannot be read (changed on disk, say) costs that sound
      // its copy, not every sound after it.
      try {
        const file = await this.library.file(path);
        const rec = have.get(path);
        if (rec && rec.size === file.size && rec.lastModified === (file.lastModified || 0)) continue;
        await store.putSound(id, path, file);
        this.unkept?.delete(path); // kept after all: say so again if it fails later
        copied += 1;
      } catch (err) {
        if (err && err.name === 'QuotaExceededError') {
          this.outOfRoom = true;
          toast('This browser is out of room. What is already kept will come back; the rest needs the folder again.');
          return;
        }
        missed.push(path);
      }
    }
    // Said once per sound, not on every edit that tries it again.
    this.unkept ||= new Set();
    const fresh = missed.filter((path) => !this.unkept.has(path));
    missed.forEach((path) => this.unkept.add(path));
    if (fresh.length) {
      toast(fresh.length === 1
        ? `“${fresh[0].split('/').pop()}” could not be kept in this browser. Next time it needs the folder again.`
        : `${fresh.length} sounds could not be kept in this browser. Next time they need the folder again.`);
    } else if (copied > 20) {
      toast(`${copied} sounds kept in this browser, ready for next time.`);
    }
  }

  setPad(i, pad) {
    if (i === this.padWanting && pad) this.padWanting = -1;
    const was = this.board.pads[i];
    if (was && was.file && (!pad || pad.file !== was.file)) remember(this.board, was);
    this.board.pads[i] = pad;
    fitPads(this.board);
    this.engine.stop(i, { fade: 0 });
    this.redraw();
    this.saveNow();
    if (pad) {
      this.engine.prime(i, pad);
      if (!pad.duration) this.measure();
    }
    this.keepSounds();
  }

  /** The length of a sound: measured once, then remembered by the library. */
  async lengthOf(path) {
    const known = this.library.lengthOf(path);
    if (known) return known;
    try {
      const seconds = await probeDuration(await this.library.url(path));
      this.library.setLength(path, seconds);
      return seconds;
    } catch {
      return 0;
    }
  }

  /**
   * A pad for a sound, measured before it is drawn: a pad that arrives blue and
   * turns green a moment later is the board correcting itself in front of the
   * operator, which is worse than taking the moment first. A sound that has
   * been on the board before comes back set up as it was, unless `fresh`.
   */
  async padFor(i, path, { fresh = false } = {}) {
    const kept = recall(this.board, path);
    const pad = (!fresh && kept) || newPad(this.board, i, path);
    pad.duration = await this.lengthOf(path) || pad.duration;
    applyLengthDefaults(this.board, pad);
    return pad;
  }

  /**
   * An empty pad that has been clicked is waiting for a sound; clicking it
   * again, or filling it, lets it go. Nothing else on the board moves.
   */
  wantSound(i) {
    const was = this.padWanting;
    this.padWanting = i >= 0 ? i : -1;
    if (was !== this.padWanting) this.redraw();
  }

  async assignToPad(path) {
    if (!this.board || !this.library.has(path)) return;
    // The pad that asked for a sound gets it; otherwise the first free one.
    const asked = this.padWanting;
    const free = asked >= 0 && !(this.board.pads[asked] || {}).file
      ? asked
      : this.board.pads.findIndex((pad) => !pad || !pad.file);
    if (free === -1) {
      toast('Every pad is taken. Add rows in Board settings, or tap a pad to replace what is on it.');
      return;
    }
    this.wantSound(-1);
    this.setPad(free, await this.padFor(free, path));
    const { row, col } = rowCol(this.board, free);
    // Show the pad it landed on rather than the list it came from.
    if (NARROW.matches) setBook(false);
    toast(`${padTitle(this.board.pads[free])} is on row ${row + 1}, column ${col + 1}.`);
  }

  applySetup({ cols, rows, fadeIn, fadeOut }) {
    if (!this.board) return;
    this.board.defaults = { fadeIn, fadeOut };
    // Every pad keeps its row and column. A smaller board names what it has
    // no room for; those pads are remembered, and come back to their places
    // when the board grows to hold them again.
    const was = { cols: this.board.cols, rows: this.board.rows };
    const { lost, back } = resize(this.board, cols, rows);
    if (this.board.cols !== was.cols) this.write(() => store.setMeta('cols', this.board.cols));
    if (this.board.rows !== was.rows) this.write(() => store.setMeta('rows', this.board.rows));
    // A pad's channel is its index, which a change of columns moves.
    if (lost.length || back || this.board.cols !== was.cols) {
      this.padWanting = -1;
      this.engine.reset();
      this.primeAll();
    }
    if (lost.length) {
      toast(`${listOf(lost.map(padTitle))} came off the board. `
        + (lost.length === 1 ? 'Back on a pad, it comes back as it was.' : 'Back on a pad, they come back as they were.'));
    }
    this.redraw();
    this.saveNow();
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
    // Two taps closer than this are one nervous tap, not a second tap: a cue
    // tapped twice in a panic must start, not start and fade straight out.
    const now = performance.now();
    if (now - (this.tapped.get(i) ?? -Infinity) < DOUBLE_TAP) return;
    this.tapped.set(i, now);
    try {
      await this.engine.fire(i, pad);
      say(padTitle(pad));
    } catch (err) {
      toast(`“${padTitle(pad)}” would not play: ${err.message}`);
    }
  }

  /** Stop what is playing, each pad taking its own fade out with it. */
  stop() {
    // Once per pad, however many of its voices are sounding.
    const pads = new Map(this.engine.live().map(({ i, pad }) => [i, pad]));
    if (!pads.size) return;
    for (const [i, pad] of pads) {
      this.engine.stop(i, { fade: pad.fadeOut ?? this.fadeTime() });
    }
    const [first] = pads.values();
    say(pads.size === 1 ? `Stopping ${padTitle(first)}` : `Stopping ${pads.size} sounds`);
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

  /** The sounds that come with the app on the first free pads, set up as a show would use them. */
  async layDefault() {
    await this.place(bundledPaths(), { fresh: true });
    for (const { pad } of filled(this.board)) {
      if (isBundledPath(pad.file)) Object.assign(pad, bundledSetup(pad.file));
    }
  }

  /** An empty board has nothing to empty: the same button lays the default board out on it. */
  async loadDefault() {
    await this.layDefault();
    this.redraw();
    this.saveNow();
    this.primeAll();
    this.measure();
  }

  /** Take every sound off the board, keeping the sounds themselves. Twice, to mean it. */
  emptyBoard() {
    if (!this.board) return;
    if (!filled(this.board).length) {
      this.loadDefault();
      return;
    }
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
    // Every sound keeps its settings for when it is put back, but an emptied
    // board is empty: growing it later puts nothing back by itself.
    forgetPlaces(this.board);
    for (const { pad } of filled(this.board)) remember(this.board, pad);
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
    refs.btnEmpty.classList.remove('btn--danger');
    this.labelEmpty();
  }

  labelEmpty() {
    if (this.armed) return;
    const empty = !!this.board && !filled(this.board).length;
    refs.btnEmpty.textContent = empty ? 'Load the default board' : 'Empty the board';
    refs.btnEmpty.classList.toggle('btn--danger-quiet', !empty);
    refs.btnEmpty.classList.toggle('btn--quiet', empty);
  }

  setEditing(on) {
    // A board with nothing on it is still a board to arrange: editing does not
    // wait for sounds to arrive.
    if (on && !this.board) this.blankBoard();
    this.editing = on;
    this.padWanting = -1;
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
    // A file taken off the board and put back on is news again if it fails.
    const onBoard = new Set(filled(this.board).map(({ pad }) => pad.file));
    for (const file of this.toldBroken) if (!onBoard.has(file)) this.toldBroken.delete(file);
    drawGrid(this.board, {
      editing: this.editing,
      missing: (path) => !this.library.has(path),
      broken: (i) => this.engine.wontLoad(i, this.board.pads[i]),
      waiting: this.padWanting,
    });
    fitNames();
    drawEdges();
    drawStop(this.engine);
    this.labelEmpty();
    if (this.editing) drawLibrary(this.board, this.library, refs.libFilter.value);
    this.paint();
    this.run();
  }

  paint() {
    if (!this.board) return;
    paintPads(this.board, this.engine);
  }

  run() {
    if (!this.engine.anyPlaying) return;
    if (document.hidden) {
      // A hidden tab gets no animation frames, but a stop point still has to
      // land while the operator reads the script in another window: keep the
      // engine ticking on a timer until the board is in view again.
      this.hiddenTick ||= setInterval(() => {
        this.engine.tick();
        if (document.hidden && this.engine.anyPlaying) return;
        clearInterval(this.hiddenTick);
        this.hiddenTick = null;
        this.run();
      }, 50);
      return;
    }
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      this.engine.tick();
      this.paint();
      this.run();
    });
  }

  primeAll() {
    filled(this.board).forEach(({ i, pad }) => this.engine.prime(i, pad));
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
        job.pad.duration = await this.lengthOf(job.pad.file);
        // A board restored from storage can hold pads nothing has measured yet.
        applyLengthDefaults(this.board, job.pad);
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
    // Several presses can ask at once; one lock, asked for once, is enough.
    if (this.wakeLock || this.askingAwake) return;
    this.askingAwake = true;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => {
        this.wakeLock = null;
      });
    } catch {
      // Refused: the tab is not visible, or the phone is in low power mode.
      this.sayUnlocked();
    } finally {
      this.askingAwake = false;
    }
  }

  sayUnlocked() {
    if (this.warnedAwake) return;
    this.warnedAwake = true;
    toast('This browser will not hold the screen awake. Set the phone not to lock before the show.');
  }

  /**
   * For changes that come in bursts: the master volume, which sends one on
   * every step of the slider, and lengths as they are measured. Anything the
   * operator would mind losing saves at once (`saveNow`): a save left for the
   * page going away is not sure to land.
   */
  queueSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 500);
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    if (this.board) this.write(() => store.saveBoard(structuredClone(this.board)));
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
