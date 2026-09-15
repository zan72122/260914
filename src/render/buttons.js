// 絵だけのボタン（文字は一切使わない）
import { TAU } from '../util.js';

export function drawButton(ctx, b, t, press = 0, glow = 0) {
  const r = b.r * (1 - press * 0.08);
  ctx.save();
  ctx.translate(b.x, b.y);

  // 誘いの光
  if (glow > 0) {
    const p = 0.5 + 0.5 * Math.sin(t * 2.4 + b.x * 0.01);
    const g = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.7);
    g.addColorStop(0, `rgba(255,246,205,${0.28 * glow * (0.6 + p * 0.4)})`);
    g.addColorStop(1, 'rgba(255,246,205,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.7, 0, TAU);
    ctx.fill();
  }

  // 影
  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = 'rgba(40,18,4,1)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.18, r * 0.98, r * 0.92, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 本体（つやのあるボタン）
  const bg = ctx.createLinearGradient(0, -r, 0, r);
  bg.addColorStop(0, '#fffdf6');
  bg.addColorStop(0.5, '#fdf1d8');
  bg.addColorStop(1, '#e8cfa4');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,110,50,0.45)';
  ctx.lineWidth = Math.max(1.5, r * 0.06);
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.75;
  const hg = ctx.createRadialGradient(-r * 0.3, -r * 0.45, 1, -r * 0.3, -r * 0.45, r * 0.9);
  hg.addColorStop(0, 'rgba(255,255,255,0.95)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.restore();

  if (b.id === 'again') iconAgain(ctx, r, t);
  else if (b.id === 'variant') iconSparkle(ctx, r, t);
  else iconBrush(ctx, r, t);
  ctx.restore();
}

// 🔁 もう一回：ぐるっと回る矢印
function iconAgain(ctx, r, t) {
  const R = r * 0.52;
  ctx.save();
  ctx.rotate(Math.sin(t * 1.4) * 0.12);
  ctx.strokeStyle = '#c8321f';
  ctx.lineWidth = r * 0.20;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, R, Math.PI * 0.42, Math.PI * 1.95);
  ctx.stroke();
  // 矢じり
  const a = Math.PI * 0.42;
  const ax = Math.cos(a) * R, ay = Math.sin(a) * R;
  ctx.fillStyle = '#c8321f';
  ctx.beginPath();
  ctx.moveTo(ax + R * 0.42, ay - R * 0.05);
  ctx.lineTo(ax - R * 0.18, ay + R * 0.40);
  ctx.lineTo(ax - R * 0.30, ay - R * 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ✨ 別バージョン：きらきら
function iconSparkle(ctx, r, t) {
  const p = 0.85 + 0.15 * Math.sin(t * 3.1);
  star(ctx, 0, -r * 0.05, r * 0.52 * p, '#f0a51e');
  star(ctx, r * 0.42, r * 0.33, r * 0.24 * p, '#e8c23a');
  star(ctx, -r * 0.40, r * 0.30, r * 0.19 * p, '#d94b2a');
}
function star(ctx, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const bx = Math.cos(a) * s, by = Math.sin(a) * s;
    const na = a + Math.PI / 2;
    if (i === 0) ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(Math.cos(a + Math.PI / 4) * s * 0.20, Math.sin(a + Math.PI / 4) * s * 0.20, Math.cos(na) * s, Math.sin(na) * s);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// 🖌 自由に描く：筆
function iconBrush(ctx, r, t) {
  ctx.save();
  ctx.rotate(-0.6 + Math.sin(t * 2.0) * 0.08);
  // 柄
  const g = ctx.createLinearGradient(-r * 0.1, -r * 0.6, r * 0.1, 0);
  g.addColorStop(0, '#e0a96b');
  g.addColorStop(1, '#a4652c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(-r * 0.09, -r * 0.62, r * 0.18, r * 0.72, r * 0.09) : ctx.rect(-r * 0.09, -r * 0.62, r * 0.18, r * 0.72);
  ctx.fill();
  // 金具
  ctx.fillStyle = '#b9c0c8';
  ctx.fillRect(-r * 0.12, r * 0.04, r * 0.24, r * 0.14);
  // 穂先（赤いケチャップ）
  ctx.fillStyle = '#d0301c';
  ctx.beginPath();
  ctx.moveTo(-r * 0.13, r * 0.18);
  ctx.quadraticCurveTo(0, r * 0.72, r * 0.13, r * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // 描いた線
  ctx.save();
  ctx.strokeStyle = '#d0301c';
  ctx.lineWidth = r * 0.12;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, r * 0.58);
  ctx.quadraticCurveTo(0, r * 0.34, r * 0.52, r * 0.56);
  ctx.stroke();
  ctx.restore();
}
