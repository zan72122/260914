import { Cloth } from '../core/cloth.js';
import { clamp, lerp, smoothstep, TAU } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

/**
 * A floor cushion: a surface that is NOT the floor.
 *
 * Everything it does is something only suction can do to fabric:
 *
 *  - it BULGES. The face is a `Cloth`, and every node samples the field where
 *    it actually is, so the dome follows the mouth across the cushion and grows
 *    with the flow — hold still and it swells, move on and it sags back with a
 *    wobble. It can never be picked up; it can only be lifted.
 *  - it GRIPS. Once the dome is deep enough and the motor is at full power the
 *    fabric is sucked flat onto the intake: the cloth's reach doubles, the
 *    machine has to work for it (`vac.clog`, so the motor note sags and the head
 *    judders) and moving away lets go with a soft "fwump" and a ripple.
 *  - it gets CLEAN, and it stays clean. A persistent mask over the weave
 *    brightens wherever the mouth has worked, so the child can see what they
 *    have done and what is left — no counter, no text.
 *  - it SCOOTS. It is a pushable prop, so the head shoves it about, and the
 *    ring of hair it has been sitting on all this time is underneath.
 *
 * The hair itself is `PetHair`; the cushion owns the patches only so it can
 * carry them when it is pushed, and brighten the weave under them as they go.
 */
export class Cushion {
  constructor(x, y, w, h, rng, opts = {}) {
    this.x = x; this.y = y;
    this.homeX = x; this.homeY = y;
    this.w = w; this.h = h;
    this.rng = rng;
    this.cols = opts.cols || 7;
    this.rows = opts.rows || 5;
    this.color = opts.color || '#8fa9c4';
    this.cleanColor = opts.cleanColor || '#c3d7ea';
    this.piping = opts.piping || '#5b7793';

    this.cloth = new Cloth(
      { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 },
      this.cols, this.rows,
      { gain: 26, stiffness: 24, link: 36, damp: 0.98, pinned: 'edges' });
    this.baseGain = 26;
    this._pillow();

    /**
     * It is NOT a collider. A cushion lying on the floor is something a vacuum
     * head rides over, not something it bumps into — and a cushion that shoves
     * the head away also shoves its own hair out of reach, which is the one
     * thing that must never happen. The scoot is therefore done here: a head
     * SWEEPING across the face drags it along, and a head standing still on it
     * does not move it at all.
     */
    this.vx = 0; this.vy = 0;

    const cells = (this.cols - 1) * (this.rows - 1);
    this.clean = new Float32Array(cells);
    this.hairs = [];              // PetHair patches riding this cushion
    this.ring = null;             // the hair ring under it, once revealed
    this.bulge = 0;
    this.grip = 0;
    this.fwump = 0;               // 0..1, decaying: the release ripple
    this.moved = 0;               // how far it has been shoved from home
    this.t = 0;
    this.seed = rng ? rng.range(0, 100) : 0;
  }

  /**
   * Bow the rest grid into a pillow: the edges bulge out and the corners pull
   * in, so the silhouette is a stuffed cushion and not a rectangle. Done to the
   * REST positions, so the physics never knows about it.
   */
  _pillow() {
    const cl = this.cloth;
    const C = this.cols, R = this.rows;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        const u = (c / (C - 1)) * 2 - 1, v = (r / (R - 1)) * 2 - 1;
        const x = this.x + u * (this.w / 2) * (1 - 0.20 * v * v);
        const y = this.y + v * (this.h / 2) * (1 - 0.20 * u * u);
        cl.hx[i] = x; cl.hy[i] = y; cl.x[i] = x; cl.y[i] = y;
      }
    }
  }

  /** Is a world point on the face of the cushion? */
  covers(x, y) {
    return Math.abs(x - this.x) < this.w * 0.5 && Math.abs(y - this.y) < this.h * 0.5;
  }

  /** Move the whole cushion: cloth nodes, rest positions, and its hair. */
  translate(dx, dy) {
    this.x += dx; this.y += dy;
    const cl = this.cloth;
    for (let i = 0; i < cl.x.length; i++) {
      cl.x[i] += dx; cl.y[i] += dy; cl.hx[i] += dx; cl.hy[i] += dy;
    }
    cl.rect.x0 += dx; cl.rect.x1 += dx; cl.rect.y0 += dy; cl.rect.y1 += dy;
    for (let i = 0; i < this.hairs.length; i++) this.hairs[i].translate(dx, dy);
  }

  /** Brighten the weave at a world point (radius in design px). */
  wash(wx, wy, r, amount) {
    const C = this.cols - 1, R = this.rows - 1;
    const w = this.w, h = this.h;
    const u = (wx - (this.x - w / 2)) / w, v = (wy - (this.y - h / 2)) / h;
    const cu = r / w, cv = r / h;
    const c0 = Math.floor((u - cu) * C), c1 = Math.ceil((u + cu) * C);
    const r0 = Math.floor((v - cv) * R), r1 = Math.ceil((v + cv) * R);
    for (let rr = Math.max(0, r0); rr <= Math.min(R - 1, r1); rr++) {
      for (let cc = Math.max(0, c0); cc <= Math.min(C - 1, c1); cc++) {
        const px = (cc + 0.5) / C, py = (rr + 0.5) / R;
        const d = Math.hypot((px - u) * w, (py - v) * h);
        if (d > r) continue;
        const i = rr * C + cc;
        const k = amount * (1 - d / r);
        if (this.clean[i] < 1) this.clean[i] = clamp(this.clean[i] + k, 0, 1);
      }
    }
  }

  cleanFrac() {
    let s = 0;
    for (let i = 0; i < this.clean.length; i++) s += this.clean[i];
    return s / this.clean.length;
  }

  update(dt, vac, ctx) {
    this.t += dt;

    // ---- the scoot: a head sweeping across the face drags it along --------
    const n = vac.nozzle;
    // 340 px/s is the speed at which the machine's own power has already
    // dropped to idle (see Vacuum.update): so you can suck OR shove, never
    // both, and creeping up on the hair never moves the thing it is on.
    const sp = Math.hypot(n.vx, n.vy);
    if (sp > 340 && this.covers(n.x, n.y)) {
      this.vx += n.vx * 2.4 * dt;
      this.vy += n.vy * 2.4 * dt;
      this.nudge = 1;
    }
    this.nudge = Math.max(0, (this.nudge || 0) - dt * 2.5);
    const fr = Math.exp(-6 * dt);
    this.vx *= fr; this.vy *= fr;
    if (Math.abs(this.vx) < 2 && Math.abs(this.vy) < 2) { this.vx = 0; this.vy = 0; }
    if (this.vx || this.vy) this.translate(this.vx * dt, this.vy * dt);
    this.moved = Math.hypot(this.x - this.homeX, this.y - this.homeY);

    // ---- grip: the fabric sucked flat onto the intake --------------------
    // it needs both a deep dome AND a held finger, so it is the reward for
    // stopping, not something that happens while sweeping past
    const want = smoothstep(0.30, 0.78, this.bulge) * smoothstep(0.25, 0.7, vac.powerN);
    const prev = this.grip;
    this.grip += (want - this.grip) * (1 - Math.exp(-(want > prev ? 6 : 9) * dt));
    this.cloth.gain = this.baseGain * (1 + 0.85 * this.grip);
    if (this.grip > 0.12) {
      const clog = this.grip * 0.30;
      if (clog > vac.clog) vac.clog = clog;
    }
    // ...and lets go with a fwump: the sheet snaps back and ripples
    if (prev > 0.42 && this.grip < prev - dt * 1.7) {
      this._fwump(ctx);
    }
    this.fwump = Math.max(0, this.fwump - dt * 2.2);

    this.cloth.update(dt, vac);
    this.bulge = this.cloth.bulge;

    // ---- the weave brightens where the mouth has worked ------------------
    const mx = vac.mouthX, my = vac.mouthY;
    if (Math.abs(mx - this.x) < this.w * 0.62 && Math.abs(my - this.y) < this.h * 0.62) {
      const f = vac.field(mx, my, TMPF);
      if (f.strength > 0.18) this.wash(mx, my, 42, dt * 2.2 * clamp(f.strength, 0, 1.6));
    }
  }

  _fwump(ctx) {
    this.fwump = 1;
    const cl = this.cloth;
    for (let i = 0; i < cl.x.length; i++) {
      if (cl.pin[i]) continue;
      cl.vx[i] += (cl.hx[i] - cl.x[i]) * 7;
      cl.vy[i] += (cl.hy[i] - cl.y[i]) * 7;
    }
    if (ctx && ctx.audio) ctx.audio.pop('pop', 0.30);
    if (ctx && ctx.camera) ctx.camera.kick(1.6);
  }

  /**
   * The ring of hair the cushion has been sitting on. Revealed the first time
   * it is actually shoved off its spot: the world answering a push with
   * something new to do.
   */
  ringAlpha() { return clamp((this.moved - 10) / 26, 0, 1); }

  // ----------------------------------------------------------------- draw

  drawRing(ctx) {
    const a = this.ringAlpha();
    if (a <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = a * 0.75;
    ctx.strokeStyle = '#8d7e69';
    ctx.lineWidth = 3.2;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.ellipse(this.homeX, this.homeY, this.w * 0.46, this.h * 0.46, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = a * 0.28;
    ctx.fillStyle = '#6f6454';
    ctx.beginPath();
    ctx.ellipse(this.homeX, this.homeY, this.w * 0.44, this.h * 0.44, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  draw(ctx) {
    const cl = this.cloth;
    const C = this.cols, R = this.rows;
    ctx.save();
    // contact shadow: it stays on the floor while the face lifts off it
    ctx.fillStyle = 'rgba(28,20,34,0.26)';
    ctx.beginPath();
    ctx.ellipse(this.x + 6, this.y + this.h * 0.42, this.w * 0.52, this.h * 0.30, 0, 0, TAU);
    ctx.fill();

    const dirty = this.color, clean = this.cleanColor;
    for (let r = 0; r < R - 1; r++) {
      for (let c = 0; c < C - 1; c++) {
        const a = r * C + c, b = a + 1, d = a + C, e = d + 1;
        const lift = (cl.z[a] + cl.z[b] + cl.z[d] + cl.z[e]) * 0.25;
        const k = this.clean[r * (C - 1) + c];
        ctx.beginPath();
        ctx.moveTo(cl.x[a], cl.y[a]);
        ctx.lineTo(cl.x[b], cl.y[b]);
        ctx.lineTo(cl.x[e], cl.y[e]);
        ctx.lineTo(cl.x[d], cl.y[d]);
        ctx.closePath();
        ctx.fillStyle = k > 0.02 ? mix(dirty, clean, k) : dirty;
        ctx.fill();
        if (lift > 0.04) {
          // the dome catches the light: this is how the bulge reads on a flat
          // colour without drawing a single gradient
          ctx.globalAlpha = clamp(lift, 0, 1) * 0.55;
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }

    // the weave: interior grid lines, which also make the dome READ as a dome
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let r = 1; r < R - 1; r++) {
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        if (c === 0) ctx.moveTo(cl.x[i], cl.y[i]); else ctx.lineTo(cl.x[i], cl.y[i]);
      }
    }
    for (let c = 1; c < C - 1; c++) {
      for (let r = 0; r < R; r++) {
        const i = r * C + c;
        if (r === 0) ctx.moveTo(cl.x[i], cl.y[i]); else ctx.lineTo(cl.x[i], cl.y[i]);
      }
    }
    ctx.stroke();

    // the seam all round, and the button in the middle: it reads as a cushion
    ctx.strokeStyle = this.piping;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let c = 0; c < C; c++) { const i = c; if (c === 0) ctx.moveTo(cl.x[i], cl.y[i]); else ctx.lineTo(cl.x[i], cl.y[i]); }
    for (let r = 1; r < R; r++) { const i = r * C + C - 1; ctx.lineTo(cl.x[i], cl.y[i]); }
    for (let c = C - 2; c >= 0; c--) { const i = (R - 1) * C + c; ctx.lineTo(cl.x[i], cl.y[i]); }
    for (let r = R - 2; r >= 0; r--) { const i = r * C; ctx.lineTo(cl.x[i], cl.y[i]); }
    ctx.closePath();
    ctx.stroke();

    const mid = Math.floor(R / 2) * C + Math.floor(C / 2);
    ctx.fillStyle = 'rgba(40,58,78,0.45)';
    ctx.beginPath();
    ctx.ellipse(cl.x[mid], cl.y[mid], 5.5, 4, 0, 0, TAU);
    ctx.fill();

    // the fwump ripple: a ring leaving the middle of the face
    if (this.fwump > 0.02) {
      ctx.globalAlpha = this.fwump * 0.45;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cl.x[mid], cl.y[mid],
        this.w * (0.12 + (1 - this.fwump) * 0.40),
        this.h * (0.12 + (1 - this.fwump) * 0.40), 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  snapshot() {
    return {
      x: Math.round(this.x), y: Math.round(this.y),
      bulge: +this.bulge.toFixed(2), grip: +this.grip.toFixed(2),
      clean: +this.cleanFrac().toFixed(2), moved: Math.round(this.moved),
    };
  }
}

/** Cheap hex mix, cached: two flat colours and a blend factor in 16 steps. */
const MIXC = new Map();
function mix(a, b, t) {
  const q = Math.round(clamp(t, 0, 1) * 15);
  const key = a + b + q;
  let v = MIXC.get(key);
  if (v) return v;
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const k = q / 15;
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, k));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, k));
  const bl = Math.round(lerp(pa & 255, pb & 255, k));
  v = 'rgb(' + r + ',' + g + ',' + bl + ')';
  MIXC.set(key, v);
  return v;
}
