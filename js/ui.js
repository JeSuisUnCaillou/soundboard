// Drawing the board. Nothing here decides anything; app.js owns the state and
// calls in to redraw. Pad text is set as text, never markup, because the words
// come from filenames on someone else's disk.

import { fmtTime, filled, rowCol } from './model.js';
import { GELS, gelHex } from './gels.js';

export const refs = {};

export function bindRefs() {
  const ids = [
    'grid', 'cues', 'cuesEmpty', 'lib', 'libEmpty', 'libFilter', 'panelCues', 'panelLibrary',
    'folderName', 'folderCount', 'btnOpen', 'btnOpenBig', 'btnOpenFiles', 'btnEdit', 'btnSetup',
    'btnGo', 'goLabel', 'goLamp', 'playing', 'master', 'masterValue', 'btnFadeAll', 'btnStopAll', 'btnBook',
    'welcome', 'welcomeNote', 'live', 'toast',
  ];
  for (const id of ids) refs[id] = document.getElementById(id);
  return refs;
}

const padEls = new Map();
const voiceEls = new Map();

// ── grid ──────────────────────────────────────────────────────────────────

export function drawGrid(board, { editing, missing = () => false }) {
  const grid = refs.grid;
  grid.style.setProperty('--rows', board.rows);
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
        span('pad__time', pad.duration ? fmtTime(pad.duration) : ''),
        pad.key ? span('pad__key', pad.key) : span('pad__key', ''),
        span('pad__travel', ''),
      );
      el.setAttribute('aria-label', `${padLabel(pad, row, col)}${missing(pad.file) ? ', file missing' : ''}`);
      el.draggable = editing;
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
  if (pad.key) bits.push(`key ${pad.key}`);
  bits.push(`row ${row + 1} column ${col + 1}`);
  return bits.join(', ');
}

/** Per-frame refresh: lamps, travel bars, countdowns, standby. */
export function paintPads(board, engine, standby) {
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
    el.classList.toggle('pad--standby', i === standby && !playing);

    const lampEl = el.querySelector('.pad__lamp');
    lampEl.className = `lamp pad__lamp ${playing ? 'lamp--go' : i === standby ? 'lamp--standby' : 'lamp--off'}`;

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

// ── cue sheet ─────────────────────────────────────────────────────────────

export function drawCues(board, standby) {
  const list = filled(board);
  refs.cues.replaceChildren();
  refs.cuesEmpty.hidden = list.length > 0;

  for (const { i, pad } of list) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cue';
    btn.dataset.i = String(i);
    btn.classList.toggle('cue--standby', i === standby);
    btn.append(
      lamp(`cue__lamp ${i === standby ? 'lamp--standby' : 'lamp--off'}`),
      span('cue__num', pad.cue || '—'),
      span('cue__name', pad.name || pad.file),
      span('cue__len', pad.duration ? fmtTime(pad.duration) : ''),
    );
    if (pad.note) btn.append(span('cue__note', pad.note));
    btn.style.setProperty('--gel', gelHex(pad.gel));
    li.append(btn);
    refs.cues.append(li);
  }
}

export function markCues(board, engine, standby) {
  for (const btn of refs.cues.querySelectorAll('.cue')) {
    const i = Number(btn.dataset.i);
    const st = engine.state(i);
    const playing = !!st && st.state === 'playing';
    btn.classList.toggle('cue--playing', playing);
    btn.classList.toggle('cue--standby', i === standby && !playing);
    const l = btn.querySelector('.cue__lamp');
    l.className = `lamp cue__lamp ${playing ? 'lamp--go' : i === standby ? 'lamp--standby' : 'lamp--off'}`;
  }
}

// ── folder library ────────────────────────────────────────────────────────

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
    : 'Open a folder to see what is in it.';

  for (const entry of items) {
    const li = document.createElement('li');
    li.className = `lib__item${used.has(entry.path) ? ' lib__item--used' : ''}`;
    li.draggable = true;
    li.dataset.path = entry.path;
    li.title = entry.path;
    li.append(span('lib__name', entry.name), span('lib__dir', used.get(entry.path) || entry.dir));
    refs.lib.append(li);
  }
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

export function drawStandby(board, standby) {
  const pad = standby == null ? null : board.pads[standby];
  refs.btnGo.disabled = !pad;
  refs.goLamp.className = `lamp ${pad ? 'lamp--standby' : 'lamp--off'}`;
  refs.goLabel.textContent = pad
    ? `Standing by: ${pad.cue ? `cue ${pad.cue}, ` : ''}${pad.name || pad.file}`
    : 'Nothing standing by';
}

export function drawFolder(library) {
  refs.folderName.textContent = library.isOpen ? library.name : 'No folder open';
  refs.folderCount.textContent = library.isOpen ? `${library.entries.size} sound${library.entries.size === 1 ? '' : 's'}` : '';
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

export function setPanel(editing) {
  document.body.dataset.editing = editing ? 'on' : '';
  refs.panelCues.hidden = editing;
  refs.panelLibrary.hidden = !editing;
  refs.btnEdit.setAttribute('aria-pressed', String(editing));
  refs.btnEdit.textContent = editing ? 'Done editing' : 'Edit board';
  if (!bookOpen()) refs.btnBook.textContent = editing ? 'Sounds' : 'Cue sheet';
}

/** On a narrow screen the prompt book slides over the pads; this is its switch. */
export function setBook(open, editing) {
  document.body.dataset.book = open ? 'open' : 'closed';
  refs.btnBook.setAttribute('aria-expanded', String(open));
  refs.btnBook.textContent = open ? 'Hide' : (editing ? 'Sounds' : 'Cue sheet');
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

function lamp(cls) {
  const el = document.createElement('span');
  el.className = `lamp ${cls}`;
  el.setAttribute('aria-hidden', 'true');
  return el;
}
