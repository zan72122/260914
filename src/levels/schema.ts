import type { Board, Height, Layer, Tile, TileKind, Tool, ToolKind, Vec2, Direction } from '../core/types';

/** テーマ ID(7.1 のパレット表に対応)。M2 時点では砂漠(昼)のみ使用 */
export type ThemeId =
  | 'desert-day'
  | 'desert-dusk'
  | 'meadow'
  | 'water-day'
  | 'water-dusk'
  | 'gray-city'
  | 'green-city-night'
  | 'night-rail'
  | 'bridge-city'
  | 'night-festival';

export interface Palette {
  /** 地面(空地)上面 */
  readonly ground: string;
  /** 道路・線路の上面 */
  readonly road: string;
  /** アクセント(装飾など) */
  readonly accent: string;
  /** 背景(空) */
  readonly sky: string;
}

/** 7.1 のパレット表 */
export const PALETTES: Readonly<Record<ThemeId, Palette>> = {
  'desert-day': { ground: '#E8B454', road: '#8C8378', accent: '#F2E3B0', sky: '#F6D28A' },
  'desert-dusk': { ground: '#D9884A', road: '#8C8378', accent: '#FFD9A0', sky: '#E87A55' },
  meadow: { ground: '#7CBF5A', road: '#8C8378', accent: '#C8E89A', sky: '#9FD9F0' },
  'water-day': { ground: '#78C86A', road: '#8C8378', accent: '#F2D857', sky: '#BEE8F2' },
  'water-dusk': { ground: '#78C86A', road: '#8C8378', accent: '#F2D857', sky: '#E8A47A' },
  'gray-city': { ground: '#96A08C', road: '#6E6E6E', accent: '#C4C9BC', sky: '#AEB8A8' },
  'green-city-night': { ground: '#2E4A3A', road: '#4A4A4A', accent: '#F5D77A', sky: '#16283A' },
  'night-rail': { ground: '#1E3A4C', road: '#5A4A3E', accent: '#BFF7A8', sky: '#14202E' },
  'bridge-city': { ground: '#96A08C', road: '#6E6E6E', accent: '#5FC8D8', sky: '#BEE8F2' },
  'night-festival': { ground: '#2E4A3A', road: '#4A4A4A', accent: '#F5D77A', sky: '#14202E' },
}

/** 盤面の初期値からの差分としてセルを指定する */
export interface CellSpec {
  readonly x: number;
  readonly y: number;
  readonly kind: TileKind;
  readonly rot?: Direction;
  readonly height?: Height;
  readonly layer?: Layer;
}

export interface ToolSpec {
  readonly kind: ToolKind;
  readonly cells: readonly Vec2[];
}

export type VehicleKind = 'car' | 'train';

export interface Level {
  readonly id: string;
  readonly theme: ThemeId;
  readonly size: { readonly w: number; readonly h: number };
  readonly vehicle: VehicleKind;
  /** 盤面のセル定義(指定しないセルは空地) */
  readonly cells: readonly CellSpec[];
  readonly tools: readonly ToolSpec[];
  /** 装飾。M4 で使用 */
  readonly props?: readonly { readonly kind: string; readonly x: number; readonly y: number }[];
}

const EMPTY_TILE: Tile = { kind: 'empty', rot: 0, height: 0, layer: 'road' };

/** レベル定義から初期盤面を組み立てる(純関数) */
export function buildBoard(level: Level): Board {
  const { w, h } = level.size;
  const tiles: Tile[] = new Array<Tile>(w * h).fill(EMPTY_TILE);
  const defaultLayer: Layer = level.vehicle === 'train' ? 'rail' : 'road';
  for (let i = 0; i < tiles.length; i++) tiles[i] = { ...EMPTY_TILE, layer: defaultLayer };
  for (const c of level.cells) {
    if (c.x < 0 || c.y < 0 || c.x >= w || c.y >= h) continue;
    tiles[c.y * w + c.x] = {
      kind: c.kind,
      rot: c.rot ?? 0,
      height: c.height ?? 0,
      layer: c.layer ?? defaultLayer,
    };
  }
  return { w, h, tiles };
}

/** レベル定義から初期ツール一覧を組み立てる */
export function buildTools(level: Level): Tool[] {
  return level.tools.map((t) => ({ kind: t.kind, cells: t.cells, used: false, touched: false }));
}
