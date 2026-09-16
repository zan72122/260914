import { TAU } from '../core/math.js';

/**
 * A floor is a static offscreen canvas in world coordinates, plus an optional
 * "grime" layer painted on top of it. Clearing debris punches holes in the
 * grime (destination-out) so whatever was painted on the base shows through.
 */
export class Floor {
  constructor(rect) {
    this.rect = rect;                 // {x0,y0,x1,y1} in world units
    this.baseRect = rect;             // the base may be GROWN past it, see growBase
    this.w = Math.max(1, Math.round(rect.x1 - rect.x0));
    this.h = Math.max(1, Math.round(rect.y1 - rect.y0));
    this.base = makeCanvas(this.w, this.h);
    this.bctx = this.base.getContext('2d');
    this.grime = null;
    this.gctx = null;
    this.grimeDirty = false;
    this.grimeCleared = false;   // true once nothing is left to composite
    /**
     * Smoothing for the two composites. The base usually has plank edges in it
     * and wants the filter; a grime layer is soft dust, and on a software
     * rasteriser the bilinear filter of that one full-screen ALPHA blit is
     * dearer than everything it is smoothing — so a scene whose grime is
     * nothing but soft blobs should turn it off.
     */
    this.smoothBase = true;
    this.smoothGrime = true;
  }

  /**
   * Grow the BASE canvas to a bigger rectangle, keeping what is already on it.
   *
   * This is how a scene folds its static set — walls, a skirting board, a mat,
   * a chair — into the floor it is standing on: one opaque blit instead of the
   * floor plus a screenful of gradient fills every frame. The grime layer is
   * deliberately NOT grown: it is the expensive one (alpha), and it only has to
   * cover the part of the floor that can actually be wiped.
   *
   * Returns the base context, translated into WORLD coordinates so the caller
   * can paint straight into it.
   */
  growBase(rect) {
    const r = {
      x0: Math.min(rect.x0, this.baseRect.x0), y0: Math.min(rect.y0, this.baseRect.y0),
      x1: Math.max(rect.x1, this.baseRect.x1), y1: Math.max(rect.y1, this.baseRect.y1),
    };
    const w = Math.max(1, Math.round(r.x1 - r.x0));
    const h = Math.max(1, Math.round(r.y1 - r.y0));
    const canvas = makeCanvas(w, h);
    const g = canvas.getContext('2d');
    g.drawImage(this.base, this.baseRect.x0 - r.x0, this.baseRect.y0 - r.y0);
    this.base = canvas;
    this.bctx = g;
    this.baseRect = r;
    this.bw = w; this.bh = h;
    g.save();
    g.translate(-r.x0, -r.y0);
    return g;
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
    if (!this.smoothBase) ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, this.baseRect.x0, this.baseRect.y0);
    // a fully erased grime layer is a full-screen no-op composite every frame
    if (this.grime && !this.grimeCleared) {
      ctx.imageSmoothingEnabled = !!this.smoothGrime;
      ctx.drawImage(this.grime, this.rect.x0, this.rect.y0);
    }
    ctx.imageSmoothingEnabled = true;
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
