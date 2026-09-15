import { Scene } from './scene.js';
import { DustBunny } from '../debris/dustBunny.js';
import { State } from '../debris/base.js';
import { makeWoodFloor } from '../floors/wood.js';
import { TAU, clamp, smoothstep } from '../core/math.js';

/**
 * Scene 1 — wood floor, dust bunnies.
 * Teaches the whole game with no words: one bunny sits just inside the idle
 * airflow, so its near fibers already sway before the player does anything.
 */
export class IntroScene extends Scene {
  constructor(rng) {
    super('intro', rng);
    this.firstCaptured = false;
    this.leg = null;
    this.sparkles = [];
  }

  _p(nx, ny) { return { x: (nx - 0.5) * this.vw, y: (ny - 0.5) * this.vh }; }

  layout(pose, w, h) {
    super.layout(pose, w, h);
    w = this.vw; h = this.vh;
    this.debris.length = 0;
    this.sparkles.length = 0;
    this.firstCaptured = false;
    const rng = this.rng;

    const portrait = pose === 'portrait';
    this.rest = { x: 0, y: 0, zoom: this.scale, tilt: 0 };

    if (portrait) {
      this.startPointer = { x: 0.5, y: 0.72 };
      this.door = { x: 0, y: -h * 0.60, w: 150, h: 200 };
      this.wallY = -h * 0.52;
      this.floor = makeWoodFloor({ x0: -w * 0.95, y0: -h * 1.25, x1: w * 0.95, y1: h * 0.85 }, rng, { plankW: 84 });
      this.leg = this._p(0.17, 0.235);
      this._spawn([
        [0.50, 0.46, 24, false],
        [0.27, 0.355, 20, false],
        [0.72, 0.285, 22, false],
        [0.45, 0.165, 18, false],
      ]);
      this.rollIn = this._makeBunny(0.71, 0.45, 21);
      this.rollIn.entryFrom = this._p(1.35, 0.52);
      this.peeker = this._makeBunny(0.225, 0.245, 17);
      this.peeker.peekFrom = this._p(0.155, 0.235);
      this.exitCam = { x: 0, y: -h * 0.60, zoom: this.scale * 1.04, tilt: 0.32 };
    } else {
      this.startPointer = { x: 0.20, y: 0.78 };
      this.door = { x: w * 0.76, y: -h * 0.06, w: 170, h: 230 };
      this.wallX = w * 0.60;
      this.floor = makeWoodFloor({ x0: -w * 0.9, y0: -h * 1.1, x1: w * 1.35, y1: h * 1.1 }, rng, { plankW: 78, horizontal: true });
      this.leg = this._p(0.615, 0.135);
      this._spawn([
        [0.22, 0.335, 23, false],
        [0.40, 0.505, 20, false],
        [0.545, 0.255, 21, false],
        [0.71, 0.44, 18, false],
      ]);
      this.rollIn = this._makeBunny(0.50, 0.73, 21);
      this.rollIn.entryFrom = this._p(-0.35, 0.80);
      this.peeker = this._makeBunny(0.665, 0.175, 17);
      this.peeker.peekFrom = this._p(0.60, 0.14);
      this.exitCam = { x: w * 0.55, y: -h * 0.05, zoom: this.scale * 1.04, tilt: 0.24 };
    }
    // the late arrivals wait off-stage until the player has understood the game
    this.rollIn.dormant = true;
    this.peeker.dormant = true;
    this.debris.push(this.rollIn, this.peeker);
  }

  _makeBunny(nx, ny, r) {
    const p = this._p(nx, ny);
    const b = new DustBunny(p.x, p.y, r, this.rng);
    b.hx = p.x; b.hy = p.y;
    return b;
  }
  _spawn(list) {
    for (let i = 0; i < list.length; i++) {
      const [nx, ny, r] = list[i];
      this.debris.push(this._makeBunny(nx, ny, r));
    }
  }

  onCaptured(d, ctx) {
    // little burst of fluff at the mouth
    for (let i = 0; i < 7; i++) {
      this.sparkles.push({
        x: d.x, y: d.y,
        vx: this.rng.range(-70, 70), vy: this.rng.range(-70, 70),
        life: 1, r: this.rng.range(1.2, 3),
      });
    }
    if (!this.firstCaptured) {
      this.firstCaptured = true;
      // the world answers: one rolls in from off-screen, one peeks out
      const b = this.rollIn;
      b.dormant = false;
      b.entry = { fromX: b.entryFrom.x, fromY: b.entryFrom.y, t: 0, dur: 1.15 };
      const p = this.peeker;
      p.dormant = false;
      p.entry = { fromX: p.peekFrom.x, fromY: p.peekFrom.y, t: 0, dur: 0.9 };
    }
  }

  update(dt, ctx) {
    const list = this.debris;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.dormant) continue;
      d.update(dt, ctx.vacuum, ctx.world);
    }
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i];
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= 0.93; s.vy *= 0.93;
      s.life -= dt * 1.6;
      if (s.life <= 0) this.sparkles.splice(i, 1);
    }
  }

  remaining() {
    let n = 0;
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (d.decor) continue;
      if (d.dormant) { n++; continue; }
      if (d.state !== State.DONE) n++;
    }
    return n;
  }

  draw(ctx, cam) {
    this.drawFloor(ctx, cam);
    ctx.save();
    cam.apply(ctx);
    this._drawWall(ctx);
    this._drawLeg(ctx);
    ctx.restore();
    this.drawDebris(ctx, cam);
    ctx.save();
    cam.apply(ctx);
    ctx.fillStyle = 'rgba(210,200,185,0.85)';
    for (let i = 0; i < this.sparkles.length; i++) {
      const s = this.sparkles[i];
      ctx.globalAlpha = clamp(s.life, 0, 1) * 0.8;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawWall(ctx) {
    const d = this.door;
    if (this.pose === 'portrait') {
      const y = this.wallY;
      const x0 = -this.vw * 0.95, x1 = this.vw * 0.95;
      ctx.fillStyle = '#e6d8c3';
      ctx.fillRect(x0, y - 520, x1 - x0, 520);
      ctx.fillStyle = '#cbb99f';
      ctx.fillRect(x0, y - 18, x1 - x0, 18);
      // doorway: warm light spilling out of the next room
      ctx.fillStyle = '#2b2622';
      ctx.fillRect(d.x - d.w / 2, y - d.h, d.w, d.h);
      const g = ctx.createLinearGradient(0, y - d.h, 0, y + 90);
      g.addColorStop(0, 'rgba(255,226,160,0.85)');
      g.addColorStop(1, 'rgba(255,226,160,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(d.x - d.w / 2, y - d.h, d.w, d.h + 90);
      ctx.strokeStyle = '#b9a586'; ctx.lineWidth = 8;
      ctx.strokeRect(d.x - d.w / 2, y - d.h, d.w, d.h);
    } else {
      const x = this.wallX;
      const y0 = -this.vh * 1.1, y1 = this.vh * 1.1;
      ctx.fillStyle = '#e6d8c3';
      ctx.fillRect(x, y0, this.vw * 0.9, y1 - y0);
      ctx.fillStyle = '#cbb99f';
      ctx.fillRect(x, y0, 16, y1 - y0);
      ctx.fillStyle = '#2b2622';
      ctx.fillRect(x + 10, d.y - d.h / 2, d.w, d.h);
      const g = ctx.createLinearGradient(x + 10, 0, x + 10 + d.w + 80, 0);
      g.addColorStop(0, 'rgba(255,226,160,0.0)');
      g.addColorStop(0.15, 'rgba(255,226,160,0.8)');
      g.addColorStop(1, 'rgba(255,226,160,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 80, d.y - d.h / 2, d.w + 170, d.h);
      ctx.strokeStyle = '#b9a586'; ctx.lineWidth = 8;
      ctx.strokeRect(x + 10, d.y - d.h / 2, d.w, d.h);
    }
  }

  _drawLeg(ctx) {
    const l = this.leg;
    if (!l) return;
    ctx.fillStyle = 'rgba(40,28,16,0.18)';
    ctx.beginPath(); ctx.ellipse(l.x + 10, l.y + 34, 34, 11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8a5a33';
    ctx.beginPath();
    ctx.moveTo(l.x - 13, l.y - 120);
    ctx.lineTo(l.x + 13, l.y - 120);
    ctx.lineTo(l.x + 10, l.y + 30);
    ctx.lineTo(l.x - 10, l.y + 30);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a9713f';
    ctx.fillRect(l.x - 13, l.y - 120, 9, 150);
    ctx.fillStyle = '#6e4524';
    ctx.beginPath(); ctx.ellipse(l.x, l.y + 30, 11, 5, 0, 0, TAU); ctx.fill();
  }

  exit() {
    const next = 'kitchen';
    return { to: this.exitCam, dur: 1.45, next };
  }
  entry() { return { x: this.rest.x, y: this.rest.y, zoom: this.scale, tilt: 0 }; }
}
