import { key } from './level.js';

const DIRS = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
];

// cells: Map(key -> cell)。from/to はグリッド座標。
// 戻り値: from を除いた cell の配列。到達不能なら null。
export function findPath(cells, from, to) {
  const startKey = key(from.x, from.z);
  const goalKey = key(to.x, to.z);
  if (!cells.has(startKey) || !cells.has(goalKey)) return null;
  if (startKey === goalKey) return [];

  const prev = new Map([[startKey, null]]);
  const queue = [startKey];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === goalKey) break;
    const c = cells.get(cur);
    for (const d of DIRS) {
      const nk = key(c.x + d.x, c.z + d.z);
      if (cells.has(nk) && !prev.has(nk)) {
        prev.set(nk, cur);
        queue.push(nk);
      }
    }
  }
  if (!prev.has(goalKey)) return null;
  const path = [];
  let k = goalKey;
  while (k !== startKey) {
    path.push(cells.get(k));
    k = prev.get(k);
  }
  return path.reverse();
}
