// The board: a run of pads, each pointing at a file inside the open folder.
// It is exactly as many rows and columns as it was set to. Index = row * cols +
// col, so changing the column count re-wraps the same pads in the same order.

import { DEFAULT_GEL } from './gels.js';

// Pads used to be handed Bastard Amber by default. Boards from before that
// moved to Daylight Blue follow it rather than keeping a colour nobody picked.
const OLD_DEFAULT_GEL = 'bastard-amber';

export const BOARD_VERSION = 3;
export const MAX_COLS = 12;
export const MAX_ROWS = 12;

// Keys sit under the fingers in the same shape as the pads above them.
const KEY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", '\\'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', '`', '#'],
];

export function newBoard({ id, cols = 3, rows = 4 }) {
  const board = {
    version: BOARD_VERSION,
    id,
    cols: clampInt(cols, 1, MAX_COLS),
    rows: clampInt(rows, 1, MAX_ROWS),
    master: 0.8,
    // Nothing starts or stops on a hard edge unless a pad asks for it.
    defaults: { fadeIn: 1, fadeOut: 1.5 },
    pads: [],
  };
  fitPads(board);
  return board;
}

// Under this, a sound is a hit — a shot, a door, a slap. Above it, it is a cue
// that runs: music, ambience, a recording.
export const SHORT_SOUND = 5;

// Hits keep the default blue; anything that runs comes up green, so a glance
// at the board says which pads will still be making noise in a minute.
const LONG_GEL = 'moss';

/**
 * A sound's length says what it probably is, which settles what the operator
 * would otherwise set by hand: a hit layers when it is tapped again and starts
 * at full level — faded in, a gunshot is not a gunshot — while a cue is green.
 * Only fields still at their untouched default move, a length that could not
 * be read decides nothing, and a pad saved from its sheet is the operator's.
 */
export function applyLengthDefaults(board, pad) {
  if (!pad.duration || pad.settled) return;
  if (pad.duration < SHORT_SOUND) {
    if (pad.tap === 'fadeout') pad.tap = 'overlay';
    if (pad.fadeIn === board.defaults.fadeIn) pad.fadeIn = 0;
  } else if (pad.gel === DEFAULT_GEL) {
    pad.gel = LONG_GEL;
  }
}

/**
 * A pad given a different sound keeps what the operator set on it. On a pad
 * nobody has saved from its sheet, what the old sound's length set goes back
 * to the board's default first, so a cue dropped on a former hit's pad fades
 * out on a second tap, as a cue does.
 */
export function giveSound(board, pad, file, duration) {
  const next = { ...pad, file, duration };
  if (!pad.settled && pad.duration && pad.duration < SHORT_SOUND) {
    if (next.tap === 'overlay') next.tap = 'fadeout';
    if (next.fadeIn === 0) next.fadeIn = board.defaults.fadeIn;
  } else if (!pad.settled && pad.duration && next.gel === LONG_GEL) {
    next.gel = DEFAULT_GEL;
  }
  applyLengthDefaults(board, next);
  return next;
}

// A new pad takes the board's defaults; what the sound is — a hit or a cue —
// is not known until it has been measured, and applyLengthDefaults says so then.
export function newPad(board, i, file) {
  const name = file ? prettyName(file) : '';
  return {
    file: file || '',
    name,
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
    settled: false,
  };
}

/**
 * The board is exactly the size it was set to. Nothing grows it: a board of
 * twelve pads holds twelve sounds, and the thirteenth waits in the folder until
 * there is room for it. Returns how many sounds fell off the end, which only a
 * smaller board can do.
 */
export function fitPads(board) {
  const want = board.cols * board.rows;
  const lost = board.pads.slice(want).filter((pad) => pad && pad.file).length;
  board.pads.length = Math.min(board.pads.length, want);
  while (board.pads.length < want) board.pads.push(null);
  return lost;
}

/** Re-wrap the same pads into a different shape. Returns how many fell off. */
export function resize(board, cols, rows) {
  board.cols = clampInt(cols, 1, MAX_COLS);
  board.rows = clampInt(rows, 1, MAX_ROWS);
  return fitPads(board);
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

export function move(board, from, to) {
  const pads = board.pads;
  [pads[from], pads[to]] = [pads[to], pads[from]];
}

/** What a pad is called: the name given to it, or the file's own. */
export function padTitle(pad) {
  if (!pad) return '';
  return pad.name || prettyName(pad.file || '');
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
    cols: raw.cols,
    rows: raw.rows,
  });
  board.master = clampNum(raw.master, 0, 1, 0.8);
  board.defaults = {
    fadeIn: clampNum(raw.defaults && raw.defaults.fadeIn, 0, 120, 1),
    fadeOut: clampNum(raw.defaults && raw.defaults.fadeOut, 0, 120, 1.5),
  };
  const version = Number(raw.version) || 1;
  raw.pads.forEach((pad, i) => {
    board.pads[i] = pad ? migratePad(board, i, pad, version) : null;
  });
  fitPads(board);
  return board;
}

function migratePad(board, i, raw, version) {
  const pad = newPad(board, i, String(raw.file || ''));
  pad.name = String(raw.name ?? pad.name).slice(0, 40);
  const inherited = version < 2 && raw.gel === OLD_DEFAULT_GEL ? DEFAULT_GEL : raw.gel;
  pad.gel = typeof inherited === 'string' ? inherited : pad.gel;
  pad.gain = clampNum(raw.gain, 0, 1, 1);
  pad.fadeIn = clampNum(raw.fadeIn, 0, 120, board.defaults.fadeIn);
  pad.fadeOut = clampNum(raw.fadeOut, 0, 120, board.defaults.fadeOut);
  pad.loop = !!raw.loop;
  pad.trimStart = clampNum(raw.trimStart, 0, 1e5, 0);
  pad.trimEnd = Number.isFinite(raw.trimEnd) && raw.trimEnd > pad.trimStart ? raw.trimEnd : null;
  pad.tap = ['fadeout', 'restart', 'pause', 'overlay', 'ignore'].includes(raw.tap) ? raw.tap : 'fadeout';
  pad.solo = !!raw.solo;
  pad.key = typeof raw.key === 'string' ? raw.key.slice(0, 1).toLowerCase() : '';
  pad.duration = clampNum(raw.duration, 0, 1e5, 0);
  pad.settled = !!raw.settled;
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
