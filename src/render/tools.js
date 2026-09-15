// 道具：ケチャップボトル・ヘラ・卵ボウル（すべて自前描画）
import { TAU, roundRect } from '../util.js';

export function drawBottle(ctx, x, y, r, angle, K, opts = {}) {
  const w = r * 0.92, h = r * 2.25;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(opts.scale || 1, opts.scale || 1);

  // 影
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = 'rgba(40,18,4,1)';
  ctx.beginPath();
  ctx.ellipse(w * 0.1, h * 0.52, w * 0.62, h * 0.10, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 本体（半透明ボトル）
  const bg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  bg.addColorStop(0, 'rgba(255,255,255,0.92)');
  bg.addColorStop(0.35, 'rgba(240,244,248,0.80)');
  bg.addColorStop(1, 'rgba(196,206,216,0.85)');
  roundRect(ctx, -w / 2, -h * 0.46, w, h * 0.86, w * 0.34);
  ctx.fillStyle = bg;
  ctx.fill();

  // 中のケチャップ
  ctx.save();
  roundRect(ctx, -w / 2, -h * 0.46, w, h * 0.86, w * 0.34);
  ctx.clip();
  const kg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  kg.addColorStop(0, K.light);
  kg.addColorStop(0.35, K.body);
  kg.addColorStop(1, K.deep);
  ctx.fillStyle = kg;
  ctx.fillRect(-w / 2, -h * 0.20, w, h * 0.62);
  // 液面
  ctx.fillStyle = K.light;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.20, w * 0.5, h * 0.035, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 白いラベル（文字なし）
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#fffdf6';
  roundRect(ctx, -w * 0.36, -h * 0.08, w * 0.72, h * 0.26, w * 0.14);
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = K.body;
  ctx.beginPath();
  ctx.ellipse(0, h * 0.05, w * 0.20, h * 0.065, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 首
  ctx.fillStyle = K.deep;
  ctx.beginPath();
  ctx.moveTo(-w * 0.34, h * 0.40);
  ctx.lineTo(w * 0.34, h * 0.40);
  ctx.lineTo(w * 0.17, h * 0.56);
  ctx.lineTo(-w * 0.17, h * 0.56);
  ctx.closePath();
  ctx.fill();
  // 赤いキャップ
  const cg = ctx.createLinearGradient(-w * 0.2, 0, w * 0.2, 0);
  cg.addColorStop(0, K.light);
  cg.addColorStop(0.4, K.body);
  cg.addColorStop(1, K.shadow);
  ctx.fillStyle = cg;
  roundRect(ctx, -w * 0.20, h * 0.54, w * 0.40, h * 0.14, w * 0.07);
  ctx.fill();
  // ノズル
  ctx.beginPath();
  ctx.moveTo(-w * 0.10, h * 0.68);
  ctx.lineTo(w * 0.10, h * 0.68);
  ctx.lineTo(w * 0.045, h * 0.80);
  ctx.lineTo(-w * 0.045, h * 0.80);
  ctx.closePath();
  ctx.fillStyle = K.deep;
  ctx.fill();

  // ガラスの艶
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  roundRect(ctx, -w * 0.34, -h * 0.36, w * 0.13, h * 0.5, w * 0.07);
  ctx.fill();
  ctx.globalAlpha = 0.35;
  roundRect(ctx, w * 0.24, -h * 0.30, w * 0.07, h * 0.38, w * 0.04);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

// ボトル先端（ノズル）の画面座標
export function bottleNozzle(x, y, r, angle) {
  const d = r * 2.25 * 0.80;
  return { x: x - Math.sin(angle) * d, y: y + Math.cos(angle) * d };
}

export function drawSpatula(ctx, x, y, r, angle) {
  const w = r * 0.78, h = r * 2.3;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.save();
  ctx.globalAlpha = 0.26;
  ctx.fillStyle = 'rgba(40,18,4,1)';
  ctx.beginPath();
  ctx.ellipse(w * 0.12, h * 0.5, w * 0.6, h * 0.09, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 柄（木）
  const hg = ctx.createLinearGradient(-w * 0.2, 0, w * 0.2, 0);
  hg.addColorStop(0, '#dfa96a');
  hg.addColorStop(0.45, '#b9793d');
  hg.addColorStop(1, '#8b5526');
  roundRect(ctx, -w * 0.19, -h * 0.52, w * 0.38, h * 0.62, w * 0.19);
  ctx.fillStyle = hg;
  ctx.fill();
  // 吊り穴
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#6d3f1b';
  ctx.beginPath();
  ctx.arc(0, -h * 0.44, w * 0.09, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  // ヘラ面
  const bgd = ctx.createLinearGradient(-w * 0.6, h * 0.05, w * 0.6, h * 0.55);
  bgd.addColorStop(0, '#f2f4f8');
  bgd.addColorStop(0.5, '#cfd6df');
  bgd.addColorStop(1, '#9aa4b0');
  roundRect(ctx, -w * 0.62, h * 0.04, w * 1.24, h * 0.48, w * 0.22);
  ctx.fillStyle = bgd;
  ctx.fill();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = '#7f8996';
  ctx.lineWidth = Math.max(1, w * 0.06);
  ctx.stroke();
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  roundRect(ctx, -w * 0.46, h * 0.10, w * 0.30, h * 0.30, w * 0.12);
  ctx.fill();
  ctx.restore();
}

export function drawBowl(ctx, x, y, r, angle, K) {
  const w = r * 1.65, h = r * 1.22;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = 'rgba(40,18,4,1)';
  ctx.beginPath();
  ctx.ellipse(w * 0.06, h * 0.55, w * 0.52, h * 0.13, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 器
  const bg = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(0.55, '#f0eee9');
  bg.addColorStop(1, '#c9c3b8');
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h * 0.18);
  ctx.quadraticCurveTo(-w * 0.46, h * 0.56, 0, h * 0.56);
  ctx.quadraticCurveTo(w * 0.46, h * 0.56, w / 2, -h * 0.18);
  ctx.closePath();
  ctx.fillStyle = bg;
  ctx.fill();

  // 中の卵液
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.18, w * 0.5, h * 0.20, 0, 0, TAU);
  ctx.clip();
  const eg = ctx.createLinearGradient(-w * 0.4, -h * 0.3, w * 0.4, h * 0.1);
  eg.addColorStop(0, K.hi);
  eg.addColorStop(0.5, K.mid);
  eg.addColorStop(1, K.low);
  ctx.fillStyle = eg;
  ctx.fillRect(-w, -h, w * 2, h * 2);
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = 'rgba(255,255,230,0.9)';
  ctx.beginPath();
  ctx.ellipse(-w * 0.15, -h * 0.24, w * 0.16, h * 0.05, -0.2, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 縁
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = Math.max(2, r * 0.07);
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.18, w * 0.5, h * 0.20, 0, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#bdb6a9';
  ctx.lineWidth = Math.max(1, r * 0.03);
  ctx.stroke();
  ctx.restore();
}
