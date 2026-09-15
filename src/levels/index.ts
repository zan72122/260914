import type { Level } from './schema';
import { level01 } from './level01';

/** レベル一覧。M3 で level02〜level10 を追加する */
export const levels: readonly Level[] = [level01];

export function levelById(id: string): Level | undefined {
  return levels.find((l) => l.id === id);
}

export { level01 };
export type { Level };
