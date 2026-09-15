import type { ElementId } from '../flame/elements';

export type MaterialId = 'copper_scrap' | 'strontium_grains' | 'lithium_powder';
export type JobId = 'wiring' | 'flare' | 'battery';

export const MATERIAL_ELEMENT: Record<MaterialId, ElementId> = {
  copper_scrap: 'copper',
  strontium_grains: 'strontium',
  lithium_powder: 'lithium',
};

export const MATERIAL_IDS: readonly MaterialId[] = [
  'copper_scrap',
  'strontium_grains',
  'lithium_powder',
];

export type Orientation = 'portrait' | 'landscape';

export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 台の面の位置（台の高さに対する割合）。物はこの面に載る。 */
export const BENCH_SURFACE = 0.62;

export interface Layout {
  width: number;
  height: number;
  orientation: Orientation;
  /** 指で触る物の基準寸法（画面に依らず指に合う大きさ） */
  touchRadius: number;
  /** 手前: 試し燃やし台 */
  bench: Rect;
  /** 奥: 工房と港 */
  workshop: Rect;
  /** 炎: (x, y) が根本、w/h が大きさ。上に伸びる */
  flame: Rect;
  burner: Point;
  crate: Rect;
  materialSlots: Record<MaterialId, Point>;
  prism: Point;
  /** 切れた点火配線 */
  wireLeft: Point;
  wireGap: Point;
  wireRight: Point;
  /** 消えている作業灯 */
  workLamp: Point;
  /** 手を振る作業員 */
  worker: Point;
  /** 窓の外の港（M0 は位置の確保のみ） */
  harbor: Rect;
  ship: Point;
  flareLauncher: Point;
  /** 作業机のリモコンと電池工場の受け口（M0 は位置の確保のみ） */
  remote: Point;
  batteryFactory: Point;
}

/**
 * 台の上の位置。along は台を横切る方向（物を並べる方向）、across は奥行き方向。
 * 縦でも横でも同じ規則で、同じ物を置き直すだけ。
 */
function benchPoint(bench: Rect, along: number, across: number): Point {
  return { x: bench.x + bench.w * along, y: bench.y + bench.h * across };
}

function at(r: Rect, fx: number, fy: number): Point {
  return { x: r.x + r.w * fx, y: r.y + r.h * fy };
}

/**
 * 一枚の連続した世界を、画面の向きに合わせて置き直す。
 * 縦は上下に積み、横は左に台・右に工房を並べる。オブジェクトは同じもの。
 */
export function computeLayout(width: number, height: number): Layout {
  const orientation: Orientation = height >= width ? 'portrait' : 'landscape';
  const bench: Rect =
    orientation === 'portrait'
      ? { x: 0, y: height * (2 / 3), w: width, h: height / 3 }
      : { x: 0, y: 0, w: width * 0.4, h: height };
  const workshop: Rect =
    orientation === 'portrait'
      ? { x: 0, y: 0, w: width, h: height * (2 / 3) }
      : { x: width * 0.4, y: 0, w: width * 0.6, h: height };

  const benchShort = Math.min(bench.w, bench.h);
  const touchRadius = Math.max(28, Math.min(width, height) * 0.075);

  const burner = benchPoint(bench, 0.52, BENCH_SURFACE);
  // 炎は台の短辺にも、台の高さにも収まる大きさにする（縦横どちらでも画面から出ない）
  const flameH = Math.min(bench.h * 0.5, benchShort * 0.62);
  const flameW = flameH * 0.55;

  const crateCenter = benchPoint(bench, 0.24, BENCH_SURFACE + 0.1);
  const crateW = benchShort * 0.46;
  const crateH = benchShort * 0.3;

  return {
    width,
    height,
    orientation,
    touchRadius,
    bench,
    workshop,
    burner,
    flame: { x: burner.x, y: burner.y - flameH * 0.1, w: flameW, h: flameH },
    crate: { x: crateCenter.x - crateW / 2, y: crateCenter.y - crateH / 2, w: crateW, h: crateH },
    materialSlots: {
      copper_scrap: benchPoint(bench, 0.15, BENCH_SURFACE + 0.04),
      strontium_grains: benchPoint(bench, 0.24, BENCH_SURFACE + 0.16),
      lithium_powder: benchPoint(bench, 0.33, BENCH_SURFACE + 0.02),
    },
    prism: benchPoint(bench, 0.86, BENCH_SURFACE + 0.06),
    wireLeft: at(workshop, 0.09, 0.54),
    wireGap: at(workshop, 0.24, 0.51),
    wireRight: at(workshop, 0.39, 0.48),
    workLamp: at(workshop, 0.3, 0.22),
    worker: at(workshop, 0.36, 0.9),
    harbor: {
      x: workshop.x + workshop.w * 0.58,
      y: workshop.y + workshop.h * 0.05,
      w: workshop.w * 0.4,
      h: workshop.h * 0.36,
    },
    ship: at(workshop, 0.82, 0.24),
    flareLauncher: at(workshop, 0.62, 0.45),
    remote: at(workshop, 0.72, 0.93),
    batteryFactory: at(workshop, 0.9, 0.88),
  };
}
