// オムレツ本体：ぷるぷる／切れ目／パカッ／トロッ
import { TAU, clamp, lerp, easeOutCubic, easeInOut } from '../util.js';
import { eggGloss } from './fx.js';

function grad(ctx, rx, ry, K) {
  const g = ctx.createRadialGradient(-rx * 0.30, -ry * 0.46, rx * 0.05, 0, 0, Math.max(rx, ry) * 1.12);
  g.addColorStop(0, K.hi);
  g.addColorStop(0.40, K.mid);
  g.addColorStop(0.80, K.low);
  g.addColorStop(1, K.edge);
  return g;
}

// o: {x,y,rx,ry,rot,wob,cut,open,tororo,ridge}
export function drawOmelet(ctx, o, K, t) {
  const wob = o.wob || 0;
  const rx = o.rx * (1 + wob * 0.55);
  const ry = o.ry * (1 - wob * 0.45);
  const open = o.open || 0;
  const tor = o.tororo || 0;

  // 接地影
  ctx.save();
  ctx.globalAlpha = 0.30;
  ctx.fillStyle = 'rgba(80,40,10,1)';
  ctx.beginPath();
  ctx.ellipse(o.x + rx * 0.04, o.y + ry * 0.36, rx * (1.0 + open * 0.40), ry * 0.42, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  if (tor > 0) drawTororo(ctx, o, rx, ry, K, t, tor);

  if (open <= 0.001) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot || 0);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.fillStyle = grad(ctx, rx, ry, K);
    ctx.fill();
    // 焼き色の縁
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = K.edge;
    ctx.lineWidth = Math.max(1.5, rx * 0.03);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // 表面のうねり（ふわとろ感）
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = K.low;
    ctx.lineWidth = Math.max(1, rx * 0.02);
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.ellipse(rx * 0.05 * i, ry * 0.18 * i, rx * (0.62 - i * 0.12), ry * (0.42 - i * 0.06), 0.2 * i, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    eggGloss(ctx, 0, 0, rx, ry, t);
    if (o.cut > 0) drawCutLine(ctx, rx, ry, o.cut, K);
    if (o.ridge) drawRidge(ctx, rx, ry, t);
    ctx.restore();
    return;
  }

  // パカッ：両側が外へ倒れる
  const e = easeOutCubic(clamp(open, 0, 1));
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot || 0);
    ctx.rotate(s * e * 0.18);
    ctx.translate(s * e * rx * 0.52, e * ry * 0.12);
    ctx.beginPath();
    if (s > 0) ctx.rect(0, -ry * 2, rx * 2.2, ry * 4);
    else ctx.rect(-rx * 2.2, -ry * 2, rx * 2.2, ry * 4);
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.fillStyle = grad(ctx, rx, ry, K);
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = K.edge;
    ctx.lineWidth = Math.max(1.5, rx * 0.03);
    ctx.stroke();
    ctx.globalAlpha = 1;
    eggGloss(ctx, 0, 0, rx, ry, t, 0.8);
    // 切り口のきわの陰（左右が離れて見えるように）
    ctx.save();
    ctx.globalAlpha = 0.35 * e;
    const sg = ctx.createLinearGradient(s * rx * 0.02, 0, s * rx * 0.34, 0);
    sg.addColorStop(0, 'rgba(120,60,0,0.85)');
    sg.addColorStop(1, 'rgba(120,60,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    // 切り口（内側のやわらかい面）
    ctx.globalAlpha = 0.45;
    const cg = ctx.createLinearGradient(0, -ry, 0, ry);
    cg.addColorStop(0, K.hi);
    cg.addColorStop(1, K.mid);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(s * rx * 0.03, 0, rx * 0.05, ry * 0.94, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawCutLine(ctx, rx, ry, k, K) {
  const w = clamp(k, 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.85 * w;
  ctx.strokeStyle = K.edge;
  ctx.lineWidth = Math.max(2, rx * 0.035);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-rx * 0.80 * w, 0);
  ctx.lineTo(rx * 0.80 * w, 0);
  ctx.stroke();
  ctx.globalAlpha = 0.6 * w;
  ctx.strokeStyle = 'rgba(255,245,200,0.9)';
  ctx.lineWidth = Math.max(1, rx * 0.012);
  ctx.beginPath();
  ctx.moveTo(-rx * 0.78 * w, -ry * 0.035);
  ctx.lineTo(rx * 0.78 * w, -ry * 0.035);
  ctx.stroke();
  ctx.restore();
}

// 切る場所を教える稜線（呼吸する艶）
function drawRidge(ctx, rx, ry, t) {
  const p = 0.5 + 0.5 * Math.sin(t * 3.0);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.35 + p * 0.35;
  ctx.strokeStyle = 'rgba(255,252,225,0.95)';
  ctx.lineWidth = Math.max(3, rx * 0.085);
  ctx.beginPath();
  ctx.moveTo(-rx * 0.72, -ry * 0.02);
  ctx.quadraticCurveTo(0, -ry * 0.16, rx * 0.72, -ry * 0.02);
  ctx.stroke();
  ctx.globalAlpha = 0.25 + p * 0.25;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(1.5, rx * 0.03);
  ctx.beginPath();
  ctx.moveTo(-rx * 0.66, -ry * 0.07);
  ctx.quadraticCurveTo(0, -ry * 0.20, rx * 0.66, -ry * 0.07);
  ctx.stroke();
  ctx.restore();
}

// トロッ：とろとろ卵が流れ出す
function drawTororo(ctx, o, rx, ry, K, t, tor) {
  const p = easeInOut(clamp(tor, 0, 1));
  const w = rx * (0.28 + 0.86 * p);
  const h = ry * (0.30 + 0.80 * p);
  ctx.save();
  ctx.translate(o.x, o.y + ry * 0.10 * p);
  ctx.rotate(o.rot || 0);

  ctx.beginPath();
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    const lobe = 1 + Math.sin(a * 5 + 1.2) * 0.07 * p + Math.sin(a * 3 - t * 0.9) * 0.04 * p;
    const drip = a > 0.35 && a < Math.PI - 0.35 ? 1 + 0.16 * p * Math.sin((a - 0.35) * 3.4) : 1;
    const x = Math.cos(a) * w * lobe;
    const y = Math.sin(a) * h * lobe * drip;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(-w * 0.25, -h * 0.35, w * 0.05, 0, 0, w * 1.05);
  g.addColorStop(0, K.torHi);
  g.addColorStop(0.45, K.torMid);
  g.addColorStop(0.85, K.torLow);
  g.addColorStop(1, K.torEdge);
  ctx.fillStyle = g;
  ctx.fill();

  // 走る艶（スペキュラ）
  const sweep = clamp((tor - 0.15) / 0.75, 0, 1);
  ctx.save();
  ctx.clip();
  ctx.globalAlpha = 0.55 * Math.sin(clamp(tor, 0, 1) * Math.PI);
  const sx = lerp(-w, w, sweep);
  const sg = ctx.createLinearGradient(sx - w * 0.35, 0, sx + w * 0.35, 0);
  sg.addColorStop(0, 'rgba(255,255,220,0)');
  sg.addColorStop(0.5, 'rgba(255,255,230,0.95)');
  sg.addColorStop(1, 'rgba(255,255,220,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(-w * 1.2, -h * 1.2, w * 2.4, h * 2.4);
  ctx.restore();

  // 奥まって見えるよう上側に落ちる陰
  ctx.save();
  ctx.clip();
  ctx.globalAlpha = 0.38 * p;
  const ig = ctx.createLinearGradient(0, -h, 0, h * 0.2);
  ig.addColorStop(0, 'rgba(120,58,4,0.9)');
  ig.addColorStop(1, 'rgba(120,58,4,0)');
  ctx.fillStyle = ig;
  ctx.fillRect(-w * 1.2, -h * 1.2, w * 2.4, h * 2.4);
  ctx.restore();

  ctx.globalAlpha = 0.45;
  ctx.fillStyle = 'rgba(255,255,235,0.9)';
  ctx.beginPath();
  ctx.ellipse(-w * 0.28, -h * 0.34, w * 0.24, h * 0.12, -0.3, 0, TAU);
  ctx.fill();
  ctx.restore();
}
