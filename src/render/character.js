import { PAL, circle, rr } from './util.js';

// おとな（性別をきめない、まるい形だけの人）。
// 縦画面は寄りの構図なので顔と手だけが画面に入る。横画面は全身。
export function drawCharacter(ctx, L, game, layer) {
  const c = L.character;
  const s = c.scale;
  const lean = game.lean;
  const hx = c.head.x + (c.leanTo.x - c.head.x) * lean;
  const hy = c.head.y + (c.leanTo.y - c.head.y) * lean;
  const r = c.head.r;

  if (layer === 'back') {
    if (c.mode === 'full') drawBody(ctx, L, game, hx, hy, r, s);
    else drawShoulder(ctx, L, game, hx, hy, r, s);
    return;
  }

  // layer === 'front' : 顔と、きり棒をおさえる手
  drawHold(ctx, L, game, s);
  drawHead(ctx, L, game, hx, hy, r, s);
}

function drawShoulder(ctx, L, game, hx, hy, r, s) {
  const lean = game.lean;
  const c = L.character;
  ctx.save();
  ctx.lineJoin = 'round';

  // 画面のふちから入ってくる体。火口へ寄っていくほど、ふちの体はうすくなる。
  ctx.globalAlpha = Math.max(0, 1 - lean * 1.6);
  ctx.fillStyle = PAL.cloth;
  ctx.beginPath();
  ctx.moveTo(c.head.x - r * 0.2, c.head.y + r * 0.5);
  ctx.quadraticCurveTo(L.w + 40, c.head.y + r * 0.2, L.w + 40, c.head.y + r * 3.2);
  ctx.quadraticCurveTo(c.head.x + r * 0.4, c.head.y + r * 2.6, c.head.x - r * 0.5, c.head.y + r * 1.5);
  ctx.closePath();
  ctx.fill();

  // きり棒へのびる腕（押さえている間だけ）。きり棒が持ちあがれば腕もついていく。
  const off0 = game.spindleOffset(L);
  const sx0 = c.head.x - r * 0.45, sy0 = c.head.y + r * 1.35;
  const ex = c.holdHand.x + off0.dx, ey = c.holdHand.y + off0.dy;
  ctx.lineCap = 'round';
  ctx.strokeStyle = PAL.cloth; ctx.lineWidth = 30 * s;
  ctx.beginPath();
  ctx.moveTo(sx0, sy0);
  ctx.quadraticCurveTo((sx0 + ex) / 2 + 30 * s, (sy0 + ey) / 2 - 20 * s, ex, ey);
  ctx.stroke();
  ctx.globalAlpha = game.holdFade() * 0.35;
  ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3.2 * s;
  ctx.beginPath();
  ctx.moveTo(sx0, sy0);
  ctx.quadraticCurveTo((sx0 + ex) / 2 + 30 * s, (sy0 + ey) / 2 - 20 * s, ex, ey);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 肩は、いつでも顔のすぐ下にくっついている（姿勢がくずれないように）
  ctx.save();
  ctx.translate(hx, hy + r * 1.05);
  ctx.rotate(lean * 0.35);
  ctx.fillStyle = PAL.cloth;
  ctx.beginPath();
  ctx.ellipse(0, r * 0.45, r * 1.05, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.4; ctx.lineWidth = 3.2 * s; ctx.strokeStyle = PAL.ink; ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function drawBody(ctx, L, game, hx, hy, r, s) {
  const c = L.character;
  const hip = c.hip;
  ctx.save();
  ctx.lineJoin = 'round';
  // 脚（ひざまずき）
  ctx.fillStyle = PAL.clothDark;
  ctx.beginPath();
  ctx.moveTo(hip.x - r * 1.1, hip.y);
  ctx.quadraticCurveTo(hip.x + r * 1.6, hip.y - r * 0.2, hip.x + r * 2.1, hip.y + r * 0.7);
  ctx.quadraticCurveTo(hip.x + r * 0.2, hip.y + r * 1.0, hip.x - r * 1.2, hip.y + r * 0.75);
  ctx.closePath();
  ctx.fill();
  // 胴
  ctx.fillStyle = PAL.cloth;
  ctx.beginPath();
  ctx.moveTo(hx - r * 0.95, hy + r * 0.7);
  ctx.quadraticCurveTo(hx + r * 1.3, hy + r * 0.9, hip.x + r * 1.5, hip.y + r * 0.1);
  ctx.quadraticCurveTo(hip.x - r * 0.2, hip.y + r * 0.4, hip.x - r * 1.15, hip.y - r * 0.1);
  ctx.quadraticCurveTo(hx - r * 1.25, hy + r * 1.6, hx - r * 0.95, hy + r * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 3.2 * s; ctx.strokeStyle = PAL.ink; ctx.stroke();
  ctx.globalAlpha = 1;

  // 腕：きり棒の頭を押さえる
  const offB = game.spindleOffset(L);
  const sx = hx + r * 0.5, sy = hy + r * 1.35;
  const ex = c.holdHand.x + offB.dx, ey = c.holdHand.y + offB.dy;
  ctx.lineCap = 'round';
  ctx.globalAlpha = game.holdFade();
  ctx.strokeStyle = PAL.cloth; ctx.lineWidth = 26 * s;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo((sx + ex) / 2, (sy + ey) / 2 - 40 * s, ex, ey);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90,53,32,0.3)'; ctx.lineWidth = 3.2 * s;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo((sx + ex) / 2, (sy + ey) / 2 - 40 * s, ex, ey);
  ctx.stroke();
  ctx.restore();
}

// きり棒の頭をおさえる手と当て木
function drawHold(ctx, L, game, s) {
  const p = L.character.holdHand;
  const a = game.holdFade();  // 息を吹きに寄るとき、押さえていた手は離れる
  if (a <= 0.08) return;
  const off = game.spindleOffset(L);            // きり棒といっしょに持ちあがる
  ctx.save();
  ctx.translate(off.dx, off.dy - game.lean * 40 * s);
  ctx.globalAlpha = a;
  ctx.fillStyle = PAL.wood;
  rr(ctx, p.x - 34 * s, p.y - 26 * s, 68 * s, 26 * s, 12 * s);
  ctx.fill();
  ctx.globalAlpha = 0.5 * a; ctx.lineWidth = 3.2 * s; ctx.strokeStyle = PAL.ink; ctx.stroke();
  ctx.globalAlpha = a;
  ctx.fillStyle = PAL.skin;
  circle(ctx, p.x, p.y - 34 * s, 26 * s);
  ctx.fill();
  ctx.globalAlpha = 0.45 * a; ctx.strokeStyle = PAL.ink; ctx.stroke(); ctx.globalAlpha = a;
  // 指
  ctx.fillStyle = PAL.skinDark;
  for (let i = -1; i <= 1; i++) {
    rr(ctx, p.x + i * 15 * s - 6 * s, p.y - 26 * s, 12 * s, 16 * s, 6 * s);
    ctx.fill();
  }
  ctx.restore();
}

function drawHead(ctx, L, game, hx, hy, r, s) {
  const blowing = game.phase === 'blow';
  const smiling = game.phase === 'flame';
  const puff = game.puffAnim;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(game.lean * 0.35);

  // 顔
  ctx.fillStyle = PAL.skin;
  circle(ctx, 0, 0, r);
  ctx.fill();
  ctx.globalAlpha = 0.5; ctx.lineWidth = 3.4 * s; ctx.strokeStyle = PAL.ink; ctx.stroke();
  ctx.globalAlpha = 1;

  // 髪（まるい帽子のような形）
  ctx.fillStyle = PAL.hair;
  ctx.beginPath();
  ctx.arc(0, -r * 0.12, r * 1.02, Math.PI * 1.03, Math.PI * 1.97);
  ctx.quadraticCurveTo(0, -r * 0.55, r * 0.98, -r * 0.2);
  ctx.closePath();
  ctx.fill();

  // ほっぺ（吹くときふくらむ）
  const cheek = r * (0.20 + 0.16 * puff * (blowing ? 1 : 0));
  ctx.fillStyle = 'rgba(240,150,120,0.55)';
  circle(ctx, -r * 0.52, r * 0.28, cheek); ctx.fill();
  circle(ctx, r * 0.52, r * 0.28, cheek); ctx.fill();

  // 目
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 4.5 * s;
  ctx.lineCap = 'round';
  if (smiling || blowing) {
    // にっこり（弧）
    ctx.beginPath(); ctx.arc(-r * 0.34, r * 0.02, r * 0.17, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(r * 0.34, r * 0.02, r * 0.17, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  } else {
    ctx.fillStyle = PAL.ink;
    circle(ctx, -r * 0.34, r * 0.0, r * 0.10); ctx.fill();
    circle(ctx, r * 0.34, r * 0.0, r * 0.10); ctx.fill();
  }

  // 口
  ctx.fillStyle = '#8c4a34';
  if (blowing) {
    circle(ctx, -r * 0.10, r * 0.45, r * (0.10 + 0.05 * puff));
    ctx.fill();
  } else if (smiling) {
    ctx.strokeStyle = '#8c4a34'; ctx.lineWidth = 4.5 * s;
    ctx.beginPath();
    ctx.arc(0, r * 0.28, r * 0.30, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#8c4a34'; ctx.lineWidth = 4.2 * s;
    ctx.beginPath();
    ctx.arc(0, r * 0.30, r * 0.22, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  }
  ctx.restore();
}
