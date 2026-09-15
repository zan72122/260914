/** Seedable RNG (mulberry32). Deterministic across runs for a given seed. */
export class RNG {
  constructor(seed = 1) { this.seed = seed >>> 0; this.s = this.seed || 1; }
  reset(seed) { this.seed = (seed >>> 0) || this.seed; this.s = this.seed || 1; }
  next() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
}
