import { Scene } from './scene.js';
import { DustBunny } from '../debris/dustBunny.js';
import { State } from '../debris/base.js';
import { makeWoodFloor } from '../floors/wood.js';
import { Prop, resolveProps } from '../props/prop.js';
import { TAU, clamp } from '../core/math.js';

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
      this.door = { x: 0, y: -h * 0.575, w: 150, h: 210 };
      this.wallY = -h * 0.455;
      this.floor = makeWoodFloor({ x0: -w * 0.95, y0: -h * 1.25, x1: w * 0.95, y1: h * 0.85 }, rng, { plankW: 84 });
      this.leg = this._p(0.17, 0.235);
      this._spawn([
        [0.50, 0.435, 33, false],
        [0.26, 0.345, 28, false],
        [0.73, 0.275, 31, false],
        [0.45, 0.155, 25, false],
      ]);
      this.rollIn = this._makeBunny(0.73, 0.455, 29);
      this.rollIn.entryFrom = this._p(1.35, 0.52);
      this.peeker = this._makeBunny(0.235, 0.245, 24);
      this.peeker.peekFrom = this._p(0.155, 0.235);
      this.exitCam = { x: 0, y: -h * 0.575, zoom: this.scale * 1.04, tilt: 0.32 };
    } else {
      // The wide room has to show WHERE NEXT while the vacuum is still parked:
      // the wall with its lit doorway is on screen from the first frame, at the
      // right-hand end of the floor, with the table leg between here and there.
      this.startPointer = { x: 0.20, y: 0.78 };
      this.wallX = w * 0.34;
      this.door = { x: 0, y: -h * 0.03, w: 118, h: 208 };
      this.floor = makeWoodFloor({ x0: -w * 0.9, y0: -h * 1.1, x1: w * 1.35, y1: h * 1.1 }, rng, { plankW: 78, horizontal: true });
      this.leg = this._p(0.615, 0.150);
      // the very first bunny sits a head and a half AHEAD of the parked nozzle,
      // inside the idle airflow, so its near edge is already swaying at rest
      const park = this.parkPoint(78);
      this.debris.push(this._makeBunnyAt(park.x + 18, park.y - 146, 33));
      this._spawn([
        [0.375, 0.300, 28, false],
        [0.545, 0.560, 30, false],
        [0.665, 0.330, 25, false],
      ]);
      this.rollIn = this._makeBunny(0.49, 0.80, 29);
      this.rollIn.entryFrom = this._p(-0.35, 0.86);
      this.peeker = this._makeBunny(0.670, 0.185, 24);
      this.peeker.peekFrom = this._p(0.60, 0.15);
      this.exitCam = { x: w * 0.34, y: -h * 0.03, zoom: this.scale * 1.04, tilt: 0.24 };
    }
    // the late arrivals wait off-stage until the player has understood the game
    this.props.length = 0;
    this.props.push(new Prop({
      x: this.leg.x, y: this.leg.y, shape: 'circle', r: 15, pushable: false,
      shadow: false, draw: () => {},
    }));
    this.rollIn.dormant = true;
    this.peeker.dormant = true;
    this.debris.push(this.rollIn, this.peeker);
    this.clearStartZone(138);
    // The roll-in bunny is the LAST piece in the room, and in landscape it sat
    // at y = 117 with the reach rectangle ending at y = 117: the head could
    // touch it only with the finger jammed against the bottom of the glass. The
    // driver ground on it for fourteen seconds, and the first room in the game
    // took 29s instead of 6. Nothing here is meant to be won at the edge of the
    // machine's travel.
    this.pullIntoReach(34);
    this.placeBin();
  }

  _makeBunny(nx, ny, r) {
    const p = this._p(nx, ny);
    return this._makeBunnyAt(p.x, p.y, r);
  }
  _makeBunnyAt(x, y, r) {
    const b = new DustBunny(x, y, r, this.rng);
    b.hx = x; b.hy = y;
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
    resolveProps(ctx.vacuum, this.props, dt);
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
      // the next room's light, thrown out across THIS floor: drawn first so it
      // lies on the boards
      const R = d.w * 1.5;
      const sp = ctx.createRadialGradient(d.x, y, 8, d.x, y, R);
      sp.addColorStop(0, 'rgba(255,222,146,0.55)');
      sp.addColorStop(0.5, 'rgba(255,222,146,0.26)');
      sp.addColorStop(1, 'rgba(255,222,146,0)');
      ctx.fillStyle = sp;
      ctx.beginPath(); ctx.ellipse(d.x, y, R, R * 0.78, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e6d8c3';
      ctx.fillRect(x0, y - 520, x1 - x0, 520);
      ctx.fillStyle = '#cbb99f';
      ctx.fillRect(x0, y - 18, x1 - x0, 18);
      ctx.fillStyle = 'rgba(70,52,30,0.22)';
      ctx.fillRect(x0, y, x1 - x0, 11);
      // doorway: an opening FULL of warm light, brightest where it meets the floor
      ctx.fillStyle = '#7a6444';
      ctx.fillRect(d.x - d.w / 2 - 9, y - d.h - 9, d.w + 18, d.h + 9);
      const g = ctx.createLinearGradient(0, y - d.h, 0, y);
      g.addColorStop(0, '#e7b368');
      g.addColorStop(0.45, '#ffdd95');
      g.addColorStop(1, '#fff0c8');
      ctx.fillStyle = g;
      ctx.fillRect(d.x - d.w / 2, y - d.h, d.w, d.h);
      ctx.fillStyle = 'rgba(120,88,44,0.30)';
      ctx.fillRect(d.x - d.w / 2, y - d.h, d.w, 16);
      ctx.strokeStyle = '#b9a586'; ctx.lineWidth = 7;
      ctx.strokeRect(d.x - d.w / 2 - 5, y - d.h - 5, d.w + 10, d.h + 5);
    } else {
      const x = this.wallX;
      const y0 = -this.vh * 1.1, y1 = this.vh * 1.1;
      // light out of the next room, thrown across THIS floor: drawn first, so
      // it lies on the boards and not on the wall
      const R = d.h * 1.15;
      const sp = ctx.createRadialGradient(x + 10, d.y, 8, x + 10, d.y, R);
      sp.addColorStop(0, 'rgba(255,222,146,0.52)');
      sp.addColorStop(0.5, 'rgba(255,222,146,0.26)');
      sp.addColorStop(1, 'rgba(255,222,146,0)');
      ctx.fillStyle = sp;
      ctx.beginPath(); ctx.ellipse(x + 10, d.y, R, R * 0.82, 0, 0, TAU); ctx.fill();
      // the wall itself
      ctx.fillStyle = '#e6d8c3';
      ctx.fillRect(x, y0, this.vw * 0.9, y1 - y0);
      ctx.fillStyle = '#cbb99f';
      ctx.fillRect(x, y0, 18, y1 - y0);
      ctx.fillStyle = 'rgba(70,52,30,0.22)';
      ctx.fillRect(x + 18, y0, 12, y1 - y0);
      // the doorway: an opening full of warm light, with a dark frame
      const dy = d.y - d.h / 2;
      ctx.fillStyle = '#7a6444';
      ctx.fillRect(x + 8, dy - 9, d.w + 26, d.h + 18);
      const g = ctx.createLinearGradient(x + 18, 0, x + 18 + d.w, 0);
      g.addColorStop(0, '#ffeec2');
      g.addColorStop(0.55, '#ffdd95');
      g.addColorStop(1, '#e7b368');
      ctx.fillStyle = g;
      ctx.fillRect(x + 18, dy, d.w, d.h);
      ctx.fillStyle = 'rgba(120,88,44,0.35)';
      ctx.fillRect(x + 18, dy, d.w, 14);
      ctx.strokeStyle = '#b9a586'; ctx.lineWidth = 7;
      ctx.strokeRect(x + 12, dy - 5, d.w + 12, d.h + 10);
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
  /**
   * The first room, and also the room the game loops back to: carpet's finale
   * pulls the camera back off the empty cup, so this pushes gently in again.
   */
  entry() { return { x: this.rest.x, y: this.rest.y, zoom: this.scale * 0.9, tilt: 0 }; }
}
