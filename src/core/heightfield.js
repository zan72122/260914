import { clamp } from './math.js';

/**
 * Small height grid over a world rectangle: sand, grain piles, carpet pile.
 *
 *   const hf = new HeightField({x0,y0,x1,y1}, 48, 48);
 *   hf.addRadial(x, y, 60, 14);              // heap some sand
 *   hf.addRadial(mouthX, mouthY, 26, -sucked); // the nozzle takes mass away
 *   hf.relax(dt, 0.55);                      // the sides collapse inward
 *   hf.drawShaded(ctx, '#e8d6a8', '#b99a5e');
 *
 * relax() moves mass from a cell to lower neighbours whenever the slope exceeds
 * the angle of repose, which is what makes a crater cave in.
 */
export class HeightField {
  constructor(rect, cols = 48, rows = 48) {
    this.rect = rect;
    this.cols = cols; this.rows = rows;
    this.cw = (rect.x1 - rect.x0) / cols;
    this.ch = (rect.y1 - rect.y0) / rows;
    this.h = new Float32Array(cols * rows);
    this._d = new Float32Array(cols * rows);
  }
  cx(wx) { return Math.floor((wx - this.rect.x0) / this.cw); }
  cy(wy) { return Math.floor((wy - this.rect.y0) / this.ch); }
  inside(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows; }
  idx(cx, cy) { return cy * this.cols + cx; }
  worldX(cx) { return this.rect.x0 + (cx + 0.5) * this.cw; }
  worldY(cy) { return this.rect.y0 + (cy + 0.5) * this.ch; }

  get(wx, wy) {
    const cx = this.cx(wx), cy = this.cy(wy);
    return this.inside(cx, cy) ? this.h[this.idx(cx, cy)] : 0;
  }
  set(wx, wy, v) {
    const cx = this.cx(wx), cy = this.cy(wy);
    if (this.inside(cx, cy)) this.h[this.idx(cx, cy)] = v;
  }
  add(wx, wy, v) {
    const cx = this.cx(wx), cy = this.cy(wy);
    if (this.inside(cx, cy)) this.h[this.idx(cx, cy)] = Math.max(0, this.h[this.idx(cx, cy)] + v);
  }

  /** Add (or, with a negative amount, remove) a smooth blob of mass. Returns how much actually moved. */
  addRadial(wx, wy, r, amount) {
    const c0 = this.cx(wx - r), c1 = this.cx(wx + r);
    const r0 = this.cy(wy - r), r1 = this.cy(wy + r);
    let moved = 0;
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        if (!this.inside(cx, cy)) continue;
        const dx = this.worldX(cx) - wx, dy = this.worldY(cy) - wy;
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const k = 1 - (d / r) * (d / r);
        const i = this.idx(cx, cy);
        const before = this.h[i];
        this.h[i] = Math.max(0, before + amount * k);
        moved += this.h[i] - before;
      }
    }
    return moved;
  }

  total() { let s = 0; for (let i = 0; i < this.h.length; i++) s += this.h[i]; return s; }

  /**
   * Slide mass downhill wherever the slope is steeper than the angle of repose.
   * `rate` is how fast it flows (9 = the default collapse; lower is treacly).
   */
  relax(dt, repose = 0.6, rateK = 9) {
    const h = this.h, d = this._d, C = this.cols, R = this.rows;
    d.fill(0);
    const maxDiff = repose * Math.min(this.cw, this.ch);
    const rate = clamp(dt * rateK, 0, 0.5);
    for (let y = 0; y < R; y++) {
      for (let x = 0; x < C; x++) {
        const i = y * C + x;
        const hv = h[i];
        if (hv <= 0) continue;
        for (let k = 0; k < 4; k++) {
          const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
          const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (nx < 0 || ny < 0 || nx >= C || ny >= R) continue;
          const j = ny * C + nx;
          const diff = hv - h[j];
          if (diff > maxDiff) {
            const move = (diff - maxDiff) * 0.25 * rate;
            d[i] -= move; d[j] += move;
          }
        }
      }
    }
    for (let i = 0; i < h.length; i++) h[i] = Math.max(0, h[i] + d[i]);
  }

  /**
   * Blur the field toward its neighbours — how you turn a pile of stacked
   * blobs into one soft heap. `amount` 0..1 per pass, mass conserving.
   */
  smooth(iters = 1, amount = 0.5) {
    const h = this.h, d = this._d, C = this.cols, R = this.rows;
    const k = clamp(amount, 0, 1);
    for (let it = 0; it < iters; it++) {
      d.set(h);
      for (let y = 0; y < R; y++) {
        for (let x = 0; x < C; x++) {
          const i = y * C + x;
          let sum = 0, n = 0;
          if (x > 0) { sum += d[i - 1]; n++; }
          if (x < C - 1) { sum += d[i + 1]; n++; }
          if (y > 0) { sum += d[i - C]; n++; }
          if (y < R - 1) { sum += d[i + C]; n++; }
          if (!n) continue;
          h[i] = Math.max(0, d[i] + (sum / n - d[i]) * k);
        }
      }
    }
  }

  /**
   * Cheap shaded render: cell quads tinted by height with light from top-left.
   * Scenes are free to draw the field themselves instead.
   */
  drawShaded(ctx, lowColor = '#e9d8ad', highColor = '#c2a066', maxH = 20) {
    const C = this.cols, R = this.rows, h = this.h;
    const cw = this.cw, ch = this.ch;
    const lo = hexToRgb(lowColor), hi = hexToRgb(highColor);
    for (let y = 0; y < R; y++) {
      for (let x = 0; x < C; x++) {
        const v = h[y * C + x];
        if (v <= 0.02) continue;
        const t = clamp(v / maxH, 0, 1);
        const gx = (x > 0 ? h[y * C + x - 1] : 0) - v;
        const gy = (y > 0 ? h[(y - 1) * C + x] : 0) - v;
        const shade = clamp(0.5 + (gx + gy) * 0.06, 0.25, 1.15);
        const r = Math.round((lo.r + (hi.r - lo.r) * t) * shade);
        const g = Math.round((lo.g + (hi.g - lo.g) * t) * shade);
        const b = Math.round((lo.b + (hi.b - lo.b) * t) * shade);
        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.fillRect(this.rect.x0 + x * cw - 0.4, this.rect.y0 + y * ch - 0.4, cw + 0.8, ch + 0.8);
      }
    }
  }
}

function hexToRgb(c) {
  const v = parseInt(c.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
