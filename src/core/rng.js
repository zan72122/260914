/**
 * rng.js — seeded, reproducible random numbers (QA determinism).
 * Usage: const rng = createRNG(12345); rng.next(); rng.range(2,5); rng.pick(arr);
 */

/** @param {number} [seed] */
export function createRNG(seed = 0x9e3779b9) {
  let s = seed >>> 0;
  const api = {
    /** re-seed in place (window.__game.seed(n) uses this) */
    seed(n) { s = (n >>> 0) || 1; return api; },
    /** float 0..1 */
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** float a..b */
    range(a, b) { return a + (b - a) * api.next(); },
    /** int a..b inclusive */
    int(a, b) { return Math.floor(api.range(a, b + 1)); },
    /** random element */
    pick(arr) { return arr[Math.min(arr.length - 1, Math.floor(api.next() * arr.length))]; },
    /** -x..x */
    sym(x) { return (api.next() * 2 - 1) * x; }
  };
  return api;
}
