// The board: a grid of pads, each pointing at a file inside the open folder.
// It is exactly as many rows and columns as it was set to. Index = row * cols +
// col; a resize keeps every pad at its row and column. What was set on a pad
// belongs to its sound: a sound that leaves the board is remembered with its
// settings, and comes back with them.

import { DEFAULT_GEL } from './gels.js';

// Pads used to be handed Bastard Amber by default. Boards from before that
// moved to Daylight Blue follow it rather than keeping a colour nobody picked.
const OLD_DEFAULT_GEL = 'bastard-amber';

// Bundled sounds that ship under a new name. A board saved with the old one
// plays the same sound under its new name rather than a pad struck through.
const RENAMED = new Map([['default/crickets ambiance.wav', 'default/crickets.mp3']]);

export const BOARD_VERSION = 3;
export const MAX_COLS = 12;
export const MAX_ROWS = 12;

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
    // Sounds that left the board, by path, each with the pad it had and, if a
    // resize took it off, the row and column it had: { pad, row?, col? }.
    remembered: {},
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
    duration: 0,
    settled: false,
  };
}

/**
 * The board is exactly the size it was set to. Nothing grows it: a board of
 * twelve pads holds twelve sounds, and the thirteenth waits in the folder until
 * there is room for it.
 */
export function fitPads(board) {
  const want = board.cols * board.rows;
  board.pads.length = Math.min(board.pads.length, want);
  while (board.pads.length < want) board.pads.push(null);
}

/**
 * A new shape, every pad at the row and column it had: a wider board gains
 * empty pads on the right, a taller one at the bottom. A pad with no place left
 * is remembered with its place, and a later resize that has room for that
 * place again puts it back as it was, if nothing has been put there since.
 * Returns the pads that came off, in reading order, and how many came back.
 */
export function resize(board, cols, rows) {
  const was = board.cols;
  const old = board.pads;
  board.cols = clampInt(cols, 1, MAX_COLS);
  board.rows = clampInt(rows, 1, MAX_ROWS);
  board.pads = [];
  fitPads(board);
  const lost = [];
  old.forEach((pad, i) => {
    if (!pad) return;
    const row = Math.floor(i / was);
    const col = i % was;
    if (row < board.rows && col < board.cols) board.pads[row * board.cols + col] = pad;
    else if (pad.file) {
      lost.push(pad);
      remember(board, pad, { row, col });
    }
  });

  const onBoard = new Set(filled(board).map(({ pad }) => pad.file));
  let back = 0;
  for (const [path, { pad, row, col }] of Object.entries(board.remembered)) {
    if (row === undefined || row >= board.rows || col >= board.cols || onBoard.has(path)) continue;
    const i = row * board.cols + col;
    if (board.pads[i] && board.pads[i].file) continue;
    board.pads[i] = pad;
    delete board.remembered[path];
    onBoard.add(path);
    back += 1;
  }
  return { lost, back };
}

/**
 * A sound leaving the board takes nothing with it: what was set on its pad is
 * kept under its path, to come back when the sound does (`recall`). `place` is
 * the row and column a resize took it off from.
 */
export function remember(board, pad, place = {}) {
  board.remembered[pad.file] = { pad: { ...pad }, ...place };
}

/** An emptied board is empty: growing it later puts nothing back by itself. */
export function forgetPlaces(board) {
  for (const kept of Object.values(board.remembered)) {
    delete kept.row;
    delete kept.col;
  }
}

/** What a sound had on its last pad, if it has been on one: taken back, once. */
export function recall(board, path) {
  const kept = board.remembered[path];
  if (!kept) return null;
  delete board.remembered[path];
  return { ...kept.pad, file: path };
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

/**
 * A pad's length or time left. Under a second it is given in tenths: a 0.6 s
 * whistle that reads "0:00" looks like a pad with nothing on it. Rounded up,
 * so a sound still playing never reads as over.
 */
export function fmtLength(seconds) {
  if (Number.isFinite(seconds) && seconds >= 0 && seconds < 1) {
    return `${(Math.max(1, Math.ceil(seconds * 10 - 1e-9)) / 10).toFixed(1)}s`;
  }
  return fmtTime(seconds);
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
  const remembered = raw.remembered && typeof raw.remembered === 'object' ? raw.remembered : {};
  for (const kept of Object.values(remembered)) {
    if (!kept || !kept.pad || !kept.pad.file) continue;
    const pad = migratePad(board, 0, kept.pad, version);
    const place = Number.isInteger(kept.row) && Number.isInteger(kept.col) && kept.row >= 0 && kept.col >= 0
      ? { row: kept.row, col: kept.col }
      : {};
    remember(board, pad, place);
  }
  return board;
}

function migratePad(board, i, raw, version) {
  const file = String(raw.file || '');
  const pad = newPad(board, i, RENAMED.get(file) || file);
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
