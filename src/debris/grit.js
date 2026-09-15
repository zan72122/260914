import { Debris, State } from './base.js';
import { smoothstep, TAU, noise1 } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

const STATIC_THRESHOLD = 0.26;  // grit is lighter than a crumb: it goes earlier
const ACC = 1500;               // and then it really accelerates
const KINETIC = 1.5;            // almost nothing holds it back on bare concrete
const RESTICK = 0.07;
const CUP_BATCH = 3;            // grains per deposit in the cup

/**
 * The loose grit walked in from the doorway: hundreds of little clumps of sand
 * on bare concrete, held as ONE debris object so a whole trail costs one update
 * and one draw call's worth of state.
 *
 * Each clump samples the airflow itself: it buzzes in place as the flow builds,
 * then breaks free and skitters, accelerating the whole way in. Passing the
 * nozzle over the trail is meant to feel like dragging a magnet over iron dust.
 */
export class GritTrail extends Debris {
  constructor(rng, opts = {}) {
    super(0, 0);
    this.rng = rng;
    this.g = [];
    this.left = 0;
    this._cup = 0;
    this._peak = 0;
    this.color = opts.color || '#e3cb98';
  }
  get type() { return 'grit'; }
  translate(dx, dy) {
    super.translate(dx, dy);
    for (let i = 0; i < this.g.length; i++) {
      const p = this.g[i];
      p.x += dx; p.y += dy; p.hx += dx; p.hy += dy;
    }
  }
  /**
   * A trail has no single position: aim at one live grain (the one nearest the
   * trail's centre of mass), so the harness sweeps the trail instead of hovering
   * over an average of it.
   */
  aim(out) {
    out = out || { x: 0, y: 0 };
    let best = null, bd = 1e9;
    for (let i = 0; i < this.g.length; i++) {
      const p = this.g[i];
      if (!p.on) continue;
      const d = (p.x - this.x) * (p.x - this.x) + (p.y - this.y) * (p.y - this.y);
      if (d < bd) { bd = d; best = p; }
    }
    out.x = best ? best.x : this.x; out.y = best ? best.y : this.y;
    return out;
  }

  /** Add one clump of grit at a world point. */
  add(x, y) {
    const rng = this.rng;
    const n = rng.int(3, 4);
    const sp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, TAU), d = rng.range(1.4, 4.0);
      sp[i * 3] = Math.cos(a) * d;
      sp[i * 3 + 1] = Math.sin(a) * d * 0.85;
      sp[i * 3 + 2] = rng.range(1.4, 2.3);
    }
    this.g.push({
      on: 1, x, y, hx: x, hy: y, vx: 0, vy: 0, slide: 0,
      sh: 0, rot: rng.range(0, TAU), spin: 0, seed: rng.range(0, 90),
      sp, c: rng.next() < 0.5 ? '#dcc188' : '#b89a63',
    });
    this.left++;
    this._center();
    return this;
  }

  _center() {
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < this.g.length; i++) {
      const p = this.g[i];
      if (!p.on) continue;
      sx += p.x; sy += p.y; n++;
    }
    if (n) { this.x = sx / n; this.y = sy / n; }
  }

  update(dt, vac, world) {
    if (this.state === State.DONE) {
      for (let i = 0; i < this.g.length; i++) this.g[i].on = 0;
      return;
    }
    this.t += dt;
    const list = this.g;
    let peak = 0, moving = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.on) continue;
      const f = vac.field(p.x, p.y, TMPF);
      const s = f.strength;
      if (s > peak) peak = s;
      if (!p.slide) {
        // stiction: it buzzes, harder and harder, and stays put
        p.sh += (smoothstep(0.03, STATIC_THRESHOLD, s) - p.sh) * (1 - Math.exp(-16 * dt));
        p.rot += noise1(this.t * 33 + p.seed) * p.sh * 5.5 * dt;
        if (s > STATIC_THRESHOLD) {
          p.slide = 1;
          p.vx = f.fx * 46; p.vy = f.fy * 46;
          p.spin = (this.rng.next() - 0.5) * 14;
        }
      } else {
        p.vx += f.fx * ACC * dt;
        p.vy += f.fy * ACC * dt;
        const d = Math.exp(-KINETIC * dt);
        p.vx *= d; p.vy *= d;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const spd = Math.hypot(p.vx, p.vy);
        p.spin += (spd * 0.02 - p.spin) * (1 - Math.exp(-5 * dt));
        p.rot += p.spin * dt;
        if (spd > 30) moving++;
        if (s < RESTICK && spd < 12) { p.slide = 0; p.vx = 0; p.vy = 0; p.hx = p.x; p.hy = p.y; }
      }
      if (f.inCapture) {
        p.on = 0; this.left--; this._cup++;
        if (this._cup >= CUP_BATCH) {
          this._cup = 0;
          vac.transit({ kind: 'crumb', color: p.c, size: 4.6 });
        }
      }
    }
    this._peak = peak;
    this.strength = peak;
    this.state = this.left <= 0 ? State.DONE
      : moving > 0 ? State.PULLED
      : peak > 0.05 ? State.REACTING : State.IDLE;
    if (this.state === State.DONE) {
      world && world.onCaptured && world.onCaptured(this);
    } else if ((this.t * 4 | 0) !== this._ct) { this._ct = this.t * 4 | 0; this._center(); }
  }

  draw(ctx, cam) {
    const list = this.g;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.on) continue;
      const spd = p.slide ? Math.hypot(p.vx, p.vy) : 0;
      if (spd > 130) {
        ctx.strokeStyle = 'rgba(240,228,198,0.42)';
        ctx.lineWidth = 3.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.024, p.y - p.vy * 0.024);
        ctx.stroke();
      }
      const jx = p.sh * noise1(this.t * 36 + p.seed) * 1.5;
      const jy = p.sh * noise1(this.t * 36 + p.seed + 7) * 1.5;
      ctx.save();
      ctx.translate(p.x + jx, p.y + jy);
      ctx.rotate(p.rot);
      const sp = p.sp;
      // dark bed first: grit has to read against grey concrete
      ctx.fillStyle = 'rgba(52,40,24,0.42)';
      for (let k = 0; k < sp.length; k += 3) {
        ctx.beginPath();
        ctx.ellipse(sp[k] + 0.9, sp[k + 1] + 1.2, sp[k + 2] * 1.15, sp[k + 2] * 0.9, 0, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = p.c;
      for (let k = 0; k < sp.length; k += 3) {
        ctx.beginPath();
        ctx.ellipse(sp[k], sp[k + 1], sp[k + 2] * 1.1, sp[k + 2] * 0.82, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  snapshot() {
    const s = super.snapshot();
    s.left = this.left;
    return s;
  }
}
