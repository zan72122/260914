/**
 * paint.ts — 絵を描くための小さな道具（色の混ぜ方・段差の無いグラデーション・やわらかい光）
 *
 * ここには「世界が何であるか」は一切入らない。形と光の置き方だけを持つ。
 * 文字・記号は描かない（PLAN §2-1）。
 */
import { FillGradient, type Graphics } from 'pixi.js';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 0xRRGGBB を k で混ぜる。 */
export function mix(a: number, b: number, k: number): number {
  const t = Math.max(0, Math.min(1, k));
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = Math.round(ar + (((b >> 16) & 255) - ar) * t);
  const g = Math.round(ag + (((b >> 8) & 255) - ag) * t);
  const bl = Math.round(ab + ((b & 255) - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** 明るくする（k>0）/ 暗くする（k<0）。物の面の向きを表すのに使う。 */
export function shade(color: number, k: number): number {
  return k >= 0 ? mix(color, 0xffffff, k) : mix(color, 0x000000, -k);
}

/** 0..1 の滑らかな立ち上がり。光の縁をやわらかくするのに使う。 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 進み p のうち a..b の区間を 0..1 に切り出す。 */
export function seg(p: number, a: number, b: number): number {
  return Math.max(0, Math.min(1, (p - a) / (b - a)));
}

export function wave(t: number, period: number, phase = 0): number {
  return Math.sin((t / period) * Math.PI * 2 + phase);
}

const linearFills = new Map<string, FillGradient>();

/**
 * 縦のグラデーション。段差（バンディング）も、帯を何枚も重ねる無駄も出ないよう、
 * 一枚の塗りに連続した色の変化を持たせる（形は矩形 1 つ）。
 * `ease` は色の変わり方（既定は一定の速さ）。
 */
export function verticalGradient(
  g: Graphics,
  r: Rect,
  top: number,
  bottom: number,
  ease: (k: number) => number = (k) => k,
): void {
  const stops: { offset: number; color: string }[] = [];
  const n = 17;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    stops.push({ offset: k, color: rgba(mix(top, bottom, ease(k)), 1) });
  }
  const key = `v:${stops.map((s) => s.color).join('|')}`;
  let fill = linearFills.get(key);
  if (!fill) {
    fill = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: stops,
      textureSpace: 'local',
    });
    linearFills.set(key, fill);
  }
  g.rect(r.x, r.y, r.w, r.h).fill({ fill });
}

/** 0xRRGGBB と不透明度を CSS の色に。グラデーションの止め色に使う。 */
export function rgba(color: number, alpha: number): string {
  return `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})`;
}

/**
 * 光の落ち方（中心 1 → 縁 0）。輪が見えないよう、二乗で落として端を 0 に閉じる。
 */
export const GLOW_STOPS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.1, 0.88],
  [0.2, 0.72],
  [0.3, 0.56],
  [0.42, 0.39],
  [0.55, 0.25],
  [0.68, 0.14],
  [0.82, 0.06],
  [1, 0],
];

const glowFills = new Map<number, FillGradient>();

/** その色の「やわらかい光の玉」の塗り。色ごとに一度だけ作って使い回す。 */
function glowFill(color: number): FillGradient {
  const hit = glowFills.get(color);
  if (hit) return hit;
  const g = new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.5 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    colorStops: GLOW_STOPS.map(([offset, a]) => ({ offset, color: rgba(color, a) })),
    textureSpace: 'local',
  });
  glowFills.set(color, g);
  return g;
}

/**
 * やわらかい光の玉。硬い輪郭も段差の輪も出ないよう、
 * 中心から縁へ連続して薄くなる塗りを一枚置く。
 * `squash` で縦につぶすと、面に落ちた光の溜まりになる。
 */
export function softGlow(
  g: Graphics,
  x: number,
  y: number,
  radius: number,
  color: number,
  alpha: number,
  _layers = 0,
  squash = 1,
): void {
  if (!(alpha > 0) || !(radius > 0)) return;
  g.ellipse(x, y, radius, radius * squash).fill({
    fill: glowFill(color),
    alpha: Math.min(1, alpha),
  });
}

/**
 * 光の扇（光源から面へ広がる薄い光）。縁が硬く出ないよう、
 * 幅の違う扇を重ねて外へ行くほど薄くする。
 */
export function softFan(
  g: Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  halfWidthFrom: number,
  halfWidthTo: number,
  color: number,
  alpha: number,
  layers = 5,
): void {
  if (!(alpha > 0)) return;
  for (let i = layers; i >= 1; i--) {
    const k = i / layers;
    const a = (alpha * (1 - k * k * 0.85)) / (layers * 0.8);
    const hf = halfWidthFrom * k;
    const ht = halfWidthTo * k;
    g.poly([from.x - hf, from.y, from.x + hf, from.y, to.x + ht, to.y, to.x - ht, to.y]).fill({
      color,
      alpha: a,
    });
  }
}

/** 物が面に落とす影。接地点で濃く、離れるほど薄く広がる。 */
export function contactShadow(
  g: Graphics,
  x: number,
  y: number,
  radius: number,
  lift: number,
  alpha = 0.5,
): void {
  const spread = 1 + lift * 0.55;
  const a = alpha / (1 + lift * 1.3);
  softGlow(g, x, y + lift * 0.1, radius * spread, 0x000000, a, 0, 0.34);
}
