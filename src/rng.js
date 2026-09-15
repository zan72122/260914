// 決定論的な乱数と 3D ノイズ。seed から石のすべての個性が決まる。

export function mulberry32(a) {
  let t = a >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
  }
  f(a = 0, b = 1) { return a + (b - a) * this.next(); }
  i(a, b) { return Math.floor(this.f(a, b + 1)); }
  pick(arr) { return arr[this.i(0, arr.length - 1)]; }
  unitVec() {
    const z = this.f(-1, 1);
    const t = this.f(0, Math.PI * 2);
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    return [r * Math.cos(t), r * Math.sin(t), z];
  }
}

// --- gradient noise (value-gradient hybrid, cheap & seedable) ---
const GRAD = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
];

export class Noise3 {
  constructor(seed) {
    const rnd = mulberry32(seed ^ 0x9e3779b9);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  _g(ix, iy, iz, dx, dy, dz) {
    const h = this.perm[(ix + this.perm[(iy + this.perm[iz & 255]) & 255]) & 255] % 12;
    const g = GRAD[h];
    return g[0] * dx + g[1] * dy + g[2] * dz;
  }
  noise(x, y, z) {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    const fx = x - X, fy = y - Y, fz = z - Z;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const w = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
    const lerp = (a, b, t) => a + (b - a) * t;
    const n000 = this._g(X, Y, Z, fx, fy, fz);
    const n100 = this._g(X + 1, Y, Z, fx - 1, fy, fz);
    const n010 = this._g(X, Y + 1, Z, fx, fy - 1, fz);
    const n110 = this._g(X + 1, Y + 1, Z, fx - 1, fy - 1, fz);
    const n001 = this._g(X, Y, Z + 1, fx, fy, fz - 1);
    const n101 = this._g(X + 1, Y, Z + 1, fx - 1, fy, fz - 1);
    const n011 = this._g(X, Y + 1, Z + 1, fx, fy - 1, fz - 1);
    const n111 = this._g(X + 1, Y + 1, Z + 1, fx - 1, fy - 1, fz - 1);
    return lerp(
      lerp(lerp(n000, n100, u), lerp(n010, n110, u), v),
      lerp(lerp(n001, n101, u), lerp(n011, n111, u), v),
      w
    );
  }
  fbm(x, y, z, octaves = 4, lac = 2.03, gain = 0.5) {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      s += a * this.noise(x * f, y * f, z * f);
      norm += a;
      a *= gain; f *= lac;
    }
    return s / norm;
  }
  ridged(x, y, z, octaves = 4) {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.noise(x * f, y * f, z * f)) * 2;
      s += a * n * n;
      norm += a;
      a *= 0.5; f *= 2.07;
    }
    return s / norm;
  }
}
