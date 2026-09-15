import type { Level } from './schema';

/**
 * レベル 6(6.2)。灰色の都市。破壊 ×1 + 回転 ×2。
 *
 * 道の途中に瓦礫(`block`)が居座っている。壊すと下から道が出てくる(4.2 T3)。
 * 破壊は使い切りだが、壊せるのは瓦礫だけなので詰まない(R9)。
 */
export const level06: Level = {
  id: 'level06',
  theme: 'gray-city',
  size: { w: 6, h: 6 },
  vehicle: 'car',
  cells: [
    { x: 0, y: 0, kind: 'start', rot: 2 },
    { x: 0, y: 1, kind: 'straight', rot: 0 },
    { x: 0, y: 2, kind: 'curve', rot: 3 }, // 正解は rot=0(北-東)
    { x: 1, y: 2, kind: 'straight', rot: 1 },
    { x: 2, y: 2, kind: 'block', reveal: { kind: 'curve', rot: 2 } }, // 壊すと 南-西 のカーブ
    { x: 2, y: 3, kind: 'straight', rot: 0 },
    { x: 2, y: 4, kind: 'curve', rot: 2 }, // 正解は rot=0(北-東)
    { x: 3, y: 4, kind: 'straight', rot: 1 },
    { x: 4, y: 4, kind: 'straight', rot: 1 },
    { x: 5, y: 4, kind: 'goal', rot: 3 },
  ],
  tools: [
    { kind: 'destroy', cells: [{ x: 2, y: 2 }] },
    { kind: 'rotate', cells: [{ x: 0, y: 2 }] },
    { kind: 'rotate', cells: [{ x: 2, y: 4 }] },
  ],
  props: [],
};
