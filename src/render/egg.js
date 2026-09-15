// オムレツ本体：ぷるぷる／切れ目／パカッ（薄皮が左右へ倒れる）／トロッ（半熟が流れ広がる）
import { TAU, clamp, lerp, easeOutCubic, easeOutBack } from '../util.js';
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
  const open = clamp(o.open || 0, 0, 1);
  const tor = clamp(o.tororo || 0, 0, 1);

  // 接地影（開くほど横に広がる）
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = 'rgba(86,44,10,1)';
  ctx.beginPath();
  ctx.ellipse(o.x + rx * 0.04, o.y + ry * 0.42, rx * (1.0 + open * 0.45), ry * 0.46, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

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

  // ---- パカッ：薄皮が左右へ倒れてライスの両脇に垂れる ----
  const e = easeOutBack(easeOutCubic(open), 1.15);
  for (const s of [-1, 1]) drawFlap(ctx, o, rx, ry, K, t, s, e);

  // ---- トロッ：中央から半熟が流れ広がる ----
  if (tor > 0) drawTororo(ctx, o, rx, ry, K, t, tor);
}

// 倒れた薄皮（外側がまるく、下に影、内側は切り口の断面）
function drawFlap(ctx, o, rx, ry, K, t, s, e) {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.rot || 0);

  // 皮の下の影（ライスに落ちる）
  ctx.save();
  ctx.globalAlpha = 0.26 * e;
  ctx.fillStyle = 'rgba(96,48,8,1)';
  ctx.beginPath();
  ctx.ellipse(s * rx * (0.30 + 0.46 * e), ry * 0.32, rx * 0.58, ry * 0.44, s * 0.2 * e, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.translate(s * rx * 0.74 * e, ry * 0.15 * e);
  ctx.rotate(s * 0.34 * e);
  // 倒れるほど奥行きで縮む（内側の切り口を軸に）
  ctx.scale(1 - 0.24 * e, 1 + 0.10 * e);

  // 皮の輪郭：内側（切り口）はまっすぐ、外側はまるく垂れる
  const fx = rx * 1.02, fy = ry * 1.0;
  const p = (x, y) => [s * x, y];
  // 外側のふち（ここだけ焼き色で縁取る。内側はとろとろの下に隠れる）
  const outer = () => {
    ctx.beginPath();
    ctx.moveTo(...p(0, -fy * 0.88));
    ctx.bezierCurveTo(...p(fx * 0.72, -fy * 0.95), ...p(fx * 1.02, -fy * 0.36), ...p(fx * 1.0, fy * 0.10));
    ctx.bezierCurveTo(...p(fx * 0.98, fy * 0.62), ...p(fx * 0.58, fy * 0.98), ...p(0, fy * 0.90));
  };
  outer();
  ctx.bezierCurveTo(...p(fx * 0.16, fy * 0.56), ...p(fx * 0.16, -fy * 0.54), ...p(0, -fy * 0.88));
  ctx.closePath();

  const g = ctx.createRadialGradient(-s * fx * 0.10, -fy * 0.44, fx * 0.05, s * fx * 0.30, fy * 0.10, fx * 1.20);
  g.addColorStop(0, K.hi);
  g.addColorStop(0.36, K.mid);
  g.addColorStop(0.78, K.low);
  g.addColorStop(1, K.edge);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.save();
  ctx.clip();   // 直前の fill に使ったパスでクリップ
  // 外側へ向かう丸み（下側に陰）
  ctx.globalAlpha = 0.34;
  const sg = ctx.createLinearGradient(0, fy * 0.05, 0, fy);
  sg.addColorStop(0, 'rgba(150,80,10,0)');
  sg.addColorStop(1, 'rgba(120,60,6,0.95)');
  ctx.fillStyle = sg;
  ctx.fillRect(-fx * 1.3, -fy * 1.3, fx * 2.6, fy * 2.6);
  // 切り口側（内側）のやわらかい暗がり
  ctx.globalAlpha = 0.42 * e;
  const ig = ctx.createLinearGradient(0, 0, s * fx * 0.46, 0);
  ig.addColorStop(0, 'rgba(198,120,26,0.85)');
  ig.addColorStop(1, 'rgba(198,120,26,0)');
  ctx.fillStyle = ig;
  ctx.fillRect(-fx * 1.3, -fy * 1.3, fx * 2.6, fy * 2.6);
  // 焼き色のまだら
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = K.edge;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(s * fx * (0.34 + i * 0.16), fy * (-0.3 + i * 0.28), fx * 0.16, fy * 0.09, 0.4 * s, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // ふちの焼き色（外側だけ）
  ctx.globalAlpha = 0.40;
  ctx.strokeStyle = K.edge;
  ctx.lineWidth = Math.max(1.5, rx * 0.028);
  ctx.lineCap = 'round';
  outer();
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 皮の艶
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = 'rgba(255,255,236,0.9)';
  ctx.beginPath();
  ctx.ellipse(s * fx * 0.46, -fy * 0.42, fx * 0.26, fy * 0.12, s * 0.5, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.28;
  ctx.beginPath();
  ctx.ellipse(s * fx * 0.70, fy * 0.18, fx * 0.12, fy * 0.22, s * 0.25, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

// 縦の切れ目（左右にパカッと開く場所）
function drawCutLine(ctx, rx, ry, k, K) {
  const w = clamp(k, 0, 1);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.9 * w;
  ctx.strokeStyle = K.edge;
  ctx.lineWidth = Math.max(2, rx * 0.030);
  ctx.beginPath();
  ctx.moveTo(0, -ry * 0.86 * w);
  ctx.quadraticCurveTo(rx * 0.05, 0, 0, ry * 0.86 * w);
  ctx.stroke();
  ctx.globalAlpha = 0.7 * w;
  ctx.strokeStyle = 'rgba(255,246,205,0.95)';
  ctx.lineWidth = Math.max(1, rx * 0.012);
  ctx.beginPath();
  ctx.moveTo(-rx * 0.022, -ry * 0.82 * w);
  ctx.quadraticCurveTo(rx * 0.03, 0, -rx * 0.022, ry * 0.82 * w);
  ctx.stroke();
  ctx.restore();
}

// 切る場所を教える稜線（呼吸する縦の艶）
function drawRidge(ctx, rx, ry, t) {
  const p = 0.5 + 0.5 * Math.sin(t * 3.0);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.32 + p * 0.34;
  ctx.strokeStyle = 'rgba(255,252,225,0.95)';
  ctx.lineWidth = Math.max(3, rx * 0.075);
  ctx.beginPath();
  ctx.moveTo(-rx * 0.02, -ry * 0.78);
  ctx.quadraticCurveTo(rx * 0.10, 0, -rx * 0.02, ry * 0.78);
  ctx.stroke();
  ctx.globalAlpha = 0.22 + p * 0.26;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(1.5, rx * 0.026);
  ctx.beginPath();
  ctx.moveTo(-rx * 0.06, -ry * 0.70);
  ctx.quadraticCurveTo(rx * 0.05, 0, -rx * 0.06, ry * 0.70);
  ctx.stroke();
  ctx.restore();
}

// トロッ：半熟のとろとろが手前と左右へ広がり、ふっくらした丸い縁で止まる
function drawTororo(ctx, o, rx, ry, K, t, tor) {
  const p = easeOutCubic(clamp(tor, 0, 1));
  const w = rx * (0.22 + 0.86 * p);
  const h = ry * (0.24 + 0.92 * p);
  ctx.save();
  ctx.translate(o.x, o.y + ry * 0.06 * p);
  ctx.rotate(o.rot || 0);

  const N = 80;
  const shape = (ctx2) => {
    ctx2.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU;
      const down = Math.max(0, Math.sin(a));            // 手前（下）ほど垂れる
      const lobe = 1
        + Math.sin(a * 3 + 0.8) * 0.030 * p
        + Math.sin(a * 2 - t * 0.7) * 0.016 * p;
      const drip = 1 + down * down * (0.10 + 0.05 * Math.sin(a * 3 + 1.1)) * p;
      const x = Math.cos(a) * w * lobe;
      const y = Math.sin(a) * h * lobe * drip;
      i === 0 ? ctx2.moveTo(x, y) : ctx2.lineTo(x, y);
    }
    ctx2.closePath();
  };

  // ライスに落ちる接地影（とろとろの縁がふっくら見える）
  ctx.save();
  ctx.globalAlpha = 0.20 * p;
  ctx.translate(w * 0.01, h * 0.055);
  shape(ctx);
  ctx.fillStyle = 'rgba(120,58,4,1)';
  ctx.fill();
  ctx.restore();

  shape(ctx);
  const g = ctx.createRadialGradient(-w * 0.28, -h * 0.36, w * 0.05, w * 0.05, h * 0.18, w * 1.12);
  g.addColorStop(0, K.torHi);
  g.addColorStop(0.42, K.torMid);
  g.addColorStop(0.82, K.torLow);
  g.addColorStop(1, K.torEdge);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.save();
  shape(ctx);
  ctx.clip();

  // 皮の下から出てくる：上側に落ちる陰
  ctx.globalAlpha = 0.34 * p;
  const ig = ctx.createLinearGradient(0, -h, 0, h * 0.1);
  ig.addColorStop(0, 'rgba(126,60,4,0.95)');
  ig.addColorStop(1, 'rgba(126,60,4,0)');
  ctx.fillStyle = ig;
  ctx.fillRect(-w * 1.4, -h * 1.4, w * 2.8, h * 2.8);

  // 中央の明るいたまり
  ctx.globalAlpha = 0.55;
  const pg = ctx.createRadialGradient(-w * 0.12, -h * 0.06, w * 0.02, -w * 0.05, 0, w * 0.72);
  pg.addColorStop(0, 'rgba(255,241,176,0.95)');
  pg.addColorStop(1, 'rgba(255,241,176,0)');
  ctx.fillStyle = pg;
  ctx.fillRect(-w * 1.4, -h * 1.4, w * 2.8, h * 2.8);

  // 大きく滑らかなスペキュラが走る
  const sweep = clamp((tor - 0.12) / 0.78, 0, 1);
  ctx.globalAlpha = 0.5 * Math.sin(clamp(tor, 0.001, 1) * Math.PI) + 0.14;
  const sx = lerp(-w * 1.1, w * 1.1, sweep);
  const sg = ctx.createLinearGradient(sx - w * 0.42, -h, sx + w * 0.42, h);
  sg.addColorStop(0, 'rgba(255,255,225,0)');
  sg.addColorStop(0.5, 'rgba(255,255,236,0.9)');
  sg.addColorStop(1, 'rgba(255,255,225,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(-w * 1.4, -h * 1.4, w * 2.8, h * 2.8);

  // ふくらみ（下側にまわり込む濃い色）
  ctx.globalAlpha = 0.40 * p;
  const bg = ctx.createRadialGradient(-w * 0.18, -h * 0.30, w * 0.10, 0, h * 0.10, w * 1.05);
  bg.addColorStop(0, 'rgba(255,214,110,0)');
  bg.addColorStop(0.62, 'rgba(232,150,30,0)');
  bg.addColorStop(1, 'rgba(206,116,12,0.85)');
  ctx.fillStyle = bg;
  ctx.fillRect(-w * 1.4, -h * 1.4, w * 2.8, h * 2.8);
  // とろみのたまり（やわらかい明るい島）
  ctx.globalAlpha = 0.22 * p;
  ctx.fillStyle = 'rgba(255,236,150,0.9)';
  for (let i = 0; i < 3; i++) {
    const a = 1.1 + i * 2.2;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * w * 0.34, Math.sin(a) * h * 0.30 + h * 0.06, w * (0.30 - i * 0.05), h * (0.17 - i * 0.03), 0.2 * i, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // ふちのまるいハイライト（ふっくら見せる）
  ctx.save();
  ctx.globalAlpha = 0.24 * p;
  ctx.strokeStyle = 'rgba(255,236,170,0.85)';
  ctx.lineWidth = Math.max(1.5, w * 0.024);
  shape(ctx);
  ctx.stroke();
  ctx.restore();

  // 大きな艶と小さな粒
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = 'rgba(255,255,238,0.95)';
  ctx.beginPath();
  ctx.ellipse(-w * 0.30, -h * 0.38, w * 0.30, h * 0.14, -0.30, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.ellipse(w * 0.34, -h * 0.20, w * 0.12, h * 0.07, 0.35, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.28;
  for (let i = 0; i < 5; i++) {
    const a = i * 2.399 + 0.7;
    const rr = Math.sqrt((i + 0.4) / 5) * 0.62;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * w * rr, Math.sin(a) * h * rr, w * 0.028, h * 0.022, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // 湯気（ごく微か）
  ctx.save();
  ctx.globalAlpha = 0.10 * p;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(2, w * 0.05);
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const bx = (i - 1) * w * 0.34;
    const ph = t * 1.1 + i * 1.9;
    ctx.beginPath();
    ctx.moveTo(bx, -h * 0.5);
    ctx.quadraticCurveTo(bx + Math.sin(ph) * w * 0.14, -h * 0.95, bx + Math.sin(ph + 1) * w * 0.10, -h * 1.35);
    ctx.stroke();
  }
  ctx.restore();

  ctx.restore();
}
