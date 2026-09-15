import { TAU } from '../core/math.js';

/**
 * A floor is a static offscreen canvas in world coordinates, plus an optional
 * "grime" layer painted on top of it. Clearing debris punches holes in the
 * grime (destination-out) so whatever was painted on the base shows through.
 */
export class Floor {
  constructor(rect) {
    this.rect = rect;                 // {x0,y0,x1,y1} in world units
    this.w = Math.max(1, Math.round(rect.x1 - rect.x0));
    this.h = Math.max(1, Math.round(rect.y1 - rect.y0));
    this.base = makeCanvas(this.w, this.h);
    this.bctx = this.base.getContext('2d');
    this.grime = null;
    this.gctx = null;
    this.grimeDirty = false;
    this.grimeCleared = false;   // true once nothing is left to composite
  }
  enableGrime() {
    this.grime = makeCanvas(this.w, this.h);
    this.gctx = this.grime.getContext('2d');
    this.grimeCleared = false;
    return this.gctx;
  }
  /** Erase a soft circular hole in the grime, in WORLD coordinates. */
  reveal(wx, wy, r) {
    if (!this.gctx) return;
    const x = wx - this.rect.x0, y = wy - this.rect.y0;
    const g = this.gctx;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.9)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.restore();
    this.grimeDirty = true;
  }
  /** Erase the whole grime layer. After this it costs nothing to draw. */
  clearGrime() {
    if (!this.gctx) return;
    this.gctx.clearRect(0, 0, this.w, this.h);
    this.grimeCleared = true;
  }
  draw(ctx) {
    ctx.drawImage(this.base, this.rect.x0, this.rect.y0);
    // a fully erased grime layer is a full-screen no-op composite every frame
    if (this.grime && !this.grimeCleared) ctx.drawImage(this.grime, this.rect.x0, this.rect.y0);
  }
}

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') {
    try { return new OffscreenCanvas(w, h); } catch (_) {}
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
