import { Debris, State } from './base.js';
import { clamp, smoothstep, TAU, noise1 } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

/**
 * Fluffy ball of fibers.
 *  - every fiber samples the field at its OWN tip, so the near edge leans first
 *  - as the total field grows the body wobbles, then stretches into a teardrop
 *    aimed at the mouth, trembling harder
 *  - past the friction threshold it lets go and accelerates in
 *  - inside the mouth it elongates hard and pops
 */
export class DustBunny extends Debris {
  constructor(x, y, r, rng) {
    super(x, y);
    this.r = r;
    this.rng = rng;
    this.n = Math.round(20 + r * 0.8);
    this.fa = new Float32Array(this.n);   // base angle
    this.fl = new Float32Array(this.n);   // fiber length
    this.fx = new Float32Array(this.n);   // tip offset
    this.fy = new Float32Array(this.n);
    this.fvx = new Float32Array(this.n);
    this.fvy = new Float32Array(this.n);
    this.fw = new Float32Array(this.n);   // wiggle seed
    for (let i = 0; i < this.n; i++) {
      this.fa[i] = (i / this.n) * TAU + rng.range(-0.08, 0.08);
      this.fl[i] = r * rng.range(0.75, 1.35);
      this.fw[i] = rng.range(0, 100);
    }
    this.seed = rng.range(0, 100);
    this.squash = 0;        // 0..1 capture squash
    this.stretch = 0;       // 0..1 body elongation toward the mouth
    this.aimX = 0; this.aimY = -1;
    this.tremble = 0;
    this.rollSpin = 0;
    this.spin = 0;
    this.color = '#c2b9ad';
    this.dark = '#94897b';
    this.entry = null;      // optional {fromX, fromY, t, dur} roll-in animation
    this.hideBehind = 0;    // 0..1 how much it is tucked behind a prop
  }
  get type() { return 'bunny'; }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;

    // scripted arrival (a bunny rolling in from off-screen)
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

    const f = vac.field(this.x, this.y, TMPF);
    const s = f.strength;
    this.strength = s;

    // aim direction (toward the mouth)
    if (s > 0.001) {
      const l = Math.hypot(f.fx, f.fy) || 1;
      const k = 1 - Math.exp(-10 * dt);
      this.aimX += (f.fx / l - this.aimX) * k;
      this.aimY += (f.fy / l - this.aimY) * k;
    }

    // ---- state machine -------------------------------------------------
    if (this.state === State.CAPTURED) {
      this.squash += dt / 0.09;
      this.stretch = Math.min(1.9, this.stretch + dt * 12);
      if (this.squash >= 1) {
        this._handOff(vac, { kind: 'fluff', color: this.color, size: this.r * 0.95 });
        world.onCaptured && world.onCaptured(this);
      }
      this._updateFibers(dt, vac, 1.6);
      return;
    }

    if (this.state === State.PULLED) {
      // accelerating into the flow; airflow drag, almost no floor friction
      const acc = 330;
      this.vx += f.fx * acc * dt;
      this.vy += f.fy * acc * dt;
      const damp = Math.exp(-2.2 * dt);
      this.vx *= damp; this.vy *= damp;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.spin += (this.vx * 0.004 + 0.4) * dt * 6;
      this.stretch = clamp(this.stretch + (smoothstep(0.7, 2.0, s) + 0.18 - this.stretch) * dt * 9, 0, 1.4);
      this.tremble = clamp(s * 0.9, 0, 1.4);
      if (f.inCapture) { this.state = State.CAPTURED; this.squash = 0; }
      // the flow moved on: settle back down where we are, don't drift forever
      else if (s < 0.3 && Math.hypot(this.vx, this.vy) < 26) {
        this.state = State.REACTING;
        this.hx = this.x; this.hy = this.y;
        this.vx *= 0.3; this.vy *= 0.3;
      }
      this._updateFibers(dt, vac, 1.25);
      return;
    }

    // idle / reacting: anchored, but strains toward the mouth
    const strain = smoothstep(0.10, 1.05, s);
    const maxPull = this.r * 0.95;
    const tx = this.hx + f.fx * 74, ty = this.hy + f.fy * 74;
    const dx = clamp(tx - this.hx, -maxPull, maxPull), dy = clamp(ty - this.hy, -maxPull, maxPull);
    const omega = 16;
    const gx = this.hx + dx, gy = this.hy + dy;
    const ax = -2 * omega * this.vx - omega * omega * (this.x - gx);
    const ay = -2 * omega * this.vy - omega * omega * (this.y - gy);
    this.vx += ax * dt; this.vy += ay * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;

    this.stretch += (smoothstep(0.22, 1.30, s) * 1.0 - this.stretch) * (1 - Math.exp(-9 * dt));
    this.tremble += (strain - this.tremble) * (1 - Math.exp(-11 * dt));
    this.spin += this.tremble * Math.sin(this.t * 22 + this.seed) * dt * 0.6;

    this.state = s > 0.1 ? State.REACTING : State.IDLE;
    if (s > 1.15) { this.state = State.PULLED; }
    if (f.inCapture) { this.state = State.CAPTURED; this.squash = 0; }

    this._updateFibers(dt, vac, 1.0);
  }

  _relaxFibers(dt) {
    for (let i = 0; i < this.n; i++) {
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
    const sx = 1 + this.stretch * 0.5;
    for (let i = 0; i < n; i++) {
      const a = this.fa[i] + this.spin;
      const L = this.fl[i];
      const bx = this.x + Math.cos(a) * L;
      const by = this.y + Math.sin(a) * L * 0.86;
      const f = vac.field(bx, by, TMPF);
      const lean = clamp(f.strength * 28 * gain, 0, L * 0.9);
      const l = Math.hypot(f.fx, f.fy) || 1;
      let tx = (f.fx / l) * lean;
      let ty = (f.fy / l) * lean;
      // trembling grows with the local flow
      const tr = f.strength * 2.4 * gain;
      tx += noise1(this.t * 26 + this.fw[i]) * tr;
      ty += noise1(this.t * 26 + this.fw[i] + 37) * tr;
      const o = 22;
      const ax = -2 * o * this.fvx[i] - o * o * (this.fx[i] - tx);
      const ay = -2 * o * this.fvy[i] - o * o * (this.fy[i] - ty);
      this.fvx[i] += ax * dt; this.fvy[i] += ay * dt;
      this.fx[i] += this.fvx[i] * dt; this.fy[i] += this.fvy[i] * dt;
    }
    this._sx = sx;
  }

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    const ang = Math.atan2(this.aimY, this.aimX);
    const stretch = 1 + this.stretch * 0.72 + (this.state === State.CAPTURED ? this.squash * 1.8 : 0);
    const thin = 1 / (1 + this.stretch * 0.35 + (this.state === State.CAPTURED ? this.squash * 0.9 : 0));
    const alpha = this.state === State.CAPTURED ? 1 - this.squash * 0.25 : 1;

    ctx.save();
    // soft contact shadow stays on the floor, unstretched
    ctx.fillStyle = 'rgba(40,28,16,0.14)';
    ctx.beginPath();
    ctx.ellipse(this.x + 2, this.y + this.r * 0.55, this.r * 0.85, this.r * 0.3, 0, 0, TAU);
    ctx.fill();

    ctx.translate(this.x, this.y);
    ctx.rotate(ang);
    // asymmetric: the NEAR edge reaches toward the nozzle, the far edge stays put
    ctx.translate((stretch - 1) * this.r * 0.62, 0);
    ctx.scale(stretch, thin);
    ctx.rotate(-ang);
    ctx.globalAlpha = alpha;

    // fibers: a soft halo pass then finer strands on top
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < this.n; i++) {
      const a = this.fa[i] + this.spin;
      const L = this.fl[i];
      const rx = Math.cos(a) * L * 0.40, ry = Math.sin(a) * L * 0.38;
      const tx = Math.cos(a) * L + this.fx[i], ty = Math.sin(a) * L * 0.86 + this.fy[i];
      const mx = (rx + tx) * 0.5 - this.fy[i] * 0.14, my = (ry + ty) * 0.5 + this.fx[i] * 0.14;
      ctx.moveTo(rx, ry);
      ctx.quadraticCurveTo(mx, my, tx, ty);
    }
    ctx.strokeStyle = 'rgba(206,198,186,0.62)';
    ctx.lineWidth = 3.4;
    ctx.stroke();
    ctx.strokeStyle = this.dark;
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // body blob
    ctx.fillStyle = this.color;
    ctx.beginPath();
    for (let i = 0; i <= this.n; i++) {
      const j = i % this.n;
      const a = this.fa[j] + this.spin;
      const w = 0.70 + 0.10 * Math.sin(this.t * 9 + this.fw[j]) * (0.4 + this.tremble);
      const px = Math.cos(a) * this.fl[j] * w + this.fx[j] * 0.35;
      const py = Math.sin(a) * this.fl[j] * w * 0.86 + this.fy[j] * 0.35;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // highlight
    ctx.fillStyle = 'rgba(255,252,245,0.35)';
    ctx.beginPath();
    ctx.ellipse(-this.r * 0.22, -this.r * 0.26, this.r * 0.33, this.r * 0.24, -0.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  snapshot() {
    const s = super.snapshot();
    s.stretch = +this.stretch.toFixed(2);
    s.tremble = +this.tremble.toFixed(2);
    return s;
  }
}
