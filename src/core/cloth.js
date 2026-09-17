import { clamp } from './math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

/**
 * A square of fabric — a cushion face, a curtain hem, a blanket corner.
 *
 * The suction-specific thing fabric does is BULGE: it cannot be picked up, but
 * the weave lifts toward the mouth, the whole surface domes, and when the air
 * moves away it sags back with a wobble. That is a grid of springs, each node
 * pulled by the field it samples at its own position (so the near corner goes
 * first, exactly like a dust bunny's fibres), held to its neighbours so the
 * cloth stays a cloth, and held to its rest position by the seams.
 *
 *   this.cloth = new Cloth({x0,y0,x1,y1}, 9, 7, { stiffness: 26 });
 *   this.cloth.update(dt, vac);
 *   this.cloth.draw(ctx, { fill: '#c9a98b' });      // or draw an image in slices
 *   const b = this.cloth.bulgeAt(x, y);            // 0..1: how far it has lifted
 *
 * `drawImage(ctx, img)` deforms a bitmap across the same grid one quad-strip at
 * a time — cheap, because it is N small `drawImage` calls with a transform, not
 * a per-pixel warp.
 */
export class Cloth {
  constructor(rect, cols = 9, rows = 7, opts = {}) {
    this.rect = rect;
    this.cols = Math.max(2, cols);
    this.rows = Math.max(2, rows);
    this.stiffness = opts.stiffness === undefined ? 24 : opts.stiffness;  // back to rest
    this.link = opts.link === undefined ? 34 : opts.link;                 // to neighbours
    /**
     * Damping RATIO, not a rate: 1 is critical. The two spring constants above
     * are angular frequencies, so the damping that settles them has to be
     * derived from both — a fixed rate leaves a 9x7 grid ringing forever, which
     * is what a cushion must never do.
     */
    this.damp = opts.damp === undefined ? 0.95 : opts.damp;
    this.gain = opts.gain === undefined ? 30 : opts.gain;                 // px of lift per unit strength
    /** Edges that are sewn down and cannot move: 'all' | 'none' | {l,r,t,b} */
    this.pinned = opts.pinned === undefined ? 'edges' : opts.pinned;

    const n = this.cols * this.rows;
    this.hx = new Float32Array(n); this.hy = new Float32Array(n);   // rest
    this.x = new Float32Array(n); this.y = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n);
    this.z = new Float32Array(n);                                   // lift 0..1
    this.pin = new Uint8Array(n);
    const w = rect.x1 - rect.x0, h = rect.y1 - rect.y0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        this.hx[i] = rect.x0 + (c / (this.cols - 1)) * w;
        this.hy[i] = rect.y0 + (r / (this.rows - 1)) * h;
        this.x[i] = this.hx[i]; this.y[i] = this.hy[i];
        const edge = c === 0 || r === 0 || c === this.cols - 1 || r === this.rows - 1;
        this.pin[i] = this.pinned === 'none' ? 0 : (this.pinned === 'all' ? 1 : (edge ? 1 : 0));
      }
    }
    this.bulge = 0;         // 0..1 how domed the whole thing is, for the scene
  }

  /** How far the cloth has lifted under a world point (0..1). */
  bulgeAt(wx, wy) {
    const c = clamp(Math.round(((wx - this.rect.x0) / (this.rect.x1 - this.rect.x0)) * (this.cols - 1)), 0, this.cols - 1);
    const r = clamp(Math.round(((wy - this.rect.y0) / (this.rect.y1 - this.rect.y0)) * (this.rows - 1)), 0, this.rows - 1);
    return this.z[r * this.cols + c];
  }

  update(dt, vac) {
    const C = this.cols, R = this.rows;
    const k = this.stiffness, kl = this.link;
    const omega = Math.sqrt(k * k + kl * kl);
    const dm = Math.exp(-2 * this.damp * omega * dt);
    let peak = 0;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        if (this.pin[i]) { this.z[i] += (0 - this.z[i]) * (1 - Math.exp(-8 * dt)); continue; }
        const f = vac ? vac.field(this.x[i], this.y[i], TMPF) : null;
        const s = f ? f.strength : 0;
        // the target this node wants to sit at: its rest place, pulled toward
        // the mouth by the air it can feel where it actually is
        let tx = this.hx[i], ty = this.hy[i];
        if (f) { tx += f.fx * this.gain; ty += f.fy * this.gain; }
        let ax = k * k * (tx - this.x[i]);
        let ay = k * k * (ty - this.y[i]);
        // neighbour links keep it a sheet and not a field of independent dots
        let nx = 0, ny = 0, nn = 0;
        if (c > 0) { nx += this.x[i - 1] + (this.hx[i] - this.hx[i - 1]); ny += this.y[i - 1] + (this.hy[i] - this.hy[i - 1]); nn++; }
        if (c < C - 1) { nx += this.x[i + 1] + (this.hx[i] - this.hx[i + 1]); ny += this.y[i + 1] + (this.hy[i] - this.hy[i + 1]); nn++; }
        if (r > 0) { nx += this.x[i - C] + (this.hx[i] - this.hx[i - C]); ny += this.y[i - C] + (this.hy[i] - this.hy[i - C]); nn++; }
        if (r < R - 1) { nx += this.x[i + C] + (this.hx[i] - this.hx[i + C]); ny += this.y[i + C] + (this.hy[i] - this.hy[i + C]); nn++; }
        if (nn) { ax += kl * kl * (nx / nn - this.x[i]); ay += kl * kl * (ny / nn - this.y[i]); }
        this.vx[i] = (this.vx[i] + ax * dt) * dm;
        this.vy[i] = (this.vy[i] + ay * dt) * dm;
        this.x[i] += this.vx[i] * dt;
        this.y[i] += this.vy[i] * dt;
        // the lift: how far this node has left its rest place, normalised
        const off = Math.hypot(this.x[i] - this.hx[i], this.y[i] - this.hy[i]);
        const want = clamp(off / 26 + s * 0.35, 0, 1);
        this.z[i] += (want - this.z[i]) * (1 - Math.exp(-11 * dt));
        if (this.z[i] > peak) peak = this.z[i];
      }
    }
    this.bulge = peak;
  }

  /** Flat fill with the deformed grid, shaded by lift. */
  draw(ctx, opts = {}) {
    const C = this.cols, R = this.rows;
    const fill = opts.fill || '#c7a98b';
    const hi = opts.highlight || 'rgba(255,255,255,0.22)';
    ctx.save();
    for (let r = 0; r < R - 1; r++) {
      for (let c = 0; c < C - 1; c++) {
        const a = r * C + c, b = a + 1, d = a + C, e = d + 1;
        const lift = (this.z[a] + this.z[b] + this.z[d] + this.z[e]) * 0.25;
        ctx.beginPath();
        ctx.moveTo(this.x[a], this.y[a]);
        ctx.lineTo(this.x[b], this.y[b]);
        ctx.lineTo(this.x[e], this.y[e]);
        ctx.lineTo(this.x[d], this.y[d]);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (lift > 0.03) {
          ctx.globalAlpha = clamp(lift, 0, 1) * 0.8;
          ctx.fillStyle = hi;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }
    ctx.restore();
  }

  /**
   * Deform a bitmap across the grid: one `drawImage` per cell, clipped to the
   * quad. Cheap enough for a cushion face at 9x7; do not push it to 40x40.
   */
  drawImage(ctx, img, opts = {}) {
    const C = this.cols, R = this.rows;
    const iw = img.width, ih = img.height;
    ctx.save();
    for (let r = 0; r < R - 1; r++) {
      for (let c = 0; c < C - 1; c++) {
        const a = r * C + c, b = a + 1, d = a + C;
        const sx = (c / (C - 1)) * iw, sy = (r / (R - 1)) * ih;
        const sw = iw / (C - 1), sh = ih / (R - 1);
        // affine from the quad's three corners is enough: the fourth is close
        const m11 = (this.x[b] - this.x[a]) / sw, m12 = (this.y[b] - this.y[a]) / sw;
        const m21 = (this.x[d] - this.x[a]) / sh, m22 = (this.y[d] - this.y[a]) / sh;
        ctx.save();
        ctx.transform(m11, m12, m21, m22, this.x[a], this.y[a]);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw + 0.6, sh + 0.6);
        ctx.restore();
      }
    }
    if (opts.shade !== false) {
      for (let r = 0; r < R - 1; r++) {
        for (let c = 0; c < C - 1; c++) {
          const a = r * C + c, b = a + 1, d = a + C, e = d + 1;
          const lift = (this.z[a] + this.z[b] + this.z[d] + this.z[e]) * 0.25;
          if (lift < 0.04) continue;
          ctx.globalAlpha = clamp(lift, 0, 1) * 0.35;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(this.x[a], this.y[a]);
          ctx.lineTo(this.x[b], this.y[b]);
          ctx.lineTo(this.x[e], this.y[e]);
          ctx.lineTo(this.x[d], this.y[d]);
          ctx.closePath(); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /** A world point on the cloth surface, for spawning hair/fibres out of it. */
  pointAt(u, v, out) {
    const c = clamp(Math.round(u * (this.cols - 1)), 0, this.cols - 1);
    const r = clamp(Math.round(v * (this.rows - 1)), 0, this.rows - 1);
    const i = r * this.cols + c;
    out.x = this.x[i]; out.y = this.y[i];
    return out;
  }

  snapshot() { return { bulge: +this.bulge.toFixed(3) }; }
}
