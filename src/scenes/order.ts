/**
 * The running order of the whole game, §4 of the plan: 1 -> 2 -> ... -> 10 and
 * then straight back round to 1.
 *
 * It is only the names, and it imports nothing, so the unit tests can check the
 * order without a browser. `main.ts` looks its scene factories up in this list,
 * so the order here IS the order of the game — the two cannot drift apart.
 */
export const SCENE_ORDER = [
  'gather', // 1  あつまれ
  'march', // 2  ぞろぞろ
  'tickle', // 3  くすぐり
  'ballpit', // 4  ボールプール
  'butterfly', // 5  ちょうちょ
  'slide', // 6  すべり台
  'hide', // 7  かくれんぼ
  'balloon', // 8  ふうせん
  'tower', // 9  ぐらぐらタワー
  'sleep', // 10 おやすみ
] as const;

export type SceneName = (typeof SCENE_ORDER)[number];
