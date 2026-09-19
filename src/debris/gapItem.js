import { Debris, State } from './base.js';
import { clamp, smoothstep, TAU, noise1 } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

/**
 * A thing that fell down the gap between the bookshelf and the wall.
 *
 * The gap is one item wide, so the queue is the mechanic: everything in there
 * can feel the air, everything in there strains toward the mouth, but only the
 * one at the FRONT has anywhere to go. It rocks, cocks back away from the
 * nozzle, and then shoots straight down the corridor — there is no sideways in
 * a slot 1.2 heads wide — with a "shoo" and a ride up the tube. The moment it
 * is gone, the next one shuffles up a step, which is the whole invitation to
 * stay where you are and keep holding.
 *
 * Everything is derived from `vac.field` sampled at the item's own position and
 * PROJECTED onto the corridor axis, so the item only ever answers to air that
 * is actually coming down the gap at it — pointing the head across the shelf
 * does nothing, which is what makes the crevice tool feel like a tool.
 */
const KINDS = {
  crumb: { r: 7, thr: 0.40, mass: 1.0, color: '#c08b48', cup: 'crumb', size: 12 },
  lint: { r: 11, thr: 0.30, mass: 0.7, color: '#cfc7b6', cup: 'fluff', size: 15 },
  bead: { r: 9, thr: 0.52, mass: 1.5, color: '#e0577f', cup: 'crumb', size: 17 },
  clip: { r: 13, thr: 0.58, mass: 1.8, color: '#f0b3c8', cup: 'crumb', size: 20 },
  note: { r: 14, thr: 0.46, mass: 1.2, color: '#f6efd8', cup: 'fluff', size: 21 },
};

export class GapItem extends Debris {
  /**
   * @param x,y   where it lies in the gap
   * @param opts  {kind, axis:{x,y} pointing OUT of the gap, line:{x,y} a point
   *              on the corridor centre line, deepLimit: how far back it may be
   *              pushed}
   */
  constructor(x, y, rng, opts = {}) {
    super(x, y);
    this.rng = rng;
    this.kind2 = opts.kind || 'crumb';
    const K = KINDS[this.kind2] || KINDS.crumb;
    this.K = K;
    this.r = K.r;
    this.ax = opts.axis.x; this.ay = opts.axis.y;     // out of the gap
    this.px = -this.ay; this.py = this.ax;            // across it
    this.lineX = opts.line.x; this.lineY = opts.line.y;
    this.len = opts.len || 0;          // how long the slot is, along the axis
    this.escaped = false;              // shot clean out of the slot: now free
    this.rot = rng.range(0, TAU);
    this.spin = 0;
    this.seed = rng.range(0, 100);
    this.ready = false;        // the scene says whose turn it is
    this.rock = 0;             // 0..1 how hard it is straining forward
    this.cock = 0;             // wind-up away from the mouth, just before it goes
    this.cockT = -1;
    this.flying = false;
    this.flyT = 0;             // how long it has been in the air
    this.shoo = 0;             // 1 the frame it leaves, decaying: the streak
    this.shooX = x; this.shooY = y;
    this.shuffle = 0;          // >0: hopping up the queue after the one in front
    /**
     * A beat of its own before it will go. Without it, a head held deep in the
     * slot makes every threshold true at once and the whole queue empties in a
     * second and a half — which is a burst, not single file. This is what turns
     * it into a rhythm: shuffle up, settle, strain, shoot.
     */
    this.wait = 0.35;
    this.dust = 0;
    // `type` reads `kind2`, which did not exist when the base class minted the
    // id in its constructor: restamp it so the harness can aim by id.
    this.id = this.type + this.id.slice(this.id.indexOf('#'));
  }
  get type() { return 'gap-' + this.kind2; }

  translate(dx, dy) {
    super.translate(dx, dy);
    this.lineX += dx; this.lineY += dy;
  }

  /** How far out of the gap this item is, along the corridor axis. */
  get along() { return (this.x - this.lineX) * this.ax + (this.y - this.lineY) * this.ay; }

  /** Shuffle up the queue when the one in front of it leaves. */
  stepUp(d) {
    this.shuffle = d;
    this.wait = Math.max(this.wait, 0.62);
  }

  update(dt, vac, world) {
    this.shoo = Math.max(0, this.shoo - dt * 2.6);
    if (this.state === State.DONE) return;
    this.t += dt;
    const f = vac.field(this.x, this.y, this._f);
    const s = f.strength;
    this.strength = s;
    // only the component of the air running down the corridor counts
    const proj = f.fx * this.ax + f.fy * this.ay;
    this.proj = proj;
    if (this.wait > 0) this.wait -= dt;

    /**
     * It shot past the mouth and out of the slot altogether.
     *
     * This has to be handled, and not by pushing it back: the item with the
     * greatest `along` is the head of the queue, so one piece that overshot and
     * landed on the open boards would sit there being "next" for ever and
     * nothing behind it could ever come out. Out of the slot it simply stops
     * being a gap item: no corridor, no queue, no turn — it is a crumb on the
     * floor and it is won the way every other crumb in the game is won.
     */
    if (!this.escaped && this.len && this.along > this.len + 10) {
      this.escaped = true;
      this.flying = false;
      this.vx *= 0.3; this.vy *= 0.3;
      this.hx = this.x; this.hy = this.y;
      this.cock = 0; this.cockT = -1;
    }
    if (this.escaped) {
      this._free(dt, f);
      if (f.inCapture) {
        this._handOff(vac, { kind: this.K.cup, color: this.K.color, size: this.K.size });
        world.onCaptured && world.onCaptured(this);
      }
      return;
    }

    if (this.shuffle > 0) {
      const step = Math.min(this.shuffle, 62 * dt);
      this.x += this.ax * step; this.y += this.ay * step;
      this.rot += step * 0.05;
      this.shuffle -= step;
    }

    if (this.flying) {
      this.flyT += dt;
      this.vx += this.ax * Math.max(0, proj) * 1500 * dt / this.K.mass;
      this.vx += f.fx * 120 * dt;
      this.vy += this.ay * Math.max(0, proj) * 1500 * dt / this.K.mass;
      this.vy += f.fy * 120 * dt;
      const d = Math.exp(-1.7 * dt);
      this.vx *= d; this.vy *= d;
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 460) { const k = 460 / sp; this.vx *= k; this.vy *= k; }
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.spin += (Math.hypot(this.vx, this.vy) * 0.02 - this.spin) * (1 - Math.exp(-5 * dt));
      this.rot += this.spin * dt;
      this.state = State.PULLED;
      this._toLine(dt, 9);
      this.dust = clamp(this.dust + dt * 3, 0, 1);
      // it lost the flow again (the head backed out of the gap): settle, wait
      if (s < 0.14 && Math.hypot(this.vx, this.vy) < 30) {
        this.flying = false; this.vx = 0; this.vy = 0;
        this.state = State.REACTING;
        this.hx = this.x; this.hy = this.y;
      }
    } else {
      // waiting: a rhythmic strain, hardest at the front of the queue, and
      // never a still pose — this is 0.6-0.9s of readable anticipation before
      // anything lets go
      const strain = smoothstep(0.06, this.K.thr, Math.max(0, proj));
      this.rock += (strain - this.rock) * (1 - Math.exp(-10 * dt));
      const wob = 0.6 + 0.4 * Math.sin(this.t * (7 + 4 * this.rock) + this.seed);
      const lead = this.rock * wob * (this.ready ? 15 : 6) * (1 - this.cock * 1.8);
      const gx = this.hx + this.ax * lead, gy = this.hy + this.ay * lead;
      const o = 15;
      this.vx += (-2 * o * this.vx - o * o * (this.x - gx)) * dt;
      this.vy += (-2 * o * this.vy - o * o * (this.y - gy)) * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.rot += noise1(this.t * 26 + this.seed) * this.rock * 3.4 * dt;
      this.state = s > 0.08 ? State.REACTING : State.IDLE;

      if (this.ready && this.wait <= 0) {
        // the wind-up: it pulls BACK from the mouth for ~90ms and then goes
        if (this.cockT < 0 && proj > this.K.thr * 0.88) this.cockT = 0;
        if (this.cockT >= 0) {
          this.cockT += dt;
          this.cock = clamp(this.cockT / 0.09, 0, 1);
          if (this.cockT >= 0.09) {
            if (proj > this.K.thr * 0.85) {
              this.flying = true;
              this.flyT = 0;
              this.state = State.PULLED;
              this.vx = this.ax * 130; this.vy = this.ay * 130;
              this.spin = this.rng.range(-7, 7);
              this.cockT = -1; this.cock = 0;
              this.launched = true;
              // the "shoo": it leaves from a standstill, so the frame it goes
              // needs a mark on it or the whole event falls between frames
              this.shoo = 1;
              this.shooX = this.x; this.shooY = this.y;
            } else { this.cockT = -1; this.cock = 0; }
          }
        } else if (proj < this.K.thr * 0.6) this.cock = 0;
      } else { this.cock = 0; this.cockT = -1; }
      this._toLine(dt, 5);
    }

    if (f.inCapture) {
      // Nothing in this slot is ever simply removed from the shelf. Even when
      // the head is driven right up to it, the item cocks back the width of
      // itself and then shoots — so the "shoo" the room is named for happens
      // every time, and the streak has two frames to be seen in.
      if (!this.flying && !this.escaped) { this._shoot(); return; }
      if (this.flying && this.flyT < 0.13) return;
      this._handOff(vac, { kind: this.K.cup, color: this.K.color, size: this.K.size });
      world.onCaptured && world.onCaptured(this);
    }
  }

  _shoot() {
    this.shooX = this.x - this.ax * this.r * 1.5;
    this.shooY = this.y - this.ay * this.r * 1.5;
    this.x = this.shooX; this.y = this.shooY;
    this.flying = true;
    this.flyT = 0;
    this.shoo = 1;
    this.state = State.PULLED;
    this.cock = 0; this.cockT = -1;
    this.vx = this.ax * 260; this.vy = this.ay * 260;
  }

  /** Out on the open boards: an ordinary crumb, shivering then skating in. */
  _free(dt, f) {
    const s = f.strength;
    if (s > this.K.thr * 0.5) {
      this.vx += f.fx * 950 * dt / this.K.mass;
      this.vy += f.fy * 950 * dt / this.K.mass;
      const d = Math.exp(-3.2 * dt);
      this.vx *= d; this.vy *= d;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.hx = this.x; this.hy = this.y;
      this.spin += (Math.hypot(this.vx, this.vy) * 0.02 - this.spin) * (1 - Math.exp(-5 * dt));
      this.rot += this.spin * dt;
      this.rock = 1;
      this.state = State.PULLED;
    } else {
      // still stuck to the boards, but never a still pose
      const j = smoothstep(0.05, this.K.thr, s);
      this.rock += (j - this.rock) * (1 - Math.exp(-10 * dt));
      this.x = this.hx + noise1(this.t * 31 + this.seed) * this.rock * 5;
      this.y = this.hy + noise1(this.t * 27 + this.seed + 7) * this.rock * 4;
      this.rot += noise1(this.t * 24 + this.seed) * this.rock * 3 * dt;
      this.vx = 0; this.vy = 0;
      this.state = s > 0.08 ? State.REACTING : State.IDLE;
    }
  }

  /** A slot this narrow has no sideways: snap the item back onto the centre. */
  _toLine(dt, rate) {
    const rel = (this.x - this.lineX) * this.px + (this.y - this.lineY) * this.py;
    const k = 1 - Math.exp(-rate * dt);
    this.x -= this.px * rel * k;
    this.y -= this.py * rel * k;
    const vrel = this.vx * this.px + this.vy * this.py;
    this.vx -= this.px * vrel * k;
    this.vy -= this.py * vrel * k;
  }

  // ----------------------------------------------------------------- draw

  draw(ctx) {
    if (this.state === State.DONE) return;
    const sp = Math.hypot(this.vx, this.vy);
    const stretch = 1 + clamp(sp / 620, 0, 0.7);
    ctx.save();
    // the shoo: a tapering streak back to the spot it left from, plus two
    // speed lines either side of it, so "it shot off down the slot" is a thing
    // you can see in ONE frame
    if (this.shoo > 0.02) {
      const a = this.shoo;
      ctx.globalAlpha = a * 0.8;
      ctx.lineCap = 'round';
      ctx.strokeStyle = this.K.color;
      ctx.lineWidth = this.r * 1.5 * a;
      ctx.beginPath();
      ctx.moveTo(this.shooX - this.ax * 4, this.shooY - this.ay * 4);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
      ctx.globalAlpha = a * 0.55;
      ctx.strokeStyle = 'rgba(255,252,240,0.9)';
      ctx.lineWidth = 2.2;
      for (let i = -1; i <= 1; i += 2) {
        const ox = this.px * this.r * 1.5 * i, oy = this.py * this.r * 1.5 * i;
        ctx.beginPath();
        ctx.moveTo(this.shooX + ox, this.shooY + oy);
        ctx.lineTo(this.x - this.ax * this.r * 1.2 + ox, this.y - this.ay * this.r * 1.2 + oy);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(24,16,8,0.30)';
    ctx.beginPath();
    ctx.ellipse(this.x + 2, this.y + this.r * 0.55, this.r * 0.85, this.r * 0.32, 0, 0, TAU);
    ctx.fill();
    ctx.translate(this.x, this.y);
    if (stretch > 1.01) {
      const a = Math.atan2(this.vy, this.vx);
      ctx.rotate(a); ctx.scale(stretch, 1 / stretch); ctx.rotate(-a);
    }
    ctx.rotate(this.rot);
    const k = this.kind2;
    if (k === 'bead') this._bead(ctx);
    else if (k === 'clip') this._clip(ctx);
    else if (k === 'note') this._note(ctx);
    else if (k === 'lint') this._lint(ctx);
    else this._crumb(ctx);
    ctx.restore();
  }

  _crumb(ctx) {
    ctx.fillStyle = this.K.color;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const rr = this.r * (0.78 + 0.28 * Math.sin(i * 2.1 + this.seed));
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.9);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.9);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,210,0.45)';
    ctx.beginPath(); ctx.ellipse(-this.r * 0.22, -this.r * 0.26, this.r * 0.32, this.r * 0.22, 0, 0, TAU); ctx.fill();
  }

  _bead(ctx) {
    ctx.fillStyle = this.K.color;
    ctx.beginPath(); ctx.arc(0, 0, this.r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.beginPath(); ctx.ellipse(-this.r * 0.32, -this.r * 0.34, this.r * 0.32, this.r * 0.24, -0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(70,20,40,0.55)';
    ctx.beginPath(); ctx.arc(0, 0, this.r * 0.24, 0, TAU); ctx.fill();
  }

  _clip(ctx) {
    const L = this.r * 2.1, W = this.r * 0.62;
    ctx.fillStyle = this.K.color;
    ctx.beginPath();
    ctx.moveTo(-L * 0.5, -W); ctx.lineTo(L * 0.5, -W);
    ctx.quadraticCurveTo(L * 0.62, 0, L * 0.5, W);
    ctx.lineTo(-L * 0.5, W);
    ctx.quadraticCurveTo(-L * 0.62, 0, -L * 0.5, -W);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(190,110,140,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-L * 0.36, 0); ctx.lineTo(L * 0.36, 0); ctx.stroke();
    ctx.fillStyle = '#fff4f7';
    ctx.beginPath(); ctx.arc(L * 0.34, -W * 0.3, W * 0.55, 0, TAU); ctx.fill();
  }

  _note(ctx) {
    const w = this.r * 1.7, h = this.r * 1.25;
    ctx.fillStyle = this.K.color;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, -h * 0.5); ctx.lineTo(w * 0.5, -h * 0.42);
    ctx.lineTo(w * 0.46, h * 0.5); ctx.lineTo(-w * 0.5, h * 0.44);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(150,130,90,0.7)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-w * 0.5, 0); ctx.lineTo(w * 0.48, h * 0.04); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,150,200,0.65)'; ctx.lineWidth = 1.4;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.32, i * h * 0.22 - h * 0.1);
      ctx.lineTo(w * 0.30, i * h * 0.22 - h * 0.08);
      ctx.stroke();
    }
  }

  _lint(ctx) {
    ctx.strokeStyle = 'rgba(214,208,196,0.8)';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.1;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + this.seed;
      const L = this.r * (0.7 + 0.5 * Math.sin(i * 2.7 + this.seed));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(a + 0.4) * L * 0.6, Math.sin(a + 0.4) * L * 0.6,
        Math.cos(a) * L, Math.sin(a) * L * 0.9);
      ctx.stroke();
    }
    ctx.fillStyle = this.K.color;
    ctx.beginPath(); ctx.arc(0, 0, this.r * 0.55, 0, TAU); ctx.fill();
  }

  snapshot() {
    const s = super.snapshot();
    s.ready = !!this.ready;
    s.rock = +this.rock.toFixed(2);
    s.cock = +this.cock.toFixed(2);
    s.proj = +(this.proj || 0).toFixed(3);
    s.flying = !!this.flying;
    s.escaped = !!this.escaped;
    s.wait = +Math.max(0, this.wait).toFixed(2);
    return s;
  }
}

export { KINDS as GAP_KINDS };
