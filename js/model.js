// The board: a run of pads, each pointing at a file inside the open folder.
// Only the number of columns is set; the pads wrap into as many rows as they
// need, and the board scrolls. Index = row * cols + col, so changing the column
// count re-wraps the same pads in the same order and never loses one.

import { DEFAULT_GEL } from './gels.js';

export const BOARD_VERSION = 1;
export const MAX_COLS = 12;
const MIN_ROWS = 2;

// Keys sit under the fingers in the same shape as the pads above them.
const KEY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", '\\'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', '`', '#'],
];

export function newBoard({ id, name, cols = 4 }) {
  const board = {
    version: BOARD_VERSION,
    id,
    name: name || id,
    cols: clampInt(cols, 1, MAX_COLS),
    master: 0.8,
    // Nothing starts or stops on a hard edge unless a pad asks for it.
    defaults: { fadeIn: 1, fadeOut: 1.5 },
    pads: [],
  };
  fitPads(board);
  return board;
}

export function newPad(board, i, file) {
  const name = file ? prettyName(file) : '';
  return {
    file: file || '',
    name,
    cue: nextCue(board),
    note: '',
    gel: DEFAULT_GEL,
    gain: 1,
    fadeIn: board.defaults.fadeIn,
    fadeOut: board.defaults.fadeOut,
    loop: false,
    trimStart: 0,
    trimEnd: null,
    tap: 'fadeout',
    solo: false,
    key: defaultKey(board, i),
    duration: 0,
  };
}

/**
 * Keep a whole spare row at the end of the board, and never fewer than two
 * rows: there is always somewhere to put the next sound.
 */
export function fitPads(board) {
  let last = -1;
  board.pads.forEach((pad, i) => {
    if (pad && pad.file) last = i;
  });
  const want = Math.max(board.cols * MIN_ROWS, (Math.floor(last / board.cols) + 2) * board.cols);
  board.pads.length = Math.min(board.pads.length, want);
  while (board.pads.length < want) board.pads.push(null);
  return board;
}

/** Re-wrap the same pads into a different number of columns. */
export function setCols(board, cols) {
  board.cols = clampInt(cols, 1, MAX_COLS);
  return fitPads(board);
}

export function rowCount(board) {
  return Math.max(1, Math.ceil(board.pads.length / board.cols));
}

export function filled(board) {
  const out = [];
  board.pads.forEach((pad, i) => {
    if (pad && pad.file) out.push({ i, pad });
  });
  return out;
}

export function rowCol(board, i) {
  return { row: Math.floor(i / board.cols), col: i % board.cols };
}

export function defaultKey(board, i) {
  const { row, col } = rowCol(board, i);
  const taken = new Set(board.pads.filter(Boolean).map((p) => p.key).filter(Boolean));
  const key = KEY_ROWS[row] && KEY_ROWS[row][col];
  return key && !taken.has(key) ? key : '';
}

export function padByKey(board, key) {
  const lower = key.toLowerCase();
  const i = board.pads.findIndex((p) => p && p.file && p.key && p.key.toLowerCase() === lower);
  return i === -1 ? null : { i, pad: board.pads[i] };
}

/** Next unused cue number, counting on from the highest plain number in use. */
export function nextCue(board) {
  let top = 0;
  for (const pad of board.pads) {
    if (!pad || !pad.cue) continue;
    const n = parseInt(pad.cue, 10);
    if (Number.isFinite(n)) top = Math.max(top, n);
  }
  return String(top + 1);
}

export function move(board, from, to) {
  const pads = board.pads;
  [pads[from], pads[to]] = [pads[to], pads[from]];
}

export function prettyName(path) {
  const base = path.split('/').pop().replace(/\.[^.]+$/, '');
  return base
    .replace(/[_-]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\d+[\s.)]+/, '')
    .trim() || base;
}

export function fmtTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

export function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'board';
}

/** Accept a board from storage or a saved file, filling in anything missing. */
export function migrate(raw, { id } = {}) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.pads)) return null;
  const board = newBoard({
    id: id || raw.id || 'board',
    name: raw.name,
    cols: raw.cols,
  });
  board.master = clampNum(raw.master, 0, 1, 0.8);
  board.defaults = {
    fadeIn: clampNum(raw.defaults && raw.defaults.fadeIn, 0, 120, 1),
    fadeOut: clampNum(raw.defaults && raw.defaults.fadeOut, 0, 120, 1.5),
  };
  raw.pads.forEach((pad, i) => {
    board.pads[i] = pad ? migratePad(board, i, pad) : null;
  });
  fitPads(board);
  return board;
}

function migratePad(board, i, raw) {
  const pad = newPad(board, i, String(raw.file || ''));
  pad.name = String(raw.name ?? pad.name).slice(0, 40);
  pad.cue = String(raw.cue ?? '').slice(0, 6);
  pad.note = String(raw.note ?? '').slice(0, 120);
  pad.gel = typeof raw.gel === 'string' ? raw.gel : pad.gel;
  pad.gain = clampNum(raw.gain, 0, 1, 1);
  pad.fadeIn = clampNum(raw.fadeIn, 0, 120, board.defaults.fadeIn);
  pad.fadeOut = clampNum(raw.fadeOut, 0, 120, board.defaults.fadeOut);
  pad.loop = !!raw.loop;
  pad.trimStart = clampNum(raw.trimStart, 0, 1e5, 0);
  pad.trimEnd = Number.isFinite(raw.trimEnd) && raw.trimEnd > pad.trimStart ? raw.trimEnd : null;
  pad.tap = ['fadeout', 'restart', 'pause', 'overlay', 'ignore'].includes(raw.tap) ? raw.tap : 'fadeout';
  pad.solo = !!raw.solo;
  pad.key = typeof raw.key === 'string' ? raw.key.slice(0, 1) : '';
  pad.duration = clampNum(raw.duration, 0, 1e5, 0);
  return pad;
}

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function clampNum(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}
