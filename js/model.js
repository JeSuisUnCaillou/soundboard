// The board: a grid of pads, each pointing at a file inside the open folder.
// Pads are held in one array, row by row, so index = row * cols + col.

import { DEFAULT_GEL, gelForIndex } from './gels.js';

export const BOARD_VERSION = 1;
export const MAX_ROWS = 10;
export const MAX_COLS = 12;

// Keys sit under the fingers in the same shape as the pads above them.
const KEY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", '\\'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', '`', '#'],
];

export function newBoard({ id, name, rows = 4, cols = 5 }) {
  const board = {
    version: BOARD_VERSION,
    id,
    name: name || id,
    rows: clampInt(rows, 1, MAX_ROWS),
    cols: clampInt(cols, 1, MAX_COLS),
    master: 0.8,
    defaults: { fadeIn: 0, fadeOut: 1.5 },
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
    gel: file ? gelForIndex(i) : DEFAULT_GEL,
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

export function fitPads(board) {
  const want = board.rows * board.cols;
  while (board.pads.length < want) board.pads.push(null);
  board.pads.length = want;
  return board;
}

/** Resize keeping each pad at its row and column. Returns how many fell off. */
export function resize(board, rows, cols) {
  const r2 = clampInt(rows, 1, MAX_ROWS);
  const c2 = clampInt(cols, 1, MAX_COLS);
  const pads = new Array(r2 * c2).fill(null);
  let dropped = 0;
  for (let r = 0; r < board.rows; r += 1) {
    for (let c = 0; c < board.cols; c += 1) {
      const pad = board.pads[r * board.cols + c];
      if (!pad) continue;
      if (r < r2 && c < c2) pads[r * c2 + c] = pad;
      else dropped += 1;
    }
  }
  board.rows = r2;
  board.cols = c2;
  board.pads = pads;
  return dropped;
}

/** How many pads would be lost by resizing to this shape. */
export function wouldDrop(board, rows, cols) {
  let dropped = 0;
  for (let r = 0; r < board.rows; r += 1) {
    for (let c = 0; c < board.cols; c += 1) {
      if (board.pads[r * board.cols + c] && (r >= rows || c >= cols)) dropped += 1;
    }
  }
  return dropped;
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
    rows: raw.rows,
    cols: raw.cols,
  });
  board.master = clampNum(raw.master, 0, 1, 0.8);
  board.defaults = {
    fadeIn: clampNum(raw.defaults && raw.defaults.fadeIn, 0, 120, 0),
    fadeOut: clampNum(raw.defaults && raw.defaults.fadeOut, 0, 120, 1.5),
  };
  raw.pads.slice(0, board.pads.length).forEach((pad, i) => {
    board.pads[i] = pad ? migratePad(board, i, pad) : null;
  });
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
