import type { Level } from './schema';

/**
 * レベル 5(6.2)。水辺(夕)。上げ下げ ×2(1 つは 1×2 の範囲)。
 * 範囲ツールでは 2 枚が同時に動くことを教える(4.2 T2)。
 */
export const level05: Level = {
  id: 'level05',
  theme: 'water-dusk',
  size: { w: 5, h: 5 },
  vehicle: 'car',
  cells: [
    { x: 0, y: 0, kind: 'start', rot: 2 },
    { x: 0, y: 1, kind: 'straight', rot: 0 },
    { x: 0, y: 2, kind: 'curve', rot: 0 }, // 北-東
    { x: 1, y: 2, kind: 'straight', rot: 1, height: 1 }, // 範囲(1×2)
    { x: 2, y: 2, kind: 'straight', rot: 1, height: 1 }, // 範囲(1×2)
    { x: 3, y: 2, kind: 'curve', rot: 2 }, // 南-西
    { x: 3, y: 3, kind: 'straight', rot: 0, height: 1 }, // 単独
    { x: 3, y: 4, kind: 'curve', rot: 0 }, // 北-東
    { x: 4, y: 4, kind: 'goal', rot: 3 },
  ],
  tools: [
    {
      kind: 'raise',
      cells: [
        { x: 1, y: 2 },
        { x: 2, y: 2 },
      ],
    },
    { kind: 'raise', cells: [{ x: 3, y: 3 }] },
  ],
  props: [],
};
