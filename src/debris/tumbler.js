import { Debris, State } from './base.js';
import { clamp, lerp, smoothstep, TAU, noise1 } from '../core/math.js';

const G = 1350;            // gravity down the screen, design px/s^2
const CREEP = 120;         // a tread is never quite level: things drift to the lip
const FRIC = 3.6;

/**
 * Things perched on the NOSING of a step.
 *
 * The whole phenomenon of this room is that the airflow does not have to win on
 * its own: it only has to tip the thing over the lip, and then GRAVITY brings it
 * down the stairs into the mouth. So the pre-suction moment here is a TEETER,
 * and the reward is a tumble.
 *
 *   perch   it sits on the lip. Every frame it samples the field at its own
 *           body; `lean` grows continuously with that, it creeps out over the
 *           edge, and it ROCKS — and the rock gets SLOWER and DEEPER as the
 *           mouth closes in, so the last moment before it goes is the longest
 *           one. It never holds a pose: the rock and the tremble are alive.
 *   tip     it always lets go at the far end of a forward rock, so the tip is
 *           the natural end of the movement you have been watching.
 *   tumble  it falls off the lip, BOUNCES on the tread below with a puff, and
 *           rolls on down toward the mouth, curving into the flow as it comes.
 *   in      the mouth takes it mid-air, which is the whole show.
 *
 * `heavy` is the cereal ring: far too heavy for the idle flow, it leans out over
 * the edge and rocks there for as long as you like. It only goes over on a HOLD,
 * and it lands with a thunk instead of a skitter.
 */
export class Tumbler extends Debris {
  constructor(x, y, rng, o) {
    super(x, y);
    const opts = o || {};
    this.rng = rng;
    this.stair = opts.stair;
    this.heavy = !!opts.heavy;
    this.id = this.type + this.id.slice(this.id.indexOf('#'));   // `type` is known only now
    this.tipThr = opts.tipThr === undefined ? (this.heavy ? 1.20 : 0.62) : opts.tipThr;
    this.r = opts.r || (this.heavy ? 21 : rng.range(8.0, 11.5));
    this.phase = 'perch';
    // perched on a lip, it is held there until the flow tips it: `anchored`
    // keeps Scene.clearStartZone from sliding it off its nosing
    this.anchored = true;
    this.lean = 0;
    this.rockT = rng.range(0, TAU);
    this.rock = 0;
    this.spin = 0;
    this.rot = rng.range(0, TAU);
    this.seed = rng.range(0, 100);
    this.bounces = 0;
    this.teeters = 0;
    this.thunk = 0;
    this.color = this.heavy
      ? (opts.color || '#e8ab4e')
      : rng.pick(['#dfa960', '#c98c45', '#eec07f', '#d6a05b']);
    this.dark = this.heavy ? '#b87c2b' : 'rgba(70,48,22,0.5)';
    // pre-baked outline, no per-frame allocation
    const nv = this.heavy ? 0 : 7;
    if (nv) {
      this.poly = new Float32Array(nv * 2);
      for (let i = 0; i < nv; i++) {
        const a = (i / nv) * TAU;
        const rr = rng.range(0.68, 1.3);
        this.poly[i * 2] = Math.cos(a) * rr;
        this.poly[i * 2 + 1] = Math.sin(a) * rr * 0.92;
      }
    }
  }
  get type() { return this.heavy ? 'ring' : 'edgecrumb'; }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;
    this.thunk = Math.max(0, this.thunk - dt * 3.5);
    const st = this.stair;

    if (this.phase === 'perch') {
      // sample at the part of the body hanging over the lip: the near edge
      // feels the flow first, exactly as a dust bunny's near fibres do
      const f = vac.field(this.x, this.y + this.r * 0.55, this._f);
      const s = f.strength;
      this.strength = s;
      // The LOOK saturates well before the tip does — most of all for the ring,
      // which is supposed to hang right out over the lip and rock there for as
      // long as you like, so that the hold is a thing you watch it lose.
      const target = smoothstep(0.05, this.tipThr * (this.heavy ? 0.52 : 0.88), s);
      this.lean += (target - this.lean) * (1 - Math.exp(-9 * dt));
      // the rock SLOWS as it leans further out: the closer it is to going, the
      // longer each teeter lasts, which is the anticipation
      const hz = this.heavy ? lerp(2.5, 0.85, this.lean) : lerp(3.6, 1.6, this.lean);
      const was = Math.sin(this.rockT);
      this.rockT += dt * TAU * hz;
      if (was < 0 && Math.sin(this.rockT) >= 0) this.teeters++;
      this.rock = Math.sin(this.rockT) * (this.heavy ? 0.66 : 0.40) * this.lean;
      this.state = s > 0.05 ? State.REACTING : State.IDLE;
      // it goes at the far end of a forward rock — or at once if the flow is
      // overwhelming, so a head shoved straight at it is never ignored
      const fwd = Math.sin(this.rockT) > 0.72;
      if (s > this.tipThr && (fwd || s > this.tipThr * 1.5)) this._tip(vac, f, world);
      if (f.inCapture) this._eat(vac, world);
      return;
    }

    // ---- falling / rolling ------------------------------------------------
    const f = vac.field(this.x, this.y, this._f);
    this.strength = f.strength;
    const gnd = st.groundY(this.x, this.y);
    const on = this.y >= gnd - 0.6;
    const pull = this.heavy ? 560 : 950;
    this.vx += (f.fx * pull + st.downX * (on ? 70 : 130)) * dt;
    this.vy += (f.fy * pull + (on ? CREEP : G)) * dt;
    if (on) {
      const d = Math.exp(-FRIC * dt);
      this.vx *= d; this.vy *= d;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.spin += (this.vx * 0.02 + (on ? 0 : this.vy * 0.012) - this.spin) * (1 - Math.exp(-5 * dt));
    this.rot += this.spin * dt;

    const g2 = st.groundY(this.x, this.y);
    if (this.y > g2) {
      const impact = this.vy;
      this.y = g2;
      if (impact > (this.heavy ? 150 : 70)) {
        this.vy = -impact * (this.heavy ? 0.22 : 0.46);
        this.vx *= 0.82;
        this.spin *= 0.8;
        this.bounces++;
        this.thunk = 1;
        if (st) st.puff(this.x, this.y + 2, this.heavy ? 6 : 3, this.heavy ? 'thunk' : 'tap');
      } else {
        this.vy = 0;
      }
    }
    st.clampInside(this, this.r + 4);
    // below the bottom step nothing drifts any further: a piece that rolled all
    // the way down waits on the hall floor, in reach, next to the bin
    if (st.stepAt(this.y) < 0 && this.y >= st.groundY(this.x, this.y) - 0.6) {
      this.vy *= Math.exp(-7 * dt);
    }
    this.state = State.PULLED;
    if (f.inCapture) this._eat(vac, world);
  }

  _tip(vac, f, world) {
    this.phase = 'fall';
    this.anchored = false;
    this.state = State.PULLED;
    const st = this.stair;
    this.vy = this.heavy ? 70 : 34;
    this.vx = f.fx * 26 + st.downX * this.rng.range(34, 82);
    this.spin = (this.rng.next() - 0.5) * (this.heavy ? 5 : 13);
    this.rock = 0;
    if (st) st.puff(this.x, this.y, this.heavy ? 5 : 2, 'tip');
  }

  _eat(vac, world) {
    this._handOff(vac, {
      kind: this.heavy ? 'crumb' : 'crumb',
      color: this.color,
      size: this.heavy ? 20 : this.r * 1.35,
    });
    world && world.onCaptured && world.onCaptured(this);
  }

  // ------------------------------------------------------------------ draw

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    const st = this.stair;
    const gnd = st ? st.groundY(this.x, this.y) : this.y;
    const air = clamp((gnd - this.y) / 70, 0, 1);

    // the shadow stays on the tread and SEPARATES as it falls: that is what
    // makes a 46px drop read as a drop
    ctx.globalAlpha = 0.30 * (1 - air * 0.55);
    ctx.fillStyle = '#3a2610';
    ctx.beginPath();
    ctx.ellipse(this.x + 2 + air * 3, gnd + 3, this.r * (1.05 - air * 0.3), this.r * (0.42 - air * 0.14), 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    const perch = this.phase === 'perch';
    const jit = perch ? this.lean * (this.heavy ? 1.1 : 2.4) : 0;
    const jx = noise1(this.t * 31 + this.seed) * jit;
    const jy = noise1(this.t * 31 + this.seed + 19) * jit;
    // on the lip it creeps OUT over the edge as it leans
    const over = perch ? this.lean * this.r * (this.heavy ? 0.62 : 0.9) : 0;
    const th = this.thunk * this.thunk;

    ctx.save();
    ctx.translate(this.x + jx, this.y + jy + over);
    ctx.rotate(perch ? this.rock : this.rot);
    ctx.scale(1 + th * 0.28, 1 - th * 0.22);
    if (this.heavy) this._drawRing(ctx);
    else this._drawCrumb(ctx);
    ctx.restore();
  }

  _drawCrumb(ctx) {
    const p = this.poly, n = p.length / 2, r = this.r;
    ctx.beginPath();
    ctx.moveTo(p[0] * r, p[1] * r);
    for (let i = 1; i < n; i++) ctx.lineTo(p[i * 2] * r, p[i * 2 + 1] * r);
    ctx.closePath();
    ctx.fillStyle = this.dark;
    ctx.save(); ctx.translate(1.3, 1.6); ctx.fill(); ctx.restore();
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,244,220,0.42)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.24, -r * 0.3, r * 0.34, r * 0.24, -0.4, 0, TAU);
    ctx.fill();
  }

  _drawRing(ctx) {
    const r = this.r;
    ctx.fillStyle = this.dark;
    ctx.beginPath(); ctx.arc(1.6, 2.2, r, 0, TAU); ctx.fill();
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,238,200,0.5)';
    ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.42, r * 0.44, r * 0.26, -0.5, 0, TAU); ctx.fill();
    // the hole: punched with the tread colour would be wrong when it is in the
    // air, so it is drawn as a dark well with a lit far wall
    ctx.fillStyle = '#7d4f16';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.40, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,224,168,0.55)';
    ctx.beginPath(); ctx.arc(0, -r * 0.06, r * 0.40, Math.PI * 1.1, Math.PI * 1.9); ctx.fill();
    ctx.strokeStyle = 'rgba(140,86,20,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, TAU); ctx.stroke();
  }

  snapshot() {
    const s = super.snapshot();
    s.phase = this.phase;
    s.lean = +this.lean.toFixed(3);
    s.rock = +this.rock.toFixed(3);
    s.teeters = this.teeters;
    s.bounces = this.bounces;
    s.heavy = this.heavy;
    return s;
  }
}
