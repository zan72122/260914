import { describe, expect, it } from 'vitest';
import {
  CLIMB_SEC,
  ON_GROUND,
  STACKED,
  STACK_STEP,
  TOWER_MAX,
  TUMBLED,
  shouldTopple,
  stackY,
  swayAt,
  towerProgress,
  wobbleAmp,
} from '../src/scenes/towerLogic';
import { KID_WORLD_H } from '../src/art/kidSheet';

describe('scene 9 tower: stacking up', () => {
  it('puts each kid a body-ish height above the last', () => {
    expect(stackY(200, 0)).toBe(200);
    expect(stackY(200, 1)).toBe(200 - STACK_STEP);
    expect(stackY(200, 3)).toBe(200 - 3 * STACK_STEP);
    // Shoulders, not heads: they overlap a little, like real children.
    expect(STACK_STEP).toBeLessThan(KID_WORLD_H);
    expect(STACK_STEP).toBeGreaterThan(KID_WORLD_H * 0.5);
  });

  it('keeps the finished tower inside the picture', () => {
    // The top of a full tower, measured from the feet of the bottom kid.
    const top = (TOWER_MAX - 1) * STACK_STEP + KID_WORLD_H;
    expect(top).toBeLessThan(1000);
  });

  it('climbs in under a second, so a tap feels answered', () => {
    expect(CLIMB_SEC).toBeLessThan(1);
    expect(CLIMB_SEC).toBeGreaterThan(0.3);
  });
});

describe('scene 9 tower: the wobble grows with the height', () => {
  it('does not wobble at all until there are two of them', () => {
    expect(wobbleAmp(0)).toBe(0);
    expect(wobbleAmp(1)).toBe(0);
    expect(wobbleAmp(2)).toBeGreaterThan(0);
  });

  it('grows strictly, and faster than linearly, with every kid added', () => {
    let prev = 0;
    for (let h = 2; h <= TOWER_MAX; h++) {
      const amp = wobbleAmp(h);
      expect(amp).toBeGreaterThan(prev);
      prev = amp;
    }
    // Twice as high is much more than twice as wobbly.
    expect(wobbleAmp(5)).toBeGreaterThan(wobbleAmp(3) * 2);
  });

  it('sways each kid in proportion to how high up they are', () => {
    // A quarter turn in: the sine is at its peak.
    const t = Math.PI / 2 / 2.3;
    const bottom = Math.abs(swayAt(t, 0, 5));
    const middle = Math.abs(swayAt(t, 2, 5));
    const top = Math.abs(swayAt(t, 4, 5));
    expect(bottom).toBeCloseTo(0, 6);
    expect(middle).toBeGreaterThan(bottom);
    expect(top).toBeGreaterThan(middle);
    expect(top).toBeCloseTo(wobbleAmp(5), 6);
  });

  it('never sways so far that the tower leaves the screen', () => {
    for (let h = 2; h <= TOWER_MAX; h++) {
      expect(wobbleAmp(h)).toBeLessThan(400);
    }
  });
});

describe('scene 9 tower: it always comes down, laughing', () => {
  it('topples the moment it is as high as it can get', () => {
    expect(shouldTopple(TOWER_MAX - 1)).toBe(false);
    expect(shouldTopple(TOWER_MAX)).toBe(true);
    expect(shouldTopple(TOWER_MAX + 1)).toBe(true);
  });

  it('reports progress towards the big moment', () => {
    expect(towerProgress(0)).toBe(0);
    expect(towerProgress(TOWER_MAX)).toBe(1);
    expect(towerProgress(TOWER_MAX * 3)).toBe(1);
    expect(towerProgress(TOWER_MAX / 2)).toBeCloseTo(0.5, 6);
  });

  it('has exactly one ending, and it is a heap rather than a fall', () => {
    expect(ON_GROUND).not.toBe(STACKED);
    expect(STACKED).not.toBe(TUMBLED);
  });
});
