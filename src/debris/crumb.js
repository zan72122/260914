import { Debris, State } from './base.js';
import { smoothstep, TAU, noise1 } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

const STATIC_THRESHOLD = 0.34;   // field strength needed to break stiction
const RESTICK = 0.09;            // below this and nearly stopped -> sticks again
const ACC = 900;                 // airflow acceleration while sliding
const KINETIC = 2.1;             // low friction: they skate

/**
 * Crumbs / rice grains on a slippery floor.
 *  - still, then shivering in place (rotation only) as the flow builds
 *  - past stiction they break loose and ACCELERATE, curving into the cone
 *  - if the nozzle passes by they overshoot, skate, spin and bump each other
 */
export class Crumb extends Debris {
  constructor(x, y, rng, kind) {
    super(x, y);
    this.rng = rng;
    this.kind2 = kind || (rng.next() < 0.45 ? 'rice' : 'crumb');
    this.r = this.kind2 === 'rice' ? rng.range(3.4, 4.3) : rng.range(2.8, 5.4);
    this.rot = rng.range(0, TAU);
    this.spin = 0;
    this.seed = rng.range(0, 100);
    this.sliding = false;
    this.shiver = 0;
    this.color = this.kind2 === 'rice' ? '#f6f0e2' : rng.pick(['#e0ab63', '#d19a4f', '#eec07f', '#c98c45']);
    // pre-baked unit outline (no per-frame allocation)
    const nv = this.kind2 === 'rice' ? 8 : 6;
    this.poly = new Float32Array(nv * 2);
    for (let i = 0; i < nv; i++) {
      const a = (i / nv) * TAU;
      const rr = this.kind2 === 'rice' ? 1 : rng.range(0.7, 1.25);
      this.poly[i * 2] = Math.cos(a) * rr * (this.kind2 === 'rice' ? 1.9 : 1.1);
      this.poly[i * 2 + 1] = Math.sin(a) * rr * (this.kind2 === 'rice' ? 0.72 : 0.95);
    }
  }
  get type() { return 'crumb'; }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;
    const f = vac.field(this.x, this.y, TMPF);
    const s = f.strength;
    this.strength = s;

    if (this.state === State.DONE) return;

    if (!this.sliding) {
      // stiction: only a rotational shiver, growing with the flow
      this.shiver += (smoothstep(0.04, STATIC_THRESHOLD, s) - this.shiver) * (1 - Math.exp(-14 * dt));
      this.rot += noise1(this.t * 30 + this.seed) * this.shiver * 4.5 * dt;
      this.state = s > 0.05 ? State.REACTING : State.IDLE;
      if (s > STATIC_THRESHOLD) {
        this.sliding = true;
        this.state = State.PULLED;
        // the break-away kick makes the moment readable
        this.vx = f.fx * 26; this.vy = f.fy * 26;
        this.spin = (this.rng.next() - 0.5) * 9;
      }
    } else {
      this.vx += f.fx * ACC * dt;
      this.vy += f.fy * ACC * dt;
      const d = Math.exp(-KINETIC * dt);
      this.vx *= d; this.vy *= d;
      this.x += this.vx * dt; this.y += this.vy * dt;
      const sp = Math.hypot(this.vx, this.vy);
      this.spin += (sp * 0.016 - this.spin) * (1 - Math.exp(-4 * dt));
      this.rot += this.spin * dt;
      this.state = State.PULLED;
      if (s < RESTICK && sp < 14) { this.sliding = false; this.vx = 0; this.vy = 0; this.hx = this.x; this.hy = this.y; }
    }

    if (f.inCapture) {
      this._handOff(vac, { kind: 'crumb', color: this.color, size: this.r * 2.1 });
      world.onCaptured && world.onCaptured(this);
    }
  }

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    const jx = this.shiver * noise1(this.t * 34 + this.seed) * 0.9;
    const jy = this.shiver * noise1(this.t * 34 + this.seed + 11) * 0.9;
    ctx.save();
    ctx.translate(this.x + jx, this.y + jy);
    ctx.rotate(this.rot);
    ctx.scale(this.r, this.r);
    ctx.beginPath();
    const p = this.poly;
    ctx.moveTo(p[0], p[1]);
    for (let i = 1; i < p.length / 2; i++) ctx.lineTo(p[i * 2], p[i * 2 + 1]);
    ctx.closePath();
    ctx.fillStyle = 'rgba(60,44,26,0.45)';
    ctx.save(); ctx.translate(0.22, 0.28); ctx.fill(); ctx.restore();
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.restore();
    // skate smear
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > 120) {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = this.r * 0.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x - this.vx * 0.022, this.y - this.vy * 0.022);
      ctx.stroke();
    }
  }
}

/**
 * Cheap O(n^2) circle repulsion between crumbs so a pile shoves itself apart.
 * Called by the scene, not by the core.
 */
export function resolveCrumbs(list) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.state === State.DONE) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.state === State.DONE) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = (a.r + b.r) * 1.05;
      const d2 = dx * dx + dy * dy;
      if (d2 > rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (rr - d) * 0.5;
      const nx = dx / d, ny = dy / d;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      if (a.sliding || b.sliding) {
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          const imp = rel * 0.45;
          a.vx += nx * imp; a.vy += ny * imp;
          b.vx -= nx * imp; b.vy -= ny * imp;
          a.spin += imp * 0.03; b.spin -= imp * 0.03;
        }
      }
    }
  }
}
