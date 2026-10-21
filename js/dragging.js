// Soundboard — dragging. The gestures that carry a pad or a sound across the
// board: what is under the pointer, what lights up there, the pad in hand.
// What a drop means is app.js's to decide; it gets told through callbacks.

import { refs } from './ui.js';

const PATH_TYPE = 'application/x-soundboard-path';

/** The pad under a node: the pad itself, or the pad whose pencil it is. */
function padOf(node) {
  const pen = node.closest('.pad__pencil');
  if (pen) return refs.grid.querySelector(`.pad[data-i="${pen.dataset.i}"]`);
  return node.closest('.pad');
}

/**
 * Sounds dragged from the tree onto a pad, by HTML5 drag and drop, and a
 * folder dropped anywhere on the window. `onSound(to, path)` gets the pad's
 * place and the sound's path; `onFiles(dataTransfer)` gets what was dropped.
 */
export function wireDrops({ onSound, onFiles }) {
  refs.lib.addEventListener('dragstart', (e) => {
    const item = e.target.closest('.lib__item');
    if (!item) return;
    e.dataTransfer.setData(PATH_TYPE, item.dataset.path);
    e.dataTransfer.setData('text/plain', item.dataset.path);
    e.dataTransfer.effectAllowed = 'copy';
  });

  refs.grid.addEventListener('dragover', (e) => {
    const el = padOf(e.target);
    if (!el || !e.dataTransfer.types.includes(PATH_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    el.classList.add('pad--drop');
  });

  refs.grid.addEventListener('dragleave', (e) => {
    padOf(e.target)?.classList.remove('pad--drop');
  });

  refs.grid.addEventListener('drop', (e) => {
    const el = padOf(e.target);
    if (!el) return;
    e.preventDefault();
    el.classList.remove('pad--drop');
    const path = e.dataTransfer.getData(PATH_TYPE);
    if (path) onSound(Number(el.dataset.i), path);
  });

  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer && e.dataTransfer.types.includes('Files')) e.preventDefault();
  });
  document.addEventListener('drop', (e) => {
    if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    onFiles(e.dataTransfer);
  });
}

/**
 * Dragging a pad somewhere else. Pointer events rather than HTML5 drag and
 * drop, which does not exist under a finger.
 *
 * The whole pad is a handle, under a mouse or a finger: press anywhere but
 * the pencil and move, and the pad comes with you; press and release without
 * moving and it simply plays. While editing, a filled pad does not scroll the
 * board (its touch-action is none); the empty places and the gaps do.
 *
 * `canDrag(i)` says whether the pad at `i` may be picked up now. `onHold(on)`
 * is told when a pad is taken in hand and, once the click that may follow
 * has passed, when it is let go. `onDrop(from, to)` gets the pad's place and
 * where it landed: another pad's place, or `null` for off the board.
 */
export function wirePadDragging({ canDrag, onHold, onDrop }) {
  let drag = null;
  let armed = null;        // pressed, not yet a drag
  const SLOP = 6;          // how far a mouse moves before it means to drag
  const TOUCH_SLOP = 10;   // a finger wobbles more on a tap

  /** Where the pad would land: another pad, or somewhere that takes it off. */
  const at = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return null;
    if (el.closest('#book')) return refs.book;
    if (drag.bar && el.closest('#transport')) return refs.transport;
    const pad = padOf(el);
    return pad && pad !== drag.el ? pad : null;
  };

  const removes = (el) => el === refs.book || el === refs.transport;

  const over = (el) => {
    if (drag.target === el) return;
    drag.target?.classList.remove('pad--drop', 'drop--off');
    drag.target = el;
    drag.target?.classList.add(removes(el) ? 'drop--off' : 'pad--drop');
    drag.ghost.classList.toggle('pad--ghost-off', removes(el));
  };

  const begin = (el, from, e, handle) => {
    const box = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.classList.add('pad--ghost');
    ghost.style.width = `${box.width}px`;
    ghost.style.height = `${box.height}px`;
    ghost.style.transform = `translate(${box.left}px, ${box.top}px)`;
    document.body.append(ghost);

    // Where Browse files shows, the whole bar it sits in takes a pad off.
    const bar = refs.browse.offsetParent !== null;
    drag = { from, el, ghost, bar, dx: e.clientX - box.left, dy: e.clientY - box.top, target: null };
    el.classList.add('pad--dragging');
    // Show where it can be dropped off the board before it gets there.
    refs.book.classList.add('drop--ready');
    refs.transport.classList.toggle('drop--ready', bar);
    onHold(true);                         // the click that follows is not a tap
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      /* without capture the grid's own listeners still see the move */
    }
  };

  const disarm = () => {
    armed = null;
  };

  refs.grid.addEventListener('pointerdown', (e) => {
    disarm();
    const el = e.target.closest('.pad');
    if (!el || e.button > 0) return;
    const from = Number(el.dataset.i);
    if (!canDrag(from)) return;

    armed = { el, from, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType === 'touch' };
  });

  refs.grid.addEventListener('pointermove', (e) => {
    if (!drag) {
      if (!armed || e.pointerId !== armed.id) return;
      const moved = Math.hypot(e.clientX - armed.x, e.clientY - armed.y);
      if (moved < (armed.touch ? TOUCH_SLOP : SLOP)) return;
      const { el, from, touch } = armed;
      armed = null;
      begin(el, from, e, el);
      if (touch && navigator.vibrate) navigator.vibrate(12);
    }
    drag.ghost.style.transform = `translate(${e.clientX - drag.dx}px, ${e.clientY - drag.dy}px)`;
    over(at(e));
  });

  // Once a pad is in hand the board must hold still under it. The pad's
  // touch-action already says so; this covers a browser that ignores it.
  refs.grid.addEventListener('touchmove', (e) => {
    if (drag) e.preventDefault();
  }, { passive: false });

  const end = (e, drop) => {
    disarm();
    if (!drag) return;
    // A click may follow this pointerup; it belongs to the drag, not the pad.
    setTimeout(() => onHold(false), 0);
    const { from, target } = drag;
    drag.ghost.remove();
    drag.el.classList.remove('pad--dragging');
    refs.book.classList.remove('drop--ready');
    refs.transport.classList.remove('drop--ready');
    target?.classList.remove('pad--drop', 'drop--off');
    drag = null;
    if (!drop || !target) return;
    onDrop(from, removes(target) ? null : Number(target.dataset.i));
  };

  refs.grid.addEventListener('pointerup', (e) => end(e, true));
  refs.grid.addEventListener('pointercancel', (e) => end(e, false));
}
