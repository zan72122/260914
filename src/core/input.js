import { clamp, TAU } from './math.js';

/**
 * Single active pointer only (one finger). Works with real Pointer Events and
 * with synthetic input from the dev harness (window.game.input).
 *
 * Coordinates: CSS pixels relative to the canvas. Synthetic input uses
 * normalized 0..1 screen coords so gestures are device independent.
 */
export class Input {
  constructor() {
    this.down = false;
    this.x = 0; this.y = 0;      // current (css px)
    this.px = 0; this.py = 0;    // previous step
    this.vx = 0; this.vy = 0;    // px/s, smoothed
    this.speed = 0;
    this.heldDuration = 0;       // seconds since pointerdown (0 when up)
    this.sinceUp = 999;
    this.downX = 0; this.downY = 0;
    this.travel = 0;             // distance travelled since down
    this.rub = 0;                // 0..1 back-and-forth energy
    this.circle = 0;             // 0..1 accumulated turning (1 = full loop)
    this.everDown = false;
    this.firstGesture = false;   // set once on the very first real/synthetic down

    this._pending = null;        // {x,y,down}
    this._havePos = false;
    this._dirX = 0; this._dirY = 0;
    this._turn = 0;
    this._rubE = 0;
    this._replay = null;
    this._replayT = 0;
    this._replayI = 0;
    this._onFirst = null;
    this.viewW = 1; this.viewH = 1;
  }

  setViewport(w, h) { this.viewW = w; this.viewH = h; }
  onFirstGesture(fn) { this._onFirst = fn; }

  attach(el) {
    const rect = () => el.getBoundingClientRect();
    const pos = (e) => {
      const r = rect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    el.addEventListener('pointerdown', (e) => {
      if (this.down && e.pointerId !== this._id) return; // single finger only
      this._id = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      const p = pos(e);
      this._pending = { x: p.x, y: p.y, down: true };
      e.preventDefault();
    }, { passive: false });
    el.addEventListener('pointermove', (e) => {
      if (this.down && e.pointerId !== this._id) return;
      const p = pos(e);
      this._pending = { x: p.x, y: p.y, down: this.down || false };
      e.preventDefault();
    }, { passive: false });
    const up = (e) => {
      if (e.pointerId !== this._id) return;
      const p = pos(e);
      this._pending = { x: p.x, y: p.y, down: false };
      this._id = -1;
      e.preventDefault();
    };
    el.addEventListener('pointerup', up, { passive: false });
    el.addEventListener('pointercancel', up, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('gesturestart', (e) => e.preventDefault());
    el.addEventListener('dblclick', (e) => e.preventDefault());
  }

  /** Synthetic pointer in normalized 0..1 screen coords. */
  pointer(nx, ny, down) {
    this._pending = { x: nx * this.viewW, y: ny * this.viewH, down: !!down };
  }

  /** frames: [{t(ms), x, y, down}] in normalized coords; t relative to start. */
  replay(frames) {
    this._replay = frames && frames.length ? frames.slice() : null;
    this._replayT = 0;
    this._replayI = 0;
  }
  get replaying() { return !!this._replay; }

  update(dt) {
    if (this._replay) {
      this._replayT += dt * 1000;
      let f = null;
      while (this._replayI < this._replay.length && this._replay[this._replayI].t <= this._replayT) {
        f = this._replay[this._replayI++];
      }
      if (f) this.pointer(f.x, f.y, f.down);
      if (this._replayI >= this._replay.length) {
        // hold last frame; finish after its timestamp passes
        if (this._replayT > this._replay[this._replay.length - 1].t) this._replay = null;
      }
    }

    const p = this._pending;
    this.px = this.x; this.py = this.y;
    if (p) {
      if (!this._havePos) { this.x = p.x; this.y = p.y; this.px = p.x; this.py = p.y; this._havePos = true; }
      const wasDown = this.down;
      this.x = p.x; this.y = p.y;
      if (p.down && !wasDown) {
        this.heldDuration = 0;
        this.downX = p.x; this.downY = p.y;
        this.travel = 0;
        this.everDown = true;
        if (!this.firstGesture) { this.firstGesture = true; if (this._onFirst) this._onFirst(); }
      }
      this.down = p.down;
      this._pending = null;
    }

    const dx = this.x - this.px, dy = this.y - this.py;
    const instVX = dx / dt, instVY = dy / dt;
    const k = 1 - Math.exp(-18 * dt);
    this.vx += (instVX - this.vx) * k;
    this.vy += (instVY - this.vy) * k;
    this.speed = Math.hypot(this.vx, this.vy);

    if (this.down) { this.heldDuration += dt; this.sinceUp = 0; this.travel += Math.hypot(dx, dy); }
    else { this.heldDuration = 0; this.sinceUp += dt; }

    // direction tracking for rub / circle
    if (this.speed > 90) {
      const nx = this.vx / this.speed, ny = this.vy / this.speed;
      const pdx = this._dirX, pdy = this._dirY;
      if (pdx || pdy) {
        const dot = nx * pdx + ny * pdy;
        const cross = pdx * ny - pdy * nx;
        if (dot < -0.2) this._rubE += 0.55;                 // reversal
        this._turn += Math.atan2(cross, dot);
      }
      this._dirX = nx; this._dirY = ny;
    }
    this._rubE = Math.max(0, this._rubE - dt * 0.8);
    this._turn *= Math.exp(-dt * 0.55);
    this.rub = clamp(this._rubE, 0, 1);
    this.circle = clamp(Math.abs(this._turn) / TAU, 0, 1);
  }

  snapshot() {
    return {
      down: this.down, x: Math.round(this.x), y: Math.round(this.y),
      vx: Math.round(this.vx), vy: Math.round(this.vy),
      held: +this.heldDuration.toFixed(2), rub: +this.rub.toFixed(2), circle: +this.circle.toFixed(2),
      replaying: this.replaying,
    };
  }
}
