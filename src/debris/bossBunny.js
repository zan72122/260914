import { DustBunny } from './dustBunny.js';
import { Debris, State } from './base.js';
import { clamp, smoothstep, TAU, noise1 } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

/**
 * The giant dust bunny under the bed — the last thing in the house.
 *
 * It is a `DustBunny` three times over, and the one thing it does NOT do is the
 * thing every other dust bunny does: it can never be pulled. No approach, no
 * hold, no amount of power moves it while it is whole. What a hold does instead
 * is TEAR TUFTS OFF IT:
 *
 *  - fibres lean, as always, each sampling the flow at its own tip;
 *  - a hold strips them off in tufts, which fly (as `Airborne`, so they have a
 *    real height and are dragged down and in), ride the tube and pile in the cup;
 *  - the motor labours while it strips — a fistful of fluff at the intake is a
 *    clog — and the boss visibly THINS: fewer fibres, smaller body, and what it
 *    was built around starts to show through (a lost hair-tie, a marble);
 *  - only when it is thin does its threshold drop at all. Then it starts to
 *    slide, stretches into a long teardrop over about a second, and POPS in with
 *    the biggest gulp in the game, leaving its core behind to rattle in after it.
 *
 * The cup WILL fill in the middle of this, and that is the design: when it is
 * full the tufts bounce off the mouth and the boss stops thinning, so the only
 * way on is the bin in the corner. Its thinning is never lost.
 *
 * Cost: fibres are capped at 120 and the field is sampled for them every OTHER
 * frame (the spring integration still runs every frame, so nothing stutters).
 */
export class BossBunny extends DustBunny {
  constructor(x, y, r, rng, opts = {}) {
    super(x, y, Math.min(r, 140), rng);      // n = 22 + 0.7r, so r<=140 => n<=120
    // a huge SOFT thing, not a threat: warm pale grey, a light rim, and no
    // dark strands at all — at this size the base class's dark fibre pass reads
    // as black spikes, which is the one thing a four-year-old must not see here
    // It lives INSIDE the headlight beam, which is a warm cream wash. A pale
    // body in a pale beam is one shape; so the body is a darker warm grey and
    // the rim around it is lighter than the beam, which puts an edge on it
    // from anywhere in the room.
    this.core = '#9b8e7a';
    this.rim = 'rgba(255,250,238,0.92)';
    this.light = '#fdf8ec';
    this.air = opts.air || null;             // the scene's Airborne layer
    // a mountain of fluff, not a sea urchin: shorter fibres and a fatter body
    // than a small bunny's proportions, so the silhouette reads as a MASS,
    // every strand curlier, and none of them drawn dark
    for (let i = 0; i < this.n; i++) {
      this.fl[i] *= 0.80;
      this.fd[i] = 0;
      this.fc[i] *= 1.45;                    // curlier: wisps of fluff, not quills
    }
    this.r0 = this.r;
    this.phase = 'hold';                     // 'hold' | 'slide' | 'pop'
    this.stripT = 0.34;
    this.slideT = 0;
    this.popT = 0;
    this.gulped = false;
    this.rejectT = 0;
    this.shedT = 1e9;                        // never use the base class's shedding
    // cached per-fibre lean targets, refreshed every other frame
    this.ftx = new Float32Array(this.n);
    this.fty = new Float32Array(this.n);
    this._tick = 0;
    // what it was built around — visible once it is thin enough
    this.coreBits = [
      { kind: 'tie', ox: -this.r * 0.16, oy: this.r * 0.10, rot: 0.4 },
      { kind: 'marble', ox: this.r * 0.20, oy: -this.r * 0.06, rot: 0 },
    ];
  }
  get type() { return 'boss'; }

  /** How far through it we are: 0 = whole, 1 = nothing left. */
  get thin() { return 1 - this.fibers / this.n; }

  /**
   * Whole, it cannot be moved by any amount of airflow. Below a third of its
   * fibres the threshold drops through the floor and it starts to go.
   */
  get breakThreshold() {
    const left = this.fibers / this.n;
    return left > 0.34 ? 99 : 0.34 + 1.6 * (left - 0.06);
  }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;
    const f = vac.field(this.x, this.y, this._f);
    const s = f.strength;
    this.strength = s;
    if (s > 0.001) {
      const l = Math.hypot(f.fx, f.fy) || 1;
      const k = 1 - Math.exp(-9 * dt);
      this.aimX += (f.fx / l - this.aimX) * k;
      this.aimY += (f.fy / l - this.aimY) * k;
    }
    this._updateWisps(dt, vac);

    if (this.phase === 'pop') { this._pop(dt, vac, world); return; }
    if (this.phase === 'slide') { this._slide(dt, vac, f, world); return; }

    // ---- anchored: it strains, and it comes apart ------------------------
    const strain = smoothstep(0.10, 1.05, s);
    this.pulse += dt * TAU * (1.5 + 0.9 * strain);
    const pulseK = 0.82 + 0.18 * Math.sin(this.pulse);
    // it strains toward the mouth but never leaves: a few px of give, no more
    const give = this.r * 0.10;
    const gx = this.hx + clamp(f.fx * 22, -give, give);
    const gy = this.hy + clamp(f.fy * 22, -give, give);
    const o = 13;
    this.vx += (-2 * o * this.vx - o * o * (this.x - gx)) * dt;
    this.vy += (-2 * o * this.vy - o * o * (this.y - gy)) * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.stretch += (smoothstep(0.25, 1.4, s) * 0.42 * pulseK - this.stretch) * (1 - Math.exp(-9 * dt));
    this.tremble += (strain * (0.9 + 0.35 * Math.sin(this.pulse * 2.2)) - this.tremble) * (1 - Math.exp(-10 * dt));
    this.spin += this.tremble * Math.sin(this.t * 19 + this.seed) * dt * 0.35;

    if (s > 0.42 && this.fibers > 4) {
      if (vac.cupFull) {
        // nothing more fits: a tuft still comes loose and is blown straight
        // back out. The boss keeps everything it has already lost.
        this.rejectT -= dt;
        if (this.rejectT <= 0) { this.rejectT = 0.42; this._puffBack(vac); }
      } else {
        // the machine is working: a fistful of fluff across the intake
        const clog = clamp(0.16 + 0.16 * s, 0, 0.42);
        if (clog > vac.clog) vac.clog = clog;
        this.stripT -= dt * (s - 0.32) * 1.15;
        if (this.stripT <= 0) {
          this.stripT = 0.30 + this.rng.next() * 0.10;
          this._strip(vac, f, world);
        }
      }
    }

    this.state = s > 0.1 ? State.REACTING : State.IDLE;
    if (s > this.breakThreshold) {
      this.phase = 'slide';
      this.slideT = 0;
      this.state = State.PULLED;
      if (vac.audio) vac.audio.pop('whoosh', 0.5);
    }
    this._leanFibers(dt, vac, 1.45);
  }

  // ------------------------------------------------------------ stripping

  /** Tear a tuft off the side facing the mouth and throw it into the air. */
  _strip(vac, f, world) {
    const take = 2 + (this.rng.next() < 0.5 ? 0 : 1);
    let sx = 0, sy = 0, got = 0;
    for (let k = 0; k < take; k++) {
      let best = -1, bestDot = -2;
      for (let i = 0; i < this.n; i++) {
        if (this.fl[i] <= 0) continue;
        const a = this.fa[i] + this.spin;
        const d = Math.cos(a) * this.aimX + Math.sin(a) * this.aimY + this.rng.range(-0.3, 0.3);
        if (d > bestDot) { bestDot = d; best = i; }
      }
      if (best < 0) break;
      const a = this.fa[best] + this.spin;
      const L = this.fl[best];
      sx += this.x + Math.cos(a) * L + this.fx[best];
      sy += this.y + Math.sin(a) * L * 0.86 + this.fy[best];
      got++;
      this.fl[best] = 0;
      this.fx[best] = 0; this.fy[best] = 0; this.fvx[best] = 0; this.fvy[best] = 0;
      this.ftx[best] = 0; this.fty[best] = 0;
      this.fibers--;
    }
    if (!got) return;
    sx /= got; sy /= got;
    // it shrinks as it loses them — the pile is visibly being eaten
    this.r = Math.max(this.r0 * 0.46, this.r * 0.988);
    if (this.air) {
      this.air.spawn(sx, sy, 5 + this.rng.range(0, 10),
        f.fx * 150 + this.rng.range(-30, 30),
        f.fy * 150 + this.rng.range(-30, 30),
        this.rng.range(20, 70), 'tuft');
    }
    if (vac.audio) vac.audio.pop('tick', 0.5);
    if (world && world.onBossStrip) world.onBossStrip(this, sx, sy);
  }

  /** The cup is full: a tuft comes off and is spat straight back out. */
  _puffBack(vac) {
    if (!this.air) return;
    let best = -1, bestDot = -2;
    for (let i = 0; i < this.n; i++) {
      if (this.fl[i] <= 0) continue;
      const a = this.fa[i] + this.spin;
      const d = Math.cos(a) * this.aimX + Math.sin(a) * this.aimY;
      if (d > bestDot) { bestDot = d; best = i; }
    }
    if (best < 0) return;
    const a = this.fa[best] + this.spin, L = this.fl[best];
    this.air.spawn(this.x + Math.cos(a) * L, this.y + Math.sin(a) * L * 0.86,
      8 + this.rng.range(0, 8), this.aimX * 120, this.aimY * 120,
      this.rng.range(20, 50), 'tuft');
  }

  // -------------------------------------------------------- slide and pop

  _slide(dt, vac, f, world) {
    this.slideT += dt;
    const acc = 260 + 420 * this.slideT;
    this.vx += f.fx * acc * dt;
    this.vy += f.fy * acc * dt;
    const d = Math.exp(-1.9 * dt);
    this.vx *= d; this.vy *= d;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.spin += dt * 1.4;
    // a long teardrop: it keeps stretching all the way in, which is what makes
    // the last second read as one continuous swallow and not a jump cut
    const want = 0.5 + 2.0 * clamp(this.slideT / 1.0, 0, 1);
    this.stretch += (want - this.stretch) * (1 - Math.exp(-7 * dt));
    this.tremble = 1.3;
    if (this.air && this.slideT > 0.15) {
      // it keeps shedding all the way in
      if (Math.random() < 0.25) {
        this.air.spawn(this.x, this.y, 6 + Math.random() * 10,
          f.fx * 120, f.fy * 120, 20 + Math.random() * 40, 'tuft');
      }
    }
    this._leanFibers(dt, vac, 1.5);
    if (f.inCapture || (this.slideT > 1.0 && f.dist < 52)) {
      this.phase = 'pop';
      this.popT = 0;
      this.state = State.CAPTURED;
      vac.gulp(1);
      if (vac.audio) vac.audio.pop('whoosh', 1.0);
      if (world && world.camera) world.camera.kick(14);
    }
  }

  _pop(dt, vac, world) {
    this.popT += dt;
    this.squash = clamp(this.popT / 0.26, 0, 1);
    this.stretch = Math.min(2.6, this.stretch + dt * 6);
    this._leanFibers(dt, vac, 1.7);
    if (this.squash >= 1 && !this.gulped) {
      this.gulped = true;
      this._handOff(vac, { kind: 'fluff', color: this.light, size: 34 });
      vac.gulp(1);
      if (world && world.camera) world.camera.kick(9);
      world && world.onCaptured && world.onCaptured(this);
    }
  }

  // ------------------------------------------------------------ fibres

  /**
   * Per-fibre lean, with the FIELD sampled every other frame and the spring
   * integrated every frame. 120 fibres at 30Hz of sampling is half the cost and
   * indistinguishable: the spring is what the eye is actually watching.
   */
  _leanFibers(dt, vac, gain) {
    this._tick ^= 1;
    const sample = this._tick === 0;
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const L = this.fl[i];
      if (L <= 0) continue;
      if (sample) {
        const a = this.fa[i] + this.spin;
        const bx = this.x + Math.cos(a) * L;
        const by = this.y + Math.sin(a) * L * 0.86;
        const f = vac.field(bx, by, TMPF);
        const lean = clamp(f.strength * 34 * gain, 0, L);
        const l = Math.hypot(f.fx, f.fy) || 1;
        this.ftx[i] = (f.fx / l) * lean;
        this.fty[i] = (f.fy / l) * lean;
        this._trem = f.strength * 3.0 * gain;
      }
      const tr = this._trem || 0;
      const tx = this.ftx[i] + noise1(this.t * 24 + this.fw[i]) * tr;
      const ty = this.fty[i] + noise1(this.t * 24 + this.fw[i] + 37) * tr;
      const o = 22;
      this.fvx[i] += (-2 * o * this.fvx[i] - o * o * (this.fx[i] - tx)) * dt;
      this.fvy[i] += (-2 * o * this.fvy[i] - o * o * (this.fy[i] - ty)) * dt;
      this.fx[i] += this.fvx[i] * dt;
      this.fy[i] += this.fvy[i] * dt;
    }
  }

  // -------------------------------------------------------------- drawing

  /**
   * Its own draw, not the base class's: every stroke width in `DustBunny.draw`
   * is tuned for a 20-50px ball, and at this size those hairlines read as a
   * spider rather than a mountain of fluff. Same construction, widths scaled by
   * the radius, and a soft pale core so the beam has something to land on.
   */
  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    const k = this.r / 26;
    const ang = Math.atan2(this.aimY, this.aimX);
    const cap = this.state === State.CAPTURED ? this.squash : 0;
    const stretch = 1 + this.stretch * 0.72 + cap * 1.8;
    const thin = 1 / (1 + this.stretch * 0.35 + cap * 0.9);

    ctx.save();
    ctx.fillStyle = 'rgba(30,20,12,0.26)';
    ctx.beginPath();
    ctx.ellipse(this.x + 5, this.y + this.r * 0.55, this.r * 0.95, this.r * 0.34, 0, 0, TAU);
    ctx.fill();

    ctx.translate(this.x, this.y);
    ctx.rotate(ang);
    ctx.translate((stretch - 1) * this.r * 0.62, 0);
    ctx.scale(stretch, thin);
    ctx.rotate(-ang);
    ctx.lineCap = 'round';

    // a soft mass first, so the fibres sit ON something
    ctx.fillStyle = 'rgba(104,94,80,0.40)';
    ctx.beginPath();
    ctx.ellipse(0, 0, this.r * 1.04, this.r * 0.92, 0, 0, TAU);
    ctx.fill();

    // three soft passes, widest and palest first: a halo of fluff with no hard
    // strand in it anywhere
    this._fiberPath(ctx, 0);
    ctx.strokeStyle = 'rgba(88,78,64,0.30)';
    ctx.lineWidth = 14 * k; ctx.stroke();
    ctx.strokeStyle = 'rgba(184,172,152,0.40)';
    ctx.lineWidth = 7 * k; ctx.stroke();
    ctx.strokeStyle = 'rgba(252,246,232,0.62)';
    ctx.lineWidth = 3.0 * k; ctx.stroke();
    ctx.strokeStyle = '#fffdf6';
    ctx.lineWidth = 1.4 * k; ctx.stroke();

    // The body is a SMOOTHED outline, not one vertex per fibre. Per-fibre radii
    // make a 100-gon with a deep notch wherever a fibre has been shed, and at
    // this size that reads as a black spiky star. Averaging over five
    // neighbours (and treating a shed fibre as a shallow dent, not a hole)
    // keeps it a round, slightly lumpy ball all the way down to the last tuft.
    ctx.beginPath();
    for (let i = 0, first = true; i <= this.n; i++) {
      const j = i % this.n;
      let acc = 0, wn = 0;
      for (let d = -2; d <= 2; d++) {
        const q = (j + d + this.n) % this.n;
        const w2 = d === 0 ? 3 : (d === 1 || d === -1 ? 2 : 1);
        // a shed fibre is a shallow dent, never a hole: the pile thins by
        // getting SMALLER (r), not by growing notches
        acc += (this.fl[q] > 0 ? this.fl[q] : this.r * 0.80) * w2;
        wn += w2;
      }
      const R = clamp((acc / wn) * 0.86, this.r * 0.62, this.r * 1.0)
        * (1 + 0.05 * Math.sin(this.t * 5 + this.fw[j]) * (0.4 + this.tremble));
      // NOTE: no per-fibre lean offset in the outline. Neighbouring fibres lean
      // by different amounts (that is the point of them), and feeding that into
      // the body made its edge a row of sharp teeth.
      const a = this.fa[j] + this.spin;
      const px = Math.cos(a) * R;
      const py = Math.sin(a) * R * 0.86;
      if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = this.core;
    ctx.fill();
    ctx.strokeStyle = this.rim; ctx.lineWidth = 3.2 * k; ctx.stroke();
    // a big soft top-light, so the body reads as round and stuffed — kept low,
    // because the job of the light here is roundness, not brightness
    ctx.fillStyle = 'rgba(255,248,232,0.22)';
    ctx.beginPath();
    ctx.ellipse(-this.r * 0.22, -this.r * 0.30, this.r * 0.46, this.r * 0.30, -0.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(60,50,38,0.22)';
    ctx.beginPath();
    ctx.ellipse(this.r * 0.26, this.r * 0.20, this.r * 0.26, this.r * 0.17, 0.5, 0, TAU);
    ctx.fill();
    ctx.restore();

    this._drawWisps(ctx);

    // the core showing through the thinning fluff
    const a = smoothstep(0.40, 0.78, this.thin) * (this.phase === 'pop' ? 1 - this.squash : 1);
    if (a <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    for (let i = 0; i < this.coreBits.length; i++) {
      const c = this.coreBits[i];
      drawCoreShape(ctx, c.kind, this.x + c.ox, this.y + c.oy, c.rot);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * The fibres it sheds are the only thing travelling between the boss and the
   * mouth, so they are the beat of the whole fight: brighter and longer than an
   * ordinary bunny's, with a dark hairline through them so they stay visible
   * where they cross the brightest part of the beam.
   */
  _drawWisps(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < this.wisps.length; i++) {
      const w = this.wisps[i];
      if (w.life <= 0) continue;
      ctx.globalAlpha = clamp(w.life * 1.7, 0, 1);
      const L = w.len * 1.45;
      const dx = Math.cos(w.a) * L, dy = Math.sin(w.a) * L;
      ctx.beginPath();
      ctx.moveTo(w.x - dx, w.y - dy);
      ctx.quadraticCurveTo(w.x, w.y + L * 0.3, w.x + dx, w.y + dy);
      ctx.strokeStyle = 'rgba(92,82,68,0.55)';
      ctx.lineWidth = 6.4; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,253,244,0.98)';
      ctx.lineWidth = 3.4; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  snapshot() {
    const s = super.snapshot();
    s.phase = this.phase;
    s.thin = +this.thin.toFixed(2);
    return s;
  }
}

/** A hair-tie and a marble: small, hard, and obviously not dust. */
function drawCoreShape(ctx, kind, x, y, rot) {
  if (kind === 'tie') {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.strokeStyle = '#d6588a';
    ctx.lineWidth = 5.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 9.5, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(-2, -2, 13, 9.5, 0, 3.6, 5.2); ctx.stroke();
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = '#5fb7cf';
    ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.ellipse(x - 3.2, y - 3.4, 3.6, 2.6, -0.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(20,60,80,0.45)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}

/**
 * What the boss was built around. They are left on the floor when it goes and
 * rattle in after it: hard, light, and with almost no threshold, so the same
 * hold that finished the boss takes them too — the tail of the biggest suck in
 * the game rather than a new task.
 */
export class CoreBit extends Debris {
  constructor(x, y, kind, rng) {
    super(x, y);
    this.kind = kind;
    this.rng = rng;
    this.rot = rng.range(0, TAU);
    this.rattle = 0;
    this.vx = rng.range(-70, 70);
    this.vy = rng.range(-50, 50);
    this.r = kind === 'tie' ? 13 : 10;
  }
  get type() { return 'core'; }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;
    const f = vac.field(this.x, this.y, this._f);
    const s = f.strength;
    this.strength = s;
    if (this.state === State.PULLED || s > 0.26) {
      this.state = State.PULLED;
      this.vx += f.fx * 520 * dt;
      this.vy += f.fy * 520 * dt;
    }
    const d = Math.exp(-(this.state === State.PULLED ? 2.4 : 7) * dt);
    this.vx *= d; this.vy *= d;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.rot += (this.vx * 0.006 + 0.3) * dt * 5;
    // hard things rattle on boards: a high-frequency judder while the air has
    // hold of them but they have not gone yet
    this.rattle = clamp(s * 1.2, 0, 1);
    if (this.state !== State.PULLED) this.state = s > 0.08 ? State.REACTING : State.IDLE;
    if (f.inCapture) {
      this._handOff(vac, {
        kind: 'crumb', color: this.kind === 'tie' ? '#d6588a' : '#5fb7cf', size: 15,
      });
      if (vac.audio) vac.audio.pop('tick', 1.0);
      world && world.onCaptured && world.onCaptured(this);
    }
  }

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    const j = this.rattle;
    const x = this.x + Math.sin(this.t * 47) * 1.9 * j;
    const y = this.y + Math.cos(this.t * 41) * 1.6 * j;
    ctx.save();
    ctx.fillStyle = 'rgba(30,22,16,0.28)';
    ctx.beginPath(); ctx.ellipse(x + 2, y + this.r * 0.55, this.r * 0.9, this.r * 0.34, 0, 0, TAU); ctx.fill();
    ctx.restore();
    drawCoreShape(ctx, this.kind, x, y, this.rot);
  }

  snapshot() {
    const s = super.snapshot();
    s.rattle = +this.rattle.toFixed(2);
    return s;
  }
}
