/** Seeded RNG. mulberry32 — tiny, fast, good enough for looks. */
export class Rng {
  private s: number;
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.s = this.seed || 1;
  }

  /** [0,1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }

  reset(): void {
    this.s = this.seed || 1;
  }
}

export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Cheap smooth 1-D value noise, used for wind/sway. Deterministic per seed. */
export function makeNoise1d(seed: number): (x: number) => number {
  const r = new Rng(seed);
  const n = 64;
  const table = new Float32Array(n);
  for (let i = 0; i < n; i++) table[i] = r.range(-1, 1);
  return (x: number) => {
    const xi = Math.floor(x);
    const f = x - xi;
    const a = table[((xi % n) + n) % n];
    const b = table[(((xi + 1) % n) + n) % n];
    const t = f * f * (3 - 2 * f);
    return a + (b - a) * t;
  };
}
