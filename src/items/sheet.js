// items/sheet.js -- item #5, the giant sheet. The set piece.
//
// Everything else on this line is a *pull*. The sheet is a *dismantling*: four
// big pegs, taken off one at a time, in whatever order the child likes. Each
// one that goes makes the sheet bigger and louder, and the ones still holding
// get more insistent -- larger, wobbling harder, glinting brighter -- because
// the one thing a four year old cannot leave alone is an almost-finished row.
//
// The feel, in order:
//   1 peg off  -- a corner lifts and starts slapping. "bata-bata" comes in.
//   2 pegs off -- half the sheet is loose; it balloons toward the room and
//                 covers a real part of the screen.
//   3 pegs off -- almost everything is loose, hanging off one peg, enormous.
//   4th peg    -- "BASA". The whole thing turns over and fills the view for
//                 two thirds of a second, then floats down to the child, who
//                 does not *catch* it -- she hugs it, arms right around it.
//
// Two mechanisms do the heavy lifting:
//   * the rest lengths of the Verlet mesh grow (see setClothScale). The mesh
//     is physically bigger while the remaining pegs stay put, which is what
//     "coming toward the camera" looks like without a real 3D camera.
//   * a per-point height field `z`, fed to drawClothLit, so folds get lit and
//     read as volume, and can be flipped over to show the back of the cloth.

import { Item, MIN_HIT, LIGHT_BIAS, roundRect } from './base.js';
import { clamp } from '../layout.js';
import { drawClothLit, clampClothVelocity, setClothScale, relaxShear } from '../cloth.js';

const TMP = { x: 0, y: 0 };

// Where the four corners are tucked when the bundle is being hugged.
const GATHER = [Math.PI * 1.15, Math.PI * 1.85, Math.PI * 0.72, Math.PI * 0.28];

// The big release, in seconds: flip + fill the screen, then float down.
const BURST = 0.66;

export class Sheet extends Item {
  constructor(world, spec, hooks) {
    super(world, spec, hooks);

    // `z` (the height field the lit renderer shades with) and `zPhase` come
    // from the base class; the sheet only drives them differently.
    this.freeW = new Float32Array(this.cloth.cols); // per-column "how loose"
    this.zPhase = 0;
    // Everything below -- the zoom, the per-column wind, the flip -- is this
    // item's own billow, so the shared one must keep its hands off.
    this.selfBillow = true;
    this.flipSign = 1;
    this.sheen = 0;
    this.sheenPos = -0.3;

    this.zoom = 1;
    this.zoomTo = 1;
    this.zoomBig = 2.4;
    this.billow = 0.10;
    this.billowTo = 0.10;
    this.phase = 'HANG';                     // HANG | BURST | FLOAT | CARRY

    this.armed = -1;                         // the peg the finger went down on
    this.moved = 0;
    this._fluCd = 0;

    // Read by the character and the basket: this one is hugged, not caught,
    // and it makes a much bigger heap than a towel.
    this.bigBundle = true;
    this.basketScale = 1.85;
    this.catchDelay = BURST + 0.28;          // let the billow play out first
    this.hugger = null;

    this._recomputeFree();
    this._applyZoom();
    this._updateZ();
  }

  // ---- geometry ---------------------------------------------------------
  layout(world) {
    super.layout(world);
    // The largest, friendliest target in the game.
    this.hitPad = Math.max(MIN_HIT, world.min * 0.115);
    this.baseRestH = this.anchor.w / (this.cloth.cols - 1);
    this.baseRestV = this.anchor.h / (this.cloth.rows - 1);
    // How far it may grow on the big release: as much as fits the viewport.
    const zw = (world.w * 0.92) / Math.max(1, this.anchor.w);
    const zh = (world.h * 0.84) / Math.max(1, this.anchor.h);
    this.zoomBig = clamp(Math.min(zw, zh), 1.7, 3.2);
    this._applyZoom();
  }

  _applyZoom() {
    // Called from layout(), which the base constructor runs before our own
    // fields exist -- so default everything.
    const z = this.zoom === undefined ? 1 : this.zoom;
    setClothScale(this.cloth, this.baseRestH || this.cloth.restH,
      this.baseRestV || this.cloth.restV, z);
  }

  get releasedCount() {
    let n = 0;
    for (let i = 0; i < this.popped.length; i++) if (this.popped[i]) n++;
    return n;
  }

  /**
   * Per column: 0 right under a peg that is still holding, 1 once nothing
   * nearby is pinned. Wind, billow and lighting are all weighted by this, so
   * the sheet balloons *from the freed edge* instead of as a slab.
   */
  _recomputeFree() {
    if (!this.freeW) return;   // base constructor lays out before we exist
    const cols = this.cloth.cols;
    let any = false;
    for (let k = 0; k < this.clipCols.length; k++) if (!this.popped[k]) any = true;
    for (let c = 0; c < cols; c++) {
      if (!any) { this.freeW[c] = 1; continue; }
      let d = Infinity;
      for (let k = 0; k < this.clipCols.length; k++) {
        if (this.popped[k]) continue;
        const dd = Math.abs(c - this.clipCols[k]);
        if (dd < d) d = dd;
      }
      this.freeW[c] = Math.min(1, d / 2.2);
    }
  }

  applyPins() {
    super.applyPins();
    this._recomputeFree();
  }

  // ---- input ------------------------------------------------------------
  /** The nearest peg still holding, if the finger is anywhere near it. */
  _nearestClip(x, y) {
    const r = Math.max(MIN_HIT, this.world.min * 0.17); // deliberately generous
    let best = -1, bestD = r;
    for (let k = 0; k < this.clipCols.length; k++) {
      if (this.popped[k]) continue;
      this.clipPos(k, TMP);
      const d = Math.hypot(TMP.x - x, TMP.y - y);
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }

  onPointerDown(p) {
    if (this.state !== 'HANGING') return false;
    const cl = this.cloth;
    this.armed = this._nearestClip(p.x, p.y);
    // Grab whatever bit of cloth is actually under the finger, so a sheet this
    // big always follows the hand that touched it.
    let best = -1, bestD = Infinity;
    for (let i = 0; i < cl.n; i++) {
      if (cl.pinned[i]) continue;
      const dx = cl.x[i] - p.x, dy = cl.y[i] - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) best = cl.idx((cl.cols / 2) | 0, cl.rows - 1);
    this.grabIdx = best;
    this.grabOX = cl.x[best] - p.x;
    this.grabOY = cl.y[best] - p.y;
    this.grabbing = true;
    this.occl = 0;
    this.poppedThisGrab = false;
    this.stretch = 0;
    this.moved = 0;
    return true;
  }

  onPointerMove(p) {
    if (!this.grabbing) return;
    const w = this.world;
    const fo = w.fingerOffset;
    this.cloth.pin(this.grabIdx,
      p.x + this.grabOX + fo.x * this.occl * 0.5,
      p.y + this.grabOY + fo.y * this.occl * 0.5);
    const th = this.pullThreshold();
    this.stretch = clamp(p.along / th, 0, 1);
    const m = Math.hypot(p.dx, p.dy);
    if (m > this.moved) this.moved = m;
    // Wrong way round? The sheet stretches and nothing comes off. Ever.
    if (!this.poppedThisGrab && p.along >= th) this.popClip(p);
  }

  onPointerUp(p) {
    // A plain touch on a peg is enough: press the clip, the clip opens. The
    // pull is for children who would rather haul on the cloth.
    if (!this.poppedThisGrab && this.armed >= 0 && !this.popped[this.armed] &&
      this.moved < Math.max(12, this.world.min * 0.035)) {
      this._pop(this.armed);
    }
    this.armed = -1;
    this.endGrab();
  }

  onPointerCancel() { this.armed = -1; this.endGrab(); }

  /** Pegs come off one at a time, and it is the one you touched that goes. */
  popClip(p) {
    let k = (this.armed >= 0 && !this.popped[this.armed]) ? this.armed : -1;
    if (k < 0) {
      let bestD = Infinity;
      for (let i = 0; i < this.clipCols.length; i++) {
        if (this.popped[i]) continue;
        this.clipPos(i, TMP);
        const d = Math.abs(TMP.x - p.x) + Math.abs(TMP.y - p.y) * 0.4;
        if (d < bestD) { bestD = d; k = i; }
      }
    }
    if (k < 0) return;
    this._pop(k);
  }

  _pop(k) {
    this.popped[k] = true;
    this.poppedThisGrab = true;
    this.armed = -1;
    this.clipPos(k, TMP);
    const a = this.clipAnim[k];
    a.t = 0; a.x = TMP.x; a.y = TMP.y;
    a.vx = (Math.random() - 0.5) * 150 + this.world.inDir.x * 90;
    a.vy = -150 - Math.random() * 90;
    a.rot = 0;
    const fi = this.cloth.idx(this.clipCols[k], 0);
    this.cloth.unpin(fi);
    // Kick the freed corner outward so the cloth visibly lets go.
    this.cloth.ox[fi] = this.cloth.x[fi] - this.world.inDir.x * 5 - 1;
    this.cloth.oy[fi] = this.cloth.y[fi] - this.world.inDir.y * 5 - 3;
    this._recomputeFree();

    const remaining = this.popped.length - this.releasedCount;
    if (this.audio) {
      // Heavy "pachin": this peg is twice the size of the towel's.
      this.audio.clipHeavy(1 - 0.06 * this.releasedCount);
    }
    if (remaining === 0) this.release();
    else if (this.audio) this.audio.cloth(0.9 + 0.3 * this.releasedCount);
  }

  release() {
    super.release();
    this.phase = 'BURST';
    this.sheen = 0;
    this.sheenPos = -0.25;
    this.overlay = true;
    if (this.audio) {
      this.audio.basa();
      this.audio.flutterStop();
    }
  }

  stow() {
    super.stow();
    this.hugger = null;
    this.overlay = false;
    if (this.audio) this.audio.flutterStop();
  }

  // ---- simulation -------------------------------------------------------
  update(dt, wind, rain) {
    // A sheet with half its pegs off is mostly air. Lightening it as the pegs
    // go is what lets the wind win over gravity and balloon it instead of
    // letting it hang there like a wet rope -- and it is set before the base
    // class integrates, because this is the gravity it integrates with.
    const rel = this.releasedCount;
    this.spec.gravityK = 0.80 - 0.15 * rel;

    super.update(dt, wind, rain);
    const cl = this.cloth;
    const w = this.world;
    const released = rel;

    if (this.state === 'HANGING') {
      this.phase = 'HANG';
      // Two pegs off and the loose half is genuinely blowing through the open
      // window into the room, so from here it passes *in front of* the frame.
      // One peg off it is still a thing on a balcony, and stays behind it.
      this.overlay = rel >= 2;
      // Free area -> wind force, and the sheet reads a little nearer with it.
      this.billowTo = 0.10 + 0.34 * released;
      // Toward the camera, hard: by the time three pegs are off, the loose
      // part of the sheet is through the opening and into the room.
      this.zoomTo = 1 + 0.135 * released;
      cl.damping = 0.988;
    } else if (this.state === 'RELEASING') {
      this.overlay = true;
      if (this.releaseT < BURST) {
        this.phase = 'BURST';
        this.billowTo = 1.5;
        this.zoomTo = this.zoomBig;
        cl.damping = 0.992;
      } else {
        this.phase = 'FLOAT';
        this.billowTo = 0.5;
        this.zoomTo = 1.15;
        cl.damping = 0.945;   // the air goes out of it and it settles
      }
    } else if (this.state === 'CARRYING') {
      this.phase = 'CARRY';
      this.overlay = false;
      this.billowTo = 0.16;
      this.zoomTo = 0.42;     // gathered into a bundle against the chest
      cl.damping = 0.90;
    }

    const zk = this.phase === 'BURST' ? 7.5 : 2.6;
    this.zoom += (this.zoomTo - this.zoom) * Math.min(1, dt * zk);
    this.billow += (this.billowTo - this.billow) * Math.min(1, dt * (this.phase === 'BURST' ? 9 : 2.2));
    this._applyZoom();

    if (this.state === 'CARRYING') this._gather();
    this._blow(dt);
    // Without shear the mesh folds into a rope the moment it hangs off one
    // peg. With it, the freed part stays a sheet and the wind can fill it.
    relaxShear(cl, 0.40);
    cl.solve();
    // Nothing here is allowed to explode, whatever the wind does.
    clampClothVelocity(cl, Math.max(6, w.min * 0.06));
    if (this.state === 'RELEASING') this._contain();
    this._keepInView();

    this.zPhase += dt * (2.6 + 7 * this.gust + (this.phase === 'BURST' ? 10 : 0));
    this.flipSign = (this.state === 'RELEASING' && this.releaseT < BURST)
      ? Math.cos(Math.PI * (this.releaseT / BURST))
      : (this.releaseT > 0 ? -1 : 1);
    this._updateZ();

    if (this.phase === 'BURST') {
      const u = clamp(this.releaseT / BURST, 0, 1);
      this.sheen = Math.sin(Math.PI * u) * 0.9;
      this.sheenPos = -0.2 + u * 1.45;
    } else {
      this.sheen = Math.max(0, this.sheen - dt * 2.6);
    }

    this._flutterAudio(dt, released);
  }

  /**
   * The wind on the loose part. Uniform wind (in Cloth.step) cannot do this:
   * the force has to be weighted by how free each column is, or the sheet
   * swings as one board instead of ballooning from the corner that let go.
   */
  _blow(dt) {
    const w = this.world;
    const cl = this.cloth;
    const released = this.releasedCount;
    let base;
    if (this.state === 'HANGING') {
      if (released === 0) return;
      // Portrait pushes the loose cloth at the camera, which needs more force
      // than a sideways sweep before it reads as anything at all.
      base = w.min * (0.55 + 1.35 * released) * (0.60 + 0.70 * this.gust) *
        (w.portrait ? 1.45 : 1);
    } else if (this.phase === 'BURST') {
      base = w.min * 1.5;
    } else if (this.phase === 'FLOAT') {
      base = w.min * 0.35;
    } else {
      return;
    }
    const cols = cl.cols, rows = cl.rows;
    const dt2 = dt * dt;
    const ix = w.inDir.x, iy = w.inDir.y;
    // Landscape sweeps sideways, so it needs a little lift or it just droops.
    const lift = base * 0.16 * (1 - Math.abs(iy));
    const t = w.t;
    for (let r = 0; r < rows; r++) {
      const rv = rows > 1 ? r / (rows - 1) : 0;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (cl.pinned[i]) continue;
        const wgt = (0.22 + 0.78 * this.freeW[c]) * (0.30 + 0.70 * rv);
        const flap = 1 + Math.sin(t * 7.5 + c * 1.15 + rv * 2.3) * 0.42;
        const a = base * wgt * flap;
        const swirl = Math.sin(t * 5 + c * 0.9) * base * wgt * 0.18;
        cl.x[i] += (ix * a + (w.portrait ? swirl : 0)) * dt2;
        cl.y[i] += (iy * a + (w.portrait ? 0 : swirl) - lift * wgt) * dt2;
      }
    }
  }

  /**
   * Carried, the sheet is not a flat cloth on a pair of hands: it is a bundle
   * with arms round it. Pinning the four corners onto a small ring around the
   * chest gathers all that cloth into an armful, and the folds fall where the
   * mesh crumples.
   */
  _gather() {
    const cl = this.cloth;
    const r = this.world.min * 0.062;
    const cx = this.carryX;
    const cy = this.carryY + r * 0.35;
    const cols = cl.cols, rows = cl.rows;
    for (let k = 0; k < 4; k++) {
      const c = (k & 1) ? cols - 1 : 0;
      const rr = (k & 2) ? rows - 1 : 0;
      const a = GATHER[k] + Math.sin(this.world.t * 2.2 + k) * 0.12;
      cl.pin(cl.idx(c, rr), cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.82);
    }
  }

  /**
   * The big billow is supposed to fill the screen, not leave it. A soft pull
   * back toward the middle of the viewport keeps the whole sheet in view for
   * the whole of the set piece however hard the wind is blowing.
   */
  _contain() {
    const w = this.world;
    const cl = this.cloth;
    cl.centroid(TMP);
    const x = clamp(TMP.x, w.w * 0.30, w.w * 0.62);
    const y = clamp(TMP.y, w.h * 0.26, w.h * 0.70);
    const dx = x - TMP.x, dy = y - TMP.y;
    if (dx === 0 && dy === 0) return;
    cl.translate(dx * 0.18, dy * 0.18);
  }

  /**
   * A soft wall at the edge of the screen. The sheet is the one thing here
   * big enough and light enough to be blown clean out of the picture, and a
   * set piece nobody can see is not a set piece. Only the loose points are
   * pushed back, so the pegs that are still holding stay exactly where the
   * child put them.
   */
  _keepInView() {
    const w = this.world;
    const cl = this.cloth;
    const m = w.min * 0.012;
    const x0 = m, x1 = w.w - m, y1 = w.h - m;
    for (let i = 0; i < cl.n; i++) {
      if (cl.pinned[i]) continue;
      const x = cl.x[i], y = cl.y[i];
      if (x > x1) cl.x[i] = x + (x1 - x) * 0.35;
      else if (x < x0) cl.x[i] = x + (x0 - x) * 0.35;
      if (y > y1) cl.y[i] = y + (y1 - y) * 0.35;
    }
  }

  /**
   * Height field. Two sine trains at different rates give folds that do not
   * look stamped, weighted so the pinned columns stay flat against the pole.
   * flipSign carries the cloth over onto its back during the big release.
   */
  _updateZ() {
    const cl = this.cloth;
    const cols = cl.cols, rows = cl.rows;
    const z = this.z;
    const amp = this.billow;
    const ph = this.zPhase;
    const sgn = this.flipSign;
    for (let r = 0; r < rows; r++) {
      const rv = rows > 1 ? r / (rows - 1) : 0;
      const rw = 0.35 + 0.65 * rv;
      for (let c = 0; c < cols; c++) {
        z[r * cols + c] = amp * (0.25 + 0.75 * this.freeW[c]) * rw * sgn *
          (Math.sin(ph + c * 1.25 + rv * 2.1) + 0.5 * Math.sin(ph * 0.63 - c * 2.3 + rv * 0.9));
      }
    }
  }

  /** "bata-bata": the loose part slapping, tied to the gust. */
  _flutterAudio(dt, released) {
    if (!this.audio || !this.audio.setFlutter) return;
    this._fluCd -= dt;
    if (this._fluCd > 0) return;
    this._fluCd = 0.16;
    const level = (this.state === 'HANGING' && released > 0)
      ? (released / this.popped.length) * (0.35 + 0.65 * this.gust)
      : 0;
    this.audio.setFlutter(level, this.gust);
  }

  // ---- drawing ----------------------------------------------------------
  draw(ctx, world) {
    if (this.state === 'IN_BASKET') return;
    drawClothLit(ctx, this.cloth, this.palette, this.wetness,
      // Negative: the sheet is nearly white to start with, so it has to sit
      // low on the ramp or every fold in it clips to the same flat white.
      this.z, this.sheen, this.sheenPos, -LIGHT_BIAS * 0.35 + this.stretch * 0.04);
    this.drawSpots(ctx);
    this.drawClips(ctx, world);
    // The arms go *round* the bundle: the child draws before the item does,
    // so she hands her forearms back to us to put on top.
    if (this.state === 'CARRYING' && this.hugger && this.hugger.drawHugArms) {
      this.hugger.drawHugArms(ctx, world);
    }
  }

  /**
   * Perceptual incompleteness, turned up. Every peg that comes off makes the
   * survivors bigger, wobblier and brighter, so three-pegs-down is physically
   * uncomfortable to look at until the last one goes.
   */
  drawClips(ctx, world) {
    const released = this.releasedCount;
    const urge = released / this.popped.length;           // 0 .. 1
    const size = Math.max(15, world.min * 0.046) * (1 + 0.30 * urge);
    for (let k = 0; k < this.clipCols.length; k++) {
      const a = this.clipAnim[k];
      if (this.popped[k]) {
        if (a.t < 0 || a.t > 1.1) continue;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - a.t / 1.1);
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rot);
        this.drawClipShape(ctx, size, 0.9);
        ctx.restore();
        continue;
      }
      this.clipPos(k, TMP);
      const wob = this.rainStarted
        ? Math.sin(world.t * (9 + 5 * urge) + k * 2.1) * (0.20 + 0.28 * urge) * (0.35 + this.gust)
        : 0;
      ctx.save();
      ctx.translate(TMP.x, TMP.y);
      // Halo: a soft pulse of light around what is still holding on.
      if (this.rainStarted) {
        const pulse = 0.5 + 0.5 * Math.sin(world.t * (3.2 + 2.4 * urge) + k);
        ctx.globalAlpha = (0.14 + 0.34 * urge) * pulse;
        ctx.fillStyle = '#fff3d0';
        ctx.beginPath();
        ctx.arc(0, 0, size * (1.1 + 0.5 * pulse + 0.4 * urge), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.rotate(wob);
      this.drawClipShape(ctx, size, 0);
      if (this.rainStarted) {
        const glint = Math.max(0, Math.sin(world.t * 4.4 + k) * 0.5 + 0.5) *
          (0.45 + 0.55 * this.gust);
        ctx.globalAlpha = Math.min(1, glint * (0.9 + 0.5 * urge));
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(-size * 0.18, -size * 0.34, size * 0.22, size * 0.12, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  /**
   * window.__game, extended (additively -- id/state/wetness/x/y/clips are
   * untouched). The tests need to aim at individual pegs, and a peg the tests
   * cannot find is a peg a child cannot find either.
   */
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
    out.phase = this.phase;
    return out;
  }

  /** A fat wooden peg, with a seam so it reads as two halves and a spring. */
  drawClipShape(ctx, s, open) {
    const jaw = 0.22 + open * 0.55;
    ctx.fillStyle = 'rgba(60,44,34,0.22)';
    roundRect(ctx, -s * 0.36 + s * 0.06, -s * 0.70 + s * 0.08, s * 0.72, s * 1.22, s * 0.2);
    ctx.fill();
    super.drawClipShape(ctx, s, open);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.beginPath();
    ctx.moveTo(-s * 0.34, -s * 0.34);
    ctx.lineTo(s * 0.34, -s * 0.34);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.70);
    ctx.lineTo(0, -s * 0.40);
    ctx.stroke();
  }
}
