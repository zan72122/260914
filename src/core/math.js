// Small math helpers. No allocation in hot paths: callers pass `out` objects.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}
export function smootherstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Frame-rate independent exponential approach. `rate` = 1/e per second. */
export const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);

/**
 * Critically damped spring step. Mutates `s` = {v} and returns new position.
 * Stable for dt <= 1/30 with omega <= 40.
 */
export function spring(pos, vel, target, omega, dt) {
  // semi-implicit critically damped: a = -2*w*v - w^2*(x - target)
  const a = -2 * omega * vel - omega * omega * (pos - target);
  const nv = vel + a * dt;
  return { p: pos + nv * dt, v: nv };
}

/** 2-component critically damped spring writing into `out` {x,y,vx,vy}. */
export function spring2(out, tx, ty, omega, dt) {
  const ax = -2 * omega * out.vx - omega * omega * (out.x - tx);
  const ay = -2 * omega * out.vy - omega * omega * (out.y - ty);
  out.vx += ax * dt;
  out.vy += ay * dt;
  out.x += out.vx * dt;
  out.y += out.vy * dt;
  return out;
}

export function len(x, y) { return Math.hypot(x, y); }
export function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
export function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }

/** Catmull-Rom interpolation of one axis. */
export function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/**
 * Sample a catmull-rom spline through `pts` (array of {x,y}) at u in 0..1.
 * Writes into `out` {x,y}. Endpoints are duplicated (clamped tangents).
 */
export function splineAt(pts, u, out) {
  const n = pts.length;
  if (n === 0) { out.x = 0; out.y = 0; return out; }
  if (n === 1) { out.x = pts[0].x; out.y = pts[0].y; return out; }
  const segs = n - 1;
  let f = clamp(u, 0, 1) * segs;
  let i = Math.min(Math.floor(f), segs - 1);
  const t = f - i;
  const p0 = pts[i - 1 >= 0 ? i - 1 : 0];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[i + 2 < n ? i + 2 : n - 1];
  out.x = catmull(p0.x, p1.x, p2.x, p3.x, t);
  out.y = catmull(p0.y, p1.y, p2.y, p3.y, t);
  return out;
}

/** Stroke a catmull-rom spline through pts on a 2d context (already in screen space). */
export function splinePath(ctx, pts, steps) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  const tmp = { x: 0, y: 0 };
  const N = steps || (pts.length - 1) * 8;
  for (let i = 1; i <= N; i++) {
    splineAt(pts, i / N, tmp);
    ctx.lineTo(tmp.x, tmp.y);
  }
}

/** Cheap deterministic value noise in 1D (for trembles). */
export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const a = hash1(i), b = hash1(i + 1);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
export function hash1(n) {
  let h = (n | 0) * 374761393;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}
