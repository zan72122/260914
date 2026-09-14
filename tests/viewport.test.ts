import { describe, expect, it } from 'vitest';
import { SAFE, computeLayout, safeZoneFits, screenToWorld, worldToScreen } from '../src/core/viewport';

const DEVICES: [string, number, number][] = [
  ['iPhone SE portrait', 375, 667],
  ['iPhone 14 portrait', 390, 844],
  ['iPhone 14 landscape', 844, 390],
  ['iPad portrait', 1024, 1366],
  ['iPad landscape', 1366, 1024],
  ['square', 800, 800],
];

describe('viewport', () => {
  it('always fits the square safe zone', () => {
    for (const [, w, h] of DEVICES) {
      expect(safeZoneFits(computeLayout(w, h))).toBe(true);
    }
  });

  it('turns the extra area into visible world, not letterbox', () => {
    const l = computeLayout(844, 390); // wide
    expect(l.worldWidth).toBeGreaterThan(SAFE);
    expect(Math.round(l.worldHeight)).toBe(SAFE);
  });

  it('round-trips screen and world coordinates', () => {
    const l = computeLayout(390, 844);
    const w = screenToWorld(l, 123, 456, { x: 0, y: 0 });
    const s = worldToScreen(l, w.x, w.y, { x: 0, y: 0 });
    expect(s.x).toBeCloseTo(123, 6);
    expect(s.y).toBeCloseTo(456, 6);
  });

  it('puts the screen centre at the world origin', () => {
    const l = computeLayout(1024, 1366);
    const w = screenToWorld(l, 512, 683, { x: 0, y: 0 });
    expect(w.x).toBeCloseTo(0, 6);
    expect(w.y).toBeCloseTo(0, 6);
  });

  it('survives degenerate sizes', () => {
    const l = computeLayout(0, 0);
    expect(Number.isFinite(l.scale)).toBe(true);
    expect(l.scale).toBeGreaterThan(0);
  });
});
