import { describe, expect, it } from 'vitest';
import {
  SPREAD_CHANCE,
  SPREAD_RADIUS,
  allLaughing,
  laughingCount,
  laughingFraction,
} from '../src/scenes/tickleLogic';
import { Crowd } from '../src/crowd/crowd';
import { spreadContagion } from '../src/crowd/behaviors';
import type { Kid } from '../src/crowd/kid';

const LAUGHING = 1;

/** A tidy grid of kids, and the spatial hash filled in to match. */
function gridCrowd(cols: number, rows: number, step: number): Crowd {
  const crowd = new Crowd({ bounds: { left: -900, top: -900, right: 900, bottom: 900 } });
  crowd.spawn(cols * rows);
  for (let i = 0; i < crowd.kids.length; i++) {
    const k = crowd.kids[i];
    k.x = (-(cols - 1) / 2 + (i % cols)) * step;
    k.y = (-(rows - 1) / 2 + Math.floor(i / cols)) * step;
    k.tag = 0;
  }
  rehash(crowd);
  return crowd;
}

function rehash(crowd: Crowd): void {
  crowd.hash.clear();
  for (let i = 0; i < crowd.kids.length; i++) crowd.hash.insert(i, crowd.kids[i].x, crowd.kids[i].y);
}

const isHot = (k: Kid) => k.tag === LAUGHING;
const infect = (k: Kid) => {
  k.tag = LAUGHING;
};
const flags = (crowd: Crowd) => crowd.kids.map((k) => k.tag);

describe('scene 3 tickle: the completion condition', () => {
  it('counts who is laughing', () => {
    expect(laughingCount([0, 1, 1, 0])).toBe(2);
    expect(laughingFraction([0, 1, 1, 0])).toBeCloseTo(0.5, 6);
    expect(laughingFraction([])).toBe(0);
  });

  it('is done only when the whole crowd is laughing', () => {
    expect(allLaughing([1, 1, 1])).toBe(true);
    expect(allLaughing([1, 0, 1])).toBe(false);
    expect(allLaughing([])).toBe(false);
  });
});

describe('scene 3 tickle: the giggle chain', () => {
  it('travels outwards one ring per step instead of teleporting', () => {
    const crowd = gridCrowd(8, 5, 80);
    crowd.kids[0].tag = LAUGHING;
    spreadContagion(crowd, SPREAD_RADIUS, isHot, infect, 1);
    expect(laughingCount(flags(crowd))).toBeGreaterThan(1);
    expect(allLaughing(flags(crowd))).toBe(false);
  });

  it('always reaches the whole crowd in the end', () => {
    const crowd = gridCrowd(8, 5, 80);
    crowd.kids[0].tag = LAUGHING;
    for (let step = 0; step < 60 && !allLaughing(flags(crowd)); step++) {
      rehash(crowd);
      spreadContagion(crowd, SPREAD_RADIUS, isHot, infect, 1);
    }
    expect(allLaughing(flags(crowd))).toBe(true);
  });

  it('still reaches everybody at the ragged spread chance (never stalls)', () => {
    const crowd = gridCrowd(6, 6, 80);
    crowd.kids[0].tag = LAUGHING;
    // Deterministic pseudo-random so the test cannot flake.
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    let steps = 0;
    while (!allLaughing(flags(crowd)) && steps < 500) {
      rehash(crowd);
      spreadContagion(crowd, SPREAD_RADIUS, isHot, infect, SPREAD_CHANCE, rand);
      steps++;
    }
    expect(allLaughing(flags(crowd))).toBe(true);
    expect(steps).toBeLessThan(500);
  });
});
