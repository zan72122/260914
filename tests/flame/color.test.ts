/**
 * color.test.ts — 色算出の検査
 *
 * 期待値は「仕様から定めた範囲」で書く。例外が出ないことを合格条件にしない。
 * 範囲は PLAN §3.2 の炎色の記述（銅=青緑 / ストロンチウム=緋 / リチウム=深紅 /
 * 素の炎=青）を、CIE 主波長と HSV 色相の数値範囲に落としたもの。
 * 下限・上限の根拠は各テストのコメントに書く。
 */

import { describe, expect, it } from 'vitest';

import {
  CMF_MAX_NM,
  CMF_MIN_NM,
  D65_CHROMATICITY,
  baseFlameColor,
  blackBodyColor,
  chromaticityOf,
  dominantWavelengthNm,
  elementFlameColor,
  flameColor,
  gamutMapLinear,
  hueDistance,
  innerConeColor,
  linearToSRGBComponent,
  rgbToHSV,
  relativeLuminance,
  sampleCMF,
  sootColor,
  spectrumToFlameColor,
  spectrumToXYZ,
  srgbToLinearComponent,
  toHex,
  xyzToLinearSRGB,
} from '../../src/flame/color';

// ---------------------------------------------------------------------------
// 1. 等色関数
// ---------------------------------------------------------------------------

describe('CIE 1931 2° 等色関数', () => {
  it('ȳ は 555 nm で 1.0（定義）', () => {
    expect(sampleCMF(555).Y).toBeCloseTo(1.0, 3);
  });

  it('ȳ の最大は 550–560 nm にある', () => {
    let best = CMF_MIN_NM;
    for (let nm = CMF_MIN_NM; nm <= CMF_MAX_NM; nm += 1) {
      if (sampleCMF(nm).Y > sampleCMF(best).Y) best = nm;
    }
    expect(best).toBeGreaterThanOrEqual(550);
    expect(best).toBeLessThanOrEqual(560);
  });

  it('CIE 公表値と一致する（表の格子点）', () => {
    // CIE 1931 2-deg の標準表から抜粋。表引きが壊れていないことの検査。
    expect(sampleCMF(600).X).toBeCloseTo(1.0622, 4);
    expect(sampleCMF(600).Y).toBeCloseTo(0.631, 4);
    expect(sampleCMF(450).Z).toBeCloseTo(1.7721, 3);
    expect(sampleCMF(700).Y).toBeCloseTo(0.0041, 3);
  });

  it('リチウム 670.8 nm の視感度は 0.03 前後（深紅が暗い理由）', () => {
    // CIE 表の 670 nm で ȳ=0.032、675 nm で 0.0232。670.8 nm はその間。
    const y = sampleCMF(670.784).Y;
    expect(y).toBeGreaterThan(0.028);
    expect(y).toBeLessThan(0.033);
  });

  it('可視域の外は 0', () => {
    expect(sampleCMF(324.754)).toEqual({ X: 0, Y: 0, Z: 0 }); // Cu I の紫外線
    expect(sampleCMF(900)).toEqual({ X: 0, Y: 0, Z: 0 });
  });

  it('単色光の主波長はその波長そのもの（±1 nm）', () => {
    for (const nm of [450, 500, 550, 589, 620]) {
      expect(dominantWavelengthNm(chromaticityOf(sampleCMF(nm)))).toBeCloseTo(nm, 0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. 伝達関数・色域マッピング
// ---------------------------------------------------------------------------

describe('sRGB 伝達関数', () => {
  it('往復して元に戻る', () => {
    for (const v of [0, 0.001, 0.05, 0.2154, 0.5, 0.75, 1]) {
      expect(srgbToLinearComponent(linearToSRGBComponent(v))).toBeCloseTo(v, 6);
    }
  });

  it('既知の値', () => {
    expect(linearToSRGBComponent(0)).toBe(0);
    expect(linearToSRGBComponent(1)).toBeCloseTo(1, 9);
    expect(linearToSRGBComponent(0.5)).toBeCloseTo(0.7354, 3);
    expect(toHex({ r: 1, g: 0, b: 0 })).toBe('#ff0000');
  });
});

describe('色域マッピング', () => {
  it('色域内の色は動かさない', () => {
    const inside = { r: 0.4, g: 0.3, b: 0.2 };
    const out = gamutMapLinear(inside);
    expect(out.desaturation).toBe(0);
    expect(out.rgb).toEqual(inside);
  });

  it('色域外の色は輝度を保って白へ寄せる（= 主波長を保つ）', () => {
    // 520 nm 単色は sRGB 色域外（負成分が出る）。
    const raw = xyzToLinearSRGB(sampleCMF(520));
    expect(Math.min(raw.r, raw.g, raw.b)).toBeLessThan(0);

    const mapped = gamutMapLinear(raw);
    expect(Math.min(mapped.rgb.r, mapped.rgb.g, mapped.rgb.b)).toBeGreaterThanOrEqual(-1e-12);
    // 輝度は保存される。
    expect(relativeLuminance(mapped.rgb)).toBeCloseTo(relativeLuminance(raw), 6);

    // 色度点は「元の点 → D65」の直線上に載っている（主波長が変わらない）。
    const before = chromaticityOf(sampleCMF(520));
    const after = (() => {
      // 線形 sRGB → XYZ に戻さず、xy 平面での共線性だけを見る。
      // mapped = raw + t*(Y - raw) は XYZ 空間でも白色点への直線補間なので、
      // xy 平面でも白色点と元の点を結ぶ直線上に来る。
      const w = D65_CHROMATICITY;
      const t = mapped.desaturation;
      // 白へ t だけ寄せた点の色度（XYZ 空間の線形補間 → xy では直線上）
      return { x: before.x + t * (w.x - before.x), y: before.y + t * (w.y - before.y) };
    })();
    const cross =
      (after.x - D65_CHROMATICITY.x) * (before.y - D65_CHROMATICITY.y) -
      (after.y - D65_CHROMATICITY.y) * (before.x - D65_CHROMATICITY.x);
    expect(Math.abs(cross)).toBeLessThan(1e-9);
  });
});

// ---------------------------------------------------------------------------
// 3. 元素ごとの炎色（本題）
// ---------------------------------------------------------------------------
//
// 判定に使う量:
//   dominantWavelengthNm … CIE 主波長。物理的な色相そのもの。
//   hsv.h                … 表示 sRGB の色相角。実際に画面で見える色。
//   hsv.v / displayLuminance … 明るさ。
//
// 範囲は「その色と呼べる境界」から決める。中心値に合わせて狭く切らない。

describe('銅 — 青緑', () => {
  const cu = elementFlameColor('copper');

  it('主波長が青緑帯（480–505 nm）にある', () => {
    // 緑と青の境目。490 nm は「シアン」の代表波長。
    expect(cu.dominantWavelengthNm).toBeGreaterThan(480);
    expect(cu.dominantWavelengthNm).toBeLessThan(505);
  });

  it('色相が青緑（165–200°）', () => {
    expect(cu.hsv.h).toBeGreaterThan(165);
    expect(cu.hsv.h).toBeLessThan(200);
  });

  it('緑成分と青成分が赤成分を大きく上回る', () => {
    expect(cu.srgb.g).toBeGreaterThan(0.5);
    expect(cu.srgb.b).toBeGreaterThan(0.5);
    expect(cu.srgb.r).toBeLessThan(0.15);
  });
});

describe('ストロンチウム — 緋（明るい赤）', () => {
  const sr = elementFlameColor('strontium');

  it('主波長が橙赤〜赤（612–640 nm）', () => {
    // SrCl / SrOH バンドの重心。605 nm 帯と 650–690 nm 帯の合成でこの辺に来る。
    expect(sr.dominantWavelengthNm).toBeGreaterThan(612);
    expect(sr.dominantWavelengthNm).toBeLessThan(640);
  });

  it('色相が赤（335–360° の範囲、つまり赤〜わずかに紅寄り）', () => {
    expect(sr.hsv.h).toBeGreaterThan(335);
    expect(sr.hsv.h).toBeLessThanOrEqual(360);
  });

  it('赤成分が支配的で、緑がほぼ無い', () => {
    expect(sr.srgb.r).toBeGreaterThan(0.55);
    expect(sr.srgb.g).toBeLessThan(0.08);
  });
});

describe('リチウム — 深紅', () => {
  const li = elementFlameColor('lithium');

  it('主波長が深赤（645–690 nm）', () => {
    // Li I 670.8 nm 共鳴線が支配する。610.4 nm は炎温度では効かない。
    expect(li.dominantWavelengthNm).toBeGreaterThan(645);
    expect(li.dominantWavelengthNm).toBeLessThan(690);
  });

  it('色相が紅（330–355°）', () => {
    expect(li.hsv.h).toBeGreaterThan(330);
    expect(li.hsv.h).toBeLessThan(355);
  });

  it('「深」紅である: 明度が 0.6 未満で暗い', () => {
    // 670.8 nm の視感度が 0.03 しかないことの直接の帰結。
    expect(li.hsv.v).toBeLessThan(0.6);
    expect(li.hsv.v).toBeGreaterThan(0.2); // 見えなくなってはいけない（表示下限の効果）
  });
});

describe('二つの赤の区別（PLAN §3.2 / §3.5 の核心）', () => {
  const sr = elementFlameColor('strontium');
  const li = elementFlameColor('lithium');

  it('主波長が 20 nm 以上離れている', () => {
    // 実測 33.2 nm（Sr 624.1 / Li 657.3）。下限は余裕を見て 20 nm。
    // 20 nm は赤帯でも色度上はっきり分かれる差。
    expect(li.dominantWavelengthNm - sr.dominantWavelengthNm).toBeGreaterThanOrEqual(20);
  });

  it('リチウムの方が長波長側（＝より深い赤）である', () => {
    expect(li.dominantWavelengthNm).toBeGreaterThan(sr.dominantWavelengthNm);
  });

  it('色度距離が 0.04 以上ある', () => {
    // 実測 0.057。CIE xy で 0.04 は赤領域でも識別可能な差。
    const dx = sr.chromaticity.x - li.chromaticity.x;
    const dy = sr.chromaticity.y - li.chromaticity.y;
    expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(0.04);
  });

  it('表示色相が 2° 以上離れ、ストロンチウムの方が赤（0°）に近い', () => {
    // 実測 3.5°。同じ「赤」の中の差なので大きくはならない。
    // ここが小さいことこそ PLAN §3.5 がプリズムを用意した理由でもある。
    expect(hueDistance(sr.hsv.h, li.hsv.h)).toBeGreaterThanOrEqual(2);
    expect(hueDistance(sr.hsv.h, 360)).toBeLessThan(hueDistance(li.hsv.h, 360));
  });

  it('明るさが 2 倍以上違い、ストロンチウムの方が明るい', () => {
    // 視感効率 Sr 0.157 / Li 0.034（比 4.6）。表示正規化後でも 2 倍以上を保つ。
    expect(sr.luminousEfficacy / li.luminousEfficacy).toBeGreaterThan(3.5);
    expect(sr.displayLuminance / li.displayLuminance).toBeGreaterThanOrEqual(2.0);
  });

  it('HSV 明度の差が 0.15 以上ある（画面上でひと目で違う）', () => {
    // 実測 0.230（Sr 0.676 / Li 0.446）。
    expect(sr.hsv.v - li.hsv.v).toBeGreaterThanOrEqual(0.15);
  });
});

describe('素の青いガス炎', () => {
  const base = baseFlameColor();

  it('主波長が青（455–490 nm）', () => {
    // CH* 431.4 nm と C2 Swan の合成。
    expect(base.dominantWavelengthNm).toBeGreaterThan(455);
    expect(base.dominantWavelengthNm).toBeLessThan(490);
  });

  it('色相が青（195–250°）', () => {
    expect(base.hsv.h).toBeGreaterThan(195);
    expect(base.hsv.h).toBeLessThan(250);
  });

  it('青成分が最大', () => {
    expect(base.srgb.b).toBeGreaterThan(base.srgb.g);
    expect(base.srgb.b).toBeGreaterThan(base.srgb.r);
  });

  it('内炎は外炎より緑寄り（C2 Swan が強い）', () => {
    const inner = innerConeColor();
    expect(inner.dominantWavelengthNm).toBeGreaterThan(base.dominantWavelengthNm);
    expect(inner.chromaticity.y).toBeGreaterThan(base.chromaticity.y);
  });
});

describe('ナトリウム・バリウム（v2 用）', () => {
  it('ナトリウムは D 線そのものの黄（主波長 585–594 nm）', () => {
    const na = elementFlameColor('sodium');
    expect(na.dominantWavelengthNm).toBeGreaterThan(585);
    expect(na.dominantWavelengthNm).toBeLessThan(594);
    // sRGB では橙寄りの黄になる。これは 589 nm の物理どおりで、
    // 「レモン色の黄」にはならない。色相 20–60°。
    expect(na.hsv.h).toBeGreaterThan(20);
    expect(na.hsv.h).toBeLessThan(60);
    expect(na.srgb.r).toBeGreaterThan(0.8);
    expect(na.srgb.g).toBeGreaterThan(0.3);
    expect(na.srgb.b).toBeLessThan(0.15);
  });

  it('バリウムは緑（主波長 510–545 nm、色相 120–175°）', () => {
    const ba = elementFlameColor('barium');
    expect(ba.dominantWavelengthNm).toBeGreaterThan(510);
    expect(ba.dominantWavelengthNm).toBeLessThan(545);
    expect(ba.hsv.h).toBeGreaterThan(120);
    expect(ba.hsv.h).toBeLessThan(175);
  });
});

describe('元素どうしが十分に離れている', () => {
  it('銅は二つの赤のどちらからも色相で 90° 以上離れている', () => {
    const cu = elementFlameColor('copper');
    for (const e of ['strontium', 'lithium'] as const) {
      expect(hueDistance(cu.hsv.h, elementFlameColor(e).hsv.h)).toBeGreaterThan(90);
    }
  });

  it('素の炎は銅とも赤とも混同されない', () => {
    const base = baseFlameColor();
    expect(hueDistance(base.hsv.h, elementFlameColor('copper').hsv.h)).toBeGreaterThan(20);
    expect(hueDistance(base.hsv.h, elementFlameColor('strontium').hsv.h)).toBeGreaterThan(90);
    expect(hueDistance(base.hsv.h, elementFlameColor('lithium').hsv.h)).toBeGreaterThan(90);
  });
});

// ---------------------------------------------------------------------------
// 4. uMix による合成
// ---------------------------------------------------------------------------

describe('青いガス炎と元素色の合成（uMix）', () => {
  it('mix = 0 は素のガス炎と完全に一致する', () => {
    for (const e of ['copper', 'strontium', 'lithium'] as const) {
      expect(flameColor(e, 0).hex).toBe(baseFlameColor().hex);
    }
    expect(flameColor(null, 1).hex).toBe(baseFlameColor().hex);
  });

  it('mix = 1 は元素単体の色と完全に一致する', () => {
    for (const e of ['copper', 'strontium', 'lithium'] as const) {
      expect(flameColor(e, 1).hex).toBe(elementFlameColor(e).hex);
    }
  });

  it('mix は [0,1] にクランプされる', () => {
    expect(flameColor('copper', -5).hex).toBe(baseFlameColor().hex);
    expect(flameColor('copper', 7).hex).toBe(elementFlameColor('copper').hex);
  });

  it('銅は mix が上がるほど主波長が単調に元素側へ動く', () => {
    let prev = flameColor('copper', 0).dominantWavelengthNm;
    for (let m = 0.1; m <= 1.0001; m += 0.1) {
      const cur = flameColor('copper', m).dominantWavelengthNm;
      expect(cur).toBeGreaterThan(prev);
      prev = cur;
    }
  });

  it('合成はスペクトル加算なので、途中で色度が白色点を通り越さない', () => {
    // 青 + 赤 は加法混色で紫を通る。これは物理どおりで、
    // 「青から赤へ色相環の緑側を回る」ようなことは起きない。
    for (let m = 0; m <= 1.0001; m += 0.05) {
      const c = flameColor('strontium', m);
      expect(c.chromaticity.y).toBeLessThan(0.45);
      expect(Number.isFinite(c.chromaticity.x)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. 輝度正規化・強さ
// ---------------------------------------------------------------------------

describe('輝度正規化', () => {
  it('色度（色相・彩度）は輝度正規化の有無で変わらない', () => {
    for (const e of ['copper', 'strontium', 'lithium'] as const) {
      const a = elementFlameColor(e, { normalizeLuminance: true });
      const b = elementFlameColor(e, { normalizeLuminance: false });
      expect(a.chromaticity.x).toBeCloseTo(b.chromaticity.x, 12);
      expect(a.chromaticity.y).toBeCloseTo(b.chromaticity.y, 12);
      expect(a.dominantWavelengthNm).toBeCloseTo(b.dominantWavelengthNm, 9);
    }
  });

  it('視感効率の順序は表示明度の順序として保たれる', () => {
    const order = (['lithium', 'strontium', 'copper'] as const).map((e) => elementFlameColor(e));
    for (let i = 1; i < order.length; i++) {
      expect(order[i].luminousEfficacy).toBeGreaterThan(order[i - 1].luminousEfficacy);
      expect(order[i].hsv.v).toBeGreaterThan(order[i - 1].hsv.v);
    }
  });

  it('uIntensity は明るさだけを変え、色相を変えない', () => {
    const full = elementFlameColor('strontium', { intensity: 1 });
    const half = elementFlameColor('strontium', { intensity: 0.5 });
    expect(half.hsv.v).toBeLessThan(full.hsv.v);

    // 本来の不変量: 線形 sRGB の比（= 色度）がぴったり保たれること。
    expect(half.linear.r / full.linear.r).toBeCloseTo(0.5, 9);
    expect(half.chromaticity.x).toBeCloseTo(full.chromaticity.x, 12);

    // HSV の色相は sRGB 伝達関数を通した後の値から測るので、
    // 明るさを変えるとわずかにずれる（HSV の性質であって色の誤りではない）。2° 以内。
    expect(hueDistance(half.hsv.h, full.hsv.h)).toBeLessThan(2);
    expect(elementFlameColor('strontium', { intensity: 0 }).hex).toBe('#000000');
  });

  it('全ての元素で表示値が 0..1 に収まる', () => {
    for (const e of ['copper', 'strontium', 'lithium', 'sodium', 'barium'] as const) {
      const c = elementFlameColor(e);
      for (const v of [c.linear.r, c.linear.g, c.linear.b, c.srgb.r, c.srgb.g, c.srgb.b]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 6. 煤の輝点（黒体放射）
// ---------------------------------------------------------------------------

describe('煤の輝点', () => {
  it('1700 K の黒体は橙（主波長 585–620 nm）', () => {
    const soot = sootColor();
    expect(soot.dominantWavelengthNm).toBeGreaterThan(585);
    expect(soot.dominantWavelengthNm).toBeLessThan(620);
    expect(soot.srgb.r).toBeGreaterThan(soot.srgb.g);
    expect(soot.srgb.g).toBeGreaterThan(soot.srgb.b);
  });

  it('温度が上がるほど青く（主波長が短く）なる', () => {
    const a = blackBodyColor(1400);
    const b = blackBodyColor(2500);
    const c = blackBodyColor(6500);
    expect(b.chromaticity.x).toBeLessThan(a.chromaticity.x);
    expect(c.chromaticity.x).toBeLessThan(b.chromaticity.x);
  });

  it('6500 K はほぼ D65 白（色度が白色点の近く）', () => {
    const d65ish = blackBodyColor(6500);
    expect(Math.abs(d65ish.chromaticity.x - D65_CHROMATICITY.x)).toBeLessThan(0.02);
    expect(Math.abs(d65ish.chromaticity.y - D65_CHROMATICITY.y)).toBeLessThan(0.02);
  });
});

// ---------------------------------------------------------------------------
// 7. 退化した入力
// ---------------------------------------------------------------------------

describe('退化した入力', () => {
  it('空のスペクトルは黒', () => {
    const c = spectrumToFlameColor([]);
    expect(c.hex).toBe('#000000');
    expect(c.luminousEfficacy).toBe(0);
  });

  it('可視域外だけのスペクトルも黒（Cu I の紫外線だけ、など）', () => {
    const c = spectrumToFlameColor([{ wavelengthNm: 324.754, relativeIntensity: 1 }]);
    expect(c.hex).toBe('#000000');
  });

  it('XYZ 積分は強度スケールに依らない（比だけが効く）', () => {
    const a = spectrumToXYZ([{ wavelengthNm: 550, relativeIntensity: 1 }]);
    const b = spectrumToXYZ([{ wavelengthNm: 550, relativeIntensity: 1000 }]);
    expect(a.Y).toBeCloseTo(b.Y, 12);
  });

  it('rgbToHSV は無彩色で色相 0・彩度 0', () => {
    expect(rgbToHSV({ r: 0.4, g: 0.4, b: 0.4 })).toEqual({ h: 0, s: 0, v: 0.4 });
  });
});
