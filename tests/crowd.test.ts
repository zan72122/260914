import { describe, expect, it } from 'vitest';
import { Crowd, SpatialHash, separate } from '../src/crowd/crowd';
import { Kid } from '../src/crowd/kid';
import { spreadContagion, gatherTowards, applyAttention } from '../src/crowd/behaviors';
import type { Hand } from '../src/core/input';

function kidAt(x: number, y: number): Kid {
  const k = new Kid();
  k.x = x;
  k.y = y;
  return k;
}

function dist(a: Kid, b: Kid): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('separation', () => {
  it('pushes two overlapping kids apart', () => {
    const a = kidAt(0, 0);
    const b = kidAt(6, 0);
    separate(a, b, 26, 900, 1 / 60);
    expect(a.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(0);
  });

  it('ignores kids further apart than the radius', () => {
    const a = kidAt(0, 0);
    const b = kidAt(100, 0);
    separate(a, b, 26, 900, 1 / 60);
    expect(a.vx).toBe(0);
    expect(b.vx).toBe(0);
  });

  it('separates exactly coincident kids without NaN', () => {
    const a = kidAt(0, 0);
    const b = kidAt(0, 0);
    b.wanderPhase = 1;
    separate(a, b, 26, 900, 1 / 60);
    expect(Number.isFinite(a.vx)).toBe(true);
    expect(Number.isFinite(a.vy)).toBe(true);
    expect(Math.hypot(a.vx, a.vy)).toBeGreaterThan(0);
  });

  it('increases the distance between a clumped pair over time', () => {
    const crowd = new Crowd();
    const a = kidAt(0, 0);
    const b = kidAt(4, 3);
    crowd.kids.push(a, b);
    const before = dist(a, b);
    for (let i = 0; i < 60; i++) crowd.update(1 / 60);
    expect(dist(a, b)).toBeGreaterThan(before);
  });

  it('keeps 150 kids from collapsing onto one point', () => {
    const crowd = new Crowd();
    crowd.spawn(150);
    expect(crowd.kids.length).toBe(150);
    for (let i = 0; i < 120; i++) crowd.update(1 / 60);
    let minD = Infinity;
    for (let i = 0; i < crowd.kids.length; i++) {
      for (let j = i + 1; j < crowd.kids.length; j++) {
        minD = Math.min(minD, dist(crowd.kids[i], crowd.kids[j]));
      }
    }
    expect(minD).toBeGreaterThan(4);
    for (const k of crowd.kids) {
      expect(Number.isFinite(k.x)).toBe(true);
      expect(Number.isFinite(k.y)).toBe(true);
    }
  });

  it('never exceeds the kid cap', () => {
    const crowd = new Crowd();
    crowd.spawn(300);
    expect(crowd.kids.length).toBe(150);
  });
});

describe('spatial hash', () => {
  it('finds neighbours in the surrounding cells and skips far ones', () => {
    const hash = new SpatialHash(40);
    hash.insert(0, 0, 0);
    hash.insert(1, 10, 10);
    hash.insert(2, 5000, 5000);
    const seen: number[] = [];
    hash.forEachNear(0, 0, (i) => seen.push(i));
    expect(seen).toContain(0);
    expect(seen).toContain(1);
    expect(seen).not.toContain(2);
  });
});

describe('behaviours', () => {
  it('gathers only kids inside the radius', () => {
    const crowd = new Crowd();
    crowd.kids.push(kidAt(0, 0), kidAt(500, 0));
    const n = gatherTowards(crowd, 10, 10, 100);
    expect(n).toBe(1);
    expect(crowd.kids[0].hasTarget).toBe(true);
    expect(crowd.kids[1].hasTarget).toBe(false);
  });

  it('turns nearby kids towards the finger', () => {
    const crowd = new Crowd();
    const near = kidAt(-20, 0);
    near.facing = -1;
    crowd.kids.push(near, kidAt(900, 0));
    const hand = { x: 0, y: 0, radius: 160 } as Hand;
    expect(applyAttention(crowd, hand)).toBe(1);
    expect(near.attention).toBe(1);
    expect(near.facing).toBe(1);
  });

  it('spreads contagion one ring at a time', () => {
    const crowd = new Crowd();
    for (let i = 0; i < 5; i++) crowd.kids.push(kidAt(i * 20, 0));
    crowd.kids[0].setState('laugh');
    crowd.update(1 / 60); // build the hash
    const isHot = (k: Kid) => k.state === 'laugh';
    const infect = (k: Kid) => k.setState('laugh');
    const first = spreadContagion(crowd, 25, isHot, infect, 1, () => 0);
    expect(first).toBeGreaterThan(0);
    expect(crowd.kids.filter(isHot).length).toBeLessThan(crowd.kids.length);
  });
});
