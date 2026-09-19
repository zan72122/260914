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
    // Legibility: on a phone a step tread is ~60 design px deep, and a 20px
    // crumb on it is a speck. These are real objects off a real kitchen floor —
    // a cereal O, the corner of a cracker, a bottle cap — 38-52 design px
    // across, each with its own silhouette and its own colour, none of them in
    // the wood's family.
    this.shape = opts.shape || (this.heavy ? 'ring' : rng.pick(['cereal', 'cracker', 'cap', 'flake']));
    this.r = opts.r || (this.heavy ? 30 : (
      this.shape === 'cap' ? rng.range(17.5, 20.5)
        : this.shape === 'cracker' ? rng.range(19.5, 23.5)
          : rng.range(18.5, 22.5)));
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
    // Each shape carries its own colour, and every one of them is off the
    // wood's axis: the tread is mid-brown, so the crumbs are cream, scarlet,
    // petrol blue or a saturated cereal orange, all of them outlined.
    const PAL = {
      cereal: ['#f0a02c', '#e88f1c'],
      cracker: ['#f6e7c0', '#efd9a6'],
      cap: ['#d9412f', '#3170b4', '#2f9e6e'],
      flake: ['#f2dfae', '#e6c477'],
    };
    this.color = this.heavy ? (opts.color || '#f0b23c') : rng.pick(PAL[this.shape]);
    this.line = this.heavy ? '#8a5410'
      : this.shape === 'cap' ? 'rgba(28,18,10,0.85)' : 'rgba(84,52,18,0.8)';
    this.dark = this.heavy ? '#b87c2b' : 'rgba(70,48,22,0.5)';
    // a short arc of where it has just been, so a 100 ms gap still reads as
    // "it fell": three ghosts, tapering
    this.trail = new Float32Array(8);   // x,y * 4
    this.trailN = 0;
    this.trailT = 0;
    // pre-baked outline, no per-frame allocation
    const nv = this.heavy || this.shape !== 'flake' ? 0 : 7;
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

    // lay down the arc it is travelling on, so the fall is legible even in a
    // contact sheet sampled every 100 ms
    this.trailT -= dt;
    if (this.trailT <= 0 && Math.hypot(this.vx, this.vy) > 90) {
      this.trailT = 0.035;
      for (let i = 6; i >= 0; i -= 2) { this.trail[i + 2] = this.trail[i]; this.trail[i + 3] = this.trail[i + 1]; }
      this.trail[0] = this.x; this.trail[1] = this.y;
      if (this.trailN < 4) this.trailN++;
    } else if (Math.hypot(this.vx, this.vy) < 40 && this.trailN > 0) {
      this.trailN = Math.max(0, this.trailN - dt * 14);
    }

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
        if (st) st.puff(this.x, this.y + 2, this.heavy ? 12 : 8, this.heavy ? 'thunk' : 'tap');
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
    this.trailN = 0;
    if (st) st.puff(this.x, this.y, this.heavy ? 9 : 5, 'tip');
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

    // the arc it came down: ghosts of itself, fading back up the flight
    const tn = Math.min(4, Math.floor(this.trailN));
    if (tn > 1) {
      ctx.save();
      for (let i = 1; i < tn; i++) {
        ctx.globalAlpha = 0.34 * (1 - i / tn);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.trail[i * 2], this.trail[i * 2 + 1], this.r * (0.9 - i * 0.16), 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

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
    else if (this.shape === 'cereal') this._drawCereal(ctx);
    else if (this.shape === 'cracker') this._drawCracker(ctx);
    else if (this.shape === 'cap') this._drawCap(ctx);
    else this._drawCrumb(ctx);
    ctx.restore();
  }

  _rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _outline(ctx, w) {
    ctx.strokeStyle = this.line;
    ctx.lineWidth = w === undefined ? 2.4 : w;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  _drawCrumb(ctx) {
    const p = this.poly, n = p.length / 2, r = this.r;
    ctx.beginPath();
    ctx.moveTo(p[0] * r, p[1] * r);
    for (let i = 1; i < n; i++) ctx.lineTo(p[i * 2] * r, p[i * 2 + 1] * r);
    ctx.closePath();
    ctx.fillStyle = this.dark;
    ctx.save(); ctx.translate(1.8, 2.2); ctx.fill(); ctx.restore();
    ctx.fillStyle = this.color;
    ctx.fill();
    this._outline(ctx, 2.2);
    ctx.fillStyle = 'rgba(255,250,232,0.55)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.24, -r * 0.3, r * 0.34, r * 0.24, -0.4, 0, TAU);
    ctx.fill();
  }

  /** A puffed cereal O: fat, bright, with a hole you can see through. */
  _drawCereal(ctx) {
    const r = this.r;
    ctx.fillStyle = 'rgba(70,44,16,0.32)';
    ctx.beginPath(); ctx.arc(2, 2.6, r, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.arc(0, 0, r * 0.34, 0, TAU, true);
    ctx.fillStyle = this.color; ctx.fill('evenodd');
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); this._outline(ctx, 2.4);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.34, 0, TAU); this._outline(ctx, 2.0);
    ctx.fillStyle = 'rgba(255,240,196,0.62)';
    ctx.beginPath(); ctx.ellipse(-r * 0.52, -r * 0.5, r * 0.3, r * 0.17, -0.7, 0, TAU); ctx.fill();
  }

  /** The corner off a cracker: pale, square, docked with little holes. */
  _drawCracker(ctx) {
    const r = this.r, a = r * 0.92;
    ctx.fillStyle = 'rgba(70,44,16,0.32)';
    this._rrect(ctx, -a + 2, -a * 0.8 + 2.6, a * 2, a * 1.6, r * 0.22); ctx.fill();
    this._rrect(ctx, -a, -a * 0.8, a * 2, a * 1.6, r * 0.22);
    ctx.fillStyle = this.color; ctx.fill();
    this._outline(ctx, 2.4);
    // the broken edge: one corner bitten off
    ctx.beginPath();
    ctx.moveTo(a, -a * 0.8); ctx.lineTo(a * 0.15, -a * 0.8); ctx.lineTo(a, a * 0.25);
    ctx.closePath();
    ctx.fillStyle = 'rgba(158,112,48,0.30)'; ctx.fill();
    ctx.fillStyle = 'rgba(96,62,22,0.72)';
    for (let i = 0; i < 4; i++) {
      const px = -a * 0.5 + (i % 2) * a * 0.75, py = -a * 0.32 + Math.floor(i / 2) * a * 0.64;
      ctx.beginPath(); ctx.arc(px, py, r * 0.1, 0, TAU); ctx.fill();
    }
  }

  /** A bottle cap: saturated enamel, a crimped rim, a hard specular. */
  _drawCap(ctx) {
    const r = this.r;
    ctx.fillStyle = 'rgba(40,24,10,0.38)';
    ctx.beginPath(); ctx.ellipse(2.2, 3, r, r * 0.96, 0, 0, TAU); ctx.fill();
    // crimped rim
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = this.color; ctx.fill();
    this._outline(ctx, 2.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 14; i++) {
      const A = (i / 14) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(A) * r * 0.78, Math.sin(A) * r * 0.78);
      ctx.lineTo(Math.cos(A) * r * 0.99, Math.sin(A) * r * 0.99);
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
    ctx.strokeStyle = 'rgba(20,12,6,0.4)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.beginPath(); ctx.ellipse(-r * 0.34, -r * 0.4, r * 0.26, r * 0.14, -0.6, 0, TAU); ctx.fill();
  }

  _drawRing(ctx) {
    const r = this.r;
    ctx.fillStyle = 'rgba(60,36,12,0.38)';
    ctx.beginPath(); ctx.arc(2.6, 3.4, r, 0, TAU); ctx.fill();
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    // glaze: a bright sweep across the top-left and a warm bounce underneath,
    // so a 60px ring reads as a fat glossy thing and not a flat disc
    ctx.fillStyle = 'rgba(255,248,214,0.72)';
    ctx.beginPath(); ctx.ellipse(-r * 0.34, -r * 0.44, r * 0.46, r * 0.22, -0.55, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.ellipse(-r * 0.46, -r * 0.5, r * 0.20, r * 0.09, -0.55, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(190,112,26,0.5)';
    ctx.beginPath(); ctx.ellipse(r * 0.22, r * 0.5, r * 0.5, r * 0.26, -0.4, 0, TAU); ctx.fill();
    // the hole: a dark well with a lit far wall, so it stays a hole in mid-air
    ctx.fillStyle = '#6e440f';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.38, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,224,168,0.6)';
    ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.38, Math.PI * 1.08, Math.PI * 1.92); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.38, 0, TAU);
    ctx.strokeStyle = 'rgba(122,72,14,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
    ctx.strokeStyle = this.line; ctx.lineWidth = 2.6; ctx.stroke();
  }

  snapshot() {
    const s = super.snapshot();
    s.phase = this.phase;
    s.lean = +this.lean.toFixed(3);
    s.rock = +this.rock.toFixed(3);
    s.teeters = this.teeters;
    s.bounces = this.bounces;
    s.heavy = this.heavy;
    s.shape = this.shape;
    s.r = +this.r.toFixed(1);
    return s;
  }
}
