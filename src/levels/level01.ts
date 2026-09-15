import type { Level } from './schema';

/**
 * レベル 1(6.4)。チュートリアル代わり。
 *
 * 4x4。左上 (0,0) に start(車)、右下 (3,3) に goal(旗)。
 * 道は (2,2) のカーブ 1 枚だけが間違った向き(rot=1)で置かれ、
 * そこにだけ回転ツールが乗っている。1 タップで rot=2 になり道が繋がる。
 *
 * 盤面(・は空地):
 *   S . . .
 *   | . . .
 *   L-+ ? .      ? = 向きが違うカーブ(回転ツール)
 *   . . L-G
 */
export const level01: Level = {
  id: 'level01',
  theme: 'desert-day',
  size: { w: 4, h: 4 },
  vehicle: 'car',
  cells: [
    { x: 0, y: 0, kind: 'start', rot: 2 }, // 南へ出る
    { x: 0, y: 1, kind: 'straight', rot: 0 }, // 北-南
    { x: 0, y: 2, kind: 'curve', rot: 0 }, // 北-東
    { x: 1, y: 2, kind: 'straight', rot: 1 }, // 東-西
    { x: 2, y: 2, kind: 'curve', rot: 1 }, // 東-南(正しくは rot=2 の 西-南)
    { x: 2, y: 3, kind: 'curve', rot: 0 }, // 北-東
    { x: 3, y: 3, kind: 'goal', rot: 3 }, // 西から入る
  ],
  tools: [{ kind: 'rotate', cells: [{ x: 2, y: 2 }] }],
  props: [],
};
