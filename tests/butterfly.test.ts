import { describe, expect, it } from 'vitest';
import {
  CROWD_LAG,
  DRIFT_AMP,
  FOLLOW_RATE,
  approach,
  clearsHeads,
  driftTarget,
  leadProgress,
  leftThePicture,
} from '../src/scenes/butterflyLogic';
import { KID_WORLD_H } from '../src/art/kidSheet';

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

describe('scene 5 butterfly: it has to be findable', () => {
  it('rests clear above the head of the nearest kid, at every point of its drift', () => {
    const out = { x: 0, y: 0 };
    for (let t = 0; t < 60; t += 0.25) {
      driftTarget(t, out);
      // The crowd follows CROWD_LAG below it, so the nearest kid's feet are
      // there and their head is KID_WORLD_H above that.
      expect(clearsHeads(out.y, out.y + CROWD_LAG, KID_WORLD_H)).toBe(true);
    }
  });

  it('keeps the whole crowd below itself even while being led about', () => {
    // A kid standing exactly where the butterfly is would hide it; the rule
    // has to say so, or it is not testing anything.
    expect(clearsHeads(0, KID_WORLD_H * 0.5, KID_WORLD_H)).toBe(false);
  });
});
