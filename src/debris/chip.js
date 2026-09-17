import { Debris, State } from './base.js';
import { clamp, smoothstep, TAU, noise1 } from '../core/math.js';

const F = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

const SHOW = 0.90;     // film density that still hides it completely
const BARE = 0.22;     // below this it is sitting on bare tile
const BREAK = 0.50;    // airflow it takes to start a buried-in-flour bead rolling
const ACC = 1500;
const FRICTION = 3.0;

/**
 * A chocolate chip or a raisin, lost in the flour.
 *
 * It is invisible while the film covers it: all you get is a low dome in the
 * powder, the way a stone shows through snow. As the flour thins over it the
 * colour comes up out of the white — the one dark thing in a white room — and
 * then it behaves like a small heavy bead: it rocks in place as the air builds,
 * cocks away once, and rolls in with a tick.
 *
 * Its reaction is derived entirely from `vac.field()` at its own position,
 * scaled by how much flour is still on top of it: buried, the air cannot get a
 * grip on it at all, and that is a fact the child can see.
 */
export class Chip extends Debris {
  constructor(x, y, rng, kind) {
    super(x, y);
    this.rng = rng;
    this.kind2 = kind || 'chip';
    this.id = this.kind2 + '#' + this.id.split('#')[1];
    this.r = this.kind2 === 'raisin' ? 10.5 : 11.5;
    this.rot = rng.range(0, TAU);
    this.spin = 0;
    this.seed = rng.range(0, 60);
    this.spill = null;          // set by the scene
    this.cover = 1;
    this.emerge = 0;
    this.rock = 0;
    this.charge = 0;
    this.cock = 0;
    this.rolling = false;
    this.lx = 0; this.ly = 0;   // smoothed pull direction: the lean must point in
    this.hue = this.kind2 === 'raisin'
      ? rng.pick(['#4c2e22', '#5b3526'])
      : rng.pick(['#3d2415', '#4a2c18']);
  }

  get type() { return this.kind2; }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;

    this.cover = this.spill ? this.spill.densityAt(this.x, this.y) : 0;
    const e = 1 - smoothstep(BARE, SHOW, this.cover);
    this.emerge += (e - this.emerge) * (1 - Math.exp(-7 * dt));

    const f = vac.field(this.x, this.y, F);
    const s = f.strength * this.emerge;
    this.strength = s;
    const k = 1 - Math.exp(-9 * dt);
    this.lx += (f.fx - this.lx) * k;
    this.ly += (f.fy - this.ly) * k;

    if (this.rolling) {
      this.vx += f.fx * ACC * dt;
      this.vy += f.fy * ACC * dt;
      const d = Math.exp(-FRICTION * dt);
      this.vx *= d; this.vy *= d;
      this.x += this.vx * dt; this.y += this.vy * dt;
      const sp = Math.hypot(this.vx, this.vy);
      this.spin = sp / Math.max(4, this.r) * (this.vx >= 0 ? 1 : -1);
      this.rot += this.spin * dt;
      // a bead that has lost its grip but is not moving any more has been let
      // go of: it settles and has to be won again
      if (sp < 26 && s < BREAK * 0.75) { this.rolling = false; this.charge = 0; }
      this.state = State.PULLED;
      if (f.inCapture) {
        this._handOff(vac, { kind: 'crumb', color: this.hue, size: this.r * 0.9 });
        if (world && world.onCaptured) world.onCaptured(this);
      }
      return;
    }

    // ---- still held: rock in the socket, harder the nearer the mouth ------
    this.rock += (s - this.rock) * (1 - Math.exp(-8 * dt));
    if (s > BREAK * 0.55) {
      // the anticipation beat: it charges, cocks AWAY, then goes
      this.charge = clamp(this.charge + dt * (0.55 + s), 0, 1.35);
    } else {
      this.charge = Math.max(0, this.charge - dt * 1.6);
    }
    if (this.charge > 0.95 && s > BREAK) {
      this.cock += dt;
      if (this.cock > 0.09) {
        this.rolling = true;
        this.cock = 0;
        this.vx = f.fx * 120; this.vy = f.fy * 120;
      }
    } else if (this.cock > 0) {
      this.cock = Math.max(0, this.cock - dt * 2);
    }

    this.state = s > 0.08 ? State.REACTING : State.IDLE;
  }

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    const e = this.emerge;
    const r = this.r;

    // buried: a low dome in the flour, plus a hint of the colour underneath
    if (e < 0.995) {
      ctx.save();
      ctx.globalAlpha = 0.55 * (1 - e);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(this.x - 1.5, this.y - 2.5, r * 1.5, r * 1.15, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.28 * (1 - e);
      ctx.fillStyle = '#b8ab93';
      ctx.beginPath(); ctx.ellipse(this.x + 2, this.y + 3.5, r * 1.35, r * 0.95, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    if (e < 0.06) return;

    // the rock: it leans toward the mouth and shivers while it is held
    const lean = clamp(this.rock * 1.4, 0, 1);
    const ll = Math.hypot(this.lx, this.ly) || 1;
    const jx = (this.lx / ll) * lean * 4.5 + noise1(this.t * 21 + this.seed) * lean * 2.6;
    const jy = (this.ly / ll) * lean * 4.5 + noise1(this.t * 19 + this.seed + 9) * lean * 2.6;
    const back = this.cock > 0 ? -(this.cock / 0.09) * 6 : 0;
    const x = this.x + jx + (this.lx / ll) * back;
    const y = this.y + jy + (this.ly / ll) * back;

    ctx.save();
    ctx.globalAlpha = clamp(e * 1.3, 0, 1);
    ctx.fillStyle = 'rgba(20,14,8,0.35)';
    ctx.beginPath(); ctx.ellipse(x + 2.5, y + 4, r * 0.95, r * 0.45, 0, 0, TAU); ctx.fill();
    ctx.translate(x, y);
    ctx.rotate(this.rot);
    ctx.fillStyle = this.hue;
    if (this.kind2 === 'raisin') {
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.78, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-r * 0.6, -1); ctx.lineTo(r * 0.55, 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.5); ctx.lineTo(r * 0.2, -r * 0.4); ctx.stroke();
    } else {
      // a chocolate chip: a little cone seen from above
      ctx.beginPath();
      ctx.moveTo(-r, r * 0.72);
      ctx.quadraticCurveTo(-r * 0.9, -r * 0.5, 0, -r);
      ctx.quadraticCurveTo(r * 0.9, -r * 0.5, r, r * 0.72);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.1, r * 0.26, r * 0.42, -0.4, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.beginPath(); ctx.ellipse(-r * 0.32, -r * 0.34, r * 0.22, r * 0.16, -0.5, 0, TAU); ctx.fill();
    // a dusting of flour still clinging to it
    if (this.cover > 0.05) {
      ctx.globalAlpha = clamp(this.cover * 0.9, 0, 0.75) * e;
      ctx.fillStyle = '#f6efe0';
      ctx.beginPath(); ctx.ellipse(r * 0.25, r * 0.3, r * 0.4, r * 0.28, 0.4, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  snapshot() {
    const s = super.snapshot();
    s.cover = +this.cover.toFixed(3);
    s.emerge = +this.emerge.toFixed(3);
    s.charge = +this.charge.toFixed(3);
    s.rolling = this.rolling;
    return s;
  }
}
