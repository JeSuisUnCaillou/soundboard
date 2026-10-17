// Drawing the board. Nothing here decides anything; app.js owns the state and
// calls in to redraw. Pad text is set as text, never markup, because the words
// come from filenames on someone else's disk.

import { fmtLength, filled, rowCol, padTitle } from './model.js';
import { GELS, gelHex } from './gels.js';
import { prefs } from './store.js';

export const refs = {};

export function bindRefs() {
  const ids = [
    'rail', 'stage', 'grid', 'stageEmpty', 'btnAddEmpty', 'book', 'lib', 'libEmpty', 'libFilter',
    'btnReconnect', 'btnAdd', 'btnEdit', 'btnEmpty', 'btnSetup',
    'browse', 'btnBrowse', 'btnBrowseDone',
    'picker', 'pickerTitle', 'pickerBlurb', 'pickerNote', 'pickerKeys', 'pickerClose',
    'btnAddFolder', 'btnAddFiles', 'btnReopen',
    'transport', 'btnStop', 'master', 'masterValue',
    'live', 'toast',
  ];
  for (const id of ids) refs[id] = document.getElementById(id);
  return refs;
}

const padEls = new Map();
// Which folders the operator has opened. The panel is redrawn on every edit,
// and a tree that folds itself back up under your hand is unusable — so is one
// that forgets where you were when the page reloads.
const openDirs = new Set(prefs.get('openDirs', []));

// ── grid ──────────────────────────────────────────────────────────────────

export function drawGrid(board, { editing, missing = () => false, broken = () => false, waiting = -1, armed = null, can = {} }) {
  const grid = refs.grid;
  grid.style.setProperty('--cols', board.cols);
  grid.style.setProperty('--rows', board.rows);
  grid.replaceChildren();
  padEls.clear();

  board.pads.forEach((pad, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'pad';
    el.dataset.i = String(i);
    const { row, col } = rowCol(board, i);
    // Placed by hand, so that a filled pad's pencil can share its cell.
    el.style.gridArea = `${row + 1} / ${col + 1}`;
    let pen = null;

    if (pad && pad.file) {
      el.classList.add('pad--filled');
      if (missing(pad.file)) {
        el.classList.add('pad--missing');
        el.title = `${pad.file} is not in the open folder`;
      } else if (broken(i)) {
        el.classList.add('pad--broken');
        el.title = `${pad.file} will not load`;
      }
      // A loop goes round: its clock counts to the end of a pass, not of the sound.
      if (pad.loop) el.classList.add('pad--loop');
      el.style.setProperty('--gel', gelHex(pad.gel));
      el.append(
        lamp('pad__lamp'),
        span('pad__name', padTitle(pad)),
        span('pad__time', pad.duration ? fmtLength(pad.duration) : ''),
        span('pad__travel', ''),
      );
      pen = pencil(i, padTitle(pad));
      const trouble = missing(pad.file) ? ', file missing' : broken(i) ? ', will not load' : '';
      el.setAttribute('aria-label', `${padLabel(pad, row, col)}${trouble}`);
      if (!el.title) el.title = padTitle(pad);   // the whole name, when it is clipped
    } else {
      el.classList.add('pad--empty');
      // The pad that was asked for a sound says so, and says it in the place
      // the sound's name will be.
      const wanted = editing && i === waiting;
      if (wanted) el.classList.add('pad--waiting');
      el.append(span('pad__add', editing ? (wanted ? 'Pick a sound' : 'Add sound') : ''));
      el.setAttribute('aria-label', `Empty pad, row ${row + 1} column ${col + 1}${wanted ? ', waiting for a sound' : ''}`);
      el.disabled = !editing;
    }

    padEls.set(i, el);
    grid.append(el);
    if (pen) {
      pen.style.gridArea = el.style.gridArea;
      grid.append(pen);
    }
  });
  if (editing) drawBins(board, armed, can);
}

// Drawn in the page rather than masked from CSS, so that every browser shows them.
const BIN_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M6 4V2h4v2M3.5 4l.8 10h7.4l.8-10M6.5 7v4.5M9.5 7v4.5"/></svg>';
const PLUS_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2 8h12"/></svg>';

/**
 * While editing, a bin under each column and beside each row takes it off, and
 * the + in the corner adds a row and a column. `armed` is the bin that has
 * been tapped once and waits for the second tap; `can` says which of them
 * the board's limits leave working.
 */
function drawBins(board, armed, can) {
  const bin = (line, at, area, label) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'bin';
    el.innerHTML = BIN_ICON;
    el.dataset.line = line;
    el.dataset.at = String(at);
    el.style.gridArea = area;
    el.title = label;
    el.setAttribute('aria-label', label);
    if (armed && armed.line === line && armed.at === at) el.classList.add('bin--armed');
    el.disabled = !can[line];
    return el;
  };
  for (let col = 0; col < board.cols; col++) {
    refs.grid.append(bin('cols', col, `${board.rows + 1} / ${col + 1}`, `Remove column ${col + 1}`));
  }
  for (let row = 0; row < board.rows; row++) {
    refs.grid.append(bin('rows', row, `${row + 1} / ${board.cols + 1}`, `Remove row ${row + 1}`));
  }
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'grow';
  add.innerHTML = PLUS_ICON;
  add.id = 'btnGrow';
  add.style.gridArea = `${board.rows + 1} / ${board.cols + 1}`;
  add.title = 'Add a row and a column';
  add.setAttribute('aria-label', 'Add a row and a column');
  add.disabled = !can.grow;
  refs.grid.append(add);
}

// The smallest a pad's name is set, to fit a long word on its own line. Below
// it the word is read more slowly than it would be broken.
const NAME_FLOOR = 11;

/**
 * Names break between words only. A word too long for its pad is set smaller
 * until it fits, and so is a name with more lines than the pad has room for:
 * "Applaudi / ssements" is read twice, a smaller "Applaudissements" once. Only
 * a word that does not fit even at the floor is broken. Run after every draw
 * and whenever the pads change size, since a name's size follows its pad's.
 */
export function fitNames() {
  const names = [...refs.grid.querySelectorAll('.pad__name')];
  // Every name back to its own size first, then measured together: one layout
  // for the board rather than one per pad.
  for (const el of names) {
    el.style.fontSize = '';
    el.classList.remove('pad__name--break');
  }
  // Both sizes are whole pixels, so a name that fits can read a pixel over.
  const over = (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
  for (const el of names.filter(over)) {
    let size = parseFloat(getComputedStyle(el).fontSize);
    for (let n = 0; n < 8 && size > NAME_FLOOR && over(el); n++) {
      const ratio = Math.min(el.clientWidth / el.scrollWidth, Math.sqrt(el.clientHeight / el.scrollHeight), 0.95);
      size = Math.max(NAME_FLOOR, Math.floor(size * ratio * 2) / 2);
      el.style.fontSize = `${size}px`;
    }
    if (el.scrollWidth > el.clientWidth + 1) el.classList.add('pad__name--break');
  }
}

/**
 * Marks each side of the board that goes on past the edge of the screen. The
 * board keeps its shape on a phone and scrolls, and a column out of sight with
 * nothing to say it is there is a cue that is not called.
 */
export function drawEdges() {
  const s = refs.stage;
  if (!s) return;
  const slack = 2;
  s.classList.toggle('stage--more-left', s.scrollLeft > slack);
  s.classList.toggle('stage--more-right', s.scrollLeft + s.clientWidth < s.scrollWidth - slack);
  s.classList.toggle('stage--more-up', s.scrollTop > slack);
  s.classList.toggle('stage--more-down', s.scrollTop + s.clientHeight < s.scrollHeight - slack);
}

function padLabel(pad, row, col) {
  const bits = [padTitle(pad)];
  if (pad.duration) bits.push(fmtLength(pad.duration));
  if (pad.loop) bits.push('loops');
  bits.push(`row ${row + 1} column ${col + 1}`);
  return bits.join(', ');
}

/** Per-frame refresh: lamps, travel bars, countdowns. */
export function paintPads(board, engine) {
  for (const [i, el] of padEls) {
    const pad = board.pads[i];
    if (!pad || !pad.file) continue;
    // The pad was filled after this element was drawn empty; the redraw that
    // gives it a lamp and a clock is already on its way.
    if (!el.classList.contains('pad--filled')) continue;
    // A pad told to stop is no longer lit as playing, but while the hall
    // still hears its fade its light goes down with the sound.
    const live = engine.state(i);
    const playing = !!live && live.state === 'playing';
    const paused = !!live && live.state === 'paused';
    const fading = !!live && live.state === 'fading';

    el.classList.toggle('pad--playing', playing);
    el.classList.toggle('pad--paused', paused);
    el.classList.toggle('pad--fading', fading);
    if (fading) el.style.setProperty('--level', live.level.toFixed(3));
    else el.style.removeProperty('--level');

    const lampEl = el.querySelector('.pad__lamp');
    lampEl.className = `lamp pad__lamp ${playing ? 'lamp--go' : fading ? 'lamp--fading' : 'lamp--off'}`;

    const len = (pad.trimEnd || (live && live.duration) || pad.duration) - (pad.trimStart || 0);
    const done = live ? Math.max(0, live.position - (pad.trimStart || 0)) : 0;
    el.style.setProperty('--travel', live && len > 0 ? Math.min(1, done / len) : 0);

    const time = el.querySelector('.pad__time');
    if (live && len > 0) time.textContent = fmtLength(Math.max(0, len - done));
    else time.textContent = pad.duration ? fmtLength(pad.duration) : '';

    let stack = el.querySelector('.pad__stack');
    if (live && live.stack > 1) {
      if (!stack) {
        stack = span('pad__stack', '');
        el.append(stack);
      }
      stack.textContent = `×${live.stack}`;
    } else if (stack) {
      stack.remove();
    }
  }
}

// ── the folder's sounds, as a tree ────────────────────────────────────────

export function drawLibrary(board, library, filter = '') {
  // Which sounds are already on the board: a folder read twice is how the same
  // sound ends up on two pads by accident.
  const used = new Set();
  board.pads.forEach((pad) => {
    if (pad && pad.file) used.add(pad.file);
  });

  const needle = filter.trim().toLowerCase();
  const items = library.list.filter((e) => !needle || e.path.toLowerCase().includes(needle));

  refs.lib.replaceChildren();
  refs.libEmpty.textContent = library.isOpen
    ? (items.length ? '' : 'No sound here matches that.')
    : 'Add files to see what you have.';

  // Searching flattens the tree: the point of a search is to stop navigating.
  if (needle) {
    for (const entry of items) refs.lib.append(soundRow(entry, used, true));
    return;
  }
  for (const node of treeOf(items)) refs.lib.append(branch(node, used, ''));
}

/** Folders and files, nested the way they are on disk. */
function treeOf(entries) {
  const root = { dirs: new Map(), files: [] };
  for (const entry of entries) {
    let here = root;
    for (const part of entry.dir ? entry.dir.split('/') : []) {
      if (!here.dirs.has(part)) here.dirs.set(part, { name: part, dirs: new Map(), files: [] });
      here = here.dirs.get(part);
    }
    here.files.push(entry);
  }
  return [...root.dirs.values(), { files: root.files, dirs: new Map() }];
}

function countOf(node) {
  let n = node.files.length;
  for (const dir of node.dirs.values()) n += countOf(dir);
  return n;
}

function branch(node, used, parent) {
  if (!node.name) {
    const frag = document.createDocumentFragment();
    for (const entry of node.files) frag.append(soundRow(entry, used, false));
    return frag;
  }

  const path = parent ? `${parent}/${node.name}` : node.name;
  const box = document.createElement('details');
  box.className = 'tree__dir';
  box.open = openDirs.has(path);
  box.addEventListener('toggle', () => {
    if (box.open) openDirs.add(path);
    else openDirs.delete(path);
    prefs.set('openDirs', [...openDirs]);
  });

  const head = document.createElement('summary');
  head.className = 'tree__name';
  head.append(span('tree__label', node.name), span('tree__count', String(countOf(node))));
  box.append(head);

  const body = document.createElement('div');
  body.className = 'tree__body';
  for (const dir of node.dirs.values()) body.append(branch(dir, used, path));
  for (const entry of node.files) body.append(soundRow(entry, used, false));
  box.append(body);
  return box;
}

function soundRow(entry, used, showPath) {
  const li = document.createElement('div');
  li.className = `lib__item${used.has(entry.path) ? ' lib__item--used' : ''}`;
  li.draggable = true;
  li.dataset.path = entry.path;
  li.title = entry.path;
  // The row is heard, the plus puts it on a pad: two buttons, so both can be
  // reached from the keyboard and named to a screen reader.
  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'lib__play';
  play.append(
    span('lib__name', showPath ? entry.path : entry.name),
    span('lib__dir', used.has(entry.path) ? 'on the board' : ''),
  );
  li.append(play, add(`Put ${entry.name} on a pad`));
  return li;
}

// ── transport ─────────────────────────────────────────────────────────────

/**
 * Stop is only a button when there is something to stop. A sound already
 * told to stop only takes its fade with it.
 */
export function drawStop(engine) {
  const live = engine.live().length;
  refs.btnStop.disabled = live === 0;
  refs.btnStop.setAttribute(
    'aria-label',
    live ? `Stop ${live === 1 ? 'the sound playing' : `the ${live} sounds playing`}` : 'Stop',
  );
}

// ── gels, chrome, chatter ─────────────────────────────────────────────────

export function drawGels(host, selected, onPick) {
  host.replaceChildren();
  for (const g of GELS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gel';
    b.style.setProperty('--swatch', g.hex);
    b.title = `${g.name} (${g.number})`;
    b.setAttribute('aria-label', `${g.name} ${g.number}`);
    b.setAttribute('aria-pressed', String(g.id === selected));
    b.addEventListener('click', () => {
      for (const other of host.children) other.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-pressed', 'true');
      onPick(g.id);
    });
    host.append(b);
  }
}

/** The folder's sounds are only wanted while the board is being built. */
export function setPanel(editing) {
  document.body.dataset.editing = editing ? 'on' : '';
  prefs.set('editing', editing);
  refs.book.hidden = !editing;
  refs.btnEmpty.hidden = !editing;
  refs.btnSetup.hidden = !editing;      // the board's own settings belong to building it
  refs.browse.hidden = !editing;
  refs.btnEdit.setAttribute('aria-pressed', String(editing));
  refs.btnEdit.textContent = editing ? 'Done editing' : 'Edit board';
}

/** On a narrow screen the folder opens over the board, never beside it. */
export function setBook(open) {
  document.body.dataset.book = open ? 'open' : 'closed';
  prefs.set('book', open);
  refs.btnBrowse.setAttribute('aria-expanded', String(open));
}

export function say(message) {
  refs.live.textContent = message;
}

let toastTimer = null;
export function toast(message) {
  if (!refs.toast) {
    console.warn(message);
    return;
  }
  refs.toast.textContent = message;
  // As tall as the rail it covers, which wraps to two lines on a phone.
  refs.toast.style.minHeight = refs.rail ? `${refs.rail.offsetHeight}px` : '';
  refs.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    refs.toast.hidden = true;
  }, 4200);
}

function span(cls, text) {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = text;
  return el;
}

/** The plus on a row in the tree: puts that sound on the next free pad. */
function add(label) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'lib__add';
  el.title = 'Put it on the next free pad';
  el.setAttribute('aria-label', label);
  return el;
}

/** Mark whichever sound is being heard, so a second tap is a knowing one. */
export function markPreview(path) {
  for (const row of refs.lib.querySelectorAll('.lib__item')) {
    row.classList.toggle('lib__item--playing', row.dataset.path === path);
  }
}

/**
 * Opens the pad's settings, in the place the go light has otherwise. A button
 * of its own beside the pad rather than inside it, since a button cannot hold
 * another, and this one has to be reached from the keyboard.
 */
function pencil(i, title) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'pad__pencil';
  el.dataset.i = String(i);
  el.title = 'Set this pad up';
  el.setAttribute('aria-label', `Set up ${title}`);
  return el;
}

function lamp(cls) {
  const el = document.createElement('span');
  el.className = `lamp ${cls}`;
  el.setAttribute('aria-hidden', 'true');
  return el;
}
