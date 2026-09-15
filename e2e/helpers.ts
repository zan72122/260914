import { PNG } from 'pngjs';
import type { CDPSession, Page } from '@playwright/test';
import { hueOf, valueOf } from '../src/flame/elementColors';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 明るく色づいた画素だけを集めた、領域の色の代表値。 */
export interface RegionColor {
  /** 色相の円平均（度）。色づいた画素が無ければ null */
  hue: number | null;
  /** 色づいた画素の明度（HSV の V）の平均 0..1 */
  value: number;
  /** 色相を数えた画素の割合 */
  coloredRatio: number;
  /** 領域全体の平均輝度 0..1 */
  luma: number;
  /** 領域全体の平均 sRGB（0..255） */
  rgbMean: [number, number, number];
  samples: number;
}

/**
 * 領域の色を、色相（円平均）と明度（平均）の 2 軸で測る。
 * 赤2種は色相ではほぼ同じで、明度で分かれるため、両方を返す。
 */
export function analyzePng(buffer: Buffer, minValue = 0.2, minSat = 0.18): RegionColor {
  const png = PNG.sync.read(buffer);
  let sx = 0;
  let sy = 0;
  let colored = 0;
  let valueSum = 0;
  let lumaSum = 0;
  let rs = 0;
  let gs = 0;
  let bs = 0;
  const total = png.width * png.height;
  for (let i = 0; i < total; i++) {
    const r = png.data[i * 4];
    const g = png.data[i * 4 + 1];
    const b = png.data[i * 4 + 2];
    lumaSum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    rs += r;
    gs += g;
    bs += b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const v = max / 255;
    const s = max === 0 ? 0 : (max - min) / max;
    if (v < minValue || s < minSat) continue;
    const h = hueOf(r, g, b);
    if (h === null) continue;
    const w = v * s;
    sx += Math.cos((h * Math.PI) / 180) * w;
    sy += Math.sin((h * Math.PI) / 180) * w;
    valueSum += valueOf(r, g, b);
    colored++;
  }
  const hue = colored === 0 ? null : (((Math.atan2(sy, sx) * 180) / Math.PI) + 360) % 360;
  return {
    hue,
    value: colored === 0 ? 0 : valueSum / colored,
    coloredRatio: colored / total,
    luma: lumaSum / total,
    rgbMean: [rs / total, gs / total, bs / total],
    samples: total,
  };
}

/** 実タッチ（touchstart/touchmove/touchend）。pointer イベントもここから生まれる。 */
export class Finger {
  constructor(private readonly cdp: CDPSession) {}

  static async create(page: Page): Promise<Finger> {
    const cdp = await page.context().newCDPSession(page);
    return new Finger(cdp);
  }

  private async send(type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints:
        x === undefined || y === undefined ? [] : [{ x: Math.round(x), y: Math.round(y), id: 1 }],
    });
  }

  down(x: number, y: number): Promise<void> {
    return this.send('touchStart', x, y);
  }
  move(x: number, y: number): Promise<void> {
    return this.send('touchMove', x, y);
  }
  up(): Promise<void> {
    return this.send('touchEnd');
  }
}
