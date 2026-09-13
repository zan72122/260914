const KEY = 'poppo.v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
}
function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
}

export const storage = {
  isCleared(id) { return !!(load().cleared || {})[id]; },
  setCleared(id) { const d = load(); d.cleared = d.cleared || {}; d.cleared[id] = true; save(d); },
  clearedCount() { return Object.keys(load().cleared || {}).length; },
  loadLayout(id) {
    const m = new Map();
    const lay = (load().layouts || {})[id];
    if (lay) for (const [k, v] of Object.entries(lay)) m.set(k, v);
    return m;
  },
  saveLayout(id, placed) {
    const d = load(); d.layouts = d.layouts || {};
    const o = {}; for (const [k, v] of placed) o[k] = v;
    d.layouts[id] = o; save(d);
  },
  lastLevel() { return load().last || null; },
  setLastLevel(id) { const d = load(); d.last = id; save(d); },
};
