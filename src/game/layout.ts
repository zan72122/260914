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
  /** 奥の物を描くときの基準寸法。縦横で同じ見え方にするため工房の短辺から決める */
  unit: number;
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
  /** 切れた点火配線（銅） */
  wireLeft: Point;
  wireGap: Point;
  wireRight: Point;
  /** 消えている作業灯 */
  workLamp: Point;
  /** 手を振る作業員 */
  worker: Point;
  /** 窓の外の港（ストロンチウム） */
  harbor: Rect;
  /** 海面の高さ（画面座標） */
  waterlineY: number;
  /** 沖の小さな船 */
  ship: Point;
  /** 桟橋の信号炎の発射台 */
  flareLauncher: Point;
  /** 桟橋の人 */
  pierWorker: Point;
  /** 救助船の光が入ってくる位置 */
  rescueFrom: Point;
  /** 救助船の光が近づいて止まる位置 */
  rescueTo: Point;
  /** 作業机（リチウム） */
  desk: Rect;
  /** 電池工場の受け口 */
  batteryFactory: Point;
  /** 電池が出てくる口 */
  batteryOutlet: Point;
  /** 点火用リモコン（電池室） */
  remote: Point;
  /** リモコンのランプ */
  remoteLamp: Point;
  /** 机の人 */
  deskWorker: Point;
  /** 点火テストの小さな火 */
  testFirework: Point;
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

function sub(r: Rect, fx: number, fy: number, fw: number, fh: number): Rect {
  return { x: r.x + r.w * fx, y: r.y + r.h * fy, w: r.w * fw, h: r.h * fh };
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
  const unit = Math.max(10, Math.min(workshop.w, workshop.h) * 0.045);

  const burner = benchPoint(bench, 0.52, BENCH_SURFACE);
  // 炎は台の短辺にも、台の高さにも収まる大きさにする（縦横どちらでも画面から出ない）
  const flameH = Math.min(bench.h * 0.5, benchShort * 0.62);
  const flameW = flameH * 0.55;

  const crateCenter = benchPoint(bench, 0.24, BENCH_SURFACE + 0.1);
  const crateW = benchShort * 0.46;
  const crateH = benchShort * 0.3;

  const harbor = sub(workshop, 0.55, 0.04, 0.44, 0.4);
  const waterlineY = harbor.y + harbor.h * 0.55;
  const desk = sub(workshop, 0.56, 0.72, 0.43, 0.24);

  return {
    width,
    height,
    orientation,
    touchRadius,
    unit,
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
    wireLeft: at(workshop, 0.05, 0.54),
    wireGap: at(workshop, 0.2, 0.51),
    wireRight: at(workshop, 0.35, 0.48),
    workLamp: at(workshop, 0.26, 0.22),
    worker: at(workshop, 0.4, 0.9),
    harbor,
    waterlineY,
    ship: { x: harbor.x + harbor.w * 0.72, y: waterlineY },
    flareLauncher: { x: harbor.x + harbor.w * 0.14, y: harbor.y + harbor.h * 0.88 },
    pierWorker: { x: harbor.x + harbor.w * 0.32, y: harbor.y + harbor.h * 0.86 },
    rescueFrom: { x: harbor.x + harbor.w * 1.05, y: waterlineY - harbor.h * 0.04 },
    rescueTo: {
      // 窓の中に収まる位置まで近づく
      x: Math.min(harbor.x + harbor.w * 0.91, harbor.x + harbor.w * 0.72 + unit * 3.2),
      y: waterlineY - harbor.h * 0.04,
    },
    desk,
    batteryFactory: { x: desk.x + desk.w * 0.24, y: desk.y + desk.h * 0.42 },
    batteryOutlet: { x: desk.x + desk.w * 0.24, y: desk.y + desk.h * 0.72 },
    remote: { x: desk.x + desk.w * 0.74, y: desk.y + desk.h * 0.72 },
    remoteLamp: { x: desk.x + desk.w * 0.74 + unit * 0.85, y: desk.y + desk.h * 0.72 - unit * 0.3 },
    deskWorker: { x: desk.x + desk.w * 0.01, y: desk.y + desk.h * 0.72 },
    testFirework: { x: desk.x + desk.w * 0.74, y: desk.y - desk.h * 0.35 },
  };
}
