// ステージ定義。すべてグリッド座標 (x, z)。y は高さ。
export const H = 3; // 足場の高さ

// 回転塔の中心と、回転 0 のときの L 字の道(相対座標)
export const TOWER_CENTER = { x: 4, z: 2 };
export const TOWER_ARMS = [
  { x: 0, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
];

// 初期回転(90度単位)。2 のとき腕は (1,0),(0,-1): ゴール側だけ繋がって見える。
export const INITIAL_ROT = 2;

// 固定の足場
export const PLATFORM_CELLS = [
  { x: 0, z: 2 },
  { x: 1, z: 2 },
  { x: 2, z: 2 },
  { x: 4, z: 0 },
  { x: 4, z: -1 },
  { x: 4, z: -2 },
];

export const START = { x: 0, z: 2 };
export const GOAL = { x: 4, z: -2 };
// ゴールの扉は GOAL セルの -z 側の縁にある
export const DOOR_DIR = { x: 0, z: -1 };

// y 軸まわりに k*90 度回転: (x, z) -> (z, -x) を k 回
export function rotateRel(rel, k) {
  let { x, z } = rel;
  const n = ((k % 4) + 4) % 4;
  for (let i = 0; i < n; i++) {
    const nx = z;
    const nz = -x;
    x = nx;
    z = nz;
  }
  return { x, z };
}

export function key(x, z) {
  return `${x},${z}`;
}

// 現在の回転 k における、歩ける全セルの集合を返す。
// 値は { x, z, tower: bool, rel?: {x,z} }
export function walkableCells(k) {
  const cells = new Map();
  for (const c of PLATFORM_CELLS) {
    cells.set(key(c.x, c.z), { x: c.x, z: c.z, tower: false });
  }
  for (const arm of TOWER_ARMS) {
    const r = rotateRel(arm, k);
    const x = TOWER_CENTER.x + r.x;
    const z = TOWER_CENTER.z + r.z;
    cells.set(key(x, z), { x, z, tower: true, rel: arm });
  }
  return cells;
}

// 論理位置(足場 or 塔上の相対座標)を回転 k における絶対グリッド座標へ
export function logicalToGrid(pos, k) {
  if (pos.tower) {
    const r = rotateRel(pos.rel, k);
    return { x: TOWER_CENTER.x + r.x, z: TOWER_CENTER.z + r.z };
  }
  return { x: pos.x, z: pos.z };
}

export function gridToLogical(cell) {
  if (cell.tower) return { tower: true, rel: { ...cell.rel } };
  return { tower: false, x: cell.x, z: cell.z };
}
