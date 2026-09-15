import type { Level } from './schema';

/**
 * レベル 7(6.2)。緑の都市(夜)。列車。回転 ×2 + 上げ下げ ×1。
 * 乗り物が列車に変わり、タイルの見た目も線路(枕木 + レール)になる。
 */
export const level07: Level = {
  id: 'level07',
  theme: 'green-city-night',
  size: { w: 6, h: 6 },
  vehicle: 'train',
  cells: [
    { x: 0, y: 0, kind: 'start', rot: 2 },
    { x: 0, y: 1, kind: 'straight', rot: 0 },
    { x: 0, y: 2, kind: 'curve', rot: 0 }, // 北-東
    { x: 1, y: 2, kind: 'straight', rot: 1 },
    { x: 2, y: 2, kind: 'curve', rot: 0 }, // 正解は rot=2(南-西)
    { x: 2, y: 3, kind: 'straight', rot: 0, height: 1 }, // 段差
    { x: 2, y: 4, kind: 'curve', rot: 3 }, // 正解は rot=0(北-東)
    { x: 3, y: 4, kind: 'straight', rot: 1 },
    { x: 4, y: 4, kind: 'straight', rot: 1 },
    { x: 5, y: 4, kind: 'goal', rot: 3 },
  ],
  tools: [
    { kind: 'rotate', cells: [{ x: 2, y: 2 }] },
    { kind: 'raise', cells: [{ x: 2, y: 3 }] },
    { kind: 'rotate', cells: [{ x: 2, y: 4 }] },
  ],
  props: [],
};
