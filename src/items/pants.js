// items/pants.js -- item #4, the heavy jeans.
//
// Everything about this one is weight. The waistband does not go where the
// finger is, it goes where the finger *was*: a slow, critically damped spring
// with no overshoot, so the jeans are always a moment behind and you can feel
// the mass in your hand. Flicking does nothing at all except set the whole
// thing swinging on its two fat clips -- there is no speed you can reach that
// will beat a clip that is gripping denim.
//
// What works is leaning on it. Nothing here asks the finger to *wait* -- the
// only thing that counts is how far the waistband itself has come, and since
// the waistband is always a long way behind the hand, getting it far enough
// takes a long, steady pull whether you meant it to or not. A flick moves the
// finger, not the jeans, and the jeans are what the clips are holding. Get the
// waistband far enough toward the room and the first fat clip gives with a low
// "pachi"; keep the pull there and the second one goes a fifth of a second
// later. Then the weight takes over -- it drops with real inertia and lands
// with a "doson".

import { Item } from './base.js';
import { clamp } from '../layout.js';

const OMEGA = 7.0;        // rad/s: the lag of something heavy

export class Pants extends Item {
  onPointerDown(p) {
    if (!super.onPointerDown(p)) return false;
    const cl = this.cloth;
    this.lagX = cl.x[this.grabIdx];
    this.lagY = cl.y[this.grabIdx];
    this.lag0X = this.lagX;
    this.lag0Y = this.lagY;
    this.lagVX = 0;
    this.lagVY = 0;
    this.targetX = this.lagX;
    this.targetY = this.lagY;
    this.peak = 0;
    return true;
  }

  /** Heavier than anything else on the line: it wants a long pull. */
  pullThreshold() { return super.pullThreshold() * 1.35; }

  /**
   * Not where the finger has got to -- where the *jeans* have got to.
   *
   * This one line is the whole character of the item. The waistband follows
   * the hand through a critically damped spring, so a flick leaves it almost
   * where it started and a long lean drags it all the way; measuring the
   * release off the cloth instead of off the pointer means speed genuinely
   * buys nothing and patience needs no timer.
   */
  pullDistance() {
    if (this.lagX === undefined) return 0;
    const d = this.world.inDir;
    return (this.lagX - this.lag0X) * d.x + (this.lagY - this.lag0Y) * d.y;
  }

  /** Pegs pop next to the waistband, which is nowhere near the finger. */
  pullPoint() {
    const o = this._lp || (this._lp = { x: 0, y: 0 });
    o.x = this.lagX === undefined ? this.pullX : this.lagX;
    o.y = this.lagY === undefined ? this.pullY : this.lagY;
    return o;
  }

  onPointerMove(p) {
    if (!this.grabbing) return;
    const fo = this.world.fingerOffset;
    // Where the waistband is *asked* to be. Where it actually is lags behind.
    this.targetX = p.x + this.grabOX + fo.x * this.occl * 0.55;
    this.targetY = p.y + this.grabOY + fo.y * this.occl * 0.55;
    this.pullX = p.x;
    this.pullY = p.y;
    this.along = p.along;
    this.peak = Math.max(this.peak || 0, this.pullDistance());
    this.stretch = clamp(this.pullDistance() / this.pullThreshold(), 0, 1);
  }

  endGrab() {
    if (this.grabbing && this.state === 'HANGING' && !this.poppedThisGrab) {
      // A flick: all it buys you is a long, slow, heavy sway.
      const d = this.world.inDir;
      const k = clamp((this.peak || 0) / this.pullThreshold(), 0, 1) * 3.4 + 0.6;
      const cl = this.cloth;
      for (let i = 0; i < cl.n; i++) {
        if (cl.pinned[i]) continue;
        cl.ox[i] = cl.x[i] - d.x * k;
        cl.oy[i] = cl.y[i] - d.y * k * 0.5;
      }
      if (this.audio && (this.peak || 0) > this.pullThreshold() * 0.25) this.audio.zushi();
    }
    this.peak = 0;
    this.lagX = undefined;
    super.endGrab();
  }

  // ---- release ----------------------------------------------------------
  release() {
    super.release();
    if (this.audio) this.audio.zushi();
  }

  /** Into the arms: the child takes the weight. */
  beginCarry(x, y) {
    super.beginCarry(x, y);
    if (this.audio) this.audio.doson();
  }

  // ---- simulation -------------------------------------------------------
  update(dt, wind, rain) {
    if (this.grabbing && this.state === 'HANGING' && this.lagX !== undefined) {
      // Critically damped: it never overshoots, it just takes its time.
      const ax = (this.targetX - this.lagX) * OMEGA * OMEGA - 2 * OMEGA * this.lagVX;
      const ay = (this.targetY - this.lagY) * OMEGA * OMEGA - 2 * OMEGA * this.lagVY;
      this.lagVX += ax * dt;
      this.lagVY += ay * dt;
      this.lagX += this.lagVX * dt;
      this.lagY += this.lagVY * dt;
      this.cloth.pin(this.grabIdx, this.lagX, this.lagY);
    }
    super.update(dt, wind, rain);
  }

  /** How close this pull is to popping the next clip, 0..1. */
  tension() {
    if (!this.grabbing || this.state !== 'HANGING') return 0;
    return clamp(this.pullDistance() / this.pullThreshold(), 0, 1);
  }

  // ---- drawing ----------------------------------------------------------
  /** Fat, square-jawed clips: these are the ones for the heavy washing. */
  drawClipShape(ctx, s, open) {
    super.drawClipShape(ctx, s * 1.34, open);
  }

  drawClips(ctx, world) {
    super.drawClips(ctx, world);
    const t = this.tension();
    if (t <= 0) return;
    // The clips visibly strain while the pull is being held: immediate
    // feedback that waiting is what is doing the work.
    const size = Math.max(11, world.min * 0.033) * 1.34;
    const TMP = this._tp || (this._tp = { x: 0, y: 0 });
    for (let k = 0; k < this.clipCols.length; k++) {
      if (this.popped[k]) continue;
      this.clipPos(k, TMP);
      ctx.save();
      ctx.translate(TMP.x, TMP.y);
      ctx.rotate(Math.sin(world.t * 40) * 0.06 * t);
      ctx.globalAlpha = 0.25 + 0.6 * t;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, size * 0.12);
      for (let s = -1; s <= 1; s += 2) {
        ctx.beginPath();
        ctx.moveTo(s * size * 0.55, -size * 0.55);
        ctx.lineTo(s * size * (0.55 + 0.35 * t), -size * (0.55 + 0.35 * t));
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  draw(ctx, world) {
    if (this.state === 'IN_BASKET') return;
    super.draw(ctx, world);
    this.drawSeam(ctx);
  }

  /** Waistband and the seam down the middle: unmistakably trousers. */
  drawSeam(ctx) {
    const cl = this.cloth;
    const c = (cl.cols / 2) | 0;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(20,32,60,0.35)';
    ctx.lineWidth = Math.max(2, this.anchor.w * 0.05);
    ctx.beginPath();
    const r0 = Math.floor(cl.rows * 0.35);
    for (let r = r0; r < cl.rows; r++) {
      const i = cl.idx(c, r);
      if (r === r0) ctx.moveTo(cl.x[i], cl.y[i]);
      else ctx.lineTo(cl.x[i], cl.y[i]);
    }
    ctx.stroke();
    // waistband
    ctx.strokeStyle = 'rgba(232,236,248,0.55)';
    ctx.lineWidth = Math.max(3, this.anchor.h * 0.035);
    const wr = Math.max(1, Math.floor(cl.rows * 0.10));
    ctx.beginPath();
    for (let col = 0; col < cl.cols; col++) {
      const i = cl.idx(col, wr);
      if (col === 0) ctx.moveTo(cl.x[i], cl.y[i]);
      else ctx.lineTo(cl.x[i], cl.y[i]);
    }
    ctx.stroke();
    ctx.restore();
  }

  snapshot(out) {
    super.snapshot(out);
    out.tension = Math.round(this.tension() * 100) / 100;
    return out;
  }
}
