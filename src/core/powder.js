import { clamp } from './math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };

/**
 * Powder density grid — flour, ash, fine dust.
 *
 * `HeightField` is a pile you dig a crater in; this is a *film* you drag
 * around. Density lies flat on the floor, and the airflow does three different
 * things to it, which is what makes powder read as air made visible:
 *
 *   advect(vac,dt,    every cell's mass slides a little way DOWN the flow
 *     gain, swirl)    vector, so the film draws itself into streaks that all
 *                     point at the mouth, and the streaks thin as they go in.
 *                     Mass-conserving: nothing is cleaned that did not go in.
 *   feather(rect,w)   fade the film out at the edges instead of ruling a line
 *   clipTo(rect)      cut it to the shape of what it is lying on
 *   suck(x,y,r,rate)  mass at the mouth is taken away and returned to the
 *                     caller, which is what fills the cup
 *   puff(x,y,r)       a fast approach lifts the film off the floor into
 *                     `Airborne` particles: the cloud that runs away from you
 *
 * The cleaned track is not a separate mask: where the density is gone, the
 * floor under it shows, and `cleanFrac()` is simply how much of the dirty area
 * is now below `cleanEps`.
 *
 *   const pw = new Powder({x0,y0,x1,y1}, 64, 64);
 *   pw.blob(x, y, 90, 1);                       // tip the bag over
 *   const got = pw.suck(vac.mouthX, vac.mouthY, 30, 2.4 * dt * f.strength);
 *   pw.advect(vac, dt);                         // mass-conserving
 *   pw.drawSoft(ctx, '#fdfaf3');
 */
export class Powder {
  constructor(rect, cols = 64, rows = 64, opts = {}) {
    this.rect = rect;
    this.cols = cols; this.rows = rows;
    this.cw = (rect.x1 - rect.x0) / cols;
    this.ch = (rect.y1 - rect.y0) / rows;
    this.d = new Float32Array(cols * rows);
    this._t = new Float32Array(cols * rows);
    this.mask = new Uint8Array(cols * rows);   // 1 = this cell started dirty
    this.dirtyCells = 0;
    this.cleanEps = opts.cleanEps === undefined ? 0.08 : opts.cleanEps;
    this.color = opts.color || '#fdfaf3';
    this.taken = 0;                            // total mass removed, ever
  }

  cx(wx) { return Math.floor((wx - this.rect.x0) / this.cw); }
  cy(wy) { return Math.floor((wy - this.rect.y0) / this.ch); }
  inside(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows; }
  idx(cx, cy) { return cy * this.cols + cx; }
  worldX(cx) { return this.rect.x0 + (cx + 0.5) * this.cw; }
  worldY(cy) { return this.rect.y0 + (cy + 0.5) * this.ch; }
  get(wx, wy) {
    const cx = this.cx(wx), cy = this.cy(wy);
    return this.inside(cx, cy) ? this.d[this.idx(cx, cy)] : 0;
  }

  /** Lay a soft round patch of powder down. Call it as often as you like. */
  blob(wx, wy, r, amount = 1) {
    const c0 = this.cx(wx - r), c1 = this.cx(wx + r);
    const r0 = this.cy(wy - r), r1 = this.cy(wy + r);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        if (!this.inside(cx, cy)) continue;
        const dx = this.worldX(cx) - wx, dy = this.worldY(cy) - wy;
        const q = Math.hypot(dx, dy) / r;
        if (q > 1) continue;
        const i = this.idx(cx, cy);
        this.d[i] = clamp(this.d[i] + amount * (1 - q * q), 0, 2.5);
      }
    }
  }

  /** Freeze the current coverage as "what has to be cleaned". */
  markDirty() {
    let n = 0;
    for (let i = 0; i < this.d.length; i++) {
      const m = this.d[i] > this.cleanEps ? 1 : 0;
      this.mask[i] = m; n += m;
    }
    this.dirtyCells = n;
    return n;
  }

  /** 0..1 of the originally dirty area that is now clean. The progress bar. */
  cleanFrac() {
    if (!this.dirtyCells) return 1;
    let c = 0;
    for (let i = 0; i < this.d.length; i++) if (this.mask[i] && this.d[i] <= this.cleanEps) c++;
    return c / this.dirtyCells;
  }

  total() { let s = 0; for (let i = 0; i < this.d.length; i++) s += this.d[i]; return s; }

  /**
   * Take powder away at a point. Returns the mass actually removed, which is
   * what a scene turns into cup volume — so an empty patch gives nothing back
   * and the scene can tell the difference.
   */
  suck(wx, wy, r, rate) {
    if (rate <= 0) return 0;
    const c0 = this.cx(wx - r), c1 = this.cx(wx + r);
    const r0 = this.cy(wy - r), r1 = this.cy(wy + r);
    let got = 0;
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        if (!this.inside(cx, cy)) continue;
        const dx = this.worldX(cx) - wx, dy = this.worldY(cy) - wy;
        const q = Math.hypot(dx, dy) / r;
        if (q > 1) continue;
        const i = this.idx(cx, cy);
        const take = Math.min(this.d[i], rate * (1 - q * q));
        this.d[i] -= take;
        got += take;
      }
    }
    this.taken += got;
    return got;
  }

  /**
   * Slide the density along the airflow. This is the streaking: the film is
   * sampled one flow-step upwind of each cell, so everything downstream of the
   * mouth stretches into lines that converge on it.
   *
   *   pw.advect(vac, dt);                   // straight in
   *   pw.advect(vac, dt, 380, 0.55);        // slower, and it curls as it comes
   *
   * `gain` is how far a unit of flow moves the film in one second; `swirl` is a
   * rotation in radians applied to the flow vector, scaled DOWN where the flow
   * is strong — so the film curls in from the far edge and straightens out as it
   * reaches the mouth, which is what makes it read as air rather than as a pull.
   *
   * **Mass-conserving.** Semi-Lagrangian sampling leaks mass at the leading edge
   * of the film, and that leak is INVISIBLE CLEANING: powder disappearing
   * without going up the tube, so the room gets shorter the harder the air
   * blows. Whatever the pass lost is given straight back to the cells the air is
   * touching (`was / now` is exactly that ratio), so the powder GATHERS in the
   * flow instead of evaporating. The cap is only a guard against `now`
   * collapsing to nothing.
   *
   * `dt` is clamped internally, so a dropped frame cannot blow the film apart.
   */
  advect(vac, dt, gain = 900, swirl = 0) {
    if (!vac) return 0;
    const C = this.cols, R = this.rows, d = this.d, t = this._t;
    const step = Math.min(0.05, dt);
    const x0 = this.rect.x0, y0 = this.rect.y0, cw = this.cw, ch = this.ch;
    if (!this._touch || this._touch.length !== C * R) this._touch = new Int32Array(C * R);
    const touch = this._touch;
    let nt = 0, was = 0, now = 0;
    t.set(d);
    for (let cy = 0; cy < R; cy++) {
      const wy = this.worldY(cy);
      for (let cx = 0; cx < C; cx++) {
        const i = cy * C + cx;
        const v0 = t[i];
        if (v0 <= 0.0005) { d[i] = v0; continue; }
        const wx = this.worldX(cx);
        const f = vac.field(wx, wy, TMPF);
        if (f.strength < 0.02) { d[i] = v0; continue; }
        // where did this cell's powder come from? one flow-step back upwind
        let fx = f.fx, fy = f.fy;
        if (swirl) {
          const a = swirl / (1 + f.strength * 3.4);
          const ca = Math.cos(a), sa = Math.sin(a);
          fx = f.fx * ca - f.fy * sa;
          fy = f.fx * sa + f.fy * ca;
        }
        const sx = clamp((wx - fx * gain * step - x0) / cw - 0.5, 0, C - 1.001);
        const sy = clamp((wy - fy * gain * step - y0) / ch - 0.5, 0, R - 1.001);
        const ix = sx | 0, iy = sy | 0;
        const tx = sx - ix, ty = sy - iy;
        const q = iy * C + ix;
        const aa = t[q], bb = t[q + 1], cc = t[q + C], ee = t[q + C + 1];
        const top = aa + (bb - aa) * tx;
        const bot = cc + (ee - cc) * tx;
        const v = top + (bot - top) * ty;
        // Blend, so weak flow only smears it and strong flow moves it bodily.
        // The ceiling matters: at k = 1 a cell is REPLACED by whatever is one
        // flow-step upwind, which in a strong flow is often bare floor, and the
        // give-back below then has to restore more mass than it can account
        // for. 0.72 is the pantry's number, proved over a whole room.
        const k = clamp(f.strength * 1.6, 0, 0.72);
        const nv = v0 + (v - v0) * k;
        d[i] = nv;
        touch[nt++] = i;
        was += v0; now += nv;
      }
    }
    if (nt && now > 1e-6 && was > now) {
      const k = Math.min(4, was / now);
      for (let i = 0; i < nt; i++) d[touch[i]] *= k;
      return was;
    }
    return was;
  }

  /**
   * Fade the film out over `w` world px inside the edges of a rectangle (the
   * film's own, by default), so it ends in a soft drift instead of a ruled
   * line. Call it once after laying the powder down and BEFORE `markDirty()`,
   * or the feathered edge counts as dirt that can never quite be cleaned.
   */
  feather(rect, w = 40) {
    const r = rect || this.rect;
    const wd = Math.max(1e-3, w);
    for (let cy = 0; cy < this.rows; cy++) {
      const wy = this.worldY(cy);
      for (let cx = 0; cx < this.cols; cx++) {
        const i = this.idx(cx, cy);
        if (this.d[i] <= 0) continue;
        const wx = this.worldX(cx);
        const e = Math.min(wx - r.x0, r.x1 - wx, wy - r.y0, r.y1 - wy);
        if (e >= wd) continue;
        this.d[i] *= clamp(e / wd, 0, 1);
      }
    }
  }

  /**
   * Wipe everything outside a rectangle. A film laid down with round `blob`s
   * spills past whatever it is meant to be sitting on (a mat, a tile, the floor
   * inside a doorway); this cuts it to that shape. Like `feather`, use it
   * before `markDirty()`.
   */
  clipTo(rect) {
    for (let cy = 0; cy < this.rows; cy++) {
      const wy = this.worldY(cy);
      for (let cx = 0; cx < this.cols; cx++) {
        const wx = this.worldX(cx);
        if (wx >= rect.x0 && wx <= rect.x1 && wy >= rect.y0 && wy <= rect.y1) continue;
        this.d[this.idx(cx, cy)] = 0;
      }
    }
  }

  /**
   * Lift a patch off the floor into the air. Returns the mass lifted; the
   * caller spawns that as `Airborne` particles (this module deliberately does
   * not know about them, so a scene can decide what the cloud looks like).
   *
   *   const m = pw.puff(x, y, 60);
   *   for (let i = 0; i < m * 8; i++) air.spawn(...);
   */
  puff(wx, wy, r, fraction = 0.6) {
    const c0 = this.cx(wx - r), c1 = this.cx(wx + r);
    const r0 = this.cy(wy - r), r1 = this.cy(wy + r);
    let lifted = 0;
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        if (!this.inside(cx, cy)) continue;
        const dx = this.worldX(cx) - wx, dy = this.worldY(cy) - wy;
        const q = Math.hypot(dx, dy) / r;
        if (q > 1) continue;
        const i = this.idx(cx, cy);
        const take = this.d[i] * fraction * (1 - q * q);
        this.d[i] -= take;
        lifted += take;
      }
    }
    return lifted;
  }

  /**
   * Soft render: one rounded blob per cell, no gradients and no filter. Two
   * passes (a wide faint one, a tight bright one) give it a dusty edge for the
   * price of two flat fills per cell — see the performance rules in
   * docs/ARCHITECTURE.md for why this is not a blur.
   */
  drawSoft(ctx, color) {
    const C = this.cols, R = this.rows, d = this.d;
    const cw = this.cw, ch = this.ch;
    const col = color || this.color;
    ctx.save();
    ctx.fillStyle = col;
    for (let cy = 0; cy < R; cy++) {
      for (let cx = 0; cx < C; cx++) {
        const v = d[cy * C + cx];
        if (v <= 0.02) continue;
        const a = clamp(v * 0.85, 0, 0.92);
        ctx.globalAlpha = a * 0.45;
        ctx.fillRect(this.rect.x0 + cx * cw - cw * 0.5, this.rect.y0 + cy * ch - ch * 0.5, cw * 2, ch * 2);
      }
    }
    for (let cy = 0; cy < R; cy++) {
      for (let cx = 0; cx < C; cx++) {
        const v = d[cy * C + cx];
        if (v <= 0.12) continue;
        ctx.globalAlpha = clamp(v * 0.95, 0, 1);
        ctx.fillRect(this.rect.x0 + cx * cw - 0.4, this.rect.y0 + cy * ch - 0.4, cw + 0.8, ch + 0.8);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  snapshot() {
    return { total: +this.total().toFixed(1), clean: +this.cleanFrac().toFixed(3), taken: +this.taken.toFixed(1) };
  }
}
