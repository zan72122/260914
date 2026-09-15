import { describe, expect, it } from 'vitest';
import {
  CLUSTER_RADIUS,
  allExited,
  allGathered,
  gatherProgress,
  gatheredCount,
} from '../src/scenes/gatherLogic';

function ring(n: number, radius: number): { x: number; y: number }[] {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
  }
  return out;
}

describe('scene 1 completion condition', () => {
  it('is false while anybody is still outside the cluster radius', () => {
    const kids = ring(10, 100);
    kids.push({ x: CLUSTER_RADIUS + 40, y: 0 });
    expect(allGathered(kids, 0, 0)).toBe(false);
  });

  it('is true once every kid is inside the cluster radius', () => {
    const kids = ring(20, CLUSTER_RADIUS - 10);
    kids.push({ x: 0, y: 0 });
    expect(allGathered(kids, 0, 0)).toBe(true);
  });

  it('measures against the waver, not the origin', () => {
    const kids = ring(8, 40).map((p) => ({ x: p.x + 800, y: p.y - 500 }));
    expect(allGathered(kids, 0, 0)).toBe(false);
    expect(allGathered(kids, 800, -500)).toBe(true);
  });

  it('counts kids exactly on the radius as gathered (no off-by-one edge)', () => {
    expect(gatheredCount([{ x: CLUSTER_RADIUS, y: 0 }], 0, 0, CLUSTER_RADIUS)).toBe(1);
  });

  it('never reports completion for an empty crowd', () => {
    expect(allGathered([], 0, 0)).toBe(false);
  });

  it('reports progress monotonically as kids arrive', () => {
    const kids = ring(4, 900);
    const before = gatherProgress(kids, 0, 0);
    kids[0].x = 0;
    kids[0].y = 0;
    const after = gatherProgress(kids, 0, 0);
    expect(before).toBe(0);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeCloseTo(0.25);
  });
});

describe('run-off completion', () => {
  it('waits for the last kid to pass the exit line', () => {
    const kids = [{ x: 1500, y: 0 }, { x: 1500, y: 40 }, { x: 900, y: 10 }];
    expect(allExited(kids, 1400)).toBe(false);
    kids[2].x = 1450;
    expect(allExited(kids, 1400)).toBe(true);
  });
});
