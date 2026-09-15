import { Debris, State } from './base.js';
import { clamp, smoothstep, TAU, noise1 } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

const BREAK = 0.70;       // heavy cloth: needs a close, held approach
const ACC = 190;          // it is dragged, not flung
const CLOG_DUR = 1.15;    // how long it plugs the mouth before the gulp

/**
 * A lost sock under the sofa. Heavy, floppy cloth — the opposite of fluff.
 *
 *  - it is a 7-node rope: every node samples the airflow at its OWN position,
 *    so the near end (the toe) peels off the floor and flaps while the cuff is
 *    still lying flat. The flap frequency and height grow with the flow.
 *  - long before it moves, the whole sock CREEPS: the home position slides a
 *    little toward the mouth each frame, so a held approach visibly drags it.
 *  - past the break threshold it slithers in, toe first, dragging its cuff.
 *  - at the mouth it does NOT pop: it is sucked FLAT ACROSS the intake and
 *    CLOGS it. The cloth quivers, the motor pitch drops (the scene reads
 *    `clogAmount`), the mouth strains — then it folds and goes in with one big
 *    gulp.
 */
export class Sock extends Debris {
  constructor(x, y, angle, rng, opts = {}) {
    super(x, y);
    this.rng = rng;
    this.n = 7;
    this.len = opts.len || 78;
    this.angle = angle;
    const n = this.n;
    this.nx = new Float32Array(n); this.ny = new Float32Array(n);
    this.nvx = new Float32Array(n); this.nvy = new Float32Array(n);
    this.rhx = new Float32Array(n); this.rhy = new Float32Array(n);
    this.lift = new Float32Array(n);
    this.seed = rng.range(0, 100);
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const bow = rng.range(-0.22, 0.22);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1) - 0.5;
      const off = Math.sin((i / (n - 1)) * Math.PI) * this.len * bow;
      const px = x + ca * u * this.len - sa * off;
      const py = y + sa * u * this.len * 0.9 + ca * off;
      this.nx[i] = px; this.ny[i] = py;
      this.rhx[i] = px; this.rhy[i] = py;
    }
    this.spacing = this.len / (n - 1);
    this.free = false;
    this.clogAmount = 0;      // 0..1 while it is plugging the mouth
    this.clogT = -1;
    this.creep = 0;           // how far it has been dragged (for the dev sheet)
    this.strain = 0;
    this.color = opts.color || '#dfe6ee';
    this.shade = opts.shade || '#a9b6c6';
    this.band = opts.band || '#e2617f';
    this.gulped = false;
  }
  get type() { return 'sock'; }
  translate(dx, dy) {
    super.translate(dx, dy);
    for (let i = 0; i < this.n; i++) {
      this.nx[i] += dx; this.ny[i] += dy;
      this.rhx[i] += dx; this.rhy[i] += dy;
    }
  }
  /** The toe: that is the end that peels up and goes in first. */
  aim(out) { out = out || { x: 0, y: 0 }; out.x = this.nx[0]; out.y = this.ny[0]; return out; }

  _sample(vac, i) { return vac.field(this.nx[i], this.ny[i], TMPF); }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;
    const n = this.n;

    // --- centre / overall flow -------------------------------------------
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += this.nx[i]; cy += this.ny[i]; }
    cx /= n; cy /= n;
    this.x = cx; this.y = cy;
    const fc = vac.field(cx, cy, this._f);
    // the toe counts double: this thing is pulled in end-first
    const ft = vac.field(this.nx[0], this.ny[0], TMPF);
    const s = fc.strength * 0.55 + ft.strength * 0.45;
    this.strength = s;

    if (this.clogT >= 0) { this._updateClog(dt, vac, world); return; }

    if (!this.free) {
      // ---- anchored: the toe peels up and flaps, the cuff stays put ------
      const strain = smoothstep(0.10, BREAK, s);
      this.strain = strain;
      const drag = smoothstep(0.26, 0.80, s);
      for (let i = 0; i < n; i++) {
        const f = this._sample(vac, i);
        const near = 1 - i / (n - 1);                 // 1 at the toe, 0 at the cuff
        const peel = near * near * (0.35 + 0.65 * near);
        const flap = Math.sin(this.t * (7 + 13 * strain) + this.seed + i * 0.7);
        const l = Math.hypot(f.fx, f.fy) || 1;
        const reach = clamp(f.strength * 30, 0, 30) * peel;
        const wob = flap * reach * 0.42 + noise1(this.t * 9 + this.seed + i) * reach * 0.3;
        const tx = this.rhx[i] + (f.fx / l) * reach + (-f.fy / l) * wob;
        const ty = this.rhy[i] + (f.fy / l) * reach + (f.fx / l) * wob;
        this.lift[i] += (reach / 30 - this.lift[i]) * (1 - Math.exp(-12 * dt));
        const o = 13 + 6 * near;
        const ax = -2 * o * this.nvx[i] - o * o * (this.nx[i] - tx);
        const ay = -2 * o * this.nvy[i] - o * o * (this.ny[i] - ty);
        this.nvx[i] += ax * dt; this.nvy[i] += ay * dt;
        this.nx[i] += this.nvx[i] * dt; this.ny[i] += this.nvy[i] * dt;
        // creeping: the whole rest pose slides toward the mouth, slowly
        const k = drag * (0.35 + 0.65 * near) * 26 * dt;
        this.rhx[i] += f.fx * k; this.rhy[i] += f.fy * k;
      }
      this.creep += drag * dt;
      this.state = s > 0.08 ? State.REACTING : State.IDLE;
      if (s > BREAK) {
        this.free = true;
        this.state = State.PULLED;
        for (let i = 0; i < n; i++) {
          const near = 1 - i / (n - 1);
          this.nvx[i] += fc.fx * 45 * near; this.nvy[i] += fc.fy * 45 * near;
        }
      }
      this._constrain(2);
      if (ft.inCapture) this._beginClog();
      return;
    }

    // ---- free: slithers in, toe first -----------------------------------
    this.strain = 1;
    for (let i = 0; i < n; i++) {
      const f = this._sample(vac, i);
      const near = 1 - i / (n - 1);
      const a = ACC * (0.75 + 0.6 * near);
      this.nvx[i] += f.fx * a * dt;
      this.nvy[i] += f.fy * a * dt;
      const damp = Math.exp(-3.4 * dt);
      this.nvx[i] *= damp; this.nvy[i] *= damp;
      this.nx[i] += this.nvx[i] * dt; this.ny[i] += this.nvy[i] * dt;
      this.lift[i] += (clamp(f.strength, 0, 1) - this.lift[i]) * (1 - Math.exp(-10 * dt));
    }
    this._constrain(3);
    if (this._sample(vac, 0).inCapture) this._beginClog();
    else if (s < 0.22) {
      // lost it: it settles where it stopped and can be found again
      let moving = 0;
      for (let i = 0; i < n; i++) moving += Math.hypot(this.nvx[i], this.nvy[i]);
      if (moving / n < 22) {
        this.free = false;
        this.state = State.REACTING;
        for (let i = 0; i < n; i++) { this.rhx[i] = this.nx[i]; this.rhy[i] = this.ny[i]; }
      }
    }
  }

  _beginClog() {
    this.clogT = 0;
    this.clogAmount = 0;
    this.state = State.CAPTURED;
  }

  /** Sucked flat across the intake: it plugs it, quivers, then folds in. */
  _updateClog(dt, vac, world) {
    this.clogT += dt;
    const u = clamp(this.clogT / CLOG_DUR, 0, 1);
    this.clogAmount = u < 0.82 ? smoothstep(0, 0.18, u) : 1 - smoothstep(0.82, 1, u);
    // the vacuum itself understands a blocked intake: pitch drops, the flow
    // weakens, the head judders. Nothing has to poke at the audio graph.
    if (this.clogAmount > vac.clog) vac.clog = this.clogAmount;
    const m = vac.mouth();
    const px = -m.dirY, py = m.dirX;
    const n = this.n;
    const fold = smoothstep(0.55, 1, u);            // it folds up and slips in
    const spread = this.spacing * (0.95 - 0.72 * fold);
    const quiver = (1 - fold) * (2.6 + 2.2 * Math.sin(this.t * 46 + this.seed));
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * spread;
      const sink = (4 + 16 * fold) * (1 - Math.abs(off) / (this.len * 0.6));
      const q = quiver * Math.sin(this.t * 33 + i * 1.9 + this.seed);
      const tx = m.x + m.dirX * sink + px * (off + q);
      const ty = m.y + m.dirY * sink + py * (off + q);
      const o = 26;
      const ax = -2 * o * this.nvx[i] - o * o * (this.nx[i] - tx);
      const ay = -2 * o * this.nvy[i] - o * o * (this.ny[i] - ty);
      this.nvx[i] += ax * dt; this.nvy[i] += ay * dt;
      this.nx[i] += this.nvx[i] * dt; this.ny[i] += this.nvy[i] * dt;
    }
    this.x = this.nx[3]; this.y = this.ny[3];
    if (u >= 1 && !this.gulped) {
      this.gulped = true;
      this._handOff(vac, { kind: 'fluff', color: this.color, size: 26 });
      if (vac.audio) vac.audio.pop('whoosh', 0.8);
      world.onCaptured && world.onCaptured(this);
    }
  }

  /** Keep the cloth from stretching: two-sided distance relaxation. */
  _constrain(iters) {
    const n = this.n, L = this.spacing;
    for (let k = 0; k < iters; k++) {
      for (let i = 0; i < n - 1; i++) {
        let dx = this.nx[i + 1] - this.nx[i], dy = this.ny[i + 1] - this.ny[i];
        let d = Math.hypot(dx, dy);
        if (d < 1e-4) { dx = 1; dy = 0; d = 1; }
        const corr = (d - L) / d * 0.5;
        const ox = dx * corr, oy = dy * corr;
        this.nx[i] += ox; this.ny[i] += oy;
        this.nx[i + 1] -= ox; this.ny[i + 1] -= oy;
      }
    }
  }

  // ---------------------------------------------------------------- draw

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    const n = this.n;
    const clog = this.clogAmount;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // contact shadow: only the parts still on the floor
    ctx.fillStyle = 'rgba(20,14,8,0.28)';
    for (let i = 0; i < n; i++) {
      const lift = this.lift[i];
      if (lift > 0.85) continue;
      ctx.globalAlpha = 0.3 * (1 - lift) * (1 - clog);
      ctx.beginPath();
      ctx.ellipse(this.nx[i] + 4, this.ny[i] + 9, 11, 4.5, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // the cloth body: a wide tapered stroke through the rope
    this._path(ctx);
    ctx.strokeStyle = this.shade;
    ctx.lineWidth = 21 - 5 * clog;
    ctx.stroke();
    this._path(ctx);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 16.5 - 4 * clog;
    ctx.stroke();

    // toe cap and cuff, so it reads as a sock and not a worm
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(this.nx[0], this.ny[0], 9.2 - 2 * clog, 0, TAU); ctx.fill();
    ctx.strokeStyle = this.shade; ctx.lineWidth = 2; ctx.stroke();

    const c = n - 1, c1 = n - 2;
    ctx.strokeStyle = this.band;
    ctx.lineWidth = 15 - 4 * clog;
    ctx.beginPath();
    ctx.moveTo(this.nx[c1], this.ny[c1]);
    ctx.lineTo(this.nx[c], this.ny[c]);
    ctx.stroke();
    // ribbed cuff + the dark opening, so it is a sock and not a sausage
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2.2;
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      const ax = this.nx[c1] + (this.nx[c] - this.nx[c1]) * t;
      const ay = this.ny[c1] + (this.ny[c] - this.ny[c1]) * t;
      let dx = this.nx[c] - this.nx[c1], dy = this.ny[c] - this.ny[c1];
      const l = Math.hypot(dx, dy) || 1;
      const w = 7 - 2 * clog;
      ctx.beginPath();
      ctx.moveTo(ax + (-dy / l) * w, ay + (dx / l) * w);
      ctx.lineTo(ax - (-dy / l) * w, ay - (dx / l) * w);
      ctx.stroke();
    }
    {
      let dx = this.nx[c] - this.nx[c1], dy = this.ny[c] - this.ny[c1];
      const a = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(this.nx[c], this.ny[c]);
      ctx.rotate(a);
      ctx.fillStyle = '#5b6470';
      ctx.beginPath(); ctx.ellipse(0, 0, 3.5, 8 - 2 * clog, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // highlight along the top of the cloth
    ctx.globalAlpha = 0.5;
    this._path(ctx);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _path(ctx) {
    const n = this.n;
    ctx.beginPath();
    ctx.moveTo(this.nx[0], this.ny[0]);
    for (let i = 1; i < n - 1; i++) {
      const mx = (this.nx[i] + this.nx[i + 1]) * 0.5;
      const my = (this.ny[i] + this.ny[i + 1]) * 0.5;
      ctx.quadraticCurveTo(this.nx[i], this.ny[i], mx, my);
    }
    ctx.lineTo(this.nx[n - 1], this.ny[n - 1]);
  }

  snapshot() {
    const s = super.snapshot();
    s.free = this.free;
    s.strain = +this.strain.toFixed(2);
    s.creep = +this.creep.toFixed(2);
    s.clog = +this.clogAmount.toFixed(2);
    s.lift = +this.lift[0].toFixed(2);
    return s;
  }
}
