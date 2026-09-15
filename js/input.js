// input.js — Pointer Events: tap / drag / zoom (docs/01.md 4.3).
// One gesture = one result. No double tap, no multi-finger requirement, no long press.

import { springBack, wiggle } from './fx.js';

export const DRAG_THRESHOLD = 8;   // px (docs 2.7)

/** iOS/Safari hardening: no double-tap zoom, no callout, no rubber-band. */
export function hardenGestures(root = document) {
  const stop = (e) => e.preventDefault();
  root.addEventListener('gesturestart', stop, { passive: false });
  root.addEventListener('gesturechange', stop, { passive: false });
  root.addEventListener('gestureend', stop, { passive: false });
  root.addEventListener('contextmenu', stop, { passive: false });
  root.addEventListener('dblclick', stop, { passive: false });
  root.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  let lastTouch = 0;
  root.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouch < 350) e.preventDefault();
    lastTouch = now;
  }, { passive: false });
  root.addEventListener('dragstart', stop, { passive: false });
}

export class InputController {
  constructor(board) {
    this.board = board;
    this.active = null;
    board.tilesEl.addEventListener('pointerdown', this.onDown, { passive: false });
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp, { passive: false });
    window.addEventListener('pointercancel', this.onUp, { passive: false });
  }

  boardPoint(e) {
    const b = this.board.boardEl.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }

  onDown = (e) => {
    if (this.active) return;
    const el = e.target.closest?.('.tile');
    if (!el) return;
    const tile = this.board.tiles.get(el.dataset.tile);
    if (!tile) return;
    const at = this.board.locate(tile.id);
    if (!at) return;
    const stack = this.board.stack(at.r, at.c);
    if (stack[stack.length - 1] !== tile.id) return;   // only the top tile is grabbable

    e.preventDefault();
    this.active = {
      tile, at, pointerId: e.pointerId,
      sx: e.clientX, sy: e.clientY,
      dragging: false,
      portal: e.target.closest?.('[data-portal]') || null
    };
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
  };

  onMove = (e) => {
    const a = this.active;
    if (!a || e.pointerId !== a.pointerId) return;
    const dx = e.clientX - a.sx;
    const dy = e.clientY - a.sy;
    if (!a.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      a.dragging = true;
      a.tile.el.classList.add('dragging');
    }
    e.preventDefault();
    a.tile.el.style.transform = a.tile.dragTransform(dx, dy);
    const p = this.boardPoint(e);
    const cell = this.board.cellAtPoint(p.x, p.y);
    a.dropCell = cell;
    this.board.highlight(this.dropAllowed(a, cell) ? cell : null);
  };

  onUp = (e) => {
    const a = this.active;
    if (!a || e.pointerId !== a.pointerId) return;
    this.active = null;
    this.board.highlight(null);
    a.tile.el.classList.remove('dragging');
    try { a.tile.el.releasePointerCapture(e.pointerId); } catch (_) {}

    if (!a.dragging) { this.handleTap(a); return; }

    const p = this.boardPoint(e);
    const cell = this.board.cellAtPoint(p.x, p.y);
    const from = a.tile.el.style.transform;

    // G3: a zoomed tile dragged out of its own frame zooms back out; it never moves.
    if (a.tile.zoom > 0) {
      const home = this.board.locate(a.tile.id);
      if (!cell || cell.r !== home.r || cell.c !== home.c) a.tile.zoomOut();
      springBack(a.tile.el, from, a.tile.restTransform());
      return;
    }

    if (!cell) { springBack(a.tile.el, from, a.tile.restTransform()); return; }

    const home = this.board.locate(a.tile.id);
    if (cell.r === home.r && cell.c === home.c) {
      springBack(a.tile.el, from, a.tile.restTransform());
      return;
    }

    if (this.board.isEmpty(cell.r, cell.c)) {
      this.board.moveTo(a.tile.id, cell.r, cell.c);
      wiggle(a.tile.el, 2, 260);
      return;
    }

    const top = this.board.topAt(cell.r, cell.c);
    if (top && top.hole && this.board.slideUnder(a.tile.id, cell.r, cell.c)) {
      wiggle(top.el, 2, 260);
      return;
    }

    springBack(a.tile.el, from, a.tile.restTransform());   // rule 5: no failure state
  };

  dropAllowed(a, cell) {
    if (!cell) return false;
    if (a.tile.zoom > 0) return false;
    const home = this.board.locate(a.tile.id);
    if (cell.r === home.r && cell.c === home.c) return false;
    if (this.board.isEmpty(cell.r, cell.c)) return true;
    const top = this.board.topAt(cell.r, cell.c);
    return !!(top && top.hole);
  }

  handleTap(a) {
    if (a.portal && a.tile.zoom < a.tile.maxZoom) {
      a.tile.zoomIn().then(() => this.board.changed({ type: 'zoom', tile: a.tile.id }));
      return;
    }
    wiggle(a.tile.el, 2, 220);
  }
}
