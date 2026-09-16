/**
 * prism.ts — プリズムが壁に映す縞（純関数・純データのみ、PixiJS も DOM も使わない）
 *
 * PLAN §3.5:
 *   「縞は表 3.2 の発光線を波長軸上に描く。リチウムは赤の太い一本、
 *     ストロンチウムは赤帯＋橙＋青の複数、銅は緑の複数」
 *
 * ここが決めるのは「どの波長に、どれだけの幅と明るさで、何色の帯を置くか」だけ。
 * 波長も強度も spectra.ts、色は color.ts が算出する。この中に色リテラルは無い。
 *
 * ★幅について（M1 README の指摘）★
 *   炎の中で光っているものの多くは原子線ではなく分子バンドで、本来 1 本の線ではなく
 *   数 nm〜数十 nm の幅を持つ。spectra.ts はそれを代表波長に離散化しているので、
 *   ここで幅を戻す。原子線は細く（装置分解能ぶんだけ）、分子バンドは太く描く。
 *
 * ★明るさについて★
 *   壁に見える明るさは「放射パワー × その波長の視感効率 V(λ)」で決まる。
 *   だから同じ相対強度でも、目の感度が低い波長（深赤・青紫）の線は暗く映る。
 *   この積を線形光として置き、最後に sRGB 伝達関数を通す。
 *   その結果、
 *     - Sr の 460.7 nm（相対強度 0.03）は「弱いが確かに見える青の線」になり、
 *     - Li の 460.3 nm（相対強度 0.0005）は事実上見えない、
 *   という実際の見え方の差がそのまま出る。見栄えで足したり引いたりはしない。
 */

import type { EmissionLine, ElementId as SpectrumElementId, EmitterKind } from './spectra';
import { BASE_GAS_FLAME_LINES, getSpectrum } from './spectra';
import { linearToSRGB, spectrumToFlameColor, toRGBInt, type RGB } from './color';

/** 波長軸の左端 [nm]。これより短い線（Cu I 324.8 nm など）は紫外で目に見えない。 */
export const SPECTRUM_MIN_NM = 380;
/** 波長軸の右端 [nm]。これより長い線は赤外で目に見えない。 */
export const SPECTRUM_MAX_NM = 720;

/**
 * 原子線の幅 [nm]。原子線の自然幅は 1e-3 nm 級で、これよりはるかに細い。
 * 分光器で見える線の太さを決めるのは線そのものではなくスリットの像なので、
 * ここでの値は「この装置のスリット幅」にあたる。分子バンドとの太さの差は保たれる。
 */
export const ATOMIC_WIDTH_NM = 6;
/** 分子バンドの幅 [nm]。spectra.ts が代表波長に潰した構造を戻すぶん。 */
export const MOLECULAR_WIDTH_NM = 14;

/** これより暗い帯は描かない（sRGB の 1/255 に満たない）。 */
export const MIN_VISIBLE_LEVEL = 1 / 255;

/**
 * 波長 → 波長軸上の位置 0..1（0 が SPECTRUM_MIN_NM、1 が SPECTRUM_MAX_NM）。
 *
 * 本物のプリズムの分散は波長に対して線形ではなく、短波長ほど強く曲がる。
 * ここでは「どの色がどこに出るか」を波長の順に正しく並べることだけを保証し、
 * 間隔は線形に取る（縞の順序と相対位置は正しく、絶対的な曲がり角は近似）。
 * 描画も検査もこの一つの関数を通すので、二つが食い違うことはない。
 */
export function spectrumU(wavelengthNm: number): number {
  return (wavelengthNm - SPECTRUM_MIN_NM) / (SPECTRUM_MAX_NM - SPECTRUM_MIN_NM);
}

/** spectrumU の逆。 */
export function spectrumNm(u: number): number {
  return SPECTRUM_MIN_NM + u * (SPECTRUM_MAX_NM - SPECTRUM_MIN_NM);
}

/** 発光の起源ごとの帯の幅 [nm]。 */
export function bandWidthNm(kind: EmitterKind): number {
  return kind === 'molecular' ? MOLECULAR_WIDTH_NM : ATOMIC_WIDTH_NM;
}

export interface SpectrumBand {
  /** 帯の中心波長 [nm]。 */
  readonly wavelengthNm: number;
  /** 帯の幅 [nm]。 */
  readonly widthNm: number;
  /** 波長軸上の中心 0..1。 */
  readonly u: number;
  /** 波長軸上の幅 0..1。 */
  readonly uWidth: number;
  /**
   * 壁に映る明るさ 0..1（線形光）。
   * 相対強度 × V(λ) を、その元素の可視域内の最大で割ったもの。
   */
  readonly level: number;
  /** その明るさで描く表示 sRGB（0xRRGGBB）。 */
  readonly hex: number;
  /** 同じものを 0..255 で。 */
  readonly rgb: readonly [number, number, number];
  readonly kind: EmitterKind;
  readonly species: string;
}

/** その波長の単色光が sRGB で出せる最も明るい色（線形、最大成分 = 1）。 */
function monochromePeakLinear(wavelengthNm: number): RGB {
  // normalizeLuminance を切って intensity を大きく取ると scale が 1 に飽和し、
  // 色度そのまま・最大成分 1 の「その色で出せる一番明るい線形 sRGB」が得られる。
  return spectrumToFlameColor([{ wavelengthNm, relativeIntensity: 1 }], {
    normalizeLuminance: false,
    intensity: 1e6,
  }).linear;
}

/** その波長の視感効率 V(λ) 相当（単位放射パワーあたりの Y、555 nm で 1）。 */
function luminousEfficacyAt(wavelengthNm: number): number {
  return spectrumToFlameColor([{ wavelengthNm, relativeIntensity: 1 }], {
    normalizeLuminance: false,
  }).luminousEfficacy;
}

/**
 * 炎の元素（null なら素のガス炎）の縞。波長の小さい順。
 *
 * 可視域の外の線は落とす（目に見えないものは映らない）。
 * 明るさは元素ごとに「その中で一番明るい帯 = 1」として正規化する。
 * 元素どうしの明るさの差は炎の色が持っているので、縞では形の違いを見せる。
 */
const BAND_CACHE = new Map<string, SpectrumBand[]>();

export function spectrumBands(element: SpectrumElementId | null): SpectrumBand[] {
  // 純関数なので覚えておける。等色関数の積分と主波長の探索は重いので、
  // 毎フレーム描き直すために一度だけ出して使い回す。
  const key = element ?? 'base';
  const hit = BAND_CACHE.get(key);
  if (hit) return hit;
  const out = computeBands(element);
  BAND_CACHE.set(key, out);
  return out;
}

function computeBands(element: SpectrumElementId | null): SpectrumBand[] {
  const lines: readonly EmissionLine[] =
    element === null ? BASE_GAS_FLAME_LINES : getSpectrum(element).lines;

  const visible = lines.filter(
    (l) => l.wavelengthNm >= SPECTRUM_MIN_NM && l.wavelengthNm <= SPECTRUM_MAX_NM,
  );
  const weights = visible.map((l) => l.relativeIntensity * luminousEfficacyAt(l.wavelengthNm));
  const max = Math.max(0, ...weights);
  if (!(max > 0)) return [];

  const bands: SpectrumBand[] = [];
  for (let i = 0; i < visible.length; i++) {
    const l = visible[i];
    const level = weights[i] / max;
    if (level < MIN_VISIBLE_LEVEL) continue;
    const peak = monochromePeakLinear(l.wavelengthNm);
    const srgb = linearToSRGB({ r: peak.r * level, g: peak.g * level, b: peak.b * level });
    const q = (c: number) => Math.round(Math.min(1, Math.max(0, c)) * 255);
    const widthNm = bandWidthNm(l.kind);
    bands.push({
      wavelengthNm: l.wavelengthNm,
      widthNm,
      u: spectrumU(l.wavelengthNm),
      uWidth: widthNm / (SPECTRUM_MAX_NM - SPECTRUM_MIN_NM),
      level,
      hex: toRGBInt(srgb),
      rgb: [q(srgb.r), q(srgb.g), q(srgb.b)],
      kind: l.kind,
      species: l.species,
    });
  }
  bands.sort((a, b) => a.wavelengthNm - b.wavelengthNm);
  return bands;
}
