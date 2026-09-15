import { Debris, State } from './base.js';
import { clamp, smoothstep, splineAt, TAU, noise1 } from '../core/math.js';

/**
 * Long thin debris: sewing thread, a yarn strand, a hair, a ribbon.
 *
 * The suction phenomenon this type exists for: a long thing is taken from ONE
 * END. Everything below is derived from vacuum.field() sampled at EVERY node,
 * never from a distance to the nozzle:
 *
 *  far   the tip alone lifts off the floor and waves toward the mouth (a
 *        travelling wave down the last few segments, like grass in wind); the
 *        rest of the strand is still gripped by the floor.
 *  mid   the grip lets go from the tip backwards (`free` is a front that walks
 *        along the strand). The freed part straightens toward the mouth and
 *        goes taut (`tension` -> 1, the taut part sings). Retreat with the
 *        nozzle and the front walks BACK: the strand slips onto the floor again.
 *  near  the tip enters the mouth and the strand is reeled in: an accelerating
 *        frontier eats arc length at the mouth while the rest is dragged along
 *        the floor behind it, tail whipping. Part-way through, the remnant is
 *        handed to `vac.transit({kind:'strand'})`, which runs it head-first up
 *        the transparent tube and coils it into the cup.
 *  snag  a strand whose path wraps a chair leg TIGHTENS first (the reel stalls,
 *        the line straightens and vibrates) and then slips free with a snap.
 *
 * A ribbon is the same body with its far end permanently anchored: its tip is
 * pulled straight into the mouth and streams there forever. It can never be
 * taken, but it makes the airflow visible.
 */

const F = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };
const SP = { x: 0, y: 0 };

export const STRAND_VARIANTS = {
  // thin, bright, long, low drag: the classic "shuru-shuru"
  thread: {
    seg: 13, width: 3.6, color: '#17b1a0', light: '#8ff3e6', edge: 'rgba(8,52,48,0.34)',
    drag: 4.0, pull: 2500, relThr: 0.52, relSpd: 13, tipFree: 2.4,
    waveAmp: 16, waveHz: 2.4, waveTaper: 3.2,
    reelV0: 165, reelA: 430, coil: 11, transitW: 3.0,
  },
  // thick, fuzzy, heavy, high drag: it comes in slower and looks like wool
  yarn: {
    seg: 15, width: 6.2, color: '#5f7fe0', light: '#b9c8ff', edge: 'rgba(24,32,78,0.34)',
    drag: 8.2, pull: 1500, relThr: 0.86, relSpd: 7, tipFree: 2.0,
    waveAmp: 9, waveHz: 1.5, waveTaper: 2.6,
    reelV0: 150, reelA: 390, coil: 17, transitW: 6.2,
  },
  // very thin, dark, curly, light: the tip whips
  hair: {
    seg: 10, width: 2.2, color: '#2b2219', light: '#8c7a63', edge: 'rgba(0,0,0,0.22)',
    drag: 2.6, pull: 3400, relThr: 0.40, relSpd: 21, tipFree: 3.4,
    waveAmp: 21, waveHz: 4.6, waveTaper: 4.5,
    reelV0: 400, reelA: 1250, coil: 8, transitW: 2.0,
  },
  // tied to something: can never be taken, only streamed
  ribbon: {
    seg: 16, width: 16, color: '#ef4f6b', light: '#ffd9e0', edge: 'rgba(110,26,44,0.40)',
    drag: 6.0, pull: 1900, relThr: 0.38, relSpd: 11, tipFree: 2.6,
    waveAmp: 14, waveHz: 2.0, waveTaper: 3.6,
    reelV0: 0, reelA: 0, coil: 0, transitW: 0,
  },
};

let _serial = 0;

/** Resample a control polyline into equal-length segments along a smooth spline. */
export function resamplePath(pts, seg) {
  if (pts.length < 2) return pts.map((p) => ({ x: p.x, y: p.y }));
  const fine = [];
  const N = Math.max(48, pts.length * 24);
  const tmp = { x: 0, y: 0 };
  for (let i = 0; i <= N; i++) { splineAt(pts, i / N, tmp); fine.push({ x: tmp.x, y: tmp.y }); }
  let total = 0;
  for (let i = 1; i < fine.length; i++) total += Math.hypot(fine[i].x - fine[i - 1].x, fine[i].y - fine[i - 1].y);
  const n = Math.max(3, Math.round(total / seg));
  const step = total / n;
  const out = [{ x: fine[0].x, y: fine[0].y }];
  let acc = 0, want = step, k = 1;
  while (k < fine.length && out.length <= n) {
    const dx = fine[k].x - fine[k - 1].x, dy = fine[k].y - fine[k - 1].y;
    const l = Math.hypot(dx, dy);
    if (acc + l >= want && l > 1e-6) {
      const t = (want - acc) / l;
      out.push({ x: fine[k - 1].x + dx * t, y: fine[k - 1].y + dy * t });
      want += step;
    } else { acc += l; k++; }
  }
  while (out.length < n + 1) out.push({ x: fine[fine.length - 1].x, y: fine[fine.length - 1].y });
  return out;
}

export class Strand extends Debris {
  /**
   * @param {object} o
   *   path      control points, WORLD coords. path[0] is the END that gets sucked.
   *   variant   'thread' | 'yarn' | 'hair' | 'ribbon'
   *   rng       seeded RNG
   *   clump     >1 draws that many tangled hairs and reels much faster
   *   anchor    ribbon only: the far end is pinned for ever
   *   snag      {x, y, r} a prop the strand wraps: it tightens, then slips free
   *   color/light/width  optional overrides
   */
  constructor(o) {
    const V = STRAND_VARIANTS[o.variant] || STRAND_VARIANTS.thread;
    const pts = resamplePath(o.path, o.seg || V.seg);
    super(pts[0].x, pts[0].y);
    this.variant = o.variant || 'thread';
    this.V = V;
    this.id = this.variant + '#' + (++_serial);
    this.rng = o.rng;
    this.color = o.color || V.color;
    this.lightColor = o.light || V.light;
    this.width = o.width || V.width;
    this.clump = o.clump || 1;
    this.anchored = !!o.anchor;
    this.snag = o.snag ? { x: o.snag.x, y: o.snag.y, r: o.snag.r, grip: 1, arc: 0 } : null;

    const n = pts.length;
    this.n = n;
    this.px = new Float32Array(n); this.py = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n);
    this.hxs = new Float32Array(n); this.hys = new Float32Array(n);
    this.sN = new Float32Array(n);
    this.fxN = new Float32Array(n); this.fyN = new Float32Array(n);
    this.lift = new Float32Array(n);
    this.gN = new Float32Array(n);
    let len = 0;
    for (let i = 0; i < n; i++) {
      this.px[i] = pts[i].x; this.py[i] = pts[i].y;
      this.hxs[i] = pts[i].x; this.hys[i] = pts[i].y;
      this.gN[i] = 1;
      if (i > 0) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    this.seg = len / (n - 1);
    this.len = len;
    this.seed = o.rng ? o.rng.range(0, 100) : Math.random() * 100;

    // wave acceleration that yields roughly waveAmp px of tip travel
    const w = TAU * V.waveHz;
    this.waveAcc = V.waveAmp * w * w;

    this.free = V.tipFree;       // how many nodes from the tip the floor has let go of
    this.tension = 0;
    this.phase = 'rest';         // rest | reel | stream | gone
    this.c = 0;                  // arc length already eaten at the mouth
    this.reelV = 0;
    this.reelT = 0;
    this.holdT = 0;              // how long the snag has been tightening
    this.justSnapped = false;
    this.stream = 0;             // ribbon: 0..1 how hard it is being streamed
    this.tugged = 0;
    this.handOffAt = Math.max(24, this.len - Math.min(this.len * 0.45, 240));
    this.prevTipS = 0;
    this._done = false;
    if (this.snag) this._locateSnag();
  }

  get type() { return this.variant || 'strand'; }

  _locateSnag() {
    let best = 1e9, bi = 0;
    for (let i = 0; i < this.n; i++) {
      const d = Math.hypot(this.hxs[i] - this.snag.x, this.hys[i] - this.snag.y);
      if (d < best) { best = d; bi = i; }
    }
    this.snag.arc = bi * this.seg;
    // no snag worth showing if the wrap sits at the very tip
    if (this.snag.arc < this.seg * 3) this.snag = null;
  }

  /** Move the whole strand (used by the scene to keep clear of the parked nozzle). */
  translate(dx, dy) {
    for (let i = 0; i < this.n; i++) {
      this.px[i] += dx; this.py[i] += dy;
      this.hxs[i] += dx; this.hys[i] += dy;
    }
    this.x += dx; this.y += dy; this.hx += dx; this.hy += dy;
    if (this.snag) { this.snag.x += dx; this.snag.y += dy; }
  }

  /** Arc length still lying on the floor. */
  get remainingLen() { return Math.max(0, this.len - this.c); }

  // ------------------------------------------------------------------ update

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;
    this.justSnapped = false;

    // 1. sample the airflow at EVERY node: that is the only input
    const n = this.n;
    let tipS = 0;
    for (let i = 0; i < n; i++) {
      const f = vac.field(this.px[i], this.py[i], F);
      this.sN[i] = f.strength;
      this.fxN[i] = f.fx; this.fyN[i] = f.fy;
      if (i === 0) { tipS = f.strength; this.tipCapture = f.inCapture; }
    }
    this.strength = tipS;
    this.x = this.px[0]; this.y = this.py[0];

    if (this.phase === 'rest') this._rest(dt, vac);
    else if (this.phase === 'reel') this._reel(dt, vac, world);
    else if (this.phase === 'stream') this._streaming(dt, vac);

    this._integrate(dt, vac);
    this._constrain();
    this._measure();
  }

  /** Floor grip: a release front that walks from the tip backwards, and back. */
  _rest(dt, vac) {
    const V = this.V;
    const front = Math.min(this.n - 1, Math.floor(this.free));
    const sf = this.sN[front];
    const s0 = this.sN[0];
    const thr = V.relThr;
    // the grip only lets go while the TIP itself is being hauled: that is what
    // makes this "taken from one end" instead of "lifted in the middle"
    if (s0 > thr && sf > thr * 0.45) {
      this.free += dt * V.relSpd * (0.35 + smoothstep(thr, thr * 3.2, s0));
    } else if (s0 < thr * 0.8 || sf < thr * 0.32) {
      // the nozzle backed off: the strand slips onto the floor again
      this.free -= dt * V.relSpd * 0.55;
    }
    const maxFree = this.anchored ? this.n - 2.4
      : V.tipFree + (this.n - V.tipFree) * 0.48;
    this.free = clamp(this.free, V.tipFree, maxFree);
    this.state = this.free > V.tipFree + 0.6 ? State.PULLED
      : this.sN[0] > 0.035 ? State.REACTING : State.IDLE;

    if (this.tipCapture) {
      if (this.anchored) { this.phase = 'stream'; this.state = State.PULLED; }
      else {
        this.phase = 'reel';
        this.state = State.CAPTURED;
        this.reelV = V.reelV0 * (this.clump > 1 ? 1.7 : 1);
        this.reelT = 0;
        vac.gulp = 1;
      }
    }
  }

  /** Reeled in at the mouth: an accelerating frontier eats the strand. */
  _reel(dt, vac, world) {
    const V = this.V;
    this.reelT += dt;
    this.free = this.n;

    let stalled = false;
    if (this.snag && this.snag.grip > 0) {
      const near = this.snag.arc - this.seg * 2.2;
      if (this.c >= near) {
        // the wrap has gone tight: hold, sing, then let go with a snap
        stalled = true;
        this.holdT += dt;
        this.snag.grip -= dt * 1.25;
        this.reelV += (60 - this.reelV) * (1 - Math.exp(-7 * dt));
        this.c = near + (1 - Math.max(0, this.snag.grip)) * this.seg * 1.6;
        if (this.snag.grip <= 0) {
          this.snapX = this.snag.x; this.snapY = this.snag.y;
          this.snag = null;
          this.reelV = V.reelV0 * 1.1 + 460;      // the snap
          this.justSnapped = true;
        }
      }
    }
    if (!stalled) {
      const acc = V.reelA * (this.clump > 1 ? 2.1 : 1);
      this.reelV += acc * dt;
      this.c += this.reelV * dt;
    }

    if (this.c >= this.handOffAt && !this._done) this._handToTube(vac, world);
  }

  /** Hand the remnant to the tube: it runs in head-first and coils in the cup. */
  _handToTube(vac, world) {
    const V = this.V;
    const start = Math.min(this.n - 2, Math.floor(this.c / this.seg));
    const pts = [];
    for (let i = start; i < this.n; i++) pts.push({ x: this.px[i], y: this.py[i] });
    this._done = true;
    this.state = State.TRANSIT;
    if (pts.length > 1) {
      vac.transit({
        kind: 'strand', points: pts, color: this.color,
        width: (V.transitW || this.width * 0.8) * (this.clump > 1 ? 1.7 : 1),
        size: V.coil * (this.clump > 1 ? 1.4 : 1),
      });
    } else {
      vac.transit({ kind: 'wisp', color: this.color, size: V.coil });
    }
    this.state = State.DONE;
    this.phase = 'gone';
    if (world && world.onCaptured) world.onCaptured(this);
  }

  /** Ribbon: the tip streams in the mouth for ever and tugs at its anchor. */
  _streaming(dt, vac) {
    this.free = clamp(this.free + dt * this.V.relSpd * 0.8, this.V.tipFree, this.n - 2.4);
    this.stream = clamp(this.stream + dt * 4.5, 0, 1);
    this.tugged = clamp(this.tugged + dt * 2.2, 0, 1);
    // the knot always wins: pull too far and the tip is torn out of the mouth
    const m = vac.mouth();
    const reach = Math.hypot(this.px[0] - m.x, this.py[0] - m.y);
    this.slipT = reach > 30 ? (this.slipT || 0) + dt : 0;
    if (this.slipT > 0.3 || (!this.tipCapture && this.sN[0] < this.V.relThr * 0.75)) {
      this.phase = 'rest';
      this.slipT = 0;
      if (reach > 30) {
        // it lets go with a flick: the whole band shivers back
        for (let i = 0; i < this.n; i++) {
          this.vx[i] -= this.fxN[i] * 260;
          this.vy[i] -= this.fyN[i] * 260;
        }
        this.tugged = 1;
      }
    }
  }

  // --------------------------------------------------------------- integrate

  _integrate(dt, vac) {
    const V = this.V;
    const n = this.n;
    const reeling = this.phase === 'reel';
    const m = vac.mouth();
    const frontier = reeling ? this.c / this.seg : -1;
    const tailPull = reeling ? clamp(1 - this.remainingLen / 140, 0, 1) : 0;

    if (this.phase === 'stream') this.stream = clamp(this.stream - dt * 0.6, 0, 1);
    else if (this.phase === 'rest') {
      this.stream = clamp(this.stream - dt * 2.2, 0, 1);
      this.tugged = clamp(this.tugged - dt * 1.4, 0, 1);
    }

    for (let i = 0; i < n; i++) {
      // grip: 0 = the floor has let go, 1 = still pinned where it lay
      let g;
      if (reeling) g = 0;
      else g = smoothstep(this.free - 0.4, this.free + 1.4, i);
      if (this.anchored && i >= n - 2) g = 1;
      this.gN[i] = g;

      if (reeling && i <= frontier) {   // already eaten
        this.px[i] = m.x; this.py[i] = m.y; this.vx[i] = 0; this.vy[i] = 0;
        this.lift[i] = 0;
        continue;
      }
      if (reeling && i < frontier + 1) {
        // the node at the mouth is held exactly there: this is what drags the rest
        this.px[i] = m.x; this.py[i] = m.y; this.vx[i] = 0; this.vy[i] = 0;
        this.lift[i] = 1;
        continue;
      }

      const free = 1 - g;
      let ax = this.fxN[i] * V.pull * free;
      let ay = this.fyN[i] * V.pull * free;

      // travelling wave on the last few segments: only the tip dances
      const taper = Math.exp(-i / V.waveTaper);
      const wS = smoothstep(0.02, 0.45, this.sN[i]) * free * taper;
      if (wS > 0.001) {
        const ph = this.t * TAU * V.waveHz - i * 0.55 + this.seed;
        const a = Math.sin(ph) * this.waveAcc * wS;
        const fl = Math.hypot(this.fxN[i], this.fyN[i]) || 1;
        ax += (-this.fyN[i] / fl) * a;
        ay += (this.fxN[i] / fl) * a;
        ax += noise1(this.t * 19 + i * 3.1 + this.seed) * this.waveAcc * 0.20 * wS;
        ay += noise1(this.t * 19 + i * 3.1 + this.seed + 41) * this.waveAcc * 0.20 * wS;
      }

      // a taut line sings: a fast, small, visible shiver along the freed part
      if (this.tension > 0.84 && !reeling && free > 0.15) {
        const k = free * smoothstep(0.84, 0.98, this.tension) * smoothstep(0.1, 0.6, this.sN[i]);
        const fl = Math.hypot(this.fxN[i], this.fyN[i]) || 1;
        const ph = this.t * TAU * 13 - i * 1.9 + this.seed;
        ax += (-this.fyN[i] / fl) * Math.sin(ph) * 2600 * k;
        ay += (this.fxN[i] / fl) * Math.sin(ph) * 2600 * k;
      }

      // ribbon streaming in the mouth: it flutters hard and rattles
      if (this.stream > 0.01) {
        const k = this.stream * Math.exp(-i / 5.0);
        const ph = this.t * TAU * 7.5 - i * 0.9 + this.seed;
        const fl = Math.hypot(this.fxN[i], this.fyN[i]) || 1;
        ax += (-this.fyN[i] / fl) * Math.sin(ph) * 5200 * k;
        ay += (this.fxN[i] / fl) * Math.sin(ph) * 5200 * k;
      }

      // reeling: everything is hauled toward the mouth, the tail lags and whips
      if (reeling) {
        let dx = m.x - this.px[i], dy = m.y - this.py[i];
        const d = Math.hypot(dx, dy) || 1;
        const k = 1 + tailPull * 2.2;
        ax += (dx / d) * 260 * k;
        ay += (dy / d) * 260 * k;
        if (tailPull > 0.05) {
          const ph = this.t * 36 + i * 1.3 + this.seed;
          ax += Math.sin(ph) * 900 * tailPull;
          ay += Math.cos(ph * 1.13) * 900 * tailPull;
        }
      }

      // the floor grip is a spring back to where the strand was lying
      if (g > 0.002) {
        const om = 26 * g;
        ax += -om * om * (this.px[i] - this.hxs[i]) - 2 * om * this.vx[i];
        ay += -om * om * (this.py[i] - this.hys[i]) - 2 * om * this.vy[i];
      }

      this.vx[i] += ax * dt;
      this.vy[i] += ay * dt;
      const dr = Math.exp(-V.drag * (0.55 + 0.75 * g) * dt);
      this.vx[i] *= dr; this.vy[i] *= dr;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;

      // how far off the floor this bit of the strand is (drawn as a shadow gap)
      const want = free * smoothstep(0.05, 0.8, this.sN[i]);
      this.lift[i] += (want - this.lift[i]) * (1 - Math.exp(-9 * dt));
    }
  }

  /** Inextensible rope + the prop it is wrapped around. */
  _constrain() {
    const n = this.n, seg = this.seg;
    const reeling = this.phase === 'reel';
    const frontier = reeling ? this.c / this.seg : -1;
    for (let it = 0; it < 5; it++) {
      for (let i = 0; i < n - 1; i++) {
        const j = i + 1;
        let wa = (1 - this.gN[i]) * 0.96 + 0.04, wb = (1 - this.gN[j]) * 0.96 + 0.04;
        if (reeling && i <= frontier + 1) wa = 0;
        if (reeling && j <= frontier + 1) wb = 0;
        const sum = wa + wb;
        if (sum < 1e-4) continue;
        const dx = this.px[j] - this.px[i], dy = this.py[j] - this.py[i];
        const d = Math.hypot(dx, dy) || 1e-4;
        const diff = (d - seg) / d;
        const kx = dx * diff, ky = dy * diff;
        this.px[i] += kx * (wa / sum); this.py[i] += ky * (wa / sum);
        this.px[j] -= kx * (wb / sum); this.py[j] -= ky * (wb / sum);
      }
      if (this.snag) {
        const s = this.snag;
        for (let i = 0; i < n; i++) {
          if (reeling && i <= frontier + 1) continue;
          const dx = this.px[i] - s.x, dy = this.py[i] - s.y;
          const d = Math.hypot(dx, dy);
          if (d < s.r && d > 1e-4) {
            this.px[i] = s.x + (dx / d) * s.r;
            this.py[i] = s.y + (dy / d) * s.r;
          }
        }
      }
    }
    this.x = this.px[0]; this.y = this.py[0];
  }

  /** Tautness of the freed part: 1 = a dead straight line from the mouth. */
  /**
   * How taut the freed part is: 1 means a dead straight line running from the
   * far end of the freed span all the way into the mouth. This is the number
   * that says "it is pulling, and it is about to win".
   */
  _measure() {
    let start = 0, end;
    if (this.phase === 'reel') {
      start = clamp(Math.floor(this.c / this.seg) + 1, 0, this.n - 2);
      // only the part that is actually being hauled goes taut; measuring to the
      // far tail would report slack that the player cannot see
      const reach = this.snag ? Math.floor(this.snag.arc / this.seg) : start + 7;
      end = clamp(Math.max(start + 2, reach), 2, this.n - 1);
    } else {
      end = clamp(Math.round(this.free), 3, this.n - 1);
    }
    const arc = Math.max(1e-3, (end - start) * this.seg);
    const chord = Math.hypot(this.px[end] - this.px[start], this.py[end] - this.py[start]);
    const t = clamp(chord / arc, 0, 1);
    this.tension = this.tension + (t - this.tension) * 0.25;
  }

  // -------------------------------------------------------------------- draw

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    const n = this.n;
    const reeling = this.phase === 'reel';
    const from = reeling ? clamp(Math.floor(this.c / this.seg), 0, n - 2) : 0;
    if (n - from < 2) return;

    const taut = smoothstep(0.86, 0.995, this.tension) * (this.free > 3 ? 1 : 0);
    if (this.variant === 'ribbon') { this._drawRibbon(ctx, from, taut); return; }

    const copies = this.clump;
    // contact shadow first: the lifted tip separates from it, which is how a
    // top-down view says "this end is off the floor"
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let c = 0; c < copies; c++) {
      this._path(ctx, from, c, 1);
      ctx.strokeStyle = this.V.edge;
      ctx.lineWidth = this.width + 2.0;
      ctx.stroke();
    }
    for (let c = 0; c < copies; c++) {
      if (this.variant === 'yarn') {
        this._path(ctx, from, c, 0);
        ctx.strokeStyle = 'rgba(175,196,255,0.34)';
        ctx.lineWidth = this.width * 1.9;
        ctx.stroke();
      }
      this._path(ctx, from, c, 0);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.width;
      ctx.stroke();
      // sheen along the top edge; brighter when the line is singing tight
      this._path(ctx, from, c, 0);
      ctx.strokeStyle = this.lightColor;
      ctx.globalAlpha = 0.34 + 0.55 * taut;
      ctx.lineWidth = this.width * (0.32 + 0.16 * taut);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (this.variant === 'yarn') this._drawFuzz(ctx, from);
    this._drawTip(ctx, from, reeling);
  }

  /** copy: which hair of a clump. shadow: draw the on-floor shadow offset. */
  _path(ctx, from, copy, shadow) {
    const n = this.n;
    ctx.beginPath();
    const off = copy === 0 ? 0 : (copy % 2 === 0 ? 1 : -1) * (1.6 + copy * 1.4);
    let prevX = 0, prevY = 0;
    for (let i = from; i < n; i++) {
      let x = this.px[i], y = this.py[i];
      if (off !== 0) {
        const a = i < n - 1 ? Math.atan2(this.py[i + 1] - y, this.px[i + 1] - x)
          : Math.atan2(y - this.py[i - 1], x - this.px[i - 1]);
        const w = off * (0.6 + 0.5 * Math.sin(i * 0.8 + copy * 2.1 + this.t * 1.7 + this.seed));
        x += -Math.sin(a) * w; y += Math.cos(a) * w;
      }
      const l = this.lift[i];
      if (shadow) { x += 2.2 + l * 6.5; y += 3.0 + l * 8.0; }
      else { y -= l * 3.6; }
      if (i === from) ctx.moveTo(x, y);
      else {
        // midpoint smoothing so a 13px segment chain still reads as a thread
        ctx.quadraticCurveTo(prevX, prevY, (prevX + x) * 0.5, (prevY + y) * 0.5);
      }
      prevX = x; prevY = y;
    }
    ctx.lineTo(prevX, prevY);
  }

  _drawFuzz(ctx, from) {
    ctx.strokeStyle = 'rgba(206,218,255,0.45)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let i = from; i < this.n - 1; i++) {
      if ((i & 1) === 0) continue;
      const x = this.px[i], y = this.py[i] - this.lift[i] * 3.6;
      const a = Math.atan2(this.py[i + 1] - this.py[i], this.px[i + 1] - this.px[i]);
      const sway = Math.sin(this.t * 5 + i * 1.7 + this.seed) * (1 + this.sN[i] * 5);
      for (let k = -1; k <= 1; k += 2) {
        const l = this.width * (0.52 + 0.34 * noise1(i * 2.3 + k + this.seed));
        ctx.moveTo(x, y);
        ctx.lineTo(x + (-Math.sin(a) * k * l) + sway * 0.4, y + (Math.cos(a) * k * l) + sway * 0.2);
      }
    }
    ctx.stroke();
  }

  /** The free end: a tiny bulb so the eye knows WHICH end goes in first. */
  _drawTip(ctx, from, reeling) {
    if (reeling) return;
    const x = this.px[from], y = this.py[from] - this.lift[from] * 3.6;
    const s = smoothstep(0.02, 0.6, this.sN[from]);
    ctx.fillStyle = this.lightColor;
    ctx.globalAlpha = 0.55 + 0.45 * s;
    ctx.beginPath();
    ctx.arc(x, y, this.width * (0.55 + 0.35 * s), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawRibbon(ctx, from, taut) {
    const n = this.n;
    const w = this.width;
    // A satin band cannot be drawn from node positions alone: once the air has
    // pulled it straight the rope is rigid, and a rigid ribbon looks dead. The
    // ripple below is a DISPLAY wave travelling from the anchor into the mouth,
    // driven by how hard the strand is being streamed, so the band keeps
    // fluttering exactly while the air is running along it.
    const rip = 3 + 9 * this.stream;
    const hz = 2.2 + 5.6 * this.stream;
    const rx = this._rx || (this._rx = []);
    const ry = this._ry || (this._ry = []);
    for (let i = 0; i < n; i++) {
      const i0 = clamp(i, 0, n - 2);
      const a = Math.atan2(this.py[i0 + 1] - this.py[i0], this.px[i0 + 1] - this.px[i0]);
      const edge = smoothstep(0, 3.2, i - from) * smoothstep(0, 2.4, n - 1 - i);
      const k = Math.sin(this.t * TAU * hz - i * 1.15 + this.seed) * rip * edge;
      rx[i] = this.px[i] - Math.sin(a) * k;
      ry[i] = this.py[i] + Math.cos(a) * k - this.lift[i] * 3.6;
      if (i === n - 1) { rx[i] = this.px[i]; ry[i] = this.py[i]; }
    }
    // soft shadow on the floor, so the band reads as cloth above the boards
    ctx.save();
    ctx.strokeStyle = 'rgba(60,30,20,0.16)';
    ctx.lineWidth = w * 0.9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = from; i < n; i++) {
      if (i === from) ctx.moveTo(rx[i] + 3, ry[i] + 5); else ctx.lineTo(rx[i] + 3, ry[i] + 5);
    }
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    for (let side = 0; side < 2; side++) {
      for (let k = 0; k < n - from; k++) {
        const i = side === 0 ? from + k : n - 1 - k;
        const i0 = clamp(i, from, n - 2);
        const a = Math.atan2(ry[i0 + 1] - ry[i0], rx[i0 + 1] - rx[i0]);
        // the band narrows where it is pulled taut and widens where it billows
        const taperTip = 0.5 + 0.5 * smoothstep(0, 4, i - from);
        const billow = 0.82 + 0.34 * Math.sin(i * 0.9 - this.t * TAU * hz * 0.75 + this.seed);
        const hw = w * 0.5 * taperTip * (1 - 0.26 * taut) * billow;
        const sgn = side === 0 ? 1 : -1;
        const x = rx[i] - Math.sin(a) * hw * sgn;
        const y = ry[i] + Math.cos(a) * hw * sgn;
        if (side === 0 && k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.strokeStyle = this.V.edge; ctx.lineWidth = 1.4; ctx.stroke();

    // candy stripes, which make the streaming motion legible
    ctx.strokeStyle = '#fff4f2';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    for (let i = from + 1; i < n - 1; i += 2) {
      const a = Math.atan2(ry[i + 1] - ry[i], rx[i + 1] - rx[i]);
      const hw = w * 0.4 * (0.5 + 0.5 * smoothstep(0, 4, i - from));
      ctx.moveTo(rx[i] - Math.sin(a) * hw, ry[i] + Math.cos(a) * hw);
      ctx.lineTo(rx[i] + Math.sin(a) * hw, ry[i] - Math.cos(a) * hw);
    }
    ctx.stroke();

    // the air itself: streaks running along the ribbon into the mouth
    if (this.stream > 0.02) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let k = 0; k < 7; k++) {
        const u = (this.t * 2.2 + k / 7) % 1;
        const fi = from + (1 - u) * (n - 1 - from) * 0.9;
        const i = clamp(Math.floor(fi), from, n - 2);
        const fr = fi - i;
        const x = rx[i] + (rx[i + 1] - rx[i]) * fr;
        const y = ry[i] + (ry[i + 1] - ry[i]) * fr;
        const a = Math.atan2(ry[i + 1] - ry[i], rx[i + 1] - rx[i]);
        const l = 11 * this.stream;
        ctx.globalAlpha = this.stream * (0.2 + 0.8 * Math.sin(u * Math.PI));
        ctx.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l);
        ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  snapshot() {
    const s = super.snapshot();
    s.phase = this.phase;
    s.free = +this.free.toFixed(2);
    s.tens = +this.tension.toFixed(3);
    s.c = Math.round(this.c);
    s.len = Math.round(this.len);
    s.reel = +this.reelT.toFixed(2);
    s.rv = Math.round(this.reelV);
    s.lift = +this.lift[0].toFixed(2);
    if (this.snag) s.snag = +this.snag.grip.toFixed(2);
    if (this.variant === 'ribbon') s.stream = +this.stream.toFixed(2);
    return s;
  }
}
