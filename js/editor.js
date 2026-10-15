// The two sheets: setting up one pad, and setting up the board.

import { drawGels, toast } from './ui.js';
import { newPad, MAX_COLS, MAX_ROWS } from './model.js';

const el = (id) => document.getElementById(id);

export class PadEditor {
  constructor({ library, onSave, onClear, onLevel, onHear }) {
    this.library = library;
    this.onSave = onSave;
    this.onClear = onClear;
    this.onLevel = onLevel || (() => {});
    this.onHear = onHear || (() => {});
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
    el('padHear').addEventListener('click', () => {
      if (this.state && this.state.pad.file) this.onHear(this.state.pad.file);
    });
    el('padKey').addEventListener('input', (e) => {
      e.target.value = e.target.value.trim().slice(0, 1).toLowerCase();
    });
    // Enter in the name or the key saves, as a form does. Anywhere else it
    // belongs to what has the focus: Cancel cancels, a gel is picked, a
    // number field keeps it.
    this.dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('input[type=text]')) {
        e.preventDefault();
        this.save();
      }
    });
  }

  open(board, i) {
    const pad = board.pads[i] ? { ...board.pads[i] } : newPad(board, i, '');
    this.state = { board, i, pad };

    const missing = !!pad.file && !this.library.has(pad.file);
    el('padFileName').textContent = pad.file ? pad.file.split('/').pop() : 'No sound on this pad yet';
    el('padFileName').title = pad.file || '';
    el('padFileName').classList.toggle('sheet__title--missing', missing);
    el('padHear').disabled = !pad.file || missing;
    el('padName').value = pad.name;
    el('padName').dataset.auto = pad.name ? '' : '1';
    el('padKey').value = pad.key || '';
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
    });

    this.dlg.showModal();
    el('padName').focus();
  }

  save() {
    const { board, i, pad } = this.state;
    const file = pad.file;
    if (!file) {
      toast('This pad has no sound yet. Put one on it from the folder.');
      return;
    }

    const start = num(el('padStart').value, 0);
    const end = el('padEnd').value === '' ? null : num(el('padEnd').value, 0);

    const next = {
      ...pad,
      file,
      name: el('padName').value.trim(),
      gain: clamp(num(el('padGain').value, 100) / 100, 0, 1),
      fadeIn: clamp(num(el('padFadeIn').value, 0), 0, 120),
      fadeOut: clamp(num(el('padFadeOut').value, 0), 0, 120),
      trimStart: Math.max(0, start),
      trimEnd: end != null && end > start ? end : null,
      loop: el('padLoop').checked,
      tap: el('padTap').value,
      solo: el('padSolo').checked,
      key: el('padKey').value.trim().slice(0, 1).toLowerCase(),
      // What is set here stands, whatever the sound's length turns out to be.
      settled: true,
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


    this.dlg.close();
    this.onSave(i, next);
  }
}

export class SetupSheet {
  constructor({ onApply, onExport, onImport }) {
    this.dlg = el('setup');
    this.onApply = onApply;
    this.board = null;

    // Done and the cross keep what was set; Escape leaves the board as it was.
    const close = () => {
      this.apply();
      this.dlg.close();
    };
    el('setupClose').addEventListener('click', close);
    el('setupDone').addEventListener('click', close);

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
    el('setCols').value = board.cols;
    el('setRows').value = board.rows;
    el('setFadeIn').value = board.defaults.fadeIn;
    el('setFadeOut').value = board.defaults.fadeOut;
    this.dlg.showModal();
  }

  apply() {
    if (!this.board) return;
    this.onApply({
      cols: clamp(num(el('setCols').value, this.board.cols), 1, MAX_COLS),
      rows: clamp(num(el('setRows').value, this.board.rows), 1, MAX_ROWS),
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
