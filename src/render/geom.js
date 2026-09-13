// Cell-local geometry. Cell centre is (0,0); sides are at ±0.5. Screen coordinates (y down).
import { OPP } from '../sim/grid.js';

export const SIDE = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
export const HEADING = { N: -Math.PI / 2, E: 0, S: Math.PI / 2, W: Math.PI };

// Point (and heading) at parameter s in [0,1] on the rail that runs from side a to side b.
export function sidePath(a, b, s) {
  const A = SIDE[a], B = SIDE[b];
  if (a === OPP[b]) {
    return {
      x: A[0] * 0.5 * (1 - s) + B[0] * 0.5 * s,
      y: A[1] * 0.5 * (1 - s) + B[1] * 0.5 * s,
      ang: Math.atan2(B[1] - A[1], B[0] - A[0]),
    };
  }
  const cx = (A[0] + B[0]) * 0.5, cy = (A[1] + B[1]) * 0.5; // corner shared by both sides
  const t0 = Math.atan2(A[1] * 0.5 - cy, A[0] * 0.5 - cx);
  let t1 = Math.atan2(B[1] * 0.5 - cy, B[0] * 0.5 - cx);
  let d = t1 - t0;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const th = t0 + d * s;
  return {
    x: cx + 0.5 * Math.cos(th),
    y: cy + 0.5 * Math.sin(th),
    ang: th + Math.sign(d) * Math.PI / 2,
  };
}

// Sampled polyline for drawing a rail from side a to side b.
export function railPoints(a, b, n) {
  const pts = [];
  const straight = a === OPP[b];
  const count = straight ? 2 : n;
  for (let i = 0; i < count; i++) {
    const s = count === 1 ? 0 : i / (count - 1);
    pts.push(sidePath(a, b, s));
  }
  return pts;
}

export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function easeOut(t) { return 1 - (1 - t) * (1 - t); }
export function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
