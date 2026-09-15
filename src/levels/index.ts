import type { Level } from './schema';
import { level01 } from './level01';
import { level02 } from './level02';
import { level03 } from './level03';
import { level04 } from './level04';
import { level05 } from './level05';
import { level06 } from './level06';
import { level07 } from './level07';
import { level08 } from './level08';
import { level09 } from './level09';
import { level10 } from './level10';

/** レベル一覧(6.2 の 10 面) */
export const levels: readonly Level[] = [
  level01,
  level02,
  level03,
  level04,
  level05,
  level06,
  level07,
  level08,
  level09,
  level10,
];

export function levelById(id: string): Level | undefined {
  return levels.find((l) => l.id === id);
}

/** 1 始まりの番号でレベルを取り出す(デバッグ用の ?level=N など) */
export function levelByNumber(n: number): Level | undefined {
  return levels[n - 1];
}

export { level01, level02, level03, level04, level05, level06, level07, level08, level09, level10 };
export type { Level };
