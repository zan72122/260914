import type { Level } from './schema';

/**
 * レベル 8(6.2)。夜の線路。列車。上げ下げ ×2(いずれも 2 タイル範囲)+ 回転 ×1。
 * 本家 2.2 の「2 タイル同時の持ち上げ」の再現。
 */
export const level08: Level = {
  id: 'level08',
  theme: 'night-rail',
  size: { w: 6, h: 6 },
  vehicle: 'train',
  cells: [
    { x: 0, y: 0, kind: 'start', rot: 2 },
    { x: 0, y: 1, kind: 'straight', rot: 0 },
    { x: 0, y: 2, kind: 'curve', rot: 0 }, // 北-東
    { x: 1, y: 2, kind: 'straight', rot: 1, height: 1 }, // 範囲 A
    { x: 2, y: 2, kind: 'straight', rot: 1, height: 1 }, // 範囲 A
    { x: 3, y: 2, kind: 'curve', rot: 0 }, // 正解は rot=2(南-西)
    { x: 3, y: 3, kind: 'straight', rot: 0, height: 1 }, // 範囲 B
    { x: 3, y: 4, kind: 'curve', rot: 0, height: 1 }, // 範囲 B(北-東)
    { x: 4, y: 4, kind: 'straight', rot: 1 },
    { x: 5, y: 4, kind: 'goal', rot: 3 },
  ],
  tools: [
    {
      kind: 'raise',
      cells: [
        { x: 1, y: 2 },
        { x: 2, y: 2 },
      ],
    },
    { kind: 'rotate', cells: [{ x: 3, y: 2 }] },
    {
      kind: 'raise',
      cells: [
        { x: 3, y: 3 },
        { x: 3, y: 4 },
      ],
    },
  ],
  props: [],
};
