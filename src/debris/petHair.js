import { Debris, State } from './base.js';
import { clamp, smoothstep, TAU, noise1 } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

/**
 * Pet hair caught in a weave.
 *
 * This is the surface-that-is-not-the-floor half of the bedroom: short hairs
 * lying flat in a cushion's fabric, which the airflow gets under.
 *
 * The law, and why it is suction-specific:
 *  - every hair samples the field at its OWN tip, so the near side of the patch
 *    reacts first, exactly like a dust bunny's fibres;
 *  - a weak flow makes a hair STAND UP out of the weave (it is drawn longer,
 *    paler, and it casts a small shadow — it has left the surface);
 *  - a stronger one makes it LEAN, and it trembles while it leans;
 *  - past its own threshold it lets go — but the patch staggers those releases,
 *    so hovering produces a steady STREAM of hairs rather than one burst. That
 *    stream is the reward for holding still, and it is visibly finite: the patch
 *    thins as it pays out.
 *
 * A hair riding the air is drawn as a little curved stroke along its own
 * velocity, so the flow is visible in the shape of the thing moving through it.
 */
export class PetHair extends Debris {
  constructor(x, y, rng, opts = {}) {
    super(x, y);
    this.rng = rng;
    const n = this.n = opts.n === undefined ? 11 : opts.n;
    this.spread = opts.spread === undefined ? 24 : opts.spread;
    /** Hairs ride their host cushion: the cushion translates the patch. */
    this.host = opts.host || null;
    /** Anchored: clearStartZone leaves it where the cushion is. */
    this.anchored = !!opts.anchored;
    this.colors = opts.colors || ['#7a6552', '#9c8468', '#c9b79a', '#efe6d6'];
    this.onHair = null;           // scene callback (wx, wy) when one goes in

    this.bx = new Float32Array(n); this.by = new Float32Array(n);
    this.ang = new Float32Array(n);
    this.len = new Float32Array(n);
    this.stand = new Float32Array(n);
    this.lx = new Float32Array(n); this.ly = new Float32Array(n);   // tip lean
    this.vx2 = new Float32Array(n); this.vy2 = new Float32Array(n);
    this.thr = new Float32Array(n);
    this.st = new Uint8Array(n);        // 0 rooted, 1 flying, 2 gone
    this.col = new Uint8Array(n);
    this.seed = new Float32Array(n);
    // flying hairs keep absolute positions
    this.px = new Float32Array(n); this.py = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, TAU);
      const rr = Math.sqrt(rng.next()) * this.spread;
      this.bx[i] = Math.cos(a) * rr;
      this.by[i] = Math.sin(a) * rr * 0.72;
      this.ang[i] = rng.range(0, TAU);
      this.len[i] = rng.range(11, 19);
      this.thr[i] = rng.range(0.26, 0.50);
      this.col[i] = rng.int(0, this.colors.length - 1);
      this.seed[i] = rng.range(0, 100);
    }
    this.left = n;
    this.release = 0;             // stagger, so the flow is a stream
    this.lift = 0;                // 0..1 how far the patch as a whole has risen
  }
  get type() { return 'hair'; }

  /**
   * What the mouth has to reach: the middle of what is LEFT, not the middle of
   * where the patch started. The last hair or two are what the head has to be
   * brought over, and they are what the harness aims at.
   */
  aim(out) {
    out = out || { x: 0, y: 0 };
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.st[i] !== 0) continue;
      sx += this.x + this.bx[i]; sy += this.y + this.by[i]; n++;
    }
    if (!n) { out.x = this.x; out.y = this.y; return out; }
    out.x = sx / n; out.y = sy / n;
    return out;
  }

  translate(dx, dy) {
    super.translate(dx, dy);
    for (let i = 0; i < this.n; i++) { this.px[i] += dx; this.py[i] += dy; }
  }

  update(dt, vac, world) {
    if (this.state === State.DONE) return;
    this.t += dt;
    this.release -= dt;
    let strongest = 0;
    let lift = 0;
    let rooted = 0;

    for (let i = 0; i < this.n; i++) {
      const s0 = this.st[i];
      if (s0 === 2) continue;

      if (s0 === 1) {
        // ---- riding the air -------------------------------------------
        const f = vac.field(this.px[i], this.py[i], TMPF);
        this.vx2[i] += f.fx * 1700 * dt;
        this.vy2[i] += f.fy * 1700 * dt;
        const d = Math.exp(-3.4 * dt);
        this.vx2[i] *= d; this.vy2[i] *= d;
        this.px[i] += this.vx2[i] * dt;
        this.py[i] += this.vy2[i] * dt;
        if (f.inCapture) {
          this.st[i] = 2; this.left--;
          vac.transit({ kind: 'wisp', color: this.colors[this.col[i]], size: 6 });
          if (this.onHair) this.onHair(this.px[i], this.py[i]);
        } else if (f.strength < 0.05 && Math.hypot(this.vx2[i], this.vy2[i]) < 22) {
          // the air let it go before it got there: it settles back on the weave
          this.st[i] = 0;
          this.bx[i] = this.px[i] - this.x; this.by[i] = this.py[i] - this.y;
          this.stand[i] = 0; this.lx[i] = 0; this.ly[i] = 0;
          this.vx2[i] = 0; this.vy2[i] = 0;
        }
        continue;
      }

      // ---- rooted in the weave ------------------------------------------
      rooted++;
      const hx = this.x + this.bx[i], hy = this.y + this.by[i];
      const L = this.len[i];
      const tipX = hx + Math.cos(this.ang[i]) * L + this.lx[i];
      const tipY = hy + Math.sin(this.ang[i]) * L * 0.8 + this.ly[i];
      const f = vac.field(tipX, tipY, TMPF);
      const s = f.strength;
      if (s > strongest) strongest = s;

      // stand up out of the weave first, then lean
      const wantStand = smoothstep(0.05, 0.42, s);
      this.stand[i] += (wantStand - this.stand[i]) * (1 - Math.exp(-6 * dt));
      lift += this.stand[i];

      const l = Math.hypot(f.fx, f.fy) || 1;
      const reach = clamp(s * 30, 0, L * 1.5);
      let tx = (f.fx / l) * reach, ty = (f.fy / l) * reach;
      const tr = s * 2.6;
      tx += noise1(this.t * 24 + this.seed[i]) * tr;
      ty += noise1(this.t * 24 + this.seed[i] + 19) * tr;
      const o = 20;
      this.vx2[i] += (-2 * o * this.vx2[i] - o * o * (this.lx[i] - tx)) * dt;
      this.vy2[i] += (-2 * o * this.vy2[i] - o * o * (this.ly[i] - ty)) * dt;
      this.lx[i] += this.vx2[i] * dt;
      this.ly[i] += this.vy2[i] * dt;

      // the mouth is literally over it: it goes, cone or no cone. Without this
      // a hair sitting just BEHIND the mouth is in the 10% of the flow that is
      // off-axis for ever, and one stubborn hair can hold up a whole room.
      if (f.inCapture) {
        this.st[i] = 2; this.left--;
        vac.transit({ kind: 'wisp', color: this.colors[this.col[i]], size: 6 });
        if (this.onHair) this.onHair(tipX, tipY);
        continue;
      }
      // otherwise it lets go on its own, one every ~0.15s, so it reads as a flow
      if (s > this.thr[i] && this.stand[i] > 0.62 && this.release <= 0) {
        this.release = 0.155;
        this.st[i] = 1;
        this.px[i] = tipX; this.py[i] = tipY;
        this.vx2[i] = f.fx * 90; this.vy2[i] = f.fy * 90;
      }
    }

    this.strength = strongest;
    this.lift = rooted ? clamp(lift / rooted, 0, 1) : 0;
    this.state = this.left <= 0 ? State.CAPTURED
      : strongest > 0.1 ? State.REACTING : State.IDLE;
    if (this.left <= 0) {
      this.state = State.DONE;
      world && world.onCaptured && world.onCaptured(this);
    }
  }

  draw(ctx, cam) {
    if (this.state === State.DONE) return;
    ctx.save();
    ctx.lineCap = 'round';
    // shadows of the standing hairs: what makes "it has left the surface" read
    ctx.strokeStyle = 'rgba(40,28,18,0.22)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i < this.n; i++) {
      if (this.st[i] !== 0 || this.stand[i] < 0.12) continue;
      const hx = this.x + this.bx[i], hy = this.y + this.by[i];
      const L = this.len[i];
      const tx = hx + Math.cos(this.ang[i]) * L + this.lx[i];
      const ty = hy + Math.sin(this.ang[i]) * L * 0.8 + this.ly[i];
      ctx.moveTo(hx + 2, hy + 2);
      ctx.lineTo(tx + 2 + this.stand[i] * 3, ty + 2 + this.stand[i] * 3);
    }
    ctx.stroke();

    for (let i = 0; i < this.n; i++) {
      const s = this.st[i];
      if (s === 2) continue;
      const c = this.colors[this.col[i]];
      if (s === 0) {
        const hx = this.x + this.bx[i], hy = this.y + this.by[i];
        const L = this.len[i];
        const up = this.stand[i];
        const tx = hx + Math.cos(this.ang[i]) * L + this.lx[i];
        const ty = hy + Math.sin(this.ang[i]) * L * 0.8 + this.ly[i] - up * L * 0.5;
        const mx = (hx + tx) * 0.5 - this.ly[i] * 0.22;
        const my = (hy + ty) * 0.5 + this.lx[i] * 0.22 - up * L * 0.28;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.quadraticCurveTo(mx, my, tx, ty);
        ctx.strokeStyle = c;
        ctx.lineWidth = 1.5 + up * 1.1;
        ctx.globalAlpha = 0.7 + up * 0.3;
        ctx.stroke();
      } else {
        const vx = this.vx2[i], vy = this.vy2[i];
        const l = Math.hypot(vx, vy) || 1;
        const L = this.len[i];
        const ux = vx / l, uy = vy / l;
        ctx.beginPath();
        ctx.moveTo(this.px[i] - ux * L * 0.5, this.py[i] - uy * L * 0.5);
        ctx.quadraticCurveTo(
          this.px[i] - uy * L * 0.28, this.py[i] + ux * L * 0.28,
          this.px[i] + ux * L * 0.5, this.py[i] + uy * L * 0.5);
        ctx.strokeStyle = c;
        ctx.lineWidth = 2.0;
        ctx.globalAlpha = 1;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  snapshot() {
    const s = super.snapshot();
    s.hairs = this.left;
    s.lift = +this.lift.toFixed(2);
    return s;
  }
}
