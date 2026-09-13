const KEY = 'mokomoko.level';

export function loadLevel() {
  try {
    const v = parseInt(localStorage.getItem(KEY), 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  } catch (e) { return 0; }
}

export function saveLevel(i) {
  try { localStorage.setItem(KEY, String(i)); } catch (e) { /* ignore */ }
}
