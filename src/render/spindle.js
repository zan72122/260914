import { PAL, rr } from './util.js';

export function drawSpindle(ctx, L, game) {
  const s = L.s;
  const sp = L.spindle;
  const off = game.spindleOffset(L);
  ctx.save();
  ctx.translate(off.dx, off.dy);
  if (off.tilt > 0.001) {
    // 根もとを支点にして倒す
    ctx.translate(sp.x, sp.baseY);
    ctx.rotate(off.tilt);
    ctx.translate(-sp.x, -sp.baseY);
  }

  const x = sp.x, r = sp.r;
  const top = sp.topY, bot = sp.baseY + 4 * s;

  const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
  g.addColorStop(0, PAL.woodDark);
  g.addColorStop(0.45, PAL.wood);
  g.addColorStop(1, PAL.woodDark);
  ctx.fillStyle = g;
  rr(ctx, x - r, top, r * 2, bot - top, r);
  ctx.fill();
  ctx.lineWidth = 3.2 * s;
  ctx.strokeStyle = PAL.ink;
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 回転を「止まった絵」でも読めるように、らせんの帯を2本。
  // 180°ずらしてあるので、どの角度でもかならず片方が手前に見える。
  ctx.save();
  rr(ctx, x - r, top, r * 2, bot - top, r);
  ctx.clip();
  ctx.strokeStyle = 'rgba(90,53,32,0.45)';
  ctx.lineWidth = 5 * s;
  ctx.lineCap = 'butt';
  const h = bot - top;
  for (let i = 0; i < 2; i++) {
    const phase = game.spindleAngle + i * Math.PI;
    if (Math.cos(phase) < 0) continue;          // 裏側は描かない
    ctx.beginPath();
    for (let k = 0; k <= 10; k++) {
      const yy = top + (h * k) / 10;
      // 高さにそって位相をずらす＝らせん
      const px = x + Math.sin(phase + (k / 10) * 2.2) * r * 0.82;
      if (k === 0) ctx.moveTo(px, yy); else ctx.lineTo(px, yy);
    }
    ctx.stroke();
  }
  ctx.restore();

  // 擦っている手ごたえ：小さな動きの線
  if (game.activity > 0.05 && game.phase === 'drill') {
    ctx.strokeStyle = 'rgba(90,53,32,0.35)';
    ctx.lineWidth = 2.4 * s;
    const a = game.activity;
    for (let i = 0; i < 3; i++) {
      const y = sp.baseY - (10 + i * 9) * s;
      const len = (10 + 16 * a) * s;
      const d = (i % 2 ? 1 : -1);
      ctx.beginPath();
      ctx.moveTo(x + d * (r + 5 * s), y);
      ctx.lineTo(x + d * (r + 5 * s + len), y - 3 * s);
      ctx.stroke();
    }
  }
  ctx.restore();
}
