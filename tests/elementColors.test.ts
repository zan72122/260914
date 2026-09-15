import { describe, expect, it } from 'vitest';
import {
  BASE_FLAME_COLOR,
  ELEMENT_FLAME_COLORS,
  flameColorOf,
  hueOf,
  hueWithin,
} from '../src/flame/elementColors';
import { ELEMENT_IDS } from '../src/flame/elements';

describe('元素 → 表示色', () => {
  it('各元素の色は、自分の色相許容範囲に入る', () => {
    for (const id of ELEMENT_IDS) {
      const c = ELEMENT_FLAME_COLORS[id];
      const h = hueOf(...(c.rgb as unknown as [number, number, number]));
      expect(h, id).not.toBeNull();
      expect(hueWithin(h!, c.hue), `${id} hue=${h}`).toBe(true);
    }
  });

  it('何も入れない炎はガス炎の青', () => {
    const c = flameColorOf(null);
    expect(c).toBe(BASE_FLAME_COLOR);
    const h = hueOf(...(c.rgb as unknown as [number, number, number]))!;
    expect(hueWithin(h, BASE_FLAME_COLOR.hue)).toBe(true);
  });

  it('銅は青緑（緑と青の間）', () => {
    const h = hueOf(...(ELEMENT_FLAME_COLORS.copper.rgb as unknown as [number, number, number]))!;
    expect(h).toBeGreaterThan(150);
    expect(h).toBeLessThan(200);
  });

  it('赤2種は色相が異なる（緋と深紅）', () => {
    const sr = hueOf(...(ELEMENT_FLAME_COLORS.strontium.rgb as unknown as [number, number, number]))!;
    const li = hueOf(...(ELEMENT_FLAME_COLORS.lithium.rgb as unknown as [number, number, number]))!;
    const diff = Math.abs(((sr - li + 540) % 360) - 180);
    expect(diff).toBeGreaterThan(5);
  });

  it('hex は rgb と一致する', () => {
    for (const id of ELEMENT_IDS) {
      const c = ELEMENT_FLAME_COLORS[id];
      expect(c.hex).toBe((c.rgb[0] << 16) | (c.rgb[1] << 8) | c.rgb[2]);
    }
  });

  it('0 度をまたぐ色相範囲を扱える', () => {
    expect(hueWithin(5, { from: 355, to: 20 })).toBe(true);
    expect(hueWithin(357, { from: 355, to: 20 })).toBe(true);
    expect(hueWithin(200, { from: 355, to: 20 })).toBe(false);
  });
});
