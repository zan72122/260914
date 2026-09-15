// 皿・ライス・ケチャップ・混ぜ塗り
// 皿の中身はすべて「皿ローカル正規化座標」で保持 → 画面回転しても残る
import { TAU, clamp, makeRng, easeOutBack } from '../util.js';
import { toScreen } from '../layout.js';
import { glossyStroke } from './fx.js';

export const LAYER = 256; // 皿ローカルのオフスクリーン解像度

export function makeLayer() {
  const cv = document.createElement('canvas');
  cv.width = LAYER; cv.height = LAYER;
  return cv;
}
// 正規化(-1..1) → レイヤーpx
export const l2p = (u) => (u + 1) * 0.5 * LAYER;

// 白いご飯のテクスチャを焼く
export function bakeRice(variant) {
  const cv = makeLayer();
  const c = cv.getContext('2d');
  const R = LAYER * 0.5;
  const rng = makeRng(101 + variant.id * 17);
  const rx = R * 0.76, ry = R * 0.70;

  // 影
  c.save();
  c.globalAlpha = 0.20;
  c.fillStyle = '#6d5a48';
  c.beginPath();
  c.ellipse(R + R * 0.02, R + R * 0.07, rx * 1.02, ry * 1.0, 0, 0, TAU);
  c.fill();
  c.restore();

  const g = c.createRadialGradient(R - rx * 0.3, R - ry * 0.45, rx * 0.05, R, R, rx * 1.1);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.55, '#fbf7ee');
  g.addColorStop(0.85, '#eee5d4');
  g.addColorStop(1, '#ddd0ba');
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(R, R, rx, ry, 0, 0, TAU);
  c.fill();

  // 米粒
  c.save();
  c.beginPath();
  c.ellipse(R, R, rx, ry, 0, 0, TAU);
  c.clip();
  for (let i = 0; i < 420; i++) {
    const a = rng() * TAU, rr = Math.sqrt(rng());
    const x = R + Math.cos(a) * rx * rr, y = R + Math.sin(a) * ry * rr;
    const gr = rng();
    c.globalAlpha = 0.10 + gr * 0.22;
    c.fillStyle = gr > 0.55 ? '#ffffff' : '#d9cdb6';
    c.beginPath();
    c.ellipse(x, y, LAYER * 0.011, LAYER * 0.006, rng() * TAU, 0, TAU);
    c.fill();
  }
  c.restore();

  // 上からの艶
  c.save();
  c.globalAlpha = 0.5;
  const hg = c.createRadialGradient(R - rx * 0.32, R - ry * 0.48, 1, R - rx * 0.32, R - ry * 0.48, rx * 0.6);
  hg.addColorStop(0, 'rgba(255,255,255,0.85)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = hg;
  c.beginPath();
  c.ellipse(R, R, rx, ry, 0, 0, TAU);
  c.fill();
  c.restore();
  return cv;
}

// 混ざりきったチキンライス（ふくらんだ楕円）を焼く
export function bakeMixedRice(variant) {
  const cv = makeLayer();
  const c = cv.getContext('2d');
  const R = LAYER * 0.5;
  const rng = makeRng(77 + variant.id * 31);
  const rx = R * 0.74, ry = R * 0.66;
  const K = variant.ketchup;

  c.save();
  c.globalAlpha = 0.24;
  c.fillStyle = '#7a3a22';
  c.beginPath();
  c.ellipse(R + R * 0.02, R + R * 0.08, rx * 1.03, ry * 1.02, 0, 0, TAU);
  c.fill();
  c.restore();

  const g = c.createRadialGradient(R - rx * 0.30, R - ry * 0.50, rx * 0.05, R, R, rx * 1.12);
  g.addColorStop(0, K.light);
  g.addColorStop(0.42, K.body);
  g.addColorStop(0.82, K.deep);
  g.addColorStop(1, K.shadow);
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(R, R, rx, ry, 0, 0, TAU);
  c.fill();

  c.save();
  c.beginPath();
  c.ellipse(R, R, rx, ry, 0, 0, TAU);
  c.clip();
  // 具（鶏肉・玉ねぎ）と米粒感
  for (let i = 0; i < 300; i++) {
    const a = rng() * TAU, rr = Math.sqrt(rng());
    const x = R + Math.cos(a) * rx * rr, y = R + Math.sin(a) * ry * rr;
    const k = rng();
    c.globalAlpha = 0.16 + k * 0.30;
    c.fillStyle = k > 0.8 ? '#fff0dd' : k > 0.6 ? '#f8b48a' : K.deep;
    c.beginPath();
    c.ellipse(x, y, LAYER * (0.010 + k * 0.007), LAYER * 0.0065, rng() * TAU, 0, TAU);
    c.fill();
  }
  c.restore();

  c.save();
  c.globalAlpha = 0.45;
  const hg = c.createRadialGradient(R - rx * 0.34, R - ry * 0.5, 1, R - rx * 0.34, R - ry * 0.5, rx * 0.65);
  hg.addColorStop(0, 'rgba(255,240,225,0.9)');
  hg.addColorStop(1, 'rgba(255,240,225,0)');
  c.fillStyle = hg;
  c.beginPath();
  c.ellipse(R, R, rx, ry, 0, 0, TAU);
  c.fill();
  c.restore();
  return cv;
}

// 混ぜ塗りブラシ（皿ローカル）
export function paintMix(layer, u, v, radius, variant) {
  const c = layer.getContext('2d');
  const x = l2p(u), y = l2p(v), r = radius * 0.5 * LAYER;
  const K = variant.ketchup;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexA(K.body, 0.95));
  g.addColorStop(0.6, hexA(K.body, 0.72));
  g.addColorStop(1, hexA(K.body, 0));
  c.save();
  c.globalAlpha = 0.85;
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.restore();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// --- 皿本体 ---
export function drawPlateDish(ctx, P, variant) {
  const { cx, cy, r, ry } = P;
  ctx.save();
  // 落ち影
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = 'rgba(50,25,8,1)';
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.03, cy + ry * 0.14, r * 1.02, ry * 1.02, 0, 0, TAU);
  ctx.filter = 'none';
  ctx.fill();
  ctx.restore();

  // 外縁
  const g = ctx.createLinearGradient(cx - r, cy - ry, cx + r * 0.6, cy + ry);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.42, variant.plate.rim);
  g.addColorStop(0.78, variant.plate.mid);
  g.addColorStop(1, variant.plate.low);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, ry, 0, 0, TAU);
  ctx.fill();

  // 縁の淡い模様
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = variant.plate.pattern;
  ctx.lineWidth = Math.max(1, r * 0.012);
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.905, ry * 0.905, 0, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    const px = cx + Math.cos(a) * r * 0.945;
    const py = cy + Math.sin(a) * ry * 0.945;
    ctx.beginPath();
    ctx.ellipse(px, py, r * 0.018, ry * 0.018, 0, 0, TAU);
    ctx.fillStyle = variant.plate.pattern;
    ctx.fill();
  }
  ctx.restore();

  // 内側のくぼみ
  const ig = ctx.createLinearGradient(cx - r * 0.7, cy - ry * 0.7, cx + r * 0.7, cy + ry * 0.7);
  ig.addColorStop(0, variant.plate.wellHi);
  ig.addColorStop(0.6, '#ffffff');
  ig.addColorStop(1, variant.plate.wellLo);
  ctx.fillStyle = ig;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.855, ry * 0.855, 0, 0, TAU);
  ctx.fill();

  // 縁の内側の影
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = variant.plate.low;
  ctx.lineWidth = Math.max(1.5, r * 0.02);
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.86, ry * 0.86, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();

  // ハイライト
  ctx.save();
  ctx.globalAlpha = 0.55;
  const hg = ctx.createRadialGradient(cx - r * 0.55, cy - ry * 0.62, 1, cx - r * 0.55, cy - ry * 0.62, r * 0.7);
  hg.addColorStop(0, 'rgba(255,255,255,0.95)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, ry, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// --- 皿の中身（ご飯 → ケチャップ → 混ぜ → チキンライス） ---
export function drawPlateFood(ctx, P, G, t) {
  const { cx, cy, r, ry } = P;
  const m = G.mix.morph;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.86, ry * 0.86, 0, 0, TAU);
  ctx.clip();

  if (m < 1) {
    // 白ご飯
    ctx.globalAlpha = 1;
    ctx.drawImage(G.assets.rice, cx - r, cy - ry, r * 2, ry * 2);
    // 混ぜ塗りレイヤー
    ctx.globalAlpha = 0.95 * (1 - m);
    ctx.drawImage(G.assets.mixLayer, cx - r, cy - ry, r * 2, ry * 2);
    // ケチャップの線（艶あり／混ざるほど薄くなる）
    const fade = (1 - G.mix.cover * 0.85) * (1 - m);
    for (const s of G.ketchup.strokes) drawLocalStroke(ctx, P, s, G.variant.ketchup, fade);
  }
  if (m > 0) {
    const e = easeOutBack(clamp(m, 0, 1), 1.9);
    ctx.save();
    ctx.globalAlpha = clamp(m * 1.6, 0, 1);
    ctx.translate(cx, cy);
    const sc = 0.82 + 0.18 * e;
    const puff = 1 + Math.sin(clamp(m, 0, 1) * Math.PI) * 0.10;
    ctx.scale(sc * puff, sc * (2 - puff));
    ctx.drawImage(G.assets.mixed, -r, -ry, r * 2, ry * 2);
    ctx.restore();
  }
  ctx.restore();
}

// 正規化ストロークを画面座標へ写して艶やかに描く
export function drawLocalStroke(ctx, P, stroke, pal, alpha = 1) {
  if (!stroke.pts.length) return;
  const pts = stroke.pts.map((p) => toScreen(P, p.u, p.v));
  const w = Math.max(3, stroke.w * P.r);
  glossyStroke(ctx, pts, w, pal, { alpha });
}
