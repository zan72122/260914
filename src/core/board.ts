import {
  type Board,
  type Direction,
  type Tile,
  type TileKind,
  type Vec2,
  DIRECTIONS,
  rotateDir,
} from './types';

/** 各種別の「回転 0」における接続方向(基準形) */
const BASE_CONNECTIONS: Readonly<Record<TileKind, readonly Direction[]>> = {
  straight: [0, 2],
  curve: [0, 1],
  tee: [0, 1, 2],
  cross: [0, 1, 2, 3],
  start: [0],
  goal: [0],
  empty: [],
  block: [],
};

/** 回転しても見た目・接続が変わらない種別(回転対象外) */
export function isRotatable(kind: TileKind): boolean {
  return kind === 'straight' || kind === 'curve' || kind === 'tee' || kind === 'start' || kind === 'goal';
}

/** 通行可能(経路になりうる)種別か */
export function isPassable(kind: TileKind): boolean {
  return BASE_CONNECTIONS[kind].length > 0;
}

/** タイルの実際の接続方向集合 */
export function connectionsOf(tile: Tile): readonly Direction[] {
  return BASE_CONNECTIONS[tile.kind].map((d) => rotateDir(d, tile.rot));
}

/** タイルが指定方向へ接続しているか */
export function connectsTo(tile: Tile, dir: Direction): boolean {
  return connectionsOf(tile).includes(dir);
}

export function inBounds(board: Board, p: Vec2): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < board.w && p.y < board.h;
}

export function indexOf(board: Board, p: Vec2): number {
  return p.y * board.w + p.x;
}

/** 範囲外なら undefined */
export function tileAt(board: Board, p: Vec2): Tile | undefined {
  if (!inBounds(board, p)) return undefined;
  return board.tiles[indexOf(board, p)];
}

/** 1 タイルだけ差し替えた新しい盤面を返す(元の盤面は変更しない) */
export function withTile(board: Board, p: Vec2, tile: Tile): Board {
  if (!inBounds(board, p)) return board;
  const tiles = board.tiles.slice();
  tiles[indexOf(board, p)] = tile;
  return { w: board.w, h: board.h, tiles };
}

/** 複数タイルをまとめて差し替える */
export function withTiles(board: Board, updates: readonly { at: Vec2; tile: Tile }[]): Board {
  const tiles = board.tiles.slice();
  for (const u of updates) {
    if (!inBounds(board, u.at)) continue;
    tiles[indexOf(board, u.at)] = u.tile;
  }
  return { w: board.w, h: board.h, tiles };
}

/** 盤面の複製(タイルは不変オブジェクトなので浅いコピーで足りる) */
export function cloneBoard(board: Board): Board {
  return { w: board.w, h: board.h, tiles: board.tiles.slice() };
}

/** 指定種別のタイルの位置を全て返す */
export function findTiles(board: Board, kind: TileKind): Vec2[] {
  const found: Vec2[] = [];
  for (let y = 0; y < board.h; y++) {
    for (let x = 0; x < board.w; x++) {
      if (board.tiles[y * board.w + x]?.kind === kind) found.push({ x, y });
    }
  }
  return found;
}

/** 最初に見つかった指定種別のタイル位置 */
export function findTile(board: Board, kind: TileKind): Vec2 | undefined {
  return findTiles(board, kind)[0];
}

export function samePos(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}

/** 全方角の定数を再輸出(描画層で使う) */
export { DIRECTIONS };
