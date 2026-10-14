// Drawing the board. Nothing here decides anything; app.js owns the state and
// calls in to redraw. Pad text is set as text, never markup, because the words
// come from filenames on someone else's disk.

import { fmtTime, filled, rowCol } from './model.js';
import { GELS, gelHex } from './gels.js';

export const refs = {};

export function bindRefs() {
  const ids = [
    'grid', 'stageEmpty', 'btnAddEmpty', 'book', 'lib', 'libEmpty', 'libFilter',
    'folderName', 'folderCount', 'btnReconnect', 'btnAdd', 'btnEdit', 'btnEmpty', 'btnSetup',
    'picker', 'pickerTitle', 'pickerBlurb', 'pickerNote', 'pickerKeys', 'pickerClose',
    'btnAddFolder', 'btnAddFiles', 'btnReopen',
    'btnStop', 'playing', 'master', 'masterValue', 'btnBook',
    'live', 'toast',
  ];
  for (const id of ids) refs[id] = document.getElementById(id);
  return refs;
}

const padEls = new Map();
const voiceEls = new Map();
// Which folders the operator has opened. The panel is redrawn on every edit,
// and a tree that folds itself back up under your hand is unusable.
const openDirs = new Set();

// ── grid ──────────────────────────────────────────────────────────────────

export function drawGrid(board, { editing, missing = () => false }) {
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
        span('pad__cue', pad.cue ? `Cue ${pad.cue}` : ''),
        lamp('pad__lamp'),
        span('pad__name', pad.name || pad.file),
        span('pad__note', pad.note || ''),
        span('pad__time', pad.duration ? fmtTime(pad.duration) : ''),
        span('pad__key', pad.key || ''),
        span('pad__travel', ''),
        grip(),
      );
      el.setAttribute('aria-label', `${padLabel(pad, row, col)}${missing(pad.file) ? ', file missing' : ''}`);
    } else {
      el.classList.add('pad--empty');
      el.append(span('pad__add', editing ? 'Add sound' : ''));
      el.setAttribute('aria-label', `Empty pad, row ${row + 1} column ${col + 1}`);
      el.disabled = !editing;
    }

    padEls.set(i, el);
    grid.append(el);
  });
}

function padLabel(pad, row, col) {
  const bits = [];
  if (pad.cue) bits.push(`Cue ${pad.cue}`);
  bits.push(pad.name || pad.file);
  if (pad.duration) bits.push(fmtTime(pad.duration));
  if (pad.note) bits.push(pad.note);
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
    const playing = !!st && st.state === 'playing';
    const paused = !!st && st.state === 'paused';

    el.classList.toggle('pad--playing', playing);
    el.classList.toggle('pad--paused', paused);

    const lampEl = el.querySelector('.pad__lamp');
    lampEl.className = `lamp pad__lamp ${playing ? 'lamp--go' : 'lamp--off'}`;

    const len = (pad.trimEnd || (st && st.duration) || pad.duration) - (pad.trimStart || 0);
    const done = st ? Math.max(0, st.position - (pad.trimStart || 0)) : 0;
    el.style.setProperty('--travel', st && len > 0 ? Math.min(1, done / len) : 0);

    const time = el.querySelector('.pad__time');
    if (st && len > 0) time.textContent = `-${fmtTime(Math.max(0, len - done))}`;
    else time.textContent = pad.duration ? fmtTime(pad.duration) : '';

    let stack = el.querySelector('.pad__stack');
    if (st && st.stack > 1) {
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
  // Which sounds are already on the board, and where: a folder read twice is
  // how a cue ends up on two pads by accident.
  const used = new Map();
  board.pads.forEach((pad, i) => {
    if (pad && pad.file && !used.has(pad.file)) {
      used.set(pad.file, pad.cue ? `cue ${pad.cue}` : `pad ${i + 1}`);
    }
  });

  const needle = filter.trim().toLowerCase();
  const items = library.list.filter((e) => !needle || e.path.toLowerCase().includes(needle));

  refs.lib.replaceChildren();
  refs.libEmpty.textContent = library.isOpen
    ? (items.length ? 'Tap a sound to put it on the next free pad, or drag it onto one.' : 'No sound here matches that.')
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
    span('lib__dir', used.get(entry.path) || ''),
  );
  return li;
}

// ── transport ─────────────────────────────────────────────────────────────

export function drawPlaying(board, engine) {
  const active = engine.active().sort((a, b) => a.i - b.i);
  refs.playing.replaceChildren();
  voiceEls.clear();

  for (const { i, pad } of active) {
    const row = document.createElement('div');
    row.className = 'voice';
    row.style.setProperty('--gel', gelHex(pad.gel));
    const bar = document.createElement('div');
    bar.className = 'voice__bar';
    bar.append(document.createElement('i'));
    const time = span('voice__time', '');
    row.append(span('voice__name', pad.name || pad.file), bar, time);
    voiceEls.set(i, { row, bar, time });
    refs.playing.append(row);
  }
}

export function paintPlaying(board, engine) {
  for (const [i, els] of voiceEls) {
    const pad = board.pads[i];
    const st = engine.state(i);
    if (!pad || !st) continue;
    const len = (pad.trimEnd || st.duration || pad.duration) - (pad.trimStart || 0);
    const done = Math.max(0, st.position - (pad.trimStart || 0));
    els.bar.style.setProperty('--travel', len > 0 ? Math.min(1, done / len) : 0);
    els.time.textContent = `${fmtTime(done)} / ${fmtTime(Math.max(0, len))}`;
    els.row.classList.toggle('voice--paused', st.state === 'paused');
  }
}

/** Stop is only a button when there is something to stop. */
export function drawStop(engine) {
  const live = engine.active().length;
  refs.btnStop.disabled = live === 0;
  refs.btnStop.setAttribute(
    'aria-label',
    live ? `Stop ${live === 1 ? 'the sound playing' : `the ${live} sounds playing`}` : 'Stop',
  );
}

export function drawFolder(library) {
  refs.folderName.textContent = library.isOpen ? library.label : 'No sounds yet';
  refs.folderCount.textContent = library.isOpen
    ? `${library.entries.size} sound${library.entries.size === 1 ? '' : 's'}`
    : '';
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
  refs.book.hidden = !editing;
  refs.btnBook.hidden = !editing;
  refs.btnEmpty.hidden = !editing;
  refs.btnEdit.setAttribute('aria-pressed', String(editing));
  refs.btnEdit.textContent = editing ? 'Done editing' : 'Edit board';
}

/** On a narrow screen the sounds list slides over the pads; this is its switch. */
export function setBook(open) {
  document.body.dataset.book = open ? 'open' : 'closed';
  refs.btnBook.setAttribute('aria-expanded', String(open));
  refs.btnBook.textContent = open ? 'Back to the pads' : 'Sounds';
}

export function bookOpen() {
  return document.body.dataset.book === 'open';
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

/** The handle a pad is dragged by, in edit mode. */
function grip() {
  const el = document.createElement('span');
  el.className = 'pad__grip';
  el.setAttribute('aria-hidden', 'true');
  el.title = 'Drag to move this pad';
  return el;
}

/** The pad as it will look on the board, drawn inside the settings sheet. */
export function drawPadPreview(host, pad) {
  host.replaceChildren();
  const el = document.createElement('div');
  el.className = 'pad pad--filled pad--preview';
  el.style.setProperty('--gel', gelHex(pad.gel));
  el.append(
    span('pad__cue', pad.cue ? `Cue ${pad.cue}` : ''),
    span('pad__name', pad.name || pad.file || 'No sound yet'),
    span('pad__note', pad.note || ''),
    span('pad__time', pad.duration ? fmtTime(pad.duration) : ''),
    span('pad__key', pad.key || ''),
  );
  host.append(el);
}

function lamp(cls) {
  const el = document.createElement('span');
  el.className = `lamp ${cls}`;
  el.setAttribute('aria-hidden', 'true');
  return el;
}
