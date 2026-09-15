import type { ElementId } from './elements';

/**
 * 元素 → 炎の表示色の対応は、この一箇所だけに置く。
 *
 * hex は M1（炎シェーダ担当）が発光線から CIE 1931 → sRGB で算出した値。
 * 赤2種（ストロンチウム=緋 / リチウム=深紅）の色相差は実際には 3.5° しかなく、
 * 色相だけでは分けられない。これは誤りではなく現実であり、区別は主に
 * 明るさ（表示輝度比 約 2.4 倍）と主波長で付く。
 * そのため許容範囲は「色相」と「明度」の 2 軸で定義し、検査も 2 軸で行う。
 */
export interface FlameColor {
  /** sRGB 0..255 */
  rgb: readonly [number, number, number];
  /** 0xRRGGBB */
  hex: number;
  /** 色相の許容範囲（度, 0..360）。範囲をまたぐ場合は from > to。 */
  hue: { from: number; to: number };
  /** 明度（HSV の V, 0..1）の許容範囲。赤2種はこちらで分かれる。 */
  value: { from: number; to: number };
  /** 仕様上の呼び名 */
  name: string;
  /** 主波長（nm）。M1 の算出値 */
  dominantWavelengthNm?: number;
}

/** バーナーの素の炎（ガス炎）。何も入れなければ青いまま。#0053b3 */
export const BASE_FLAME_COLOR: FlameColor = {
  rgb: [0x00, 0x53, 0xb3],
  hex: 0x0053b3,
  hue: { from: 198, to: 240 },
  value: { from: 0.5, to: 0.95 },
  name: 'ガス炎の青',
};

export const ELEMENT_FLAME_COLORS: Record<ElementId, FlameColor> = {
  // 銅: 510.6 / 515.3 / 521.8 nm の緑に青の線群が混ざり、青緑に見える。#00d0d3
  copper: {
    rgb: [0x00, 0xd0, 0xd3],
    hex: 0x00d0d3,
    hue: { from: 160, to: 196 },
    value: { from: 0.6, to: 1.0 },
    name: '青緑',
  },
  // ストロンチウム: 606 nm 付近の橙と 650-690 nm 帯の赤で、明るい緋。#ac0026
  strontium: {
    rgb: [0xac, 0x00, 0x26],
    hex: 0xac0026,
    hue: { from: 330, to: 360 },
    value: { from: 0.56, to: 0.82 },
    name: '緋',
    dominantWavelengthNm: 624.1,
  },
  // リチウム: 670.8 nm の赤が強く、暗く深い紅。#720020
  lithium: {
    rgb: [0x72, 0x00, 0x20],
    hex: 0x720020,
    hue: { from: 330, to: 360 },
    value: { from: 0.3, to: 0.55 },
    name: '深紅',
    dominantWavelengthNm: 657.3,
  },
};

export function flameColorOf(element: ElementId | null): FlameColor {
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
export function flameColorMatches(h: number, v: number, c: FlameColor): boolean {
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
export function flameRegionsOverlap(a: FlameColor, b: FlameColor): boolean {
  return hueRangesOverlap(a.hue, b.hue) && rangesOverlap(a.value, b.value);
}
