import { describe, expect, it } from 'vitest';
import {
  MAX_CLIMBERS,
  ROLE_CLIMB,
  ROLE_LANDED,
  ROLE_QUEUE,
  allSlid,
  climberCount,
  slidFraction,
  slideEase,
} from '../src/scenes/slideLogic';
import { LADDER_FOOT_Y, LADDER_TOP_Y, ladderPoint, slideTop, slopeLocal } from '../src/art/geometry';

const v = { x: 0, y: 0 };

describe('scene 6 slide: the queue', () => {
  it('completes only when everybody has been down', () => {
    expect(allSlid([ROLE_LANDED, ROLE_LANDED])).toBe(true);
    expect(allSlid([ROLE_LANDED, ROLE_QUEUE])).toBe(false);
    expect(allSlid([])).toBe(false);
    expect(slidFraction([ROLE_LANDED, ROLE_QUEUE, ROLE_LANDED, ROLE_CLIMB])).toBeCloseTo(0.5, 6);
  });

  it('counts climbers so the ladder never overfills', () => {
    const roles = [ROLE_CLIMB, ROLE_CLIMB, ROLE_QUEUE, ROLE_LANDED];
    expect(climberCount(roles)).toBe(2);
    expect(climberCount(roles)).toBeLessThanOrEqual(MAX_CLIMBERS);
  });
});

describe('scene 6 slide: the geometry', () => {
  it('eases into the slope and then accelerates', () => {
    expect(slideEase(0)).toBe(0);
    expect(slideEase(1)).toBeCloseTo(1, 6);
    // Half way down in time is less than half way down in distance.
    expect(slideEase(0.5)).toBeLessThan(0.5);
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const s = slideEase(t);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('runs the slope downhill the whole way', () => {
    let prev = slopeLocal(0, { x: 0, y: 0 });
    for (let t = 0.05; t <= 1.0001; t += 0.05) {
      const p = slopeLocal(t, { x: 0, y: 0 });
      expect(p.x).toBeGreaterThan(prev.x);
      expect(p.y).toBeGreaterThan(prev.y);
      prev = p;
    }
  });

  it('climbs the ladder from the foot to the platform', () => {
    ladderPoint(0, v);
    const footY = v.y;
    ladderPoint(1, v);
    const topY = v.y;
    expect(footY - topY).toBeCloseTo(LADDER_FOOT_Y - LADDER_TOP_Y, 6);
    expect(topY).toBeLessThan(footY);
  });

  it('sits the waiting kid at the top of the slope, not in mid-air', () => {
    slideTop(v);
    const top = { x: v.x, y: v.y };
    slopeLocal(0, v);
    // The slope starts within a body's width of where that kid is sitting.
    expect(Math.abs(top.y - (v.y - 250))).toBeLessThan(60);
  });
});
