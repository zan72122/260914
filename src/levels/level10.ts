import type { Level } from './schema';

/**
 * レベル 10(6.2)。夜の大きな街(お祝い)。列車。3 種すべて + 2×2 範囲。総まとめ。
 *
 * 2×2 の範囲は 4 枚とも同じ高さにしてあるので、1 タップで丸ごと下りる(4.2 T2)。
 */
export const level10: Level = {
  id: 'level10',
  theme: 'night-festival',
  size: { w: 7, h: 7 },
  vehicle: 'train',
  cells: [
    { x: 0, y: 0, kind: 'start', rot: 2 },
    { x: 0, y: 1, kind: 'straight', rot: 0 },
    { x: 0, y: 2, kind: 'curve', rot: 0 }, // 北-東
    { x: 1, y: 2, kind: 'straight', rot: 1 },
    { x: 2, y: 2, kind: 'straight', rot: 1 },
    { x: 3, y: 2, kind: 'curve', rot: 0 }, // 正解は rot=2(南-西)
    // 2×2 の高台。4 枚とも高さ 1
    { x: 2, y: 3, kind: 'empty', height: 1 },
    { x: 2, y: 4, kind: 'empty', height: 1 },
    { x: 3, y: 3, kind: 'straight', rot: 0, height: 1 },
    { x: 3, y: 4, kind: 'curve', rot: 0, height: 1 }, // 北-東
    { x: 4, y: 4, kind: 'block', reveal: { kind: 'straight', rot: 1 } },
    { x: 5, y: 4, kind: 'curve', rot: 1 }, // 正解は rot=2(南-西)
    { x: 5, y: 5, kind: 'straight', rot: 0 },
    { x: 5, y: 6, kind: 'curve', rot: 0 }, // 北-東
    { x: 6, y: 6, kind: 'goal', rot: 3 },
  ],
  tools: [
    { kind: 'rotate', cells: [{ x: 3, y: 2 }] },
    {
      kind: 'raise',
      cells: [
        { x: 2, y: 3 },
        { x: 3, y: 3 },
        { x: 2, y: 4 },
        { x: 3, y: 4 },
      ],
    },
    { kind: 'destroy', cells: [{ x: 4, y: 4 }] },
    { kind: 'rotate', cells: [{ x: 5, y: 4 }] },
  ],
  props: [],
};
