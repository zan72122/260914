import type { Level } from './schema';

/**
 * レベル 2(6.2)。砂漠(夕)。回転 ×2。
 * 回転は何度でもできる = 1 つは 2 回まわす必要がある。
 *
 *   S . . .
 *   | . ? G      ? = 向き違いのカーブ(回転ツール、1 タップ)
 *   L-- ? .      ? = 向き違いのカーブ(回転ツール、2 タップ)
 *   . . . .
 */
export const level02: Level = {
  id: 'level02',
  theme: 'desert-dusk',
  size: { w: 4, h: 4 },
  vehicle: 'car',
  cells: [
    { x: 0, y: 0, kind: 'start', rot: 2 },
    { x: 0, y: 1, kind: 'straight', rot: 0 },
    { x: 0, y: 2, kind: 'curve', rot: 0 }, // 北-東
    { x: 1, y: 2, kind: 'straight', rot: 1 }, // 東-西
    { x: 2, y: 2, kind: 'curve', rot: 1 }, // 正解は rot=3(西-北)
    { x: 2, y: 1, kind: 'curve', rot: 0 }, // 正解は rot=1(東-南)
    { x: 3, y: 1, kind: 'goal', rot: 3 },
  ],
  tools: [
    { kind: 'rotate', cells: [{ x: 2, y: 2 }] },
    { kind: 'rotate', cells: [{ x: 2, y: 1 }] },
  ],
  props: [],
};
