// save.js — progress in localStorage (docs/01.md 3.4, docs/03.md F5).
//
// Only one number is stored: how many puzzles have been solved (0..2). The
// ending clears it, so the next launch starts from the seed again. Storage can
// be unavailable (private mode, blocked site data); every access is guarded and
// simply falls back to "no progress".

const KEY = 'tane:p';
const MAX = 2;   // P3 is never stored: finishing the story wipes the save

function store() {
  try { return window.localStorage || null; } catch (_) { return null; }
}

export function loadProgress() {
  const s = store();
  if (!s) return 0;
  try {
    const n = parseInt(s.getItem(KEY), 10);
    return Number.isFinite(n) && n > 0 ? Math.min(MAX, n) : 0;
  } catch (_) { return 0; }
}

export function saveProgress(n) {
  const s = store();
  if (!s) return;
  try {
    if (!Number.isFinite(n) || n <= 0 || n > MAX) s.removeItem(KEY);
    else s.setItem(KEY, String(n));
  } catch (_) {}
}

export function clearProgress() {
  const s = store();
  if (!s) return;
  try { s.removeItem(KEY); } catch (_) {}
}
