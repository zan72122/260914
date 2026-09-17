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
  /**
   * Bounded-gain follow toward a pose, used when the camera has to keep the
   * nozzle in frame without ever running away from the set it is framing.
   *
   *   cam.followTo(dt, {x, y, zoom, tilt}, vac.nozzle, {x: 90, y: 60}, 0.45);
   *
   * The anchor pose is the composition the scene wants; the offset toward the
   * subject is `gain * (subject - anchor)` CLAMPED to `limit`, so it always
   * settles. `rate` is the exponential approach speed. `snap` skips the easing
   * (use it on the first frame, when the camera has nowhere sensible to come
   * from).
   */
  followTo(dt, anchor, subject, limit, gain = 0.45, rate = 2.8, snap = false) {
    let tx = anchor.x, ty = anchor.y;
    if (subject) {
      const lx = limit && limit.x !== undefined ? limit.x : 1e9;
      const ly = limit && limit.y !== undefined ? limit.y : 1e9;
      const gx = typeof gain === 'number' ? gain : gain.x;
      const gy = typeof gain === 'number' ? gain : gain.y;
      tx += clampAbs((subject.x - anchor.x) * gx, lx);
      ty += clampAbs((subject.y - anchor.y) * gy, ly);
    }
    const tz = anchor.zoom === undefined ? this.zoom : anchor.zoom;
    const tt = anchor.tilt === undefined ? this.tilt : anchor.tilt;
    if (snap) { this.set(tx, ty, tz, tt); return; }
    const k = 1 - Math.exp(-rate * dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.zoom += (tz - this.zoom) * k;
    this.tilt += (tt - this.tilt) * k;
  }

  /**
   * Stepped follow, for a staircase.
   *
   * A smooth follow up a flight of stairs reads as a ramp. This one quantises
   * the travel axis to whole steps and SETTLES on each one: the camera holds
   * still while the head works a tread, then moves up a whole step at once when
   * the head crosses the nosing, with a small vertical kick as it lands — which
   * is what "going up a step" feels like.
   *
   *   cam.stepTo(dt, {x: 0, y: 0, zoom, tilt}, vac.nozzle, {
   *     axis: 'y', step: 128, rate: 7, kick: 3.5, hysteresis: 0.22,
   *   });
   *
   * `axis` is the direction the stairs run in (portrait: 'y'; a diagonal flight
   * in landscape: 'x'), `step` the world distance between treads. The other
   * axis follows normally, bounded like `followTo`.
   */
  stepTo(dt, anchor, subject, opts) {
    const o = opts || {};
    const axis = o.axis === 'x' ? 'x' : 'y';
    const step = o.step || 120;
    const rate = o.rate === undefined ? 7 : o.rate;
    const hyst = o.hysteresis === undefined ? 0.2 : o.hysteresis;
    let tx = anchor.x, ty = anchor.y;
    if (subject) {
      // which tread is the head standing on? The hysteresis band means the
      // camera does not flick back and forth when it hovers over a nosing.
      const rel = (axis === 'y' ? subject.y - anchor.y : subject.x - anchor.x) / step;
      let k = this._stepK === undefined ? Math.round(rel) : this._stepK;
      if (rel > k + 0.5 + hyst) k = Math.floor(rel + 0.5);
      else if (rel < k - 0.5 - hyst) k = Math.ceil(rel - 0.5);
      if (this._stepK !== undefined && k !== this._stepK) this.kick(o.kick === undefined ? 3 : o.kick);
      this._stepK = k;
      if (axis === 'y') {
        ty = anchor.y + k * step;
        tx = anchor.x + clampAbs((subject.x - anchor.x) * (o.gain === undefined ? 0.4 : o.gain), o.limit === undefined ? 70 : o.limit);
      } else {
        tx = anchor.x + k * step;
        ty = anchor.y + clampAbs((subject.y - anchor.y) * (o.gain === undefined ? 0.4 : o.gain), o.limit === undefined ? 70 : o.limit);
      }
    }
    const tz = anchor.zoom === undefined ? this.zoom : anchor.zoom;
    const tt = anchor.tilt === undefined ? this.tilt : anchor.tilt;
    if (o.snap) { this.set(tx, ty, tz, tt); return; }
    const kk = 1 - Math.exp(-rate * dt);
    this.x += (tx - this.x) * kk;
    this.y += (ty - this.y) * kk;
    this.zoom += (tz - this.zoom) * kk;
    this.tilt += (tt - this.tilt) * kk;
  }
  /** Forget which tread we were on (call from layout()). */
  resetSteps() { this._stepK = undefined; }

  snapshot() {
    return { x: Math.round(this.x), y: Math.round(this.y), zoom: +this.zoom.toFixed(3), tilt: +this.tilt.toFixed(3) };
  }
}

function clampAbs(v, m) { return v > m ? m : v < -m ? -m : v; }
