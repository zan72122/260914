import type { Board, Height, Layer, Reveal, Tile, TileKind, Tool, ToolKind, Vec2, Direction } from '../core/types';

/** テーマ ID(7.1 のパレット表に対応) */
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

/** プロシージャル装飾の種類(6.3 / 7.2)。同種は InstancedMesh でまとめる */
export type PropKind =
  | 'palm'
  | 'drygrass'
  | 'lighthouse'
  | 'rock'
  | 'tree'
  | 'reed'
  | 'flower'
  | 'duck'
  | 'wheat'
  | 'house'
  | 'building'
  | 'fence'
  | 'mushroom'
  | 'darktree'
  | 'firefly'
  | 'streetlamp'
  | 'bricktower';

export interface Palette {
  /** 地面(空地)上面 */
  readonly ground: string;
  /** 道路・線路の上面 */
  readonly road: string;
  /** アクセント(装飾など) */
  readonly accent: string;
  /** 背景(空) */
  readonly sky: string;
  /** 盤面の外に広がる水 / 砂の色 */
  readonly water: string;
  /** 発光色(窓の灯・蛍・街灯)。夜はこれで «夜» を演出する(7.3) */
  readonly glow: string;
  /** ゴールの旗の色。夜は明るい色にする(暗くて見えないと致命的) */
  readonly flag: string;
  /** 夜のテーマか。色相で夜を表し、明度は落としすぎない(7.1) */
  readonly night: boolean;
  /** 側面を上面より暗くする割合(G1) */
  readonly sideDarken: number;
  /** 半球光の強さ */
  readonly hemi: number;
  /** 平行光(1 灯・影)の強さ */
  readonly sun: number;
  /** 平行光の色 */
  readonly sunColor: string;
  /** 盤面外の水面にコースティクスを出すか(2.4) */
  readonly caustics: boolean;
  /** 直線タイルを橋(橋げた付き)として描くか(4.1) */
  readonly bridge: boolean;
  /** このテーマに置く装飾(6.3) */
  readonly props: readonly PropKind[];
}

/**
 * 7.1 のパレット表。
 *
 * 夜のテーマ(7・8・10)は «暗さ» ではなく «色相» で夜を表す。
 * 上面の明度は昼のテーマの 7 割以上を保ち、窓の灯・蛍・街灯の発光色で夜らしさを出す。
 * 4 歳児の視認性(7.1「明度差は大きめ」)を満たすための判断。
 */
export const PALETTES: Readonly<Record<ThemeId, Palette>> = {
  'desert-day': {
    ground: '#E8B454', road: '#8C8378', accent: '#F2E3B0', sky: '#F6D28A',
    water: '#F0C877', glow: '#FFF3C4', flag: '#2A2320', night: false,
    sideDarken: 0.24, hemi: 1.0, sun: 1.5, sunColor: '#FFF6E2',
    caustics: false, bridge: false,
    props: ['palm', 'drygrass', 'lighthouse', 'rock'],
  },
  'desert-dusk': {
    ground: '#D9884A', road: '#8C8378', accent: '#FFD9A0', sky: '#E87A55',
    water: '#D9764E', glow: '#FFE0AE', flag: '#2A2320', night: false,
    sideDarken: 0.26, hemi: 1.0, sun: 1.4, sunColor: '#FFE0B8',
    caustics: false, bridge: false,
    props: ['palm', 'drygrass', 'lighthouse', 'rock'],
  },
  meadow: {
    ground: '#7CBF5A', road: '#8C8378', accent: '#C8E89A', sky: '#9FD9F0',
    water: '#6FC6E0', glow: '#FFF6C8', flag: '#2A2320', night: false,
    sideDarken: 0.24, hemi: 1.0, sun: 1.45, sunColor: '#FFFDF0',
    caustics: false, bridge: false,
    props: ['tree', 'reed', 'flower', 'house'],
  },
  'water-day': {
    ground: '#78C86A', road: '#8C8378', accent: '#F2D857', sky: '#BEE8F2',
    water: '#5FC8D8', glow: '#FFF6C8', flag: '#2A2320', night: false,
    sideDarken: 0.24, hemi: 1.0, sun: 1.45, sunColor: '#FFFDF0',
    caustics: true, bridge: false,
    props: ['duck', 'rock', 'wheat', 'flower', 'reed'],
  },
  'water-dusk': {
    // 夕。地面は 7.1 の表どおり «水辺» のままだが、夕日の色を乗せて昼と見分ける
    ground: '#8FBE5E', road: '#8C8378', accent: '#F2D857', sky: '#E8A47A',
    water: '#4E84B8', glow: '#FFE7B0', flag: '#2A2320', night: false,
    sideDarken: 0.28, hemi: 0.95, sun: 1.5, sunColor: '#FFD2A0',
    caustics: true, bridge: false,
    props: ['duck', 'rock', 'wheat', 'flower', 'reed'],
  },
  'gray-city': {
    // 彩度を少し上げてくすみを取る(灰緑のまま、はっきり見えるように)
    ground: '#9EB489', road: '#6E6E6E', accent: '#D2DCC0', sky: '#B4C4A4',
    water: '#A8BA96', glow: '#FFF2C8', flag: '#2A2320', night: false,
    sideDarken: 0.24, hemi: 1.0, sun: 1.45, sunColor: '#FFFDF0',
    caustics: false, bridge: false,
    props: ['building', 'house', 'tree'],
  },
  'green-city-night': {
    ground: '#5F9A78', road: '#6E7A82', accent: '#F5D77A', sky: '#243C56',
    water: '#33566E', glow: '#FFE7A0', flag: '#FFFFFF', night: true,
    sideDarken: 0.28, hemi: 0.95, sun: 1.1, sunColor: '#CFE2FF',
    caustics: false, bridge: false,
    props: ['building', 'house', 'fence', 'darktree', 'streetlamp'],
  },
  'night-rail': {
    ground: '#5E97A8', road: '#7E6B58', accent: '#BFF7A8', sky: '#1F3450',
    water: '#2E4E68', glow: '#CFF7A8', flag: '#FFF2C0', night: true,
    sideDarken: 0.28, hemi: 0.95, sun: 1.1, sunColor: '#CFE2FF',
    caustics: false, bridge: false,
    props: ['bricktower', 'mushroom', 'darktree', 'firefly', 'rock'],
  },
  'bridge-city': {
    ground: '#9EB489', road: '#6E6E6E', accent: '#5FC8D8', sky: '#BEE8F2',
    water: '#4FBFD6', glow: '#FFF2C8', flag: '#2A2320', night: false,
    sideDarken: 0.24, hemi: 1.0, sun: 1.45, sunColor: '#FFFDF0',
    caustics: true, bridge: true,
    props: ['rock', 'reed', 'house', 'building', 'duck'],
  },
  'night-festival': {
    ground: '#68A48A', road: '#6E7A82', accent: '#F5D77A', sky: '#223A58',
    water: '#30546E', glow: '#FFDF8E', flag: '#FFFFFF', night: true,
    sideDarken: 0.28, hemi: 0.95, sun: 1.1, sunColor: '#CFE2FF',
    caustics: false, bridge: false,
    props: ['building', 'streetlamp', 'darktree', 'firefly', 'house'],
  },
};

/** 盤面の初期値からの差分としてセルを指定する */
export interface CellSpec {
  readonly x: number;
  readonly y: number;
  readonly kind: TileKind;
  readonly rot?: Direction;
  readonly height?: Height;
  readonly layer?: Layer;
  /** block のとき、壊すと現れるタイル(4.2 T3) */
  readonly reveal?: Reveal;
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
  /**
   * 装飾の追加指定(省略可)。指定しなければテーマごとの装飾が空地へ自動配置される。
   */
  readonly props?: readonly { readonly kind: PropKind; readonly x: number; readonly y: number }[];
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
    const base: Tile = {
      kind: c.kind,
      rot: c.rot ?? 0,
      height: c.height ?? 0,
      layer: c.layer ?? defaultLayer,
    };
    tiles[c.y * w + c.x] = c.reveal ? { ...base, reveal: c.reveal } : base;
  }
  return { w, h, tiles };
}

/** レベル定義から初期ツール一覧を組み立てる */
export function buildTools(level: Level): Tool[] {
  return level.tools.map((t) => ({ kind: t.kind, cells: t.cells, used: false, touched: false }));
}
