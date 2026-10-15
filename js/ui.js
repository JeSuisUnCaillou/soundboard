// Drawing the board. Nothing here decides anything; app.js owns the state and
// calls in to redraw. Pad text is set as text, never markup, because the words
// come from filenames on someone else's disk.

import { fmtTime, filled, rowCol, padTitle } from './model.js';
import { GELS, gelHex } from './gels.js';
import { prefs } from './store.js';

export const refs = {};

export function bindRefs() {
  const ids = [
    'grid', 'stageEmpty', 'btnAddEmpty', 'book', 'lib', 'libEmpty', 'libFilter',
    'btnReconnect', 'btnAdd', 'btnEdit', 'btnEmpty', 'btnSetup',
    'browse', 'btnBrowse', 'btnBrowseDone',
    'picker', 'pickerTitle', 'pickerBlurb', 'pickerNote', 'pickerKeys', 'pickerClose',
    'btnAddFolder', 'btnAddFiles', 'btnReopen',
    'btnStop', 'master', 'masterValue',
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

export function drawGrid(board, { editing, missing = () => false, waiting = -1 }) {
  const grid = refs.grid;
  grid.style.setProperty('--cols', board.cols);
  grid.replaceChildren();
  padEls.clear();

  board.pads.forEach((pad, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'pad';
    el.dataset.i = String(i);
    const { row, col } = rowCol(board, i);

    if (pad && pad.file) {
      el.classList.add('pad--filled');
      if (missing(pad.file)) {
        el.classList.add('pad--missing');
        el.title = `${pad.file} is not in the open folder`;
      }
      el.style.setProperty('--gel', gelHex(pad.gel));
      el.append(
        lamp('pad__lamp'),
        span('pad__name', padTitle(pad)),
        span('pad__time', pad.duration ? fmtTime(pad.duration) : ''),
        span('pad__key', pad.key || ''),
        span('pad__travel', ''),
        pencil(),
      );
      el.setAttribute('aria-label', `${padLabel(pad, row, col)}${missing(pad.file) ? ', file missing' : ''}`);
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
  });
}

function padLabel(pad, row, col) {
  const bits = [padTitle(pad)];
  if (pad.duration) bits.push(fmtTime(pad.duration));
  if (pad.key) bits.push(`key ${pad.key}`);
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
    const st = engine.state(i);
    // A pad that has been told to stop looks stopped at once, even though the
    // sound takes its fade to go: the operator has already moved on.
    const live = st && !st.fading ? st : null;
    const playing = !!live && live.state === 'playing';
    const paused = !!live && live.state === 'paused';

    el.classList.toggle('pad--playing', playing);
    el.classList.toggle('pad--paused', paused);

    const lampEl = el.querySelector('.pad__lamp');
    lampEl.className = `lamp pad__lamp ${playing ? 'lamp--go' : 'lamp--off'}`;

    const len = (pad.trimEnd || (live && live.duration) || pad.duration) - (pad.trimStart || 0);
    const done = live ? Math.max(0, live.position - (pad.trimStart || 0)) : 0;
    el.style.setProperty('--travel', live && len > 0 ? Math.min(1, done / len) : 0);

    const time = el.querySelector('.pad__time');
    if (live && len > 0) time.textContent = `-${fmtTime(Math.max(0, len - done))}`;
    else time.textContent = pad.duration ? fmtTime(pad.duration) : '';

    let stack = el.querySelector('.pad__stack');
    if (live && live.stack > 1) {
      if (!stack) {
        stack = span('pad__stack', '');
        el.append(stack);
      }
      stack.textContent = `×${st.stack}`;
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
  li.append(
    span('lib__name', showPath ? entry.path : entry.name),
    span('lib__dir', used.has(entry.path) ? 'on the board' : ''),
    add('Put it on the next free pad'),
  );
  return li;
}

// ── transport ─────────────────────────────────────────────────────────────

/**
 * Stop is only a button when there is something to stop. A sound already
 * fading out has been stopped; it only takes its tail with it.
 */
export function drawStop(engine) {
  const live = engine.active().filter(({ voice }) => !voice.fading).length;
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
  const el = document.createElement('span');
  el.className = 'lib__add';
  el.title = label;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

/** Mark whichever sound is being heard, so a second tap is a knowing one. */
export function markPreview(path) {
  for (const row of refs.lib.querySelectorAll('.lib__item')) {
    row.classList.toggle('lib__item--playing', row.dataset.path === path);
  }
}

/** Opens the pad's settings, in the place the go light has otherwise. */
function pencil() {
  const el = document.createElement('span');
  el.className = 'pad__pencil';
  el.setAttribute('aria-hidden', 'true');
  el.title = 'Set this pad up';
  return el;
}

function lamp(cls) {
  const el = document.createElement('span');
  el.className = `lamp ${cls}`;
  el.setAttribute('aria-hidden', 'true');
  return el;
}
