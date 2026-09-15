import { describe, expect, it } from 'vitest';
import { BallPool, ellipseDepth, insidePit } from '../src/scenes/balls';
import type { PitShape } from '../src/scenes/balls';

const PIT: PitShape = { cx: 0, cy: 40, rx: 380, ry: 273 };

function settle(pool: BallPool, seconds: number, dt = 1 / 60): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) pool.step(dt);
}

describe('ball pit physics', () => {
  it('keeps every ball inside the pit once the pile is calm', () => {
    const pool = new BallPool(PIT, 50, 22, 3);
    settle(pool, 12);
    expect(pool.allInside()).toBe(true);
  });

  it('never produces NaN, even through splashes and huge frame steps', () => {
    const pool = new BallPool(PIT, 60, 22, 9);
    for (let i = 0; i < 400; i++) {
      pool.step(i % 37 === 0 ? 2 : 1 / 60); // simulate a backgrounded tab
      if (i % 50 === 0) pool.splash(PIT.cx + (i % 3) * 50, PIT.cy, 900);
    }
    expect(pool.isFinite()).toBe(true);
    expect(pool.allInside()).toBe(true);
  });

  it('survives every ball starting in exactly the same spot', () => {
    const pool = new BallPool(PIT, 30, 22, 1);
    for (const b of pool.balls) {
      b.x = PIT.cx;
      b.y = PIT.cy;
      b.vx = 0;
      b.vy = 0;
    }
    settle(pool, 8);
    expect(pool.isFinite()).toBe(true);
    expect(pool.allInside()).toBe(true);
  });

  it('a splash moves balls and then they come back to rest inside', () => {
    const pool = new BallPool(PIT, 40, 22, 7);
    settle(pool, 6);
    const before = pool.balls.map((b) => ({ x: b.x, y: b.y }));
    pool.splash(PIT.cx, PIT.cy, 800);
    settle(pool, 0.2);
    const moved = pool.balls.some((b, i) => Math.hypot(b.x - before[i].x, b.y - before[i].y) > 5);
    expect(moved).toBe(true);
    settle(pool, 8);
    expect(pool.allInside()).toBe(true);
  });

  it('lets a hopping ball leave the rim and pulls it back in', () => {
    const pool = new BallPool(PIT, 20, 22, 5);
    settle(pool, 6);
    const hopped = pool.hop(1);
    expect(hopped).toBeGreaterThanOrEqual(0);
    let escaped = false;
    for (let i = 0; i < 90; i++) {
      pool.step(1 / 60);
      const b = pool.balls[hopped];
      if (ellipseDepth(PIT, b.x, b.y, b.r) > 1.05) escaped = true;
    }
    expect(escaped).toBe(true);
    settle(pool, 8);
    expect(pool.allInside()).toBe(true);
  });

  it('spills everything out to the right when the pit overflows', () => {
    const pool = new BallPool(PIT, 40, 22, 11);
    settle(pool, 4);
    const beforeX = pool.balls.reduce((s, b) => s + b.x, 0) / pool.balls.length;
    pool.spill();
    settle(pool, 3);
    const afterX = pool.balls.reduce((s, b) => s + b.x, 0) / pool.balls.length;
    expect(pool.spilling).toBe(true);
    expect(afterX).toBeGreaterThan(beforeX + 100);
    expect(pool.isFinite()).toBe(true);
  });
});

describe('pit geometry', () => {
  it('knows what is inside the mouth of the pit', () => {
    expect(insidePit(PIT, PIT.cx, PIT.cy)).toBe(true);
    expect(insidePit(PIT, PIT.cx + PIT.rx * 0.99, PIT.cy)).toBe(true);
    expect(insidePit(PIT, PIT.cx + PIT.rx * 1.2, PIT.cy)).toBe(false);
    // A margin widens the mouth (used for "tapped the pit near a kid").
    expect(insidePit(PIT, PIT.cx + PIT.rx * 1.2, PIT.cy, 200)).toBe(true);
  });
});

describe('scene 4 completion condition', () => {
  /** Mirror of BallpitScene's rule: the pit overflows when nobody is left out. */
  const ROLE_IN = 2;
  const allIn = (roles: number[]) => roles.every((r) => r >= ROLE_IN);

  it('waits for the last kid on the rim', () => {
    const roles = [2, 2, 2, 1];
    expect(allIn(roles)).toBe(false);
    roles[3] = 2;
    expect(allIn(roles)).toBe(true);
  });
});
