// cloth.js -- tiny Verlet cloth (rope / strip / mesh) plus its renderer.
//
// Deliberately cheap: typed arrays, no per-frame allocation, two constraint
// iterations. A towel is a 6x7 grid (30 quads); the sheet is the only mesh
// large enough to matter and it is still under 100 quads.

const SHADES = 10;
const WETS = 6;

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/**
 * Pre-bake every colour string this cloth will ever need:
 * palette[wetBucket][shadeBucket]. Building strings in the draw loop is the
 * single easiest way to lose 60fps on mobile Safari, so we never do it.
 */
export function makePalette(r, g, b) {
  const p = new Array(WETS);
  for (let wi = 0; wi < WETS; wi++) {
    const wet = wi / (WETS - 1);
    // Wet cloth: darker and more saturated, pulled slightly toward blue.
    const wr = r * (1 - 0.46 * wet);
    const wg = g * (1 - 0.40 * wet);
    const wb = b * (1 - 0.24 * wet);
    const row = new Array(SHADES);
    for (let si = 0; si < SHADES; si++) {
      const k = 0.68 + 0.46 * (si / (SHADES - 1));
      row[si] = 'rgb(' + Math.round(clamp(wr * k, 0, 255)) + ',' +
        Math.round(clamp(wg * k, 0, 255)) + ',' +
        Math.round(clamp(wb * k, 0, 255)) + ')';
    }
    p[wi] = row;
  }
  return p;
}

export function wetBucket(wetness) {
  return clamp(Math.round(wetness * (WETS - 1)), 0, WETS - 1);
}

/** Darken any rgb triple by wetness -- used for spots, basket layers, etc. */
export function darken(r, g, b, wetness, k) {
  const m = k === undefined ? 1 : k;
  return 'rgb(' + Math.round(clamp(r * (1 - 0.46 * wetness) * m, 0, 255)) + ',' +
    Math.round(clamp(g * (1 - 0.40 * wetness) * m, 0, 255)) + ',' +
    Math.round(clamp(b * (1 - 0.24 * wetness) * m, 0, 255)) + ')';
}

export class Cloth {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    const n = cols * rows;
    this.n = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.ox = new Float32Array(n); // previous position (Verlet velocity)
    this.oy = new Float32Array(n);
    this.pinned = new Uint8Array(n);
    this.pinX = new Float32Array(n);
    this.pinY = new Float32Array(n);
    this.restH = 1;
    this.restV = 1;
    this.gravity = 2000;
    this.damping = 0.985;
    this.windScale = 1;
    this.iterations = 3;
  }

  /** Lay the grid out as an axis-aligned rectangle, at rest. */
  reset(x, y, w, h) {
    const { cols, rows } = this;
    this.restH = w / (cols - 1);
    this.restV = h / (rows - 1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const px = x + c * this.restH;
        const py = y + r * this.restV;
        this.x[i] = this.ox[i] = px;
        this.y[i] = this.oy[i] = py;
      }
    }
  }

  translate(dx, dy) {
    for (let i = 0; i < this.n; i++) {
      this.x[i] += dx; this.ox[i] += dx;
      this.y[i] += dy; this.oy[i] += dy;
      if (this.pinned[i]) { this.pinX[i] += dx; this.pinY[i] += dy; }
    }
  }

  pin(i, x, y) {
    this.pinned[i] = 1;
    this.pinX[i] = x === undefined ? this.x[i] : x;
    this.pinY[i] = y === undefined ? this.y[i] : y;
  }

  unpin(i) { this.pinned[i] = 0; }

  unpinAll() { this.pinned.fill(0); }

  idx(c, r) { return r * this.cols + c; }

  centroid(out) {
    let sx = 0, sy = 0;
    for (let i = 0; i < this.n; i++) { sx += this.x[i]; sy += this.y[i]; }
    out.x = sx / this.n; out.y = sy / this.n;
    return out;
  }

  bounds(out) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < this.n; i++) {
      const x = this.x[i], y = this.y[i];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    out.x0 = x0; out.y0 = y0; out.x1 = x1; out.y1 = y1;
    return out;
  }

  /**
   * One Verlet integration + constraint relaxation step.
   * windX/windY are accelerations (px/s^2); gy is a gravity multiplier so a
   * pair of jeans can feel heavier than a towel with no extra code.
   */
  step(dt, windX, windY, gy) {
    const n = this.n;
    const g = this.gravity * (gy === undefined ? 1 : gy);
    const d = this.damping;
    const wx = windX * this.windScale;
    const wy = windY * this.windScale;
    const dt2 = dt * dt;
    for (let i = 0; i < n; i++) {
      if (this.pinned[i]) {
        this.x[i] = this.ox[i] = this.pinX[i];
        this.y[i] = this.oy[i] = this.pinY[i];
        continue;
      }
      const px = this.x[i], py = this.y[i];
      // A little per-column phase so a flat sheet does not move as one board.
      const nx = px + (px - this.ox[i]) * d + wx * dt2;
      const ny = py + (py - this.oy[i]) * d + (wy + g) * dt2;
      this.ox[i] = px; this.oy[i] = py;
      this.x[i] = nx; this.y[i] = ny;
    }
    for (let it = 0; it < this.iterations; it++) this.solve();
  }

  solve() {
    const { cols, rows, restH, restV } = this;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (c < cols - 1) this.constrain(i, i + 1, restH);
        if (r < rows - 1) this.constrain(i, i + cols, restV);
      }
    }
    // Pins win, always.
    for (let i = 0; i < this.n; i++) {
      if (this.pinned[i]) { this.x[i] = this.pinX[i]; this.y[i] = this.pinY[i]; }
    }
  }

  constrain(a, b, rest) {
    const dx = this.x[b] - this.x[a];
    const dy = this.y[b] - this.y[a];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-5) return;
    const diff = (d - rest) / d * 0.5;
    const pa = this.pinned[a], pb = this.pinned[b];
    if (pa && pb) return;
    let fa = 1, fb = 1;
    if (pa) { fa = 0; fb = 2; }
    if (pb) { fb = 0; fa = 2; }
    const ox = dx * diff, oy = dy * diff;
    this.x[a] += ox * fa; this.y[a] += oy * fa;
    this.x[b] -= ox * fb; this.y[b] -= oy * fb;
  }
}

/**
 * Strip renderer: one filled quad per cell, shaded by how foreshortened the
 * cell is. Compressed cells read as folds (dark), stretched cells catch the
 * light. That is all the "2.5D" this game needs.
 */
export function drawCloth(ctx, cl, palette, wetness, lightBias) {
  const { cols, rows } = cl;
  const pal = palette[wetBucket(wetness)];
  const rest = cl.restH * cl.restV;
  const lb = lightBias === undefined ? 0 : lightBias;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i = r * cols + c;
      const j = i + 1;
      const k = i + cols;
      const l = k + 1;
      const ax = cl.x[i], ay = cl.y[i];
      const bx = cl.x[j], by = cl.y[j];
      const cx2 = cl.x[l], cy2 = cl.y[l];
      const dx2 = cl.x[k], dy2 = cl.y[k];
      // Signed area of the quad ~= how much of the cell faces the viewer.
      const area = Math.abs((bx - ax) * (dy2 - ay) - (dx2 - ax) * (by - ay));
      let t = rest > 0 ? area / rest : 1;
      t = t * 0.9 + lb;
      const si = clamp((t * SHADES) | 0, 0, SHADES - 1);
      ctx.fillStyle = pal[si];
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.lineTo(cx2, cy2);
      ctx.lineTo(dx2, dy2);
      ctx.closePath();
      ctx.fill();
      // Same-colour hairline stroke hides the seams between quads.
      ctx.strokeStyle = pal[si];
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

/** Soft dark blotch used for the first wet spots. */
export function drawWetSpot(ctx, x, y, r, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(40,58,86,0.55)';
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
