// items/pinch.js -- item #3, the little pinch-hanger of socks and hankies.
//
// This one has no threshold at all. Six small clips sit in a row along a rigid
// frame, each holding one small thing, and *touching* a clip opens it. Drag a
// finger along the row and they go off under it like a zip -- pachi, pachi,
// pachi -- each one a semitone brighter than the last, each little sock
// popping up clear of the finger and then tumbling down into the room. Tap
// them one at a time and that works exactly the same way.
//
// And because a child who has learned "pull it toward the room" on everything
// else will try exactly that here too, pulling the frame itself does the same
// thing from the other end: past the threshold the clips start going off one
// after another, a tenth of a second apart, running along the row in the
// direction of the pull -- pachi, pachi, pachi -- until the rack is bare. Two
// ways in, one result.
//
// When the last clip is empty the frame has no reason to stay outside, so it
// comes in by itself and the child gathers the pile into the basket: one
// layer, six small sounds.

import { Item } from './base.js';
import { Cloth, makePalette, drawCloth } from '../cloth.js';
import { clamp } from '../layout.js';

const TMP = { x: 0, y: 0 };

// Socks, hankies, a face towel: small, bright, obviously not one garment.
const SMALLS = [
  [255, 214, 232], [255, 250, 236], [186, 226, 255],
  [255, 226, 168], [214, 240, 214], [255, 200, 214],
];

export class Pinch extends Item {
  constructor(world, spec, hooks) {
    // Thirteen columns, six clips on the odd ones, inset from the ends so the
    // row a finger traces never reaches into the neighbouring washing -- all
    // of that comes from the registry, including where it hangs and how big
    // it is. Nothing is overridden here.
    super(world, spec, hooks);
    // A rigid frame pinned along its whole top edge: it cannot balloon, and
    // growing its rest lengths would only fight every pin. It keeps the
    // gentle sway the wind gives it and nothing else.
    this.selfBillow = true;

    this.minis = [];
    for (let k = 0; k < this.clipCols.length; k++) {
      const rgb = SMALLS[k % SMALLS.length];
      this.minis.push({
        cloth: new Cloth(3, 4),
        palette: makePalette(rgb[0], rgb[1], rgb[2]),
        rgb,
        state: 'ON',   // ON | FALL | GONE
        t: 0,
        fade: 1,
        landed: false,
      });
      this.minis[k].cloth.damping = 0.975;
      this.minis[k].cloth.windScale = 1.15;
    }
    this.pops = 0;
    this.lean = 0;
    this.autoT = -1;
    this.lastTX = 0;
    this.lastTY = 0;
    this.flash = this.clipCols.map(() => 0);
    this.layoutMinis();
  }

  // ---- geometry ---------------------------------------------------------
  /** Distance between two neighbouring clips. */
  clipGap() { return this.anchor.w / 6; }

  /**
   * The frame is rigid: every node of the top row is held by the hanger.
   *
   * Which means that, unlike every other item here, a hand on the cloth moves
   * nothing -- the constraint solver puts it straight back. So the answer to a
   * hand is to swing the whole rack: `lean` slides the hanger itself toward
   * the room, the way a rack on a pole does when a child leans on it. It is
   * the pinch hanger's version of the cloth coming up off its rest shape, and
   * it is what makes a touch here feel like a touch anywhere else.
   */
  applyPins() {
    const cl = this.cloth;
    const d = this.world.inDir;
    const L = this.lean || 0;
    cl.unpinAll();
    if (this.state !== 'HANGING') return;
    for (let c = 0; c < cl.cols; c++) {
      cl.pin(cl.idx(c, 0),
        this.anchor.x + (c / (cl.cols - 1)) * this.anchor.w + d.x * L,
        this.anchor.y + d.y * L);
    }
  }

  /** The rack goes with the hand at once, and comes back when it is let go. */
  _updateLean(dt) {
    const kick = Math.max(4, this.world.min * 0.016);
    const target = this.grabbing
      ? kick + clamp(this.along || 0, 0, this.pullThreshold()) * 0.30
      : 0;
    const k = target > this.lean ? 14 : 5;
    this.lean += (target - this.lean) * Math.min(1, dt * k);
  }

  layout(world) {
    super.layout(world);
    if (this.minis) this.layoutMinis();
  }

  miniSize() {
    return { w: Math.max(9, this.clipGap() * 0.8), h: Math.max(14, this.anchor.h * 0.78) };
  }

  layoutMinis() {
    const s = this.miniSize();
    for (let k = 0; k < this.minis.length; k++) {
      const m = this.minis[k];
      if (m.state !== 'ON') continue;
      this.clipPos(k, TMP);
      m.cloth.reset(TMP.x - s.w * 0.5, TMP.y, s.w, s.h);
      this.pinMini(k);
    }
  }

  pinMini(k) {
    const m = this.minis[k];
    const s = this.miniSize();
    this.clipPos(k, TMP);
    const cl = m.cloth;
    for (let c = 0; c < cl.cols; c++) {
      cl.pin(cl.idx(c, 0), TMP.x + (c / (cl.cols - 1) - 0.5) * s.w, TMP.y);
    }
  }

  /**
   * Generous, but still local: a little over one clip spacing, so a finger
   * always takes the clip it is on (and usually its neighbour), and never the
   * whole row at once. The row itself is easy to hit -- the item's own hit pad
   * is the full 64px -- it is only *which* clips open that is local.
   */
  touchRadius() { return Math.max(18, this.clipGap() * 1.2); }

  // ---- input: contact, not distance -------------------------------------
  onPointerDown(p) {
    if (this.state !== 'HANGING') return false;
    this.grabbing = true;
    this.occl = 0;
    this.stretch = 0;
    this.along = 0;
    this.beatT = 0;
    this.poppedThisGrab = false;
    this.pullX = p.x; this.pullY = p.y;
    this.lastTX = p.x; this.lastTY = p.y;
    this.grabFeedback();
    this.lean = Math.max(4, this.world.min * 0.016);
    this.applyPins();
    this.touchAt(p.x, p.y);
    return true;
  }

  onPointerMove(p) {
    if (!this.grabbing) return;
    this.pullX = p.x; this.pullY = p.y;
    this.along = p.along;
    this.stretch = clamp(p.along / this.pullThreshold(), 0, 1);
    // Sample along the stroke so a fast swipe cannot jump over a clip.
    const r = this.touchRadius() * 0.5;
    const dx = p.x - this.lastTX, dy = p.y - this.lastTY;
    const steps = Math.min(24, Math.max(1, Math.ceil(Math.hypot(dx, dy) / r)));
    for (let i = 1; i <= steps; i++) {
      this.touchAt(this.lastTX + dx * (i / steps), this.lastTY + dy * (i / steps));
    }
    this.lastTX = p.x; this.lastTY = p.y;
  }

  onPointerUp() { this.endGrab(); }
  onPointerCancel() { this.endGrab(); }

  endGrab() {
    this.grabbing = false;
    this.occl = 0;
    this.stretch = 0;
    this.along = 0;
    this.beatT = 0;
  }

  /**
   * Every clip within a generous radius of this point opens, now.
   *
   * The point is taken in the *rack's* frame, not the screen's: the whole
   * hanger slides toward the room under the hand (see applyPins), and a finger
   * resting on a clip has to stay on that clip while it does, exactly as it
   * would if the two were really touching.
   */
  touchAt(x, y) {
    const d = this.world.inDir;
    const L = this.lean || 0;
    const px = x + d.x * L, py = y + d.y * L;
    const r = this.touchRadius();
    const r2 = r * r;
    for (let k = 0; k < this.clipCols.length; k++) {
      if (this.popped[k]) continue;
      this.clipPos(k, TMP);
      const dx = TMP.x - px, dy = TMP.y - py;
      if (dx * dx + dy * dy <= r2) this.popClip(k);
    }
  }

  /**
   * @param {number|object} k clip index (an input payload is accepted too, so
   *   a stray call from the base class still does something sensible).
   */
  popClip(k) {
    let i = k;
    if (typeof i !== 'number') {
      // Called by the shared pull: take the clip nearest the hand, so the row
      // unzips outward from wherever the finger is dragging.
      const p = k || { x: this.pullX, y: this.pullY };
      let bestD = Infinity;
      i = -1;
      for (let n = 0; n < this.clipCols.length; n++) {
        if (this.popped[n]) continue;
        this.clipPos(n, TMP);
        const d = Math.abs(TMP.x - p.x) + Math.abs(TMP.y - p.y) * 0.25;
        if (d < bestD) { bestD = d; i = n; }
      }
      if (i < 0) return;
    }
    if (this.popped[i]) return;
    this.popped[i] = true;
    this.poppedThisGrab = true;

    // "pachi", a little brighter with every one that goes.
    const pitch = 1.12 + this.pops * 0.075 + (Math.random() - 0.5) * 0.06;
    this.pops++;
    if (this.audio) this.audio.clip(pitch, 0.032);

    this.clipPos(i, TMP);
    const a = this.clipAnim[i];
    a.t = 0; a.x = TMP.x; a.y = TMP.y;
    a.vx = (Math.random() - 0.5) * 90;
    a.vy = -70 - Math.random() * 50;
    a.rot = 0;
    this.flash[i] = 1;

    // The small thing hops clear of the finger first -- the finger-occlusion
    // offset direction -- and only then falls.
    const fo = this.world.fingerOffset;
    const fl = Math.max(1, Math.hypot(fo.x, fo.y));
    // Per-step Verlet displacement, i.e. a real little hop of ~300 px/s.
    const hop = Math.max(4.5, this.world.unit * 5.5);
    const m = this.minis[i];
    m.state = 'FALL';
    m.t = 0;
    const cl = m.cloth;
    cl.unpinAll();
    for (let n = 0; n < cl.n; n++) {
      cl.ox[n] = cl.x[n] - (fo.x / fl) * hop - (Math.random() - 0.5) * 0.6;
      cl.oy[n] = cl.y[n] - (fo.y / fl) * hop;
    }

    if (this.popped.every((v) => v)) this.autoT = 0.42;
  }

  // ---- simulation -------------------------------------------------------
  update(dt, wind, rain) {
    this._updateLean(dt);
    if (this.state === 'HANGING') this.applyPins();
    for (let k = 0; k < this.flash.length; k++) {
      this.flash[k] = Math.max(0, this.flash[k] - dt * 3.4);
    }

    const w = this.world;
    const gx = w.basket.cx, gy = w.basket.y;
    for (let k = 0; k < this.minis.length; k++) {
      const m = this.minis[k];
      if (m.state === 'GONE') continue;
      const cl = m.cloth;
      if (m.state === 'ON') {
        if (this.state === 'HANGING') this.pinMini(k);
        cl.step(dt, wind.x, wind.y, 0.75);
      } else {
        m.t += dt;
        cl.centroid(TMP);
        // Steered, not simulated: the small things end up where the child can
        // gather them, which is the basket.
        const ax = clamp((gx - TMP.x) * 2.6, -1400, 1400);
        const ay = clamp((gy - TMP.y) * 0.9, -600, 600);
        cl.step(dt, ax + wind.x * 0.3, ay, 0.95);
        if (!m.landed && (TMP.y >= gy || m.t > 2.2)) {
          m.landed = true;
          if (this.audio) this.audio.tap(1 + k * 0.08);
        }
        if (m.landed) {
          m.fade -= dt * 2.4;
          if (m.fade <= 0) { m.fade = 0; m.state = 'GONE'; }
        }
      }
    }

    if (this.autoT >= 0) {
      this.autoT -= dt;
      if (this.autoT <= 0) {
        this.autoT = -1;
        if (this.state === 'HANGING') this.release();
      }
    }

    super.update(dt, wind, rain);
  }

  release() {
    // The frame is empty; it slides in on its own and the child reaches for it.
    this.cloth.unpinAll();
    super.release();
  }

  // ---- drawing ----------------------------------------------------------
  draw(ctx, world) {
    if (this.state === 'IN_BASKET') return;
    for (let k = 0; k < this.minis.length; k++) {
      const m = this.minis[k];
      if (m.state === 'GONE') continue;
      if (m.fade < 1) { ctx.save(); ctx.globalAlpha = m.fade; }
      drawCloth(ctx, m.cloth, m.palette, this.wetness, 0);
      if (m.fade < 1) ctx.restore();
    }
    this.drawFrame(ctx, world);
    this.drawSpots(ctx);
    this.drawClips(ctx, world);
  }

  /** A light metal rectangle with a hook: obviously a rack, not a garment. */
  drawFrame(ctx, world) {
    const cl = this.cloth;
    const a = cl.idx(0, 0);
    const b = cl.idx(cl.cols - 1, 0);
    const ax = cl.x[a], ay = cl.y[a];
    const bx = cl.x[b], by = cl.y[b];
    const s = Math.max(3, world.min * 0.010);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#e7eef4';
    ctx.lineWidth = s;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    // Suspension: two wires up to a small hook, so it reads as hanging.
    const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5;
    const hy = my - Math.max(10, world.min * 0.035);
    ctx.lineWidth = Math.max(1.5, s * 0.45);
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(mx, hy);
    ctx.moveTo(bx, by); ctx.lineTo(mx, hy);
    ctx.stroke();
    if (this.state === 'HANGING') {
      ctx.strokeStyle = '#d6e1ea';
      ctx.lineWidth = Math.max(2, s * 0.6);
      ctx.beginPath();
      ctx.arc(mx, hy - s * 0.5, s * 0.9, Math.PI * 0.9, Math.PI * 2.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Small, round-jawed clips, and a bright flash on the one just touched. */
  drawClipShape(ctx, s, open) {
    super.drawClipShape(ctx, s * 0.82, open);
  }

  drawClips(ctx, world) {
    super.drawClips(ctx, world);
    const size = Math.max(11, world.min * 0.033);
    for (let k = 0; k < this.flash.length; k++) {
      const f = this.flash[k];
      if (f <= 0) continue;
      const a = this.clipAnim[k];
      ctx.save();
      ctx.globalAlpha = f * 0.7;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.5, size * 0.16);
      ctx.beginPath();
      ctx.arc(a.x, a.y, size * (0.5 + (1 - f) * 1.3), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  snapshot(out) {
    super.snapshot(out);
    if (!this._clipSnap) {
      this._clipSnap = this.clipCols.map(() => ({ x: 0, y: 0, popped: false }));
    }
    for (let k = 0; k < this.clipCols.length; k++) {
      const c = this._clipSnap[k];
      this.clipPos(k, TMP);
      c.x = Math.round(TMP.x * 10) / 10;
      c.y = Math.round(TMP.y * 10) / 10;
      c.popped = !!this.popped[k];
    }
    out.clipPts = this._clipSnap;
    return out;
  }
}
