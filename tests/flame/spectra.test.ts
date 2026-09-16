/**
 * spectra.test.ts — 発光線データの検査
 *
 * 「値が存在する」ことではなく「PLAN §3.2 に書かれた線が、書かれた通りの
 *  強弱関係で入っている」ことを見る。
 */

import { describe, expect, it } from 'vitest';

import {
  BASE_GAS_FLAME_LINES,
  ELEMENT_SPECTRA,
  INNER_CONE_LINES,
  V1_ELEMENTS,
  blendSpectra,
  getSpectrum,
  normalizedLines,
  totalIntensity,
  type ElementId,
  type EmissionLine,
} from '../../src/flame/spectra';

const ALL: ElementId[] = ['copper', 'strontium', 'lithium', 'sodium', 'barium'];

function strongestVisible(lines: readonly EmissionLine[]): EmissionLine {
  return lines
    .filter((l) => l.wavelengthNm >= 380 && l.wavelengthNm <= 780)
    .reduce((a, b) => (b.relativeIntensity > a.relativeIntensity ? b : a));
}

/** ある波長帯に入る線の強度合計。 */
function bandPower(lines: readonly EmissionLine[], lo: number, hi: number): number {
  return lines
    .filter((l) => l.wavelengthNm >= lo && l.wavelengthNm < hi)
    .reduce((s, l) => s + l.relativeIntensity, 0);
}

describe('データの健全性', () => {
  it('v1 の 3 元素が揃っている（PLAN §1）', () => {
    expect([...V1_ELEMENTS].sort()).toEqual(['copper', 'lithium', 'strontium']);
  });

  it.each(ALL)('%s: 波長も強度も正で、出典メモがある', (id) => {
    const s = getSpectrum(id);
    expect(s.lines.length).toBeGreaterThan(0);
    for (const l of s.lines) {
      expect(l.wavelengthNm).toBeGreaterThan(100);
      expect(l.wavelengthNm).toBeLessThan(1200);
      expect(l.relativeIntensity).toBeGreaterThan(0);
      expect(l.note.length).toBeGreaterThan(3);
      expect(['atomic', 'molecular']).toContain(l.kind);
      expect(l.species.length).toBeGreaterThan(1);
    }
  });

  it.each(ALL)('%s: 波長の重複がない', (id) => {
    const nm = getSpectrum(id).lines.map((l) => l.wavelengthNm);
    expect(new Set(nm).size).toBe(nm.length);
  });

  it.each(ALL)('%s: 可視域に線がある', (id) => {
    expect(bandPower(getSpectrum(id).lines, 380, 780)).toBeGreaterThan(0);
  });

  it('不明な元素は例外', () => {
    expect(() => getSpectrum('cobalt' as ElementId)).toThrow();
  });
});

describe('PLAN §3.2 に書かれた線が入っている', () => {
  it('銅: 510.6 / 515.3 / 521.8 nm の緑線と、青の線群がある', () => {
    const cu = getSpectrum('copper').lines;
    for (const nm of [510.554, 515.324, 521.82]) {
      expect(cu.some((l) => Math.abs(l.wavelengthNm - nm) < 0.2)).toBe(true);
    }
    // 「他に青の線群」: 420–460 nm に複数本。
    expect(cu.filter((l) => l.wavelengthNm >= 420 && l.wavelengthNm < 460).length).toBeGreaterThanOrEqual(3);
    // 青緑になるには、青帯と緑帯がどちらも効いている必要がある。
    const blue = bandPower(cu, 420, 470);
    const green = bandPower(cu, 500, 560);
    expect(blue).toBeGreaterThan(0.2 * green);
    expect(green).toBeGreaterThan(0.5 * blue);
  });

  it('ストロンチウム: 460.7 nm 青 / 606 nm 付近の橙 / 650–690 nm の赤帯', () => {
    const sr = getSpectrum('strontium').lines;
    expect(sr.some((l) => Math.abs(l.wavelengthNm - 460.733) < 0.2)).toBe(true);
    expect(sr.some((l) => Math.abs(l.wavelengthNm - 606) < 3)).toBe(true);
    expect(bandPower(sr, 650, 691)).toBeGreaterThan(0);
    // 赤帯が全体を支配する（だから「緋」になる）。
    expect(bandPower(sr, 600, 700)).toBeGreaterThan(0.85 * totalIntensity(sr));
    // 青の共鳴線は弱い脇役にとどまる。
    expect(bandPower(sr, 455, 465)).toBeLessThan(0.05 * totalIntensity(sr));
  });

  it('リチウム: 670.8 nm が最強、610.4 nm は弱い橙', () => {
    const li = getSpectrum('lithium').lines;
    const strongest = strongestVisible(li);
    expect(strongest.wavelengthNm).toBeCloseTo(670.78, 1);
    const orange = li.find((l) => Math.abs(l.wavelengthNm - 610.365) < 0.2);
    expect(orange).toBeDefined();
    // 「弱い」の定義: 主線の 5% 未満（炎温度では実際にはさらに弱い）。
    expect(orange!.relativeIntensity).toBeLessThan(0.05 * strongest.relativeIntensity);
  });

  it('ナトリウム: D2 は D1 のおよそ 2 倍（統計重率）', () => {
    const na = getSpectrum('sodium').lines;
    const d2 = na.find((l) => Math.abs(l.wavelengthNm - 588.995) < 0.1)!;
    const d1 = na.find((l) => Math.abs(l.wavelengthNm - 589.592) < 0.1)!;
    expect(d2.relativeIntensity / d1.relativeIntensity).toBeCloseTo(2, 1);
  });

  it('素のガス炎: CH* 431.4 nm が最強（予混合炎の青の主因）', () => {
    expect(strongestVisible(BASE_GAS_FLAME_LINES).wavelengthNm).toBeCloseTo(431.4, 1);
  });

  it('内炎: C2 Swan 516.5 nm が最強（還元帯で緑寄り）', () => {
    expect(strongestVisible(INNER_CONE_LINES).wavelengthNm).toBeCloseTo(516.5, 1);
  });
});

describe('正規化と合成', () => {
  it.each(ALL)('%s: normalizedLines の総和は 1', (id) => {
    expect(totalIntensity(normalizedLines(getSpectrum(id).lines))).toBeCloseTo(1, 12);
  });

  it('normalizedLines は入力を書き換えない', () => {
    const before = JSON.stringify(ELEMENT_SPECTRA.lithium.lines);
    normalizedLines(ELEMENT_SPECTRA.lithium.lines);
    expect(JSON.stringify(ELEMENT_SPECTRA.lithium.lines)).toBe(before);
  });

  it('空スペクトルの正規化は例外', () => {
    expect(() => normalizedLines([])).toThrow();
  });

  it('blendSpectra の総パワーは常に 1', () => {
    for (const m of [0, 0.1, 0.5, 0.9, 1]) {
      const mixed = blendSpectra(BASE_GAS_FLAME_LINES, getSpectrum('strontium').lines, m);
      expect(totalIntensity(mixed)).toBeCloseTo(1, 12);
    }
  });

  it('blendSpectra の端点は片方のスペクトルそのもの', () => {
    const a = blendSpectra(BASE_GAS_FLAME_LINES, getSpectrum('copper').lines, 0);
    expect(a.map((l) => l.wavelengthNm)).toEqual(BASE_GAS_FLAME_LINES.map((l) => l.wavelengthNm));

    const b = blendSpectra(BASE_GAS_FLAME_LINES, getSpectrum('copper').lines, 1);
    expect(b.map((l) => l.wavelengthNm)).toEqual(
      getSpectrum('copper').lines.map((l) => l.wavelengthNm),
    );
  });

  it('blendSpectra は mix を [0,1] にクランプする', () => {
    expect(totalIntensity(blendSpectra(BASE_GAS_FLAME_LINES, getSpectrum('copper').lines, 5))).toBeCloseTo(1, 12);
    expect(totalIntensity(blendSpectra(BASE_GAS_FLAME_LINES, getSpectrum('copper').lines, -5))).toBeCloseTo(1, 12);
  });

  it('mix が上がるほど元素側のパワーが単調に増える', () => {
    const li = getSpectrum('lithium').lines;
    const powerOfLine = (mix: number) => {
      const mixed = blendSpectra(BASE_GAS_FLAME_LINES, li, mix);
      return mixed
        .filter((l) => Math.abs(l.wavelengthNm - 670.784) < 0.1)
        .reduce((s, l) => s + l.relativeIntensity, 0);
    };
    let prev = -1;
    for (let m = 0; m <= 1.0001; m += 0.1) {
      const p = powerOfLine(m);
      expect(p).toBeGreaterThan(prev);
      prev = p;
    }
  });
});
