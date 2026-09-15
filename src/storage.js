const KEY = 'hoshi-o-okosu-v1';

export function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 容量なし等は無視 */ }
}

export function load() {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    return JSON.parse(s);
  } catch (e) { return null; }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}
