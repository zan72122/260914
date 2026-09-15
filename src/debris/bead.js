import { Debris, State } from './base.js';
import { clamp, smoothstep, TAU, noise1 } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

const BREAK = 0.46;    // hard, heavy, round: it holds on longer than a crumb
const RESTICK = 0.10;
const ACC = 780;       // airflow acceleration once it is rolling
const DRAG = 3.4;      // a bead rolls, so it keeps its speed
const COCK = 0.13;     // wind-up: it rocks back before it lets go
const ORBIT = 0.16;    // how long it rattles round the mouth before the clack

/**
 * A plastic bead / lego stud — the hard little thing a vacuum makes NOISE with.
 *
 * Motion law (deliberately unlike fluff and unlike a crumb):
 *  - anchored, it RATTLES: it rocks in place, buzzes faster and hops higher as
 *    the flow grows, because it is round and hard and nothing holds it but its
 *    own weight. It is never a static tilted pose.
 *  - right before it breaks loose it rocks back AWAY from the mouth for ~130ms.
 *  - free, it does not fly straight in: it ROLLS, and the roll makes it CURVE,
 *    arcing sideways into the cone with its pattern visibly spinning.
 *  - at the mouth it is too fat to go straight down the hole: it runs around
 *    the rim in a fast circle, rattling, for ~160ms, and only then is swallowed
 *    with a loud clack.
 */
export class Bead extends Debris {
  constructor(x, y, rng, kind) {
    super(x, y);
    this.rng = rng;
    this.kind2 = kind || (rng.next() < 0.5 ? 'stud' : 'bead');
    this.r = this.kind2 === 'stud' ? rng.range(6.4, 7.6) : rng.range(5.6, 6.8);
    this.color = rng.pick(['#e5484d', '#3e7bdd', '#f2b705', '#39a85b', '#e0559b', '#f07d20']);
    this.dark = shade(this.color, 0.62);
    this.seed = rng.range(0, 100);
    this.rot = rng.range(0, TAU);
    this.spin = 0;
    this.rolling = false;
    this.rattle = 0;
    this.hop = 0;
    this.hopT = 0;
    this.rock = 0;
    this.rockPh = rng.range(0, TAU);
    this.cock = 0;
    this.cockT = -1;
    this.curl = rng.sign();
    this.orbT = -1;
    this.orbA = 0;
    this.clackT = 0;
    this.ride = null;          // the transit record, so the scene can bounce it
    this.arc = new Float32Array(10);
    this.arcN = 0;
    this._arcT = 0;
  }
  get type() { return 'bead'; }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;

    // ---- rattling round the rim of the mouth -----------------------------
    if (this.state === State.CAPTURED) {
      this.orbT += dt;
      const u = clamp(this.orbT / ORBIT, 0, 1);
      const m = vac.mouth();
      this.orbA += dt * this.curl * TAU * 6.4;
      const rr = 18 - 12 * u;
      const j = (1 - u * 0.55) * 2.6;
      this.x = m.x + Math.cos(this.orbA) * rr + noise1(this.t * 95 + this.seed) * j;
      this.y = m.y + Math.sin(this.orbA) * rr * 0.86 + noise1(this.t * 95 + this.seed + 17) * j;
      this.rot += this.curl * 26 * dt;
      this.hop = 0.35 + 0.4 * Math.abs(Math.sin(this.orbA * 2));
      this.clackT -= dt;
      if (this.clackT <= 0) {
        this.clackT = 0.048;
        if (world && world.audio) world.audio.pop('tick', 0.22);
      }
      if (this.orbT >= ORBIT) {
        if (world && world.audio) world.audio.pop('pop', 0.95);   // the clack
        // transit() hands the record back, so the scene can keep animating it
        this.ride = this._handOff(vac, { kind: 'crumb', color: this.color, size: this.r * 2.4 });
        if (world && world.onCaptured) world.onCaptured(this);
      }
      return;
    }

    const f = vac.field(this.x, this.y, TMPF);
    const s = f.strength;
    this.strength = s;

    if (!this.rolling) {
      // ---- anchored: rattle, rock, hop ----------------------------------
      const strain = smoothstep(0.04, BREAK, s);
      this.rattle += (strain - this.rattle) * (1 - Math.exp(-13 * dt));
      this.rockPh += dt * TAU * (1.6 + 7.5 * this.rattle);
      this.rock = this.rattle * (0.55 + 0.45 * Math.sin(this.rockPh));
      this.rot += this.rattle * noise1(this.t * 44 + this.seed) * 4.0 * dt;
      // little hops: it is bouncing on the mat, not sliding
      this.hopT -= dt;
      if (this.rattle > 0.22 && this.hopT <= 0) {
        this.hopT = 0.13 - 0.07 * this.rattle;
        this.hop = Math.min(1, 0.25 + this.rattle * 0.85);
      }
      this.state = s > 0.045 ? State.REACTING : State.IDLE;

      // wind-up away from the mouth, so the release always has an anticipation
      if (this.cockT < 0 && s > BREAK * 0.82) this.cockT = 0;
      if (this.cockT >= 0) {
        this.cockT += dt;
        this.cock = clamp(this.cockT / COCK, 0, 1);
        if (s < BREAK * 0.62) { this.cockT = -1; this.cock = 0; }
      }
      if (s > BREAK && this.cockT >= COCK) {
        this.rolling = true;
        this.state = State.PULLED;
        this.vx = f.fx * 52; this.vy = f.fy * 52;
        this.spin = this.curl * 9;
        this.cock = 0; this.cockT = -1;
        this.hop = 1;
        this.arcN = 0;
      }
    } else {
      // ---- rolling: airflow plus a sideways swirl, so the path CURVES ----
      this.vx += f.fx * ACC * dt;
      this.vy += f.fy * ACC * dt;
      const l = Math.hypot(f.fx, f.fy) || 1;
      const swirl = this.curl * s * 560 * smoothstep(16, 95, f.dist);
      this.vx += (-f.fy / l) * swirl * dt;
      this.vy += (f.fx / l) * swirl * dt;
      const d = Math.exp(-DRAG * dt);
      this.vx *= d; this.vy *= d;
      // close in, the flow wins over the roll and it spirals into the mouth
      const conv = smoothstep(0.75, 1.7, s);
      if (conv > 0) {
        const sp0 = Math.hypot(this.vx, this.vy);
        const k = 1 - Math.exp(-conv * 16 * dt);
        this.vx += ((f.fx / l) * sp0 - this.vx) * k;
        this.vy += ((f.fy / l) * sp0 - this.vy) * k;
      }
      this.x += this.vx * dt; this.y += this.vy * dt;
      const sp = Math.hypot(this.vx, this.vy);
      this.rot += (this.curl > 0 ? 1 : -1) * (sp / this.r) * 0.16 * dt + this.spin * dt * 0.1;
      this.state = State.PULLED;
      this.hop = Math.max(this.hop, clamp(sp / 900, 0, 0.5));
      // breadcrumb of where it rolled, so the curve is visible in one frame
      this._arcT -= dt;
      if (sp > 55 && this._arcT <= 0) {
        this._arcT = 0.045;
        for (let i = 6; i >= 0; i -= 2) { this.arc[i + 2] = this.arc[i]; this.arc[i + 3] = this.arc[i + 1]; }
        this.arc[0] = this.x; this.arc[1] = this.y;
        if (this.arcN < 5) this.arcN++;
      }
      if (s < RESTICK && sp < 15) {
        this.rolling = false; this.vx = 0; this.vy = 0;
        this.hx = this.x; this.hy = this.y; this.arcN = 0;
        this.state = State.REACTING;
      }
    }

    this.hop = Math.max(0, this.hop - dt / 0.16);

    if (f.inCapture) {
      const m = vac.mouth();
      this.state = State.CAPTURED;
      this.orbT = 0;
      this.orbA = Math.atan2(this.y - m.y, this.x - m.x);
      this.clackT = 0;
      this.arcN = 0;
    }
  }

  draw(ctx, cam) {
    if (this.state === State.DONE) return;

    if (this.arcN > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < this.arcN - 1; i++) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.26 * (1 - i / this.arcN)).toFixed(3) + ')';
        ctx.lineWidth = this.r * (1.0 - i * 0.14);
        ctx.beginPath();
        ctx.moveTo(this.arc[i * 2], this.arc[i * 2 + 1]);
        ctx.lineTo(this.arc[i * 2 + 2], this.arc[i * 2 + 3]);
        ctx.stroke();
      }
      ctx.restore();
    }

    // rattle jitter + the rock away from the mouth
    const buzz = this.rattle * this.rattle;
    const jx = noise1(this.t * 52 + this.seed) * buzz * 2.6 + this.rock * 1.2;
    const jy = noise1(this.t * 52 + this.seed + 31) * buzz * 2.6;
    const hop = this.hop * this.hop;
    const x = this.x + jx, y = this.y + jy - hop * 6;

    // shadow stays on the mat: the gap is what makes a hop read
    ctx.fillStyle = 'rgba(50,45,35,' + (0.26 * (1 - hop * 0.45)).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(this.x + jx * 0.4 + 1.5, this.y + jy * 0.4 + this.r * 0.55,
      this.r * (1.0 - hop * 0.2), this.r * (0.45 - hop * 0.1), 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.rot);
    const sq = 1 + hop * 0.12 - this.cock * 0.06;
    ctx.scale(sq, 2 - sq);

    ctx.fillStyle = this.dark;
    ctx.beginPath(); ctx.arc(0, 0, this.r * 1.06, 0, TAU); ctx.fill();
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(0, 0, this.r * 0.92, 0, TAU); ctx.fill();

    if (this.kind2 === 'stud') {
      // lego knob: a raised cylinder, off-centre so the roll is obvious
      ctx.fillStyle = shade(this.color, 1.16);
      ctx.beginPath(); ctx.ellipse(this.r * 0.16, -this.r * 0.16, this.r * 0.5, this.r * 0.46, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = this.dark; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.ellipse(this.r * 0.16, -this.r * 0.16, this.r * 0.5, this.r * 0.46, 0, 0, TAU); ctx.stroke();
    } else {
      // bead: a hole through the middle
      ctx.fillStyle = 'rgba(40,34,28,0.75)';
      ctx.beginPath(); ctx.ellipse(0, 0, this.r * 0.26, this.r * 0.24, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = shade(this.color, 1.2); ctx.lineWidth = this.r * 0.22;
      ctx.beginPath(); ctx.arc(0, 0, this.r * 0.62, -2.5, -0.8); ctx.stroke();
    }
    // specular dot: hard shiny plastic, and it rotates with the bead
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.ellipse(-this.r * 0.38, -this.r * 0.4, this.r * 0.22, this.r * 0.17, -0.6, 0, TAU); ctx.fill();
    ctx.restore();
  }

  snapshot() {
    const s = super.snapshot();
    s.rattle = +this.rattle.toFixed(2);
    s.hop = +this.hop.toFixed(2);
    s.cock = +this.cock.toFixed(2);
    s.rolling = this.rolling;
    s.orb = +this.orbT.toFixed(3);
    return s;
  }
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * k));
  const b = Math.min(255, Math.round((n & 255) * k));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
