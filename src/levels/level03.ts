import type { Level } from './schema';

/**
 * レベル 3(6.2)。草原。回転 ×2。カーブと T 字の向きを見比べる。
 */
export const level03: Level = {
  id: 'level03',
  theme: 'meadow',
  size: { w: 5, h: 5 },
  vehicle: 'car',
  cells: [
    { x: 0, y: 0, kind: 'start', rot: 2 },
    { x: 0, y: 1, kind: 'straight', rot: 0 },
    { x: 0, y: 2, kind: 'curve', rot: 0 }, // 北-東
    { x: 1, y: 2, kind: 'tee', rot: 0 }, // 正解は rot=1(東-南-西)
    { x: 2, y: 2, kind: 'curve', rot: 0 }, // 正解は rot=2(南-西)
    { x: 2, y: 3, kind: 'straight', rot: 0 },
    { x: 2, y: 4, kind: 'curve', rot: 0 }, // 北-東
    { x: 3, y: 4, kind: 'straight', rot: 1 },
    { x: 4, y: 4, kind: 'goal', rot: 3 },
  ],
  tools: [
    { kind: 'rotate', cells: [{ x: 1, y: 2 }] },
    { kind: 'rotate', cells: [{ x: 2, y: 2 }] },
  ],
  props: [],
};
