// 艶・きらめき・共通の質感表現
import { TAU, clamp } from '../util.js';

// 点列をなめらかな曲線としてパスにする（中点補間）
export function tracePath(ctx, pts) {
  ctx.beginPath();
  if (!pts.length) return;
  if (pts.length === 1) {
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[0].x + 0.01, pts[0].y);
    return;
  }
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const l = pts[pts.length - 1];
  ctx.lineTo(l.x, l.y);
}

// 艶のあるケチャップ線（シグネチャー）
// 影 → 本体グラデ → 内側の暗い縁 → 白いハイライト → 点スペキュラ
export function glossyStroke(ctx, pts, width, pal, opts = {}) {
  if (!pts || pts.length === 0) return;
  const alpha = opts.alpha == null ? 1 : opts.alpha;
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 落ち影
  ctx.save();
  ctx.translate(width * 0.10, width * 0.16);
  tracePath(ctx, pts);
  ctx.lineWidth = width * 0.98;
  ctx.strokeStyle = pal.shadow;
  ctx.globalAlpha = alpha * 0.45;
  ctx.stroke();
  ctx.restore();

  // 本体
  tracePath(ctx, pts);
  ctx.lineWidth = width;
  ctx.strokeStyle = pal.deep;
  ctx.stroke();

  ctx.lineWidth = width * 0.84;
  ctx.strokeStyle = pal.body;
  ctx.stroke();

  // 上側の明るい面
  ctx.save();
  ctx.translate(-width * 0.06, -width * 0.10);
  tracePath(ctx, pts);
  ctx.lineWidth = width * 0.46;
  ctx.strokeStyle = pal.light;
  ctx.globalAlpha = alpha * 0.85;
  ctx.stroke();
  ctx.restore();

  // 艶（ハイライト線）
  ctx.save();
  ctx.translate(-width * 0.16, -width * 0.20);
  tracePath(ctx, pts);
  ctx.lineWidth = Math.max(1, width * 0.17);
  ctx.strokeStyle = pal.gloss;
  ctx.globalAlpha = alpha * 0.75;
  ctx.stroke();
  ctx.restore();

  // 点スペキュラ（等間隔に散らす）
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  const step = Math.max(2, Math.floor(pts.length / 6));
  for (let i = 1; i < pts.length; i += step) {
    const p = pts[i];
    ctx.beginPath();
    ctx.ellipse(p.x - width * 0.17, p.y - width * 0.22, width * 0.10, width * 0.06, -0.5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// きらきら（4条の光）
export function sparkle(ctx, x, y, r, a = 1, color = 'rgba(255,255,240,0.95)') {
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = clamp(a, 0, 1);
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2;
    const cx = Math.cos(ang), sy = Math.sin(ang);
    const px = Math.cos(ang + Math.PI / 4) * r * 0.22, py = Math.sin(ang + Math.PI / 4) * r * 0.22;
    if (i === 0) ctx.moveTo(cx * r, sy * r); else ctx.lineTo(cx * r, sy * r);
    ctx.quadraticCurveTo(px, py, Math.cos(ang + Math.PI / 2) * r, Math.sin(ang + Math.PI / 2) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ぷるんとした楕円の塊（卵）の基本描画
export function jellyEllipse(ctx, cx, cy, rx, ry, grad, opts = {}) {
  const rot = opts.rot || 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  // 影
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = 'rgba(90,50,20,1)';
  ctx.beginPath();
  ctx.ellipse(rx * 0.05, ry * 0.30, rx * 0.97, ry * 0.92, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

// やわらかい放射グラデ（卵の膨らみ）
export function eggGradient(ctx, cx, cy, rx, ry, pal) {
  const g = ctx.createRadialGradient(cx - rx * 0.32, cy - ry * 0.45, rx * 0.06, cx, cy, Math.max(rx, ry) * 1.12);
  g.addColorStop(0, pal.hi);
  g.addColorStop(0.42, pal.mid);
  g.addColorStop(0.82, pal.low);
  g.addColorStop(1, pal.edge);
  return g;
}

// 卵表面の艶（大小ふたつのスペキュラ）
export function eggGloss(ctx, cx, cy, rx, ry, t = 0, a = 1) {
  ctx.save();
  ctx.globalAlpha = 0.55 * a;
  ctx.fillStyle = 'rgba(255,255,235,0.95)';
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.30, cy - ry * 0.44, rx * 0.30, ry * 0.17, -0.38 + Math.sin(t) * 0.05, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.30 * a;
  ctx.beginPath();
  ctx.ellipse(cx + rx * 0.30, cy - ry * 0.30, rx * 0.13, ry * 0.07, 0.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// 「次に触るもの」の呼吸グロー
export function attractGlow(ctx, x, y, r, t, color = 'rgba(255,240,180,') {
  const p = 0.5 + 0.5 * Math.sin(t * 2.6);
  ctx.save();
  const g = ctx.createRadialGradient(x, y, r * 0.35, x, y, r * (1.25 + p * 0.22));
  g.addColorStop(0, color + (0.30 + p * 0.22) + ')');
  g.addColorStop(1, color + '0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.5, 0, TAU);
  ctx.fill();
  ctx.restore();
}
