import { describe, expect, it } from 'vitest';
import {
  DRIFT_SPEED,
  GONE,
  GROUNDED,
  RISE_SPEED,
  RISING,
  SWAY_AMP,
  allFloated,
  driftX,
  floatedFraction,
  offTheTop,
  riseSpeed,
  swayOffset,
} from '../src/scenes/balloonLogic';
import { BALLOON_HAND_Y } from '../src/art/geometry';
import { KID_WORLD_H } from '../src/art/kidSheet';

describe('scene 8 balloon: lifting off', () => {
  it('starts from a standstill and eases up to the rising speed', () => {
    expect(riseSpeed(0)).toBe(0);
    expect(riseSpeed(0.25)).toBeGreaterThan(0);
    expect(riseSpeed(0.25)).toBeLessThan(RISE_SPEED * 0.5);
    expect(riseSpeed(10)).toBeGreaterThan(RISE_SPEED * 0.99);
    expect(riseSpeed(100)).toBeLessThanOrEqual(RISE_SPEED);
  });

  it('is a lift, not a launch: never faster than a walk', () => {
    for (let t = 0; t < 20; t += 0.25) expect(riseSpeed(t)).toBeLessThanOrEqual(RISE_SPEED);
    expect(RISE_SPEED).toBeLessThan(400);
  });

  it('sways gently on the way up, and never far', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < 20; t += 0.1) {
      const o = swayOffset(t, 1.2);
      min = Math.min(min, o);
      max = Math.max(max, o);
      expect(Math.abs(o)).toBeLessThanOrEqual(SWAY_AMP + 1e-9);
    }
    expect(max).toBeGreaterThan(SWAY_AMP * 0.9);
    expect(min).toBeLessThan(-SWAY_AMP * 0.9);
  });

  it('drifts towards the next place as it goes', () => {
    expect(DRIFT_SPEED).toBeGreaterThan(0);
  });

  it('hangs the balloon from a raised hand above the kid', () => {
    expect(BALLOON_HAND_Y).toBeLessThan(0);
    expect(Math.abs(BALLOON_HAND_Y)).toBeLessThan(KID_WORLD_H);
  });
});

describe('scene 8 balloon: leaving off the top', () => {
  it('counts a kid gone only once they are above the top of the picture', () => {
    expect(offTheTop(-500, -600)).toBe(false);
    expect(offTheTop(-600, -600)).toBe(true);
    expect(offTheTop(-900, -600)).toBe(true);
  });

  it('is done only when the whole field is in the sky', () => {
    expect(allFloated([GONE, GONE])).toBe(true);
    expect(allFloated([GONE, RISING])).toBe(false);
    expect(allFloated([GONE, GROUNDED])).toBe(false);
    expect(allFloated([])).toBe(false);
    expect(floatedFraction([GONE, GROUNDED, GONE, RISING])).toBeCloseTo(0.5, 6);
  });

  it('actually gets a kid off the top in a few seconds of rising', () => {
    let y = 300;
    let t = 0;
    const dt = 1 / 60;
    while (t < 12 && !offTheTop(y, -760)) {
      y -= riseSpeed(t) * dt;
      t += dt;
    }
    expect(offTheTop(y, -760)).toBe(true);
    expect(t).toBeLessThan(10);
  });
});

describe('scene 8 balloon: everybody leaves through the sky', () => {
  // The visible world on a 390x844 phone is exactly the 1000-unit safe zone,
  // so half of it is 500 and the scene allows a drift of 500 - 140.
  const PHONE_LIMIT = 360;

  it('never lets a floating kid drift past the edge of the picture', () => {
    for (const baseX of [-390, -200, 0, 150, 355]) {
      for (let t = 0; t <= 20; t += 0.1) {
        const x = driftX(baseX, t, 1.3, PHONE_LIMIT);
        expect(Math.abs(x)).toBeLessThanOrEqual(PHONE_LIMIT + 1e-9);
      }
    }
  });

  it('still drifts, and still sways, while it is inside the limit', () => {
    const early = driftX(0, 0.5, 0.4, PHONE_LIMIT);
    const later = driftX(0, 3, 0.4, PHONE_LIMIT);
    expect(later).toBeGreaterThan(early);
    // The sway is what makes it a balloon rather than a lift: two kids who
    // left from the same spot are never in the same place.
    expect(driftX(0, 2, 0, PHONE_LIMIT)).not.toBeCloseTo(driftX(0, 2, 2.1, PHONE_LIMIT), 3);
  });

  it('holds a kid who started outside the limit exactly where they were', () => {
    // The scene widens the limit to the kid's own position rather than
    // snapping them inwards, so nobody is ever yanked sideways at lift-off.
    const baseX = 430;
    expect(driftX(baseX, 0, 0, Math.abs(baseX))).toBeCloseTo(baseX, 6);
    for (let t = 0; t <= 20; t += 0.25) {
      expect(driftX(baseX, t, 0.7, Math.abs(baseX))).toBeLessThanOrEqual(baseX + 1e-9);
    }
  });

  it('a whole crowd of phone-width lift-offs stays on screen all the way up', () => {
    // 26 kids spread over the width the phone shows, each rising for the ~8s
    // it takes to clear the top: not one of them may leave sideways.
    for (let i = 0; i < 26; i++) {
      const baseX = -390 + (780 * i) / 25;
      const limit = Math.max(PHONE_LIMIT, Math.abs(baseX));
      for (let t = 0; t <= 8; t += 0.2) {
        expect(Math.abs(driftX(baseX, t, i * 0.24, limit))).toBeLessThanOrEqual(
          Math.max(PHONE_LIMIT, Math.abs(baseX)) + 1e-9,
        );
      }
    }
  });
});
