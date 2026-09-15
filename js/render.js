// 描画。すべて Canvas 2D。重い背景と板はオフスクリーンにキャッシュしてモバイルでも軽く。

import { TAU, clamp, lerp, rrect, platePath, smoothstep } from './util.js';
import { state } from './state.js';
import { sand } from './sand.js';
import { field, modeFromKnob, MODE_COUNT, DRIVERS } from './field.js';

export const KNOB_SWEEP = Math.PI * 5 / 3; // 300度

export function knobAngle(k) {
  return -Math.PI / 2 + (k - 0.5) * KNOB_SWEEP;
}

// ---------- 背景（実験台）キャッシュ ----------
let benchCanvas = null;
let benchKey = '';

function makeBench(w, h, dpr) {
  const key = w + 'x' + h + 'x' + dpr;
  if (benchKey === key && benchCanvas) return benchCanvas;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const g = c.getContext('2d');
  if (!g) return null;
  g.scale(dpr, dpr);

  const grd = g.createLinearGradient(0, 0, w * 0.3, h);
  grd.addColorStop(0, '#3a2a1d');
  grd.addColorStop(0.5, '#2c1f16');
  grd.addColorStop(1, '#1d150f');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);

  // 木目
  g.save();
  g.globalAlpha = 0.10;
  const step = Math.max(6, Math.min(w, h) * 0.022);
  for (let y = -step; y < h + step; y += step) {
    g.beginPath();
    g.moveTo(0, y);
    const seg = Math.max(3, Math.floor(w / 40));
    for (let i = 1; i <= seg; i++) {
      const x = (w * i) / seg;
      g.lineTo(x, y + Math.sin(i * 1.7 + y * 0.05) * step * 0.22);
    }
    g.lineWidth = Math.max(1, step * (0.08 + Math.random() * 0.22));
    g.strokeStyle = (y % (step * 2) < step) ? '#5a4029' : '#140d08';
    g.stroke();
  }
  g.restore();

  // 中央を少し明るく（照明）
  const vg = g.createRadialGradient(w * 0.5, h * 0.42, Math.min(w, h) * 0.1, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(255,238,205,0.13)');
  vg.addColorStop(0.55, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);

  benchCanvas = c;
  benchKey = key;
  return c;
}

// ---------- 金属板キャッシュ ----------
let plateCanvas = null;
let plateKey = '';
let platePad = 0;

function makePlate(kind, r, dpr) {
  const pad = Math.max(6, r * 0.14);
  const size = (r + pad) * 2;
  const key = kind + '|' + Math.round(r) + '|' + dpr;
  if (plateKey === key && plateCanvas) { platePad = pad; return plateCanvas; }
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(size * dpr));
  c.height = Math.max(1, Math.round(size * dpr));
  const g = c.getContext('2d');
  if (!g) return null;
  g.scale(dpr, dpr);
  const cx = size / 2, cy = size / 2;

  // 影
  g.save();
  g.translate(0, r * 0.05);
  platePath(g, kind, cx, cy, r * 1.01);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.filter = 'blur(' + Math.max(2, r * 0.05) + 'px)';
  g.fill();
  g.restore();

  // 本体
  g.save();
  platePath(g, kind, cx, cy, r);
  g.clip();
  const lg = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  lg.addColorStop(0, '#c9d2dc');
  lg.addColorStop(0.28, '#9ba5b1');
  lg.addColorStop(0.5, '#737d8a');
  lg.addColorStop(0.72, '#8d97a4');
  lg.addColorStop(1, '#565f6b');
  g.fillStyle = lg;
  g.fillRect(cx - r - 4, cy - r - 4, r * 2 + 8, r * 2 + 8);

  // ヘアライン
  g.globalAlpha = 0.10;
  g.lineWidth = 1;
  for (let i = 0; i < 46; i++) {
    const y = cy - r + (i / 46) * r * 2 + Math.random() * 2;
    g.strokeStyle = i % 2 ? '#ffffff' : '#404a55';
    g.beginPath();
    g.moveTo(cx - r - 4, y);
    g.lineTo(cx + r + 4, y + (Math.random() - 0.5) * 3);
    g.stroke();
  }
  g.globalAlpha = 1;

  // 反射のきらめき
  const rg = g.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx - r * 0.2, cy - r * 0.3, r * 1.4);
  rg.addColorStop(0, 'rgba(255,255,255,0.26)');
  rg.addColorStop(0.35, 'rgba(255,255,255,0.05)');
  rg.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = rg;
  g.fillRect(cx - r - 4, cy - r - 4, r * 2 + 8, r * 2 + 8);
  g.restore();

  // 縁のハイライトとベベル
  g.save();
  platePath(g, kind, cx, cy, r);
  g.lineWidth = Math.max(1.5, r * 0.035);
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.stroke();
  platePath(g, kind, cx, cy, r - Math.max(1.5, r * 0.035));
  g.lineWidth = Math.max(1, r * 0.02);
  g.strokeStyle = 'rgba(30,38,48,0.5)';
  g.stroke();
  g.restore();

  plateCanvas = c;
  plateKey = key;
  platePad = pad;
  return c;
}

// ---------- 部品ごとの描画 ----------

function drawHintRing(ctx, cx, cy, r, strength, t) {
  if (strength <= 0.01) return;
  const p = 0.5 + 0.5 * Math.sin(t * 3.2);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const rr = r * (1.06 + 0.16 * p);
  const g = ctx.createRadialGradient(cx, cy, r * 0.75, cx, cy, rr * 1.25);
  g.addColorStop(0, 'rgba(255,225,140,0)');
  g.addColorStop(0.65, 'rgba(255,220,130,' + (0.30 * strength) + ')');
  g.addColorStop(1, 'rgba(255,200,90,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, rr * 1.25, 0, TAU);
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.09);
  ctx.strokeStyle = 'rgba(255,232,170,' + (0.45 * strength * (0.5 + 0.5 * p)) + ')';
  ctx.beginPath();
  ctx.arc(cx, cy, rr, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function miniPlate(ctx, kind, cx, cy, r, active) {
  ctx.save();
  if (active) {
    // 装着中はラックが空 = 凹んで見える
    platePath(ctx, kind, cx, cy, r);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    platePath(ctx, kind, cx, cy, r * 0.97);
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(0, r * 0.12);
  platePath(ctx, kind, cx, cy, r);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fill();
  ctx.restore();
  platePath(ctx, kind, cx, cy, r);
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, '#e8edf3');
  g.addColorStop(0.45, '#aab4bf');
  g.addColorStop(1, '#727c88');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.stroke();
  ctx.restore();
}

function drawRack(ctx, L) {
  const rail = L.rackRail;
  if (rail) {
    rrect(ctx, rail.x, rail.y, rail.w, rail.h, Math.min(rail.w, rail.h) * 0.22);
    const g = ctx.createLinearGradient(rail.x, rail.y, rail.x, rail.y + rail.h);
    g.addColorStop(0, 'rgba(24,18,13,0.85)');
    g.addColorStop(1, 'rgba(58,44,32,0.85)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,220,170,0.12)';
    ctx.stroke();
  }
  for (let i = 0; i < L.rack.length; i++) {
    const it = L.rack[i];
    const active = it.kind === state.plate;
    const pulse = state.rackPulse[i] || 0;
    const wob = (state.hint === 'rack' && !active) ? Math.sin(state.hintPhase * 4 + i) * 0.06 * state.idleBoost : 0;
    ctx.save();
    ctx.translate(it.cx, it.cy);
    ctx.rotate(wob);
    ctx.scale(1 + pulse * 0.12, 1 + pulse * 0.12);
    ctx.translate(-it.cx, -it.cy);
    miniPlate(ctx, it.kind, it.cx, it.cy, it.r, active);
    ctx.restore();
    if (state.hint === 'rack' && !active) {
      drawHintRing(ctx, it.cx, it.cy, it.r * 1.15, 0.55 * state.idleBoost, state.hintPhase + i * 0.6);
    }
  }
}

function drawBowl(ctx, L) {
  const b = L.bowl;
  const tilt = state.bowlTilt;
  ctx.save();
  ctx.translate(b.cx, b.cy);
  const wob = state.hint === 'bowl' ? Math.sin(state.hintPhase * 3.4) * 0.07 * state.idleBoost : 0;
  ctx.rotate(tilt + wob);

  // 影
  ctx.save();
  ctx.translate(0, b.r * 0.42);
  ctx.scale(1, 0.32);
  ctx.beginPath();
  ctx.arc(0, 0, b.r * 1.05, 0, TAU);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  ctx.restore();

  // 器の外側
  ctx.beginPath();
  ctx.moveTo(-b.r, -b.r * 0.18);
  ctx.quadraticCurveTo(0, b.r * 1.05, b.r, -b.r * 0.18);
  ctx.closePath();
  const g = ctx.createLinearGradient(-b.r, -b.r * 0.2, b.r, b.r * 0.8);
  g.addColorStop(0, '#d9cdbb');
  g.addColorStop(0.45, '#b09d86');
  g.addColorStop(1, '#6d5f4e');
  ctx.fillStyle = g;
  ctx.fill();

  // 中の砂
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, -b.r * 0.18, b.r, b.r * 0.30, 0, 0, TAU);
  ctx.clip();
  ctx.fillStyle = '#2a2018';
  ctx.fillRect(-b.r, -b.r, b.r * 2, b.r * 2);
  ctx.beginPath();
  ctx.ellipse(0, b.r * 0.06, b.r * 0.86, b.r * 0.26, 0, 0, TAU);
  const sg = ctx.createLinearGradient(0, -b.r * 0.2, 0, b.r * 0.3);
  sg.addColorStop(0, '#f6ead1');
  sg.addColorStop(1, '#cbb896');
  ctx.fillStyle = sg;
  ctx.fill();
  ctx.restore();

  // 縁
  ctx.beginPath();
  ctx.ellipse(0, -b.r * 0.18, b.r, b.r * 0.30, 0, 0, TAU);
  ctx.lineWidth = Math.max(2, b.r * 0.10);
  ctx.strokeStyle = '#e4d9c7';
  ctx.stroke();
  ctx.lineWidth = Math.max(1, b.r * 0.04);
  ctx.strokeStyle = 'rgba(60,45,30,0.35)';
  ctx.stroke();
  ctx.restore();

  if (state.hint === 'bowl') {
    drawHintRing(ctx, b.cx, b.cy, b.r * 1.15, 0.8 * state.idleBoost, state.hintPhase);
  }
}

function drawKnob(ctx, L) {
  const k = L.knob;
  const r = k.r;
  const ang = knobAngle(state.knob);
  const m = modeFromKnob(state.knob);
  const on = state.knob >= 0.045;

  // 台座
  ctx.save();
  ctx.translate(k.cx, k.cy);

  ctx.beginPath();
  ctx.arc(0, r * 0.10, r * 1.30, 0, TAU);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, 0, r * 1.26, 0, TAU);
  const bg = ctx.createLinearGradient(0, -r, 0, r);
  bg.addColorStop(0, '#3c3430');
  bg.addColorStop(1, '#1b1613');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,220,170,0.14)';
  ctx.stroke();

  // ランプ列（何段階目か）
  const lamps = MODE_COUNT;
  for (let i = 0; i < lamps; i++) {
    const t = i / (lamps - 1);
    const a = knobAngle(0.045 + t * 0.955);
    const lx = Math.cos(a) * r * 1.07;
    const ly = Math.sin(a) * r * 1.07;
    const lit = on && i <= m.step;
    ctx.beginPath();
    ctx.arc(lx, ly, Math.max(2, r * 0.062), 0, TAU);
    if (lit) {
      ctx.fillStyle = '#ffd36b';
      ctx.shadowColor = 'rgba(255,190,60,0.9)';
      ctx.shadowBlur = r * 0.22;
    } else {
      ctx.fillStyle = 'rgba(90,80,70,0.85)';
      ctx.shadowBlur = 0;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // 目盛り
  ctx.lineWidth = Math.max(1, r * 0.035);
  ctx.strokeStyle = 'rgba(255,240,220,0.35)';
  for (let i = 0; i < lamps; i++) {
    const t = i / (lamps - 1);
    const a = knobAngle(0.045 + t * 0.955);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.90, Math.sin(a) * r * 0.90);
    ctx.lineTo(Math.cos(a) * r * 0.99, Math.sin(a) * r * 0.99);
    ctx.stroke();
  }

  // ノブ本体
  ctx.save();
  ctx.rotate(ang + Math.PI / 2);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, 0, TAU);
  const kg = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.06, 0, 0, r * 0.9);
  kg.addColorStop(0, '#8b949e');
  kg.addColorStop(0.45, '#4d545c');
  kg.addColorStop(1, '#22262b');
  ctx.fillStyle = kg;
  ctx.fill();
  // ローレット
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, 0, TAU);
  ctx.clip();
  ctx.lineWidth = Math.max(1, r * 0.035);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    ctx.strokeStyle = i % 2 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
    ctx.lineTo(Math.cos(a) * r * 0.84, Math.sin(a) * r * 0.84);
    ctx.stroke();
  }
  ctx.restore();
  // 指標
  ctx.beginPath();
  rrect(ctx, -r * 0.075, -r * 0.78, r * 0.15, r * 0.42, r * 0.07);
  ctx.fillStyle = on ? '#ffd870' : '#cfd6dd';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.24, 0, TAU);
  const cg = ctx.createRadialGradient(-r * 0.08, -r * 0.1, r * 0.02, 0, 0, r * 0.26);
  cg.addColorStop(0, '#9aa3ad');
  cg.addColorStop(1, '#2c3238');
  ctx.fillStyle = cg;
  ctx.fill();
  ctx.restore();

  ctx.restore();

  if (state.hint === 'knob') {
    drawHintRing(ctx, k.cx, k.cy, k.r * 1.32, 0.8 * state.idleBoost, state.hintPhase);
  }
}

function socketCenter(L, i) {
  return L.sockets[i] || L.sockets[0];
}

function drawSockets(ctx, L) {
  // ケーブル（プラグ → 板の下）
  const pa = state.plugAnim;
  const a = socketCenter(L, pa.from), b = socketCenter(L, pa.to);
  const t = smoothstep(pa.t);
  const px = lerp(a.cx, b.cx, t), py = lerp(a.cy, b.cy, t);
  const lift = Math.sin(Math.PI * t) * (L.plate.r * 0.35);

  for (let i = 0; i < L.sockets.length; i++) {
    const s = L.sockets[i];
    ctx.beginPath();
    ctx.arc(s.cx, s.cy, s.r, 0, TAU);
    const g = ctx.createRadialGradient(s.cx, s.cy - s.r * 0.3, s.r * 0.1, s.cx, s.cy, s.r);
    g.addColorStop(0, '#0a0908');
    g.addColorStop(0.7, '#171310');
    g.addColorStop(1, '#4a3d31');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, s.r * 0.16);
    ctx.strokeStyle = 'rgba(210,185,150,0.28)';
    ctx.stroke();
    const sp = state.socketPulse[i] || 0;
    if (sp > 0.01) {
      drawHintRing(ctx, s.cx, s.cy, s.r * 1.2, sp, state.hintPhase * 2);
    } else if (state.hint === 'socket' && i !== state.socket) {
      drawHintRing(ctx, s.cx, s.cy, s.r * 1.2, 0.5 * state.idleBoost, state.hintPhase + i * 0.5);
    }
  }

  // ケーブルの先はドライバの位置（板の下に隠れる）
  const dvr = (DRIVERS[state.plate] || DRIVERS.square)[state.socket] || [0, 0];
  const tx = L.plate.cx + dvr[0] * L.plate.r;
  const ty = L.plate.cy + dvr[1] * L.plate.r;
  ctx.beginPath();
  ctx.moveTo(px, py - lift);
  ctx.quadraticCurveTo(
    (px + tx) * 0.5 + (px - tx) * 0.12,
    (py - lift + ty) * 0.5 + L.plate.r * 0.22,
    tx, ty
  );
  ctx.lineWidth = Math.max(3, L.plate.r * 0.045);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.stroke();
  ctx.lineWidth = Math.max(2, L.plate.r * 0.030);
  ctx.strokeStyle = '#e8bf3a';
  ctx.stroke();

  // プラグ
  const pr = b.r * 0.72;
  ctx.save();
  ctx.translate(px, py - lift);
  ctx.beginPath();
  ctx.arc(0, pr * 0.25, pr * 1.02, 0, TAU);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, pr, 0, TAU);
  const pg = ctx.createRadialGradient(-pr * 0.35, -pr * 0.4, pr * 0.08, 0, 0, pr);
  pg.addColorStop(0, '#ffe9a0');
  pg.addColorStop(0.5, '#f2c33c');
  pg.addColorStop(1, '#a5771a');
  ctx.fillStyle = pg;
  ctx.fill();
  ctx.lineWidth = Math.max(1, pr * 0.14);
  ctx.strokeStyle = 'rgba(80,55,10,0.55)';
  ctx.stroke();
  ctx.restore();
}

function drawDriver(ctx, L, dx, dy) {
  const r = L.plate.r;
  const rr = Math.max(5, r * 0.11);
  ctx.save();
  ctx.beginPath();
  ctx.arc(dx, dy + rr * 0.3, rr * 1.35, 0, TAU);
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(dx, dy, rr, 0, TAU);
  const g = ctx.createRadialGradient(dx - rr * 0.35, dy - rr * 0.4, rr * 0.1, dx, dy, rr);
  g.addColorStop(0, '#5c646d');
  g.addColorStop(0.55, '#23282d');
  g.addColorStop(1, '#0d1013');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = Math.max(1, rr * 0.18);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.stroke();
  ctx.restore();
}

/** 砂粒の一辺（CSSpx）。DPR2 でおよそ 2.2〜3.6 物理px になるようにする */
function grainSize(R, dpr) {
  const d = dpr || 1;
  return Math.max(2.2, Math.min(3.6, R * d * 0.0145)) / d;
}

function drawSand(ctx, L, ox, oy, dpr) {
  const p = L.plate;
  const R = p.r;
  const cx = p.cx + ox, cy = p.cy + oy;
  const s = grainSize(R, dpr);
  const n = sand.n;
  const u = sand.u, v = sand.v, st = sand.st, life = sand.life;

  // 板の上の砂
  ctx.fillStyle = '#f7edd6';
  for (let i = 0; i < n; i++) {
    if (st[i] !== 0) continue;
    ctx.fillRect(cx + u[i] * R - s * 0.5, cy + v[i] * R - s * 0.5, s, s);
  }

  // 着地したてはキラッと大きめ
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < n; i++) {
    if (st[i] !== 0 || life[i] <= 0.35) continue;
    const ss = s * (1 + life[i] * 0.28);
    ctx.fillRect(cx + u[i] * R - ss * 0.5, cy + v[i] * R - ss * 0.5, ss, ss);
  }

  // 完成時のきらめき
  if (state.glow > 0.05) {
    ctx.globalAlpha = Math.min(1, state.glow * 2.4);
    ctx.fillStyle = '#fffdf2';
    const phase = (state.time * 0.04) | 0;
    for (let i = phase % 6; i < n; i += 6) {
      if (st[i] !== 0) continue;
      const ss = s * 1.25;
      ctx.fillRect(cx + u[i] * R - ss * 0.5, cy + v[i] * R - ss * 0.5, ss, ss);
    }
    ctx.globalAlpha = 1;
  }

  // こぼれ落ちる砂（寿命で3段階に分けて描画コールを抑える）
  const bands = [[0.66, 0.85], [0.33, 0.55], [0.0, 0.28]];
  for (let b = 0; b < 3; b++) {
    const lo = bands[b][0];
    const hi = b === 0 ? 2 : bands[b - 1][0];
    ctx.globalAlpha = bands[b][1];
    ctx.fillStyle = '#d8c9a6';
    for (let i = 0; i < n; i++) {
      if (st[i] !== 1) continue;
      const l = life[i];
      if (l < lo || l >= hi) continue;
      ctx.fillRect(cx + u[i] * R - s * 0.5, cy + v[i] * R - s * 0.5, s, s);
    }
  }
  ctx.globalAlpha = 1;
}

function drawPlateArea(ctx, L, dpr) {
  const p = L.plate;
  const ox = state.shakeX, oy = state.shakeY;
  const kind = state.plate;
  const cv = makePlate(kind, p.r, dpr);

  // 載せ替えアニメ: 上（縦）/左（横）からスライドしてくる
  let slide = 0;
  if (state.plateAnim.t < 1) {
    const t = smoothstep(state.plateAnim.t);
    slide = (1 - t);
  }
  const sx = L.portrait ? 0 : -slide * L.availW * 0.45;
  const sy = L.portrait ? -slide * L.availH * 0.45 : 0;

  const cx = p.cx + ox + sx;
  const cy = p.cy + oy + sy;

  if (cv) {
    const size = (p.r + platePad) * 2;
    ctx.drawImage(cv, cx - size / 2, cy - size / 2, size, size);
  }

  // ドライバ位置（板ローカル）
  const d = (DRIVERS[kind] || DRIVERS.square)[state.socket] || [0, 0];
  const dx = cx + d[0] * p.r;
  const dy = cy + d[1] * p.r;

  // 振動のリップル
  if (state.ripples.length) {
    ctx.save();
    platePath(ctx, kind, cx, cy, p.r * 0.985);
    ctx.clip();
    for (let i = 0; i < state.ripples.length; i++) {
      const rp = state.ripples[i];
      const rad = rp.t * p.r * 1.5;
      const al = Math.max(0, 1 - rp.t) * 0.22 * state.vib;
      if (al <= 0.002) continue;
      ctx.beginPath();
      ctx.arc(dx, dy, rad, 0, TAU);
      ctx.lineWidth = Math.max(1, p.r * 0.02);
      ctx.strokeStyle = 'rgba(255,255,255,' + al + ')';
      ctx.stroke();
    }
    ctx.restore();
  }

  drawDriver(ctx, L, dx, dy);

  // 砂
  drawSand(ctx, L, ox + sx, oy + sy, dpr);

  // 完成の光
  if (state.glow > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    platePath(ctx, kind, cx, cy, p.r);
    ctx.clip();
    const g = ctx.createRadialGradient(cx, cy, p.r * 0.05, cx, cy, p.r * 1.15);
    g.addColorStop(0, 'rgba(255,248,215,' + (0.42 * state.glow) + ')');
    g.addColorStop(0.6, 'rgba(255,225,150,' + (0.18 * state.glow) + ')');
    g.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - p.r, cy - p.r, p.r * 2, p.r * 2);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max(2, p.r * 0.03);
    ctx.strokeStyle = 'rgba(255,240,190,' + (0.6 * state.glow) + ')';
    platePath(ctx, kind, cx, cy, p.r * 1.01);
    ctx.stroke();
    ctx.restore();
  }
}

/** ボウルから板へ飛んでいる砂 */
function drawFlight(ctx, L, dpr) {
  const f = state.flight;
  if (!f.length) return;
  const s = grainSize(L.plate.r, dpr);
  ctx.fillStyle = '#f2e6cc';
  for (let i = 0; i < f.length; i++) {
    ctx.fillRect(f[i].x - s * 0.5, f[i].y - s * 0.5, s, s);
  }
}

export function render(ctx, L, dpr) {
  ctx.clearRect(0, 0, L.w, L.h);
  const bench = makeBench(L.w, L.h, dpr);
  if (bench) ctx.drawImage(bench, 0, 0, L.w, L.h);
  else { ctx.fillStyle = '#241a12'; ctx.fillRect(0, 0, L.w, L.h); }

  drawRack(ctx, L);
  drawSockets(ctx, L);
  drawPlateArea(ctx, L, dpr);
  drawBowl(ctx, L);
  drawFlight(ctx, L, dpr);
  drawKnob(ctx, L);
}
