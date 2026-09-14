import { describe, expect, it } from 'vitest';
import { TAP_MAX_MOVE, TAP_MAX_MS, isTapGesture, updateHand } from '../src/core/input';
import type { Hand } from '../src/core/input';

function hand(): Hand {
  return {
    id: 1,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    startX: 0,
    startY: 0,
    downTime: 0,
    lastSample: 0,
    travel: 0,
    radius: 160,
    active: true,
    wasTap: false,
  };
}

describe('tap detection', () => {
  it('accepts a short, still press', () => {
    expect(isTapGesture(80, 3)).toBe(true);
  });

  it('accepts exactly the time limit', () => {
    expect(isTapGesture(TAP_MAX_MS, 0)).toBe(true);
  });

  it('rejects a long press', () => {
    expect(isTapGesture(TAP_MAX_MS + 1, 0)).toBe(false);
  });

  it('rejects a press that moved too far', () => {
    expect(isTapGesture(50, TAP_MAX_MOVE)).toBe(false);
    expect(isTapGesture(50, 40)).toBe(false);
  });
});

describe('hand tracking', () => {
  it('records the furthest travel, not the final offset', () => {
    const h = hand();
    updateHand(h, 60, 0, 50);
    updateHand(h, 0, 0, 100);
    expect(h.travel).toBe(60);
    expect(isTapGesture(100, h.travel)).toBe(false);
  });

  it('computes a velocity in the direction of travel', () => {
    const h = hand();
    updateHand(h, 100, 50, 100);
    expect(h.vx).toBeGreaterThan(0);
    expect(h.vy).toBeGreaterThan(0);
  });

  it('keeps a still finger a tap', () => {
    const h = hand();
    updateHand(h, 2, 2, 50);
    updateHand(h, 1, 1, 90);
    expect(isTapGesture(90, h.travel)).toBe(true);
  });
});
