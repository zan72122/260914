import { Scene } from './scene.js';
import { SandPile } from '../debris/sandPile.js';
import { GritTrail } from '../debris/grit.js';
import { BuriedItem } from '../debris/buried.js';
import { Prop, resolveProps } from '../props/prop.js';
import { makeGenkanFloor, paintMat } from '../floors/genkan.js';
import { TAU, clamp } from '../core/math.js';

/**
 * Scene 6 — the entrance hall (genkan).
 *
 * New motion law: the debris is a MASS, not objects. Sucking the middle of it
 * makes the surroundings collapse inward — a crater opens, the walls slide, a
 * whole chunk lets go at once, and the doormat's pattern comes up out of the
 * sand underneath. Three solid things are buried in it and rattle in as they
 * surface. A trail of loose grit runs back to the door for cheap mass sucks.
 */
export class SandScene extends Scene {
  constructor(rng) {
    super('sand', rng);
    this.revealT = 0;
    this._saveT = 0;
  }

  _p(nx, ny) { return { x: (nx - 0.5) * this.vw, y: (ny - 0.5) * this.vh }; }

  layout(pose, w, h) {
    super.layout(pose, w, h);
    const vw = this.vw, vh = this.vh;
    this.debris.length = 0;
    this.props.length = 0;
    this.revealT = 0;
    const rng = this.rng;
    const portrait = pose === 'portrait';
    this.rest = { x: 0, y: 0, zoom: this.scale, tilt: portrait ? 0.22 : 0.10 };

    let mat, door, hall, stepAxis, rect, sofa, gritFrom, gritNear;
    if (portrait) {
      // depth: the doorway is far away at the top, the hall comes at the viewer
      this.startPointer = { x: 0.5, y: 0.86 };
      rect = { x0: -vw * 1.0, y0: -vh * 0.95, x1: vw * 1.0, y1: vh * 1.35 };
      mat = this._p(0.50, 0.365);
      door = { x: 0, y: this._p(0.5, 0.085).y, w: Math.min(300, vw * 0.78), h: 150, spill: 330 };
      hall = { x0: rect.x0, y0: this._p(0.5, 0.80).y, x1: rect.x1, y1: rect.y1 };
      stepAxis = 'y';
      gritFrom = this._p(0.46, 0.145);
      gritNear = this._p(0.74, 0.74);
      sofa = { x: 0, y: this._p(0.5, 1.30).y, w: vw * 1.9, h: 220, axis: 'y' };
      this.exitCam = { x: 0, y: this._p(0.5, 1.12).y, zoom: this.scale * 1.02, tilt: 0.42 };
    } else {
      // width: a wide doorway on the left, the step and the hall on the right
      this.startPointer = { x: 0.12, y: 0.80 };
      rect = { x0: -vw * 1.1, y0: -vh * 1.1, x1: vw * 1.35, y1: vh * 1.1 };
      mat = this._p(0.545, 0.50);
      door = { x: this._p(0.155, 0.5).x, y: 0, w: Math.min(340, vh * 0.92), h: 128, spill: 330, axis: 'x' };
      hall = { x0: this._p(0.78, 0.5).x, y0: rect.y0, x1: rect.x1, y1: rect.y1 };
      stepAxis = 'x';
      gritFrom = this._p(0.21, 0.46);
      gritNear = this._p(0.30, 0.90);
      sofa = { x: this._p(1.20, 0.5).x, y: 0, w: 240, h: vh * 2.0, axis: 'x' };
      this.exitCam = { x: this._p(1.00, 0.5).x, y: 0, zoom: this.scale * 1.02, tilt: 0.24 };
    }
    this.sofa = sofa;
    this.doorRect = door;
    this.hallRect = hall;
    this.mat = { x: mat.x, y: mat.y, w: 252, h: 186 };

    this.floor = makeGenkanFloor(rect, rng, { hall, stepAxis, door });
    paintMat(this.floor, mat.x, mat.y, this.mat.w, this.mat.h, rng);

    // ---- the pile -------------------------------------------------------
    const pr = { x0: mat.x - 190, y0: mat.y - 165, x1: mat.x + 190, y1: mat.y + 175 };
    const pile = new SandPile(pr, rng);
    // one big heap sitting on the mat, with lobes and a tongue spilling off it
    pile.heap(mat.x - 6, mat.y - 6, 100, 25);
    pile.heap(mat.x + 52, mat.y + 34, 58, 11);
    pile.heap(mat.x - 58, mat.y + 30, 50, 8);
    const tx = gritFrom.x - mat.x, ty = gritFrom.y - mat.y;
    const tl = Math.hypot(tx, ty) || 1;
    pile.heap(mat.x + (tx / tl) * 96, mat.y + (ty / tl) * 96, 52, 7);
    pile.smooth(3, 0.42);
    pile.seal();
    this.pile = pile;
    this.debris.push(pile);

    // ---- what is hidden in it -------------------------------------------
    const kinds = ['marble', 'shell', 'button'];
    // all three sit inside the heap's core, so they surface inside the bowl the
    // nozzle digs rather than out on a flank where it has no reach
    const spots = portrait
      ? [[-38, -28], [34, -4], [-6, 34]]
      : [[-40, 12], [28, -30], [18, 36]];
    for (let i = 0; i < 3; i++) {
      const b = new BuriedItem(mat.x + spots[i][0], mat.y + spots[i][1], rng, kinds[i]);
      b.pile = pile;
      this.debris.push(b);
    }

    // ---- the grit walked in from the door --------------------------------
    const grit = new GritTrail(rng);
    const park = this.parkPoint(92);
    // The trail is a path with three stations: it is walked IN through the door,
    // tracked across the hall past the pile, and carried on toward the viewer.
    const A = gritFrom, B = { x: mat.x, y: mat.y }, C = gritNear;
    for (let i = 0; i < 118; i++) {
      const t = i / 117;
      let bx, by, u;
      if (t < 0.55) { u = t / 0.55; bx = A.x + (B.x - A.x) * u; by = A.y + (B.y - A.y) * u; }
      else { u = (t - 0.55) / 0.45; bx = B.x + (C.x - B.x) * u; by = B.y + (C.y - B.y) * u; }
      const spread = 16 + Math.sin(t * Math.PI) * 34;
      const wander = Math.sin(t * 6.4 + 1.1) * 34;
      const x = bx + rng.range(-spread, spread) + wander;
      const y = by + rng.range(-spread * 0.8, spread * 0.8) + Math.cos(t * 4.7) * 16;
      if (pile.heightAt(x, y) > 0.4) continue;                // that one is under the pile
      if (Math.hypot(x - park.x, y - park.y) < 150) continue; // not close enough to be eaten before the first touch
      grit.add(x, y);
    }
    // a few strays scattered wider across the tataki: something to chase
    for (let i = 0; i < 26; i++) {
      const p = portrait
        ? this._p(rng.range(0.12, 0.88), rng.range(0.18, 0.66))
        : this._p(rng.range(0.10, 0.70), rng.range(0.10, 0.90));
      if (pile.heightAt(p.x, p.y) > 0.4) continue;
      if (Math.hypot(p.x - park.x, p.y - park.y) < 150) continue;
      grit.add(p.x, p.y);
    }
    this.grit = grit;
    this.debris.push(grit);

    // ---- landscape: the shoe rack is a solid thing to steer around -------
    if (!portrait) {
      const r = this._p(0.30, 0.155);
      this.rack = new Prop({
        x: r.x, y: r.y, shape: 'rect', w: 214, h: 74, pushable: false, shadow: false,
        draw: (ctx) => this._drawRack(ctx),
      });
      this.props.push(this.rack);
      // sand kicked up against the rack's feet
      for (let i = 0; i < 8; i++) grit.add(r.x + rng.range(-100, 100), r.y + rng.range(40, 62));
    } else {
      // portrait: a pair of shoes stands beside the mat instead
      const r = this._p(0.16, 0.235);
      this.rack = new Prop({
        x: r.x, y: r.y, shape: 'rect', w: 112, h: 78, pushable: false, shadow: false,
        draw: (ctx) => this._drawShoes(ctx),
      });
      this.props.push(this.rack);
    }

    // ---- progress kept across an orientation change -----------------------
    pile.loadFrom(this.persist);
    if (this.persist.gritGone) {
      let n = this.persist.gritGone;
      for (let i = 0; i < grit.g.length && n > 0; i++) { grit.g[i].on = 0; grit.left--; n--; }
    }
    if (this.persist.buried) {
      let n = this.persist.buried;
      for (let i = 1; i <= 3 && n > 0; i++) { this.debris[i].state = 'in-cup'; n--; }
    }
    if (this.persist.revealed) { this.revealT = 1; pile.state = 'in-cup'; }

    // main.relayout() preserves progress by marking the first N debris DONE,
    // which would swallow the whole pile (it is debris #0) on an orientation
    // change. It skips anything flagged `dormant`, so the scene hides behind
    // that for exactly one frame and restores its own saved state instead.
    for (let i = 0; i < this.debris.length; i++) this.debris[i].dormant = true;
    this._wake = true;
  }

  // ---------------------------------------------------------------- update

  update(dt, ctx) {
    const list = this.debris;
    if (this._wake) { this._wake = false; for (let i = 0; i < list.length; i++) list[i].dormant = false; }
    this.pile.update(dt, ctx.vacuum, ctx.world, ctx);
    for (let i = 1; i < list.length; i++) list[i].update(dt, ctx.vacuum, ctx.world);
    resolveProps(ctx.vacuum, this.props, dt);

    if (this.remaining() === 0 && this.revealT < 1) {
      this.revealT = clamp(this.revealT + dt / 1.2, 0, 1);
      if (this.revealT >= 1) { this.persist.revealed = true; }
    }
    this.persist.gritGone = this.grit.g.length - this.grit.left;
    this._saveT -= dt;
    if (this._saveT <= 0) { this._saveT = 0.4; this.pile.saveTo(this.persist); }
  }

  onCaptured(d) {
    if (d.type !== 'grit' && d.type !== 'sand') this.persist.buried = (this.persist.buried || 0) + 1;
    this.pile.saveTo(this.persist);
  }

  isComplete() { return this.remaining() === 0 && this.revealT >= 1; }

  // ------------------------------------------------------------------ draw

  draw(ctx, cam) {
    this.drawFloor(ctx, cam);
    ctx.save();
    cam.apply(ctx);
    this._drawDoorway(ctx);
    this._drawSofa(ctx);
    for (let i = 0; i < this.props.length; i++) this.props[i].draw(ctx);
    ctx.restore();
    this.drawDebris(ctx, cam);
    if (this.revealT > 0 && this.revealT < 1) {
      ctx.save();
      cam.apply(ctx);
      this._drawReveal(ctx);
      ctx.restore();
    }
  }

  /** Daylight coming in through the open door — the reason there is sand at all. */
  _drawDoorway(ctx) {
    const d = this.doorRect;
    ctx.save();
    if (d.axis === 'x') {
      const g = ctx.createLinearGradient(d.x - d.h, 0, d.x, 0);
      g.addColorStop(0, '#fff3d2');
      g.addColorStop(0.62, '#ffe9b5');
      g.addColorStop(1, 'rgba(255,225,165,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(d.x - d.h, d.y - d.w / 2, d.h, d.w);
      ctx.fillStyle = '#4b453c';
      ctx.fillRect(d.x - d.h - 26, d.y - d.w / 2 - 34, 26, d.w + 68);
      ctx.fillRect(d.x - d.h - 26, d.y - d.w / 2 - 34, d.h + 26, 34);
      ctx.fillRect(d.x - d.h - 26, d.y + d.w / 2, d.h + 26, 34);
    } else {
      const g = ctx.createLinearGradient(0, d.y - d.h, 0, d.y);
      g.addColorStop(0, '#fff3d2');
      g.addColorStop(0.62, '#ffe9b5');
      g.addColorStop(1, 'rgba(255,225,165,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(d.x - d.w / 2, d.y - d.h, d.w, d.h);
      ctx.fillStyle = '#4b453c';
      ctx.fillRect(d.x - d.w / 2 - 34, d.y - d.h - 26, d.w + 68, 26);
      ctx.fillRect(d.x - d.w / 2 - 34, d.y - d.h - 26, 34, d.h + 26);
      ctx.fillRect(d.x + d.w / 2, d.y - d.h - 26, 34, d.h + 26);
    }
    ctx.restore();
  }

  /** The next room: the sofa's shadow with a dust bunny peeking out from under. */
  _drawSofa(ctx) {
    const s = this.sofa;
    ctx.save();
    if (s.axis === 'x') {
      // the sofa stands off to the right; we see its near side and the dark
      // gap underneath, with something fluffy sitting in it
      const g = ctx.createLinearGradient(s.x - 120, 0, s.x, 0);
      g.addColorStop(0, 'rgba(24,18,30,0)');
      g.addColorStop(1, 'rgba(24,18,30,0.5)');
      ctx.fillStyle = g;
      ctx.fillRect(s.x - 120, s.y - s.h / 2, 120, s.h);
      this._dustBunny(ctx, s.x + 30, s.y - 30);
      ctx.fillStyle = '#100c18';
      ctx.fillRect(s.x + 26, s.y - s.h / 2, 30, s.h);          // the dark gap
      ctx.fillStyle = '#6e5f8a';
      ctx.fillRect(s.x + 56, s.y - s.h / 2, s.w * 2, s.h);     // the sofa itself
      ctx.fillStyle = '#7f6f9d';
      ctx.fillRect(s.x + 56, s.y - s.h / 2, 16, s.h);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(s.x + 72, s.y - s.h / 2, 10, s.h);
    } else {
      const g = ctx.createLinearGradient(0, s.y - 180, 0, s.y + 8);
      g.addColorStop(0, 'rgba(22,16,28,0)');
      g.addColorStop(1, 'rgba(22,16,28,0.62)');
      ctx.fillStyle = g;
      ctx.fillRect(s.x - s.w / 2, s.y - 180, s.w, 188);
      this._dustBunny(ctx, s.x - 66, s.y - 2);
      ctx.fillStyle = '#100c18';
      ctx.fillRect(s.x - s.w / 2, s.y + 8, s.w, 26);           // the dark gap
      ctx.fillStyle = '#6e5f8a';
      ctx.fillRect(s.x - s.w / 2, s.y + 34, s.w, s.h * 2);     // the sofa itself
      ctx.fillStyle = '#7f6f9d';
      ctx.fillRect(s.x - s.w / 2, s.y + 34, s.w, 18);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(s.x - s.w / 2, s.y + 52, s.w, 10);
    }
    ctx.restore();
  }

  _dustBunny(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = 'rgba(30,24,20,0.30)';
    ctx.beginPath(); ctx.ellipse(x + 2, y + 13, 28, 9, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(214,207,195,0.9)';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + 0.2;
      const r = 26 + Math.sin(i * 2.3) * 7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.78);
      ctx.stroke();
    }
    ctx.fillStyle = '#d6cfc3';
    ctx.beginPath(); ctx.ellipse(x, y, 19, 14, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.ellipse(x - 5, y - 4, 8, 5, -0.4, 0, TAU); ctx.fill();
    ctx.restore();
  }

  _drawRack(ctx) {
    const p = this.rack;
    const x = p.x - p.w / 2, y = p.y - p.h / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(40,30,18,0.28)';
    ctx.fillRect(x + 6, y + p.h - 4, p.w, 16);
    ctx.fillStyle = '#a8825a';
    ctx.fillRect(x, y, p.w, p.h);
    ctx.fillStyle = '#c29a6c';
    ctx.fillRect(x, y, p.w, 16);
    ctx.fillStyle = '#8d6a46';
    ctx.fillRect(x, y + 34, p.w, 8);
    ctx.strokeStyle = 'rgba(70,48,26,0.5)'; ctx.lineWidth = 2;
    ctx.strokeRect(x, y, p.w, p.h);
    // shoes on the shelves
    this._shoe(ctx, x + 40, y + 26, '#3f6f9c');
    this._shoe(ctx, x + 78, y + 26, '#3f6f9c');
    this._shoe(ctx, x + 146, y + 60, '#c0533f');
    this._shoe(ctx, x + 182, y + 60, '#c0533f');
    ctx.restore();
  }

  _drawShoes(ctx) {
    const p = this.rack;
    ctx.save();
    ctx.fillStyle = 'rgba(40,30,18,0.24)';
    ctx.beginPath(); ctx.ellipse(p.x + 4, p.y + 24, 58, 17, 0, 0, TAU); ctx.fill();
    this._shoe(ctx, p.x - 24, p.y, '#c0533f', -0.12);
    this._shoe(ctx, p.x + 22, p.y + 7, '#c0533f', 0.16);
    ctx.restore();
  }

  /** A little shoe seen from above: sole, upper, and a dark opening at the heel. */
  _shoe(ctx, x, y, col, ang) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang || 0);
    ctx.fillStyle = 'rgba(38,28,18,0.55)';
    ctx.beginPath(); ctx.ellipse(1, 2, 17, 28, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(0, 0, 16, 27, 0, 0, TAU); ctx.fill();
    // toe cap
    ctx.fillStyle = 'rgba(255,255,255,0.40)';
    ctx.beginPath(); ctx.ellipse(0, -15, 11, 8, 0, 0, TAU); ctx.fill();
    // the opening you put your foot in, at the heel end
    ctx.fillStyle = '#4a3c30';
    ctx.beginPath(); ctx.ellipse(0, 11, 8.5, 11, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 11, 8.5, 11, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  /** The pattern is clear: a ring of light runs out over the mat, once. */
  _drawReveal(ctx) {
    const m = this.mat;
    const u = this.revealT;
    const r = u * Math.max(m.w, m.h) * 0.85;
    ctx.save();
    ctx.globalAlpha = 0.5 * (1 - u);
    ctx.strokeStyle = '#fff4cf';
    ctx.lineWidth = 8 * (1 - u * 0.6);
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, r, r * 0.78, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.20 * Math.sin(u * Math.PI);
    ctx.fillStyle = '#fff0c4';
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, m.w * 0.62, m.h * 0.62, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  exit() { return { to: this.exitCam, dur: 1.6, next: 'sofa' }; }

  entry() {
    return this.pose === 'portrait'
      ? { x: 0, y: this.rest.y - this.vh * 0.42, zoom: this.scale * 1.04, tilt: 0.46 }
      : { x: this.rest.x - this.vw * 0.48, y: 0, zoom: this.scale * 1.04, tilt: 0.24 };
  }
}
