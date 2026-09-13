const KEY = 'monument-garden.stage';

export function loadStage(max) {
  try {
    const v = parseInt(localStorage.getItem(KEY) ?? '0', 10);
    if (Number.isFinite(v) && v >= 0 && v < max) return v;
  } catch (e) {
    /* localStorage が使えない環境 */
  }
  return 0;
}

export function saveStage(i) {
  try {
    localStorage.setItem(KEY, String(i));
  } catch (e) {
    /* ignore */
  }
}
