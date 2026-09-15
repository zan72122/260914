import { inBounds, isRotatable, tileAt, withTiles } from './board';
import {
  rotateDir,
  type Board,
  type GameState,
  type Height,
  type Tile,
  type Tool,
  type Vec2,
} from './types';

export interface ApplyResult {
  readonly state: GameState;
  /**
   * 盤面が実際に変化したか。
   * false のとき、描画層は「ぷにっと沈んで戻る」フィードバックだけを出す(4.2 T3)。
   */
  readonly changed: boolean;
}

/** T1 回転: 範囲内の回転可能タイルを時計回りに 90 度回す(4.2 T1) */
export function rotateTiles(board: Board, cells: readonly Vec2[]): Board {
  const updates: { at: Vec2; tile: Tile }[] = [];
  for (const c of cells) {
    const t = tileAt(board, c);
    if (!t) continue;
    if (!isRotatable(t.kind)) continue;
    updates.push({ at: c, tile: { ...t, rot: rotateDir(t.rot, 1) } });
  }
  return updates.length > 0 ? withTiles(board, updates) : board;
}

/**
 * T2 上げ下げ: 範囲内の高さを 0 ⇄ 1 でトグルする(4.2 T2、決定事項 Q5)。
 *
 * 範囲内は「同じ段数だけ一斉に動く」。段は 0/1 の 2 段しかないため、
 * 範囲内の最小の高さが 0 なら +1、そうでなければ -1 を全体に加え、0..1 に丸める。
 * 範囲内の高さが揃っていれば、これは単純なトグルと同じ結果になる。
 */
export function toggleHeight(board: Board, cells: readonly Vec2[]): Board {
  const present = cells.filter((c) => inBounds(board, c));
  if (present.length === 0) return board;

  let min: Height = 1;
  for (const c of present) {
    const t = tileAt(board, c);
    if (t && t.height < min) min = t.height;
  }
  const delta = min === 0 ? 1 : -1;

  const updates: { at: Vec2; tile: Tile }[] = [];
  for (const c of present) {
    const t = tileAt(board, c);
    if (!t) continue;
    const next = Math.min(1, Math.max(0, t.height + delta)) as Height;
    if (next === t.height) continue;
    updates.push({ at: c, tile: { ...t, height: next } });
  }
  return updates.length > 0 ? withTiles(board, updates) : board;
}

/**
 * T3 破壊: 範囲内の `block` だけを空地にする(4.2 T3、決定事項 Q1)。
 * 道路・線路・start・goal は壊せないので「壊して詰む」が原理的に起きない。
 */
export function destroyBlocks(board: Board, cells: readonly Vec2[]): Board {
  const updates: { at: Vec2; tile: Tile }[] = [];
  for (const c of cells) {
    const t = tileAt(board, c);
    if (!t) continue;
    if (t.kind !== 'block') continue;
    // 瓦礫の下に道が埋まっていればそれが現れる。無ければ跡は空地。
    const r = t.reveal;
    updates.push({
      at: c,
      tile: r
        ? { kind: r.kind, rot: r.rot, height: t.height, layer: t.layer }
        : { kind: 'empty', rot: 0, height: t.height, layer: t.layer },
    });
  }
  return updates.length > 0 ? withTiles(board, updates) : board;
}

/** ツール 1 つを適用した新しい状態を返す純関数(8.4) */
export function applyTool(state: GameState, toolIndex: number): ApplyResult {
  const tool = state.tools[toolIndex];
  if (!tool) return { state, changed: false };
  if (tool.used) return { state, changed: false };

  let board = state.board;
  switch (tool.kind) {
    case 'rotate':
      board = rotateTiles(board, tool.cells);
      break;
    case 'raise':
      board = toggleHeight(board, tool.cells);
      break;
    case 'destroy':
      board = destroyBlocks(board, tool.cells);
      break;
  }

  const changed = board !== state.board;

  // 破壊だけが使い切り。効果が無かったときは消費しない(空振りで詰まないように)。
  const nextTool: Tool = {
    ...tool,
    touched: true,
    used: tool.kind === 'destroy' ? changed : false,
  };
  const tools = state.tools.slice();
  tools[toolIndex] = nextTool;

  return { state: { board, tools }, changed };
}
