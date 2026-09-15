import type { Level } from './schema';

/**
 * レベル 9(6.2)。都市 + 水辺(橋)。車。3 種すべて。
 *
 * 瓦礫を壊すと下からカーブが出てくるが、その向きが違うので回す。
 * 「壊す → 回す」の順でしか通らない(壊す前は回してもぷにっと沈むだけ)。
 */
export const level09: Level = {
  id: 'level09',
  theme: 'bridge-city',
  size: { w: 7, h: 7 },
  vehicle: 'car',
  cells: [
    { x: 0, y: 0, kind: 'start', rot: 2 },
    { x: 0, y: 1, kind: 'straight', rot: 0 },
    { x: 0, y: 2, kind: 'curve', rot: 0 }, // 北-東
    { x: 1, y: 2, kind: 'straight', rot: 1 },
    { x: 2, y: 2, kind: 'block', reveal: { kind: 'curve', rot: 0 } }, // 正解は rot=2
    { x: 2, y: 3, kind: 'straight', rot: 0, height: 1 }, // 段差
    { x: 2, y: 4, kind: 'curve', rot: 0 }, // 北-東
    { x: 3, y: 4, kind: 'straight', rot: 1 },
    { x: 4, y: 4, kind: 'curve', rot: 1 }, // 正解は rot=2(南-西)
    { x: 4, y: 5, kind: 'straight', rot: 0 },
    { x: 4, y: 6, kind: 'curve', rot: 0 }, // 北-東
    { x: 5, y: 6, kind: 'straight', rot: 1 },
    { x: 6, y: 6, kind: 'goal', rot: 3 },
  ],
  tools: [
    { kind: 'destroy', cells: [{ x: 2, y: 2 }] },
    { kind: 'rotate', cells: [{ x: 2, y: 2 }] },
    { kind: 'raise', cells: [{ x: 2, y: 3 }] },
    { kind: 'rotate', cells: [{ x: 4, y: 4 }] },
  ],
  props: [],
};
