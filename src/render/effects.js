import { dustColor, circle } from './util.js';

export function drawParticles(ctx, L, game, kinds) {
  const list = game.particles.list;
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (!kinds.includes(o.type)) continue;
    const k = o.life / o.maxLife;
    if (o.type === 'dust') {
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.fillStyle = dustColor(o.hue);
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, o.r * 1.3, o.r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (o.type === 'smoke') {
      ctx.globalAlpha = o.alpha * Math.min(1, k * 1.4) * (0.5 + 0.5 * k);
      ctx.fillStyle = '#efe3d6';
      circle(ctx, o.x, o.y, o.r);
      ctx.fill();
    } else if (o.type === 'breath') {
      ctx.globalAlpha = 0.35 * k;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, o.r * 0.35);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(o.x - o.vx * 0.045, o.y - o.vy * 0.045);
      ctx.stroke();
    } else if (o.type === 'spark') {
      ctx.globalAlpha = Math.min(1, k * 1.8);
      ctx.fillStyle = k > 0.5 ? '#fff0b8' : '#ff8a3c';
      circle(ctx, o.x, o.y, o.r);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// 火種：黒い木粉のなかで脈打つ、小さな赤い光
export function drawEmber(ctx, L, game) {
  const e = game.ember;
  if (!e.active) return;
  if (game.phase !== 'ember' && game.phase !== 'carry') return;
  const s = L.s;
  // 脈打つ：1.0 〜 1.25 倍。光の輪も同じリズムでひろがる。
  const beat = (Math.sin(game.t * 5.2) + 1) / 2;
  const pulse = 1 + 0.25 * beat;
  const r = 9 * s * pulse;

  const gr = r * (5 + 1.6 * beat);
  const rg = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, gr);
  rg.addColorStop(0, 'rgba(255,170,70,0.75)');
  rg.addColorStop(0.35, 'rgba(255,110,40,0.35)');
  rg.addColorStop(1, 'rgba(255,90,30,0)');
  ctx.fillStyle = rg;
  circle(ctx, e.x, e.y, gr);
  ctx.fill();

  ctx.fillStyle = '#ff5a2b';
  circle(ctx, e.x, e.y, r);
  ctx.fill();
  ctx.fillStyle = '#ffd07a';
  circle(ctx, e.x - r * 0.2, e.y - r * 0.2, r * 0.45);
  ctx.fill();
}

// 炎：ふわっと立ちあがる
export function drawFlame(ctx, L, game) {
  if (game.phase !== 'flame') return;
  const s = L.s;
  const n = L.nest;
  const t = game.flameT;
  const grow = 1 - Math.exp(-t * 2.4);
  // 炎の大きさは火口の大きさ基準（どの画面サイズでも火口とつり合う）
  const H = n.r * (2.5 + 0.28 * Math.sin(game.t * 2.0)) * grow;
  const W = n.r * 1.05 * (0.8 + 0.25 * grow);
  const bx = n.x, by = n.y - n.r * 0.15;

  ctx.save();
  const rg = ctx.createRadialGradient(bx, by - H * 0.3, 0, bx, by - H * 0.3, H * 1.5);
  rg.addColorStop(0, 'rgba(255,190,90,0.45)');
  rg.addColorStop(1, 'rgba(255,150,60,0)');
  ctx.fillStyle = rg;
  circle(ctx, bx, by - H * 0.3, H * 1.5);
  ctx.fill();

  const layers = [
    { w: 1.0, h: 1.0, c: '#ff7a2a', a: 0.95 },
    { w: 0.68, h: 0.78, c: '#ffab3d', a: 0.95 },
    { w: 0.36, h: 0.52, c: '#ffe58f', a: 0.95 },
  ];
  for (let i = 0; i < layers.length; i++) {
    const L2 = layers[i];
    const wob = Math.sin(game.t * (3.2 + i) + i) * 8 * s;
    ctx.globalAlpha = L2.a;
    ctx.fillStyle = L2.c;
    // ふっくらした炎：根もとは丸く、先だけゆらぐ
    const hw = W * L2.w, hh = H * L2.h;
    ctx.beginPath();
    ctx.moveTo(bx - hw, by);
    ctx.bezierCurveTo(bx - hw * 1.12, by - hh * 0.52,
                      bx - hw * 0.62 + wob * 0.6, by - hh * 0.74,
                      bx + wob, by - hh);
    ctx.bezierCurveTo(bx + hw * 0.66 + wob * 0.6, by - hh * 0.74,
                      bx + hw * 1.12, by - hh * 0.52,
                      bx + hw, by);
    ctx.quadraticCurveTo(bx, by + 14 * s, bx - hw, by);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
