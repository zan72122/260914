import { describe, expect, it } from 'vitest';
import {
  DRIFT_AMP,
  FOLLOW_RATE,
  approach,
  driftTarget,
  leadProgress,
  leftThePicture,
} from '../src/scenes/butterflyLogic';

describe('scene 5 butterfly: following a finger', () => {
  it('closes on the finger without ever overshooting it', () => {
    let x = 0;
    for (let i = 0; i < 240; i++) {
      x = approach(x, 500, FOLLOW_RATE, 1 / 60);
      expect(x).toBeLessThanOrEqual(500);
    }
    expect(x).toBeGreaterThan(499);
  });

  it('is frame-rate independent', () => {
    let a = 0;
    for (let i = 0; i < 120; i++) a = approach(a, 300, FOLLOW_RATE, 1 / 120);
    let b = 0;
    for (let i = 0; i < 30; i++) b = approach(b, 300, FOLLOW_RATE, 1 / 30);
    expect(a).toBeCloseTo(b, 6);
  });

  it('cannot be yanked: a huge jump still eases', () => {
    const one = approach(0, 100000, FOLLOW_RATE, 1 / 60);
    expect(one).toBeLessThan(100000 * 0.1);
  });

  it('never stands still when nobody is playing', () => {
    const out = { x: 0, y: 0 };
    const seen = new Set<string>();
    for (let t = 0; t < 30; t += 0.7) {
      driftTarget(t, out);
      expect(Math.abs(out.x)).toBeLessThanOrEqual(DRIFT_AMP + 0.001);
      seen.add(`${out.x.toFixed(2)},${out.y.toFixed(2)}`);
    }
    expect(seen.size).toBeGreaterThan(30);
  });

  it('ends only once it has led the crowd past the edge', () => {
    expect(leftThePicture(699, 700)).toBe(false);
    expect(leftThePicture(700, 700)).toBe(true);
    expect(leadProgress(-200, -200, 600)).toBe(0);
    expect(leadProgress(200, -200, 600)).toBeCloseTo(0.5, 6);
    expect(leadProgress(9999, -200, 600)).toBe(1);
    expect(leadProgress(0, 600, 600)).toBe(1);
  });
});
