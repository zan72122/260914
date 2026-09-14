'use strict';
// ---------- Characters ----------
// All drawing is in world units. A kid is ~3 units tall. y grows downward on screen (far = smaller y).
const COL = {
  skin: '#f6cfa6', skinDark: '#d9a97f', white: '#fbfbf7', red: '#e5322d', navy: '#2c3e63', shoe: '#3a3a3a',
  teacher: '#3f7cc7', sand: '#d5c298', sandDark: '#c8b283', line: 'rgba(255,255,255,0.85)'
};

// k: {x,y,h, fx,fy (facing unit), lean:{x,y}, crouch(0..1), run(0..1), phase, cap:'r'|'w'|'t', armL, armR (world pts), sit, scale, jump}
function drawKid(ctx, k) {
  const s = k.scale || 1;
  const x = k.x, gy = k.y, h = k.h || 0;
  const fx = k.fx === undefined ? 0 : k.fx, fy = k.fy === undefined ? 1 : k.fy;
  const px = -fy, py = fx; // perpendicular (right-hand side)
  const crouch = k.crouch || 0;
  const sit = !!k.sit;
  // shadow
  ctx.fillStyle = 'rgba(60,40,20,0.18)';
  ctx.beginPath(); ctx.ellipse(x, gy, 0.75 * s, 0.32 * s, 0, 0, TAU); ctx.fill();
  const y = gy - h;
  const legLen = sit ? 0.25 : (1.05 - 0.45 * crouch) * s;
  const hipY = y - legLen;
  const leanx = (k.lean ? k.lean.x : 0) * s, leany = (k.lean ? k.lean.y : 0) * s;
  const bodyLen = (1.15 - 0.15 * crouch) * s;
  const shX = x + leanx, shY = hipY - bodyLen + leany;
  // legs
  const run = k.run || 0, ph = k.phase || 0;
  ctx.lineCap = 'round';
  ctx.strokeStyle = COL.skin; ctx.lineWidth = 0.32 * s;
  if (!sit) {
    for (let i = -1; i <= 1; i += 2) {
      const sw = Math.sin(ph + (i > 0 ? 0 : Math.PI)) * 0.55 * run * s;
      const lift = Math.max(0, Math.cos(ph + (i > 0 ? 0 : Math.PI))) * 0.35 * run * s;
      const fxp = x + px * 0.28 * i * s + fx * sw, fyp = gy - h + py * 0.28 * i * 0.5 * s + fy * sw * 0.5 - lift;
      ctx.beginPath(); ctx.moveTo(x + px * 0.22 * i * s, hipY); ctx.lineTo(fxp, fyp - 0.15 * s); ctx.stroke();
      ctx.fillStyle = COL.shoe; ctx.beginPath(); ctx.ellipse(fxp, fyp - 0.08 * s, 0.26 * s, 0.16 * s, 0, 0, TAU); ctx.fill();
    }
  } else {
    // sitting: legs folded in front
    ctx.fillStyle = COL.navy; ctx.beginPath(); ctx.ellipse(x + fx * 0.35 * s, y - 0.1 * s + fy * 0.15 * s, 0.7 * s, 0.32 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = COL.shoe; ctx.beginPath(); ctx.ellipse(x + fx * 0.7 * s, y + fy * 0.25 * s, 0.32 * s, 0.16 * s, 0, 0, TAU); ctx.fill();
  }
  // shorts
  ctx.fillStyle = COL.navy;
  ctx.beginPath(); ctx.ellipse(x + leanx * 0.3, hipY + 0.05 * s + leany * 0.3, 0.55 * s, 0.4 * s, 0, 0, TAU); ctx.fill();
  // body (shirt)
  ctx.strokeStyle = COL.white; ctx.lineWidth = 1.0 * s;
  ctx.beginPath(); ctx.moveTo(x, hipY - 0.1 * s); ctx.lineTo(shX, shY + 0.1 * s); ctx.stroke();
  // sash for teacher
  if (k.cap === 't') { ctx.strokeStyle = COL.teacher; ctx.lineWidth = 1.0 * s; ctx.beginPath(); ctx.moveTo(x, hipY - 0.1 * s); ctx.lineTo(shX, shY + 0.1 * s); ctx.stroke(); }
  // arms
  const armLen = 1.15 * s;
  for (let i = -1; i <= 1; i += 2) {
    const sx = shX + px * 0.5 * i * s, sy = shY + py * 0.25 * i * s;
    const target = i < 0 ? k.armL : k.armR;
    let hx, hy;
    if (target) {
      const dx = target.x - sx, dy = target.y - sy, d = Math.hypot(dx, dy) || 1e-6;
      const L = Math.min(d, armLen * 1.05);
      hx = sx + dx / d * L; hy = sy + dy / d * L;
    } else if (run > 0.05) {
      const sw = Math.sin(ph + (i > 0 ? Math.PI : 0)) * 0.6 * run * s;
      hx = sx + fx * sw + px * 0.1 * i * s; hy = sy + 0.55 * s + fy * sw * 0.5 - Math.abs(sw) * 0.3;
    } else {
      hx = sx + px * 0.12 * i * s + leanx * 0.2; hy = sy + 0.95 * s + leany * 0.2;
    }
    // sleeve + arm
    ctx.strokeStyle = COL.white; ctx.lineWidth = 0.42 * s; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(lerp(sx, hx, 0.3), lerp(sy, hy, 0.3)); ctx.stroke();
    ctx.strokeStyle = COL.skin; ctx.lineWidth = 0.3 * s; ctx.beginPath(); ctx.moveTo(lerp(sx, hx, 0.25), lerp(sy, hy, 0.25)); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = COL.skin; ctx.beginPath(); ctx.arc(hx, hy, (target && target.open ? 0.24 : 0.19) * s, 0, TAU); ctx.fill();
    if (target && target.open) { ctx.strokeStyle = COL.skinDark; ctx.lineWidth = 0.06 * s; ctx.beginPath(); ctx.arc(hx, hy, 0.24 * s, 0, TAU); ctx.stroke(); }
  }
  // head
  const hr = 0.58 * s, hx = shX + fx * 0.05 * s, hy = shY - 0.62 * s;
  ctx.fillStyle = COL.skin; ctx.beginPath(); ctx.arc(hx, hy, hr, 0, TAU); ctx.fill();
  // hair (visible under cap at back)
  // cap
  const capCol = k.cap === 'r' ? COL.red : k.cap === 't' ? '#f4f1e6' : COL.white;
  const back = fy < -0.35;
  ctx.fillStyle = capCol;
  if (k.cap === 't') {
    // teacher: hat-ish (hair actually)
    ctx.fillStyle = '#4a3a2c'; ctx.beginPath(); ctx.arc(hx, hy - 0.05 * s, hr * 0.98, Math.PI, TAU); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(hx, hy - 0.04 * s, hr * 1.02, Math.PI * 1.0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx, hy - 0.06 * s, hr * 1.02, hr * 0.35, 0, 0, TAU); ctx.fill();
    // visor
    ctx.fillStyle = capCol; ctx.beginPath();
    ctx.ellipse(hx + fx * hr * 0.75, hy + fy * hr * 0.3 - 0.02 * s, hr * 0.55, hr * 0.25, Math.atan2(fy, fx), 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.05 * s; ctx.stroke();
  }
  // face
  if (!back) {
    const ex = hx + fx * hr * 0.35, ey = hy + fy * hr * 0.25 + 0.05 * s;
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath(); ctx.arc(ex + px * 0.2 * s, ey + py * 0.1 * s, 0.07 * s, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(ex - px * 0.2 * s, ey - py * 0.1 * s, 0.07 * s, 0, TAU); ctx.fill();
    if (k.smile) {
      ctx.strokeStyle = '#a04040'; ctx.lineWidth = 0.06 * s; ctx.beginPath();
      ctx.arc(ex, ey + 0.16 * s, 0.14 * s, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    } else if (k.shout) {
      ctx.fillStyle = '#a04040'; ctx.beginPath(); ctx.ellipse(ex, ey + 0.2 * s, 0.1 * s, 0.13 * s, 0, 0, TAU); ctx.fill();
    }
  }
}

// small seated spectator (cheap)
function drawSpectator(ctx, x, y, col, t) {
  ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y - 0.35, 0.55, 0.45, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = COL.skin; ctx.beginPath(); ctx.arc(x, y - 0.95 + Math.sin(t) * 0.03, 0.38, 0, TAU); ctx.fill();
}

// ---------- Props ----------
function drawShadow(ctx, x, y, rx, ry, a = 0.2) {
  ctx.fillStyle = `rgba(60,40,20,${a})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
}
function drawBigBall(ctx, x, y, h, r, rot, col) {
  drawShadow(ctx, x, y, r * 0.95, r * 0.4, 0.22 - Math.min(0.12, h * 0.015));
  const cy = y - h - r * 0.5;
  ctx.save(); ctx.translate(x, cy);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = col; ctx.fill();
  ctx.clip();
  // stripes for spin
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = r * 0.22;
  for (let i = 0; i < 3; i++) {
    const a = rot + i * TAU / 3;
    const cx = Math.cos(a) * r * 1.3, cyy = Math.sin(a) * r * 0.5;
    ctx.beginPath(); ctx.ellipse(cx, cyy, r * 0.95, r * 0.95, 0, 0, TAU); ctx.stroke();
  }
  // shading
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = g; ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}
function drawSmallBall(ctx, x, y, h, col, r = 0.42) {
  if (h > 0.05) drawShadow(ctx, x, y, r * 0.9, r * 0.4, 0.18);
  ctx.fillStyle = col === 'r' ? COL.red : '#fff'; ctx.beginPath(); ctx.arc(x, y - h - r * 0.6, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.05; ctx.stroke();
}
function drawCone(ctx, x, y, wob = 0) {
  drawShadow(ctx, x, y, 0.9, 0.35, 0.2);
  ctx.save(); ctx.translate(x, y); ctx.rotate(wob);
  ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(-0.75, 0); ctx.lineTo(0.75, 0); ctx.lineTo(0.12, -2.6); ctx.lineTo(-0.12, -2.6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-0.5, -1.0); ctx.lineTo(0.5, -1.0); ctx.lineTo(0.38, -1.5); ctx.lineTo(-0.38, -1.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#222'; ctx.fillRect(-0.95, -0.15, 1.9, 0.3);
  ctx.restore();
}
function drawPole(ctx, ax, ay, bx, by, h) {
  ctx.strokeStyle = 'rgba(60,40,20,0.18)'; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  ctx.strokeStyle = '#c9a36a'; ctx.lineWidth = 0.42; ctx.beginPath(); ctx.moveTo(ax, ay - h); ctx.lineTo(bx, by - h); ctx.stroke();
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 0.14; ctx.beginPath(); ctx.moveTo(ax, ay - h + 0.1); ctx.lineTo(bx, by - h + 0.1); ctx.stroke();
  ctx.fillStyle = '#e5322d'; ctx.beginPath(); ctx.arc(ax, ay - h, 0.3, 0, TAU); ctx.arc(bx, by - h, 0.3, 0, TAU); ctx.fill();
}
function drawBaton(ctx, x, y, h, ang, col) {
  drawShadow(ctx, x, y, 0.6, 0.25, 0.15);
  ctx.save(); ctx.translate(x, y - h); ctx.rotate(ang);
  ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(-0.75, -0.16, 1.5, 0.32, 0.16); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.05; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-0.55, -0.1, 1.1, 0.08);
  ctx.restore();
}
function drawFlagPole(ctx, x, y, H, col, wave) {
  ctx.strokeStyle = '#888'; ctx.lineWidth = 0.14; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - H); ctx.stroke();
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - H); ctx.lineTo(x + 2.2, y - H + 0.5 + Math.sin(wave) * 0.3); ctx.lineTo(x, y - H + 1.5); ctx.closePath(); ctx.fill();
}
function drawTent(ctx, x, y, w, d) {
  // white tent with red/white valance, seen from front-top
  ctx.fillStyle = 'rgba(60,40,20,0.15)'; ctx.fillRect(x - w / 2, y - d, w, d + 0.5);
  ctx.fillStyle = '#f7f7f2'; ctx.beginPath(); ctx.moveTo(x - w / 2, y - d); ctx.lineTo(x + w / 2, y - d); ctx.lineTo(x + w / 2 - 0.4, y - d - 2.2); ctx.lineTo(x, y - d - 3.2); ctx.lineTo(x - w / 2 + 0.4, y - d - 2.2); ctx.closePath(); ctx.fill();
  for (let i = 0; i < w; i += 1.2) {
    ctx.fillStyle = (Math.floor(i / 1.2) % 2) ? '#e5322d' : '#fff';
    ctx.beginPath(); ctx.moveTo(x - w / 2 + i, y - d); ctx.lineTo(x - w / 2 + Math.min(i + 1.2, w), y - d); ctx.lineTo(x - w / 2 + Math.min(i + 1.2, w), y - d + 0.6); ctx.lineTo(x - w / 2 + i + 0.6, y - d + 1.0); ctx.lineTo(x - w / 2 + i, y - d + 0.6); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = '#999'; ctx.lineWidth = 0.12;
  ctx.beginPath(); ctx.moveTo(x - w / 2 + 0.2, y - d); ctx.lineTo(x - w / 2 + 0.2, y); ctx.moveTo(x + w / 2 - 0.2, y - d); ctx.lineTo(x + w / 2 - 0.2, y); ctx.stroke();
}
function drawTree(ctx, x, y, r, t) {
  drawShadow(ctx, x + 0.5, y + 0.2, r * 1.1, r * 0.4, 0.15);
  ctx.strokeStyle = '#6b4b2a'; ctx.lineWidth = r * 0.28; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - r * 1.4); ctx.stroke();
  const sway = Math.sin(t * 0.7 + x) * 0.15;
  ctx.fillStyle = '#4c8a3a'; ctx.beginPath(); ctx.arc(x + sway, y - r * 2.0, r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5f9e47'; ctx.beginPath(); ctx.arc(x - r * 0.45 + sway, y - r * 1.7, r * 0.7, 0, TAU); ctx.arc(x + r * 0.5 + sway, y - r * 1.6, r * 0.65, 0, TAU); ctx.fill();
  ctx.fillStyle = '#79b85c'; ctx.beginPath(); ctx.arc(x - r * 0.2 + sway, y - r * 2.4, r * 0.55, 0, TAU); ctx.fill();
}
function drawBunting(ctx, x0, y0, x1, y1, t, seed) {
  // string of world flags, sagging
  const n = Math.max(3, Math.floor(dist(x0, y0, x1, y1) / 2.2));
  const cols = ['#e5322d', '#2b6cd1', '#f4c20d', '#fff', '#2eaa5a', '#f47b20'];
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.08; ctx.beginPath();
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + 2.5;
  ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
  for (let i = 1; i < n; i++) {
    const u = i / n, ax = lerp(lerp(x0, mx, u), lerp(mx, x1, u), u), ay = lerp(lerp(y0, my, u), lerp(my, y1, u), u);
    const f = Math.sin(t * 3 + i + seed) * 0.25;
    ctx.fillStyle = cols[(i + seed) % cols.length];
    ctx.beginPath(); ctx.moveTo(ax - 0.6, ay); ctx.lineTo(ax + 0.6, ay); ctx.lineTo(ax + 0.4 + f, ay + 1.3); ctx.lineTo(ax - 0.4 + f, ay + 1.3); ctx.closePath(); ctx.fill();
  }
}
function drawSchool(ctx, x, y, w) {
  // simple three-story school seen from the field (south face)
  const H = 7;
  ctx.fillStyle = 'rgba(60,40,20,0.18)'; ctx.fillRect(x - w / 2 + 0.5, y, w, 1.2);
  ctx.fillStyle = '#e9e4d6'; ctx.fillRect(x - w / 2, y - H, w, H);
  ctx.fillStyle = '#c9c1ad'; ctx.fillRect(x - w / 2, y - H - 0.6, w, 0.6);
  ctx.fillStyle = '#7fb3e6';
  for (let f = 0; f < 3; f++) for (let i = 1.2; i < w - 1.5; i += 2.4) ctx.fillRect(x - w / 2 + i, y - H + 0.8 + f * 2.2, 1.6, 1.1);
  ctx.fillStyle = '#a8a08c'; for (let f = 0; f < 3; f++) ctx.fillRect(x - w / 2, y - H + 2.05 + f * 2.2, w, 0.15);
  // clock
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - H - 1.6, 0.9, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#333'; ctx.lineWidth = 0.1; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - H - 1.6); ctx.lineTo(x, y - H - 2.2); ctx.moveTo(x, y - H - 1.6); ctx.lineTo(x + 0.5, y - H - 1.4); ctx.stroke();
  ctx.fillStyle = '#c9c1ad'; ctx.fillRect(x - 1.2, y - H - 0.9, 2.4, 0.9);
  // entrance
  ctx.fillStyle = '#5c4a3a'; ctx.fillRect(x - 1.5, y - 2.0, 3, 2.0);
}
