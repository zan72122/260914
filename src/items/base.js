// items/base.js -- the Item interface from the spec, plus the shared
// "constraint -> release -> caught" machinery every laundry item is built on.
//
//   Item
//     layout(world)
//     hitTest(x, y) -> boolean          (deliberately larger than the cloth)
//     onPointerDown/Move/Up(p)
//     update(dt, wind, rain)
//     draw(ctx, world)
//     state: HANGING | RELEASING | CARRYING | IN_BASKET
//     wetness: 0..1
//
// The base behaviour is the two-peg pull: drag toward `world.inDir`, each
// stroke past the threshold pops one peg, the last peg frees the cloth. The
// towel is the fully-tuned reference implementation of it; the other four
// items currently inherit it and are marked as placeholders.

import { Cloth, makePalette, drawCloth, drawWetSpot } from '../cloth.js';
import { clamp } from '../layout.js';

const TMP = { x: 0, y: 0 };
const BOX = { x0: 0, y0: 0, x1: 0, y1: 0 };

export const MIN_HIT = 64; // css px, per spec

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
    this.releaseT = 0;
    this.spots = [];
    this.gust = 0;
    this.gustPulse = 0;
    this.rainStarted = false;
    this.carryX = 0;
    this.carryY = 0;
    this.anchor = { x: 0, y: 0, w: 0, h: 0 };

    this.layout(world);
  }

  // ---- geometry ---------------------------------------------------------
  layout(world) {
    this.world = world;
    const pole = world.pole;
    const op = world.opening;
    const w = pole.width * this.spec.wFrac;
    const h = op.h * this.spec.hFrac;
    const cx = pole.x0 + pole.width * this.slot;
    const x = cx - w / 2;
    const y = pole.y;
    const prev = this.anchor;
    const hadAnchor = prev.w > 0;
    this.anchor = { x, y, w, h };
    this.hitPad = Math.max(MIN_HIT * 0.5, world.min * 0.085);

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

  /** Distance to the cloth, used to pick the front-most item under a finger. */
  hitDistance(x, y) {
    const b = this.hitBox();
    const dx = Math.max(b.x0 - x, 0, x - b.x1);
    const dy = Math.max(b.y0 - y, 0, y - b.y1);
    return Math.sqrt(dx * dx + dy * dy);
  }

  get cx() { this.cloth.centroid(TMP); return TMP.x; }
  get cy() { this.cloth.centroid(TMP); return TMP.y; }

  // ---- input ------------------------------------------------------------
  onPointerDown(p) {
    if (this.state !== 'HANGING') return false;
    // Grab the edge of the cloth that keeps the rest of it clear of the
    // finger: the hem in portrait, the inner edge in landscape.
    const cl = this.cloth;
    const cols = cl.cols, rows = cl.rows;
    let best = -1, bestD = Infinity;
    if (this.world.portrait) {
      for (let c = 0; c < cols; c++) {
        const i = cl.idx(c, rows - 1);
        const d = Math.abs(cl.x[i] - p.x);
        if (d < bestD) { bestD = d; best = i; }
      }
    } else {
      for (let r = 1; r < rows; r++) {
        const i = cl.idx(0, r);
        const d = Math.abs(cl.y[i] - p.y);
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    this.grabIdx = best;
    this.grabOX = cl.x[best] - p.x;
    this.grabOY = cl.y[best] - p.y;
    this.grabbing = true;
    this.occl = 0;
    this.poppedThisGrab = false;
    this.stretch = 0;
    return true;
  }

  onPointerMove(p) {
    if (!this.grabbing) return;
    const w = this.world;
    const fo = w.fingerOffset;
    const tx = p.x + this.grabOX + fo.x * this.occl * 0.55;
    const ty = p.y + this.grabOY + fo.y * this.occl * 0.55;
    this.cloth.pin(this.grabIdx, tx, ty);
    const th = this.pullThreshold();
    this.stretch = clamp(p.along / th, 0, 1);
    if (!this.poppedThisGrab && p.along >= th) this.popClip(p);
  }

  onPointerUp() { this.endGrab(); }
  onPointerCancel() { this.endGrab(); }

  endGrab() {
    if (!this.grabbing) return;
    this.grabbing = false;
    this.stretch = 0;
    this.occl = 0;
    if (this.state === 'HANGING') this.applyPins(); // springs back on its own
    this.grabIdx = -1;
  }

  pullThreshold() {
    return (this.spec.pullPx || 44) * Math.max(0.85, this.world.min / 390);
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

  addSpot(u, v, r) { this.spots.push({ u, v, r: r || 0.12, a: 0 }); }

  // ---- simulation -------------------------------------------------------
  update(dt, wind, rain) {
    const sp = this.spec;
    if (this.grabbing) this.occl = Math.min(1, this.occl + dt * 6);

    if (this.state === 'HANGING' || this.state === 'RELEASING') {
      if (rain > 0) {
        this.wetness = clamp(this.wetness + dt * rain * 0.055, 0, 0.85);
      }
    }
    for (let i = 0; i < this.spots.length; i++) {
      this.spots[i].a = Math.min(1, this.spots[i].a + dt * 1.4);
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
  }

  setWeather(gust, gustPulse, started) {
    this.gust = gust;
    this.gustPulse = gustPulse;
    this.rainStarted = started;
  }

  // ---- drawing ----------------------------------------------------------
  draw(ctx, world) {
    if (this.state === 'IN_BASKET') return;
    drawCloth(ctx, this.cloth, this.palette, this.wetness, this.stretch * 0.05);
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
      drawWetSpot(ctx, cl.x[idx], cl.y[idx], this.anchor.w * s.r * (0.5 + s.a * 0.9), s.a * 0.9);
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
      const wob = this.rainStarted
        ? Math.sin(world.t * 9 + k * 2.1) * 0.20 * (0.25 + this.gust)
        : 0;
      ctx.save();
      ctx.translate(TMP.x, TMP.y);
      ctx.rotate(wob);
      this.drawClipShape(ctx, size, 0);
      if (this.rainStarted) {
        const glint = Math.max(0, Math.sin(world.t * 4 + k) * 0.5 + 0.5) * (0.35 + 0.65 * this.gust);
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
    return out;
  }
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
