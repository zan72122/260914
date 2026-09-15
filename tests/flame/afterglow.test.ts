/**
 * afterglow.test.ts — 余熱発光（PLAN §3.3「約 3 秒」）の検査
 */

import { describe, expect, it } from 'vitest';

import {
  AFTERGLOW_DURATION_SECONDS,
  NO_AFTERGLOW,
  advanceAfterglow,
  afterglowHalfLifeSeconds,
  afterglowIntensity,
  afterglowLinearRGB,
  afterglowRemainingMs,
  isAfterglowing,
  startAfterglow,
} from '../../src/flame/afterglow.js';
import { elementFlameColor, flameColorToUniform, rgbToHSV } from '../../src/flame/color.js';

describe('減衰カーブ', () => {
  it('継続時間は 3.0 秒（PLAN §3.3 の「約 3 秒」）', () => {
    expect(AFTERGLOW_DURATION_SECONDS).toBe(3.0);
  });

  it('炎から出た瞬間は 1、3 秒でちょうど 0', () => {
    expect(afterglowIntensity(0)).toBe(1);
    expect(afterglowIntensity(AFTERGLOW_DURATION_SECONDS)).toBe(0);
    expect(afterglowIntensity(AFTERGLOW_DURATION_SECONDS + 10)).toBe(0);
    expect(afterglowIntensity(-1)).toBe(1); // 炎の中にいる間の扱い
  });

  it('区間全体で狭義単調減少（16 ms 刻みで検査）', () => {
    let prev = afterglowIntensity(0);
    for (let t = 0.016; t < AFTERGLOW_DURATION_SECONDS; t += 0.016) {
      const cur = afterglowIntensity(t);
      expect(cur).toBeLessThan(prev);
      expect(cur).toBeGreaterThan(0);
      prev = cur;
    }
  });

  it('半減期は約 1 秒（運びながら色を確かめられる長さ）', () => {
    const half = afterglowHalfLifeSeconds();
    expect(half).toBeGreaterThan(0.8);
    expect(half).toBeLessThan(1.2);
    expect(afterglowIntensity(half)).toBeCloseTo(0.5, 9);
  });

  it('1 秒後でも 3 割以上残り、2.5 秒後には 1 割を切る', () => {
    // 「運搬中に色を見せる」目的を満たしつつ、消えていくのが見える速さであること。
    expect(afterglowIntensity(1.0)).toBeGreaterThan(0.3);
    expect(afterglowIntensity(2.5)).toBeLessThan(0.1);
  });

  it('継続時間を変えても形は相似（1.5 秒版の中点＝3 秒版の中点）', () => {
    expect(afterglowIntensity(0.75, 1.5)).toBeCloseTo(afterglowIntensity(1.5, 3.0), 12);
  });

  it('壊れた入力で例外を投げず 0 を返す', () => {
    expect(afterglowIntensity(Number.NaN)).toBe(0);
    expect(afterglowIntensity(1, 0)).toBe(0);
    expect(afterglowIntensity(1, -3)).toBe(0);
  });

  it('isAfterglowing は 0 になった時点で false', () => {
    expect(isAfterglowing(2.999)).toBe(true);
    expect(isAfterglowing(3.0)).toBe(false);
  });

  it('残り時間 ms は PLAN §5.2 の held.afterglowMs に使える形', () => {
    expect(afterglowRemainingMs(0)).toBe(3000);
    expect(afterglowRemainingMs(1.25)).toBe(1750);
    expect(afterglowRemainingMs(5)).toBe(0);
  });
});

describe('状態の更新', () => {
  it('開始直後は強さ 1', () => {
    const s = startAfterglow('lithium');
    expect(s.element).toBe('lithium');
    expect(s.intensity).toBe(1);
    expect(s.elapsedSeconds).toBe(0);
  });

  it('16 ms 刻みで進めると 3 秒ちょうどで片付く', () => {
    let s = startAfterglow('strontium');
    let steps = 0;
    while (s.element !== null && steps < 1000) {
      s = advanceAfterglow(s, 0.016);
      steps++;
    }
    expect(s).toBe(NO_AFTERGLOW);
    // 3.0 / 0.016 = 187.5 → 188 ステップ目で終わる。
    expect(steps).toBe(188);
  });

  it('刻み方を変えても同じ時刻の強さは同じ（再現性。PLAN §5.5）', () => {
    let coarse = startAfterglow('copper');
    coarse = advanceAfterglow(coarse, 1.0);

    let fine = startAfterglow('copper');
    for (let i = 0; i < 100; i++) fine = advanceAfterglow(fine, 0.01);

    expect(fine.intensity).toBeCloseTo(coarse.intensity, 9);
  });

  it('dt が 0 や負なら状態は進まない', () => {
    const s = advanceAfterglow(startAfterglow('copper'), 0);
    expect(s.elapsedSeconds).toBe(0);
    expect(advanceAfterglow(s, -1).elapsedSeconds).toBe(0);
    expect(advanceAfterglow(s, Number.NaN).elapsedSeconds).toBe(0);
  });

  it('何も光っていない状態はそのまま', () => {
    expect(advanceAfterglow(NO_AFTERGLOW, 1)).toBe(NO_AFTERGLOW);
  });
});

describe('色は変えない（乖離を明るさだけに閉じ込める）', () => {
  it('余熱発光の色相は炎の中と同じ', () => {
    for (const e of ['copper', 'strontium', 'lithium'] as const) {
      const inFlame = elementFlameColor(e);
      const base = flameColorToUniform(inFlame);
      for (const t of [0, 0.5, 1.0, 2.0, 2.9]) {
        const [r, g, b] = afterglowLinearRGB(base, t);
        // 線形 sRGB の比が保たれている = 色度がまったく同じ。
        const k = afterglowIntensity(t);
        expect(r).toBeCloseTo(base[0] * k, 12);
        expect(g).toBeCloseTo(base[1] * k, 12);
        expect(b).toBeCloseTo(base[2] * k, 12);
      }
    }
  });

  it('リチウムの余熱発光は 1 秒後でもリチウムの色（紅）のまま', () => {
    const li = elementFlameColor('lithium');
    const [r, g, b] = afterglowLinearRGB(flameColorToUniform(li), 1.0);
    const hsv = rgbToHSV({
      r: Math.pow(r, 1 / 2.2),
      g: Math.pow(g, 1 / 2.2),
      b: Math.pow(b, 1 / 2.2),
    });
    expect(hsv.h).toBeGreaterThan(330);
    expect(hsv.h).toBeLessThan(355);
    expect(hsv.v).toBeGreaterThan(0.2); // まだ見える
  });

  it('3 秒後は完全に消える', () => {
    const li = flameColorToUniform(elementFlameColor('lithium'));
    expect(afterglowLinearRGB(li, 3.0)).toEqual([0, 0, 0]);
  });
});
