import type { ElementId } from './elements';

/**
 * 元素 → 炎の表示色の対応は、この一箇所だけに置く。
 *
 * M0 は仮の単色。M1 で発光線（表 3.2 の波長）から CIE 1931 → sRGB を経て
 * 算出した色に差し替えるが、差し替え先もこのモジュールであり、
 * 参照側（FlameRenderer / 余熱発光 / 検証）は変更しない。
 */
export interface FlameColor {
  /** sRGB 0..255 */
  rgb: readonly [number, number, number];
  /** 0xRRGGBB */
  hex: number;
  /** 検証で用いる色相の許容範囲（度, 0..360）。範囲をまたぐ場合は from > to。 */
  hue: { from: number; to: number };
  /** 仕様上の呼び名 */
  name: string;
}

function hex(rgb: readonly [number, number, number]): number {
  return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
}

/** バーナーの素の炎（ガス炎）。何も入れなければ青いまま。 */
export const BASE_FLAME_COLOR: FlameColor = {
  rgb: [58, 107, 255],
  hex: hex([58, 107, 255]),
  hue: { from: 200, to: 250 },
  name: 'ガス炎の青',
};

export const ELEMENT_FLAME_COLORS: Record<ElementId, FlameColor> = {
  // 銅: 510.6 / 515.3 / 521.8 nm の緑に青の線群が混ざり、青緑に見える
  copper: {
    rgb: [46, 224, 190],
    hex: hex([46, 224, 190]),
    hue: { from: 150, to: 200 },
    name: '青緑',
  },
  // ストロンチウム: 606 nm 付近の橙と 650-690 nm 帯の赤で、明るい緋
  strontium: {
    rgb: [255, 58, 30],
    hex: hex([255, 58, 30]),
    hue: { from: 355, to: 20 },
    name: '緋',
  },
  // リチウム: 670.8 nm の赤が強く、深紅
  lithium: {
    rgb: [224, 0, 48],
    hex: hex([224, 0, 48]),
    hue: { from: 335, to: 355 },
    name: '深紅',
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

/** 色相が許容範囲に入るか。範囲が 0 度をまたぐ場合も扱う。 */
export function hueWithin(h: number, range: { from: number; to: number }): boolean {
  const hn = ((h % 360) + 360) % 360;
  if (range.from <= range.to) return hn >= range.from && hn <= range.to;
  return hn >= range.from || hn <= range.to;
}
