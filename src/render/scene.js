// 1フレームぶんの絵。Canvas は1枚だけ。
import { TAU, clamp, lerp } from '../util.js';
import { drawTable } from './table.js';
import { drawPlateDish, drawPlateFood, drawLocalStroke } from './plate.js';
import { drawPan, drawEggLiquid } from './pan.js';
import { drawOmelet, RIDGE } from './egg.js';
import { drawBottle, drawSpatula, drawBowl } from './tools.js';
import { drawButton } from './buttons.js';
import { attractGlow, sparkle, glossyStroke, runnerLight } from './fx.js';
import { S, omeletScreen } from '../state.js';

const LATE = { [S.CUT]: 1, [S.OPEN]: 1, [S.DRAW]: 1, [S.MENU]: 1 };

// 的外れな操作が続いているほど、触るべき物の光を強める（0.9〜2.0倍）
const boostOf = (G) => 0.9 + clamp(G.miss, 0, 1.2) * 0.92;

export function render(ctx, G, L) {
  const t = G.time;
  const boost = boostOf(G);
  ctx.clearRect(0, 0, L.w, L.h);
  drawTable(ctx, L.w, L.h, G.variantId);

  // --- 皿 ---
  drawPlateDish(ctx, L.plate, G.variant);
  if ((G.state === S.KETCHUP || G.state === S.MIX) && G.miss > 0.4) {
    attractGlow(ctx, L.plate.cx, L.plate.cy, L.plate.r * 0.8, t, 'rgba(255,240,180,', boost);
  }
  drawPlateFood(ctx, L.plate, G, t);

  // --- フライパン（料理が皿へ移ったら静かに消える） ---
  if (G.panAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = G.panAlpha;
    if (G.state === S.SLIDE && G.omelet.place === 'pan') {
      attractGlow(ctx, L.pan.cx, L.pan.cy, L.pan.r * 0.9, t, 'rgba(255,240,180,', boost);
      slideHint(ctx, L, G, t);
    }
    if (G.state === S.GATHER && G.miss > 0.4) {
      attractGlow(ctx, L.pan.cx, L.pan.cy, L.pan.r * 0.95, t, 'rgba(255,240,180,', boost);
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
    if (G.state === S.CUT && G.omelet.cut === 0) {
      attractGlow(ctx, o.x, o.y, o.rx * 0.9, t, 'rgba(255,240,180,', boost);
    }
    drawOmelet(ctx, o, G.variant.egg, t);
    if (G.state === S.CUT && G.omelet.cut === 0) cutHint(ctx, o, t);
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
    if (G.state === S.MIX && !G.mix.done) attractGlow(ctx, G.spatula.x, G.spatula.y, r * 1.1, t, 'rgba(255,240,180,', boost);
    drawSpatula(ctx, G.spatula.x, G.spatula.y, r, G.spatula.angle);

    if (G.state === S.POUR && !G.egg.pouring && !G.egg.poured) attractGlow(ctx, G.bowl.x, G.bowl.y, r * 1.2, t);
    if (G.egg.pouring) drawPourStream(ctx, G, L, E);
    drawBowl(ctx, G.bowl.x, G.bowl.y, r, G.bowl.angle, E);
  }

  {
    if (G.state === S.KETCHUP && !G.ketchup.full && !G.bottle.grab) {
      attractGlow(ctx, G.bottle.x, G.bottle.y, r * 1.25, t, 'rgba(255,240,180,', boost);
    }
    // 流れの絵は「実際にケチャップが増えている」ときだけ（嘘のフィードバックを出さない）
    if (G.bottle.flow > 0.05 && t - G.ketchup.emit < 0.18 && !G.ketchup.full) {
      drawSquirtStream(ctx, G, L, K);
    }
    drawBottle(ctx, G.bottle.x, G.bottle.y, r, G.bottle.angle, K);
  }

  // --- 絵だけのボタン ---
  if (G.state === S.DRAW || G.state === S.MENU) {
    for (const b of L.buttons) {
      // 最初の一筆を描くまでは、光るのは皿だけ（誘いを1か所に集める）
      const glow = G.state === S.MENU ? 1 : (G.draw.strokes.length ? 0.45 : 0);
      drawButton(ctx, b, t, G.pressed === b.id ? 1 : 0, glow);
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

// 稜線どおりになぞればよいことを、端から端へ走る光点で伝える
function cutHint(ctx, o, t) {
  const from = { x: o.x + o.rx * RIDGE.ax, y: o.y - o.ry * RIDGE.ay };
  const to = { x: o.x + o.rx * RIDGE.ax, y: o.y + o.ry * RIDGE.ay };
  const ctrl = { x: o.x + o.rx * RIDGE.cx, y: o.y };
  runnerLight(ctx, from, to, ctrl, t, Math.max(6, o.rx * 0.18));
}

// フライパン→皿へ流れる光で「こっちへ倒す」を伝える
function slideHint(ctx, L, G, t) {
  const F = L.pan, P = L.plate;
  const p = (t * 0.6) % 1;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const q = (p + i / 3) % 1;
    const x = lerp(F.cx, P.cx, q * 0.75);
    const y = lerp(F.cy, P.cy, q * 0.75);
    ctx.globalAlpha = 0.26 * Math.sin(q * Math.PI) * (1 - G.pan.prog);
    ctx.strokeStyle = 'rgba(255,250,215,0.95)';
    ctx.lineWidth = Math.max(2, F.r * 0.05);
    ctx.beginPath();
    ctx.ellipse(x, y, F.r * 0.30, F.ry * 0.22, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
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
