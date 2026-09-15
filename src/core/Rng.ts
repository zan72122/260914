/** 種を固定できる擬似乱数（mulberry32）。困りの発生順・火花の散り方に使う。 */
export class Rng {
  private s: number;
  private readonly initial: number;

  constructor(seed: number) {
    this.initial = seed >>> 0;
    this.s = this.initial;
  }

  get seed(): number {
    return this.initial;
  }

  reset(): void {
    this.s = this.initial;
  }

  /** [0,1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}
