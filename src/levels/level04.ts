import type { Level } from './schema';

/**
 * レベル 4(6.2)。水辺(昼)。上げ下げ ×2。
 * 道の途中の 2 枚だけが 1 段高く、段差で繋がらない(4.2 T2)。
 * それぞれに上げ下げツールが乗っており、1 タップずつで揃う。
 */
export const level04: Level = {
  id: 'level04',
  theme: 'water-day',
  size: { w: 5, h: 5 },
  vehicle: 'car',
  cells: [
    { x: 1, y: 0, kind: 'start', rot: 2 },
    { x: 1, y: 1, kind: 'straight', rot: 0 },
    { x: 1, y: 2, kind: 'curve', rot: 0 }, // 北-東
    { x: 2, y: 2, kind: 'straight', rot: 1, height: 1 }, // 段差
    { x: 3, y: 2, kind: 'curve', rot: 2 }, // 南-西
    { x: 3, y: 3, kind: 'straight', rot: 0, height: 1 }, // 段差
    { x: 3, y: 4, kind: 'curve', rot: 0 }, // 北-東
    { x: 4, y: 4, kind: 'goal', rot: 3 },
  ],
  tools: [
    { kind: 'raise', cells: [{ x: 2, y: 2 }] },
    { kind: 'raise', cells: [{ x: 3, y: 3 }] },
  ],
  props: [],
};
