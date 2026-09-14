import { describe, expect, it } from 'vitest';
import { bridgeProfile, cumulative, maxCurvature, polylineCrossings, resample, sampleAt, simplify, strokeToPath, type V2 } from './geometry';

describe('geometry', () => {
  it('simplify keeps endpoints and drops collinear points', () => {
    const pts: V2[] = [[0, 0], [1, 0.001], [2, 0], [3, 0]];
    expect(simplify(pts, 0.1)).toEqual([[0, 0], [3, 0]]);
  });

  it('resample produces uniform spacing', () => {
    const out = resample([[0, 0], [3, 0]], 0.5);
    expect(out.length).toBe(7);
    const cum = cumulative(out);
    expect(cum[cum.length - 1]).toBeCloseTo(3);
  });

  it('strokeToPath enforces the minimum radius on a jittery stroke', () => {
    const raw: V2[] = [];
    for (let i = 0; i <= 60; i++) raw.push([i * 0.2, Math.sin(i * 1.7) * 0.25]);
    const path = strokeToPath(raw, { minRadius: 1.6, ds: 0.3 });
    expect(path.length).toBeGreaterThan(10);
    expect(maxCurvature(path)).toBeLessThanOrEqual(1 / 1.6 + 1e-6);
  });

  it('strokeToPath rejects tiny strokes', () => {
    expect(strokeToPath([[0, 0], [0.1, 0]])).toEqual([]);
  });

  it('sampleAt interpolates along arc length', () => {
    const pts: V2[] = [[0, 0], [1, 0], [2, 0]];
    const cum = cumulative(pts);
    expect(sampleAt(pts, cum, 1.5)).toEqual([1.5, 0]);
    expect(sampleAt([0, 10, 20], cum, 0.25)).toBeCloseTo(2.5);
  });

  it('finds crossings between two polylines', () => {
    const a: V2[] = [[-2, 0], [2, 0]];
    const b: V2[] = [[0, -2], [0, 2]];
    const hits = polylineCrossings(a, cumulative(a), b, cumulative(b));
    expect(hits).toHaveLength(1);
    expect(hits[0][0]).toBeCloseTo(2);
    expect(hits[0][1]).toBeCloseTo(2);
  });

  it('bridge profile peaks at the crossing and is flat away from it', () => {
    const pts = resample([[0, 0], [12, 0]], 0.3);
    const cum = cumulative(pts);
    const h = bridgeProfile(cum, [6]);
    const peak = h[Math.round(6 / 0.3)];
    expect(peak).toBeCloseTo(1.15, 2);
    expect(h[0]).toBe(0);
    expect(h[h.length - 1]).toBe(0);
  });
});
