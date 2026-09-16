// items/shirt.js -- item #2, the T-shirt on a wire hanger.
//
// The constraint is not a peg: it is a *hook over a bar*. You cannot pull a
// hook off a bar by pulling sideways, and this shirt refuses to pretend
// otherwise. Pull straight toward the room and the hook just grips: the shirt
// stretches, the hanger tilts and clinks against the pole, and everything
// springs back when the finger lets go. Nothing is lost, nothing fails -- the
// clink is a hint.
//
// Lift the shirt a little first (a couple of centimetres of finger travel
// upward, in either orientation) and the hook visibly rises clear of the bar,
// with a "karan" and a real gap drawn between hook and pole. From there the
// smallest move toward the room swings it free: lift, then arc. That is the
// whole gesture, and it is the gesture a real hanger teaches you.

import { Item } from './base.js';
import { clamp, alongIn } from '../layout.js';

const G = { hx: 0, hy: 0, bx: 0, by: 0, lx: 0, ly: 0, rx: 0, ry: 0, ang: 0 };

export class Shirt extends Item {
  // ---- hanger state -----------------------------------------------------
  // Kept in one lazily-created object because base's constructor calls
  // layout() -> applyPins() before any subclass field would exist.
  hanger() {
    if (!this._hg) {
      this._hg = {
        tilt: 0, tiltV: 0,     // swing of the hanger about its hook
        lift: 0,               // how far the hook has risen off the pole (px)
        lifted: false,         // hook has cleared the bar
        hx: 0, hy: 0,          // hook position
        tx: 0, ty: 0,          // hook target while the finger carries it
        ox: 0, oy: 0,          // finger -> hook offset, frozen at lift-off
        ax: 0, ay: 0,          // finger position at lift-off (arc origin)
        clink: 0,              // cooldown on the "not yet" clink
        snag: 0,               // 0..1 how hard the hook is being pulled against the bar
        flutter: 0,            // sleeve liveliness, rises once it is free
        px: 0, py: 0,          // last finger position
      };
    }
    return this._hg;
  }

  /** How big the metal parts are drawn. */
  metal() { return Math.max(9, this.world.min * 0.030); }

  /** Vertical drop from the hook to the shoulder bar. */
  barDrop() { return this.metal() * 1.25; }

  /** The lift the hook needs before it clears the bar: ~2 finger-widths. */
  liftThreshold() { return clamp(22 * this.world.unit, 18, 28); }

  /** After the lift, the shirt swings free almost immediately. */
  arcThreshold() { return this.pullThreshold() * 0.8; }

  // ---- pins -------------------------------------------------------------
  /** Both shoulders hang from the ends of the hanger, never from the pole. */
  applyPins() {
    const g = this.hanger();
    if (!this.grabbing) {
      g.hx = this.anchor.x + this.anchor.w * 0.5;
      g.hy = this.world.pole.y - g.lift;
    }
    this.cloth.unpinAll();
    if (this.state !== 'HANGING') return;
    this.hangerPoints(G);
    const cl = this.cloth;
    cl.pin(cl.idx(0, 0), G.lx, G.ly);
    cl.pin(cl.idx(cl.cols - 1, 0), G.rx, G.ry);
  }

  /**
   * Hook, bar centre and the two bar ends. While the shirt still hangs these
   * come from the hanger's own state; once it is falling they are read back
   * off the shoulders of the cloth, so the hanger swings with the shirt.
   */
  hangerPoints(out) {
    const cl = this.cloth;
    const l = cl.idx(0, 0), r = cl.idx(cl.cols - 1, 0);
    if (this.state === 'HANGING') {
      const g = this.hanger();
      const drop = this.barDrop();
      const half = this.anchor.w * 0.5;
      const c = Math.cos(g.tilt), s = Math.sin(g.tilt);
      out.hx = g.hx; out.hy = g.hy;
      out.bx = g.hx + s * drop; out.by = g.hy + c * drop;
      out.lx = out.bx - c * half; out.ly = out.by - s * half;
      out.rx = out.bx + c * half; out.ry = out.by + s * half;
      out.ang = g.tilt;
      return out;
    }
    out.lx = cl.x[l]; out.ly = cl.y[l];
    out.rx = cl.x[r]; out.ry = cl.y[r];
    out.bx = (out.lx + out.rx) * 0.5; out.by = (out.ly + out.ry) * 0.5;
    let dx = out.rx - out.lx, dy = out.ry - out.ly;
    const len = Math.max(1e-3, Math.hypot(dx, dy));
    dx /= len; dy /= len;
    // Hook sits on the side of the bar away from the body of the shirt.
    let nx = dy, ny = -dx;
    const cx = this.cx, cy = this.cy;
    if ((out.bx + nx - cx) * nx + (out.by + ny - cy) * ny < 0) { nx = -nx; ny = -ny; }
    const drop = this.barDrop();
    out.hx = out.bx + nx * drop; out.hy = out.by + ny * drop;
    out.ang = Math.atan2(dy, dx);
    return out;
  }

  // ---- input ------------------------------------------------------------
  onPointerDown(p) {
    if (!super.onPointerDown(p)) return false;
    const g = this.hanger();
    g.lifted = false;
    g.snag = 0;
    g.px = p.x; g.py = p.y;
    this.fingerX = undefined;
    return true;
  }

  onPointerMove(p) {
    if (!this.grabbing) return;
    const w = this.world;
    const g = this.hanger();
    g.px = p.x; g.py = p.y;
    const fo = w.fingerOffset;
    // The cloth itself always follows the finger, offset clear of it.
    const tx = p.x + this.grabOX + fo.x * this.occl * 0.55;
    const ty = p.y + this.grabOY + fo.y * this.occl * 0.55;
    this.fingerX = tx; this.fingerY = ty;
    this.cloth.pin(this.grabIdx, tx, ty);

    const up = p.y0 - p.y; // css px of upward finger travel, both orientations

    if (!g.lifted) {
      const lift = this.liftThreshold();
      g.lift = clamp(up, 0, lift) * 0.9;
      if (up >= lift) { this.liftOff(p); return; }
      // Pulling inward without lifting: the hook grips the bar.
      this.stretch = clamp(p.along / this.pullThreshold(), 0, 1);
      g.snag = clamp(p.along / this.pullThreshold(), 0, 1);
      if (p.along > this.pullThreshold() * 0.45 && g.clink <= 0) {
        g.clink = 0.26;
        if (this.audio) this.audio.hangerClink();
      }
      return;
    }

    g.tx = p.x + g.ox + fo.x * this.occl * 0.55;
    g.ty = p.y + g.oy + fo.y * this.occl * 0.55;
    const arc = alongIn(w, p.x - g.ax, p.y - g.ay);
    const th = this.arcThreshold();
    this.stretch = clamp(arc / th, 0, 1);
    if (arc >= th) this.release();
  }

  /** The hook clears the bar: "karan", and a gap you can see. */
  liftOff(p) {
    const g = this.hanger();
    g.lifted = true;
    g.snag = 0;
    g.lift = this.liftThreshold() * 0.9;
    this.hangerPoints(G);
    g.ox = G.hx - p.x; g.oy = G.hy - p.y;
    g.ax = p.x; g.ay = p.y;
    g.tx = G.hx; g.ty = G.hy;
    g.tiltV += (Math.random() - 0.5) * 1.2;
    if (this.audio) this.audio.hanger();
  }

  endGrab() {
    const g = this.hanger();
    g.lifted = false;
    g.snag = 0;
    if (this.state === 'HANGING' && g.lift > 0.5) {
      // Dropped back onto the pole: one more small clink.
      if (this.audio) this.audio.hangerClink();
      g.tiltV += (Math.random() - 0.5) * 0.8;
    }
    super.endGrab();
  }

  // ---- release ----------------------------------------------------------
  release() {
    this.popped.fill(true);
    const cl = this.cloth;
    const l = cl.idx(0, 0), r = cl.idx(cl.cols - 1, 0);
    const d = this.world.inDir;
    // A swing, not a drop: the whole hanger sails inward and keeps rocking.
    for (const i of [l, r]) {
      cl.ox[i] = cl.x[i] - d.x * 3.2 - 0.6;
      cl.oy[i] = cl.y[i] - d.y * 3.2 - 1.8;
    }
    super.release();
    this.hanger().flutter = 1;
    if (this.audio) this.audio.fuwa();
  }

  // ---- simulation -------------------------------------------------------
  update(dt, wind, rain) {
    const g = this.hanger();
    g.clink = Math.max(0, g.clink - dt);

    if (this.state === 'HANGING') {
      const pole = this.world.pole;
      const home = this.anchor.x + this.anchor.w * 0.5;
      if (this.grabbing && g.lifted) {
        // Off the bar and travelling with the finger, with a little lag.
        const k = Math.min(1, dt * 9);
        g.hx += (g.tx - g.hx) * k;
        g.hy += (g.ty - g.hy) * k;
        g.lift = pole.y - g.hy;
      } else if (this.grabbing) {
        // Still hooked: the hook cannot leave the bar, so the shirt stretches.
        g.hx += (home - g.hx) * Math.min(1, dt * 10);
        g.hy = pole.y - g.lift;
      } else {
        const k = Math.min(1, dt * 7);
        g.hx += (home - g.hx) * k;
        g.lift += (0 - g.lift) * Math.min(1, dt * 9);
        g.hy = pole.y - g.lift;
      }

      // Pendulum about the hook: lateral wind and gusts rock it, the snagged
      // pull twists it, and it always settles back to hanging straight.
      const tgt = this.grabbing && !g.lifted
        ? clamp((g.px - g.hx) / (this.anchor.w * 1.6), -0.45, 0.45) * (0.35 + g.snag)
        : 0;
      const stiff = 46;
      g.tiltV += (tgt - g.tilt) * stiff * dt + wind.x * 0.02 * dt;
      if (this.grabbing && !g.lifted && g.snag > 0.5) {
        g.tiltV += Math.sin(this.world.t * 26) * 1.1 * dt * g.snag;
      }
      g.tiltV *= Math.pow(0.86, dt * 60);
      g.tilt = clamp(g.tilt + g.tiltV * dt, -0.75, 0.75);
      this.applyPins();
      // applyPins wiped every pin, so put the finger's grip back on top of it.
      if (this.grabbing && this.grabIdx >= 0 && this.fingerX !== undefined) {
        this.cloth.pin(this.grabIdx, this.fingerX, this.fingerY);
      }
    } else {
      g.flutter = Math.max(0, g.flutter - dt * 0.35);
    }

    super.update(dt, wind, rain);
  }

  // ---- drawing ----------------------------------------------------------
  /** No pegs on this one: the hook is the constraint and the signifier. */
  drawClips() { /* nothing -- see drawHanger */ }

  draw(ctx, world) {
    if (this.state === 'IN_BASKET') return;
    this.hangerPoints(G);
    this.drawSleeves(ctx, G);
    super.draw(ctx, world);
    this.drawCollar(ctx, G);
    this.drawHanger(ctx, world, G);
  }

  /** Two soft flaps off the shoulders; they only really flutter once free. */
  drawSleeves(ctx, g) {
    const cl = this.cloth;
    const rowI = cl.idx(0, 1), rowJ = cl.idx(cl.cols - 1, 1);
    const w = this.anchor.w * 0.30;
    const t = this.world.t;
    const live = 0.25 + this.hanger().flutter * 0.9;
    const k = 1 - 0.42 * this.wetness;
    ctx.fillStyle = 'rgb(' + Math.round(this.rgb[0] * 0.92 * k) + ',' +
      Math.round(this.rgb[1] * 0.92 * k) + ',' + Math.round(this.rgb[2] * 0.95 * k) + ')';
    for (let s = -1; s <= 1; s += 2) {
      const sx = s < 0 ? g.lx : g.rx;
      const sy = s < 0 ? g.ly : g.ry;
      const ix = s < 0 ? cl.x[rowI] : cl.x[rowJ];
      const iy = s < 0 ? cl.y[rowI] : cl.y[rowJ];
      const wob = Math.sin(t * 5.5 + s * 1.7) * live;
      const ex = sx + s * w * (0.85 + wob * 0.25);
      const ey = sy + w * (0.75 + wob * 0.45);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + s * w * 0.9, sy + w * 0.18, ex, ey);
      ctx.lineTo(ix + s * w * 0.12, iy + w * 0.62);
      ctx.lineTo(ix, iy);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** A neckline, so the silhouette reads as a T-shirt and not as a towel. */
  drawCollar(ctx, g) {
    const r = Math.max(4, this.anchor.w * 0.13);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(2, r * 0.36);
    ctx.beginPath();
    ctx.arc(g.bx, g.by, r, 0.08 * Math.PI, 0.92 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The hanger. The hook is drawn open and facing the pole, so the one place
   * this shirt is held is the most legible thing on it; once the rain starts
   * it glints with every gust.
   */
  drawHanger(ctx, world, g) {
    const s = this.metal();
    const hg = this.hanger();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#b9c6d2';
    ctx.lineWidth = Math.max(2.5, s * 0.24);
    // bar + the two sloping shoulders
    ctx.beginPath();
    ctx.moveTo(g.lx, g.ly);
    ctx.lineTo(g.rx, g.ry);
    ctx.moveTo(g.lx, g.ly);
    ctx.lineTo(g.bx, g.by);
    ctx.lineTo(g.rx, g.ry);
    ctx.stroke();
    // stem + hook
    ctx.beginPath();
    ctx.moveTo(g.bx, g.by);
    ctx.lineTo(g.hx, g.hy);
    ctx.stroke();
    ctx.strokeStyle = '#d6e1ea';
    ctx.beginPath();
    ctx.arc(g.hx, g.hy - s * 0.42, s * 0.42, Math.PI * 0.88, Math.PI * 2.12);
    ctx.stroke();

    if (this.state === 'HANGING') {
      const lifted = hg.lift > 1.2;
      if (lifted) {
        // Draw the gap: the hook is demonstrably off the bar now.
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, s * 0.10);
        ctx.setLineDash([s * 0.22, s * 0.3]);
        ctx.beginPath();
        ctx.moveTo(g.hx, g.hy + s * 0.05);
        ctx.lineTo(g.hx, world.pole.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (this.rainStarted) {
        const glint = Math.max(0, Math.sin(world.t * 4.2) * 0.5 + 0.5) *
          (0.35 + 0.65 * this.gust) + (lifted ? 0.4 : 0);
        ctx.globalAlpha = Math.min(1, glint) * 0.95;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(g.hx - s * 0.30, g.hy - s * 0.52, s * 0.20, s * 0.11, -0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  snapshot(out) {
    super.snapshot(out);
    const g = this.hanger();
    this.hangerPoints(G);
    out.lifted = !!g.lifted;
    out.lift = Math.round(g.lift * 10) / 10;
    out.hook = { x: Math.round(G.hx * 10) / 10, y: Math.round(G.hy * 10) / 10 };
    return out;
  }
}
