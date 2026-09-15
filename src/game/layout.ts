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

/** 台の上の位置。長辺方向 along / 短辺方向 across で指定し、縦横で同じ配置規則を使う。 */
function benchPoint(bench: Rect, o: Orientation, along: number, across: number): Point {
  return o === 'portrait'
    ? { x: bench.x + bench.w * along, y: bench.y + bench.h * across }
    : { x: bench.x + bench.w * across, y: bench.y + bench.h * along };
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

  const burner = benchPoint(bench, orientation, 0.52, 0.5);
  const flameW = benchShort * 0.34;
  const flameH = benchShort * 0.62;

  const crateCenter = benchPoint(bench, orientation, 0.2, 0.52);
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
    flame: { x: burner.x, y: burner.y - benchShort * 0.06, w: flameW, h: flameH },
    crate: { x: crateCenter.x - crateW / 2, y: crateCenter.y - crateH / 2, w: crateW, h: crateH },
    materialSlots: {
      copper_scrap: benchPoint(bench, orientation, 0.12, 0.47),
      strontium_grains: benchPoint(bench, orientation, 0.2, 0.62),
      lithium_powder: benchPoint(bench, orientation, 0.28, 0.44),
    },
    prism: benchPoint(bench, orientation, 0.86, 0.6),
    wireLeft: at(workshop, 0.09, 0.54),
    wireGap: at(workshop, 0.24, 0.51),
    wireRight: at(workshop, 0.39, 0.48),
    workLamp: at(workshop, 0.3, 0.22),
    worker: at(workshop, 0.53, 0.66),
    harbor: {
      x: workshop.x + workshop.w * 0.58,
      y: workshop.y + workshop.h * 0.05,
      w: workshop.w * 0.4,
      h: workshop.h * 0.36,
    },
    ship: at(workshop, 0.82, 0.24),
    flareLauncher: at(workshop, 0.62, 0.45),
    remote: at(workshop, 0.7, 0.82),
    batteryFactory: at(workshop, 0.9, 0.8),
  };
}
