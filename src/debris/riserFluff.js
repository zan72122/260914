import { Debris, State } from './base.js';
import { clamp, smoothstep, TAU, noise1 } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };
const SQUASH = 0.56;   // a tuft is half as tall as it is wide: it hugs the crack

/**
 * The fluff that lives in the corner where a tread meets the riser above it.
 *
 * It is rooted in the crack, so the flow can never simply lift it: it can only
 * comb it. Every tuft samples the field at its OWN tip, so the tufts nearest the
 * mouth bend over first and the far ones are still standing — the corner ripples
 * as the head comes along it. As the flow grows the tufts strain against the
 * crack, shedding single fibres into the mouth, and each fibre lost makes the
 * clump easier to pull, so leaning into the corner always eventually wins it.
 *
 * And leaning into the corner is exactly what the child is doing anyway: the
 * corner is where the head is pressed to climb the step.
 */
export class RiserFluff extends Debris {
  constructor(x, y, rng, o) {
    const opts = o || {};
    super(x, y);
    this.rng = rng;
    this.stair = opts.stair;
    this.w = opts.w || 34;
    this.thr = opts.thr === undefined ? 0.86 : opts.thr;
    this.n = opts.n || 24;
    const n = this.n;
    this.fl = new Float32Array(n);      // length (0 = shed)
    this.fa = new Float32Array(n);      // base angle, fanning out onto the tread
    this.fx = new Float32Array(n);
    this.fy = new Float32Array(n);
    this.fvx = new Float32Array(n);
    this.fvy = new Float32Array(n);
    this.fw = new Float32Array(n);
    this.fc = new Float32Array(n);
    // A tuft is a dust bunny that has been squashed flat into the crack: the
    // fibres go all the way round, but the whole thing is half as tall as it is
    // wide. `SQUASH` is baked into the y of every point rather than applied as a
    // canvas scale, so line widths stay even.
    const R = this.w * 0.46;
    for (let i = 0; i < n; i++) {
      this.fa[i] = (i / n) * TAU + rng.range(-0.1, 0.1);
      this.fl[i] = R * rng.range(0.78, 1.24);
      this.fc[i] = rng.range(-0.45, 0.45);
      this.fw[i] = rng.range(0, 100);
    }
    this.fibers = n;
    this.anchored = true;        // rooted in the crack; never relocated
    this.strain = 0;
    this.seed = rng.range(0, 100);
    this.shedT = 0.4;
    this.stretch = 0;
    this.squash = 0;
    this.color = '#efe9dd';
    this.dark = '#7b7264';
    this.wisps = [];
    for (let i = 0; i < 5; i++) this.wisps.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, a: 0, len: 6 });
  }
  get type() { return 'riserfluff'; }

  /** Thinning lowers the bar: a held approach always ends in a pop. */
  get breakThreshold() { return this.thr * (0.62 + 0.38 * (this.fibers / this.n)); }

  translate(dx, dy) { super.translate(dx, dy); }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;
    const f = vac.field(this.x, this.y + 4, this._f);
    const s = f.strength;
    this.strength = s;
    this._wisps(dt, vac);

    if (this.state === State.CAPTURED) {
      this.squash += dt / 0.085;
      this.stretch = Math.min(1.8, this.stretch + dt * 12);
      if (this.squash >= 1) {
        this._handOff(vac, { kind: 'fluff', color: this.color, size: 10 + this.fibers * 0.18 });
        world && world.onCaptured && world.onCaptured(this);
      }
      this._fibers(dt, vac, 1.7);
      return;
    }

    if (this.state === State.PULLED) {
      this.vx += f.fx * 420 * dt;
      this.vy += f.fy * 420 * dt;
      const d = Math.exp(-2.4 * dt);
      this.vx *= d; this.vy *= d;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.stretch = clamp(this.stretch + (0.25 + Math.hypot(this.vx, this.vy) / 460 - this.stretch) * dt * 9, 0, 1.4);
      if (f.inCapture) { this.state = State.CAPTURED; this.squash = 0; }
      else if (s < 0.22 && Math.hypot(this.vx, this.vy) < 20) {
        // a full cup blew it back: it drops onto the tread and waits there
        this.state = State.REACTING;
        this.hx = this.x; this.hy = this.y;
        if (this.stair) this.stair.clampInside(this, 10);
      }
      this._fibers(dt, vac, 1.3);
      return;
    }

    // ---- rooted in the crack: strain, ripple, shed ------------------------
    const thr = this.breakThreshold;
    this.strain += (smoothstep(0.06, thr, s) - this.strain) * (1 - Math.exp(-10 * dt));
    this.stretch += (this.strain * (0.55 + 0.45 * Math.sin(this.t * 9 + this.seed)) - this.stretch) * (1 - Math.exp(-10 * dt));
    if (s > 0.34 && this.fibers > 3) {
      this.shedT -= dt * (s - 0.25) * 3.0;
      if (this.shedT <= 0) { this.shedT = 0.26 + this.rng.next() * 0.2; this._shed(vac); }
    }
    this.state = s > 0.08 ? State.REACTING : State.IDLE;
    if (s > thr) {
      this.state = State.PULLED;
      this.anchored = false;
      this.vx = f.fx * 150; this.vy = f.fy * 150;
    }
    if (f.inCapture) { this.state = State.CAPTURED; this.squash = 0; }
    this._fibers(dt, vac, 1.0);
  }

  _shed(vac) {
    let best = -1, bl = -1;
    for (let i = 0; i < this.n; i++) {
      if (this.fl[i] <= 0) continue;
      const v = this.fl[i] * (0.6 + this.rng.next());
      if (v > bl) { bl = v; best = i; }
    }
    if (best < 0) return;
    const a = this.fa[best], L = this.fl[best];
    for (let i = 0; i < this.wisps.length; i++) {
      const w = this.wisps[i];
      if (w.life > 0) continue;
      w.x = this.x + Math.cos(a) * L + this.fx[best];
      w.y = this.y + Math.sin(a) * L * SQUASH + this.fy[best];
      w.vx = 0; w.vy = 0; w.life = 1; w.a = a; w.len = L * 0.5;
      break;
    }
    this.fl[best] = 0; this.fx[best] = 0; this.fy[best] = 0;
    this.fvx[best] = 0; this.fvy[best] = 0;
    this.fibers--;
  }

  _wisps(dt, vac) {
    for (let i = 0; i < this.wisps.length; i++) {
      const w = this.wisps[i];
      if (w.life <= 0) continue;
      const f = vac.field(w.x, w.y, TMPF);
      w.vx += f.fx * 1500 * dt; w.vy += f.fy * 1500 * dt;
      w.vx *= 0.93; w.vy *= 0.93;
      w.x += w.vx * dt; w.y += w.vy * dt;
      w.a = Math.atan2(w.vy, w.vx);
      w.life -= dt * 0.6;
      if (f.inCapture) { w.life = 0; vac.transit({ kind: 'wisp', color: this.color, size: 5 }); }
    }
  }

  /** Each tuft leans by what IT feels: the corner ripples, it does not tilt. */
  _fibers(dt, vac, gain) {
    for (let i = 0; i < this.n; i++) {
      const L = this.fl[i];
      if (L <= 0) continue;
      const a = this.fa[i];
      const bx = this.x + Math.cos(a) * L;
      const by = this.y + Math.sin(a) * L * SQUASH;
      const f = vac.field(bx, by, TMPF);
      const lean = clamp(f.strength * 24 * gain, 0, L * 0.85);
      const l = Math.hypot(f.fx, f.fy) || 1;
      let tx = (f.fx / l) * lean, ty = (f.fy / l) * lean;
      const tr = f.strength * 2.6 * gain;
      tx += noise1(this.t * 24 + this.fw[i]) * tr;
      ty += noise1(this.t * 24 + this.fw[i] + 41) * tr;
      const o = 20;
      this.fvx[i] += (-2 * o * this.fvx[i] - o * o * (this.fx[i] - tx)) * dt;
      this.fvy[i] += (-2 * o * this.fvy[i] - o * o * (this.fy[i] - ty)) * dt;
      this.fx[i] += this.fvx[i] * dt;
      this.fy[i] += this.fvy[i] * dt;
    }
  }

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    const cap = this.state === State.CAPTURED ? this.squash : 0;
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.stretch > 0.01 || cap > 0) {
      const ang = Math.atan2(this._f.fy, this._f.fx) || -Math.PI / 2;
      ctx.rotate(ang);
      ctx.scale(1 + this.stretch * 0.30 + cap * 1.4, 1 / (1 + this.stretch * 0.18 + cap * 0.8));
      ctx.rotate(-ang);
    }
    ctx.globalAlpha = 1 - cap * 0.3;
    ctx.lineCap = 'round';
    // a soft halo, then the strands, then a few dark ones for grain
    this._path(ctx);
    ctx.strokeStyle = 'rgba(245,241,233,0.52)';
    ctx.lineWidth = 7.5; ctx.stroke();
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2.1; ctx.stroke();
    ctx.strokeStyle = 'rgba(112,102,86,0.5)';
    ctx.lineWidth = 1.0; ctx.stroke();
    // the body: a low lumpy mound, built from the fibres so its edge is soft
    ctx.beginPath();
    for (let i = 0, first = true; i <= this.n; i++) {
      const j = i % this.n;
      const L = this.fl[j];
      if (L <= 0) continue;
      const a = this.fa[j];
      const k = 0.64 + 0.07 * Math.sin(this.t * 8 + this.fw[j]) * (0.4 + this.strain);
      const px = Math.cos(a) * L * k + this.fx[j] * 0.22;
      const py = Math.sin(a) * L * k * SQUASH + this.fy[j] * 0.22;
      if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.strokeStyle = '#857b6c';
    ctx.lineWidth = 2.8; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,253,246,0.33)';
    ctx.beginPath();
    ctx.ellipse(-this.w * 0.12, -this.w * 0.09, this.w * 0.15, this.w * 0.07, -0.35, 0, TAU);
    ctx.fill();
    ctx.restore();
    this._drawWisps(ctx);
  }

  _path(ctx) {
    ctx.beginPath();
    for (let i = 0; i < this.n; i++) {
      const L = this.fl[i];
      if (L <= 0) continue;
      const a = this.fa[i];
      const rx = Math.cos(a) * L * 0.34, ry = Math.sin(a) * L * 0.34 * SQUASH;
      const tx = Math.cos(a) * L + this.fx[i];
      const ty = Math.sin(a) * L * SQUASH + this.fy[i];
      // a curl sideways, so the tuft is wispy dust and not a sea urchin
      const cu = this.fc[i] * L * 0.5;
      const mx = (rx + tx) * 0.5 - Math.sin(a) * cu - this.fy[i] * 0.16;
      const my = (ry + ty) * 0.5 + Math.cos(a) * cu * SQUASH + this.fx[i] * 0.16;
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
      ctx.lineWidth = 3.0; ctx.stroke();
      ctx.strokeStyle = this.dark;
      ctx.lineWidth = 1.1; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  snapshot() {
    const s = super.snapshot();
    s.strain = +this.strain.toFixed(3);
    s.fibers = this.fibers;
    s.thr = +this.breakThreshold.toFixed(2);
    return s;
  }
}
