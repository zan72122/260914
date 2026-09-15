// 皿・ライス（盛られたマウンド）・ケチャップ・混ぜ塗り
// 皿の中身はすべて「皿ローカル正規化座標」で保持 → 画面回転しても残る
import { TAU, clamp, makeRng, easeOutBack, springWobble, landWobble } from '../util.js';
import { toScreen } from '../layout.js';
import { glossyStroke } from './fx.js';

export const LAYER = 256; // 皿ローカルのオフスクリーン解像度

// ご飯のマウンド（皿ローカル正規化）。皿内径の約 72% 幅 / 62% 高さ。
// 皿の内径は r*0.855 なので 0.855*0.72 ≒ 0.615。
export const MOUND = { ru: 0.615, rv: 0.53, cv: -0.035 };

export function makeLayer() {
  const cv = document.createElement('canvas');
  cv.width = LAYER; cv.height = LAYER;
  return cv;
}
// 正規化(-1..1) → レイヤーpx
export const l2p = (u) => (u + 1) * 0.5 * LAYER;

// マウンドの輪郭（ほんの少しだけデコボコさせて「盛った」感じに）
export function moundOutline(ctx, cx, cy, rx, ry, k = 1) {
  const N = 56;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    const lump = 1 + Math.sin(a * 7 + 0.9) * 0.020 + Math.sin(a * 4 - 2.1) * 0.028;
    const x = cx + Math.cos(a) * rx * k * lump;
    const y = cy + Math.sin(a) * ry * k * lump;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

// 皿ローカル正規化 → 画面のマウンド楕円
export function moundScreen(P, wob = 0) {
  return {
    cx: P.cx,
    cy: P.cy + MOUND.cv * P.ry,
    rx: P.r * MOUND.ru * (1 + wob * 0.30),
    ry: P.ry * MOUND.rv * (1 - wob * 0.26),
  };
}

// 皿ローカル座標がマウンドの中かどうか（0..1 の正規化半径を返す）
export const moundRadius = (u, v) => Math.hypot(u / MOUND.ru, (v - MOUND.cv) / MOUND.rv);

// --- ご飯のマウンドを焼く（白ご飯 / チキンライス共通） ---
function bakeMound(pal, seed, grains) {
  const cv = makeLayer();
  const c = cv.getContext('2d');
  const R = LAYER * 0.5;
  const rng = makeRng(seed);
  const cx = R, cy = R + MOUND.cv * R;
  const rx = MOUND.ru * R, ry = MOUND.rv * R;

  // 皿に落ちるやわらかい影（下側に広がる）
  c.save();
  const sg = c.createRadialGradient(cx, cy + ry * 0.42, rx * 0.15, cx, cy + ry * 0.42, rx * 1.16);
  sg.addColorStop(0, 'rgba(120,88,58,0.42)');
  sg.addColorStop(0.62, 'rgba(120,88,58,0.22)');
  sg.addColorStop(1, 'rgba(120,88,58,0)');
  c.fillStyle = sg;
  c.beginPath();
  c.ellipse(cx + rx * 0.03, cy + ry * 0.40, rx * 1.16, ry * 0.86, 0, 0, TAU);
  c.fill();
  c.restore();

  // 本体（ドーム）: 左上からの光
  moundOutline(c, cx, cy, rx, ry);
  const g = c.createRadialGradient(cx - rx * 0.34, cy - ry * 0.52, rx * 0.06, cx, cy + ry * 0.10, rx * 1.12);
  g.addColorStop(0, pal.hi);
  g.addColorStop(0.34, pal.mid);
  g.addColorStop(0.74, pal.low);
  g.addColorStop(1, pal.edge);
  c.fillStyle = g;
  c.fill();

  c.save();
  moundOutline(c, cx, cy, rx, ry);
  c.clip();

  // 下半分の落ち込み（山の側面）
  const dg = c.createLinearGradient(0, cy - ry * 0.10, 0, cy + ry);
  dg.addColorStop(0, 'rgba(90,50,20,0)');
  dg.addColorStop(1, 'rgba(90,50,20,0.34)');
  c.fillStyle = dg;
  c.fillRect(0, 0, LAYER, LAYER);

  // 米粒
  for (let i = 0; i < grains.n; i++) {
    const a = rng() * TAU, rr = Math.sqrt(rng());
    const x = cx + Math.cos(a) * rx * rr * 0.99;
    const y = cy + Math.sin(a) * ry * rr * 0.99;
    const k = rng();
    // 上のほうほど明るい粒
    const lift = clamp(1 - (y - (cy - ry)) / (ry * 2), 0, 1);
    c.globalAlpha = (0.12 + k * 0.26) * (0.45 + lift * 0.75);
    c.fillStyle = k > grains.hiAt ? grains.hi : k > grains.midAt ? grains.mid : grains.low;
    c.beginPath();
    c.ellipse(x, y, LAYER * (0.0095 + k * 0.006), LAYER * 0.0055, rng() * TAU, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;

  // 上面のふんわりハイライト
  const hg = c.createRadialGradient(cx - rx * 0.26, cy - ry * 0.46, 1, cx - rx * 0.26, cy - ry * 0.46, rx * 0.78);
  hg.addColorStop(0, grains.gloss);
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  c.globalAlpha = 0.55;
  c.fillStyle = hg;
  c.fillRect(0, 0, LAYER, LAYER);
  c.restore();

  // 上の縁のリムライト（山の稜線）
  c.save();
  c.globalAlpha = 0.45;
  c.strokeStyle = pal.hi;
  c.lineWidth = LAYER * 0.012;
  c.beginPath();
  c.ellipse(cx, cy, rx * 0.985, ry * 0.985, 0, Math.PI * 1.08, Math.PI * 1.92);
  c.stroke();
  c.restore();

  // 下の縁の締め
  c.save();
  c.globalAlpha = 0.30;
  c.strokeStyle = pal.edge;
  c.lineWidth = LAYER * 0.012;
  c.beginPath();
  c.ellipse(cx, cy, rx * 0.985, ry * 0.985, 0, Math.PI * 0.10, Math.PI * 0.90);
  c.stroke();
  c.restore();

  return cv;
}

// 白いご飯のマウンド
export function bakeRice(variant) {
  return bakeMound(
    { hi: '#ffffff', mid: '#fdf9f0', low: '#efe6d3', edge: '#d8c9ae' },
    101 + variant.id * 17,
    { n: 460, hi: '#ffffff', mid: '#fff8ea', low: '#d8cbb2', hiAt: 0.62, midAt: 0.34, gloss: 'rgba(255,255,255,0.92)' },
  );
}

// 混ざりきったチキンライス（オレンジ寄りの赤・ふくらんだマウンド）
export function bakeMixedRice(variant) {
  const Rp = variant.rice;
  const cv = bakeMound(
    Rp,
    77 + variant.id * 31,
    { n: 340, hi: '#ffe3c4', mid: '#f8b98c', low: Rp.edge, hiAt: 0.78, midAt: 0.52, gloss: 'rgba(255,238,220,0.85)' },
  );
  // 具（鶏肉・玉ねぎ・グリンピース）をぱらり
  const c = cv.getContext('2d');
  const R = LAYER * 0.5;
  const cx = R, cy = R + MOUND.cv * R;
  const rx = MOUND.ru * R, ry = MOUND.rv * R;
  const rng = makeRng(555 + variant.id * 13);
  c.save();
  moundOutline(c, cx, cy, rx, ry);
  c.clip();
  for (let i = 0; i < 26; i++) {
    const a = rng() * TAU, rr = Math.sqrt(rng()) * 0.9;
    const x = cx + Math.cos(a) * rx * rr, y = cy + Math.sin(a) * ry * rr;
    const k = rng();
    c.globalAlpha = 0.55;
    c.fillStyle = k > 0.72 ? '#f6ead0' : k > 0.42 ? '#c98a4e' : '#8fae5a';
    c.beginPath();
    c.ellipse(x, y, LAYER * (0.012 + k * 0.008), LAYER * (0.009 + k * 0.005), rng() * TAU, 0, TAU);
    c.fill();
    c.globalAlpha = 0.35;
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath();
    c.ellipse(x - LAYER * 0.004, y - LAYER * 0.004, LAYER * 0.005, LAYER * 0.003, 0, 0, TAU);
    c.fill();
  }
  c.restore();
  return cv;
}

// 混ぜ塗りブラシ（皿ローカル）
export function paintMix(layer, u, v, radius, variant) {
  const c = layer.getContext('2d');
  const x = l2p(u), y = l2p(v), r = radius * 0.5 * LAYER;
  const K = variant.rice;
  const g = c.createRadialGradient(x - r * 0.2, y - r * 0.25, 0, x, y, r);
  g.addColorStop(0, hexA(K.mid, 0.98));
  g.addColorStop(0.55, hexA(K.mid, 0.82));
  g.addColorStop(1, hexA(K.low, 0));
  c.save();
  c.globalAlpha = 0.9;
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
// 皿は variant とレイアウトが変わらない限り不変なので、オフスクリーンへ一度だけ焼く。
// （毎フレームの createLinearGradient×2 / createRadialGradient×2 / 縁の点28個をまるごと省く）
let dishCache = null;

export function invalidatePlate() { dishCache = null; }

export function drawPlateDish(ctx, P, variant) {
  const scale = (() => {
    const m = ctx.getTransform ? ctx.getTransform() : null;
    return Math.max(0.5, Math.min(3, m ? Math.hypot(m.a, m.b) : 1));
  })();
  const key = `${P.cx}|${P.cy}|${P.r}|${P.ry}|${variant.id}|${scale.toFixed(3)}`;
  if (!dishCache || dishCache.key !== key) dishCache = bakeDish(P, variant, scale, key);
  const d = dishCache;
  ctx.drawImage(d.cv, P.cx - d.ox, P.cy - d.oy, d.w, d.h);
}

function bakeDish(P, variant, scale, key) {
  // 落ち影（cx+r*0.03, cy+ry*0.14, r*1.02, ry*1.02）まで含む余白
  const ox = P.r * 1.10, oy = P.ry * 1.10;
  const w = ox * 2, h = oy * 2 + P.ry * 0.16;
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * scale));
  cv.height = Math.max(1, Math.round(h * scale));
  const c = cv.getContext('2d');
  c.setTransform(scale, 0, 0, scale, 0, 0);
  paintDish(c, { cx: ox, cy: oy, r: P.r, ry: P.ry }, variant);
  return { key, cv, ox, oy, w, h };
}

function paintDish(ctx, P, variant) {
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

// --- 皿の中身（ご飯マウンド → ケチャップ → 混ぜ → チキンライス） ---
export function drawPlateFood(ctx, P, G, t) {
  const { cx, cy, r, ry } = P;
  const m = G.mix.morph;
  const o = G.omelet;
  // 着地でライスも一緒にぷるん
  const wobF = o.land ? landWobble : springWobble;
  const wob = (o.place === 'plate' && o.wobT < 4) ? wobF(o.wobT, 13, 3.0) * o.wobA * 0.55 : 0;

  ctx.save();
  // 皿の内側からははみ出さない
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.86, ry * 0.86, 0, 0, TAU);
  ctx.clip();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1 + wob * 0.30, 1 - wob * 0.26);
  ctx.translate(-cx, -cy);

  if (m < 1) {
    // 白ご飯のマウンド
    ctx.globalAlpha = 1;
    ctx.drawImage(G.assets.rice, cx - r, cy - ry, r * 2, ry * 2);
    // 混ぜ塗り・ケチャップはマウンドの上だけ
    ctx.save();
    const M = moundScreen(P);
    moundOutline(ctx, M.cx, M.cy, M.rx, M.ry, 0.995);
    ctx.clip();
    ctx.globalAlpha = 0.95 * (1 - m);
    ctx.drawImage(G.assets.mixLayer, cx - r, cy - ry, r * 2, ry * 2);
    const fade = (1 - G.mix.cover * 0.85) * (1 - m);
    for (const s of G.ketchup.strokes) drawLocalStroke(ctx, P, s, G.variant.ketchup, fade);
    ctx.restore();
  }
  if (m > 0) {
    const e = easeOutBack(clamp(m, 0, 1), 1.9);
    ctx.save();
    ctx.globalAlpha = clamp(m * 1.6, 0, 1);
    ctx.translate(cx, cy);
    const sc = 0.86 + 0.14 * e;
    const puff = 1 + Math.sin(clamp(m, 0, 1) * Math.PI) * 0.10;
    ctx.scale(sc * puff, sc * (2 - puff));
    ctx.drawImage(G.assets.mixed, -r, -ry, r * 2, ry * 2);
    ctx.restore();
  }
  ctx.restore();
  ctx.restore();
}

// 正規化ストロークを画面座標へ写して艶やかに描く
export function drawLocalStroke(ctx, P, stroke, pal, alpha = 1) {
  if (!stroke.pts.length) return;
  const pts = stroke.pts.map((p) => toScreen(P, p.u, p.v));
  const w = Math.max(3, stroke.w * P.r);
  glossyStroke(ctx, pts, w, pal, { alpha });
}
