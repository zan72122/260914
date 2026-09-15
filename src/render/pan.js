// 黒いフライパン（取っ手つき）と、その上の卵液
import { TAU, lerp, noise1, roundRect } from '../util.js';

export function drawPan(ctx, L, G, t, drawEgg) {
  const P = L.pan;
  const { cx, cy, r, ry } = P;
  const tilt = G.pan.tilt;                 // 0..1 皿側へ傾ける量
  const dx = L.plate.cx - P.cx, dy = L.plate.cy - P.cy;
  const dlen = Math.hypot(dx, dy) || 1;
  const ux = dx / dlen, uy = dy / dlen;
  // 傾いた面の中身は皿側へずれる（向こう側の内壁が見える＝縁が下がって見える）
  const inx = cx + ux * r * 0.11 * tilt;
  const iny = cy + uy * ry * 0.11 * tilt;

  // 落ち影（傾けると皿側へ寄り、薄く小さくなる＝縁が下がって接地が変わる）
  ctx.save();
  ctx.globalAlpha = 0.38 - 0.12 * tilt;
  ctx.fillStyle = 'rgba(40,18,4,1)';
  ctx.beginPath();
  ctx.ellipse(
    cx + r * 0.04 + ux * r * 0.12 * tilt,
    cy + ry * 0.16 + uy * ry * 0.12 * tilt,
    r * (1.05 - 0.10 * tilt), ry * (1.05 - 0.26 * tilt), 0, 0, TAU,
  );
  ctx.fill();
  ctx.restore();

  ctx.save();
  // 皿の方へ「はっきり傾ける」：約12°回して、皿方向へ最大18%寄せ、縦を 0.85 に潰す
  ctx.translate(cx + ux * tilt * r * 0.18, cy + uy * tilt * ry * 0.18);
  ctx.rotate((ux < -0.3 ? -1 : 1) * 0.21 * tilt);
  ctx.scale(1, 1 - 0.15 * tilt);
  ctx.translate(-cx, -cy);

  // 取っ手
  drawHandle(ctx, P);

  // 外形
  const og = ctx.createLinearGradient(cx - r, cy - ry, cx + r * 0.7, cy + ry);
  og.addColorStop(0, '#4a4e55');
  og.addColorStop(0.35, '#2a2d33');
  og.addColorStop(0.75, '#15171b');
  og.addColorStop(1, '#0c0d10');
  ctx.fillStyle = og;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, ry, 0, 0, TAU);
  ctx.fill();

  // 内面
  const ig = ctx.createRadialGradient(inx - r * 0.3, iny - ry * 0.4, r * 0.05, inx, iny, r * 0.95);
  ig.addColorStop(0, '#41454c');
  ig.addColorStop(0.55, '#2b2e34');
  ig.addColorStop(1, '#191b1f');
  ctx.fillStyle = ig;
  ctx.beginPath();
  ctx.ellipse(inx, iny, r * 0.87, ry * 0.87, 0, 0, TAU);
  ctx.fill();

  // 内面の同心リング（鉄の質感）
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = '#8d939c';
  for (let i = 1; i <= 4; i++) {
    ctx.lineWidth = Math.max(1, r * 0.006);
    ctx.beginPath();
    ctx.ellipse(inx, iny, r * 0.87 * (i / 5), ry * 0.87 * (i / 5), 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  // 油の照り
  ctx.save();
  ctx.globalAlpha = 0.22;
  const sg = ctx.createRadialGradient(cx - r * 0.35, cy - ry * 0.45, 1, cx - r * 0.35, cy - ry * 0.45, r * 0.7);
  sg.addColorStop(0, 'rgba(255,240,200,0.9)');
  sg.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.87, ry * 0.87, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 中身（卵液）
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(inx, iny, r * 0.87, ry * 0.87, 0, 0, TAU);
  ctx.clip();
  if (drawEgg) drawEgg(ctx);
  ctx.restore();

  // 縁のハイライト
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = 'rgba(200,210,225,0.8)';
  ctx.lineWidth = Math.max(1.5, r * 0.018);
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.965, ry * 0.965, 0, Math.PI * 1.02, Math.PI * 1.85);
  ctx.stroke();
  if (tilt > 0.02) {
    // 起き上がった側の内壁（傾きを読み取れるようにする）
    ctx.globalAlpha = 0.30 * tilt;
    ctx.strokeStyle = 'rgba(150,160,175,0.85)';
    ctx.lineWidth = Math.max(2, r * 0.05 * tilt + 1);
    const a0 = Math.atan2(-uy, -ux);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.90, ry * 0.90, 0, a0 - 1.0, a0 + 1.0);
    ctx.stroke();
  }
  ctx.restore();

  ctx.restore();
}

function drawHandle(ctx, P) {
  const { cx, cy, r, ry, handleAngle } = P;
  const a = handleAngle == null ? 0 : handleAngle;
  const len = r * 1.05, w = Math.max(10, r * 0.24);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.scale(1, P.squash + 0.2);
  const g = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
  g.addColorStop(0, '#4c4f56');
  g.addColorStop(0.35, '#26282d');
  g.addColorStop(1, '#0d0e11');
  ctx.fillStyle = g;
  roundRect(ctx, r * 0.6, -w / 2, len, w, w * 0.45);
  ctx.fill();
  // 先端の穴
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(r * 0.6 + len - w * 0.55, 0, w * 0.17, 0, TAU);
  ctx.fill();
  // ハイライト
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#cfd6e0';
  roundRect(ctx, r * 0.65, -w * 0.36, len * 0.9, w * 0.17, w * 0.09);
  ctx.fill();
  ctx.restore();
}

// フライパン上の卵液（pan ローカル正規化で表現）
export function drawEggLiquid(ctx, P, G, t) {
  const e = G.egg;
  if (e.spread <= 0.001) return;
  const { cx, cy, r, ry } = P;
  const K = G.variant.egg;
  const spread = e.spread, gather = e.gather;
  const base = lerp(0.30, 0.86, spread) * (1 - gather * 0.62);
  const rough = (1 - gather) * 0.20;
  const N = 48;

  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    const wob = (noise1(a * 1.8 + e.seed, 3) - 0.5) * rough + Math.sin(a * 3 + t * 1.6) * 0.012 * (1 - gather);
    const rr = base * (1 + wob);
    const x = cx + Math.cos(a) * r * rr;
    const y = cy + Math.sin(a) * ry * rr;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(cx - r * base * 0.3, cy - ry * base * 0.4, r * 0.03, cx, cy, r * base * 1.1);
  g.addColorStop(0, K.hi);
  g.addColorStop(0.45, K.mid);
  g.addColorStop(0.85, K.low);
  g.addColorStop(1, K.edge);
  ctx.fillStyle = g;
  ctx.fill();

  // 焼き色の縁
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = K.edge;
  ctx.lineWidth = Math.max(1.5, r * 0.02);
  ctx.stroke();

  // 泡・つや
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = 'rgba(255,255,220,0.8)';
  for (let i = 0; i < 12; i++) {
    const a = i * 2.399 + e.seed;
    const rr = Math.sqrt((i + 0.5) / 12) * base * 0.8;
    const x = cx + Math.cos(a) * r * rr;
    const y = cy + Math.sin(a) * ry * rr;
    const s = r * (0.012 + 0.016 * ((i * 7) % 5) / 5) * (1 - gather * 0.5);
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.7, 0, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 0.42;
  const hg = ctx.createRadialGradient(cx - r * 0.3, cy - ry * 0.42, 1, cx - r * 0.3, cy - ry * 0.42, r * base * 0.8);
  hg.addColorStop(0, 'rgba(255,255,235,0.95)');
  hg.addColorStop(1, 'rgba(255,255,235,0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * base, ry * base, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}
