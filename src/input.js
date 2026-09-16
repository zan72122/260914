// input.js -- one finger, and one finger only.
//
// The first pointer to go down owns the gesture until it goes up or is
// cancelled. Every other pointer is ignored outright, so a four year old
// resting a palm on the iPad cannot break anything. pointercancel is treated
// as a safe release: the handler is told the gesture was aborted so it can put
// the cloth back where it was.

import { alongIn } from './layout.js';

function prevent(e) { e.preventDefault(); }

export class Input {
  constructor(canvas, getWorld) {
    this.canvas = canvas;
    this.getWorld = getWorld;
    this.activeId = null;
    this.handlers = { down: null, move: null, up: null, cancel: null, firstTouch: null };
    this._firstTouchDone = false;

    // Reused payload object: no allocation on the hot move path.
    this.p = {
      x: 0, y: 0, x0: 0, y0: 0, dx: 0, dy: 0,
      vx: 0, vy: 0, along: 0, alongStep: 0, dt: 0, cancelled: false,
    };
    this._lastX = 0; this._lastY = 0; this._lastT = 0;
    this._prevAlong = 0;
    this._xy = { x: 0, y: 0 };

    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);
    this._cancel = this._cancel.bind(this);

    this._abort = this._abort.bind(this);

    canvas.addEventListener('pointerdown', this._down, { passive: false });
    canvas.addEventListener('pointermove', this._move, { passive: false });
    window.addEventListener('pointerup', this._up, { passive: false });
    window.addEventListener('pointercancel', this._cancel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Safari's own two-finger zoom gesture, on the document rather than the
    // canvas: by the time it reaches an element it is already under way, and
    // it has to be marked non-passive or the preventDefault is ignored.
    document.addEventListener('gesturestart', prevent, { passive: false });
    document.addEventListener('gesturechange', prevent, { passive: false });

    // --- all the ways mobile Safari takes the finger away -----------------
    // The notification shade, the app switcher, an incoming call, the URL bar
    // sliding back in: any of these can leave a pointerdown with no matching
    // pointerup, and the cloth stuck to a finger that is not there any more.
    // Every one of them is treated as a cancel, which puts the washing back.
    canvas.addEventListener('lostpointercapture', this._abort);
    window.addEventListener('blur', this._abort);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._abort();
    });

    // The canvas fills the viewport and only moves when the viewport does.
    this._rect = null;
    window.addEventListener('resize', () => { this._rect = null; });
    window.addEventListener('scroll', () => { this._rect = null; });
  }

  /**
   * Drop the active pointer as if it had been cancelled.
   *
   * Public: a rotation has to be able to let go of the cloth before the world
   * is rebuilt under it.
   */
  abort() { this._abort(); }

  _abort() {
    if (this.activeId === null) return;
    const id = this.activeId;
    this.activeId = null;
    try { this.canvas.releasePointerCapture(id); } catch (err) { /* ignore */ }
    const p = this.p;
    p.cancelled = true;
    if (this.handlers.cancel) this.handlers.cancel(p);
  }

  on(name, fn) { this.handlers[name] = fn; }

  /**
   * Viewport point -> canvas point, without a layout read per pointermove.
   *
   * getBoundingClientRect forces a style/layout flush, and on a pointermove
   * that is running at the screen's refresh rate that is the most expensive
   * thing in the input path. The canvas is `position: fixed` at 0,0 and the
   * size of the viewport, so the rect only changes when the viewport does --
   * cache it and drop the cache on resize.
   */
  _pos(e, out) {
    if (!this._rect) this._rect = this.canvas.getBoundingClientRect();
    const r = this._rect;
    out.x = e.clientX - r.left;
    out.y = e.clientY - r.top;
    return out;
  }

  _down(e) {
    e.preventDefault();
    if (!this._firstTouchDone) {
      this._firstTouchDone = true;
      if (this.handlers.firstTouch) this.handlers.firstTouch();
    }
    if (this.activeId !== null) return; // second finger: ignored
    this.activeId = e.pointerId;
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const { x, y } = this._pos(e, this._xy);
    const p = this.p;
    p.x = p.x0 = this._lastX = x;
    p.y = p.y0 = this._lastY = y;
    p.dx = p.dy = p.vx = p.vy = p.along = p.alongStep = 0;
    p.cancelled = false;
    this._prevAlong = 0;
    this._lastT = performance.now();
    if (this.handlers.down) this.handlers.down(p);
  }

  _move(e) {
    if (e.pointerId !== this.activeId) return;
    e.preventDefault();
    const { x, y } = this._pos(e, this._xy);
    const world = this.getWorld();
    const now = performance.now();
    const dt = Math.max(1, now - this._lastT) / 1000;
    const p = this.p;
    p.vx = (x - this._lastX) / dt;
    p.vy = (y - this._lastY) / dt;
    p.dt = dt;
    this._lastX = x; this._lastY = y; this._lastT = now;
    p.x = x; p.y = y;
    p.dx = x - p.x0; p.dy = y - p.y0;
    p.along = alongIn(world, p.dx, p.dy);
    p.alongStep = p.along - this._prevAlong;
    this._prevAlong = p.along;
    if (this.handlers.move) this.handlers.move(p);
  }

  _finish(e, cancelled) {
    if (e.pointerId !== this.activeId) return;
    this.activeId = null;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const p = this.p;
    p.cancelled = cancelled;
    if (cancelled) { if (this.handlers.cancel) this.handlers.cancel(p); }
    else if (this.handlers.up) this.handlers.up(p);
  }

  _up(e) { this._finish(e, false); }
  _cancel(e) { this._finish(e, true); }
}
