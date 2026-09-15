import { connectsTo, findTile, isPassable, tileAt } from './board';
import { DIR_DELTA, DIRECTIONS, opposite, type Board, type Vec2 } from './types';

export interface SolveResult {
  /** start から goal まで繋がっているか */
  readonly connected: boolean;
  /**
   * 繋がっていれば start → goal の経路。
   * 繋がっていなければ start から進める最遠点までの経路(4.3-5)。
   */
  readonly path: readonly Vec2[];
}

/**
 * 経路判定(4.3)。純関数。
 *
 * タイル A から隣接タイル B へ進めるのは次を全て満たすとき:
 *   a. A の接続方向集合に「B の向き」が含まれる
 *   b. B の接続方向集合に「A の向き」が含まれる (双方向の握手)
 *   c. A.height === B.height                    (段差なし)
 *   d. A.layer === B.layer                      (道路同士 / 線路同士)
 */
export function solve(board: Board): SolveResult {
  const start = findTile(board, 'start');
  const goal = findTile(board, 'goal');
  if (!start || !goal) return { connected: false, path: [] };

  const startTile = tileAt(board, start);
  if (!startTile) return { connected: false, path: [] };

  const key = (p: Vec2): number => p.y * board.w + p.x;

  const prev = new Map<number, number>();
  const visited = new Set<number>([key(start)]);
  const queue: Vec2[] = [start];
  /** BFS の到達順。最遠点の決定に使う */
  const order: Vec2[] = [start];

  let reachedGoal = false;

  while (queue.length > 0) {
    const cur = queue.shift() as Vec2;
    if (cur.x === goal.x && cur.y === goal.y) {
      reachedGoal = true;
      break;
    }
    const curTile = tileAt(board, cur);
    if (!curTile) continue;

    for (const dir of DIRECTIONS) {
      const delta = DIR_DELTA[dir];
      const next: Vec2 = { x: cur.x + delta.dx, y: cur.y + delta.dy };
      const k = key(next);
      if (visited.has(k)) continue;

      const nextTile = tileAt(board, next);
      if (!nextTile) continue;
      if (!isPassable(nextTile.kind)) continue;

      // a. A → B 方向の接続
      if (!connectsTo(curTile, dir)) continue;
      // b. B → A 方向の接続(双方向の握手)
      if (!connectsTo(nextTile, opposite(dir))) continue;
      // c. 段差なし
      if (curTile.height !== nextTile.height) continue;
      // d. レイヤー一致
      if (curTile.layer !== nextTile.layer) continue;

      visited.add(k);
      prev.set(k, key(cur));
      queue.push(next);
      order.push(next);
    }
  }

  const toVec = (k: number): Vec2 => ({ x: k % board.w, y: Math.floor(k / board.w) });

  const rebuild = (target: Vec2): Vec2[] => {
    const out: Vec2[] = [];
    let k: number | undefined = key(target);
    while (k !== undefined) {
      out.push(toVec(k));
      k = prev.get(k);
    }
    return out.reverse();
  };

  if (reachedGoal) {
    return { connected: true, path: rebuild(goal) };
  }

  // 到達しなかった場合は、start から最も遠くまで進める経路を返す。
  let best: Vec2 = start;
  let bestLen = 1;
  for (const p of order) {
    const len = rebuild(p).length;
    if (len > bestLen) {
      bestLen = len;
      best = p;
    }
  }
  return { connected: false, path: rebuild(best) };
}
