import { Scene } from './scene.js';
import { Crumb, resolveCrumbs } from '../debris/crumb.js';
import { State } from '../debris/base.js';
import { makeTileFloor, paintMotif, paintStain } from '../floors/tile.js';
import { TAU, clamp, smoothstep } from '../core/math.js';

/**
 * Scene 2 — glossy kitchen tile.
 * Different motion law: crumbs are held by stiction, shiver, then break loose
 * and skate. Clearing the spill reveals the painted tile motif underneath and
 * a trail of stray grains leads off toward the next room.
 */
export class KitchenScene extends Scene {
  constructor(rng) {
    super('kitchen', rng);
    this.revealT = 0;
    this.spill = { x: 0, y: 0, r: 90 };
  }

  _p(nx, ny) { return { x: (nx - 0.5) * this.vw, y: (ny - 0.5) * this.vh }; }

  layout(pose, w, h) {
    super.layout(pose, w, h);
    w = this.vw; h = this.vh;
    this.debris.length = 0;
    this.revealT = 0;
    const rng = this.rng;
    const portrait = pose === 'portrait';
    this.rest = { x: 0, y: 0, zoom: this.scale, tilt: 0.05 };

    if (portrait) {
      this.startPointer = { x: 0.5, y: 0.78 };
      this.floor = makeTileFloor({ x0: -w * 0.95, y0: -h * 1.0, x1: w * 0.95, y1: h * 0.85 }, rng, { tile: 104 });
      this.counter = { x0: -w * 0.95, y0: -h * 0.98, x1: w * 0.28, y1: -h * 0.30 };
      this.exitGap = this._p(0.86, 0.10);
      const s = this._p(0.42, 0.40);
      this.spill = { x: s.x, y: s.y, r: 96 };
      this.exitCam = { x: w * 0.26, y: -h * 0.40, zoom: this.scale * 1.06, tilt: 0.3 };
    } else {
      this.startPointer = { x: 0.26, y: 0.78 };
      this.floor = makeTileFloor({ x0: -w * 0.9, y0: -h * 1.2, x1: w * 1.3, y1: h * 1.1 }, rng, { tile: 96 });
      this.counter = { x0: -w * 0.9, y0: -h * 1.2, x1: w * 1.3, y1: -h * 0.34 };
      this.exitGap = this._p(1.02, 0.28);
      const s = this._p(0.34, 0.46);
      this.spill = { x: s.x, y: s.y, r: 92 };
      this.exitCam = { x: w * 0.52, y: -h * 0.08, zoom: this.scale * 1.06, tilt: 0.2 };
    }

    // hidden motif under the stain
    paintMotif(this.floor, this.spill.x, this.spill.y, this.spill.r * 0.66, rng);
    this.floor.enableGrime();
    paintStain(this.floor, this.spill.x, this.spill.y, this.spill.r * 1.18, rng);

    // the spilled pile
    for (let i = 0; i < 58; i++) {
      const a = rng.range(0, TAU);
      const rr = Math.pow(rng.next(), 0.65) * this.spill.r * 0.82;
      const c = new Crumb(this.spill.x + Math.cos(a) * rr, this.spill.y + Math.sin(a) * rr * 0.8, rng);
      this.debris.push(c);
    }
    // a few grains that already rolled loose
    for (let i = 0; i < 7; i++) {
      const p = portrait
        ? this._p(rng.range(0.15, 0.85), rng.range(0.55, 0.82))
        : this._p(rng.range(0.12, 0.6), rng.range(0.6, 0.9));
      const c = new Crumb(p.x, p.y, rng, 'rice');
      this.debris.push(c);
    }
    // decor trail leading off-screen toward the next room (does not gate completion)
    const g = this.exitGap;
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const x = this.spill.x + (g.x - this.spill.x) * (0.45 + t * 0.75) + rng.range(-16, 16);
      const y = this.spill.y + (g.y - this.spill.y) * (0.45 + t * 0.75) + rng.range(-14, 14);
      const c = new Crumb(x, y, rng);
      c.decor = true;
      this.debris.push(c);
    }
  }

  onCaptured(d) {
    // each cleared crumb rubs a little of the grime away: discovery, not a bar
    this.floor.reveal(d.x, d.y, 30);
  }

  update(dt, ctx) {
    const list = this.debris;
    for (let i = 0; i < list.length; i++) list[i].update(dt, ctx.vacuum, ctx.world);
    resolveCrumbs(list);

    if (this.remaining() === 0 && this.revealT < 1) {
      const prev = this.revealT;
      this.revealT = clamp(this.revealT + dt / 1.1, 0, 1);
      const r0 = prev * this.spill.r * 1.25, r1 = this.revealT * this.spill.r * 1.25;
      for (let ring = 0; ring < 2; ring++) {
        const rr = r0 + (r1 - r0) * ((ring + 1) / 2);
        const n = 14;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + this.revealT * 2.2;
          this.floor.reveal(this.spill.x + Math.cos(a) * rr, this.spill.y + Math.sin(a) * rr * 0.86, 34);
        }
      }
      if (this.revealT >= 1) this.floor.clearGrime();
    }
  }

  isComplete() { return this.remaining() === 0 && this.revealT >= 1; }

  draw(ctx, cam) {
    this.drawFloor(ctx, cam);
    ctx.save();
    cam.apply(ctx);
    this._drawCounter(ctx);
    ctx.restore();
    this.drawDebris(ctx, cam);
  }

  _drawCounter(ctx) {
    const c = this.counter;
    // cabinet body
    ctx.fillStyle = '#e9e2d6';
    ctx.fillRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
    // doors
    ctx.strokeStyle = 'rgba(150,140,125,0.55)'; ctx.lineWidth = 3;
    const dw = 150;
    for (let x = c.x0 + 20; x < c.x1 - 20; x += dw) {
      ctx.strokeRect(x, c.y1 - 170, Math.min(dw - 14, c.x1 - 20 - x), 150);
    }
    // worktop lip
    ctx.fillStyle = '#b9aa94';
    ctx.fillRect(c.x0, c.y1 - 16, c.x1 - c.x0, 16);
    // kick-plate + contact shadow on the shiny floor
    ctx.fillStyle = '#5d5449';
    ctx.fillRect(c.x0, c.y1 - 6, c.x1 - c.x0, 6);
    const g = ctx.createLinearGradient(0, c.y1, 0, c.y1 + 46);
    g.addColorStop(0, 'rgba(40,40,45,0.30)');
    g.addColorStop(1, 'rgba(40,40,45,0)');
    ctx.fillStyle = g;
    ctx.fillRect(c.x0, c.y1, c.x1 - c.x0, 46);
    // reflection of the cabinet in the glossy tiles
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.scale(1, -1);
    ctx.fillStyle = '#e9e2d6';
    ctx.fillRect(c.x0, -c.y1 - 40, c.x1 - c.x0, 40);
    ctx.restore();
  }

  exit() { return { to: this.exitCam, dur: 1.5, next: null }; }

  entry() {
    const p = this.pose === 'portrait';
    return p
      ? { x: this.rest.x, y: this.rest.y + this.vh * 0.55, zoom: this.scale * 1.02, tilt: 0.3 }
      : { x: this.rest.x - this.vw * 0.5, y: this.rest.y, zoom: this.scale * 1.02, tilt: 0.22 };
  }
}
