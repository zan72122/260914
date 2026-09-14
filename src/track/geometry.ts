// Pure 2D geometry for turning a finger stroke into a smooth, drivable rail path.
// Coordinates are ground-plane (x, z). No Three.js here so it is unit-testable.

export type V2 = [number, number];

export const SAMPLE_DS = 0.3; // arc-length spacing of dense samples
export const MIN_RADIUS = 1.6; // tightest curve a train can take
export const SNAP_RADIUS = 1.2; // endpoint magnet radius

export const dist = (a: V2, b: V2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lerp2 = (a: V2, b: V2, t: number): V2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Ramer–Douglas–Peucker simplification. */
export function simplify(pts: V2[], eps: number): V2[] {
  if (pts.length < 3) return pts.slice();
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let maxD = -1;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = pointSegmentDistance(pts[i], a, b);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > eps) {
    const left = simplify(pts.slice(0, idx + 1), eps);
    const right = simplify(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

export function pointSegmentDistance(p: V2, a: V2, b: V2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  let t = l2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, [a[0] + dx * t, a[1] + dz * t]);
}

/** Remove consecutive duplicates / near-duplicates. */
export function dedupe(pts: V2[], minD = 1e-3): V2[] {
  const out: V2[] = [];
  for (const p of pts) if (out.length === 0 || dist(out[out.length - 1], p) > minD) out.push(p);
  return out;
}

/** Cumulative arc lengths for a polyline. */
export function cumulative(pts: V2[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
  return cum;
}

/** Resample a polyline at a uniform spacing (endpoints preserved). */
export function resample(pts: V2[], ds: number): V2[] {
  pts = dedupe(pts);
  if (pts.length < 2) return pts.slice();
  const cum = cumulative(pts);
  const total = cum[cum.length - 1];
  const n = Math.max(1, Math.round(total / ds));
  const out: V2[] = [];
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * total;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const span = cum[j + 1] - cum[j];
    const t = span === 0 ? 0 : (s - cum[j]) / span;
    out.push(lerp2(pts[j], pts[j + 1], t));
  }
  return out;
}

/** Signed curvature magnitude at interior sample i (1/radius) for uniformly spaced points. */
export function curvatureAt(pts: V2[], i: number): number {
  if (i <= 0 || i >= pts.length - 1) return 0;
  const a = pts[i - 1];
  const b = pts[i];
  const c = pts[i + 1];
  const ab = dist(a, b);
  const bc = dist(b, c);
  const ca = dist(c, a);
  const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  const denom = ab * bc * ca;
  return denom === 0 ? 0 : (2 * area2) / denom;
}

export function maxCurvature(pts: V2[]): number {
  let m = 0;
  for (let i = 1; i < pts.length - 1; i++) m = Math.max(m, curvatureAt(pts, i));
  return m;
}

/**
 * Laplacian smoothing until every curve is at least MIN_RADIUS (or we give up).
 * Endpoints are fixed unless `lockStart/lockEnd` are false (they always are locked here;
 * the caller may override endpoints for snapping before calling).
 */
export function smoothToRadius(pts: V2[], minRadius: number, ds: number, maxPasses = 60): V2[] {
  let cur = resample(pts, ds);
  if (cur.length < 3) return cur;
  const kMax = 1 / minRadius;
  for (let pass = 0; pass < maxPasses; pass++) {
    if (maxCurvature(cur) <= kMax) break;
    const next = cur.slice();
    for (let i = 1; i < cur.length - 1; i++) {
      next[i] = [
        (cur[i - 1][0] + cur[i][0] * 2 + cur[i + 1][0]) / 4,
        (cur[i - 1][1] + cur[i][1] * 2 + cur[i + 1][1]) / 4,
      ];
    }
    cur = resample(next, ds);
    if (cur.length < 3) break;
  }
  return cur;
}

/** Full pipeline: raw stroke -> dense, smooth, uniformly spaced path. Returns [] if too short. */
export function strokeToPath(raw: V2[], opts: { ds?: number; minRadius?: number; eps?: number } = {}): V2[] {
  const ds = opts.ds ?? SAMPLE_DS;
  const minRadius = opts.minRadius ?? MIN_RADIUS;
  const eps = opts.eps ?? 0.12;
  const pts = dedupe(raw, 0.02);
  if (pts.length < 2) return [];
  const cum = cumulative(pts);
  if (cum[cum.length - 1] < ds * 3) return [];
  const simple = simplify(pts, eps);
  const dense = resample(simple, ds * 0.5);
  return smoothToRadius(dense, minRadius, ds);
}

/** Tangent (unit) at sample index. */
export function tangentAt(pts: V2[], i: number): V2 {
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  const d = dist(a, b) || 1;
  return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
}

/** Interpolate a value array at arc length s given cumulative lengths. */
export function sampleAt<T extends number | V2>(vals: T[], cum: number[], s: number): T {
  const n = cum.length;
  if (n === 1) return vals[0];
  const total = cum[n - 1];
  s = Math.max(0, Math.min(total, s));
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo];
  const t = span === 0 ? 0 : (s - cum[lo]) / span;
  const a = vals[lo];
  const b = vals[hi];
  if (typeof a === 'number') return (a + ((b as number) - a) * t) as T;
  return lerp2(a as V2, b as V2, t) as T;
}

/** Segment-segment intersection returning parameters (ta, tb) in [0,1], or null. */
export function segIntersect(a1: V2, a2: V2, b1: V2, b2: V2): [number, number] | null {
  const r: V2 = [a2[0] - a1[0], a2[1] - a1[1]];
  const s: V2 = [b2[0] - b1[0], b2[1] - b1[1]];
  const denom = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denom) < 1e-9) return null;
  const q: V2 = [b1[0] - a1[0], b1[1] - a1[1]];
  const t = (q[0] * s[1] - q[1] * s[0]) / denom;
  const u = (q[0] * r[1] - q[1] * r[0]) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [t, u];
}

/** All crossings between two polylines as arc-length positions [sA, sB]. Skips adjacent-index self hits. */
export function polylineCrossings(a: V2[], cumA: number[], b: V2[], cumB: number[], self = false): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (self && Math.abs(i - j) < 6) continue;
      if (self && j <= i) continue;
      const hit = segIntersect(a[i], a[i + 1], b[j], b[j + 1]);
      if (!hit) continue;
      out.push([cumA[i] + (cumA[i + 1] - cumA[i]) * hit[0], cumB[j] + (cumB[j + 1] - cumB[j]) * hit[1]]);
    }
  }
  return out;
}

export const BRIDGE_HEIGHT = 1.15;
export const BRIDGE_RAMP = 2.6;

const smoothstep = (t: number): number => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};

/** Height profile: bumps of BRIDGE_HEIGHT centred on each crossing arc-length with smooth ramps. */
export function bridgeProfile(cum: number[], crossingsS: number[], height = BRIDGE_HEIGHT, ramp = BRIDGE_RAMP): number[] {
  const total = cum[cum.length - 1];
  return cum.map((s) => {
    let h = 0;
    for (const c of crossingsS) {
      const d = Math.abs(s - c);
      // flat top over ~0.9 units so the train sits level on the deck
      const top = 0.45;
      const v = d <= top ? 1 : 1 - smoothstep((d - top) / ramp);
      h = Math.max(h, v);
    }
    // Ramps can't hang off the end of a segment: fade near ends only if the segment is short.
    const endFade = Math.min(1, s / 0.6, (total - s) / 0.6);
    return h * height * Math.max(0, Math.min(1, endFade));
  });
}
