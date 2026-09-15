/**
 * Seeded pseudo random numbers.
 *
 * Every gameplay and world-building random draw goes through `rand()` so a
 * given `?seed=` always produces the same street, the same decoration layout
 * and the same particle motion. Audio keeps using Math.random on purpose: it
 * never feeds back into game state.
 */
let seed0 = 1;
let s = 1;

export function setSeed(n) {
  seed0 = (n >>> 0) || 1;
  s = seed0;
}

export function getSeed() { return seed0; }

export function rand() {
  s = (s + 0x6D2B79F5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** float in [a, b) */
export function randRange(a, b) { return a + rand() * (b - a); }
/** integer in [0, n) */
export function randInt(n) { return (rand() * n) | 0; }
