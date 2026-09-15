// 小さな数学ヘルパー群（依存ゼロ）
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mix = lerp;
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeOutBack = (t, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutElastic = (t) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c) + 1;
};
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const TAU = Math.PI * 2;

// 決定的な擬似乱数（バージョン違いを再現可能にする）
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// なめらかな1次元ノイズ（木目などに使う）
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => {
    let v = Math.sin((n * 127.1 + seed * 311.7)) * 43758.5453;
    return v - Math.floor(v);
  };
  const a = h(i), b = h(i + 1);
  return lerp(a, b, smooth(f));
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// 減衰する揺れ（ぷるん）
export function springWobble(t, freq = 10, damp = 3.4) {
  return Math.exp(-damp * t) * Math.sin(t * freq);
}
