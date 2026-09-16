import type { ElementId } from './elements';
import {
  baseFlameColor,
  elementFlameColor,
  toRGBInt,
  type FlameColor as SpectralColor,
} from './color';

/**
 * 元素 → 炎の表示色の対応は、この一箇所だけに置く。
 *
 * 色そのもの（rgb / hex / 主波長）は **算出しない**。`color.ts` が発光線を
 * CIE 1931 の等色関数で積分し、色域マッピングと輝度正規化を通して出した値を
 * そのまま引き写す。ここに数値を書き写すことはしない（写し間違いが起きるため）。
 * `tests/elementColors.test.ts` が、算出結果が仕様書（docs/DEV.md）の hex と
 * 一致していることを見張る。
 *
 * 一方、**許容範囲**（色相 hue と明度 value の 2 軸）は仕様であって算出物ではない。
 * 検査がどこまでのずれを許すかという判断なので、ここに直接置く。
 * 赤2種（ストロンチウム=緋 / リチウム=深紅）の色相差は実際には 3.5° しかなく、
 * 色相だけでは分けられない。これは誤りではなく現実であり、区別は主に
 * 明るさ（表示輝度比 約 2.4 倍）と主波長で付く。そのため 2 軸で定義する。
 */
export interface FlameColorSpec {
  /** sRGB 0..255（color.ts の算出結果） */
  rgb: readonly [number, number, number];
  /** 0xRRGGBB（color.ts の算出結果） */
  hex: number;
  /** 色相の許容範囲（度, 0..360）。範囲をまたぐ場合は from > to。 */
  hue: { from: number; to: number };
  /** 明度（HSV の V, 0..1）の許容範囲。赤2種はこちらで分かれる。 */
  value: { from: number; to: number };
  /** 仕様上の呼び名 */
  name: string;
  /** 主波長（nm）。color.ts の算出値。無彩色なら NaN */
  dominantWavelengthNm: number;
  /** シェーダへ渡す線形 sRGB（0..1）。色域マッピング・輝度正規化まで済んでいる */
  linear: readonly [number, number, number];
}

/** color.ts の算出結果に、仕様としての許容範囲と呼び名を添える。 */
function spec(
  c: SpectralColor,
  name: string,
  hue: { from: number; to: number },
  value: { from: number; to: number },
): FlameColorSpec {
  const q = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return {
    rgb: [q(c.srgb.r), q(c.srgb.g), q(c.srgb.b)],
    hex: toRGBInt(c.srgb),
    hue,
    value,
    name,
    dominantWavelengthNm: c.dominantWavelengthNm,
    linear: [c.linear.r, c.linear.g, c.linear.b],
  };
}

/** バーナーの素の炎（ガス炎）。何も入れなければ青いまま。算出値は #0053b3 */
export const BASE_FLAME_COLOR: FlameColorSpec = spec(
  baseFlameColor(),
  'ガス炎の青',
  { from: 198, to: 240 },
  { from: 0.5, to: 0.95 },
);

export const ELEMENT_FLAME_COLORS: Record<ElementId, FlameColorSpec> = {
  // 銅: 510.6 / 515.3 / 521.8 nm の緑に青の線群が混ざり、青緑に見える。算出値は #00d0d3
  copper: spec(
    elementFlameColor('copper'),
    '青緑',
    { from: 160, to: 196 },
    { from: 0.6, to: 1.0 },
  ),
  // ストロンチウム: 606 nm 付近の橙と 650-690 nm 帯の赤で、明るい緋。算出値は #ac0026
  strontium: spec(
    elementFlameColor('strontium'),
    '緋',
    { from: 330, to: 360 },
    { from: 0.56, to: 0.82 },
  ),
  // リチウム: 670.8 nm の赤が強く、暗く深い紅。算出値は #720020
  lithium: spec(
    elementFlameColor('lithium'),
    '深紅',
    { from: 330, to: 360 },
    { from: 0.3, to: 0.55 },
  ),
};

export function flameColorOf(element: ElementId | null): FlameColorSpec {
  return element === null ? BASE_FLAME_COLOR : ELEMENT_FLAME_COLORS[element];
}

/** sRGB(0..255) → 色相（度, 0..360）。彩度が無い場合は null。 */
export function hueOf(r: number, g: number, b: number): number | null {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return null;
  let h: number;
  if (max === r) h = 60 * (((g - b) / d) % 6);
  else if (max === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  return h;
}

/** sRGB(0..255) → 明度（HSV の V, 0..1）。 */
export function valueOf(r: number, g: number, b: number): number {
  return Math.max(r, g, b) / 255;
}

/** 色相が許容範囲に入るか。範囲が 0 度をまたぐ場合も扱う。 */
export function hueWithin(h: number, range: { from: number; to: number }): boolean {
  const hn = ((h % 360) + 360) % 360;
  if (range.from <= range.to) return hn >= range.from && hn <= range.to;
  return hn >= range.from || hn <= range.to;
}

export function valueWithin(v: number, range: { from: number; to: number }): boolean {
  return v >= range.from && v <= range.to;
}

/** 色相と明度の 2 軸が両方とも許容範囲に入るか。 */
export function flameColorMatches(h: number, v: number, c: FlameColorSpec): boolean {
  return hueWithin(h, c.hue) && valueWithin(v, c.value);
}

function rangesOverlap(a: { from: number; to: number }, b: { from: number; to: number }): boolean {
  return a.from <= b.to && b.from <= a.to;
}

function hueRangesOverlap(a: { from: number; to: number }, b: { from: number; to: number }): boolean {
  const spans = (r: { from: number; to: number }): { from: number; to: number }[] =>
    r.from <= r.to ? [r] : [
      { from: r.from, to: 360 },
      { from: 0, to: r.to },
    ];
  for (const sa of spans(a)) for (const sb of spans(b)) if (rangesOverlap(sa, sb)) return true;
  return false;
}

/**
 * 2 軸（色相 × 明度）を合わせた許容領域が重なるか。
 * 赤2種は色相では重なるが、明度で分かれるので重ならない。
 */
export function flameRegionsOverlap(a: FlameColorSpec, b: FlameColorSpec): boolean {
  return hueRangesOverlap(a.hue, b.hue) && rangesOverlap(a.value, b.value);
}
