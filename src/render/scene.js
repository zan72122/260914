// 1フレームぶんの絵。Canvas は1枚だけ。
import { TAU, clamp, lerp } from '../util.js';
import { drawTable } from './table.js';
import { drawPlateDish, drawPlateFood, drawLocalStroke } from './plate.js';
import { drawPan, drawEggLiquid } from './pan.js';
import { drawOmelet } from './egg.js';
import { drawBottle, drawSpatula, drawBowl } from './tools.js';
import { drawButton } from './buttons.js';
import { attractGlow, sparkle, glossyStroke } from './fx.js';
import { S, omeletScreen } from '../state.js';

const LATE = { [S.CUT]: 1, [S.OPEN]: 1, [S.DRAW]: 1, [S.MENU]: 1 };

export function render(ctx, G, L) {
  const t = G.time;
  ctx.clearRect(0, 0, L.w, L.h);
  drawTable(ctx, L.w, L.h, G.variantId);

  // --- 皿 ---
  drawPlateDish(ctx, L.plate, G.variant);
  drawPlateFood(ctx, L.plate, G, t);

  // --- フライパン（料理が皿へ移ったら静かに消える） ---
  if (G.panAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = G.panAlpha;
    if (G.state === S.SLIDE && G.omelet.place === 'pan') {
      attractGlow(ctx, L.pan.cx, L.pan.cy, L.pan.r * 0.9, t);
    }
    drawPan(ctx, L, G, t, (c) => {
      if (G.omelet.place !== 'none') return;   // 卵が塊になったら液体は描かない
      drawEggLiquid(c, L.pan, G, t);
      if (G.state === S.GATHER && G.egg.gather < 1) gatherHint(c, L.pan, G, t);
    });
    ctx.restore();
  }

  // --- オムレツ ---
  if (G.omelet.place === 'pan' || G.omelet.place === 'fly' || G.omelet.place === 'plate') {
    const o = omeletScreen(G, L);
    o.cut = G.omelet.cut;
    o.open = G.omelet.open;
    o.tororo = G.omelet.tororo;
    o.ridge = G.omelet.ridge;
    const onPlate = G.omelet.place === 'plate';
    if (onPlate) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(L.plate.cx, L.plate.cy, L.plate.r * 0.97, L.plate.ry * 0.97, 0, 0, TAU);
      ctx.clip();
    }
    drawOmelet(ctx, o, G.variant.egg, t);
    if (onPlate) ctx.restore();
  }

  // --- 描いた絵（皿の上だけ） ---
  if (G.draw.strokes.length) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(L.plate.cx, L.plate.cy, L.plate.r * 0.96, L.plate.ry * 0.96, 0, 0, TAU);
    ctx.clip();
    for (const s of G.draw.strokes) drawLocalStroke(ctx, L.plate, s, G.variant.ketchup, 1);
    ctx.restore();
  }

  // --- 道具 ---
  const K = G.variant.ketchup;
  const E = G.variant.egg;
  const r = L.toolR;

  const cooking = !LATE[G.state];
  if (cooking) {
    if (G.state === S.MIX && !G.mix.done) attractGlow(ctx, G.spatula.x, G.spatula.y, r * 1.1, t);
    drawSpatula(ctx, G.spatula.x, G.spatula.y, r, G.spatula.angle);

    if (G.state === S.POUR && !G.egg.pouring && !G.egg.poured) attractGlow(ctx, G.bowl.x, G.bowl.y, r * 1.2, t);
    if (G.egg.pouring) drawPourStream(ctx, G, L, E);
    drawBowl(ctx, G.bowl.x, G.bowl.y, r, G.bowl.angle, E);
  }

  {
    if (G.state === S.KETCHUP && !G.ketchup.full && !G.bottle.grab) {
      attractGlow(ctx, G.bottle.x, G.bottle.y, r * 1.25, t);
    }
    if (G.bottle.flow > 0.05) drawSquirtStream(ctx, G, L, K);
    drawBottle(ctx, G.bottle.x, G.bottle.y, r, G.bottle.angle, K);
  }

  // --- 絵だけのボタン ---
  if (G.state === S.DRAW || G.state === S.MENU) {
    for (const b of L.buttons) {
      drawButton(ctx, b, t, G.pressed === b.id ? 1 : 0, G.state === S.MENU ? 1 : 0.45);
    }
  }

  // --- きらきら ---
  for (const s of G.sparkles) {
    const k = 1 - s.t / s.life;
    sparkle(ctx, s.x, s.y, s.r * (0.6 + k * 0.7), k * 0.9);
  }

  // --- 指でなぞる場所のヒント（DRAW の最初だけ、艶で誘う） ---
  if (G.state === S.DRAW && G.draw.strokes.length === 0) {
    const p = 0.5 + 0.5 * Math.sin(t * 2.2);
    ctx.save();
    ctx.globalAlpha = 0.10 + p * 0.10;
    const g = ctx.createRadialGradient(L.plate.cx, L.plate.cy, L.plate.r * 0.1, L.plate.cx, L.plate.cy, L.plate.r * 0.8);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(L.plate.cx, L.plate.cy, L.plate.r * 0.8, L.plate.ry * 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

// 中央へ寄せてほしいことを、光のさざ波で伝える（文字は使わない）
function gatherHint(ctx, F, G, t) {
  const p = (t * 0.55) % 1;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const q = (p + i / 3) % 1;
    const rr = lerp(0.95, 0.30, q);
    ctx.globalAlpha = 0.28 * Math.sin(q * Math.PI);
    ctx.strokeStyle = 'rgba(255,255,220,0.9)';
    ctx.lineWidth = Math.max(2, F.r * 0.035);
    ctx.beginPath();
    ctx.ellipse(F.cx, F.cy, F.r * rr, F.ry * rr, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPourStream(ctx, G, L, E) {
  const b = G.bowl;
  const F = L.pan;
  const x0 = b.x + Math.sin(b.angle) * L.toolR * 0.2;
  const y0 = b.y + L.toolR * 0.2;
  const x1 = F.cx, y1 = F.cy;
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.lineCap = 'round';
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, E.hi);
  g.addColorStop(1, E.mid);
  ctx.strokeStyle = g;
  ctx.lineWidth = Math.max(4, L.toolR * 0.28);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(lerp(x0, x1, 0.5) + Math.sin(G.time * 9) * L.toolR * 0.12, lerp(y0, y1, 0.5), x1, y1);
  ctx.stroke();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = 'rgba(255,255,225,0.9)';
  ctx.lineWidth = Math.max(1.5, L.toolR * 0.07);
  ctx.beginPath();
  ctx.moveTo(x0 - L.toolR * 0.05, y0);
  ctx.quadraticCurveTo(lerp(x0, x1, 0.5), lerp(y0, y1, 0.5), x1, y1);
  ctx.stroke();
  ctx.restore();
}

function drawSquirtStream(ctx, G, L, K) {
  const a = G.bottle.angle;
  const d = L.toolR * 1.85;
  const x = G.bottle.x - Math.sin(a) * d;
  const y = G.bottle.y + Math.cos(a) * d;
  const len = L.toolR * (0.35 + G.bottle.flow * 0.5);
  const pts = [
    { x, y },
    { x: x - Math.sin(a) * len * 0.6, y: y + Math.cos(a) * len * 0.6 },
    { x: x - Math.sin(a) * len, y: y + Math.cos(a) * len },
  ];
  glossyStroke(ctx, pts, L.toolR * 0.30 * G.bottle.flow + 2, K, { alpha: clamp(G.bottle.flow, 0, 1) });
}
