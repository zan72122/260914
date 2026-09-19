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
    this.gscale = 1;             // grime layer resolution, see enableGrime({scale})
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
   * Returns the base context, save()d and translated into WORLD coordinates so
   * the caller can paint straight into it; restore() it when you are done.
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
  /**
   * Turn the grime layer on and return its context, in WORLD coordinates.
   *
   *   floor.enableGrime();                // full resolution
   *   floor.enableGrime({ scale: 0.5 });  // half-res: a quarter of the pixels
   *
   * `scale` makes the layer smaller than the floor and stretches it back over
   * it on the way to the screen. Grime is soft dust with no edges in it, so
   * half-res is invisible and buys a real frame or two on a big canvas: the
   * layer is the one full-screen ALPHA composite in most rooms, and alpha is
   * what a software rasteriser charges for. Pair it with
   * `floor.smoothGrime = false` unless the upscale actually shows.
   *
   * The context is pre-scaled, so `reveal()` and everything a scene paints into
   * it keep working in world units and nothing else has to know.
   */
  enableGrime(opts) {
    const sc = opts && opts.scale ? Math.max(0.1, Math.min(1, opts.scale)) : 1;
    this.gscale = sc;
    this.gw = Math.max(1, Math.round(this.w * sc));
    this.gh = Math.max(1, Math.round(this.h * sc));
    this.grime = makeCanvas(this.gw, this.gh);
    this.gctx = this.grime.getContext('2d');
    if (sc !== 1) this.gctx.scale(sc, sc);
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
    this.gctx.clearRect(0, 0, this.w, this.h);   // the ctx is in world units
    this.grimeCleared = true;
  }
  draw(ctx) {
    if (!this.smoothBase) ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, this.baseRect.x0, this.baseRect.y0);
    // a fully erased grime layer is a full-screen no-op composite every frame
    if (this.grime && !this.grimeCleared) {
      ctx.imageSmoothingEnabled = !!this.smoothGrime;
      // a half-res layer is stretched back over the floor it belongs to
      if (this.gscale && this.gscale !== 1) {
        ctx.drawImage(this.grime, 0, 0, this.gw, this.gh, this.rect.x0, this.rect.y0, this.w, this.h);
      } else {
        ctx.drawImage(this.grime, this.rect.x0, this.rect.y0);
      }
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
