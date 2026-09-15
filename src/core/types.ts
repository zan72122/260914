/**
 * コアの型定義。Three.js には一切依存しない。
 * 座標系: x は右方向、y は奥(北)から手前(南)へ増える盤面インデックス。
 */

/** 方角。0=北(y-1) 1=東(x+1) 2=南(y+1) 3=西(x-1) */
export const NORTH = 0;
export const EAST = 1;
export const SOUTH = 2;
export const WEST = 3;

export type Direction = 0 | 1 | 2 | 3;

export const DIRECTIONS: readonly Direction[] = [NORTH, EAST, SOUTH, WEST];

/** 方角 → グリッド上の差分 */
export const DIR_DELTA: Readonly<Record<Direction, { dx: number; dy: number }>> = {
  0: { dx: 0, dy: -1 },
  1: { dx: 1, dy: 0 },
  2: { dx: 0, dy: 1 },
  3: { dx: -1, dy: 0 },
};

/** 反対の方角 */
export function opposite(d: Direction): Direction {
  return ((d + 2) % 4) as Direction;
}

/** 時計回りに 90 度回した方角 */
export function rotateDir(d: Direction, steps: number): Direction {
  return ((((d + steps) % 4) + 4) % 4) as Direction;
}

/** タイル種別(4.1) */
export type TileKind =
  | 'straight'
  | 'curve'
  | 'tee'
  | 'cross'
  | 'empty'
  | 'block'
  | 'start'
  | 'goal';

/** レイヤー。道路と線路は互いに接続しない(4.1) */
export type Layer = 'road' | 'rail';

/** 高さ段階。0 か 1 の 2 段のみ(決定事項 Q5) */
export type Height = 0 | 1;

export interface Tile {
  readonly kind: TileKind;
  /** 回転量(時計回りの 90 度単位、0..3)。基準形からの回転 */
  readonly rot: Direction;
  readonly height: Height;
  /** 通行不可タイル(empty/block)でも便宜上レイヤーを持つ */
  readonly layer: Layer;
}

export interface Board {
  readonly w: number;
  readonly h: number;
  /** 長さ w*h。インデックスは y*w+x */
  readonly tiles: readonly Tile[];
}

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export type ToolKind = 'rotate' | 'raise' | 'destroy';

export interface Tool {
  readonly kind: ToolKind;
  /** 適用範囲のセル一覧 */
  readonly cells: readonly Vec2[];
  /** 使い切りのツール(破壊)が既に使用済みかどうか */
  readonly used: boolean;
  /** 一度でもタップされたか(明滅を止める判定に使う) */
  readonly touched: boolean;
}

export interface GameState {
  readonly board: Board;
  readonly tools: readonly Tool[];
}
