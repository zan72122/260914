// 汎用ユーティリティ（依存なし）

export const TAU = Math.PI * 2;

export function clamp(x, a, b) {
  return x < a ? a : (x > b ? b : x);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

/** 指数的な減衰でaをbに近づける（フレーム時間非依存） */
export function approach(a, b, rate, dt) {
  const k = 1 - Math.exp(-rate * dt);
  return a + (b - a) * k;
}

export function rand(a, b) {
  return a + Math.random() * (b - a);
}

/** 角度差を -PI..PI に畳む */
export function angleDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

/** 角丸矩形パス（roundRect 非対応環境でも動くよう自前実装） */
export function rrect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) * 0.5, Math.abs(h) * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

/** 正三角形パス（中心cx,cy、外接半径r、頂点は上向き） */
export function trianglePath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + i * (TAU / 3);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** 形状に合わせたパスを作る（板の描画・クリップ共通） */
export function platePath(ctx, kind, cx, cy, r) {
  if (kind === 'circle') {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.closePath();
  } else if (kind === 'triangle') {
    trianglePath(ctx, cx, cy, r);
  } else {
    rrect(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.05);
  }
}
