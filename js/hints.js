// hints.js — "the world moves when the hand stops" (docs/01.md 2.6, 4.7).
// 15s idle: the supplying tile floats 2px and the receiving target brightens.
// 45s idle: the supplying tile also leans 6px toward the receiving side.
// No arrows, no pointing hands, no text. Any input resets the timers.

import { bob, lean, glow, stop } from './fx.js';

const FIRST_MS = 15000;
const SECOND_MS = 45000;

export class HintController {
  constructor(board, runner) {
    this.board = board;
    this.runner = runner;
    this.anims = [];
    this.timers = [];
    const reset = () => this.reset();
    window.addEventListener('pointerdown', reset, { passive: true, capture: true });
    window.addEventListener('pointerup', reset, { passive: true, capture: true });
    document.addEventListener('board:changed', reset);
    document.addEventListener('puzzle:solved', reset);
    document.addEventListener('game:restart', reset);
    this.reset();
  }

  reset() {
    this.clearAnims();
    for (const t of this.timers) clearTimeout(t);
    this.timers = [
      setTimeout(() => this.show(1), FIRST_MS),
      setTimeout(() => this.show(2), SECOND_MS)
    ];
  }

  clearAnims() {
    for (const a of this.anims) stop(a);
    this.anims = [];
  }

  stopAll() {
    this.clearAnims();
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  show(level) {
    this.clearAnims();
    if (this.board.busy || document.body.classList.contains('ending')) return;
    const spec = this.runner.currentHint();
    if (!spec) return;
    const tile = this.board.tiles.get(spec.supply);
    if (!tile) return;

    for (const [id, layerName] of spec.glow || []) {
      const t = this.board.tiles.get(id);
      const el = t && t.layer(layerName);
      if (el) this.anims.push(glow(el));
    }

    if (level < 2) {
      this.anims.push(bob(tile.el, 2));
      return;
    }
    const d = this.direction(spec);
    this.anims.push(lean(tile.el, d.x, d.y));
  }

  /** 6px toward the receiving cell (or out of the board for a zoom-out nudge). */
  direction(spec) {
    const at = this.board.locate(spec.supply);
    if (!at) return { x: 0, y: 0 };
    const from = this.board.cellGeom(at.r, at.c);
    if (spec.pullOut) {
      // G3: drag me out of my frame — lean away from the middle of the board
      const b = this.board.boardEl.getBoundingClientRect();
      const cx = from.x + from.size / 2 - b.width / 2;
      const cy = from.y + from.size / 2 - b.height / 2;
      const n = Math.hypot(cx, cy) || 1;
      return { x: (cx / n) * 6, y: (cy / n) * 6 };
    }
    if (!spec.target) return { x: 0, y: -6 };
    const to = this.board.cellGeom(spec.target.r, spec.target.c);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const n = Math.hypot(dx, dy) || 1;
    return { x: (dx / n) * 6, y: (dy / n) * 6 };
  }
}
