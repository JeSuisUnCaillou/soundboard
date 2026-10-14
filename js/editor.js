// The two sheets: setting up one pad, and setting up the board.

import { drawGels, drawPadPreview, toast } from './ui.js';
import { newPad, rowCol, rowCount, prettyName, MAX_COLS } from './model.js';

const el = (id) => document.getElementById(id);

export class PadEditor {
  constructor({ library, onSave, onClear, onLevel }) {
    this.library = library;
    this.onSave = onSave;
    this.onClear = onClear;
    this.onLevel = onLevel || (() => {});
    this.dlg = el('padEditor');
    this.state = null;

    el('padClose').addEventListener('click', () => this.dlg.close());
    el('padCancel').addEventListener('click', () => this.dlg.close());
    el('padSave').addEventListener('click', () => this.save());
    el('padClear').addEventListener('click', () => {
      const { i } = this.state;
      this.dlg.close();
      this.onClear(i);
    });

    el('padGain').addEventListener('input', (e) => {
      el('padGainOut').textContent = e.target.value;
      // Hear the level while setting it, if the pad happens to be playing.
      if (this.state) this.onLevel(this.state.i, Number(e.target.value) / 100);
    });
    el('padFileFilter').addEventListener('input', () => this.fillFiles(el('padFile').value));
    el('padFile').addEventListener('change', () => {
      this.suggestName();
      this.preview();
    });
    // What the pad will look like, drawn as it is typed.
    for (const id of ['padCue', 'padName', 'padNote', 'padKey']) {
      el(id).addEventListener('input', () => this.preview());
    }
    el('padFile').addEventListener('dblclick', () => this.save());
    el('padKey').addEventListener('input', (e) => {
      e.target.value = e.target.value.trim().slice(0, 1).toLowerCase();
      this.preview();
    });
    this.dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'SELECT' && e.target.type !== 'number') {
        e.preventDefault();
        this.save();
      }
    });
  }

  open(board, i) {
    const { row, col } = rowCol(board, i);
    const pad = board.pads[i] ? { ...board.pads[i] } : newPad(board, i, '');
    this.state = { board, i, pad };

    el('padWhere').textContent = `· row ${row + 1}, column ${col + 1}`;
    el('padRow').value = row + 1;
    el('padRow').max = rowCount(board);
    el('padCol').value = col + 1;
    el('padCol').max = board.cols;
    el('padFileFilter').value = '';
    this.fillFiles(pad.file);
    el('padCue').value = pad.cue;
    el('padName').value = pad.name;
    el('padName').dataset.auto = pad.name ? '' : '1';
    el('padKey').value = pad.key || '';
    el('padNote').value = pad.note;
    el('padGain').value = Math.round((pad.gain ?? 1) * 100);
    el('padGainOut').textContent = String(Math.round((pad.gain ?? 1) * 100));
    el('padFadeIn').value = pad.fadeIn;
    el('padFadeOut').value = pad.fadeOut;
    el('padStart').value = pad.trimStart || 0;
    el('padEnd').value = pad.trimEnd == null ? '' : pad.trimEnd;
    el('padLoop').checked = pad.loop;
    el('padTap').value = pad.tap;
    el('padSolo').checked = pad.solo;
    el('padClear').hidden = !board.pads[i];
    drawGels(el('padGels'), pad.gel, (id) => {
      this.state.pad.gel = id;
      this.preview();
    });
    this.preview();

    this.dlg.showModal();
    (pad.file ? el('padCue') : el('padFileFilter')).focus();
  }

  preview() {
    const { pad } = this.state;
    drawPadPreview(el('padPreview'), {
      ...pad,
      file: el('padFile').value || pad.file,
      cue: el('padCue').value.trim(),
      name: el('padName').value.trim() || prettyName(el('padFile').value || pad.file || ''),
      note: el('padNote').value.trim(),
      key: el('padKey').value.trim(),
    });
  }

  fillFiles(selected) {
    const needle = el('padFileFilter').value.trim().toLowerCase();
    const select = el('padFile');
    select.replaceChildren();
    const groups = new Map();
    for (const entry of this.library.list) {
      if (needle && !entry.path.toLowerCase().includes(needle)) continue;
      const key = entry.dir || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }
    // A file set on the pad but missing from the folder still has to be visible.
    if (selected && !this.library.has(selected)) {
      const opt = new Option(`${selected} — missing from this folder`, selected, false, true);
      select.append(opt);
    }
    for (const [dir, entries] of groups) {
      const host = dir ? document.createElement('optgroup') : select;
      if (dir) host.label = dir;
      for (const entry of entries) {
        host.append(new Option(entry.name, entry.path, false, entry.path === selected));
      }
      if (dir) select.append(host);
    }
    if (!select.value && selected) select.value = selected;
  }

  suggestName() {
    const path = el('padFile').value;
    const name = el('padName');
    if (path && (!name.value.trim() || name.dataset.auto === '1')) {
      name.value = prettyName(path);
      name.dataset.auto = '1';
    }
  }

  save() {
    const { board, i, pad } = this.state;
    const file = el('padFile').value;
    if (!file) {
      toast('Pick a sound for this pad first.');
      el('padFileFilter').focus();
      return;
    }

    const start = num(el('padStart').value, 0);
    const end = el('padEnd').value === '' ? null : num(el('padEnd').value, 0);

    const next = {
      ...pad,
      file,
      name: el('padName').value.trim() || prettyName(file),
      cue: el('padCue').value.trim(),
      note: el('padNote').value.trim(),
      gain: clamp(num(el('padGain').value, 100) / 100, 0, 1),
      fadeIn: clamp(num(el('padFadeIn').value, 0), 0, 120),
      fadeOut: clamp(num(el('padFadeOut').value, 0), 0, 120),
      trimStart: Math.max(0, start),
      trimEnd: end != null && end > start ? end : null,
      loop: el('padLoop').checked,
      tap: el('padTap').value,
      solo: el('padSolo').checked,
      key: el('padKey').value.trim().slice(0, 1).toLowerCase(),
    };
    if (end != null && end <= start) toast('The stop point has to come after the start point, so it was cleared.');

    // Two pads on one key would make the board unpredictable under the hand.
    if (next.key) {
      const clash = board.pads.findIndex((p, j) => p && j !== i && p.key === next.key);
      if (clash !== -1) {
        board.pads[clash] = { ...board.pads[clash], key: '' };
        toast(`${next.key.toUpperCase()} was taken, so it moved to this pad.`);
      }
    }

    if (next.file !== pad.file) next.duration = 0;
    el('padName').dataset.auto = '';

    // Moving a pad by typing its row and column: the drag that does the same
    // thing with a mouse has no equivalent under a finger.
    const row = clamp(num(el('padRow').value, 0), 1, rowCount(board)) - 1;
    const col = clamp(num(el('padCol').value, 0), 1, board.cols) - 1;
    const moveTo = row * board.cols + col;

    this.dlg.close();
    this.onSave(i, next, moveTo === i ? null : moveTo);
  }
}

export class SetupSheet {
  constructor({ onApply, onExport, onImport }) {
    this.dlg = el('setup');
    this.onApply = onApply;
    this.board = null;

    const close = () => {
      this.apply();
      this.dlg.close();
    };
    el('setupClose').addEventListener('click', close);
    el('setupDone').addEventListener('click', close);
    this.dlg.addEventListener('close', () => this.apply());

    el('btnExport').addEventListener('click', onExport);
    el('btnImport').addEventListener('click', () => el('importFile').click());
    el('importFile').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      this.board = null; // the sheet's fields describe the board being replaced
      this.dlg.close();
      await onImport(file);
    });
  }

  open(board) {
    this.board = board;
    el('setBoardName').value = board.name;
    el('setCols').value = board.cols;
    el('setFadeIn').value = board.defaults.fadeIn;
    el('setFadeOut').value = board.defaults.fadeOut;
    this.dlg.showModal();
  }

  apply() {
    if (!this.board) return;
    this.onApply({
      name: el('setBoardName').value.trim() || this.board.name,
      cols: clamp(num(el('setCols').value, this.board.cols), 1, MAX_COLS),
      fadeIn: clamp(num(el('setFadeIn').value, 0), 0, 120),
      fadeOut: clamp(num(el('setFadeOut').value, 0), 0, 120),
    });
  }
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
