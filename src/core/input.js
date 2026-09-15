/**
 * input.js — PointerInput: normalised pointer events with a single-finger lock.
 *
 * Contract (DESIGN §5.5.7 "共通の寛容規約"):
 *   - Only ONE pointer is ever active. The first pointerId wins; the rest are ignored.
 *   - `pointercancel` is delivered exactly like `pointerup`.
 *   - Coordinates are css px relative to the canvas.
 *
 * @typedef {Object} Pointer
 * @property {number} id, @property {number} x, @property {number} y
 * @property {number} dx, @property {number} dy, @property {number} t
 * @property {boolean} primary
 */

export class PointerInput {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{onDown:(p:Pointer)=>void,onMove:(p:Pointer)=>void,onUp:(p:Pointer)=>void,onFirstDown?:()=>void}} handlers
   */
  constructor(canvas, handlers) {
    this.canvas = canvas;
    this.h = handlers || {};
    this.lockId = null;
    this.last = null;
    this.down = false;
    this._unlocked = false;
    this._bound = [];
    this._attach();
  }

  _pt(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _attach() {
    const add = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this._bound.push([target, type, fn, opts]);
    };
    const c = this.canvas;

    add(c, 'pointerdown', (e) => {
      if (this.lockId !== null) return;               // single-finger lock
      this.lockId = e.pointerId;
      this.down = true;
      const q = this._pt(e);
      const p = { id: e.pointerId, x: q.x, y: q.y, dx: 0, dy: 0, t: performance.now(), primary: true };
      this.last = p;
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (!this._unlocked) { this._unlocked = true; if (this.h.onFirstDown) this.h.onFirstDown(); }
      if (this.h.onDown) this.h.onDown(p);
      e.preventDefault();
    }, { passive: false });

    add(c, 'pointermove', (e) => {
      if (e.pointerId !== this.lockId) return;
      const q = this._pt(e);
      const prev = this.last || { x: q.x, y: q.y };
      const p = { id: e.pointerId, x: q.x, y: q.y, dx: q.x - prev.x, dy: q.y - prev.y, t: performance.now(), primary: true };
      this.last = p;
      if (this.h.onMove) this.h.onMove(p);
      e.preventDefault();
    }, { passive: false });

    const end = (e) => {
      if (e.pointerId !== this.lockId) return;
      const q = this._pt(e);
      const prev = this.last || { x: q.x, y: q.y };
      const p = { id: e.pointerId, x: q.x, y: q.y, dx: q.x - prev.x, dy: q.y - prev.y, t: performance.now(), primary: true };
      this.last = p;
      this.lockId = null;
      this.down = false;
      try { c.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (this.h.onUp) this.h.onUp(p);
      e.preventDefault();
    };
    add(c, 'pointerup', end, { passive: false });
    add(c, 'pointercancel', end, { passive: false });   // iOS scroll-intent cancel == up
    add(window, 'blur', () => {
      if (this.lockId === null) return;
      const p = { ...this.last, dx: 0, dy: 0, t: performance.now() };
      this.lockId = null; this.down = false;
      if (this.h.onUp) this.h.onUp(p);
    });
  }

  /** force-release the current finger (scene change, pause) */
  release() {
    if (this.lockId === null) return;
    const p = this.last ? { ...this.last, dx: 0, dy: 0, t: performance.now() } : null;
    this.lockId = null; this.down = false;
    if (p && this.h.onUp) this.h.onUp(p);
  }

  destroy() {
    for (const [t, type, fn, opts] of this._bound) t.removeEventListener(type, fn, opts);
    this._bound.length = 0;
  }
}
