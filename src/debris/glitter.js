import { Debris, State } from './base.js';
import { clamp, smoothstep, TAU, noise1 } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

const G_LIFT = 0.16;      // strength at which sequins start lifting off the pile
const G_FREE = 0.36;      // strength at which one lets go
const G_ACC = 1150;
const G_SWIRL = 980;      // tangential push: they do not fly straight, they spiral

const SEQUIN_COLORS = ['#ff6fb5', '#ffd34d', '#5fe0ff', '#b98bff', '#fff3b0', '#7dffc2'];

/**
 * A scatter of glitter / sequins, buried in the pile until it is combed out.
 *
 * Motion law of its own: each sequin is a flat disc, so it catches the air on
 * its face. It twinkles, rocks on edge, then LIFTS (its shadow separates from
 * it), gets caught side-on and SPIRALS into the mouth instead of falling
 * straight in — many small sparks curling in one after another.
 */
export class GlitterPatch extends Debris {
  constructor(x, y, rng, n = 13, spread = 26) {
    super(x, y);
    this.rng = rng;
    this.n = n;
    this.bits = [];
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, TAU);
      const d = Math.sqrt(rng.next()) * spread;
      const bx = x + Math.cos(a) * d, by = y + Math.sin(a) * d * 0.8;
      this.bits.push({
        x: bx, y: by, hx: bx, hy: by, vx: 0, vy: 0,
        r: rng.range(4.6, 6.2),
        rot: rng.range(0, TAU), spin: 0,
        col: rng.pick(SEQUIN_COLORS),
        ph: rng.range(0, TAU),
        lift: 0, free: false, gone: false,
        sw: rng.sign() * rng.range(0.7, 1.3),
        shape: rng.next() < 0.45 ? 1 : 0,
      });
    }
    this.left = n;
    this.sparks = [];
    for (let i = 0; i < 12; i++) this.sparks.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, col: '#fff' });
    this.seed = rng.range(0, 100);
  }
  get type() { return 'glitter'; }
  translate(dx, dy) {
    super.translate(dx, dy);
    for (let i = 0; i < this.bits.length; i++) {
      const b = this.bits[i];
      b.x += dx; b.y += dy;
      if (b.hx !== undefined) { b.hx += dx; b.hy += dy; }
    }
  }
  aim(out) {
    out = out || { x: 0, y: 0 };
    for (let i = 0; i < this.bits.length; i++) {
      const b = this.bits[i];
      if (b.gone) continue;
      out.x = b.x; out.y = b.y; return out;
    }
    out.x = this.x; out.y = this.y; return out;
  }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;
    let maxS = 0, cx = 0, cy = 0, live = 0;
    for (let i = 0; i < this.bits.length; i++) {
      const b = this.bits[i];
      if (b.gone) continue;
      live++;
      const f = vac.field(b.x, b.y, TMPF);
      const s = f.strength;
      if (s > maxS) maxS = s;
      b.ph += dt * (6 + s * 22);

      if (!b.free) {
        // rock on edge, then lift: the shadow separating is the tell
        const lift = smoothstep(G_LIFT, G_FREE, s);
        b.lift += (lift - b.lift) * (1 - Math.exp(-12 * dt));
        b.spin += (noise1(this.t * 7 + b.ph) * 9 * (0.2 + b.lift) - b.spin) * (1 - Math.exp(-9 * dt));
        b.rot += b.spin * dt;
        const jx = noise1(this.t * 21 + b.ph) * b.lift * 2.2;
        const jy = noise1(this.t * 21 + b.ph + 13) * b.lift * 2.2;
        const tx = b.hx + f.fx * 26 + jx, ty = b.hy + f.fy * 26 + jy - b.lift * 3;
        const o = 19;
        b.vx += (-2 * o * b.vx - o * o * (b.x - tx)) * dt;
        b.vy += (-2 * o * b.vy - o * o * (b.y - ty)) * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (s > G_FREE) {
          b.free = true;
          // kick sideways first: that is what starts the spiral
          b.vx = f.fx * 55 - f.fy * 90 * b.sw;
          b.vy = f.fy * 55 + f.fx * 90 * b.sw;
          b.spin = b.sw * 16;
        }
      } else {
        const fl = Math.hypot(f.fx, f.fy) || 1;
        const swirl = G_SWIRL * clamp(s, 0, 1.4) * b.sw;
        b.vx += (f.fx * G_ACC - (f.fy / fl) * swirl) * dt;
        b.vy += (f.fy * G_ACC + (f.fx / fl) * swirl) * dt;
        const d = Math.exp(-2.6 * dt);
        b.vx *= d; b.vy *= d;
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.rot += b.spin * dt;
        b.spin += (b.sw * 22 - b.spin) * (1 - Math.exp(-3 * dt));
        b.lift = 1;
        if (f.inCapture) {
          b.gone = true;
          this.left--;
          this._spark(b);
          vac.transit({ kind: 'crumb', color: b.col, size: b.r * 1.9 });
          if (this.left <= 0) {
            this.state = State.DONE;
            world && world.onCaptured && world.onCaptured(this);
          }
        }
      }
      cx += b.x; cy += b.y;
    }
    if (live > 0) { this.x = cx / live; this.y = cy / live; }
    this.strength = maxS;
    if (this.state !== State.DONE) {
      this.state = maxS > G_FREE ? State.PULLED : maxS > 0.05 ? State.REACTING : State.IDLE;
    }
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (s.life <= 0) continue;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= 0.9; s.vy *= 0.9;
      s.life -= dt * 2.6;
    }
  }

  _spark(b) {
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (s.life > 0) continue;
      s.x = b.x; s.y = b.y; s.col = b.col; s.life = 1;
      s.vx = this.rng.range(-90, 90); s.vy = this.rng.range(-90, 90);
      break;
    }
  }

  draw(ctx) {
    if (this.state === State.DONE) return;
    ctx.save();
    for (let i = 0; i < this.bits.length; i++) {
      const b = this.bits[i];
      if (b.gone) continue;
      // shadow stays on the pile: the gap under a lifted sequin is the anticipation
      if (b.lift > 0.02) {
        ctx.fillStyle = 'rgba(40,28,14,' + (0.3 * (1 - b.lift * 0.45)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.ellipse(b.x + b.lift * 2.4, b.y + 2 + b.lift * 4, b.r * 0.9, b.r * 0.55, 0, 0, TAU);
        ctx.fill();
      }
      const tw = 0.55 + 0.45 * Math.sin(b.ph);
      ctx.save();
      ctx.translate(b.x, b.y - b.lift * 4.5);
      ctx.rotate(b.rot);
      // the disc turns edge-on as it rocks: squash across one axis
      ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(b.rot * 0.9)));
      ctx.fillStyle = b.col;
      ctx.beginPath();
      if (b.shape) {
        ctx.moveTo(0, -b.r); ctx.lineTo(b.r, 0); ctx.lineTo(0, b.r); ctx.lineTo(-b.r, 0);
        ctx.closePath();
      } else {
        ctx.arc(0, 0, b.r, 0, TAU);
      }
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + tw * 0.5).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(-b.r * 0.22, -b.r * 0.25, b.r * 0.45, b.r * 0.3, -0.5, 0, TAU); ctx.fill();
      ctx.restore();
      // glint: a four point star when the twinkle peaks
      if (tw > 0.72) {
        const g = (tw - 0.72) / 0.28;
        const L = b.r * (1.6 + g * 2.4);
        ctx.strokeStyle = 'rgba(255,255,255,' + (g * 0.9).toFixed(3) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(b.x - L, b.y - b.lift * 4.5); ctx.lineTo(b.x + L, b.y - b.lift * 4.5);
        ctx.moveTo(b.x, b.y - b.lift * 4.5 - L * 0.8); ctx.lineTo(b.x, b.y - b.lift * 4.5 + L * 0.8);
        ctx.stroke();
      }
      // motion streak while spiralling in
      const sp = Math.hypot(b.vx, b.vy);
      if (b.free && sp > 120) {
        ctx.strokeStyle = b.col;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = b.r * 0.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.x, b.y - b.lift * 4.5);
        ctx.lineTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03 - b.lift * 4.5);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (s.life <= 0) continue;
      ctx.globalAlpha = clamp(s.life, 0, 1);
      ctx.fillStyle = s.col;
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.6 + s.life * 1.6, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  snapshot() {
    const s = super.snapshot();
    s.left = this.left;
    s.lift = +(this.bits.reduce((a, b) => Math.max(a, b.gone ? 0 : b.lift), 0)).toFixed(2);
    return s;
  }
}

// ---------------------------------------------------------------- beads

const B_FREE = 0.74;   // heavy little things, bedded into the pile
const B_ACC = 1050;

/**
 * A little pile of plastic beads. They are heavy for their size and perfectly
 * round, so before anything moves they RATTLE: each one buzzes in its dent in
 * the pile and knocks its neighbours, harder and harder, until one after
 * another pops out and rolls in fast.
 */
export class BeadPile extends Debris {
  constructor(x, y, rng, n = 8, spread = 20) {
    super(x, y);
    this.rng = rng;
    this.beads = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng.range(-0.3, 0.3);
      const d = Math.sqrt(rng.next()) * spread;
      const bx = x + Math.cos(a) * d, by = y + Math.sin(a) * d * 0.75;
      this.beads.push({
        x: bx, y: by, hx: bx, hy: by, vx: 0, vy: 0,
        r: rng.range(5.0, 6.4),
        col: rng.pick(['#ff8fb1', '#8ad7ff', '#ffe27a', '#b6f59b', '#e0a8ff']),
        ph: rng.range(0, TAU), rattle: 0, free: false, gone: false,
        roll: 0, hop: 0,
      });
    }
    this.left = n;
    this.left0 = n;
    this._tick = 0;
  }
  get type() { return 'beads'; }
  translate(dx, dy) {
    super.translate(dx, dy);
    for (let i = 0; i < this.beads.length; i++) {
      const b = this.beads[i];
      b.x += dx; b.y += dy;
      if (b.hx !== undefined) { b.hx += dx; b.hy += dy; }
    }
  }
  aim(out) {
    out = out || { x: 0, y: 0 };
    for (let i = 0; i < this.beads.length; i++) {
      const b = this.beads[i];
      if (b.gone) continue;
      out.x = b.x; out.y = b.y; return out;
    }
    out.x = this.x; out.y = this.y; return out;
  }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;
    let maxS = 0, live = 0, cx = 0, cy = 0;
    const bs = this.beads;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.gone) continue;
      live++;
      const f = vac.field(b.x, b.y, TMPF);
      const s = f.strength;
      if (s > maxS) maxS = s;

      if (!b.free) {
        const target = smoothstep(0.05, B_FREE, s);
        b.rattle += (target - b.rattle) * (1 - Math.exp(-13 * dt));
        b.ph += dt * (22 + 52 * b.rattle);
        const amp = b.rattle * 3.4;
        const tx = b.hx + f.fx * 20 + noise1(b.ph) * amp;
        const ty = b.hy + f.fy * 20 + noise1(b.ph + 31) * amp;
        const o = 26;
        b.vx += (-2 * o * b.vx - o * o * (b.x - tx)) * dt;
        b.vy += (-2 * o * b.vy - o * o * (b.y - ty)) * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.hop = Math.max(0, b.hop - dt * 5) + (b.rattle > 0.45 && Math.sin(b.ph * 0.5) > 0.93 ? 1 : 0);
        if (s > B_FREE) {
          b.free = true;
          b.vx = f.fx * 60; b.vy = f.fy * 60;
          b.hop = 1;
        }
      } else {
        b.vx += f.fx * B_ACC * dt;
        b.vy += f.fy * B_ACC * dt;
        const d = Math.exp(-2.0 * dt);
        b.vx *= d; b.vy *= d;
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.roll += Math.hypot(b.vx, b.vy) * dt / b.r;
        b.hop = Math.max(0, b.hop - dt * 3.4);
        if (f.inCapture) {
          b.gone = true;
          this.left--;
          vac.transit({ kind: 'crumb', color: b.col, size: b.r * 2.2 });
          if (this.left <= 0) {
            this.state = State.DONE;
            world && world.onCaptured && world.onCaptured(this);
          }
        }
      }
      cx += b.x; cy += b.y;
    }
    // they knock each other: that is the rattle
    this._tick -= dt;
    let knocked = false;
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      if (a.gone) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j];
        if (b.gone) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 > rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (rr - d) * 0.5;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < -18) {
          const imp = rel * 0.5;
          a.vx += nx * imp; a.vy += ny * imp;
          b.vx -= nx * imp; b.vy -= ny * imp;
          knocked = true;
        }
      }
    }
    if (knocked && this._tick <= 0 && maxS > 0.12 && world && world.audio) {
      this._tick = 0.09;
      world.audio.pop('tick', 0.22 + maxS * 0.2);
    }
    if (live > 0) { this.x = cx / live; this.y = cy / live; }
    this.strength = maxS;
    if (this.state !== State.DONE) {
      this.state = maxS > B_FREE ? State.PULLED : maxS > 0.05 ? State.REACTING : State.IDLE;
    }
  }

  draw(ctx) {
    if (this.state === State.DONE) return;
    const bs = this.beads;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.gone) continue;
      const hop = clamp(b.hop, 0, 1);
      ctx.fillStyle = 'rgba(40,28,14,' + (0.28 * (1 - hop * 0.4)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(b.x + 1 + hop * 2, b.y + b.r * 0.55 + hop * 3, b.r * 0.95, b.r * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(b.x, b.y - hop * 4);
      ctx.fillStyle = b.col;
      ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill();
      // hole through the middle + a rolling highlight so the roll reads
      ctx.rotate(b.roll);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.ellipse(-b.r * 0.3, -b.r * 0.34, b.r * 0.3, b.r * 0.2, -0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(60,40,30,0.45)';
      ctx.beginPath(); ctx.ellipse(0, 0, b.r * 0.26, b.r * 0.2, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  snapshot() {
    const s = super.snapshot();
    s.left = this.left;
    s.rattle = +(this.beads.reduce((a, b) => Math.max(a, b.gone ? 0 : b.rattle), 0)).toFixed(2);
    return s;
  }
}
