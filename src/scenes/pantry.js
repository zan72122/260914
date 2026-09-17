import { Scene } from './scene.js';
import { FlourSpill } from '../debris/flour.js';
import { Chip } from '../debris/chip.js';
import { Prop, resolveProps } from '../props/prop.js';
import { makePantryFloor, paintPantryMotif } from '../floors/pantry.js';
import { TAU, clamp, smoothstep } from '../core/math.js';

const RR = { x0: 0, y0: 0, x1: 0, y1: 0 };

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Room — the pantry behind the kitchen: a bag of flour has gone over.
 *
 * Every other room in the house shows you a THING moving in the air. This one
 * shows you the air itself. The flour is a density film, and the airflow does
 * three visibly different things to it depending only on how the child moves
 * one finger:
 *
 *   come slowly   the far edge frays into streaks that curve round into the
 *                 mouth, single grains lift off and creep in ahead of the film
 *   come fast     the whole patch is thrown up into a cloud that hangs, drifts,
 *                 and settles back WIDER and thinner than it was
 *   hold still    a dense white line runs into the mouth, the cloud is dragged
 *                 down out of the air, and the drift under the head is dug out
 *                 into a clean black hole that widens
 *
 * So the lesson is physical and wordless: rushing spreads it, holding gathers
 * it. Underneath is a bright painted tile motif that appears track by track,
 * and buried in the flour are a wooden spoon (which cannot be swallowed, only
 * shoved out of the way) and three chocolate chips that surface as the film
 * thins over them.
 */
export class PantryScene extends Scene {
  constructor(rng) {
    super('pantry', rng);
    this.spill = null;
    this.chips = [];
    this.spoon = null;
    this.bloom = 0;
    this._spoonPrev = { x: 0, y: 0 };
    this._saveT = 0;
  }

  _p(nx, ny) { return { x: (nx - 0.5) * this.vw, y: (ny - 0.5) * this.vh }; }

  // ---------------------------------------------------------------- layout

  layout(pose, w, h) {
    super.layout(pose, w, h);
    const vw = this.vw, vh = this.vh;
    this.debris.length = 0;
    this.props.length = 0;
    this.chips.length = 0;
    this.bloom = this.persist.bloom || 0;
    const rng = this.rng;
    const portrait = pose === 'portrait';

    this.rest = { x: 0, y: 0, zoom: this.scale, tilt: portrait ? 0.16 : 0.08 };
    this.startPointer = portrait ? { x: 0.5, y: 0.84 } : { x: 0.86, y: 0.88 };

    const fr = portrait
      ? { x0: -vw * 0.78, y0: -vh * 0.66, x1: vw * 0.78, y1: vh * 0.66 }
      : { x0: -vw * 0.62, y0: -vh * 0.70, x1: vw * 0.62, y1: vh * 0.70 };
    this.floor = makePantryFloor(fr, rng, { tile: portrait ? 58 : 62 });
    this.floor.smoothBase = true;

    // A tall phone gives a very long aisle; past a point that is not a bigger
    // room, it is a longer chore. The spill is sized against a CAPPED height so
    // the job is the same size everywhere and the extra screen is just more
    // pantry to walk down.
    const vhc = Math.min(vh, 700);
    let prect, safe, src, dir, flen, fwide, bag, legs, chipAt, spoonAt, motif;
    if (portrait) {
      // ---- a narrow pantry receding between two runs of shelving ---------
      this.shelfX = vw * 0.335;
      this.legX = vw * 0.300;
      this.backY = -vh * 0.330;                 // front edge of the low shelf
      bag = { x: -vw * 0.075, y: -vh * 0.450, a: 1.50 };
      src = { x: -vw * 0.020, y: -vh * 0.300 };
      dir = { x: 0.10, y: 0.995 };
      flen = vhc * 0.330; fwide = vw * 0.086;
      prect = { x0: -vw * 0.40, y0: -vh * 0.335 - 20, x1: vw * 0.40, y1: -vh * 0.335 + vhc * 0.52 };
      safe = { x0: -vw * 0.318, y0: -vh * 0.312, x1: vw * 0.318, y1: -vh * 0.312 + vhc * 0.470 };
      legs = [
        { x: -this.legX, y: -vh * 0.235 }, { x: -this.legX, y: vh * 0.035 },
        { x: this.legX, y: -vh * 0.165 }, { x: this.legX, y: vh * 0.095 },
      ];
      chipAt = [[0.24, -40], [0.50, 42], [0.80, -26]];
      spoonAt = { u: 0.66, off: 74, a: 0.95 };
      this.exitCam = { x: 0, y: vh * 0.22, zoom: this.scale * 0.88, tilt: 0.30 };
      this.cols = 56; this.rows = 48;
    } else {
      // ---- a long low counter, the spill running away along its foot -----
      this.shelfX = 0;
      this.legX = 0;
      this.backY = -vh * 0.340;
      bag = { x: -vw * 0.300, y: -vh * 0.400, a: 0.30, sc: 0.62 };
      src = { x: -vw * 0.240, y: -vh * 0.300 };
      dir = { x: 0.92, y: 0.42 };
      flen = vw * 0.400; fwide = vh * 0.100;
      prect = { x0: -vw * 0.48, y0: -vh * 0.39, x1: vw * 0.22, y1: vh * 0.24 };
      safe = { x0: -vw * 0.430, y0: -vh * 0.318, x1: vw * 0.215, y1: vh * 0.215 };
      legs = [
        { x: -vw * 0.400, y: this.backY }, { x: -vw * 0.130, y: this.backY },
        { x: vw * 0.140, y: this.backY }, { x: vw * 0.410, y: this.backY },
      ];
      chipAt = [[0.22, 34], [0.52, -34], [0.80, 26]];
      spoonAt = { u: 0.30, off: 70, a: 0.32 };
      this.exitCam = { x: vw * 0.28, y: 0, zoom: this.scale * 0.88, tilt: 0.18 };
      this.cols = 64; this.rows = 28;
    }
    // Everything that lives IN the spill is placed along the spill's own axis,
    // not in screen fractions: the fan is the same shape on all four devices,
    // so a chip at u=0.5 is under the same thickness of flour on all of them.
    const dl = Math.hypot(dir.x, dir.y) || 1;
    const ux = dir.x / dl, uy = dir.y / dl;
    const pxx = -uy, pyy = ux;
    const onAxis = (u, off) => ({
      x: src.x + ux * flen * u + pxx * off,
      y: src.y + uy * flen * u + pyy * off,
    });
    const mc = onAxis(0.5, 0);
    const mr = clamp(flen * 0.30, 44, 58);
    // and it must sit wholly inside the flour, or its rim shows before a
    // finger has touched anything
    motif = {
      x: clamp(mc.x, safe.x0 + mr + 10, safe.x1 - mr - 10),
      y: clamp(mc.y, safe.y0 + mr + 10, safe.y1 - mr - 10),
      rx: mr, ry: mr,
    };
    this.bagAt = bag;
    this.legsAt = legs;
    this.safe = safe;
    this.spoonBounds = { x0: safe.x0, y0: safe.y0, x1: safe.x1, y1: safe.y1, inset: 0.9 };
    this.motif = motif;

    // the set is static: bake it into the opaque blit the floor does anyway
    const g = this.floor.growBase(fr);
    if (portrait) this._bakePortrait(g, fr, rng);
    else this._bakeLandscape(g, fr, rng);
    g.restore();

    // the bright tile hiding under the flour
    paintPantryMotif(this.floor, motif.x, motif.y, motif.rx, motif.ry, rng);

    // ---- the flour ------------------------------------------------------
    const spill = new FlourSpill(prect, rng, { cols: this.cols, rows: this.rows, pool: 300, target: 0.92 });
    // the whole floor between the shelves has a haze of flour on it; the fan
    // out of the bag is the thick part lying on top of that
    const haloA = portrait ? 40 : 50, haloB = portrait ? 54 : 70;
    const ax = src.x, ay = src.y;
    const bx = src.x + dir.x * flen, by = src.y + dir.y * flen;
    for (let y = safe.y0 + 10; y < safe.y1; y += 24) {
      for (let x = safe.x0 + 10; x < safe.x1; x += 24) {
        const vx = bx - ax, vy = by - ay;
        const u = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy), 0, 1);
        const dd = Math.hypot(x - (ax + vx * u), y - (ay + vy * u));
        // A fan, not a rectangle: narrow at the bag's neck, wide where it ran
        // out, and ragged at the rim so there is dark tile to clean TO from
        // the first frame. The raggedness only ever makes the tongue WIDER —
        // nothing may thin the flour over the motif into a bald patch.
        const edge = (haloA + haloB * u) + Math.abs(Math.sin(y * 0.031 + x * 0.017)) * 30 + rng.range(0, 18);
        const a = 0.26 * (1 - smoothstep(edge * 0.50, edge, dd));
        if (a < 0.04) continue;
        spill.drift(x + rng.range(-7, 7), y + rng.range(-7, 7), 26, a);
      }
    }
    spill.fan(src.x, src.y, dir.x, dir.y, flen, fwide, 0.070, rng);
    // a tongue still spilling out of the bag's neck, thick at the lip
    spill.drift(src.x, src.y, 46, 0.55);
    spill.drift(src.x + dir.x * 46, src.y + dir.y * 46, 40, 0.40);
    // drifts banked up against the legs: these are what a HOLD digs into
    spill.drift(legs[0].x + (portrait ? 14 : 8), legs[0].y + (portrait ? 6 : 34), 50, 0.60);
    spill.drift(legs[1].x + (portrait ? 12 : 4), legs[1].y + (portrait ? 4 : 40), 44, 0.50);

    spill.setAxis(src.x, src.y, ux, uy, flen, haloA * 0.5 + haloB * 0.5 + 30);
    spill.feather(safe, 30);
    spill.clipTo(safe);
    const park = this.parkPoint(portrait ? 92 : 78);
    spill.clearDisc(park.x, park.y, portrait ? 150 : 132);
    spill.seal();
    this.spill = spill;
    this.debris.push(spill);

    // ---- what is buried in it -------------------------------------------
    const kinds = ['chip', 'raisin', 'chip'];
    this.reachRect(RR, 30);
    for (let i = 0; i < 3; i++) {
      const cp = onAxis(chipAt[i][0], chipAt[i][1]);
      let cx = cp.x, cy = cp.y;
      cx = clamp(cx, Math.max(RR.x0, safe.x0 + 12), Math.min(RR.x1, safe.x1 - 12));
      cy = clamp(cy, Math.max(RR.y0, safe.y0 + 12), Math.min(RR.y1, safe.y1 - 12));
      const c = new Chip(cx, cy, rng, kinds[i]);
      c.spill = spill;
      c.anchored = true;             // it is IN the film; do not shove it out
      this.chips.push(c);
      this.debris.push(c);
    }

    // ---- the wooden spoon: solid, shovable, and flour slides off it ------
    const sp0 = onAxis(spoonAt.u, spoonAt.off);
    this.spoon = new Prop({
      x: sp0.x, y: sp0.y, angle: spoonAt.a,
      shape: 'rect', w: 104, h: 26, mass: 1.5, friction: 7, pushable: true,
      shadow: false, draw: (ctx) => this._drawSpoon(ctx),
    });
    this.props.push(this.spoon);
    this._spoonPrev.x = this.spoon.x; this._spoonPrev.y = this.spoon.y;

    // ---- the bin, and the child's progress across an orientation change --
    this.placeBin(portrait
      ? { x: -vw * 0.250, y: vh * 0.285 }
      : { x: vw * 0.345, y: -vh * 0.170 });
    spill.loadFrom(this.persist);
    const done = this.persist.chips || 0;
    for (let i = 0; i < done && i < this.chips.length; i++) this.chips[i].state = 'in-cup';
    if (this.persist.spoon) { this.spoon.x = this.persist.spoon[0] * vw; this.spoon.y = this.persist.spoon[1] * vh; }
  }

  /**
   * The spill and the chips are rebuilt from `persist`, so the core's
   * index-based replay would double-count. `saveProgress()` is called by
   * `relayout()` immediately before the rebuild, which makes it the one place
   * guaranteed to catch the film exactly as the child left it.
   */
  saveProgress() { this._save(); return null; }
  restoreProgress() {}

  // ------------------------------------------------------------------ set

  _bakePortrait(g, fr, rng) {
    const X = this.shelfX;
    // side shelving: two dark runs framing a narrow aisle
    this._shelfRun(g, fr.x0 - 10, fr.y0 - 10, -X - (fr.x0 - 10), fr.y1 - fr.y0 + 20, 1, rng);
    this._shelfRun(g, X, fr.y0 - 10, fr.x1 + 10 - X, fr.y1 - fr.y0 + 20, -1, rng);
    // the low shelf at the far end, with the bag tipped over on it
    this._lowUnit(g, fr.x0 - 10, fr.y0 - 10, fr.x1 - fr.x0 + 20, this.backY - fr.y0 + 10);
    for (let i = 0; i < this.legsAt.length; i++) this._leg(g, this.legsAt[i].x, this.legsAt[i].y);
    this._bag(g, this.bagAt.x, this.bagAt.y, this.bagAt.a, 1);
  }

  _bakeLandscape(g, fr, rng) {
    const vh = this.vh;
    this._lowUnit(g, fr.x0 - 10, fr.y0 - 10, fr.x1 - fr.x0 + 20, this.backY - fr.y0 + 10);
    // a shallow run of shelving above the counter, so the room reads as a pantry
    g.save();
    g.fillStyle = '#5c452e';
    g.fillRect(fr.x0 - 10, fr.y0 - 10, fr.x1 - fr.x0 + 20, vh * 0.12);
    g.fillStyle = '#6d5238';
    for (let i = 0; i < 9; i++) {
      const x = fr.x0 + (fr.x1 - fr.x0) * (i / 9) + 14;
      this._jar(g, x, fr.y0 + vh * 0.055, 22 + (i % 3) * 5, rng);
    }
    g.restore();
    for (let i = 0; i < this.legsAt.length; i++) this._leg(g, this.legsAt[i].x, this.legsAt[i].y);
    this._bag(g, this.bagAt.x, this.bagAt.y, this.bagAt.a, this.bagAt.sc || 0.9);
  }

  /** A run of shelving seen from above: boards, jars, and a shadow on the floor. */
  _shelfRun(g, x, y, w, h, inward, rng) {
    g.save();
    g.fillStyle = '#42321f';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#5c452e';
    g.fillRect(inward > 0 ? x : x + w * 0.14, y, w * 0.86, h);
    // board edges running away down the room
    g.strokeStyle = 'rgba(28,20,10,0.6)'; g.lineWidth = 3;
    for (let i = 1; i < 6; i++) {
      const yy = y + (h * i) / 6;
      g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke();
    }
    // jars and packets standing on them
    for (let i = 0; i < 7; i++) {
      const jx = x + w * (inward > 0 ? 0.30 + (i % 3) * 0.18 : 0.52 + (i % 3) * 0.18);
      const jy = y + h * (0.06 + i * 0.132);
      this._jar(g, jx, jy, 20 + (i % 4) * 6, rng);
    }
    // the front edge, lit, and the shadow it throws into the aisle
    const ex = inward > 0 ? x + w : x;
    g.fillStyle = '#7d6040';
    g.fillRect(inward > 0 ? ex - 10 : ex, y, 10, h);
    const gr = g.createLinearGradient(ex, 0, ex + inward * 46, 0);
    gr.addColorStop(0, 'rgba(10,8,12,0.55)');
    gr.addColorStop(1, 'rgba(10,8,12,0)');
    g.fillStyle = gr;
    g.fillRect(inward > 0 ? ex : ex - 46, y, 46, h);
    g.restore();
  }

  /** The low unit the bag fell off, across the far end of the room. */
  _lowUnit(g, x, y, w, h) {
    g.save();
    g.fillStyle = '#4a3823';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#6a5236';
    g.fillRect(x, y, w, h - 16);
    g.fillStyle = '#8a6c48';
    g.fillRect(x, y + h - 22, w, 14);
    g.fillStyle = '#2d2116';
    g.fillRect(x, y + h - 8, w, 8);
    // drawer fronts
    g.strokeStyle = 'rgba(30,22,12,0.55)'; g.lineWidth = 3;
    const dw = 160;
    for (let dx = x + 18; dx < x + w - 24; dx += dw) {
      g.strokeRect(dx, y + h * 0.32, Math.min(dw - 18, x + w - 24 - dx), h * 0.42);
      g.fillStyle = '#c9ab7f';
      g.fillRect(dx + 24, y + h * 0.52, Math.min(dw - 66, x + w - 72 - dx), 7);
      g.strokeStyle = 'rgba(30,22,12,0.55)';
    }
    // the shadow it throws forward onto the tile
    const gr = g.createLinearGradient(0, y + h, 0, y + h + 58);
    gr.addColorStop(0, 'rgba(8,6,10,0.62)');
    gr.addColorStop(1, 'rgba(8,6,10,0)');
    g.fillStyle = gr;
    g.fillRect(x, y + h, w, 58);
    g.restore();
  }

  _leg(g, x, y) {
    g.save();
    g.fillStyle = 'rgba(8,6,10,0.5)';
    g.beginPath(); g.ellipse(x + 4, y + 10, 18, 8, 0, 0, TAU); g.fill();
    g.fillStyle = '#4e3a24';
    rr(g, x - 12, y - 30, 24, 40, 5); g.fill();
    g.fillStyle = '#7d6040';
    rr(g, x - 12, y - 30, 9, 40, 4); g.fill();
    g.restore();
  }

  _jar(g, x, y, r, rng) {
    const cols = ['#c9a86a', '#8fae86', '#c08a6a', '#9aa8bd', '#d2bb84'];
    g.save();
    g.fillStyle = 'rgba(12,9,6,0.45)';
    g.beginPath(); g.ellipse(x + 3, y + 4, r * 0.95, r * 0.9, 0, 0, TAU); g.fill();
    g.fillStyle = cols[(Math.abs(x | 0) + Math.abs(y | 0) * 3) % cols.length];
    g.beginPath(); g.arc(x, y, r * 0.88, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.30, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(30,22,12,0.6)'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(x, y, r * 0.88, 0, TAU); g.stroke();
    g.restore();
  }

  /** The tipped paper sack: the visible reason there is any flour at all. */
  _bag(g, x, y, a, sc) {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.scale(sc, sc);
    g.fillStyle = 'rgba(8,6,10,0.5)';
    rr(g, -66, -38, 140, 86, 14); g.fill();
    // kraft paper body, with the folded flat bottom at the far end
    g.fillStyle = '#d9bb8c';
    rr(g, -72, -42, 138, 84, 13); g.fill();
    g.fillStyle = '#c6a475';
    rr(g, -72, -42, 30, 84, 13); g.fill();
    g.strokeStyle = 'rgba(120,92,56,0.7)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-42, -42); g.lineTo(-42, 42); g.stroke();
    // gusset creases running the length of it
    g.strokeStyle = 'rgba(150,120,80,0.55)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(-66, -20); g.lineTo(60, -20); g.stroke();
    g.beginPath(); g.moveTo(-66, 20); g.lineTo(60, 20); g.stroke();
    // blue band and a wheat ear, so it is unmistakably a bag of flour
    g.fillStyle = '#4f7fae';
    rr(g, -20, -42, 34, 84, 3); g.fill();
    g.fillStyle = '#f3e7cd';
    for (let i = 0; i < 4; i++) {
      g.beginPath(); g.ellipse(-3, -24 + i * 15, 9, 4.6, 0.5, 0, TAU); g.fill();
    }
    // the neck: torn open, pointing at the spill, with flour still in it
    g.fillStyle = '#b89a6d';
    g.beginPath();
    g.moveTo(58, -40); g.lineTo(84, -30); g.lineTo(90, 0); g.lineTo(82, 32);
    g.lineTo(58, 40); g.closePath(); g.fill();
    g.fillStyle = '#fbf6ea';
    g.beginPath(); g.ellipse(80, 2, 15, 28, 0.1, 0, TAU); g.fill();
    g.fillStyle = '#ece3d0';
    g.beginPath(); g.ellipse(84, 2, 9, 20, 0.1, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(120,92,56,0.8)'; g.lineWidth = 3;
    rr(g, -72, -42, 138, 84, 13); g.stroke();
    g.restore();
  }

  /** The wooden spoon lying in the flour. */
  _drawSpoon(ctx) {
    const p = this.spoon;
    ctx.save();
    ctx.fillStyle = 'rgba(8,6,10,0.42)';
    ctx.save();
    ctx.translate(p.x + 4, p.y + 7); ctx.rotate(p.angle);
    rr(ctx, -54, -11, 108, 22, 11); ctx.fill();
    ctx.restore();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle + p.nudge * 0.10);
    ctx.fillStyle = '#c69a5e';
    rr(ctx, -52, -6, 78, 12, 6); ctx.fill();
    ctx.beginPath(); ctx.ellipse(38, 0, 20, 15, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ad8148';
    ctx.beginPath(); ctx.ellipse(39, 1, 14, 10, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    rr(ctx, -50, -5, 72, 4, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,26,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(38, 0, 20, 15, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- update

  update(dt, ctx) {
    const vac = ctx.vacuum;
    this.spill.update(dt, vac, ctx.world);
    for (let i = 0; i < this.chips.length; i++) this.chips[i].update(dt, vac, ctx.world);

    resolveProps(vac, this.props, dt, { separate: true, bounds: this.spoonBounds });
    // the spoon ploughs the flour aside instead of being a hole in the film
    const sp = this.spoon;
    const mv = Math.hypot(sp.x - this._spoonPrev.x, sp.y - this._spoonPrev.y);
    if (mv > 0.25) {
      const ca = Math.cos(sp.angle), sa = Math.sin(sp.angle);
      this.spill.sweep(sp.x - ca * 30, sp.y - sa * 30, 24);
      this.spill.sweep(sp.x + ca * 30, sp.y + sa * 30, 26);
      this._spoonPrev.x = sp.x; this._spoonPrev.y = sp.y;
    }

    // a whole film draining is a wide hiss, not a pop per grain
    if (ctx.audio) ctx.audio.setStream(clamp(this.spill.roar * 1.1, 0, 1));

    // ---- the motif blooms once the floor is clean and the chips are in ----
    const chipsIn = this._chipsLeft() === 0;
    if (chipsIn && this.spill.cleanFrac() >= this.spill.target) {
      if (this.bloom === 0) this.spill.fadeOut(2.6);
      this.bloom = clamp(this.bloom + dt / 1.5, 0, 1);
    }

    // ---- what survives an orientation change -----------------------------
    this._saveT -= dt;
    if (this._saveT <= 0) { this._saveT = 0.4; this._save(); }
  }

  _save() {
    this.spill.saveTo(this.persist);
    this.persist.chips = this.chips.length - this._chipsLeft();
    this.persist.spoon = [this.spoon.x / this.vw, this.spoon.y / this.vh];
    this.persist.bloom = this.bloom;
  }

  _chipsLeft() {
    let n = 0;
    for (let i = 0; i < this.chips.length; i++) if (this.chips[i].state !== 'in-cup') n++;
    return n;
  }

  onCaptured(d) { /* the film keeps its own books; nothing to reveal by hand */ }

  isComplete() { return this.bloom >= 1; }

  remaining() {
    return (this.spill.cleanFrac() >= this.spill.target ? 0 : 1) + this._chipsLeft();
  }

  devFinish() {
    this.spill.devFinish();
    for (let i = 0; i < this.chips.length; i++) this.chips[i].state = 'in-cup';
    this.bloom = 1;
  }

  // ------------------------------------------------------------------ draw

  draw(ctx, cam) {
    this.drawFloor(ctx, cam);
    ctx.save();
    cam.apply(ctx);
    if (this.bloom > 0) this._drawBloom(ctx);
    this.spill.draw(ctx, cam);
    for (let i = 0; i < this.chips.length; i++) this.chips[i].draw(ctx, cam);
    this.spoon.draw(ctx);
    ctx.restore();
  }

  /** The cloud is IN THE AIR, so it goes in front of the machine. */
  drawOver(ctx, cam) {
    ctx.save();
    cam.apply(ctx);
    this.spill.drawAir(ctx, cam);
    ctx.restore();
  }

  /** The motif comes up: a warm wash that swells once and stays brighter. */
  _drawBloom(ctx) {
    const m = this.motif;
    const u = this.bloom;
    const grow = smoothstep(0, 0.7, u);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.34 * Math.sin(Math.min(1, u) * Math.PI) + 0.12 * grow;
    ctx.fillStyle = '#ffdfa0';
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, m.rx * (0.5 + grow * 0.75), m.ry * (0.5 + grow * 0.75), 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.55 * (1 - u);
    ctx.strokeStyle = '#fff3cf';
    ctx.lineWidth = 9 * (1 - u * 0.6);
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, m.rx * u * 1.35, m.ry * u * 1.35, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------- transitions

  exit() { return { to: this.exitCam, dur: 1.6, next: 'hall' }; }

  entry() {
    // walking in through the door: a step back and low, looking up the room at
    // the tipped bag, which is the only bright thing in a dark pantry
    return this.pose === 'portrait'
      ? { x: 0, y: this.rest.y + this.vh * 0.16, zoom: this.scale * 0.94, tilt: 0.36 }
      : { x: this.rest.x + this.vw * 0.16, y: 0, zoom: this.scale * 0.94, tilt: 0.22 };
  }

  snapshot() {
    const s = super.snapshot();
    s.clean = +this.spill.cleanFrac().toFixed(3);
    s.bloom = +this.bloom.toFixed(3);
    return s;
  }
}
