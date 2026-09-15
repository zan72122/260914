import { Debris, State } from './base.js';
import { clamp, smoothstep, TAU, noise1 } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

/**
 * Fluffy ball of fibers. Everything it does is suction-specific:
 *  - every fiber samples the field at its OWN tip, so the near edge leans first
 *  - in the flow but not yet free it STRAINS rhythmically (elastic stretch and
 *    relax, ~2-3Hz, trembling harder as the flow grows) — it is never static
 *  - above a mid threshold it starts LOSING FIBERS one at a time; each wisp
 *    flies into the mouth with a tick, the bunny visibly thins, and its
 *    break-loose threshold drops, so holding still always ends in a pop
 *  - just before letting go it cocks AWAY from the nozzle for ~80ms, then
 *    accelerates in, stretched by its own speed, and the head gulps
 */
export class DustBunny extends Debris {
  constructor(x, y, r, rng) {
    super(x, y);
    this.r = r;
    this.rng = rng;
    this.n = Math.round(22 + r * 0.7);
    this.fa = new Float32Array(this.n);   // base angle
    this.fl = new Float32Array(this.n);   // fiber length (0 = shed)
    this.fx = new Float32Array(this.n);   // tip offset
    this.fy = new Float32Array(this.n);
    this.fvx = new Float32Array(this.n);
    this.fvy = new Float32Array(this.n);
    this.fw = new Float32Array(this.n);   // wiggle seed
    this.fd = new Uint8Array(this.n);     // 1 = drawn dark
    this.fc = new Float32Array(this.n);   // curl, so fibers look wispy not spiky
    for (let i = 0; i < this.n; i++) {
      this.fa[i] = (i / this.n) * TAU + rng.range(-0.08, 0.08);
      this.fl[i] = r * rng.range(0.78, 1.25);
      this.fw[i] = rng.range(0, 100);
      this.fd[i] = rng.next() < 0.18 ? 1 : 0;
      this.fc[i] = rng.range(-0.42, 0.42);
    }
    this.fibers = this.n;   // living fibers (the base class owns `alive`)
    this.seed = rng.range(0, 100);
    this.squash = 0;
    this.stretch = 0;
    this.pulse = rng.range(0, TAU);
    this.cock = 0;          // 0..1 wind-up away from the nozzle
    this.cockT = -1;
    this.aimX = 0; this.aimY = -1;
    this.tremble = 0;
    this.spin = 0;
    this.core = '#a9a094';
    this.rim = '#82786a';
    this.light = '#c6bfb4';
    this.entry = null;
    this.shedT = 0.35;
    this.wisps = [];
    for (let i = 0; i < 7; i++) this.wisps.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, a: 0, len: 6 });
  }
  get type() { return 'bunny'; }

  /** Thinning out makes it easier to pull free: a held approach always wins. */
  get breakThreshold() { return 0.70 + 0.50 * (this.fibers / this.n); }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;

    if (this.entry) {
      const e = this.entry;
      e.t += dt;
      const u = clamp(e.t / e.dur, 0, 1);
      const k = 1 - Math.pow(1 - u, 3);
      this.x = e.fromX + (this.hx - e.fromX) * k;
      this.y = e.fromY + (this.hy - e.fromY) * k;
      this.spin += dt * 7 * (1 - u);
      if (u >= 1) this.entry = null;
      this._relaxFibers(dt);
      return;
    }

    const f = vac.field(this.x, this.y, this._f);   // own scratch: fibers/wisps reuse TMPF
    const s = f.strength;
    this.strength = s;

    if (s > 0.001) {
      const l = Math.hypot(f.fx, f.fy) || 1;
      const k = 1 - Math.exp(-10 * dt);
      this.aimX += (f.fx / l - this.aimX) * k;
      this.aimY += (f.fy / l - this.aimY) * k;
    }

    this._updateWisps(dt, vac);

    // ---- captured -------------------------------------------------------
    if (this.state === State.CAPTURED) {
      this.squash += dt / 0.09;
      this.stretch = Math.min(1.9, this.stretch + dt * 12);
      if (this.squash >= 1) {
        this._handOff(vac, { kind: 'fluff', color: this.light, size: this.r * 0.85 });
        world.onCaptured && world.onCaptured(this);
      }
      this._updateFibers(dt, vac, 1.6);
      return;
    }

    // ---- free, flying in ------------------------------------------------
    if (this.state === State.PULLED) {
      const acc = 330;
      this.vx += f.fx * acc * dt;
      this.vy += f.fy * acc * dt;
      const damp = Math.exp(-2.2 * dt);
      this.vx *= damp; this.vy *= damp;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.spin += (this.vx * 0.004 + 0.4) * dt * 6;
      const speedStretch = clamp(Math.hypot(this.vx, this.vy) / 420, 0, 0.75);
      this.stretch = clamp(this.stretch + (smoothstep(0.7, 2.0, s) + 0.18 + speedStretch - this.stretch) * dt * 9, 0, 1.5);
      this.tremble = clamp(s * 0.9, 0, 1.4);
      if (f.inCapture) { this.state = State.CAPTURED; this.squash = 0; }
      else if (s < 0.3 && Math.hypot(this.vx, this.vy) < 26) {
        this.state = State.REACTING;
        this.hx = this.x; this.hy = this.y;
        this.vx *= 0.3; this.vy *= 0.3;
        this.cockT = -1; this.cock = 0;
      }
      this._updateFibers(dt, vac, 1.25);
      return;
    }

    // ---- anchored: strain, pulse, shed ----------------------------------
    const strain = smoothstep(0.10, 1.05, s);
    const thr = this.breakThreshold;

    // rhythmic elastic strain: stretch toward the nozzle, relax, again
    this.pulse += dt * TAU * (2.0 + 1.1 * strain);
    const pulseK = 0.80 + 0.20 * Math.sin(this.pulse);
    const base = smoothstep(0.22, 1.30, s);

    // wind-up: pull back AWAY from the nozzle just before letting go
    if (this.cockT < 0 && s > thr * 0.9) this.cockT = 0;
    if (this.cockT >= 0) {
      this.cockT += dt;
      this.cock = clamp(this.cockT / 0.08, 0, 1);
      if (this.cockT >= 0.08 || s > thr) {
        if (s > thr * 0.88) {
          // release: the wind-up snaps forward into the flow
          this.state = State.PULLED;
          this.vx += f.fx * 120; this.vy += f.fy * 120;
          this.cockT = -1; this.cock = 0;
          this._updateFibers(dt, vac, 1.25);
          return;                       // do NOT fall through to the idle/reacting assignment
        }
        this.cockT = -1; this.cock = 0;
      }
    } else if (s < thr * 0.7) { this.cock = 0; }

    const pull = this.cock > 0 ? -0.55 * this.cock : 1;
    const maxPull = this.r * 0.45;
    const tx = this.hx + f.fx * 40 * pull, ty = this.hy + f.fy * 40 * pull;
    const dx = clamp(tx - this.hx, -maxPull, maxPull), dy = clamp(ty - this.hy, -maxPull, maxPull);
    const omega = 16;
    const gx = this.hx + dx, gy = this.hy + dy;
    const ax = -2 * omega * this.vx - omega * omega * (this.x - gx);
    const ay = -2 * omega * this.vy - omega * omega * (this.y - gy);
    this.vx += ax * dt; this.vy += ay * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;

    const stretchTarget = base * pulseK * (1 - 0.7 * this.cock);
    this.stretch += (stretchTarget - this.stretch) * (1 - Math.exp(-11 * dt));
    this.tremble += (strain * (0.8 + 0.4 * Math.sin(this.pulse * 2)) - this.tremble) * (1 - Math.exp(-11 * dt));
    this.spin += this.tremble * Math.sin(this.t * 22 + this.seed) * dt * 0.6;

    // shedding: the flow tears single fibers off long before the body goes
    if (s > 0.5 && this.fibers > 6) {
      this.shedT -= dt * (s - 0.4) * 2.6;
      if (this.shedT <= 0) { this.shedT = 0.28 + this.rng.next() * 0.22; this._shed(vac); }
    }

    this.state = s > 0.1 ? State.REACTING : State.IDLE;
    if (f.inCapture) { this.state = State.CAPTURED; this.squash = 0; }

    this._updateFibers(dt, vac, 1.0);
  }

  // ------------------------------------------------------------- shedding

  _shed(vac) {
    // pick a living fiber on the side facing the nozzle
    let best = -1, bestDot = -2;
    for (let i = 0; i < this.n; i++) {
      if (this.fl[i] <= 0) continue;
      const a = this.fa[i] + this.spin;
      const d = Math.cos(a) * this.aimX + Math.sin(a) * this.aimY + this.rng.range(-0.35, 0.35);
      if (d > bestDot) { bestDot = d; best = i; }
    }
    if (best < 0) return;
    const a = this.fa[best] + this.spin;
    const L = this.fl[best];
    for (let i = 0; i < this.wisps.length; i++) {
      const w = this.wisps[i];
      if (w.life > 0) continue;
      w.x = this.x + Math.cos(a) * L + this.fx[best];
      w.y = this.y + Math.sin(a) * L * 0.86 + this.fy[best];
      w.vx = 0; w.vy = 0; w.life = 1; w.a = a; w.len = L * 0.55;
      break;
    }
    this.fl[best] = 0;
    this.fx[best] = 0; this.fy[best] = 0; this.fvx[best] = 0; this.fvy[best] = 0;
    this.fibers--;
    this.r *= 0.994;
  }

  _updateWisps(dt, vac) {
    for (let i = 0; i < this.wisps.length; i++) {
      const w = this.wisps[i];
      if (w.life <= 0) continue;
      const f = vac.field(w.x, w.y, TMPF);
      w.vx += f.fx * 1500 * dt;
      w.vy += f.fy * 1500 * dt;
      w.vx *= 0.93; w.vy *= 0.93;
      w.x += w.vx * dt; w.y += w.vy * dt;
      w.a = Math.atan2(w.vy, w.vx);
      w.life -= dt * 0.55;
      if (f.inCapture) {
        w.life = 0;
        vac.transit({ kind: 'wisp', color: this.light, size: 5 });
      }
    }
  }

  // -------------------------------------------------------------- fibers

  _relaxFibers(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.fl[i] <= 0) continue;
      const o = 14;
      const ax = -2 * o * this.fvx[i] - o * o * this.fx[i];
      const ay = -2 * o * this.fvy[i] - o * o * this.fy[i];
      this.fvx[i] += ax * dt; this.fvy[i] += ay * dt;
      this.fx[i] += this.fvx[i] * dt; this.fy[i] += this.fvy[i] * dt;
    }
  }

  /** Each fiber samples the field at its own tip: the near edge leans first. */
  _updateFibers(dt, vac, gain) {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const L = this.fl[i];
      if (L <= 0) continue;
      const a = this.fa[i] + this.spin;
      const bx = this.x + Math.cos(a) * L;
      const by = this.y + Math.sin(a) * L * 0.86;
      const f = vac.field(bx, by, TMPF);
      const lean = clamp(f.strength * 34 * gain, 0, L * 1.0);
      const l = Math.hypot(f.fx, f.fy) || 1;
      let tx = (f.fx / l) * lean;
      let ty = (f.fy / l) * lean;
      const tr = f.strength * 3.0 * gain;
      tx += noise1(this.t * 26 + this.fw[i]) * tr;
      ty += noise1(this.t * 26 + this.fw[i] + 37) * tr;
      const o = 22;
      const ax = -2 * o * this.fvx[i] - o * o * (this.fx[i] - tx);
      const ay = -2 * o * this.fvy[i] - o * o * (this.fy[i] - ty);
      this.fvx[i] += ax * dt; this.fvy[i] += ay * dt;
      this.fx[i] += this.fvx[i] * dt; this.fy[i] += this.fvy[i] * dt;
    }
  }

  // ---------------------------------------------------------------- draw

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    const ang = Math.atan2(this.aimY, this.aimX);
    const cap = this.state === State.CAPTURED ? this.squash : 0;
    const stretch = 1 + this.stretch * 0.72 + cap * 1.8 - this.cock * 0.13;
    const thin = 1 / (1 + this.stretch * 0.35 + cap * 0.9 - this.cock * 0.16);
    const alpha = this.state === State.CAPTURED ? 1 - cap * 0.25 : 1;

    ctx.save();
    // contact shadow stays on the floor, unstretched — it anchors the fluff
    ctx.fillStyle = 'rgba(52,36,20,0.22)';
    ctx.beginPath();
    ctx.ellipse(this.x + 3, this.y + this.r * 0.52, this.r * 0.92, this.r * 0.34, 0, 0, TAU);
    ctx.fill();

    ctx.translate(this.x, this.y);
    ctx.rotate(ang);
    ctx.translate((stretch - 1) * this.r * 0.62, 0);
    ctx.scale(stretch, thin);
    ctx.rotate(-ang);
    ctx.globalAlpha = alpha;

    // fibers: soft halo pass, then light strands, then a few dark ones
    ctx.lineCap = 'round';
    this._fiberPath(ctx, 0);
    ctx.strokeStyle = 'rgba(203,196,185,0.42)';
    ctx.lineWidth = 7.0; ctx.stroke();
    ctx.strokeStyle = '#bdb5a8';
    ctx.lineWidth = 1.9; ctx.stroke();
    this._fiberPath(ctx, 1);
    ctx.strokeStyle = '#7e7466';
    ctx.lineWidth = 1.5; ctx.stroke();

    // body: taupe core with a darker rim so it reads on pale wood
    ctx.beginPath();
    for (let i = 0, first = true; i <= this.n; i++) {
      const j = i % this.n;
      const L = this.fl[j];
      if (L <= 0) continue;
      const a = this.fa[j] + this.spin;
      const w = 0.66 + 0.10 * Math.sin(this.t * 9 + this.fw[j]) * (0.4 + this.tremble);
      const px = Math.cos(a) * L * w + this.fx[j] * 0.35;
      const py = Math.sin(a) * L * w * 0.86 + this.fy[j] * 0.35;
      if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = this.core;
    ctx.fill();
    ctx.strokeStyle = this.rim; ctx.lineWidth = 2.6; ctx.stroke();

    ctx.fillStyle = 'rgba(255,252,245,0.34)';
    ctx.beginPath();
    ctx.ellipse(-this.r * 0.24, -this.r * 0.28, this.r * 0.36, this.r * 0.26, -0.4, 0, TAU);
    ctx.fill();
    ctx.restore();

    this._drawWisps(ctx);
  }

  _fiberPath(ctx, dark) {
    ctx.beginPath();
    for (let i = 0; i < this.n; i++) {
      const L = this.fl[i];
      if (L <= 0 || this.fd[i] !== dark) continue;
      const a = this.fa[i] + this.spin;
      const rx = Math.cos(a) * L * 0.34, ry = Math.sin(a) * L * 0.32;
      const tx = Math.cos(a) * L + this.fx[i], ty = Math.sin(a) * L * 0.86 + this.fy[i];
      // curl the strand sideways: dust is wispy, not a sea urchin
      const cu = this.fc[i] * L * 0.5;
      const mx = (rx + tx) * 0.5 - Math.sin(a) * cu - this.fy[i] * 0.16;
      const my = (ry + ty) * 0.5 + Math.cos(a) * cu + this.fx[i] * 0.16;
      ctx.moveTo(rx, ry);
      ctx.quadraticCurveTo(mx, my, tx, ty);
    }
  }

  _drawWisps(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < this.wisps.length; i++) {
      const w = this.wisps[i];
      if (w.life <= 0) continue;
      ctx.globalAlpha = clamp(w.life * 1.6, 0, 1);
      const dx = Math.cos(w.a) * w.len, dy = Math.sin(w.a) * w.len;
      ctx.beginPath();
      ctx.moveTo(w.x - dx, w.y - dy);
      ctx.quadraticCurveTo(w.x, w.y + w.len * 0.3, w.x + dx, w.y + dy);
      ctx.strokeStyle = 'rgba(226,220,210,0.85)';
      ctx.lineWidth = 3.2; ctx.stroke();
      ctx.strokeStyle = '#8d8375';
      ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  snapshot() {
    const s = super.snapshot();
    s.stretch = +this.stretch.toFixed(2);
    s.tremble = +this.tremble.toFixed(2);
    s.fibers = this.fibers;
    s.thr = +this.breakThreshold.toFixed(2);
    s.cock = +this.cock.toFixed(2);
    return s;
  }
}
