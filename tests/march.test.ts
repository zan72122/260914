import { describe, expect, it } from 'vitest';
import {
  FLOW_GAIN,
  FLOW_MAX,
  PATH_MIN_X,
  advance,
  allPassed,
  alongPath,
  decayFlow,
  laneOffset,
  mergeFlow,
  passedFraction,
} from '../src/scenes/marchLogic';
import { PATH_HALF_W, pathY } from '../src/art/geometry';

describe('scene 2 march: the flow of the line', () => {
  it('reads a drag along the path as forward motion', () => {
    // At x = 0 the path is rising, so a purely rightward drag still counts.
    expect(alongPath(300, 0, 0)).toBeGreaterThan(0);
    expect(alongPath(-300, 0, 0)).toBeLessThan(0);
    expect(alongPath(0, 0, 0)).toBe(0);
  });

  it('never lets a drag cancel a faster one already running', () => {
    const fast = mergeFlow(0, 400);
    // A second, slower hand pushing the same way leaves the line alone.
    expect(mergeFlow(fast, 100)).toBe(fast);
    // ...and two hands pushing together do not add up past the cap.
    expect(mergeFlow(fast, 100000)).toBe(FLOW_MAX);
  });

  it('turns a drag into flow at the stated gain', () => {
    expect(mergeFlow(0, 100)).toBeCloseTo(100 * FLOW_GAIN, 6);
  });

  it('lets the flow die away when the finger stops', () => {
    let flow = 300;
    for (let i = 0; i < 180; i++) flow = decayFlow(flow, 1 / 60);
    expect(flow).toBeLessThan(60);
    expect(flow).toBeGreaterThan(0);
  });

  it('carries a kid forward and never pushes them off the back', () => {
    expect(advance(0, 200, 0.5)).toBeCloseTo(100, 6);
    expect(advance(PATH_MIN_X + 10, -5000, 1)).toBe(PATH_MIN_X);
  });

  it('is done only when every kid is past the exit', () => {
    expect(allPassed([700, 800, 690], 700)).toBe(false);
    expect(allPassed([700, 800, 701], 700)).toBe(true);
    expect(allPassed([], 700)).toBe(false);
    expect(passedFraction([0, 800, 900, 0], 700)).toBeCloseTo(0.5, 6);
  });

  it('spreads the line over three lanes inside the path band', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 9; i++) {
      const o = laneOffset(i);
      expect(Math.abs(o)).toBeLessThan(PATH_HALF_W);
      seen.add(o);
    }
    expect(seen.size).toBe(3);
  });

  it('keeps the path centre line inside its own amplitude', () => {
    for (let x = -1400; x <= 1400; x += 37) expect(Math.abs(pathY(x))).toBeLessThanOrEqual(70.001);
  });
});
