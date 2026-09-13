import * as THREE from 'three';

export const DIRS = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
];

export const key = (x, z) => `${x},${z}`;

// セルの足元の世界座標。階段セルは中央高さ(h - 0.5)。
export function worldOfCell(cell, gadgets) {
  if (cell.gadget && gadgets) {
    const g = gadgets.get(cell.gadget);
    if (g && g.worldOf) return g.worldOf(cell);
  }
  return new THREE.Vector3(cell.x, cell.stair ? cell.h - 0.5 : cell.h, cell.z);
}

function sameStep(a, b) {
  // 階段を考慮した「隣り合うセルが歩けるか」
  if (a.stair) {
    const d = { x: b.x - a.x, z: b.z - a.z };
    const sameDir = b.stair && b.stair.x === a.stair.x && b.stair.z === a.stair.z;
    if (d.x === a.stair.x && d.z === a.stair.z) {
      // 低い側
      return b.stair ? sameDir && b.h === a.h - 1 : b.h === a.h - 1;
    }
    if (d.x === -a.stair.x && d.z === -a.stair.z) {
      // 高い側
      return b.stair ? sameDir && b.h === a.h + 1 : b.h === a.h;
    }
    return false;
  }
  if (b.stair) return sameStep(b, a);
  return a.h === b.h;
}

// cells: Map(key -> cell)。錯視(画面上で隣り合って見えるセル)を含む隣接リストを作る。
// 正投影の視線方向は (1,1,1) なので、A から d 方向に一歩の位置を t(1,1,1) だけずらした
// セル(高さ h+t)は画面上ではちょうど隣に見える。
export function buildGraph(cells, { illusion = false } = {}) {
  const graph = new Map();
  for (const [k, c] of cells) graph.set(k, { cell: c, next: [] });
  for (const [k, node] of graph) {
    const a = node.cell;
    for (const d of DIRS) {
      const b = cells.get(key(a.x + d.x, a.z + d.z));
      if (b && sameStep(a, b)) node.next.push(b);
      if (illusion && !a.stair) {
        for (const t of [1, -1]) {
          const c = cells.get(key(a.x + d.x + t, a.z + d.z + t));
          if (c && !c.stair && c.h === a.h + t && !node.next.includes(c)) {
            node.next.push(c);
            c.illusionLinked = true;
          }
        }
      }
    }
  }
  return graph;
}

// BFS。from/to は key。戻り値は from を除いたセル配列。到達不能なら null。
export function findPath(graph, from, to) {
  if (!graph.has(from) || !graph.has(to)) return null;
  if (from === to) return [];
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === to) break;
    for (const n of graph.get(cur).next) {
      const nk = key(n.x, n.z);
      if (!prev.has(nk)) {
        prev.set(nk, cur);
        queue.push(nk);
      }
    }
  }
  if (!prev.has(to)) return null;
  const path = [];
  let k = to;
  while (k !== from) {
    path.push(graph.get(k).cell);
    k = prev.get(k);
  }
  return path.reverse();
}
