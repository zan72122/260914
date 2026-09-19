import { Debris, State } from './base.js';
import { clamp, smoothstep, lerp, TAU, noise1 } from '../core/math.js';

/**
 * Fallen leaves on a balcony.
 *
 * Four motion laws, all of them derived from `vac.field` samples on the piece's
 * OWN body and from nothing else:
 *
 *  DryLeaf   brittle and light. Its rim curls up as the flow grows (each rim
 *            point samples the field where it actually is, so the near edge
 *            curls first), then it breaks stiction and SKITTERS — short
 *            stick-slip hops with a spin, never a smooth glide — and at the
 *            intake it does NOT go in whole: it presses flat against the mouth,
 *            cracks along its veins over ~0.4s with the motor labouring
 *            (`vac.clog`), and bursts into 6-10 fragments that race up the tube.
 *  WetLeaf   dark, flat, glued down. At idle it does not move at all; the flow
 *            only ripples its edge. A HOLD peels it from the edge nearest the
 *            mouth — a visible unpeel with a wet "shlp" — and then it goes in
 *            whole: heavy, slow, and it lands in the cup as a dark lump.
 *  Twig      too long to go in sideways. It swings to align with the mouth
 *            first (the two ends sample different strengths, and the difference
 *            is a torque), and only then goes in end-first as a strand.
 *  SeedPod   round: it rolls (rotation follows the distance travelled) and
 *            rattles on the tile before it is swallowed.
 *
 * A gentle world breeze (`env.breeze`) nudges the dry leaves when the airflow
 * is weak. It is deliberately a SHARED direction, slow, and an order of
 * magnitude smaller than the suction reaction, so "the wind did that" and "the
 * vacuum did that" can never be confused.
 */

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };
const TMPF2 = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

const DRY_STICK = 330;     // acceleration a dry leaf has to beat to move at all
const DRY_PULL = 2600;     // acceleration toward the mouth once it is loose
const DRY_GUST = 9000;     // the air that spills round the sides of the mouth
const CRUMBLE = 0.50;      // seconds of press-and-crack before it bursts

const RIM = 14;            // rim points per blade

/* ------------------------------------------------------------------ dry */

export class DryLeaf extends Debris {
  constructor(x, y, rng, opts = {}) {
    super(x, y);
    this.rng = rng;
    this.L = opts.L || rng.range(30, 38);          // half length
    this.W = opts.W || this.L * rng.range(0.56, 0.74);
    this.rot = opts.rot === undefined ? rng.range(0, TAU) : opts.rot;
    this.color = opts.color || rng.pick(DRY_COLS);
    this.under = shade(this.color, -0.28);
    this.seed = rng.range(0, 100);
    this.env = null;
    this.bounds = null;

    /** How many leaves lie ON TOP of this one (pile layers). */
    this.cover = opts.cover || 0;
    /** Top-of-pile leaves catch the side gust much more readily. */
    this.loose = opts.loose === undefined ? 0.5 : opts.loose;
    this.pile = opts.pile || null;

    this.z = 0; this.vz = 0;
    this.spin = 0;
    this.flip = 0; this.flipSpd = 0;
    this.curl = 0;               // 0..1 overall rim curl (the readable one)
    this.rim = new Float32Array(4);   // per-quadrant curl, sampled on the body
    this.skitter = 0;            // 0..1 how hard it is stick-slipping
    this.rush = 0;
    this.flee = 0;
    this.press = -1;             // >=0 once it is cracking at the intake
    this.fly = 0;                // >0 while it is tumbling away on the side gust
    this.crack = 0;
    this._loose = false;
    this.aimX = 0; this.aimY = -1;
    this.sway = 0;
    this.breath = 0;

    // the blade outline, baked once in local space
    this.px = new Float32Array(RIM);
    this.py = new Float32Array(RIM);
    for (let i = 0; i < RIM; i++) {
      const u = i / RIM;
      const a = u * TAU;
      // a leaf: pointed at the tip, round at the shoulders, tapering to a stalk
      const t = Math.cos(a);
      const w = Math.sin(a);
      const taper = 0.62 + 0.38 * Math.sqrt(Math.max(0, 1 - t * t));
      const tip = t > 0 ? Math.pow(t, 1.25) : t * 0.86;
      this.px[i] = tip * this.L;
      this.py[i] = w * this.W * taper * rng.range(0.92, 1.08);
    }
  }
  get type() { return 'leaf'; }

  aim(out) { out = out || { x: 0, y: 0 }; out.x = this.x; out.y = this.y; return out; }

  /** Thrown off the top of a pile by a charging head. */
  scatter(vx, vy) {
    this.vx += vx; this.vy += vy;
    this.fly = 0.6;                    // ignores the mouth while it tumbles away
    this.vz = Math.max(this.vz, 150 + Math.abs(vx + vy) * 0.08);
    this.flipSpd = 12 + this.rng.range(0, 10);
    this.spin += this.rng.range(-7, 7);
    this._loose = true;
    this.cover = 0;
    if (this.pile) this.pile.lifted(this);
  }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;

    const f = vac.field(this.x, this.y, this._f);
    const s = f.strength;
    this.strength = s;

    // smoothed flow direction, so the leaf's idea of "which way is the mouth"
    // does not snap around when the head is swung
    if (s > 1e-4) {
      const l = Math.hypot(f.fx, f.fy) || 1;
      const k = 1 - Math.exp(-11 * dt);
      this.aimX += (f.fx / l - this.aimX) * k;
      this.aimY += (f.fy / l - this.aimY) * k;
    }
    const al = Math.hypot(this.aimX, this.aimY) || 1;
    this.aimX /= al; this.aimY /= al;

    // ---- pressed against the intake: the crumble ------------------------
    if (this.press >= 0) { this._crumble(dt, vac, world); return; }

    this._rim(dt, vac);

    const m = vac.mouth();
    const ux = -this.aimX, uy = -this.aimY;                 // mouth -> me
    const align = ux * m.dirX + uy * m.dirY;
    const closing = Math.max(0, vac.nozzle.vx * ux + vac.nozzle.vy * uy);
    const rush = smoothstep(110, 560, closing);
    this.rush = rush;

    // ---- the breeze: only while the machine is not doing anything --------
    const br = this.env && this.env.breeze;
    if (br) {
      const quiet = 1 - smoothstep(0.02, 0.14, s);
      this.sway = clamp(lerp(this.sway, br.x * 0.9 + noise1(this.t * 1.7 + this.seed) * 0.55, 1 - Math.exp(-3 * dt)) * quiet, -0.85, 0.85);
      this.breath = quiet * (0.10 + 0.14 * Math.abs(br.x));
      if (quiet > 0.4 && this.cover === 0) {
        this.vx += br.x * 72 * quiet * dt;
        this.vy += br.y * 72 * quiet * dt;
      }
    }

    // ---- lift, but only a little: a dry leaf scrapes, it does not fly ----
    const lift = s * 900 * (1 + this.loose * 0.5) - 1250;
    this.vz += lift * dt;
    this.z += this.vz * dt;
    if (this.z >= 30) { this.z = 30; if (this.vz > 0) this.vz *= 0.2; }
    if (this.z <= 0) {
      this.z = 0;
      if (this.vz < -40 && vac.audio && this.rng.next() < 0.25) vac.audio.pop('tick', 0.18);
      if (this.vz < 0) { this.vz = 0; this.vx *= 0.55; this.vy *= 0.55; this.flipSpd *= 0.3; }
    }
    const air = clamp(this.z / 6, 0, 1);
    const caught = Math.max(air, this.curl * 0.85);

    // ---- pull versus the gust round the sides ----------------------------
    // leaves under other leaves are pinned: the pile comes apart layer by layer
    const pinned = 1 + this.cover * 2.4;
    const pull = DRY_PULL * (0.34 + 0.66 * caught);
    let ax = f.fx * pull;
    let ay = f.fy * pull;

    let px = ux - align * m.dirX, py = uy - align * m.dirY;
    const pl = Math.hypot(px, py);
    if (pl > 1e-4) { px /= pl; py /= pl; } else { px = -m.dirY; py = m.dirX; }
    const side = smoothstep(0.95, 0.30, align);
    const gustK = (0.12 + 2.1 * rush) * (1 - 0.88 * vac.powerN) * (0.45 + this.loose);
    const gmag = s * side * gustK * DRY_GUST * (0.35 + 0.65 * caught);
    ax += (px * 0.95 + ux * 0.5) * gmag;
    ay += (py * 0.95 + uy * 0.5) * gmag;

    const pmag = Math.hypot(f.fx, f.fy) * pull;
    this.flee += (gmag / (gmag + pmag + 1e-3) - this.flee) * (1 - Math.exp(-9 * dt));

    // a charging head blows the top of a pile away before it can suck it in
    if (this.cover === 0 && !this.fly && rush > 0.4 && s > 0.10 && this.z < 2 && this.loose > 0.6) {
      this.scatter(px * 300 * rush + ux * 170 * rush, py * 300 * rush + uy * 170 * rush);
    }
    if (this.fly) {
      this.fly = Math.max(0, this.fly - dt);
      ax *= 0.35; ay *= 0.35;
    }

    // ---- stiction, then stick-slip skittering ----------------------------
    if (this.z <= 1.2) {
      const am = Math.hypot(ax, ay);
      if (am < DRY_STICK * pinned) { ax *= 0.06; ay *= 0.06; this._loose = false; }
      else {
        if (!this._loose) {
          this._loose = true;
          this.vx += ax / am * 48; this.vy += ay / am * 48;
          this.vz = Math.max(this.vz, 60);
          this.spin += this.rng.range(-3.5, 3.5);
        }
        // a dry leaf does not glide: it catches, releases, catches again
        const lurch = 0.55 + 0.75 * Math.max(0, Math.sin(this.t * 17 + this.seed));
        ax *= lurch; ay *= lurch;
      }
    } else this._loose = true;

    this.vx += ax * dt; this.vy += ay * dt;
    const drag = Math.exp(-(air > 0.2 ? 2.6 : 8.5) * dt);
    this.vx *= drag; this.vy *= drag;
    this.x += this.vx * dt; this.y += this.vy * dt;

    const sp = Math.hypot(this.vx, this.vy);
    this.skitter += (clamp(sp / 190, 0, 1) * (1 - air * 0.5) - this.skitter) * (1 - Math.exp(-8 * dt));
    this.flipSpd += ((air * (0.6 + this.flee * 3.4) * clamp(sp / 230, 0, 1.5)) * 10 - this.flipSpd) * (1 - Math.exp(-6 * dt));
    this.flip += this.flipSpd * dt;
    this.spin += (clamp(sp / 260, 0, 1) * (this.flee - 0.2) * 5 - this.spin) * (1 - Math.exp(-4 * dt));
    this.rot += this.spin * dt;
    // once a leaf has actually left its place in the heap, the ones under it
    // are no longer pinned by it
    if (this.pile && !this._settled && Math.hypot(this.x - this.hx, this.y - this.hy) > 26) {
      this._settled = true; this.pile.lifted(this);
    }

    const b = this.bounds;
    if (b) {
      if (this.x < b.x0) { this.x = b.x0; this.vx = Math.abs(this.vx) * 0.3; }
      else if (this.x > b.x1) { this.x = b.x1; this.vx = -Math.abs(this.vx) * 0.3; }
      if (this.y < b.y0) { this.y = b.y0; this.vy = Math.abs(this.vy) * 0.3; }
      else if (this.y > b.y1) { this.y = b.y1; this.vy = -Math.abs(this.vy) * 0.3; }
    }

    if (this.z <= 0 && sp < 20 && s < 0.2) {
      this.hx = this.x; this.hy = this.y;
      this.spin *= Math.exp(-5 * dt);
      const snap = Math.round(this.flip / Math.PI) * Math.PI;
      this.flip += (snap - this.flip) * (1 - Math.exp(-6 * dt));
      this.flipSpd *= Math.exp(-6 * dt);
    }

    this.state = this.z > 1.2 || sp > 26 ? State.PULLED : (s > 0.045 ? State.REACTING : State.IDLE);
    if (f.inCapture && !this.fly) {
      this.press = 0; this.crack = 0;
      this.state = State.CAPTURED;
      this.vx *= 0.15; this.vy *= 0.15;
      if (this.pile) this.pile.lifted(this);
    }
  }

  /**
   * The show. It arrives at the intake and stops dead, flattened against it,
   * and for the next ~0.4s you watch it crack: the mouth squashes it, the
   * cracks open along the veins one after another, the whole leaf shivers, the
   * motor drops into the boomy blocked-intake note — and then it lets go all at
   * once and races up the tube in pieces.
   */
  _crumble(dt, vac, world) {
    this.press += dt / CRUMBLE;
    const p = clamp(this.press, 0, 1);
    const m = vac.mouth();
    // hug the intake
    // sit just OUTSIDE the intake, not on top of it: the head is opaque, and
    // the whole point of this beat is that the child watches the leaf crack
    const tx = m.x + m.dirX * 13, ty = m.y + m.dirY * 13;
    const k = 1 - Math.exp(-24 * dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.z += (6 - this.z) * k;
    // lie flat across the mouth, so the cracks run across the opening
    const want = Math.atan2(m.dirY, m.dirX);
    let d = ((want - this.rot + Math.PI) % TAU + TAU) % TAU - Math.PI;
    this.rot += d * (1 - Math.exp(-11 * dt));
    this.crack = smoothstep(0.30, 1, p);
    // a leaf jammed across the intake really does block it
    vac.clog = Math.max(vac.clog, 0.30 + 0.45 * p);
    if (vac.audio) {
      const nc = Math.floor(p * 5);
      if (nc !== this._nc) { this._nc = nc; if (nc > 0) vac.audio.pop('tick', 0.22 + 0.1 * nc); }
    }
    if (this.press < 1) return;

    // ---- burst ----------------------------------------------------------
    const n = 6 + (this.rng.int ? this.rng.int(0, 4) : 3);
    const air = this.env && this.env.air;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + this.rng.range(-0.3, 0.3);
      const sp = this.rng.range(150, 300);
      const ox = Math.cos(a) * this.L * 0.5, oy = Math.sin(a) * this.W * 0.5;
      if (air) {
        air.spawn(this.x + ox, this.y + oy, this.rng.range(10, 26),
          Math.cos(a) * sp - m.dirX * 30, Math.sin(a) * sp - m.dirY * 30,
          this.rng.range(180, 320), 'leaf');
      }
    }
    vac.gulp(1);
    if (this.env && this.env.onCrumble) this.env.onCrumble(this, n);
    this.state = State.DONE;
    if (world && world.onCaptured) world.onCaptured(this);
  }

  /** Per-quadrant rim sampling: the edge nearest the mouth curls first. */
  _rim(dt, vac) {
    const c = Math.cos(this.rot), sn = Math.sin(this.rot);
    let mx = 0;
    for (let i = 0; i < 4; i++) {
      const lx = (i === 0 ? this.L : i === 2 ? -this.L : 0) * 0.85;
      const ly = (i === 1 ? this.W : i === 3 ? -this.W : 0) * 0.9;
      const wx = this.x + lx * c - ly * sn;
      const wy = this.y + lx * sn + ly * c;
      const st = vac.field(wx, wy, TMPF).strength;
      const rel = (st - this.strength) / Math.max(0.05, this.strength);
      const bias = clamp(0.45 + 2.6 * rel, 0, 1);
      let tz = smoothstep(0.035, 0.52, st) * bias;
      tz += noise1(this.t * 13 + this.seed + i * 7) * smoothstep(0.02, 0.3, st) * 0.22;
      // and the breeze itself lifts an edge a little: the deck is never dead,
      // but this is an order of magnitude smaller than the flow's curl
      if (this.breath) tz += Math.max(0, noise1(this.t * 2.3 + this.seed + i * 5)) * this.breath;
      tz = clamp(tz, 0, 1.15);
      this.rim[i] += (tz - this.rim[i]) * (1 - Math.exp(-13 * dt));
      if (this.rim[i] > mx) mx = this.rim[i];
    }
    this.curl += (mx - this.curl) * (1 - Math.exp(-13 * dt));
  }

  translate(dx, dy) { this.x += dx; this.y += dy; this.hx += dx; this.hy += dy; }

  // ----------------------------------------------------------------- draw

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    const face = Math.cos(this.flip);
    const top = face >= 0 ? this.color : this.under;
    const bot = face >= 0 ? this.under : this.color;
    const lift = this.z / 30;

    ctx.fillStyle = 'rgba(46,32,14,' + (0.26 * (1 - lift * 0.5)).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(this.x + 3 + lift * 8, this.y + 4 + lift * 13,
      this.L * 0.92, this.W * 0.8, this.rot, 0, TAU);
    ctx.fill();

    const jit = this.skitter * 1.6 + (this.press >= 0 ? clamp(this.press, 0, 1) * 3.4 : 0);
    ctx.save();
    ctx.translate(this.x + noise1(this.t * 31 + this.seed) * jit,
      this.y - this.z * 0.85 + noise1(this.t * 29 + this.seed + 5) * jit);
    ctx.rotate(this.rot + this.sway * 0.30);
    const fs = Math.abs(face) * 0.82 + 0.18;
    const press = this.press >= 0 ? clamp(this.press, 0, 1) : 0;
    ctx.scale(1 - press * 0.34, fs * (1 + press * 0.20));

    this._blade(ctx, top, bot);
    ctx.restore();
  }

  _blade(ctx, top, bot) {
    // rim curl: each point is pulled toward the midrib and up-screen by the
    // curl of the quadrant it belongs to, so the blade rolls from one side
    const c0 = this.rim[0], c1 = this.rim[1], c2 = this.rim[2], c3 = this.rim[3];
    ctx.beginPath();
    for (let i = 0; i < RIM; i++) {
      const bx = this.px[i], by = this.py[i];
      const ex = bx > 0 ? bx / this.L : 0, wx2 = bx < 0 ? -bx / this.L : 0;
      const ny = by > 0 ? by / this.W : 0, sy = by < 0 ? -by / this.W : 0;
      const cu = c0 * ex + c2 * wx2 + c1 * ny + c3 * sy;
      const x = bx * (1 - 0.26 * cu);
      const y = by * (1 - 0.34 * cu) - cu * this.W * 0.42;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = top;
    ctx.fill();
    // the curled-under edge shows its darker back
    if (this.curl > 0.08) {
      ctx.save();
      ctx.globalAlpha = clamp(this.curl, 0, 1) * 0.85;
      ctx.strokeStyle = bot;
      ctx.lineWidth = 2 + this.curl * 4.5;
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(70,46,18,0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // midrib and veins — and, while it is cracking, the gaps opening along them
    const cr = this.crack;
    ctx.strokeStyle = cr > 0.02 ? 'rgba(52,34,12,' + (0.5 + 0.5 * cr).toFixed(2) + ')' : 'rgba(92,62,26,0.5)';
    ctx.lineWidth = 1.5 + cr * 2.2;
    ctx.beginPath();
    ctx.moveTo(-this.L * 0.92, 0); ctx.lineTo(this.L * 0.96, 0);
    for (let i = -2; i <= 2; i++) {
      if (!i) continue;
      const bx = -this.L * 0.35 + Math.abs(i) * this.L * 0.26;
      const dir = i > 0 ? 1 : -1;
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx + this.L * 0.38, dir * this.W * 0.86);
    }
    ctx.stroke();
    if (cr > 0.05) {
      // the blade splitting: pale gaps that widen along the veins
      ctx.strokeStyle = 'rgba(255,246,222,' + (0.75 * cr).toFixed(2) + ')';
      ctx.lineWidth = 1 + cr * 3.4;
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) {
        if (!i) continue;
        const bx = -this.L * 0.35 + Math.abs(i) * this.L * 0.26;
        const dir = i > 0 ? 1 : -1;
        const g = cr * (0.4 + 0.3 * Math.abs(i));
        ctx.moveTo(bx + this.L * 0.1 * g, dir * this.W * 0.2 * g);
        ctx.lineTo(bx + this.L * 0.4, dir * this.W * (0.86 + 0.16 * g));
      }
      ctx.stroke();
    }
  }

  snapshot() {
    const s = super.snapshot();
    s.curl = +this.curl.toFixed(2);
    s.rim = [+this.rim[0].toFixed(2), +this.rim[1].toFixed(2), +this.rim[2].toFixed(2), +this.rim[3].toFixed(2)];
    s.skitter = +this.skitter.toFixed(2);
    s.press = +Math.max(0, this.press).toFixed(2);
    s.crack = +this.crack.toFixed(2);
    s.flee = +this.flee.toFixed(2);
    s.rush = +this.rush.toFixed(2);
    s.z = +this.z.toFixed(1);
    s.cover = this.cover;
    s.fly = +this.fly.toFixed(2);
    return s;
  }
}

/* ------------------------------------------------------------------ wet */

export class WetLeaf extends Debris {
  constructor(x, y, rng, opts = {}) {
    super(x, y);
    this.rng = rng;
    this.L = opts.L || rng.range(32, 40);
    this.W = opts.W || this.L * rng.range(0.62, 0.78);
    this.rot = opts.rot === undefined ? rng.range(0, TAU) : opts.rot;
    this.color = opts.color || rng.pick(WET_COLS);
    this.seed = rng.range(0, 100);
    this.bounds = null;
    this.env = null;

    this.ripple = 0;        // 0..1 the edge fluttering where the flow hits it
    this.peel = 0;          // 0..1 how far it has been lifted off the tile
    this.free = false;
    this.peelDir = 0;       // world angle of the edge that came up first
    this.strain = 0;
    this._shlp = false;
    this.px = new Float32Array(RIM);
    this.py = new Float32Array(RIM);
    for (let i = 0; i < RIM; i++) {
      const a = (i / RIM) * TAU;
      const t = Math.cos(a), w = Math.sin(a);
      const taper = 0.66 + 0.34 * Math.sqrt(Math.max(0, 1 - t * t));
      this.px[i] = (t > 0 ? Math.pow(t, 1.2) : t * 0.9) * this.L;
      this.py[i] = w * this.W * taper * rng.range(0.94, 1.06);
    }
  }
  get type() { return 'wetleaf'; }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;
    const f = vac.field(this.x, this.y, this._f);
    const s = f.strength;
    this.strength = s;

    this.ripple += (smoothstep(0.03, 0.55, s) - this.ripple) * (1 - Math.exp(-10 * dt));

    if (!this.free) {
      // The edge nearest the mouth is the one that comes up. Sample there, not
      // at the centre: that is why holding slightly off to one side works.
      const m = vac.mouth();
      let dx = m.x - this.x, dy = m.y - this.y;
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      // sample ON the near edge, never PAST the mouth: at point-blank range an
      // offset of a whole half-length lands behind the head, where the cone is
      // almost nothing, and the leaf would stop peeling exactly when the child
      // has done the right thing
      const off = Math.min(this.L * 0.85, l * 0.45);
      const ex = this.x + dx * off, ey = this.y + dy * off;
      const es = vac.field(ex, ey, TMPF).strength;
      this.peelDir = Math.atan2(dy, dx);
      // it only peels while the flow is STRONG and sustained: a passing sweep
      // ripples it and nothing else. Held power is most of the rate.
      const drive = Math.max(0, es - 0.42) * (0.45 + 1.15 * vac.powerN);
      if (drive > 0) this.peel = clamp(this.peel + drive * 1.05 * dt, 0, 1);
      else this.peel = Math.max(0, this.peel - dt * 0.55);
      // never a static deformed pose: while it is half up it strains and sucks
      // back down against the tile
      this.strain = this.peel > 0.04 ? 1 : this.strain * Math.exp(-6 * dt);
      if (this.peel >= 1 && !this._shlp) {
        this._shlp = true;
        this.free = true;
        if (vac.audio) { vac.audio.pop('whoosh', 0.55); vac.audio.pop('pop', 0.35); }
        if (this.env && this.env.onPeel) this.env.onPeel(this);
      }
      this.state = this.peel > 0.02 ? State.REACTING : (s > 0.04 ? State.REACTING : State.IDLE);
      if (f.inCapture && this.peel < 1) {
        // flat on the tile it simply will not go in: the mouth slides over it
        this.state = State.REACTING;
        return;
      }
      if (!this.free) return;
    }

    // ---- heavy, slow, soggy ---------------------------------------------
    this.vx += f.fx * 1500 * dt;
    this.vy += f.fy * 1500 * dt;
    const dr = Math.exp(-5.5 * dt);
    this.vx *= dr; this.vy *= dr;
    this.x += this.vx * dt; this.y += this.vy * dt;
    const want = Math.atan2(f.fy, f.fx);
    let d = ((want - this.rot + Math.PI) % TAU + TAU) % TAU - Math.PI;
    this.rot += d * (1 - Math.exp(-3.5 * dt));
    const b = this.bounds;
    if (b) { this.x = clamp(this.x, b.x0, b.x1); this.y = clamp(this.y, b.y0, b.y1); }
    this.state = State.PULLED;
    if (f.inCapture) {
      vac.clog = Math.max(vac.clog, 0.25);
      this._handOff(vac, { kind: 'fluff', color: this.color, size: 15 }, 0.62);
      world.onCaptured && world.onCaptured(this);
    }
  }

  translate(dx, dy) { this.x += dx; this.y += dy; this.hx += dx; this.hy += dy; }

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    const peel = this.peel;
    // The shadow is what says UP. It stays on the tile and slides a long way
    // out from under the blade as the near end comes off it, and it softens
    // and spreads while it goes — an edge peeling up, not a leaf shrinking.
    ctx.fillStyle = 'rgba(30,26,16,' + (0.32 - 0.13 * peel).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(this.x + 2 + peel * 19, this.y + 3 + peel * 25,
      this.L * (0.95 + peel * 0.16), this.W * (0.85 + peel * 0.20), this.rot, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(this.x, this.y - peel * 36);
    // the whole blade hinges up around the edge AWAY from the mouth
    ctx.rotate(this.peelDir);
    const strainWob = this.strain * Math.sin(this.t * 13 + this.seed) * 0.035 * (1 - peel * 0.6);
    // foreshortening along the peel axis: that is what reads as "lifting"
    ctx.scale(1 - peel * 0.32 + strainWob, 1);
    ctx.translate(peel * this.L * 0.30, 0);
    ctx.rotate(-this.peelDir + this.rot);

    // wet underside, revealed as the near end comes up
    if (peel > 0.03) {
      ctx.save();
      ctx.globalAlpha = clamp(peel * 1.4, 0, 1);
      ctx.fillStyle = shade(this.color, -0.45);
      ctx.beginPath();
      this._path(ctx, 1.02, 0);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    this._path(ctx, 1, this.ripple);
    ctx.fillStyle = this.color;
    ctx.fill();
    // glossy: one long wet highlight, and it slides as the leaf lifts
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.3 * peel;
    ctx.fillStyle = 'rgba(232,246,255,0.42)';
    ctx.beginPath();
    ctx.ellipse(-this.L * 0.18 + peel * this.L * 0.4, -this.W * 0.26,
      this.L * 0.42, this.W * 0.2, -0.35, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(18,24,14,0.55)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // the lifted end catches the light: that is what makes the peel readable
    if (peel > 0.05) {
      ctx.save();
      ctx.globalAlpha = clamp(peel * 1.2, 0, 1) * 0.45;
      ctx.strokeStyle = 'rgba(255,255,236,1)';
      ctx.lineWidth = 7 + peel * 11;
      ctx.beginPath();
      ctx.moveTo(this.L * 0.1, -this.W * 0.86);
      ctx.quadraticCurveTo(this.L * 1.05, 0, this.L * 0.1, this.W * 0.86);
      ctx.stroke();
      ctx.globalAlpha = clamp(peel * 1.3, 0, 1);
      ctx.strokeStyle = 'rgba(255,255,244,1)';
      ctx.lineWidth = 3.0 + peel * 4.4;
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(200,220,190,0.30)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-this.L * 0.9, 0); ctx.lineTo(this.L * 0.92, 0);
    ctx.stroke();
    ctx.restore();

    // the wet string of contact still holding the lifted end down
    if (peel > 0.12 && peel < 1) {
      ctx.save();
      ctx.globalAlpha = 0.35 * (1 - peel);
      ctx.strokeStyle = '#8fa07a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const ca = Math.cos(this.peelDir), sa = Math.sin(this.peelDir);
      for (let i = -1; i <= 1; i += 2) {
        const ox = -sa * this.W * 0.5 * i, oy = ca * this.W * 0.5 * i;
        ctx.moveTo(this.x + ca * this.L * 0.7 + ox, this.y + sa * this.L * 0.7 + oy);
        ctx.lineTo(this.x + ca * this.L * 0.55 + ox * 0.7, this.y + sa * this.L * 0.55 + oy * 0.7 - peel * 9);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  _path(ctx, k, ripple) {
    for (let i = 0; i < RIM; i++) {
      const w = ripple * 2.6 * Math.sin(this.t * 9 + i * 1.3 + this.seed);
      const x = this.px[i] * k + w * 0.5;
      const y = this.py[i] * k + w;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  snapshot() {
    const s = super.snapshot();
    s.peel = +this.peel.toFixed(2);
    s.ripple = +this.ripple.toFixed(2);
    s.free = this.free;
    return s;
  }
}

/* ----------------------------------------------------------------- twig */

export class Twig extends Debris {
  constructor(x, y, rng, opts = {}) {
    super(x, y);
    this.rng = rng;
    this.L = opts.L || rng.range(44, 56);      // half length
    this.th = opts.th || rng.range(2.6, 3.6);
    this.rot = opts.rot === undefined ? rng.range(0, TAU) : opts.rot;
    this.color = opts.color || '#6d4b2a';
    this.seed = rng.range(0, 100);
    this.bounds = null;
    this.spin = 0;
    this.align = 0;       // |cos| between the twig and the mouth axis
    this.swing = 0;       // how hard it is being turned right now
    this.knock = 0;       // it just hit the intake sideways
    this.buzz = 0;
    // a couple of side shoots, so the rotation is legible
    this.shoot = [rng.range(-0.5, 0.5), rng.range(-0.5, 0.5)];
  }
  get type() { return 'twig'; }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;
    const c = Math.cos(this.rot), sn = Math.sin(this.rot);
    const ax = this.x + c * this.L, ay = this.y + sn * this.L;
    const bx = this.x - c * this.L, by = this.y - sn * this.L;
    const f = vac.field(this.x, this.y, this._f);
    const fa = vac.field(ax, ay, TMPF);
    const fb = vac.field(bx, by, TMPF2);
    const s = f.strength;
    this.strength = s;

    // TORQUE: each end is pulled toward the mouth by its own sample, and the
    // difference between the two is what swings the stick round to point at it
    const ta = (fa.fx * -sn + fa.fy * c);
    const tb = -(fb.fx * -sn + fb.fy * c);
    const torque = (ta + tb) * 34;
    this.spin += torque * dt;
    this.spin *= Math.exp(-4.5 * dt);
    this.rot += this.spin * dt;
    this.swing = clamp(Math.abs(this.spin) / 3, 0, 1);

    const m = vac.mouth();
    const cc = Math.cos(this.rot), ss = Math.sin(this.rot);
    this.align = Math.abs(cc * m.dirX + ss * m.dirY);
    this.buzz += (smoothstep(0.04, 0.5, s) - this.buzz) * (1 - Math.exp(-10 * dt));

    // it slides bodily too, but a stick is heavy and it drags
    if (s > 0.33) {
      this.vx += f.fx * 1350 * dt;
      this.vy += f.fy * 1350 * dt;
    }
    const dr = Math.exp(-5 * dt);
    this.vx *= dr; this.vy *= dr;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.knock = Math.max(0, this.knock - dt * 3);

    const b = this.bounds;
    if (b) { this.x = clamp(this.x, b.x0, b.x1); this.y = clamp(this.y, b.y0, b.y1); }

    this.state = Math.hypot(this.vx, this.vy) > 20 ? State.PULLED : (s > 0.05 ? State.REACTING : State.IDLE);

    if (f.inCapture) {
      if (this.align > 0.80) {
        // end-first, as a strand: the whole stick runs up the tube in order
        const nearFirst = (cc * m.dirX + ss * m.dirY) < 0;
        const pts = [];
        const N = 5;
        for (let i = 0; i < N; i++) {
          const u = nearFirst ? (i / (N - 1)) : (1 - i / (N - 1));
          pts.push({ x: this.x + cc * this.L * (u * 2 - 1), y: this.y + ss * this.L * (u * 2 - 1) });
        }
        this.state = State.TRANSIT;
        vac.transit({ kind: 'strand', points: pts, color: this.color, width: this.th * 1.6, size: 12 });
        vac.clog = Math.max(vac.clog, 0.3);
        this.state = State.DONE;
        world.onCaptured && world.onCaptured(this);
      } else {
        // sideways: it clatters against the rim and is knocked back out, still
        // turning — the child sees WHY it did not go in
        this.knock = 1;
        this.x -= m.dirX * 9; this.y -= m.dirY * 9;
        this.vx = -m.dirX * 90; this.vy = -m.dirY * 90;
        this.spin += (this.spin >= 0 ? 1 : -1) * 2.2;
        if (vac.audio) vac.audio.pop('tick', 0.4);
      }
    }
  }

  translate(dx, dy) { this.x += dx; this.y += dy; this.hx += dx; this.hy += dy; }

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    const jb = this.buzz * 1.3;
    const x = this.x + noise1(this.t * 33 + this.seed) * jb;
    const y = this.y + noise1(this.t * 31 + this.seed + 3) * jb;
    ctx.strokeStyle = 'rgba(46,32,14,0.26)';
    ctx.lineWidth = this.th * 2.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - c * this.L + 3, y - s * this.L + 4);
    ctx.lineTo(x + c * this.L + 3, y + s * this.L + 4);
    ctx.stroke();

    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.th * 2;
    ctx.beginPath();
    ctx.moveTo(x - c * this.L, y - s * this.L);
    ctx.lineTo(x + c * this.L, y + s * this.L);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,210,0.22)';
    ctx.lineWidth = this.th * 0.7;
    ctx.beginPath();
    ctx.moveTo(x - c * this.L * 0.8 - s * this.th * 0.5, y - s * this.L * 0.8 + c * this.th * 0.5);
    ctx.lineTo(x + c * this.L * 0.8 - s * this.th * 0.5, y + s * this.L * 0.8 + c * this.th * 0.5);
    ctx.stroke();
    // side shoots
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.th * 1.1;
    ctx.beginPath();
    for (let i = 0; i < 2; i++) {
      const u = i ? 0.25 : -0.4;
      const bxx = x + c * this.L * u, byy = y + s * this.L * u;
      const a = this.rot + this.shoot[i] + (i ? 0.9 : -1.0);
      ctx.moveTo(bxx, byy);
      ctx.lineTo(bxx + Math.cos(a) * this.L * 0.34, byy + Math.sin(a) * this.L * 0.34);
    }
    ctx.stroke();
    if (this.knock > 0.02) {
      ctx.strokeStyle = 'rgba(255,238,200,' + (0.5 * this.knock).toFixed(2) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x + c * this.L, y + s * this.L, 9 + 10 * (1 - this.knock), 0, TAU);
      ctx.stroke();
    }
  }

  snapshot() {
    const s = super.snapshot();
    s.align = +this.align.toFixed(2);
    s.swing = +this.swing.toFixed(2);
    s.spin = +this.spin.toFixed(2);
    s.knock = +this.knock.toFixed(2);
    return s;
  }
}

/* ------------------------------------------------------------------ pod */

export class SeedPod extends Debris {
  constructor(x, y, rng, opts = {}) {
    super(x, y);
    this.rng = rng;
    this.r = opts.r || rng.range(8.5, 11.5);
    this.color = opts.color || '#8a6a3c';
    this.seed = rng.range(0, 100);
    this.rot = rng.range(0, TAU);
    this.roll = 0;
    this.rattle = 0;
    this.bounds = null;
    this._tick = 0;
  }
  get type() { return 'pod'; }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;
    const f = vac.field(this.x, this.y, this._f);
    const s = f.strength;
    this.strength = s;
    // it rattles in place before it rolls: a hard little thing on a hard tile
    this.rattle += (smoothstep(0.06, 0.42, s) - this.rattle) * (1 - Math.exp(-12 * dt));
    if (s > 0.22) {
      this.vx += f.fx * 2100 * dt;
      this.vy += f.fy * 2100 * dt;
    }
    const dr = Math.exp(-2.6 * dt);
    this.vx *= dr; this.vy *= dr;
    const sp = Math.hypot(this.vx, this.vy);
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.roll += (sp / this.r) * dt * (this.vx >= 0 ? 1 : -1);
    if (sp > 60) {
      this._tick -= dt;
      if (this._tick <= 0) { this._tick = 0.09 + 0.1 * this.rng.next(); if (vac.audio) vac.audio.pop('tick', 0.14); }
    }
    const b = this.bounds;
    if (b) {
      if (this.x < b.x0) { this.x = b.x0; this.vx = Math.abs(this.vx) * 0.5; }
      else if (this.x > b.x1) { this.x = b.x1; this.vx = -Math.abs(this.vx) * 0.5; }
      if (this.y < b.y0) { this.y = b.y0; this.vy = Math.abs(this.vy) * 0.5; }
      else if (this.y > b.y1) { this.y = b.y1; this.vy = -Math.abs(this.vy) * 0.5; }
    }
    this.state = sp > 22 ? State.PULLED : (s > 0.05 ? State.REACTING : State.IDLE);
    if (f.inCapture) {
      this._handOff(vac, { kind: 'crumb', color: this.color, size: this.r * 1.5 });
      world.onCaptured && world.onCaptured(this);
    }
  }

  translate(dx, dy) { this.x += dx; this.y += dy; this.hx += dx; this.hy += dy; }

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    const jx = noise1(this.t * 37 + this.seed) * this.rattle * 1.8;
    const jy = noise1(this.t * 35 + this.seed + 4) * this.rattle * 1.8;
    ctx.fillStyle = 'rgba(46,32,14,0.26)';
    ctx.beginPath(); ctx.ellipse(this.x + 2.5, this.y + 3.5, this.r * 1.05, this.r * 0.55, 0, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(this.x + jx, this.y + jy);
    ctx.rotate(this.rot + this.roll);
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.ellipse(0, 0, this.r, this.r * 0.82, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = shade(this.color, -0.3);
    ctx.beginPath(); ctx.ellipse(0, this.r * 0.22, this.r * 0.9, this.r * 0.38, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,205,0.45)';
    ctx.beginPath(); ctx.ellipse(-this.r * 0.3, -this.r * 0.3, this.r * 0.3, this.r * 0.2, -0.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = shade(this.color, -0.45);
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-this.r * 0.9, 0); ctx.lineTo(this.r * 0.9, 0); ctx.stroke();
    ctx.restore();
  }

  snapshot() {
    const s = super.snapshot();
    s.rattle = +this.rattle.toFixed(2);
    return s;
  }
}

/* -------------------------------------------------------------- helpers */

/**
 * A heap of leaves: not a debris itself, just the bookkeeping that makes the
 * stack come apart from the top down. Each leaf knows how many are still on
 * top of it (`cover`), which multiplies its stiction, and the pile drops that
 * count for everything underneath when one leaves.
 */
export class LeafPile {
  constructor(x, y) { this.x = x; this.y = y; this.leaves = []; }
  add(leaf, layer) {
    leaf.pile = this;
    leaf.layer = layer;
    this.leaves.push(leaf);
  }
  /** Recount cover after the layout has been built (or one has gone). */
  settle() {
    for (let i = 0; i < this.leaves.length; i++) {
      const a = this.leaves[i];
      if (a.state === State.DONE || a._gone) { a.cover = 0; continue; }
      let n = 0;
      for (let k = 0; k < this.leaves.length; k++) {
        const b = this.leaves[k];
        if (b === a || b.state === State.DONE || b._gone) continue;
        if (b.layer <= a.layer) continue;
        if (Math.hypot(b.x - a.x, b.y - a.y) < 34) n++;
      }
      a.cover = n;
      a.loose = n === 0 ? 1 : 0.25;
    }
  }
  lifted(leaf) { leaf._gone = true; this.settle(); }
}

export const DRY_COLS = ['#c8873a', '#b56a2b', '#d2a04a', '#a95f28', '#c9953f', '#bd7c33'];
export const WET_COLS = ['#3f4a2c', '#4a4330', '#37402a', '#454a33'];

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}
