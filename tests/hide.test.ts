import { describe, expect, it } from 'vitest';
import {
  BUSH_SPOTS,
  FOUND,
  HIDDEN,
  POPPING,
  POP_LIFT,
  POP_SEC,
  allFound,
  firstHidingBush,
  foundFraction,
  insideBush,
} from '../src/scenes/hideLogic';
import { BUSH_H, BUSH_TAP_RX, BUSH_TAP_RY, BUSH_W } from '../src/art/geometry';
import { KID_WORLD_H } from '../src/art/kidSheet';

describe('scene 7 hide: the bushes', () => {
  it('is big enough to actually hide a kid behind', () => {
    expect(BUSH_W).toBeGreaterThan(KID_WORLD_H);
    expect(BUSH_H).toBeGreaterThan(KID_WORLD_H * 0.9);
  });

  it('answers a tap anywhere on the bush', () => {
    expect(insideBush(0, 0, 0, 0)).toBe(true);
    expect(insideBush(0, 0, BUSH_TAP_RX * 0.9, 0)).toBe(true);
    expect(insideBush(0, 0, 0, BUSH_TAP_RY * 0.9)).toBe(true);
    expect(insideBush(0, 0, BUSH_TAP_RX * 1.4, 0)).toBe(false);
    // A near miss still counts once the scene's slack is applied.
    expect(insideBush(0, 0, BUSH_TAP_RX + 20, 0, 30)).toBe(true);
  });

  it('scatters the bushes without ever stacking two on top of each other', () => {
    for (let a = 0; a < BUSH_SPOTS.length; a++) {
      for (let b = a + 1; b < BUSH_SPOTS.length; b++) {
        const dx = Math.abs(BUSH_SPOTS[a][0] - BUSH_SPOTS[b][0]);
        const dy = Math.abs(BUSH_SPOTS[a][1] - BUSH_SPOTS[b][1]);
        expect(dx > BUSH_W * 0.8 || dy > BUSH_H * 0.8).toBe(true);
      }
    }
  });

  it('keeps every bush inside the square safe zone', () => {
    for (const [x, y] of BUSH_SPOTS) {
      expect(Math.abs(x) + BUSH_W / 2).toBeLessThan(500);
      expect(Math.abs(y) + BUSH_H / 2).toBeLessThan(500);
    }
  });
});

describe('scene 7 hide: the completion condition', () => {
  it('is done only when nobody is left hiding', () => {
    expect(allFound([FOUND, FOUND])).toBe(true);
    expect(allFound([FOUND, POPPING])).toBe(false);
    expect(allFound([FOUND, HIDDEN])).toBe(false);
    expect(allFound([])).toBe(false);
    expect(foundFraction([FOUND, HIDDEN, FOUND, HIDDEN])).toBeCloseTo(0.5, 6);
  });

  it('finds the next bush to give up for the idle hint and auto-advance', () => {
    const states = [FOUND, FOUND, HIDDEN, HIDDEN];
    const bushOf = [0, 0, 1, 1];
    expect(firstHidingBush(states, bushOf)).toBe(1);
    expect(firstHidingBush([FOUND, FOUND], [0, 0])).toBe(-1);
  });

  it('pops a kid out over a leap a child can follow with their eyes', () => {
    expect(POP_SEC).toBeGreaterThan(0.25);
    expect(POP_SEC).toBeLessThan(1);
    // The arc clears the top of the bush, so the pop-out is unmissable.
    expect(POP_LIFT).toBeGreaterThan(BUSH_H * 0.6);
  });
});
