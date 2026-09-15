/** 進行状況の保存(4.5)。localStorage のキーは 1 つだけ。失敗しても遊べる。 */

const KEY = 'pftr.progress.v1';

export interface Progress {
  /** クリア済みレベル ID の一覧 */
  readonly cleared: readonly string[];
}

const EMPTY: Progress = { cleared: [] };

function storage(): Storage | undefined {
  try {
    if (typeof localStorage === 'undefined') return undefined;
    return localStorage;
  } catch {
    return undefined;
  }
}

export function loadProgress(): Progress {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY;
    const cleared = (parsed as { cleared?: unknown }).cleared;
    if (!Array.isArray(cleared)) return EMPTY;
    return { cleared: cleared.filter((v): v is string => typeof v === 'string') };
  } catch {
    return EMPTY;
  }
}

export function saveProgress(p: Progress): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({ cleared: p.cleared }));
  } catch {
    // 保存に失敗しても遊べる(4.5)
  }
}

export function markCleared(levelId: string): Progress {
  const cur = loadProgress();
  if (cur.cleared.includes(levelId)) return cur;
  const next: Progress = { cleared: [...cur.cleared, levelId] };
  saveProgress(next);
  return next;
}

export function isCleared(levelId: string): boolean {
  return loadProgress().cleared.includes(levelId);
}
