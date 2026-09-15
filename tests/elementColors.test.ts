import { describe, expect, it } from 'vitest';
import {
  BASE_FLAME_COLOR,
  ELEMENT_FLAME_COLORS,
  flameColorMatches,
  flameColorOf,
  flameRegionsOverlap,
  hueOf,
  hueWithin,
  valueOf,
} from '../src/flame/elementColors';
import { ELEMENT_IDS, type ElementId } from '../src/flame/elements';

const ALL = [...ELEMENT_IDS.map((id) => [id, ELEMENT_FLAME_COLORS[id]] as const), ['base', BASE_FLAME_COLOR] as const];

function hv(rgb: readonly [number, number, number]): { h: number; v: number } {
  const h = hueOf(rgb[0], rgb[1], rgb[2]);
  expect(h).not.toBeNull();
  return { h: h!, v: valueOf(rgb[0], rgb[1], rgb[2]) };
}

describe('元素 → 表示色', () => {
  it('各色は自分の許容領域（色相 × 明度）に入る', () => {
    for (const [name, c] of ALL) {
      const { h, v } = hv(c.rgb);
      expect(flameColorMatches(h, v, c), `${name} hue=${h.toFixed(1)} value=${v.toFixed(3)}`).toBe(true);
    }
  });

  it('どの二つの許容領域も重ならない（赤2種は明度で分かれる）', () => {
    for (let i = 0; i < ALL.length; i++) {
      for (let j = i + 1; j < ALL.length; j++) {
        const [na, a] = ALL[i];
        const [nb, b] = ALL[j];
        expect(flameRegionsOverlap(a, b), `${na} と ${nb} の許容領域が重なる`).toBe(false);
      }
    }
  });

  it('赤2種は色相ではほぼ同じで、明度で見分けがつく', () => {
    const sr = hv(ELEMENT_FLAME_COLORS.strontium.rgb);
    const li = hv(ELEMENT_FLAME_COLORS.lithium.rgb);
    // 色相差はわずか（現実どおり）
    expect(Math.abs(sr.h - li.h)).toBeLessThan(10);
    // 色相の許容範囲は共通の赤
    expect(hueWithin(sr.h, ELEMENT_FLAME_COLORS.lithium.hue)).toBe(true);
    expect(hueWithin(li.h, ELEMENT_FLAME_COLORS.strontium.hue)).toBe(true);
    // 明度で分かれる: 緋の方が明るい
    expect(sr.v).toBeGreaterThan(li.v);
    expect(flameColorMatches(sr.h, sr.v, ELEMENT_FLAME_COLORS.lithium)).toBe(false);
    expect(flameColorMatches(li.h, li.v, ELEMENT_FLAME_COLORS.strontium)).toBe(false);
  });

  it('主波長はストロンチウムの方が短い（緋 624.1 nm / 深紅 657.3 nm）', () => {
    const sr = ELEMENT_FLAME_COLORS.strontium.dominantWavelengthNm!;
    const li = ELEMENT_FLAME_COLORS.lithium.dominantWavelengthNm!;
    expect(sr).toBeLessThan(li);
  });

  it('何も入れない炎はガス炎の青', () => {
    const c = flameColorOf(null);
    expect(c).toBe(BASE_FLAME_COLOR);
    const { h, v } = hv(c.rgb);
    expect(flameColorMatches(h, v, BASE_FLAME_COLOR)).toBe(true);
  });

  it('銅は青緑（緑と青の間）で、素の青とは別の領域', () => {
    const cu = hv(ELEMENT_FLAME_COLORS.copper.rgb);
    expect(cu.h).toBeGreaterThan(160);
    expect(cu.h).toBeLessThan(200);
    expect(flameColorMatches(cu.h, cu.v, BASE_FLAME_COLOR)).toBe(false);
  });

  it('hex は rgb と一致する', () => {
    for (const [, c] of ALL) {
      expect(c.hex).toBe((c.rgb[0] << 16) | (c.rgb[1] << 8) | c.rgb[2]);
    }
  });

  it('0 度をまたぐ色相範囲を扱える', () => {
    expect(hueWithin(5, { from: 355, to: 20 })).toBe(true);
    expect(hueWithin(357, { from: 355, to: 20 })).toBe(true);
    expect(hueWithin(200, { from: 355, to: 20 })).toBe(false);
  });

  it('元素ごとに色が引ける', () => {
    for (const id of ELEMENT_IDS) {
      expect(flameColorOf(id as ElementId)).toBe(ELEMENT_FLAME_COLORS[id]);
    }
  });
});
