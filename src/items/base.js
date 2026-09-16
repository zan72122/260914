// items/base.js -- the Item interface from the spec, plus the shared
// "constraint -> release -> caught" machinery every laundry item is built on.
//
//   Item
//     layout(world)
//     hitTest(x, y) -> boolean          (deliberately larger than the cloth)
//     hitDistance(x, y) -> number       (0 when the point is on the cloth)
//     onPointerDown/Move/Up(p)
//     update(dt, wind, rain)
//     draw(ctx, world)
//     state: HANGING | RELEASING | CARRYING | IN_BASKET
//     wetness: 0..1
//     overlay: boolean                  (draw order, see below)
//
// `overlay` is false for everything that is still a thing on a balcony: those
// items are drawn behind the window frame, as if seen through the opening. An
// item sets it true for exactly as long as it is physically between the camera
// and the window -- blowing in through the opening, or already in the room --
// and main.js then draws it after the frame. Only the sheet ever does.
//
// Geometry (slot / wFrac / hFrac) is NOT the item's business: it comes from
// items/index.js and nothing here may override it.
//
// THE ONE GESTURE.
//
// Put a finger anywhere on the cloth and pull it toward the room. That is the
// whole game, on every item, in both orientations. A pull past the item's
// threshold pops the first peg; keeping it there pops the next one a beat
// later, and the next, until the cloth is free. Nothing else is ever
// *required*: no lift, no hold, no aiming at a peg.
//
// What differs between the five is what the world does back -- how far it
// wants to be pulled, how long the beats are, whether the hanger rides up the
// pole or a row of little clips goes off like a zip, how the cloth moves,
// what it sounds like. The intent is one finger pulling; the answer is five
// different things happening. (docs/DESIGN.md: 「現実の指使いではなく、
// プレイヤーの意図を一本指入力へ変換」.)
//
// The per-item flourishes are still there for anyone who finds them -- touch
// a peg on the sheet and it opens, lift the shirt off its hook by hand -- but
// they are shortcuts, never the price of admission.

import {
  Cloth, makePalette, drawClothLit, drawWetSpot, setClothScale, relaxShear,
  settleCloth, clampClothVelocity,
} from '../cloth.js';
import { clamp } from '../layout.js';

const TMP = { x: 0, y: 0 };
const BOX = { x0: 0, y0: 0, x1: 0, y1: 0 };

export const MIN_HIT = 64; // css px, per spec

// Flat, dry cloth in full light. drawClothLit is built around a mid-grey base
// so folds have room to go both ways; the small items want to sit brighter
// than that, because dry laundry in the sun is the whole first impression.
export const LIGHT_BIAS = 0.16;

export class Item {
  /**
   * @param {object} world  layout world
   * @param {object} spec   see items/index.js
   * @param {object} hooks  { audio, onRelease(item), onCaught(item) }
   */
  constructor(world, spec, hooks) {
    this.spec = spec;
    this.id = spec.id;
    this.hooks = hooks || {};
    this.audio = this.hooks.audio || null;
    this.state = 'HANGING';
    this.wetness = 0;
    // Draw order. See the note at the top of this file.
    this.overlay = false;
    this.slot = spec.slot;
    this.rgb = spec.rgb;
    this.palette = makePalette(spec.rgb[0], spec.rgb[1], spec.rgb[2]);
    this.clipRGB = spec.clipRGB || [240, 106, 96];
    this.clipCss = 'rgb(' + this.clipRGB.join(',') + ')';

    this.cloth = new Cloth(spec.cols, spec.rows);
    this.cloth.damping = spec.damping || 0.985;
    this.cloth.windScale = spec.windScale === undefined ? 1 : spec.windScale;

    this.clipCols = spec.clipCols || defaultClipCols(spec.cols, spec.clipCount);
    this.popped = new Array(this.clipCols.length).fill(false);
    this.clipAnim = this.clipCols.map(() => ({ t: -1, x: 0, y: 0, vx: 0, vy: 0, rot: 0 }));

    this.grabbing = false;
    this.grabIdx = -1;
    this.grabOX = 0;
    this.grabOY = 0;
    this.occl = 0;          // finger-occlusion offset ramp, 0..1
    this.poppedThisGrab = false;
    this.stretch = 0;       // 0..1, how far this stroke has got (visual feedback)
    this.along = 0;         // this stroke's travel toward the room, css px
    this.pullX = 0;
    this.pullY = 0;
    this.beatT = 0;         // time since the last peg went, this stroke
    this.grabLit = 0;       // "I have hold of it": the cloth brightens
    this.grabWob = 0;       // ...and the pegs holding it wobble
    this.settleT = 0;       // extra constraint work after the finger lets go
    this.cueGlint = 0;      // set while the child is pointing at this one
    this.releaseT = 0;
    this.spots = [];
    this.gust = 0;
    this.gustPulse = 0;
    this.rainStarted = false;
    this.carryX = 0;
    this.carryY = 0;
    this.anchor = { x: 0, y: 0, w: 0, h: 0 };
    // How far the drawn item spills past its cloth, as a fraction of the
    // cloth's width. The shirt's sleeves are the only thing that does.
    this.visualOverhang = 0;

    // --- the wind you can see (phase 3) ---------------------------------
    // `billow` is how much this cloth is currently ballooning toward the
    // camera, 0..1. It grows the mesh's rest lengths (the same 2.5D trick the
    // sheet uses), lifts the hem, and feeds the height field `z` that lights
    // the strips, so a gust reads as depth and not only as sideways drift.
    this.billow = 0;
    this.billowTo = 0;
    this.zPhase = Math.random() * 6.283;
    this.z = new Float32Array(this.cloth.n);
    // Items that run their own billow (the sheet) or have none (the rigid
    // pinch frame) set this and the shared code leaves them alone.
    this.selfBillow = false;

    this.layout(world);
  }

  // ---- geometry ---------------------------------------------------------
  layout(world) {
    this.world = world;
    const pole = world.pole;
    const op = world.opening;
    const w = pole.width * this.spec.wFrac;
    const h = op.h * this.spec.hFrac * (world.clothV === undefined ? 1 : world.clothV);
    const cx = pole.x0 + pole.width * this.slot;
    const x = cx - w / 2;
    const y = pole.y;
    const prev = this.anchor;
    const hadAnchor = prev.w > 0;
    this.anchor = { x, y, w, h };
    this.baseRestH = w / (this.cloth.cols - 1);
    this.baseRestV = h / (this.cloth.rows - 1);
    // Spec 1: never smaller than a fingertip. The pad is the *whole* 64 css px
    // on every side, which means neighbouring pads overlap heavily -- that is
    // why main.js scores a hit by distance to the cloth first and only uses
    // the centroid to break an exact tie.
    this.hitPad = Math.max(MIN_HIT, world.min * 0.085);

    if (this.state === 'HANGING' && !this.grabbing) {
      this.cloth.reset(x, y, w, h);
      this.applyPins();
    } else if (hadAnchor) {
      // Mid-flight (or mid-drag): keep the simulation, just move it so it
      // stays in the same relative place in the new layout.
      this.cloth.centroid(TMP);
      const relX = prev.w ? (TMP.x - prev.x) / prev.w : 0.5;
      const relY = prev.h ? (TMP.y - prev.y) / prev.h : 0.5;
      const tx = x + relX * w - TMP.x;
      const ty = y + relY * h - TMP.y;
      this.cloth.translate(tx, ty);
      if (this.state === 'HANGING') this.applyPins();
    }
  }

  /** Re-pin the pegs that have not popped yet, at their pole positions. */
  applyPins() {
    const cols = this.cloth.cols;
    this.cloth.unpinAll();
    for (let k = 0; k < this.clipCols.length; k++) {
      if (this.popped[k]) continue;
      const c = this.clipCols[k];
      const i = this.cloth.idx(c, 0);
      this.cloth.pin(i, this.anchor.x + (c / (cols - 1)) * this.anchor.w, this.anchor.y);
    }
  }

  clipPos(k, out) {
    const cols = this.cloth.cols;
    const i = this.cloth.idx(this.clipCols[k], 0);
    out.x = this.cloth.x[i];
    out.y = this.cloth.y[i];
    return out;
  }

  // ---- hit testing ------------------------------------------------------
  hitBox() {
    this.cloth.bounds(BOX);
    return BOX;
  }

  hitTest(x, y) {
    if (this.state !== 'HANGING') return false;
    const b = this.hitBox();
    const p = this.hitPad;
    return x >= b.x0 - p && x <= b.x1 + p && y >= b.y0 - p && y <= b.y1 + p;
  }

  /**
   * How far the finger is from this actual piece of cloth, in css px.
   *
   * Measured to the nearest point of the mesh, not to the bounding box: a
   * towel swinging on a gust has a box half as wide again as the towel, and
   * on a line this tightly packed that box reaches well into its neighbours.
   * The mesh does not lie -- the nearest vertex of the thing the finger is
   * actually on is a few px away at most, and the nearest vertex of anything
   * else is a whole item away. Costs one pass over 30-70 points, on
   * pointerdown only.
   */
  hitDistance(x, y) {
    const cl = this.cloth;
    // On the cloth is on the cloth: if the point is inside any cell of the
    // mesh the distance is zero, whatever the vertices are doing. Measuring to
    // the nearest *vertex* instead used to hand the middle of the pinch
    // hanger -- a rigid frame four rows deep, so its vertices are a long way
    // apart -- to whichever neighbour happened to have a vertex nearer, and a
    // finger squarely on one item ended up dragging another.
    const cols = cl.cols, rows = cl.rows;
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const i = r * cols + c;
        if (inQuad(x, y, cl, i, i + 1, i + cols + 1, i + cols)) return 0;
      }
    }
    let best = Infinity;
    for (let i = 0; i < cl.n; i++) {
      const dx = cl.x[i] - x, dy = cl.y[i] - y;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  /** Is the finger on one of the pegs still holding this up? */
  nearPeg(x, y) {
    const r = Math.max(28, this.world.min * 0.07);
    const r2 = r * r;
    for (let k = 0; k < this.clipCols.length; k++) {
      if (this.popped[k]) continue;
      this.clipPos(k, TMP);
      const dx = TMP.x - x, dy = TMP.y - y;
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }

  /**
   * The rectangle this item actually *occupies* when it is hanging at rest --
   * the cloth plus anything drawn outside it. Two of these may never overlap;
   * see the packing table in items/index.js.
   */
  visualBox(out) {
    const a = this.anchor;
    const o = out || {};
    const over = a.w * this.visualOverhang;
    o.x0 = a.x - over;
    o.x1 = a.x + a.w + over;
    o.y0 = a.y;
    o.y1 = a.y + a.h;
    return o;
  }

  get cx() { this.cloth.centroid(TMP); return TMP.x; }
  get cy() { this.cloth.centroid(TMP); return TMP.y; }

  // ---- input ------------------------------------------------------------
  /** The piece of cloth under the finger. The whole body is fair game. */
  grabPoint(x, y) {
    const cl = this.cloth;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < cl.n; i++) {
      if (cl.pinned[i]) continue;
      const dx = cl.x[i] - x, dy = cl.y[i] - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) best = cl.idx((cl.cols / 2) | 0, cl.rows - 1);
    return best;
  }

  onPointerDown(p) {
    if (this.state !== 'HANGING') return false;
    const cl = this.cloth;
    const best = this.grabPoint(p.x, p.y);
    this.grabIdx = best;
    this.grabOX = cl.x[best] - p.x;
    this.grabOY = cl.y[best] - p.y;
    this.grabbing = true;
    this.occl = 0;
    this.poppedThisGrab = false;
    this.stretch = 0;
    this.along = 0;
    this.beatT = 0;
    this.settleT = 0;
    this.pullX = p.x;
    this.pullY = p.y;
    this.grabFeedback();
    return true;
  }

  /**
   * The answer to the touch, before the finger has moved a millimetre.
   *
   * The playtest was unambiguous about this: the washing is always swaying in
   * the wind, so a tap that does nothing and a tap that took hold look exactly
   * the same, and a child who cannot tell them apart stops trying. So the
   * moment a finger lands the cloth comes *off* its rest shape toward the
   * room, brightens as if it had turned into the light, the pegs holding it
   * jump, and there is a soft "fusa". All four say the same thing: I have it.
   */
  grabFeedback() {
    const cl = this.cloth;
    const d = this.world.inDir;
    const k = Math.max(5, this.world.min * 0.030);
    const rows = cl.rows, cols = cl.cols;
    for (let r = 0; r < rows; r++) {
      // The hem moves most; the row under the pegs barely can.
      const rv = rows > 1 ? r / (rows - 1) : 1;
      const a = k * (0.30 + 0.70 * rv);
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (cl.pinned[i]) continue;
        cl.x[i] += d.x * a;
        cl.y[i] += d.y * a;
        // ...and keep going for a moment: a lift, not a teleport.
        cl.ox[i] -= d.x * a * 0.22;
        cl.oy[i] -= d.y * a * 0.22;
      }
    }
    this.grabLit = 1;
    this.grabWob = 1;
    if (this.audio && this.audio.fusa) this.audio.fusa();
  }

  onPointerMove(p) {
    if (!this.grabbing) return;
    const w = this.world;
    const fo = w.fingerOffset;
    const tx = p.x + this.grabOX + fo.x * this.occl * 0.55;
    const ty = p.y + this.grabOY + fo.y * this.occl * 0.55;
    this.cloth.pin(this.grabIdx, tx, ty);
    this.pullX = p.x;
    this.pullY = p.y;
    this.along = p.along;
    this.stretch = clamp(this.pullDistance() / this.pullThreshold(), 0, 1);
  }

  /**
   * How far this stroke counts as having pulled. The finger's own travel,
   * unless the item has a reason to measure something else (the jeans measure
   * the waistband, which is always a long way behind the finger).
   */
  pullDistance() { return this.along; }

  /** Seconds between the pegs of one continued pull. */
  popBeat() { return this.spec.popBeat === undefined ? 0.20 : this.spec.popBeat; }

  /**
   * The pull, resolved once per frame rather than per pointermove.
   *
   * Beats are the whole point. The first peg goes the moment the pull is far
   * enough; the next one waits, and in that gap the cloth does something worth
   * watching -- the towel swings onto the diagonal, the sheet's freed corner
   * fills with air. A finger that stays where it is keeps the pull alive and
   * the beats keep coming; a finger that lets go leaves the rest for the next
   * pull, which is just as good a way to play.
   */
  updatePull(dt) {
    if (!this.grabbing || this.state !== 'HANGING') return;
    this.beatT += dt;
    if (this.pullDistance() < this.pullThreshold()) return;
    if (this.poppedThisGrab && this.beatT < this.popBeat()) return;
    this.beatT = 0;
    this.popClip(this.pullPoint());
  }

  pullPoint() {
    const o = this._pp || (this._pp = { x: 0, y: 0 });
    o.x = this.pullX; o.y = this.pullY;
    return o;
  }

  onPointerUp() { this.endGrab(); }
  onPointerCancel() { this.endGrab(); }

  endGrab() {
    if (!this.grabbing) return;
    this.grabbing = false;
    this.stretch = 0;
    this.occl = 0;
    this.along = 0;
    this.beatT = 0;
    if (this.state === 'HANGING') {
      this.applyPins();
      // Hand back a cloth, not a wreck. See settleCloth in cloth.js. A pull
      // that went the wrong way is the worst case -- the mesh has been hauled
      // sideways across its own pins -- so the solve is hard enough to undo
      // that in one call, and the half second after it keeps it honest.
      settleCloth(this.cloth, 16, 0.75);
      this.settleT = 0.6;
    }
    this.grabIdx = -1;
  }

  /**
   * How far toward the room this has to be dragged.
   *
   * Scaled by the *square root* of the viewport: an iPad is 2.1x an iPhone
   * across, but a four year old's arm is the same length on both, so a linear
   * scale turned every gesture on the big screen into a haul. sqrt keeps the
   * threshold comfortably bigger on a tablet without making it child-sized on
   * one device and adult-sized on the other.
   */
  pullThreshold() {
    return (this.spec.pullPx || 44) * Math.max(0.85, Math.sqrt(this.world.min / 390));
  }

  // ---- release ----------------------------------------------------------
  /** Pop the peg nearest the finger: familiar physical causality. */
  popClip(p) {
    let k = -1, bestD = Infinity;
    for (let i = 0; i < this.clipCols.length; i++) {
      if (this.popped[i]) continue;
      this.clipPos(i, TMP);
      const d = Math.abs(TMP.x - p.x) + Math.abs(TMP.y - p.y) * 0.3;
      if (d < bestD) { bestD = d; k = i; }
    }
    if (k < 0) return;
    this.popped[k] = true;
    this.poppedThisGrab = true;
    this.clipPos(k, TMP);
    const a = this.clipAnim[k];
    a.t = 0; a.x = TMP.x; a.y = TMP.y;
    a.vx = (Math.random() - 0.5) * 120;
    a.vy = -90 - Math.random() * 80;
    a.rot = 0;
    const fi = this.cloth.idx(this.clipCols[k], 0);
    this.cloth.unpin(fi);
    // Kick the freed corner so the cloth visibly swings loose and, with one
    // peg left, ends up hanging on the diagonal (perceptual incompleteness).
    this.cloth.ox[fi] = this.cloth.x[fi] - this.world.inDir.x * 2.5;
    this.cloth.oy[fi] = this.cloth.y[fi] - this.world.inDir.y * 2.5 - 1.5;
    if (this.audio) this.audio.clip(this.spec.clipPitch || 1, this.spec.clipLen || 0.06);

    const remaining = this.popped.filter((v) => !v).length;
    if (remaining === 0) this.release();
    else if (this.audio) this.audio.cloth((this.spec.clothSize || 1) * 0.45);
  }

  release() {
    this.state = 'RELEASING';
    this.releaseT = 0;
    this.grabbing = false;
    this.grabIdx = -1;
    this.cloth.unpinAll();
    if (this.audio) {
      this.audio.cloth(this.spec.clothSize || 1);
      if (this.spec.heavy) this.audio.heavy(1);
    }
    if (this.hooks.onRelease) this.hooks.onRelease(this);
  }

  /** Character has it: follow the hands. */
  beginCarry(x, y) {
    this.state = 'CARRYING';
    this.carryX = x;
    this.carryY = y;
  }

  setCarry(x, y) { this.carryX = x; this.carryY = y; }

  stow() {
    this.state = 'IN_BASKET';
    this.cloth.unpinAll();
  }

  addSpot(u, v, r) { this.spots.push({ u, v, r: r || 0.12, a: 0, grow: 0 }); }

  // ---- simulation -------------------------------------------------------
  update(dt, wind, rain) {
    const sp = this.spec;
    if (this.grabbing) this.occl = Math.min(1, this.occl + dt * 6);
    this.updatePull(dt);
    // "I have hold of it" fades, but never all the way while the finger is
    // still down: a child who looks away and back must still be able to tell.
    const litFloor = this.grabbing ? 0.55 : 0;
    this.grabLit = Math.max(litFloor, this.grabLit - dt * 2.2);
    this.grabWob = Math.max(0, this.grabWob - dt * 2.0);
    this.cueGlint = Math.max(0, this.cueGlint - dt * 1.6);
    if (!this.selfBillow) this._billow(dt);

    if (this.state === 'HANGING' || this.state === 'RELEASING') {
      if (rain > 0) {
        this.wetness = clamp(this.wetness + dt * rain * 0.055, 0, 0.85);
      }
    }
    // The wet marks: they arrive quickly and then keep spreading, because a
    // stain that has stopped spreading is scenery and a stain that is still
    // spreading is a reason to hurry.
    for (let i = 0; i < this.spots.length; i++) {
      const sp2 = this.spots[i];
      sp2.a = Math.min(1, sp2.a + dt * 1.8);
      sp2.grow = Math.min(1, (sp2.grow || 0) + dt * 0.13);
    }
    // Popped pegs tumble away for a moment: immediate visual feedback.
    for (let k = 0; k < this.clipAnim.length; k++) {
      const a = this.clipAnim[k];
      if (a.t < 0 || a.t > 1.2) continue;
      a.t += dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.vy += 1500 * dt;
      a.rot += dt * 7;
    }

    const cl = this.cloth;
    if (this.state === 'HANGING') {
      cl.step(dt, wind.x, wind.y, sp.gravityK || 1);
    } else if (this.state === 'RELEASING') {
      this.releaseT += dt;
      // Released cloth is drawn indoors by the wind and the child's hands.
      const pull = 520 * (sp.heavy ? 0.7 : 1);
      cl.step(dt, wind.x * 0.4 + this.world.inDir.x * pull,
        wind.y * 0.4 + this.world.inDir.y * pull * 0.2, (sp.gravityK || 1) * 0.55);
    } else if (this.state === 'CARRYING') {
      const top = cl.idx((cl.cols / 2) | 0, 0);
      cl.pin(top, this.carryX, this.carryY);
      cl.step(dt, wind.x * 0.06, 0, (sp.gravityK || 1) * 0.5);
    }
    if (!this.selfBillow) {
      this._gustLift(dt);
      // Cloth keeps its shape under shear; without this a long, narrow towel
      // in a gust folds up on itself and reads as a twisted rag. Same helper
      // the sheet uses, at a fraction of the stiffness.
      if (this.state !== 'IN_BASKET') relaxShear(this.cloth, 0.30);
      this._updateZ();
    }
    this._settle(dt);
  }

  /**
   * The half second after the finger lets go.
   *
   * Three extra relaxation passes a frame and a speed limit, for as long as it
   * takes the mesh to forget it was being hauled on. Without it the cloth can
   * sit there stretched or kinked for long enough to read as broken -- which
   * is exactly what the playtest saw, over and over.
   */
  _settle(dt) {
    if (this.settleT <= 0) return;
    this.settleT -= dt;
    const cl = this.cloth;
    for (let k = 0; k < 3; k++) {
      cl.solve();
      relaxShear(cl, 0.5);
    }
    clampClothVelocity(cl, Math.max(4, this.world.min * 0.03));
  }

  /**
   * Ride the gust.
   *
   * In portrait `inDir` points *down*, which in a 2.5D picture reads as
   * "toward the room, toward the camera" -- and a cloth that only moves along
   * it looks like a cloth doing nothing at all. So a gust does three visible
   * things at once: the weather pushes it sideways (weather.js puts a lateral
   * kick on every gust in portrait), the mesh grows toward the lens, and the
   * hem lifts. Together they are the "look, the wind" beat.
   */
  _billow(dt) {
    const g = this.gust;
    // Only while it is still pegged up. Once it has been let go the air in it
    // is the release's business, and a hem lift here would fight the fall.
    const hanging = this.state === 'HANGING';
    this.billowTo = hanging ? (this.rainStarted ? 0.10 + 0.95 * g : 0.06) : 0;
    // Fast to fill, slow to empty: cloth snaps out and then subsides.
    const k = this.billowTo > this.billow ? 7.5 : 2.2;
    this.billow += (this.billowTo - this.billow) * Math.min(1, dt * k);
    this.zPhase += dt * (2.2 + 6.5 * g);
    if (this.baseRestH) {
      // Perspective, cheaply: a cloth ballooning at the camera gets wider
      // across and shorter down the screen, because more of its length is
      // pointing at the lens. Same helper the sheet scales itself with, given
      // two different rest lengths instead of one zoom.
      setClothScale(this.cloth, this.baseRestH * (1 + this.billow * 0.13),
        this.baseRestV * (1 - this.billow * 0.11), 1);
    }
  }

  /** The hem comes up on a gust; the rows nearest it come up most. */
  _gustLift(dt) {
    const b = this.billow;
    if (b <= 0.03) return;
    const cl = this.cloth;
    const rows = cl.rows, cols = cl.cols;
    if (rows < 2) return;
    // At full gust the bottom row is pushed up harder than gravity pulls it
    // down, so the hem actually curls upward instead of merely swinging --
    // which is the difference between cloth in wind and cloth on a string.
    const lift = this.world.min * (1.2 + 2.6 * this.gust) * b *
      (this.spec.windScale === undefined ? 1 : this.spec.windScale);
    const dt2 = dt * dt;
    for (let r = 1; r < rows; r++) {
      const rv = r / (rows - 1);
      const a = lift * rv * rv * dt2;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (cl.pinned[i]) continue;
        cl.y[i] -= a;
      }
    }
  }

  /**
   * Height field for the lit renderer: how far each point of the cloth stands
   * out of the plane, in rest cells. Zero when the air is still, so a calm
   * cloth is flat and evenly lit and only a gust puts folds in it.
   */
  _updateZ() {
    const cl = this.cloth;
    const cols = cl.cols, rows = cl.rows;
    const z = this.z;
    const amp = this.billow;
    const ph = this.zPhase;
    for (let r = 0; r < rows; r++) {
      const rv = rows > 1 ? r / (rows - 1) : 0;
      const rw = 0.30 + 0.70 * rv;
      for (let c = 0; c < cols; c++) {
        z[r * cols + c] = amp * rw *
          (Math.sin(ph + c * 1.1 + rv * 1.9) + 0.45 * Math.sin(ph * 0.7 - c * 2.1));
      }
    }
  }

  /** The pole was rung: every peg on this item swings. */
  nudge() {
    this.grabWob = 1;
    const cl = this.cloth;
    for (let i = 0; i < cl.n; i++) {
      if (cl.pinned[i]) continue;
      cl.ox[i] += 0.8;
    }
  }

  setWeather(gust, gustPulse, started) {
    this.gust = gust;
    this.gustPulse = gustPulse;
    this.rainStarted = started;
  }

  // ---- drawing ----------------------------------------------------------
  draw(ctx, world) {
    if (this.state === 'IN_BASKET') return;
    // Lit strips, not flat ones: the same renderer the sheet uses, so a gust
    // puts real light and shade into every piece of washing on the line.
    drawClothLit(ctx, this.cloth, this.palette, this.wetness, this.z,
      0, 0, LIGHT_BIAS + this.stretch * 0.05 + this.grabLit * 0.11);
    this.drawSpots(ctx);
    this.drawClips(ctx, world);
  }

  drawSpots(ctx) {
    if (!this.spots.length) return;
    const cl = this.cloth;
    const cols = cl.cols, rows = cl.rows;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      const c = clamp(Math.round(s.u * (cols - 1)), 0, cols - 1);
      const r = clamp(Math.round(s.v * (rows - 1)), 0, rows - 1);
      const idx = cl.idx(c, r);
      drawWetSpot(ctx, cl.x[idx], cl.y[idx],
        this.anchor.w * s.r * (0.75 + s.a * 1.15 + (s.grow || 0) * 1.5),
        Math.min(1, s.a * 1.05));
    }
  }

  /**
   * The pegs are the signifiers: chunky, high contrast, and once the rain has
   * started they wobble and glint with every gust so the eye is pulled to the
   * thing that is holding the cloth down.
   */
  drawClips(ctx, world) {
    const size = Math.max(11, world.min * 0.033);
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
      let wob = this.rainStarted
        ? Math.sin(world.t * 9 + k * 2.1) * 0.20 * (0.25 + this.gust)
        : 0;
      // Grabbed: the pegs holding it jump, because something just pulled.
      wob += Math.sin(world.t * 27 + k * 1.7) * 0.34 * this.grabWob;
      ctx.save();
      ctx.translate(TMP.x, TMP.y);
      // Pointed at: a soft halo, so the eye lands on what is holding it down.
      if (this.cueGlint > 0.02) {
        const pulse = 0.5 + 0.5 * Math.sin(world.t * 6.2 + k);
        ctx.globalAlpha = this.cueGlint * (0.30 + 0.45 * pulse);
        ctx.fillStyle = '#ffe9a0';
        ctx.beginPath();
        ctx.arc(0, 0, size * (1.5 + 0.9 * pulse), 0, Math.PI * 2);
        ctx.fill();
        // ...and a ring going out from it, so the halo survives being drawn
        // over a bright sky.
        ctx.globalAlpha = this.cueGlint * (1 - pulse) * 0.85;
        ctx.strokeStyle = '#fff6d8';
        ctx.lineWidth = Math.max(1.5, size * 0.16);
        ctx.beginPath();
        ctx.arc(0, 0, size * (1.3 + 1.5 * pulse), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.rotate(wob);
      this.drawClipShape(ctx, size, 0);
      if (this.rainStarted || this.cueGlint > 0.02) {
        const glint = Math.max(0, Math.sin(world.t * 4 + k) * 0.5 + 0.5) *
          (0.35 + 0.65 * this.gust) + this.cueGlint * 0.7;
        ctx.globalAlpha = glint * 0.9;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(-size * 0.18, -size * 0.34, size * 0.20, size * 0.11, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  /** A clothes peg: body, spring pivot, and an open jaw you can read. */
  drawClipShape(ctx, s, open) {
    const jaw = 0.22 + open * 0.55;
    ctx.fillStyle = this.clipCss;
    roundRect(ctx, -s * 0.34, -s * 0.72, s * 0.68, s * 1.25, s * 0.2);
    ctx.fill();
    // Jaw gap
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.save();
    ctx.translate(0, s * 0.30);
    ctx.rotate(jaw * 0.5);
    ctx.fillRect(-s * 0.30, 0, s * 0.60, s * 0.22);
    ctx.restore();
    // Spring
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(1.5, s * 0.10);
    ctx.beginPath();
    ctx.arc(0, -s * 0.06, s * 0.22, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }

  /** Data for window.__game (tests only). */
  snapshot(out) {
    out.id = this.id;
    out.state = this.state;
    out.wetness = Math.round(this.wetness * 1000) / 1000;
    this.cloth.centroid(TMP);
    out.x = Math.round(TMP.x * 10) / 10;
    out.y = Math.round(TMP.y * 10) / 10;
    out.clips = this.popped.filter((v) => !v).length;
    // Mutated, never rebuilt: this runs every drawn frame.
    const b = this.visualBox(this._vb || (this._vb = {}));
    const ob = out.box || (out.box = { x0: 0, y0: 0, x1: 0, y1: 0 });
    ob.x0 = r1(b.x0); ob.y0 = r1(b.y0); ob.x1 = r1(b.x1); ob.y1 = r1(b.y1);
    this.cloth.bounds(BOX);
    const on = out.bounds || (out.bounds = { x0: 0, y0: 0, x1: 0, y1: 0 });
    on.x0 = r1(BOX.x0); on.y0 = r1(BOX.y0); on.x1 = r1(BOX.x1); on.y1 = r1(BOX.y1);
    // The shape this item has when nothing is touching it: the tests compare
    // the live bounds against it after a rotation or a wrong-way pull.
    const a = this.anchor;
    const oa = out.anchor || (out.anchor = { x: 0, y: 0, w: 0, h: 0 });
    oa.x = r1(a.x); oa.y = r1(a.y); oa.w = r1(a.w); oa.h = r1(a.h);
    out.strain = Math.round(this.cloth.strain() * 100) / 100;
    out.pad = Math.round(this.hitPad * 10) / 10;
    out.spots = this.spots.length;
    out.billow = Math.round(this.billow * 1000) / 1000;
    out.grabbed = !!this.grabbing;
    out.lit = Math.round(this.grabLit * 100) / 100;
    out.stretch = Math.round(this.stretch * 100) / 100;
    return out;
  }
}

function r1(v) { return Math.round(v * 10) / 10; }

/** Is (x, y) inside the quad a-b-c-d? Same winding both ways, so either. */
function inQuad(x, y, cl, a, b, c, d) {
  let pos = 0, neg = 0;
  const idx = [a, b, c, d];
  for (let k = 0; k < 4; k++) {
    const i = idx[k], j = idx[(k + 1) & 3];
    const cross = (cl.x[j] - cl.x[i]) * (y - cl.y[i]) - (cl.y[j] - cl.y[i]) * (x - cl.x[i]);
    if (cross > 0) pos++; else if (cross < 0) neg++;
  }
  return pos === 0 || neg === 0;
}

export function defaultClipCols(cols, count) {
  const n = Math.max(1, count || 2);
  if (n === 1) return [(cols / 2) | 0];
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.round((cols - 1) * (i / (n - 1))));
  return out;
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
