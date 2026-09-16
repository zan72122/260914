import { PAL } from './util.js';

// 弓：横向きの持ち手が「つかんで横にすべらせる」ことを形で伝える。
// 触る前は、ハンドルにやわらかい光の波紋（シグニファイア）。
// 何もしていないときは、ごくゆっくり左右にゆれている（動きへの誘い）。
// 弓の中心位置（弦の描画と共有する）
export function bowCenterX(L, game) {
  const sway = (game.strokeCount < 3 && !game.touching)
    ? Math.sin(game.t * 0.9) * 7 * L.s : 0;
  return L.bow.cx + game.bowOffset + sway;
}

// 弦ときり棒の巻きつきの位置。弓・きり棒どちらのゆれにも追従する。
function stringGeom(L, game) {
  const s = L.s;
  const off = game.spindleOffset(L);
  const dir = Math.sign(game.bowOffset || 0.0001);
  return {
    x: bowCenterX(L, game),
    half: L.bow.length / 2,
    anchor: (L.stringAnchor == null ? 0.92 : L.stringAnchor) * (L.bow.length / 2),
    by: L.bow.cy,
    sx: L.spindle.x + off.dx,
    // 弓が寄っているほうへ、巻きつき位置もわずかにずれる（張りのゆらぎ）
    sy: (L.stringY == null ? L.board.y - 20 * s : L.stringY) + off.dy + game.bowOffset * 0.02,
    r: L.spindle.r,
    dir,
    // きり棒が持ちあげられたら弦ははずれる
    alpha: Math.max(0, 1 - game.spindleLift * 1.4),
  };
}

// きり棒の「うしろ」を通る側（きり棒より先に描く）
export function drawStringBack(ctx, L, game) {
  const g = stringGeom(L, game);
  if (g.alpha <= 0.02) return;
  const s = L.s;
  ctx.save();
  ctx.globalAlpha = g.alpha;
  ctx.strokeStyle = 'rgba(90,53,32,0.8)';
  ctx.lineWidth = 3 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(g.x + g.anchor, g.by);
  ctx.lineTo(g.sx + g.r * 0.35, g.sy + 3 * s * g.dir);
  ctx.stroke();
  ctx.restore();
}

// きり棒の「手前」を通る側＋巻きついている帯（きり棒のあとに描く）
export function drawStringFront(ctx, L, game) {
  const g = stringGeom(L, game);
  if (g.alpha <= 0.02) return;
  const s = L.s;
  ctx.save();
  ctx.globalAlpha = g.alpha;
  ctx.strokeStyle = 'rgba(90,53,32,0.8)';
  ctx.lineWidth = 3 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(g.x - g.anchor, g.by);
  ctx.lineTo(g.sx - g.r * 0.35, g.sy - 3 * s * g.dir);
  ctx.stroke();

  // きり棒に巻きついた帯。回転にあわせて光の位置がすべる。
  ctx.strokeStyle = 'rgba(90,53,32,0.85)';
  ctx.lineWidth = 6 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(g.sx - g.r - 2 * s, g.sy - 2.5 * s * g.dir);
  ctx.lineTo(g.sx + g.r + 2 * s, g.sy + 2.5 * s * g.dir);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,240,210,0.65)';
  ctx.lineWidth = 2.4 * s;
  const hx = g.sx + Math.sin(game.spindleAngle) * g.r * 0.6;
  ctx.beginPath();
  ctx.moveTo(hx - g.r * 0.28, g.sy - 1.2 * s * g.dir);
  ctx.lineTo(hx + g.r * 0.28, g.sy + 1.2 * s * g.dir);
  ctx.stroke();
  ctx.restore();
}

export function drawBow(ctx, L, game) {
  const s = L.s;
  const b = L.bow;
  const x = bowCenterX(L, game);
  const y = b.cy;
  const half = b.length / 2;

  ctx.save();
  // 影
  ctx.fillStyle = 'rgba(90,53,32,0.14)';
  ctx.beginPath();
  ctx.ellipse(x, y + 24 * s, half * 0.8, 9 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // 弓のしなり（深くそらせて「弓」と一目でわかる形に）
  const dip = 70 * s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PAL.woodDark;
  ctx.lineWidth = 15 * s;
  ctx.beginPath();
  ctx.moveTo(x - half, y);
  ctx.quadraticCurveTo(x, y + dip, x + half, y);
  ctx.stroke();
  ctx.strokeStyle = PAL.wood;
  ctx.lineWidth = 9 * s;
  ctx.beginPath();
  ctx.moveTo(x - half, y);
  ctx.quadraticCurveTo(x, y + dip, x + half, y);
  ctx.stroke();

  // 持ち手：横長のカプセル＋すべり止めの溝＝「横に持ってすべらせる」形
  // 持ち手は弓の曲線の上に置き、接線に合わせて少し傾ける
  const ha = (b.handleAt == null ? 0.55 : b.handleAt);
  const t = (ha + 1) / 2;
  const hx = x + half * ha;
  const hy = y + 2 * (1 - t) * t * dip;
  const hAng = Math.atan2(dip * (1 - 2 * t), half);
  const hw = 66 * s, hh = 30 * s;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(hAng);
  const grad = ctx.createLinearGradient(0, -hh / 2, 0, hh / 2);
  grad.addColorStop(0, '#e2a96a');
  grad.addColorStop(1, '#c1853f');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(-hw / 2, -hh / 2, hw, hh, hh / 2) : roundFallback(ctx, -hw / 2, -hh / 2, hw, hh, hh / 2);
  ctx.fill();
  ctx.lineWidth = 3.2 * s;
  ctx.strokeStyle = PAL.ink;
  ctx.globalAlpha = 0.55;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(90,53,32,0.35)';
  ctx.lineWidth = 3 * s;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 14 * s, -hh * 0.28);
    ctx.lineTo(i * 14 * s, hh * 0.28);
    ctx.stroke();
  }
  ctx.restore();

  // まだ擦っていないうちだけ光る波紋
  const hint = Math.max(0, 1 - game.strokeCount / 4);
  if (hint > 0 && game.phase === 'drill') {
    const k = (game.t % 1.6) / 1.6;
    ctx.globalAlpha = hint * (1 - k) * 0.55;
    ctx.strokeStyle = '#fff3cf';
    ctx.lineWidth = 5 * s;
    ctx.beginPath();
    ctx.ellipse(hx, hy, (hw * 0.6 + k * 60 * s), (hh * 0.7 + k * 40 * s), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = hint * 0.35;
    const rg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 70 * s);
    rg.addColorStop(0, 'rgba(255,245,215,0.9)');
    rg.addColorStop(1, 'rgba(255,245,215,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(hx, hy, 70 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function roundFallback(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
