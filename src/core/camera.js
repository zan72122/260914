/**
 * World -> screen mapping.
 *   x, y  : world point shown at the centre of the screen
 *   zoom  : uniform scale
 *   tilt  : 0..1, squashes Y and pushes the horizon up. 0 = straight top-down,
 *           1 = "camera dropped toward floor level" (used under furniture / for
 *           travelling away from the viewer in portrait).
 */
const YSQUASH = 0.45;   // how much tilt squashes vertical distance
const YPUSH = 0.12;     // how much tilt pushes the view down the screen

export class Camera {
  constructor() {
    this.x = 0; this.y = 0; this.zoom = 1; this.tilt = 0;
    this.w = 1; this.h = 1;
    this.shake = 0;
    this._sx = 0; this._sy = 0;
  }
  setViewport(w, h) { this.w = w; this.h = h; }
  get yScale() { return this.zoom * (1 - YSQUASH * this.tilt); }

  set(x, y, zoom, tilt) {
    this.x = x; this.y = y;
    if (zoom !== undefined) this.zoom = zoom;
    if (tilt !== undefined) this.tilt = tilt;
  }
  copyFrom(c) { this.x = c.x; this.y = c.y; this.zoom = c.zoom; this.tilt = c.tilt; }

  toScreen(wx, wy, out) {
    out.x = (wx - this.x) * this.zoom + this.w * 0.5 + this._sx;
    out.y = (wy - this.y) * this.yScale + this.h * 0.5 + this.tilt * this.h * YPUSH + this._sy;
    return out;
  }
  toWorld(sx, sy, out) {
    out.x = (sx - this.w * 0.5 - this._sx) / this.zoom + this.x;
    out.y = (sy - this.h * 0.5 - this.tilt * this.h * YPUSH - this._sy) / this.yScale + this.y;
    return out;
  }
  /** Apply camera as a canvas transform (for drawing in world coords). */
  apply(ctx) {
    ctx.translate(this.w * 0.5 + this._sx, this.h * 0.5 + this.tilt * this.h * YPUSH + this._sy);
    ctx.scale(this.zoom, this.yScale);
    ctx.translate(-this.x, -this.y);
  }
  update(dt) {
    if (this.shake > 0.001) {
      this.shake *= Math.exp(-dt * 9);
      this._sx = (Math.random() * 2 - 1) * this.shake;
      this._sy = (Math.random() * 2 - 1) * this.shake;
    } else { this.shake = 0; this._sx = 0; this._sy = 0; }
  }
  kick(amount) { this.shake = Math.max(this.shake, amount); }

  /** World-space rectangle currently visible (with margin). */
  viewRect(out, margin = 0) {
    const hw = this.w * 0.5 / this.zoom, hh = this.h * 0.5 / this.yScale;
    const cy = this.y - (this.tilt * this.h * 0.12) / this.yScale;
    out.x0 = this.x - hw - margin; out.x1 = this.x + hw + margin;
    out.y0 = cy - hh - margin; out.y1 = cy + hh + margin;
    return out;
  }
  snapshot() {
    return { x: Math.round(this.x), y: Math.round(this.y), zoom: +this.zoom.toFixed(3), tilt: +this.tilt.toFixed(3) };
  }
}
