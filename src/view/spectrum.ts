/**
 * spectrum.ts — プリズムが壁に投げる光の絵（PLAN §3.5）
 *
 * 帯の中心・幅・明るさ・色は `src/flame/prism.ts` が発光線から出したものを
 * そのまま使う（ここでは一切作らない）。この file がやるのは、
 * 「平たい矩形」ではなく「壁に落ちた光」に見えるようにすることだけ。
 *
 *  - 波長方向の縁は `bandFalloff()` の形そのままに連続して薄くなる
 *    （継ぎ目が出ないよう、帯 1 本を 1 枚のグラデーションで塗る）。
 *  - 壁に当たる高さの上下も薄れる（光の束の断面）。段差にならないよう、
 *    同じ中心の入れ子で重ねる（隣り合わせにすると継ぎ目の線が出る）。
 *  - プリズムから壁へ、薄い光の扇（分散の道筋）が伸びる。
 *
 * 光なので加算で重ねる。重なった帯は足し合わさる。
 */
import { FillGradient, type Graphics } from 'pixi.js';
import { bandFalloff, bandSupportNm, spectrumU, type SpectrumBand } from '../flame/prism';
import { rgba, type Rect } from './paint';

/** 帯の断面を写し取る止め色の数（多いほどなめらか）。 */
const PROFILE_STOPS = 21;

/**
 * 壁に当たる高さ方向の重なり。中心を共有する入れ子で、
 * 中ほどが明るく上下がやわらかく消える（合計は中心で 1）。
 */
const ROWS: readonly (readonly [number, number])[] = [
  [1, 0.34],
  [0.72, 0.33],
  [0.4, 0.33],
];

const bandFills = new Map<string, FillGradient>();

/** 一本の帯の、波長方向の明るさの断面をそのまま写した塗り。 */
function bandFill(b: SpectrumBand): FillGradient {
  const key = `${b.wavelengthNm}:${b.widthNm}:${b.hex}`;
  const hit = bandFills.get(key);
  if (hit) return hit;
  const support = bandSupportNm(b.widthNm);
  const stops: { offset: number; color: string }[] = [];
  for (let i = 0; i < PROFILE_STOPS; i++) {
    const k = i / (PROFILE_STOPS - 1);
    stops.push({ offset: k, color: rgba(b.hex, bandFalloff((k * 2 - 1) * support, b.widthNm)) });
  }
  const g = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    colorStops: stops,
    textureSpace: 'local',
  });
  bandFills.set(key, g);
  return g;
}

/** 波長 → 壁の上の x。位置は prism.ts の写像だけを通る。 */
function wallX(wall: Rect, nm: number): number {
  return wall.x + spectrumU(nm) * wall.w;
}

/** 壁に落ちた縞。 */
export function drawSpectrumBands(g: Graphics, bands: readonly SpectrumBand[], wall: Rect): void {
  const cy = wall.y + wall.h / 2;
  for (const b of bands) {
    const support = bandSupportNm(b.widthNm);
    const x0 = wallX(wall, b.wavelengthNm - support);
    const x1 = wallX(wall, b.wavelengthNm + support);
    const w = Math.max(1, x1 - x0);
    const fill = bandFill(b);
    for (const [hk, a] of ROWS) {
      const h = wall.h * hk;
      g.rect(x0, cy - h / 2, w, h).fill({ fill, alpha: a });
    }
  }
}
