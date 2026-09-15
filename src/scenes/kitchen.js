import { Scene } from './scene.js';
import { Crumb, resolveCrumbs } from '../debris/crumb.js';
import { Prop, resolveProps } from '../props/prop.js';
import { makeTileFloor, paintMotif, paintDust } from '../floors/tile.js';
import { TAU, clamp } from '../core/math.js';

/**
 * Scene 2 — glossy kitchen tile.
 * Different motion law: crumbs are held by stiction, shiver, then break loose
 * and skate. A tipped-over cereal bowl at the counter edge is the visible
 * SOURCE of the spill, which fans away from it. Clearing it reveals the painted
 * tile motif underneath, and a trail of stray grains leads off to the next room.
 */
export class KitchenScene extends Scene {
  constructor(rng) {
    super('kitchen', rng);
    this.revealT = 0;
    this.spill = { x: 0, y: 0, r: 110 };
  }

  _p(nx, ny) { return { x: (nx - 0.5) * this.vw, y: (ny - 0.5) * this.vh }; }

  layout(pose, w, h) {
    super.layout(pose, w, h);
    w = this.vw; h = this.vh;
    this.debris.length = 0;
    this.props.length = 0;
    this.revealT = 0;
    const rng = this.rng;
    const portrait = pose === 'portrait';
    this.rest = { x: 0, y: 0, zoom: this.scale, tilt: 0.05 };

    let bowl, dir;
    if (portrait) {
      this.startPointer = { x: 0.5, y: 0.80 };
      this.floor = makeTileFloor({ x0: -w * 0.95, y0: -h * 1.0, x1: w * 0.95, y1: h * 0.85 }, rng, { tile: 112 });
      this.counter = { x0: -w * 0.95, y0: -h * 0.98, x1: w * 0.30, y1: -h * 0.30 };
      this.exitGap = this._p(0.88, 0.10);
      bowl = this._p(0.30, 0.285);
      dir = { x: 0.34, y: 0.94 };
      this.exitCam = { x: w * 0.26, y: -h * 0.40, zoom: this.scale * 1.06, tilt: 0.3 };
    } else {
      this.startPointer = { x: 0.13, y: 0.86 };
      this.floor = makeTileFloor({ x0: -w * 0.9, y0: -h * 1.2, x1: w * 1.3, y1: h * 1.1 }, rng, { tile: 104 });
      this.counter = { x0: -w * 0.9, y0: -h * 1.2, x1: w * 1.3, y1: -h * 0.34 };
      this.exitGap = this._p(1.02, 0.30);
      bowl = this._p(0.34, 0.235);
      dir = { x: 0.30, y: 0.95 };
      this.exitCam = { x: w * 0.52, y: -h * 0.08, zoom: this.scale * 1.06, tilt: 0.2 };
    }

    const R = portrait ? 118 : 104;
    this.bowl = new Prop({
      x: bowl.x, y: bowl.y, shape: 'circle', r: 36, pushable: false, shadow: false,
      data: { dirX: dir.x, dirY: dir.y },
      draw: (ctx) => this._drawBowl(ctx),
    });
    this.props.push(this.bowl);
    this.spill = { x: bowl.x + dir.x * R * 0.62, y: bowl.y + dir.y * R * 0.62, r: R };

    // hidden motif under the dusting
    paintMotif(this.floor, this.spill.x, this.spill.y, this.spill.r * 0.62, rng);
    this.floor.enableGrime();
    paintDust(this.floor, this.spill.x, this.spill.y, this.spill.r * 1.06, rng, dir.x, dir.y);

    // the spill: a fan pouring out of the bowl's mouth, dense near the source
    const base = Math.atan2(dir.y, dir.x);
    for (let i = 0; i < 48; i++) {
      const t = Math.pow(rng.next(), 0.55);
      const spread = 0.30 + t * 0.62;
      const a = base + rng.range(-spread, spread);
      const d = 24 + t * R * 1.02;
      const c = new Crumb(bowl.x + Math.cos(a) * d + rng.range(-7, 7),
                          bowl.y + Math.sin(a) * d * 0.9 + rng.range(-6, 6), rng);
      this.debris.push(c);
    }
    // a few grains that already rolled loose (never within reach of the
    // parked nozzle, or they would vanish before the player touched anything)
    const park = this._p(this.startPointer.x, this.startPointer.y - 92 / this.scale / this.vh);
    this.persist.park = park;
    for (let i = 0; i < 7; i++) {
      let p = null;
      for (let tries = 0; tries < 24; tries++) {
        p = portrait
          ? this._p(rng.range(0.15, 0.85), rng.range(0.50, 0.78))
          : this._p(rng.range(0.20, 0.72), rng.range(0.52, 0.86));
        if (Math.hypot(p.x - park.x, p.y - park.y) > 250) break;
      }
      this.debris.push(new Crumb(p.x, p.y, rng, 'rice'));
    }
    // decor trail leading off-screen toward the next room (does not gate completion)
    const g = this.exitGap;
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const x = this.spill.x + (g.x - this.spill.x) * (0.45 + t * 0.75) + rng.range(-18, 18);
      const y = this.spill.y + (g.y - this.spill.y) * (0.45 + t * 0.75) + rng.range(-16, 16);
      const c = new Crumb(x, y, rng);
      c.decor = true;
      this.debris.push(c);
    }

    this.clearStartZone(245);

    // orientation change: replay whatever was already wiped clean
    const rev = this.persist.reveals;
    if (rev && rev.length) {
      for (let i = 0; i < rev.length; i++) {
        this.floor.reveal(this.spill.x + rev[i][0] * this.spill.r,
                          this.spill.y + rev[i][1] * this.spill.r,
                          rev[i][2] * this.spill.r);
      }
    }
    if (this.persist.revealed) { this.floor.clearGrime(); this.revealT = 1; }
  }

  onCaptured(d) {
    // each cleared crumb rubs a little of the dusting away: discovery, not a bar
    this.floor.reveal(d.x, d.y, 34);
    if (!this.persist.reveals) this.persist.reveals = [];
    if (this.persist.reveals.length < 400) {
      this.persist.reveals.push([
        +((d.x - this.spill.x) / this.spill.r).toFixed(3),
        +((d.y - this.spill.y) / this.spill.r).toFixed(3),
        +(34 / this.spill.r).toFixed(3),
      ]);
    }
  }

  update(dt, ctx) {
    const list = this.debris;
    let skating = 0;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      d.update(dt, ctx.vacuum, ctx.world);
      if (d.sliding) skating++;
    }
    resolveCrumbs(list);
    resolveProps(ctx.vacuum, this.props, dt);
    // a whole spill skating in at once hisses; one grain just ticks
    if (ctx.audio) ctx.audio.setStream(clamp((skating - 1) / 7, 0, 1));

    if (this.remaining() === 0 && this.revealT < 1) {
      const prev = this.revealT;
      this.revealT = clamp(this.revealT + dt / 1.1, 0, 1);
      const r0 = prev * this.spill.r * 1.2, r1 = this.revealT * this.spill.r * 1.2;
      for (let ring = 0; ring < 2; ring++) {
        const rr = r0 + (r1 - r0) * ((ring + 1) / 2);
        const n = 14;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + this.revealT * 2.2;
          this.floor.reveal(this.spill.x + Math.cos(a) * rr, this.spill.y + Math.sin(a) * rr * 0.86, 38);
        }
      }
      if (this.revealT >= 1) { this.floor.clearGrime(); this.persist.revealed = true; }
    }
  }

  isComplete() { return this.remaining() === 0 && this.revealT >= 1; }

  draw(ctx, cam) {
    this.drawFloor(ctx, cam);
    ctx.save();
    cam.apply(ctx);
    this._drawCounter(ctx);
    for (let i = 0; i < this.props.length; i++) this.props[i].draw(ctx);
    ctx.restore();
    this.drawDebris(ctx, cam);
  }

  /** A tipped-over cereal bowl: the visible reason there is a spill at all. */
  _drawBowl(ctx) {
    const b = this.bowl;
    const a = Math.atan2(b.data.dirY, b.data.dirX);
    ctx.save();
    ctx.fillStyle = 'rgba(40,44,52,0.24)';
    ctx.beginPath(); ctx.ellipse(b.x + 6, b.y + 14, 46, 18, 0, 0, TAU); ctx.fill();
    ctx.translate(b.x, b.y);
    ctx.rotate(a);
    // the bowl lying on its side: we see the underside and then the open rim
    ctx.fillStyle = '#f2f5f8';
    ctx.beginPath(); ctx.ellipse(-16, 0, 30, 32, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e4eaf0';
    ctx.beginPath(); ctx.ellipse(-24, 0, 16, 18, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#eef2f6';
    ctx.fillRect(-16, -32, 34, 64);
    // opening, facing the spill: dark inside, thick white rim
    ctx.fillStyle = '#7d8893';
    ctx.beginPath(); ctx.ellipse(18, 0, 15, 32, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4e5964';
    ctx.beginPath(); ctx.ellipse(20, 0, 10, 26, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(18, 0, 15, 32, 0, 0, TAU); ctx.stroke();
    // a couple of grains still caught in the mouth
    ctx.fillStyle = '#f4ecdc';
    ctx.beginPath(); ctx.ellipse(21, -8, 5, 2.4, 0.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(19, 9, 5, 2.4, -0.3, 0, TAU); ctx.fill();
    // blue band so it reads as crockery, not a stone
    ctx.strokeStyle = '#79a9d4'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-14, -30); ctx.lineTo(-14, 30); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,140,160,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(-16, 0, 30, 32, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  _drawCounter(ctx) {
    const c = this.counter;
    ctx.fillStyle = '#e9e2d6';
    ctx.fillRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
    ctx.strokeStyle = 'rgba(150,140,125,0.55)'; ctx.lineWidth = 3;
    const dw = 170;
    for (let x = c.x0 + 20; x < c.x1 - 20; x += dw) {
      ctx.strokeRect(x, c.y1 - 190, Math.min(dw - 16, c.x1 - 20 - x), 168);
    }
    ctx.fillStyle = '#b9aa94';
    ctx.fillRect(c.x0, c.y1 - 18, c.x1 - c.x0, 18);
    ctx.fillStyle = '#5d5449';
    ctx.fillRect(c.x0, c.y1 - 6, c.x1 - c.x0, 6);
    const g = ctx.createLinearGradient(0, c.y1, 0, c.y1 + 50);
    g.addColorStop(0, 'rgba(40,40,45,0.30)');
    g.addColorStop(1, 'rgba(40,40,45,0)');
    ctx.fillStyle = g;
    ctx.fillRect(c.x0, c.y1, c.x1 - c.x0, 50);
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.scale(1, -1);
    ctx.fillStyle = '#e9e2d6';
    ctx.fillRect(c.x0, -c.y1 - 44, c.x1 - c.x0, 44);
    ctx.restore();
  }

  exit() { return { to: this.exitCam, dur: 1.5, next: 'paper' }; }

  entry() {
    const p = this.pose === 'portrait';
    return p
      ? { x: this.rest.x, y: this.rest.y + this.vh * 0.55, zoom: this.scale * 1.02, tilt: 0.3 }
      : { x: this.rest.x - this.vw * 0.5, y: this.rest.y, zoom: this.scale * 1.02, tilt: 0.22 };
  }
}
