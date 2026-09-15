import { Debris, State } from './base.js';
import { clamp, smoothstep, TAU, noise1 } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

const LETGO = 0.46;   // strength at the tip that tears the web off the wall

/**
 * Cobwebby fluff strung along the skirting board at the back of the cavity.
 *
 * It is the lightest thing in the game: it answers the airflow from far away.
 *  - three sagging strands anchored at the wall; every node samples the flow at
 *    its own position, so the free tip streams toward the mouth first and the
 *    whole veil follows, rippling. It never holds a pose: there is always a
 *    slow shimmer running through it.
 *  - as the flow builds, the veil straightens and stands up off the wall
 *    (visible as the sag disappearing).
 *  - past the threshold the anchor tears off with a snap, the web whips
 *    forward, and it runs into the mouth TIP FIRST through the tube (strand
 *    transit), landing in the cup as a tangle.
 */
export class Cobweb extends Debris {
  constructor(ax, ay, dirX, dirY, len, rng) {
    super(ax, ay);
    this.rng = rng;
    this.n = 6;
    this.len = len;
    const n = this.n;
    this.nx = new Float32Array(n); this.ny = new Float32Array(n);
    this.nvx = new Float32Array(n); this.nvy = new Float32Array(n);
    this.hx2 = new Float32Array(n); this.hy2 = new Float32Array(n);
    this.ph = new Float32Array(n);
    const dl = Math.hypot(dirX, dirY) || 1;
    const dx = dirX / dl, dy = dirY / dl;
    const px = -dy, py = dx;
    const sag = rng.range(0.18, 0.34);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const bow = Math.sin(u * Math.PI) * len * sag;
      this.nx[i] = ax + dx * u * len + px * bow;
      this.ny[i] = ay + dy * u * len * 0.8 + py * bow;
      this.hx2[i] = this.nx[i]; this.hy2[i] = this.ny[i];
      this.ph[i] = rng.range(0, 100);
    }
    this.spacing = len / (n - 1);
    this.anchored = true;
    this.snap = 0;             // 0..1 flash when the anchor tears
    this.reach = 0;
    this.seed = rng.range(0, 100);
    this.color = '#ece8e0';
    this.pts = [];
    for (let i = 0; i < n; i++) this.pts.push({ x: 0, y: 0 });
  }
  get type() { return 'cobweb'; }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;
    const n = this.n;
    const tip = vac.field(this.nx[n - 1], this.ny[n - 1], TMPF);
    this.strength = tip.strength;
    this.x = this.nx[n - 1]; this.y = this.ny[n - 1];
    this.snap = Math.max(0, this.snap - dt * 2.4);

    const start = this.anchored ? 1 : 0;
    for (let i = start; i < n; i++) {
      const f = vac.field(this.nx[i], this.ny[i], TMPF);
      const u = i / (n - 1);
      const light = 0.35 + 0.65 * u;                  // the tip is the freest
      // airflow pull: huge for something this light, but still field-driven
      const a = this.anchored ? 900 * light : 1500;
      this.nvx[i] += f.fx * a * dt;
      this.nvy[i] += f.fy * a * dt;
      if (this.anchored) {
        // it hangs from the wall: a soft home spring plus a permanent shimmer
        const sh = 1.4 + f.strength * 9;
        const tx = this.hx2[i] + noise1(this.t * 1.7 + this.ph[i]) * sh;
        const ty = this.hy2[i] + noise1(this.t * 1.9 + this.ph[i] + 31) * sh;
        const o = 7.5;
        this.nvx[i] += (-2 * o * this.nvx[i] - o * o * (this.nx[i] - tx)) * dt;
        this.nvy[i] += (-2 * o * this.nvy[i] - o * o * (this.ny[i] - ty)) * dt;
      }
      const damp = Math.exp(-(this.anchored ? 3.2 : 2.2) * dt);
      this.nvx[i] *= damp; this.nvy[i] *= damp;
      this.nx[i] += this.nvx[i] * dt; this.ny[i] += this.nvy[i] * dt;
    }
    this._constrain(this.anchored ? 2 : 3);

    this.reach += (smoothstep(0.03, LETGO, tip.strength) - this.reach) * (1 - Math.exp(-9 * dt));
    this.state = tip.strength > 0.03 ? State.REACTING : State.IDLE;

    if (this.anchored) {
      if (tip.strength > LETGO) {
        this.anchored = false;
        this.snap = 1;
        this.state = State.PULLED;
        for (let i = 0; i < n; i++) {
          const f = vac.field(this.nx[i], this.ny[i], TMPF);
          this.nvx[i] += f.fx * 210; this.nvy[i] += f.fy * 210;
        }
        if (vac.audio) vac.audio.pop('tick', 0.35);
      }
      return;
    }
    this.state = State.PULLED;
    if (tip.inCapture) {
      // tip first into the tube: points[0] is what enters the mouth first
      const pts = this.pts;
      for (let i = 0; i < n; i++) { pts[i].x = this.nx[n - 1 - i]; pts[i].y = this.ny[n - 1 - i]; }
      this.state = State.CAPTURED;
      this._handOff(vac, { kind: 'strand', points: pts, color: this.color, width: 2.2, size: 11 });
      world.onCaptured && world.onCaptured(this);
    }
  }

  _constrain(iters) {
    const n = this.n, L = this.spacing;
    for (let k = 0; k < iters; k++) {
      for (let i = 0; i < n - 1; i++) {
        let dx = this.nx[i + 1] - this.nx[i], dy = this.ny[i + 1] - this.ny[i];
        let d = Math.hypot(dx, dy);
        if (d < 1e-4) { dx = 1; dy = 0; d = 1; }
        if (d <= L) continue;                         // threads go slack, never stiff
        const corr = (d - L) / d;
        if (this.anchored && i === 0) {
          this.nx[1] -= dx * corr; this.ny[1] -= dy * corr;
        } else {
          const ox = dx * corr * 0.5, oy = dy * corr * 0.5;
          this.nx[i] += ox; this.ny[i] += oy;
          this.nx[i + 1] -= ox; this.ny[i + 1] -= oy;
        }
      }
    }
  }

  // ---------------------------------------------------------------- draw

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    const n = this.n;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const glow = 0.35 + 0.45 * this.reach + this.snap * 0.3;

    // three strands: the middle rope plus two sisters offset sideways
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const o = this._side(i, k);
        if (i === 0) ctx.moveTo(this.nx[i] + o.x, this.ny[i] + o.y);
        else ctx.lineTo(this.nx[i] + o.x, this.ny[i] + o.y);
      }
      ctx.strokeStyle = 'rgba(255,255,255,' + (glow * (k === 0 ? 0.95 : 0.6)).toFixed(3) + ')';
      ctx.lineWidth = k === 0 ? 2.4 : 1.5;
      ctx.stroke();
    }
    // cross links: what makes it read as a web and not as three hairs
    ctx.strokeStyle = 'rgba(255,255,255,' + (glow * 0.45).toFixed(3) + ')';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      const a = this._side(i, -1), b = this._side(i, 1);
      ctx.moveTo(this.nx[i] + a.x, this.ny[i] + a.y);
      ctx.lineTo(this.nx[i] + b.x, this.ny[i] + b.y);
    }
    ctx.stroke();

    // fluffy motes caught in the web, brightest at the streaming tip
    ctx.fillStyle = 'rgba(248,246,240,' + (0.35 + 0.5 * this.reach).toFixed(3) + ')';
    for (let i = 1; i < n; i++) {
      const r = 1.1 + (i / n) * 2.2 + this.reach * 1.2;
      ctx.beginPath(); ctx.arc(this.nx[i], this.ny[i], r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  _side(i, k) {
    const n = this.n;
    const j = Math.min(n - 1, i + 1), h = Math.max(0, i - 1);
    let dx = this.nx[j] - this.nx[h], dy = this.ny[j] - this.ny[h];
    const l = Math.hypot(dx, dy) || 1;
    const w = (5 + 9 * Math.sin((i / (n - 1)) * Math.PI)) * (1 - 0.45 * this.reach);
    TMP.x = (-dy / l) * w * k; TMP.y = (dx / l) * w * k;
    return TMP;
  }

  snapshot() {
    const s = super.snapshot();
    s.anchored = this.anchored;
    s.reach = +this.reach.toFixed(2);
    return s;
  }
}

const TMP = { x: 0, y: 0 };
