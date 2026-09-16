// cloth.js -- tiny Verlet cloth (rope / strip / mesh) plus its renderer.
//
// Deliberately cheap: typed arrays, no per-frame allocation, two constraint
// iterations. A towel is a 6x7 grid (30 quads); the sheet is the only mesh
// large enough to matter and it is still under 100 quads.

// Enough steps that neighbouring quads never step by a visible amount. The
// palette is baked once per item, so this costs 6 x 32 strings and nothing
// per frame.
const SHADES = 32;
const WETS = 6;

// Per-quad seam stroke: off. See quad() below -- the half-pixel expansion does
// the same job without a second path per cell. Kept as a switch so the old
// behaviour can be compared side by side.
const SEAM_STROKE = false;
const EXPAND = 0.5;

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
  if (SEAM_STROKE) ctx.lineWidth = 1;
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
      quad(ctx, ax, ay, bx, by, cx2, cy2, dx2, dy2);
      ctx.fill();
      if (SEAM_STROKE) {
        ctx.strokeStyle = pal[si];
        ctx.stroke();
      }
    }
  }
}

/**
 * One quad, expanded half a pixel outward from its own centre.
 *
 * The seam between two neighbouring cells is a hairline of background colour:
 * the two triangles either side of the shared edge are antialiased
 * independently and neither covers the edge completely. Stroking every quad
 * in its own fill colour hid it, at the cost of a stroke per cell -- and on a
 * phone that stroke is the single most expensive thing the cloth does.
 * Growing the quad by half a pixel covers the same seam with no extra path.
 */
function quad(ctx, ax, ay, bx, by, cx, cy, dx, dy) {
  const mx = (ax + bx + cx + dx) * 0.25;
  const my = (ay + by + cy + dy) * 0.25;
  ctx.beginPath();
  ctx.moveTo(ax + sgn(ax - mx), ay + sgn(ay - my));
  ctx.lineTo(bx + sgn(bx - mx), by + sgn(by - my));
  ctx.lineTo(cx + sgn(cx - mx), cy + sgn(cy - my));
  ctx.lineTo(dx + sgn(dx - mx), dy + sgn(dy - my));
  ctx.closePath();
}

function sgn(v) { return v > 0 ? EXPAND : v < 0 ? -EXPAND : 0; }

/** Soft dark blotch used for the first wet spots. */
export function drawWetSpot(ctx, x, y, r, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(30,46,74,0.72)';
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Additions for the big sheet (phase 2). Append-only: nothing above changed.
//
// The sheet is the only cloth in the game that has to read as a *volume* --
// something with a front and a back that comes toward the camera and folds
// over itself. That needs two things the small items do not: a rest length
// that can grow (2.5D "closer to the lens"), and per-quad lighting from a
// cheap height field. Both live here so `Cloth` itself stays dumb.
// ---------------------------------------------------------------------------

/**
 * Hard cap on Verlet velocity (the per-step delta). A sheet with three pegs
 * off takes a lot of wind; without this a gust plus a growing rest length can
 * push a point far enough in one step that the constraint solver never catches
 * up and the mesh turns inside out. Cheap insurance, runs on 70 points.
 */
export function clampClothVelocity(cl, maxStep) {
  const n = cl.n;
  const m2 = maxStep * maxStep;
  for (let i = 0; i < n; i++) {
    if (cl.pinned[i]) continue;
    const vx = cl.x[i] - cl.ox[i];
    const vy = cl.y[i] - cl.oy[i];
    const d2 = vx * vx + vy * vy;
    if (d2 > m2) {
      const k = maxStep / Math.sqrt(d2);
      cl.ox[i] = cl.x[i] - vx * k;
      cl.oy[i] = cl.y[i] - vy * k;
    }
  }
}

/**
 * 2.5D scale: growing the rest lengths makes the mesh physically bigger while
 * its pinned points stay put, which is exactly what a sheet billowing toward
 * the viewer looks like. The constraint solver does the rest.
 */
export function setClothScale(cl, baseH, baseV, zoom) {
  cl.restH = baseH * zoom;
  cl.restV = baseV * zoom;
}

// Light comes from up and to the left, slightly in front of the cloth.
const LX = -0.46, LY = -0.62, LZ = 0.64;

/**
 * Lit strip renderer.
 *
 * `z` is a per-point height field (same indexing as the mesh) in units of one
 * rest cell. The quad normal is approximated as (-dz/dx, -dz/dy, 1) in grid
 * space and dotted with the light, so a fold that turns away from the window
 * goes dark and the crest beside it catches the light. Combined with the
 * foreshortening term from `drawCloth`, folds read as real volume.
 *
 * `sheen` (0..1) is the "it just flipped over" highlight: a soft band that
 * sweeps across the columns during the big release.
 */
export function drawClothLit(ctx, cl, palette, wetness, z, sheen, sheenPos, lightBias) {
  const { cols, rows } = cl;
  const pal = palette[wetBucket(wetness)];
  const rest = cl.restH * cl.restV;
  const lb = lightBias === undefined ? 0 : lightBias;
  const sh = sheen === undefined ? 0 : sheen;
  const sp = sheenPos === undefined ? 0 : sheenPos;
  const invC = cols > 1 ? 1 / (cols - 1) : 1;
  const qc = cols - 1, qr = rows - 1;
  if (qc < 1 || qr < 1) return;
  const raw = scratchA(qc * qr);
  const lit = scratchB(qc * qr);
  if (SEAM_STROKE) ctx.lineWidth = 1;

  // --- pass 1: how bright each quad wants to be -------------------------
  for (let r = 0; r < qr; r++) {
    for (let c = 0; c < qc; c++) {
      const i = r * cols + c;
      const j = i + 1;
      const k = i + cols;
      const l = k + 1;
      const ax = cl.x[i], ay = cl.y[i];
      const bx = cl.x[j], by = cl.y[j];
      const dx2 = cl.x[k], dy2 = cl.y[k];
      const area = Math.abs((bx - ax) * (dy2 - ay) - (dx2 - ax) * (by - ay));
      // Foreshortening, and the surface normal from the height field. Both
      // are kept well clear of the ends of the ramp so that flat cloth sits
      // in the middle of the palette and a fold has room to go either way.
      let t = (rest > 0 ? area / rest : 1) * 0.30;
      const gx = ((z[j] + z[l]) - (z[i] + z[k])) * 0.5;
      const gy = ((z[k] + z[l]) - (z[i] + z[j])) * 0.5;
      const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      t += (-gx * LX - gy * LY + LZ) * inv * 0.42 + lb;
      if (sh > 0) {
        const d = c * invC - sp;
        t += sh * Math.exp(-d * d * 26) * 0.40;
      }
      raw[r * qc + c] = t;
    }
  }

  // --- pass 2: smooth it across the seams --------------------------------
  // One quad per cell is a coarse way to light a cloth: on a mesh as big as
  // the sheet the steps between cells read as a patchwork of rectangles
  // rather than as folds. Averaging each cell with its four neighbours
  // (itself weighted double) costs one pass over ~54 values and turns the
  // patchwork into a continuous gradient, which is what cloth looks like.
  for (let r = 0; r < qr; r++) {
    for (let c = 0; c < qc; c++) {
      const q = r * qc + c;
      let sum = raw[q] * 2, n = 2;
      if (c > 0) { sum += raw[q - 1]; n++; }
      if (c < qc - 1) { sum += raw[q + 1]; n++; }
      if (r > 0) { sum += raw[q - qc]; n++; }
      if (r < qr - 1) { sum += raw[q + qc]; n++; }
      lit[q] = sum / n;
    }
  }

  // --- pass 3: draw ------------------------------------------------------
  for (let r = 0; r < qr; r++) {
    for (let c = 0; c < qc; c++) {
      const i = r * cols + c;
      const j = i + 1;
      const k = i + cols;
      const l = k + 1;
      const si = clamp((lit[r * qc + c] * SHADES) | 0, 0, SHADES - 1);
      ctx.fillStyle = pal[si];
      quad(ctx, cl.x[i], cl.y[i], cl.x[j], cl.y[j], cl.x[l], cl.y[l], cl.x[k], cl.y[k]);
      ctx.fill();
      if (SEAM_STROKE) {
        ctx.strokeStyle = pal[si];
        ctx.stroke();
      }
    }
  }
}

// Two scratch buffers for the shading passes. Grown on demand and then reused
// for the life of the page: the draw loop must never allocate.
let SA = new Float32Array(0);
let SB = new Float32Array(0);
function scratchA(n) { if (SA.length < n) SA = new Float32Array(n); return SA; }
function scratchB(n) { if (SB.length < n) SB = new Float32Array(n); return SB; }

/**
 * Diagonal (shear) relaxation, for meshes that have to keep their shape when
 * only one or two points are pinned.
 *
 * `Cloth.solve` only knows about the horizontal and vertical springs, which is
 * plenty for a towel on two pegs but not for a sheet hanging off a single
 * corner: with nothing resisting shear the grid folds up into a rope. Pulling
 * both diagonals of every cell back toward their rest length costs one extra
 * pass over ~54 quads and keeps the cloth a cloth.
 *
 * `k` is stiffness, 0..1; anything above ~0.6 starts to look like cardboard.
 */
export function relaxShear(cl, k) {
  const { cols, rows, restH, restV } = cl;
  const rest = Math.sqrt(restH * restH + restV * restV);
  const s = (k === undefined ? 0.5 : k) * 0.5;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i = r * cols + c;
      shear(cl, i, i + cols + 1, rest, s);
      shear(cl, i + 1, i + cols, rest, s);
    }
  }
  for (let i = 0; i < cl.n; i++) {
    if (cl.pinned[i]) { cl.x[i] = cl.pinX[i]; cl.y[i] = cl.pinY[i]; }
  }
}

function shear(cl, a, b, rest, s) {
  const dx = cl.x[b] - cl.x[a];
  const dy = cl.y[b] - cl.y[a];
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-5) return;
  const pa = cl.pinned[a], pb = cl.pinned[b];
  if (pa && pb) return;
  const diff = ((d - rest) / d) * s;
  let fa = 1, fb = 1;
  if (pa) { fa = 0; fb = 2; }
  if (pb) { fb = 0; fa = 2; }
  const ox = dx * diff, oy = dy * diff;
  cl.x[a] += ox * fa; cl.y[a] += oy * fa;
  cl.x[b] -= ox * fb; cl.y[b] -= oy * fb;
}

/**
 * Put a cloth back into a shape a cloth can actually have.
 *
 * A finger that has been hauling on one vertex leaves the mesh stretched: a
 * row of cells three times their rest length, or -- when the same point has
 * been dragged past the pins several times -- a spike, a rod, or a jagged
 * fan. The physics gets there on its own eventually, but "eventually" is
 * several seconds, and a four year old reads a cloth that is still the wrong
 * shape as something she has broken.
 *
 * So the moment the finger lets go the constraints are solved hard, right
 * there, in one call: distances first, then the diagonals, enough times that
 * nothing is left more than a few percent off its rest length. Velocity is
 * clamped at the same time, because a point that was being dragged at arm's
 * speed would otherwise take all that momentum into the spring-back.
 */
export function settleCloth(cl, iterations, shear) {
  const it = iterations === undefined ? 14 : iterations;
  for (let k = 0; k < it; k++) {
    cl.solve();
    relaxShear(cl, shear === undefined ? 0.55 : shear);
  }
  // The spring-back is the cloth's own weight, not the speed of the hand that
  // let it go: zero the Verlet velocity of everything that just moved.
  for (let i = 0; i < cl.n; i++) {
    cl.ox[i] = cl.x[i];
    cl.oy[i] = cl.y[i];
  }
}
