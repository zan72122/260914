import { describe, expect, it } from 'vitest';
import {
  CLUSTER_RADIUS,
  PULL_FORCE,
  PULL_THRESHOLD,
  allExited,
  allGathered,
  gatherProgress,
  gatheredCount,
  stragglerPull,
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

describe('scene 1: a half-formed group pulls the stragglers in', () => {
  it('does nothing at all until most of the crowd is already there', () => {
    for (let f = 0; f <= PULL_THRESHOLD; f += 0.05) {
      expect(stragglerPull(f)).toBe(0);
    }
    // ...which is what keeps the 30-second rescue the only way a scene that
    // nobody touches can ever finish.
    expect(stragglerPull(0)).toBe(0);
    expect(stragglerPull(1 / 44)).toBe(0);
    expect(stragglerPull(3 / 44)).toBe(0);
  });

  it('eases in, never snaps on, and never exceeds a gentle walk', () => {
    let previous = 0;
    for (let f = PULL_THRESHOLD; f <= 1.0001; f += 0.02) {
      const pull = stragglerPull(f);
      expect(pull).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(pull).toBeLessThanOrEqual(PULL_FORCE);
      previous = pull;
    }
    expect(stragglerPull(1)).toBeCloseTo(PULL_FORCE, 6);
    // Just over the line it is barely there: no lurch at the threshold.
    expect(stragglerPull(PULL_THRESHOLD + 0.01)).toBeLessThan(PULL_FORCE * 0.02);
  });

  it('settles a straggler at a walking pace, not a yank', () => {
    // Terminal speed under the crowd's damping of 2.4/s.
    expect(PULL_FORCE / 2.4).toBeLessThan(190);
  });

  it('is driven by the same count the completion condition uses', () => {
    const kids = [];
    for (let i = 0; i < 10; i++) kids.push({ x: i < 7 ? 0 : 10_000, y: 0 });
    expect(gatheredCount(kids, 0, 0, CLUSTER_RADIUS)).toBe(7);
    expect(stragglerPull(gatherProgress(kids, 0, 0, CLUSTER_RADIUS))).toBeGreaterThan(0);
  });
});
