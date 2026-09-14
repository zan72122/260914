/* ---------- camera + scene rendering ---------- */
'use strict';
const K = 0.27;            // ellipse squash (viewed slightly from above)
const NA = 48, NH = 8;     // side coverage grid resolution

const CAM = { x: 0, y: 20, zoom: 4, tx: 0, ty: 20, tzoom: 4, anchor: .5, shake: 0, lerp: 3 };
let W = 0, H = 0, DPR = 1, PORTRAIT = true;
const PLAT = { deckY: 0, x0: 0, x1: 0, slots: [], chef: { x: 0, y: 0 }, dir: 1 };

function w2s(x, y) { return { x: W / 2 + (x - CAM.x) * CAM.zoom, y: H * CAM.anchor - (y - CAM.y) * CAM.zoom, z: CAM.zoom }; }
function s2w(sx, sy) { return { x: (sx - W / 2) / CAM.zoom + CAM.x, y: CAM.y - (sy - H * CAM.anchor) / CAM.zoom }; }
function sY(y) { return H * CAM.anchor - (y - CAM.y) * CAM.zoom; }

/* ---------- material patterns ---------- */
const PAT = {};
function buildPatterns(ctx) {
  PAT.crumb = ctx.createPattern(makePattern(96, 96, (g, w, h) => {
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${120 + rnd(60) | 0},${70 + rnd(40) | 0},${20 + rnd(30) | 0},${rnd(.08, .32)})`; g.beginPath(); g.arc(rnd(w), rnd(h), rnd(.8, 2.8), 0, TAU); g.fill(); }
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,240,200,${rnd(.08, .25)})`; g.beginPath(); g.arc(rnd(w), rnd(h), rnd(.6, 1.8), 0, TAU); g.fill(); }
  }), 'repeat');
  PAT.lace = ctx.createPattern(makePattern(64, 64, (g, w, h) => {
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const x = i * 16 + 8, y = j * 16 + 8;
      g.beginPath(); g.arc(x, y, 6, 0, TAU); g.stroke();
      g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x - 6, y); g.moveTo(x + 6, y); g.lineTo(x + 8, y); g.moveTo(x, y - 8); g.lineTo(x, y - 6); g.moveTo(x, y + 6); g.lineTo(x, y + 8); g.stroke();
    }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(i * 16, j * 16, 3, 0, TAU); g.stroke(); }
  }), 'repeat');
  PAT.gold = ctx.createPattern(makePattern(64, 64, (g, w, h) => {
    g.fillStyle = '#d9a83a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) { g.fillStyle = pick(['#f7dc7a', '#ffe9a0', '#c98f2a', '#f1c650', '#fff3c4']); g.beginPath(); g.moveTo(rnd(w), rnd(h)); for (let k = 0; k < 4; k++) g.lineTo(rnd(w), rnd(h)); g.closePath(); g.globalAlpha = rnd(.3, .9); g.fill(); }
  }), 'repeat');
  PAT.steel = ctx.createPattern(makePattern(8, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#b9bec6'); gr.addColorStop(.5, '#eef1f5'); gr.addColorStop(1, '#8e949c'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }), 'repeat');
}

/* ---------- background by altitude ---------- */
const SKY = [[-40, '#f3e0cf'], [0, '#f7e6d6'], [50, '#f8ebe0'], [95, '#dcebf6'], [160, '#a6cff0'], [240, '#f3c6cf'], [330, '#7c6bb3'], [460, '#2b2550']];
function skyColorAt(y) {
  if (y <= SKY[0][0]) return SKY[0][1];
  for (let i = 1; i < SKY.length; i++) if (y <= SKY[i][0]) { const t = (y - SKY[i - 1][0]) / (SKY[i][0] - SKY[i - 1][0]); return mixHex(SKY[i - 1][1], SKY[i][1], t); }
  return SKY[SKY.length - 1][1];
}
const CLOUDS = [], STARS = [], BIRDS = [];
(function initSky() {
  for (let i = 0; i < 34; i++) CLOUDS.push({ x: rnd(-260, 260), y: rnd(95, 330), s: rnd(10, 30), sp: rnd(1, 3), a: rnd(.5, .95) });
  for (let i = 0; i < 140; i++) STARS.push({ x: rnd(-400, 400), y: rnd(280, 700), s: rnd(.6, 1.8), tw: rnd(TAU) });
  for (let i = 0; i < 6; i++) BIRDS.push({ x: rnd(-300, 300), y: rnd(130, 230), v: rnd(6, 12) * (Math.random() < .5 ? -1 : 1), ph: rnd(TAU) });
})();

function drawBackground(ctx, time) {
  const yTop = s2w(0, 0).y, yBot = s2w(0, H).y;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, skyColorAt(yTop));
  for (const [y] of SKY) if (y > yBot && y < yTop) g.addColorStop(clamp((yTop - y) / (yTop - yBot), 0, 1), skyColorAt(y));
  g.addColorStop(1, skyColorAt(yBot));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // stars
  for (const s of STARS) if (s.y < yTop + 20 && s.y > yBot - 20) {
    const p = w2s(s.x * .5, s.y); const a = clamp((s.y - 250) / 80, 0, 1) * (.5 + .5 * Math.sin(time * 2 + s.tw));
    ctx.fillStyle = `rgba(255,255,240,${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, s.s * Math.max(.6, CAM.zoom / 6), 0, TAU); ctx.fill();
  }
  // kitchen wall tiles (low altitude)
  if (yBot < 80) {
    const tile = 12 * CAM.zoom; if (tile > 14) {
      ctx.strokeStyle = 'rgba(160,120,90,.12)'; ctx.lineWidth = 1;
      const y0 = sY(80), y1 = Math.min(H, sY(0));
      for (let y = y0; y < y1; y += tile) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      for (let x = (W / 2 - CAM.x * CAM.zoom) % tile; x < W; x += tile) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
    }
    // a big window far behind
    const wx = w2s(-95, 70), wy = sY(70), ww = 60 * CAM.zoom, wh = 55 * CAM.zoom;
    ctx.fillStyle = 'rgba(200,225,245,.55)'; ctx.fillRect(wx.x - ww / 2, wy, ww, wh);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = Math.max(2, 2 * CAM.zoom); ctx.strokeRect(wx.x - ww / 2, wy, ww, wh);
    ctx.beginPath(); ctx.moveTo(wx.x, wy); ctx.lineTo(wx.x, wy + wh); ctx.moveTo(wx.x - ww / 2, wy + wh / 2); ctx.lineTo(wx.x + ww / 2, wy + wh / 2); ctx.stroke();
  }
  // clouds
  for (const c of CLOUDS) if (c.y < yTop + 40 && c.y > yBot - 40) {
    const px = ((c.x + time * c.sp + 400) % 800) - 400;
    const p = w2s(px * .7, c.y); const r = c.s * CAM.zoom * .5;
    ctx.fillStyle = `rgba(255,255,255,${c.a * .85})`;
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.arc(p.x + k * r * .9, p.y + Math.abs(k) * r * .25, r * (1 - Math.abs(k) * .22), 0, TAU); ctx.fill(); }
  }
  // birds
  for (const b of BIRDS) if (b.y < yTop + 10 && b.y > yBot - 10) {
    const px = ((b.x + time * b.v + 300) % 600) - 300;
    const p = w2s(px * .8, b.y + Math.sin(time * 2 + b.ph) * 2); const s = 2 * CAM.zoom * .5, f = Math.sin(time * 9 + b.ph) * .6;
    ctx.strokeStyle = 'rgba(70,60,90,.6)'; ctx.lineWidth = Math.max(1, CAM.zoom * .25);
    ctx.beginPath(); ctx.moveTo(p.x - s, p.y - f * s); ctx.quadraticCurveTo(p.x - s * .4, p.y + s * .3, p.x, p.y); ctx.quadraticCurveTo(p.x + s * .4, p.y + s * .3, p.x + s, p.y - f * s); ctx.stroke();
  }
  // floor
  const fy = sY(-8);
  if (fy < H) {
    const fg = ctx.createLinearGradient(0, fy, 0, H); fg.addColorStop(0, '#c9b09a'); fg.addColorStop(1, '#8f7460');
    ctx.fillStyle = fg; ctx.fillRect(0, fy, W, H - fy);
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) { const y = fy + (H - fy) * Math.pow(i / 8, 1.6); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let i = -8; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * W / 10, fy); ctx.lineTo(W / 2 + i * W / 4, H); ctx.stroke(); }
  }
}

/* ---------- cake stand / turntable ---------- */
function drawStand(ctx, r, spin) {
  const p = w2s(0, 0), z = CAM.zoom;
  const R = (r + 6) * z, ry = R * K;
  // base foot
  ctx.fillStyle = '#7d7f86'; ctx.beginPath(); ctx.ellipse(p.x, sY(-8) + 2, R * .8, R * .8 * K, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#9ea2aa'; ctx.beginPath(); ctx.rect(p.x - R * .12, sY(-2), R * .24, sY(-8) - sY(-2) + 2); ctx.fill();
  // plate
  const pg = ctx.createLinearGradient(p.x - R, 0, p.x + R, 0); pg.addColorStop(0, '#9fa5ad'); pg.addColorStop(.35, '#eef1f5'); pg.addColorStop(.6, '#c3c8cf'); pg.addColorStop(1, '#8b9099');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.ellipse(p.x, sY(-2), R, ry, 0, 0, Math.PI); ctx.lineTo(p.x - R, sY(0)); ctx.ellipse(p.x, sY(0), R, ry, 0, Math.PI, TAU, true); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e7ebf0'; ctx.beginPath(); ctx.ellipse(p.x, sY(0), R, ry, 0, 0, TAU); ctx.fill();
  // spin marks
  ctx.strokeStyle = 'rgba(120,130,140,.5)'; ctx.lineWidth = Math.max(1, z * .3);
  for (let i = 0; i < 12; i++) { const a = spin + i * TAU / 12; ctx.beginPath(); ctx.moveTo(p.x + Math.sin(a) * R * .85, sY(0) + Math.cos(a) * ry * .85); ctx.lineTo(p.x + Math.sin(a) * R * .97, sY(0) + Math.cos(a) * ry * .97); ctx.stroke(); }
}

/* ---------- cylinder helpers ---------- */
function tierGeom(t) {
  const z = CAM.zoom, p = w2s(0, t.y0 + t.h);
  return { cx: p.x, top: p.y, bot: sY(t.y0), rx: t.r * z, ry: t.r * z * K, z };
}
// local side coords -> screen (th local angle rad, y world height)
function sideToScreen(t, th, y) {
  const g = tierGeom(t), a = th + G.cake.rot;
  return { x: g.cx + Math.sin(a) * g.rx, y: sY(y) + Math.cos(a) * g.ry, depth: Math.cos(a), g };
}
function screenToSide(t, sx, sy) {
  const g = tierGeom(t);
  const s = clamp((sx - g.cx) / g.rx, -1, 1), a = Math.asin(s);
  const y = t.y0 + (g.bot - (sy - Math.cos(a) * g.ry)) / (g.bot - g.top) * t.h;
  return { th: wrapAng(a - G.cake.rot), y, f: (y - t.y0) / t.h, a, inX: Math.abs((sx - g.cx) / g.rx) <= 1.15 };
}
function topToScreen(t, rho, phi) {
  const g = tierGeom(t), a = phi + G.cake.rot;
  return { x: g.cx + Math.sin(a) * rho * g.z, y: g.top + Math.cos(a) * rho * g.z * K, depth: Math.cos(a) };
}
function bodyPath(ctx, g, extraTop = 0) {
  ctx.beginPath();
  ctx.moveTo(g.cx - g.rx, g.top - extraTop);
  ctx.lineTo(g.cx - g.rx, g.bot);
  ctx.ellipse(g.cx, g.bot, g.rx, g.ry, 0, Math.PI, TAU, true);
  ctx.lineTo(g.cx + g.rx, g.top - extraTop);
  ctx.ellipse(g.cx, g.top - extraTop, g.rx, g.ry, 0, 0, Math.PI, false);
  ctx.closePath();
}
function sideGradient(ctx, g, color, gloss = .3, dark = -.28) {
  const gr = ctx.createLinearGradient(g.cx - g.rx, 0, g.cx + g.rx, 0);
  gr.addColorStop(0, shade(color, dark)); gr.addColorStop(.28, shade(color, gloss)); gr.addColorStop(.55, color); gr.addColorStop(1, shade(color, dark * 1.3));
  return gr;
}

/* ---------- draw one tier ---------- */
function drawTier(ctx, t, opts = {}) {
  const g = tierGeom(t), z = g.z, rot = G.cake.rot;
  if (g.top > H + 200 || g.bot < -200) return;
  const xr = t.xray || 0;
  // ---- internal structure (seen through x-ray) ----
  if (xr > 0) {
    ctx.save(); ctx.globalAlpha = xr;
    // cavity
    ctx.fillStyle = '#c99a5a'; bodyPath(ctx, g); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(g.cx - g.rx, g.top, g.rx * 2, g.bot - g.top);
    // dowels inside (hidden dowels that were cut flush)
    for (const d of t.dowels || []) { const p = topToScreen(t, d.rho, d.phi); drawDowel(ctx, p.x, p.y, g.bot - g.top, z, 1); }
    // jam seam inside a double-barrel tier
    if (t.jamSeam) { const y = g.bot - (g.bot - g.top) * t.jamSeam; ctx.fillStyle = '#c8324a'; ctx.beginPath(); ctx.ellipse(g.cx, y, g.rx, g.ry, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#c8324a'; ctx.fillRect(g.cx - g.rx, y, g.rx * 2, z * 1.6); }
    // central support rod passing through
    if (t.rodRef) { const R = t.rodRef, yTop = Math.min(t.y0 + t.h, R.topY), yBot = Math.max(t.y0, R.topY - R.depth * R.len); if (yBot < yTop) { const w = z * 3; const gr = ctx.createLinearGradient(g.cx - w, 0, g.cx + w, 0); gr.addColorStop(0, '#7f858d'); gr.addColorStop(.4, '#f1f4f8'); gr.addColorStop(1, '#5f656d'); ctx.fillStyle = gr; ctx.fillRect(g.cx - w, sY(yTop), w * 2, sY(yBot) - sY(yTop)); } }
    // board at bottom
    if (t.board) { ctx.fillStyle = '#d8c7a6'; ctx.beginPath(); ctx.ellipse(g.cx, g.bot, g.rx * .96, g.ry * .96, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#a58e63'; ctx.lineWidth = z * .6; ctx.stroke(); }
    ctx.restore();
  }
  const ga = xr > 0 ? 1 - .62 * xr : 1;
  // ---- side body ----
  ctx.save(); ctx.globalAlpha = ga;
  bodyPath(ctx, g);
  if (t.surface === 'sponge') {
    ctx.fillStyle = sideGradient(ctx, g, '#d9a35f', .2, -.32); ctx.fill();
    ctx.save(); ctx.clip(); ctx.globalAlpha = ga * .9; ctx.translate(rot * g.rx, 0); ctx.fillStyle = PAT.crumb; ctx.fillRect(g.cx - g.rx * 4, g.top - g.ry, g.rx * 8, g.bot - g.top + g.ry * 2); ctx.restore();
    // baked crust edge bands / layers
    ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(120,70,20,.28)'; ctx.lineWidth = z * 1.2;
    const nl = t.layers || 3; for (let i = 1; i < nl; i++) { const y = g.top + (g.bot - g.top) * i / nl; ctx.beginPath(); ctx.ellipse(g.cx, y, g.rx, g.ry, 0, 0, Math.PI); ctx.stroke(); ctx.strokeStyle = 'rgba(255,230,180,.55)'; ctx.lineWidth = z * .9; ctx.beginPath(); ctx.ellipse(g.cx, y + z * 1.4, g.rx, g.ry, 0, 0, Math.PI); ctx.stroke(); ctx.strokeStyle = 'rgba(120,70,20,.28)'; ctx.lineWidth = z * 1.2; }
    if (t.jamSeam) { ctx.save(); bodyPath(ctx, g); ctx.clip(); const y = g.bot - (g.bot - g.top) * t.jamSeam; ctx.strokeStyle = '#c8324a'; ctx.lineWidth = z * 1.8; ctx.beginPath(); ctx.ellipse(g.cx, y, g.rx, g.ry, 0, 0, Math.PI); ctx.stroke(); ctx.restore(); }
    ctx.restore();
  } else if (t.surface === 'cream') {
    ctx.fillStyle = sideGradient(ctx, g, t.creamColor, .18, -.16); ctx.fill();
  } else {
    ctx.fillStyle = sideGradient(ctx, g, t.fondant.color, .08, -.11); ctx.fill();
    // satin sheen
    ctx.save(); ctx.clip(); const sh = ctx.createLinearGradient(g.cx - g.rx, 0, g.cx + g.rx, 0);
    sh.addColorStop(.2, 'rgba(255,255,255,0)'); sh.addColorStop(.32, 'rgba(255,255,255,.22)'); sh.addColorStop(.46, 'rgba(255,255,255,0)'); ctx.fillStyle = sh; ctx.fillRect(g.cx - g.rx, g.top - g.ry, g.rx * 2, g.bot - g.top + g.ry * 2); ctx.restore();
  }
  // partial cream blobs over sponge
  if (t.creamGrid) drawGridBlobs(ctx, t, g, t.creamGrid, t.creamColor, ga);
  // ganache drips (partial pour)
  if (t.drips) drawDrips(ctx, t, g);
  // roughness texture on cream
  if (t.surface === 'cream' && t.rough) drawRough(ctx, t, g);
  // fondant wrinkles
  if (t.surface === 'fondant' && t.fondant.wrinkles) drawWrinkles(ctx, t, g);
  // gold leaf
  if (t.gold) drawGold(ctx, t, g, ga);
  // lace band
  if (t.lace && t.lace.alpha > 0) drawLace(ctx, t, g);
  // ruffles
  if (t.ruffles) drawRuffles(ctx, t, g);
  // ribbon
  if (t.ribbon) drawRibbon(ctx, t, g);
  // swags
  if (t.swags) drawSwags(ctx, t, g);
  // pearls (side)
  if (t.pearls) for (const p of sortDepth(t.pearls)) { const s = sideToScreen(t, p.th, p.y); if (s.depth < 0) continue; drawPearl(ctx, s.x, s.y, p.size * z * (0.7 + .3 * s.depth), p.color); }
  // flowers on side
  if (t.flowers) for (const f of sortDepth(t.flowers)) { const s = sideToScreen(t, f.th, f.y); if (s.depth < -.05) continue; drawFlower(ctx, s.x, s.y, f.size * z, f.color, f.bloom, s.depth); }
  ctx.restore();
  // ---- top surface ----
  ctx.save(); ctx.globalAlpha = ga;
  const topColor = t.surface === 'sponge' ? '#e3b26f' : t.surface === 'cream' ? t.creamColor : t.fondant.color;
  ctx.fillStyle = shade(topColor, .12);
  ctx.beginPath(); ctx.ellipse(g.cx, g.top, g.rx, g.ry, 0, 0, TAU); ctx.fill();
  if (t.surface === 'sponge') { ctx.save(); ctx.clip(); ctx.globalAlpha = .7; ctx.fillStyle = PAT.crumb; ctx.fillRect(g.cx - g.rx, g.top - g.ry, g.rx * 2, g.ry * 2); ctx.restore(); }
  else { const tg = ctx.createRadialGradient(g.cx - g.rx * .3, g.top - g.ry * .3, 0, g.cx, g.top, g.rx); tg.addColorStop(0, 'rgba(255,255,255,.35)'); tg.addColorStop(1, 'rgba(0,0,0,.08)'); ctx.fillStyle = tg; ctx.fill(); }
  // top paint (jam / filling)
  if (t.topGrid) drawTopGrid(ctx, t, g);
  // imprint ring & marks
  if (t.imprint) {
    ctx.strokeStyle = 'rgba(120,80,40,.35)'; ctx.lineWidth = Math.max(1.5, z * .5); ctx.setLineDash([z * 2, z * 1.5]);
    ctx.beginPath(); ctx.ellipse(g.cx, g.top, t.imprint * z, t.imprint * z * K, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
  if (t.marks) for (const m of t.marks) if (!m.filled) {
    const p = topToScreen(t, m.rho, m.phi), pulse = .6 + .4 * Math.sin(G.time * 5 + m.phi);
    ctx.fillStyle = `rgba(90,60,30,${.35 + .2 * pulse})`; ctx.beginPath(); ctx.ellipse(p.x, p.y, z * 2.6, z * 2.6 * K, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${.5 * pulse})`; ctx.lineWidth = z * .5; ctx.beginPath(); ctx.ellipse(p.x, p.y, z * (4 + pulse * 1.5), z * (4 + pulse * 1.5) * K, 0, 0, TAU); ctx.stroke();
  }
  // pillar sockets
  if (t.sockets) for (const s of t.sockets) if (!s.filled) {
    const p = topToScreen(t, s.rho, s.phi), pulse = .6 + .4 * Math.sin(G.time * 5 + s.phi);
    ctx.fillStyle = 'rgba(80,90,110,.55)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, z * 3, z * 3 * K, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(150,220,255,${.6 * pulse})`; ctx.lineWidth = z * .6; ctx.beginPath(); ctx.ellipse(p.x, p.y, z * (4.5 + pulse * 1.5), z * (4.5 + pulse * 1.5) * K, 0, 0, TAU); ctx.stroke();
  }
  // dowels sticking out
  if (t.dowels) for (const d of sortDepth(t.dowels, 'phi')) if (d.out > 0.01) { const p = topToScreen(t, d.rho, d.phi); drawDowel(ctx, p.x, p.y, d.out * z, z, d.out < .5 ? .8 : 1); }
  // rod head (center support)
  if (t.rod) drawRod(ctx, t, g);
  // top decorations
  if (t.topDeco) for (const d of t.topDeco) { const p = topToScreen(t, d.rho, d.phi); if (d.kind === 'flower') drawFlower(ctx, p.x, p.y, d.size * z, d.color, 1, 1); else drawPearl(ctx, p.x, p.y, d.size * z, d.color); }
  // sugar snow dusting
  if (t.sugar > 0) { ctx.save(); ctx.globalAlpha = t.sugar; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.ellipse(g.cx, g.top, g.rx, g.ry, 0, 0, TAU); ctx.fill(); for (let i = 0; i < 220; i++) { const a = hash(i * 3) * TAU; if (Math.cos(a) < 0) continue; const x = g.cx + Math.sin(a) * g.rx * (1 + hash(i * 7) * .03), y = g.top + Math.cos(a) * g.ry + Math.pow(hash(i * 11), 2.2) * (g.bot - g.top) * .5; ctx.globalAlpha = t.sugar * (0.35 + .65 * hash(i)); ctx.beginPath(); ctx.arc(x, y, z * (.12 + hash(i * 5) * .3), 0, TAU); ctx.fill(); } ctx.restore(); }
  // pillars standing on top
  if (t.pillars) for (const pl of sortDepth(t.pillars, 'phi')) if (pl.up > 0) { const p = topToScreen(t, pl.rho, pl.phi); drawPillar(ctx, p.x, p.y, pl.h * pl.up * z, z); }
  ctx.restore();
  // ---- fondant skirt hanging below bottom ----
  if (t.surface === 'fondant' && t.fondant.skirt > 0) drawSkirt(ctx, t, g);
}
function sortDepth(list, key = 'th') { return list.slice().sort((a, b) => Math.cos(a[key] + G.cake.rot) - Math.cos(b[key] + G.cake.rot)); }

function drawGridBlobs(ctx, t, g, grid, color, ga, pattern) {
  ctx.save(); bodyPath(ctx, g); ctx.clip();
  const cw = TAU / grid.na, hh = (g.bot - g.top) / grid.nh;
  for (let a = 0; a < grid.na; a++) {
    const th = (a + .5) * cw - Math.PI, ang = th + G.cake.rot, c = Math.cos(ang);
    if (c < .04) continue;
    const x = g.cx + Math.sin(ang) * g.rx, w = cw * g.rx * c * .95 + 1.5;
    for (let j = 0; j < grid.nh; j++) {
      const v = grid.v[a + j * grid.na]; if (v <= .02) continue;
      const y = g.top + (grid.nh - j - .5) * hh + c * g.ry;
      ctx.globalAlpha = ga * clamp(v * 1.4, 0, 1);
      if (pattern) { ctx.fillStyle = pattern; ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.ellipse(0, 0, w * .8, hh * .75, hash(a * 7 + j) * .8 - .4, 0, TAU); ctx.fill(); ctx.restore(); }
      else { const jx = (hash(a * 31 + j * 7) - .5) * w * .5, jy = (hash(a * 17 + j * 3) - .5) * hh * .5; ctx.fillStyle = shade(color, .04 - .1 * (1 - c)); ctx.beginPath(); ctx.ellipse(x + jx, y + jy, w * .95, hh * .85, hash(a + j * 9) - .5, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.ellipse(x + jx - w * .2, y + jy - hh * .25, w * .4, hh * .28, 0, 0, TAU); ctx.fill(); }
    }
  }
  ctx.restore();
}
function drawGold(ctx, t, g, ga) {
  const grid = t.gold, cw = TAU / grid.na, hh = (g.bot - g.top) / grid.nh;
  for (const [lo, hi, al] of [[.08, .3, .45], [.3, 9, 1]]) { // sparse flakes, then solid leaf
    ctx.save(); bodyPath(ctx, g); ctx.clip(); ctx.beginPath(); let any = false;
    for (let a = 0; a < grid.na; a++) {
      const th = (a + .5) * cw - Math.PI, ang = th + G.cake.rot, c = Math.cos(ang); if (c < .04) continue;
      const x = g.cx + Math.sin(ang) * g.rx, w = cw * g.rx * c * .95 + 1.5;
      for (let j = 0; j < grid.nh; j++) {
        const v = grid.v[a + j * grid.na]; if (v < lo || v >= hi) continue;
        const y = g.top + (grid.nh - j - .5) * hh + c * g.ry, jx = (hash(a * 31 + j * 7) - .5) * w * .4;
        ctx.moveTo(x + jx + w, y); ctx.ellipse(x + jx, y, w * .95, hh * .8, hash(a + j * 9) - .5, 0, TAU); any = true;
      }
    }
    if (any) { ctx.clip(); ctx.globalAlpha = ga * al; ctx.translate(G.cake.rot * g.rx, 0); ctx.fillStyle = PAT.gold; ctx.fillRect(g.cx - g.rx * 6, g.top - g.ry, g.rx * 12, g.bot - g.top + g.ry * 2); ctx.globalAlpha = ga * al * .5; ctx.fillStyle = sideGradient(ctx, g, '#e0b040', .5, -.5); ctx.translate(-G.cake.rot * g.rx, 0); ctx.fillRect(g.cx - g.rx, g.top - g.ry, g.rx * 2, g.bot - g.top + g.ry * 2); }
    ctx.restore();
  }
}
function drawTopGrid(ctx, t, g) {
  const grid = t.topGrid; ctx.save(); ctx.beginPath(); ctx.ellipse(g.cx, g.top, g.rx, g.ry, 0, 0, TAU); ctx.clip();
  const cw = TAU / grid.na;
  for (let a = 0; a < grid.na; a++) for (let j = 0; j < grid.nh; j++) {
    const v = grid.v[a + j * grid.na]; if (v <= .02) continue;
    const rho = (j + .5) / grid.nh * t.r, p = topToScreen(t, rho, (a + .5) * cw - Math.PI);
    const rr = (t.r / grid.nh) * g.z * .8 + cw * rho * g.z * .5;
    ctx.globalAlpha = clamp(v * 1.5, 0, 1); ctx.fillStyle = t.topColor; ctx.beginPath(); ctx.ellipse(p.x, p.y, rr, rr * K * 1.3, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function drawRough(ctx, t, g) {
  ctx.save(); bodyPath(ctx, g); ctx.clip();
  const cw = TAU / NA;
  for (let a = 0; a < NA; a++) {
    const v = t.rough[a]; if (v <= .03) continue;
    const th = (a + .5) * cw - Math.PI, ang = th + G.cake.rot, c = Math.cos(ang); if (c < .05) continue;
    const x = g.cx + Math.sin(ang) * g.rx, w = cw * g.rx * c;
    ctx.globalAlpha = clamp(v, 0, 1) * .9;
    for (let k = 0; k < 5; k++) {
      const yy = g.top + (g.bot - g.top) * ((k + hash(a * 13 + k)) / 5) + c * g.ry;
      ctx.fillStyle = k % 2 ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.22)';
      ctx.beginPath(); ctx.ellipse(x + (hash(a + k * 3) - .5) * w, yy, w * .42, g.z * (2.5 + hash(a * 5 + k) * 3), (hash(a * 9 + k) - .5) * .3, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}
function drawWrinkles(ctx, t, g) {
  ctx.save(); bodyPath(ctx, g); ctx.clip();
  for (const w of t.fondant.wrinkles) {
    if (w.amp <= .02) continue;
    const s0 = sideToScreen(t, w.th, t.y0 + t.h - w.y), s1 = sideToScreen(t, w.th + w.tilt, t.y0 + t.h - w.y - w.len);
    if (s0.depth < .05) continue;
    ctx.globalAlpha = clamp(w.amp, 0, 1) * s0.depth; ctx.lineCap = 'round';
    ctx.lineWidth = g.z * (2.2 + w.amp * 2.5);
    ctx.strokeStyle = 'rgba(90,60,70,.10)'; ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.quadraticCurveTo((s0.x + s1.x) / 2 + w.bend * g.z, (s0.y + s1.y) / 2, s1.x, s1.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = g.z * (1 + w.amp); ctx.beginPath(); ctx.moveTo(s0.x - g.z * 1.4, s0.y); ctx.quadraticCurveTo((s0.x + s1.x) / 2 + w.bend * g.z - g.z * 1.4, (s0.y + s1.y) / 2, s1.x - g.z * 1.4, s1.y); ctx.stroke();
  }
  ctx.restore();
}
function drawSkirt(ctx, t, g) {
  const f = t.fondant, len = f.skirt * f.skirtLen * g.z, fall = f.skirtFall || 0;
  ctx.save(); ctx.globalAlpha = 1 - fall;
  const y0 = g.bot + fall * fall * 400 * g.z * .3;
  ctx.fillStyle = shade(f.color, -.08);
  ctx.beginPath(); ctx.ellipse(g.cx, y0, g.rx, g.ry, 0, Math.PI, TAU, true);
  const n = 22;
  for (let i = 0; i <= n; i++) { const a = Math.PI + (i / n) * Math.PI; const x = g.cx + Math.cos(a) * g.rx * (1 + .07 * Math.sin(i * 2.1 + t.y0)), y = y0 - Math.sin(a) * g.ry * (1 + .1) + len * (.85 + .15 * Math.sin(i * 1.7 + t.y0)); ctx.lineTo(x, y); }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = g.z * .8;
  for (let i = 1; i < n; i += 2) { const a = Math.PI + (i / n) * Math.PI; const x = g.cx + Math.cos(a) * g.rx, y = y0 - Math.sin(a) * g.ry; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * g.rx * .05, y + len * .9); ctx.stroke(); }
  ctx.restore();
}
function drawDrips(ctx, t, g) {
  ctx.save(); bodyPath(ctx, g); ctx.clip();
  for (const d of t.drips) {
    const s = sideToScreen(t, d.th, t.y0 + t.h); if (s.depth < .05) continue;
    const w = d.w * g.z * (.6 + .4 * s.depth), len = d.len * g.z;
    ctx.fillStyle = t.creamColor; ctx.globalAlpha = .96;
    ctx.beginPath(); ctx.moveTo(s.x - w, s.y - g.ry * 2); ctx.lineTo(s.x - w, s.y + len - w); ctx.arc(s.x, s.y + len - w, w, Math.PI, 0, true); ctx.lineTo(s.x + w, s.y - g.ry * 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.ellipse(s.x - w * .35, s.y + len * .5, w * .25, len * .4, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function drawLace(ctx, t, g) {
  const L = t.lace; ctx.save(); bodyPath(ctx, g); ctx.clip();
  ctx.globalAlpha = L.alpha;
  const y0 = g.top + (g.bot - g.top) * L.f0 + g.ry * .4, y1 = g.top + (g.bot - g.top) * L.f1 + g.ry * .6;
  const cw = TAU / NA;
  for (let a = 0; a < NA; a++) {
    const v = L.grid.v[a]; if (v <= .03) continue;
    const th = (a + .5) * cw - Math.PI, ang = th + G.cake.rot, c = Math.cos(ang); if (c < .04) continue;
    const x = g.cx + Math.sin(ang) * g.rx, w = cw * g.rx * c;
    ctx.save(); ctx.globalAlpha = L.alpha * clamp(v, 0, 1) * (.4 + .6 * c);
    ctx.beginPath(); ctx.rect(x - w / 2 - .5, y0, w + 1, y1 - y0); ctx.clip();
    ctx.translate(x - (th * g.rx), y0); ctx.scale(g.z * .28, g.z * .28); ctx.fillStyle = PAT.lace; ctx.fillRect(-2000, 0, 4000, (y1 - y0) / (g.z * .28)); ctx.restore();
  }
  // scalloped edge
  ctx.globalAlpha = L.alpha; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = g.z * .5;
  ctx.beginPath(); for (let i = 0; i <= 40; i++) { const ang = -Math.PI / 2 + i / 40 * Math.PI; const x = g.cx + Math.sin(ang) * g.rx, y = y1 + Math.cos(ang) * g.ry * 0 + (i % 2 ? g.z * 1.5 : 0); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
  ctx.restore();
}
function drawRuffles(ctx, t, g) {
  ctx.save(); bodyPath(ctx, g); ctx.clip();
  for (const r of t.ruffles) {
    const yb = g.top + (g.bot - g.top) * (1 - r.f), hgt = r.hgt * g.z, col = r.color;
    const n = Math.round(14 + r.freq * 14); // scallops across the front
    // pleated strip: wavy top edge, scalloped bottom edge
    for (let pass = 0; pass < 2; pass++) {
      ctx.fillStyle = pass ? shade(col, .1) : shade(col, -.22);
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) { const ang = -Math.PI / 2 + i / 60 * Math.PI, x = g.cx + Math.sin(ang) * g.rx, yy = yb + Math.cos(ang) * g.ry - hgt + Math.sin(i * .9 * r.freq + r.ph) * r.amp * g.z * .5 + (pass ? g.z * 1.2 : 0); i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
      for (let i = n; i >= 0; i--) {
        const a0 = -Math.PI / 2 + i / n * Math.PI, a1 = -Math.PI / 2 + (i - 1) / n * Math.PI;
        const x0 = g.cx + Math.sin(a0) * g.rx, y0 = yb + Math.cos(a0) * g.ry, x1 = g.cx + Math.sin(a1) * g.rx, y1 = yb + Math.cos(a1) * g.ry;
        const bulge = (r.amp * 1.4 + 1.2) * g.z * (0.7 + .3 * Math.sin(i * 2.3 + r.ph)) * (pass ? .8 : 1);
        ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + bulge, x1, y1);
      }
      ctx.closePath(); ctx.fill();
    }
    // pleat shading: curved folds between scallops
    ctx.strokeStyle = 'rgba(0,0,0,.10)'; ctx.lineWidth = Math.max(1, g.z * .6);
    for (let i = 1; i < n; i++) { const a = -Math.PI / 2 + i / n * Math.PI, x = g.cx + Math.sin(a) * g.rx, yy = yb + Math.cos(a) * g.ry; ctx.beginPath(); ctx.moveTo(x + Math.sin(i + r.ph) * g.z * 1.2, yy - hgt + g.z); ctx.quadraticCurveTo(x - g.z * 1.5, yy - hgt * .5, x, yy - g.z * .5); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1, g.z * .5);
    for (let i = 1; i < n; i++) { const a = -Math.PI / 2 + (i - .5) / n * Math.PI, x = g.cx + Math.sin(a) * g.rx, yy = yb + Math.cos(a) * g.ry; ctx.beginPath(); ctx.moveTo(x, yy - hgt + g.z * 2); ctx.lineTo(x + g.z * .5, yy - g.z * 2); ctx.stroke(); }
  }
  ctx.restore();
}
function drawRibbon(ctx, t, g) {
  const R = t.ribbon; if (R.progress <= 0) return;
  ctx.save(); bodyPath(ctx, g); ctx.clip();
  const y = g.top + (g.bot - g.top) * (1 - R.f), hh = R.w * g.z;
  const n = 64; ctx.fillStyle = sideGradient(ctx, g, R.color, .35, -.35);
  const start = R.start + G.cake.rot; // start angle (view)
  ctx.beginPath(); let started = false;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = start + i / n * TAU * R.progress; if (Math.cos(a) < 0) { if (started) { pts.push(null); } continue; }
    pts.push({ x: g.cx + Math.sin(a) * g.rx, y: y + Math.cos(a) * g.ry }); started = true;
  }
  // draw as segments (may be split by the back side)
  let seg = [];
  const flush = () => { if (seg.length < 2) { seg = []; return; } ctx.beginPath(); ctx.moveTo(seg[0].x, seg[0].y - hh / 2); for (const p of seg) ctx.lineTo(p.x, p.y - hh / 2); for (let i = seg.length - 1; i >= 0; i--) ctx.lineTo(seg[i].x, seg[i].y + hh / 2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = g.z * .4; ctx.beginPath(); for (let i = 0; i < seg.length; i++) { const p = seg[i]; i ? ctx.lineTo(p.x, p.y - hh * .3) : ctx.moveTo(p.x, p.y - hh * .3); } ctx.stroke(); seg = []; };
  for (const p of pts) { if (!p) { flush(); continue; } seg.push(p); } flush();
  ctx.restore();
  // dangling ends / bow at front
  const s = sideToScreen(t, R.start, t.y0 + t.h * R.f);
  if (s.depth > 0) {
    if (R.bow > 0) drawBow(ctx, s.x, s.y, R.w * g.z * 1.6 * R.bow, R.color);
    else if (R.progress >= 1) {
      const pulse = 1 + .15 * Math.sin(G.time * 5);
      ctx.fillStyle = R.color; ctx.save(); ctx.translate(s.x, s.y);
      ctx.beginPath(); ctx.moveTo(-hh * .5, 0); ctx.lineTo(-hh * .5 - hh * .6 * pulse, hh * 2.2); ctx.lineTo(-hh * .1, hh * 1.8); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(hh * .5, 0); ctx.lineTo(hh * .5 + hh * .6 * pulse, hh * 2.2); ctx.lineTo(hh * .1, hh * 1.8); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else { ctx.fillStyle = R.color; ctx.fillRect(s.x - hh * .2, s.y - hh / 2, hh * .4, hh); }
  }
}
function drawBow(ctx, x, y, s, color) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = shade(color, -.1);
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(d * s * .6, -s * .9, d * s * 1.5, -s * .3, d * s * 1.2, s * .1); ctx.bezierCurveTo(d * s * .9, s * .5, d * s * .3, s * .3, 0, 0); ctx.fill(); }
  ctx.fillStyle = shade(color, -.25);
  for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, s * .1); ctx.lineTo(d * s * .5, s * 1.3); ctx.lineTo(d * s * .15, s * 1.15); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = shade(color, .25); ctx.beginPath(); ctx.ellipse(0, 0, s * .3, s * .26, 0, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawSwags(ctx, t, g) {
  ctx.save(); bodyPath(ctx, g); ctx.clip();
  for (const s of t.swags) {
    const a = sideToScreen(t, s.th0, s.y0), b = sideToScreen(t, s.th1, s.y1); if (a.depth < 0 && b.depth < 0) continue;
    const mx = (a.x + b.x) / 2, my = Math.max(a.y, b.y) + s.droop * g.z;
    ctx.strokeStyle = s.color; ctx.lineWidth = g.z * 3.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my + s.droop * g.z * .6, b.x, b.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = g.z * 1; ctx.beginPath(); ctx.moveTo(a.x, a.y - g.z * .8); ctx.quadraticCurveTo(mx, my + s.droop * g.z * .6 - g.z * .8, b.x, b.y - g.z * .8); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = g.z * .6; for (let i = 1; i < 6; i++) { const u = i / 6, px = lerp(lerp(a.x, mx, u), lerp(mx, b.x, u), u), py = lerp(lerp(a.y, my + s.droop * g.z * .6, u), lerp(my + s.droop * g.z * .6, b.y, u), u); ctx.beginPath(); ctx.moveTo(px, py - g.z * 1.4); ctx.lineTo(px + g.z * .3, py + g.z * 1.2); ctx.stroke(); }
  }
  ctx.restore();
  for (const s of t.swags) { for (const [th, y] of [[s.th0, s.y0], [s.th1, s.y1]]) { const p = sideToScreen(t, th, y); if (p.depth > 0) drawPearl(ctx, p.x, p.y, g.z * 1.3, '#f7e2b0'); } }
}
function drawPearl(ctx, x, y, r, color = '#fdf6ec') {
  const gr = ctx.createRadialGradient(x - r * .35, y - r * .35, r * .1, x, y, r);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(.5, color); gr.addColorStop(1, shade(color, -.35));
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(x - r * .3, y - r * .35, r * .22, 0, TAU); ctx.fill();
}
function drawFlower(ctx, x, y, s, color, bloom = 1, depth = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, .85 + .15 * depth);
  const b = clamp(bloom, 0, 1), open = .25 + .75 * easeOut(b);
  // outer → inner petal layers, rounded, slightly cupped (peony)
  for (let L = 0; L < 3; L++) {
    const n = 8 - L * 2, rr = s * (1 - L * .28) * open, col = L === 0 ? shade(color, -.08) : L === 1 ? color : shade(color, .22);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + L * .7;
      ctx.save(); ctx.rotate(a); ctx.translate(rr * .5, 0);
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, rr * .55, rr * .42, 0, 0, TAU); ctx.fill();
      const gr = ctx.createRadialGradient(rr * .25, 0, 0, rr * .25, 0, rr * .6); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(120,40,70,.08)'); ctx.fillStyle = gr; ctx.fill();
      ctx.strokeStyle = 'rgba(120,40,70,.12)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
  }
  ctx.fillStyle = '#f2c24d'; ctx.beginPath(); ctx.arc(0, 0, s * .17 * open, 0, TAU); ctx.fill();
  ctx.fillStyle = '#b8860b'; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * s * .1 * open, Math.sin(a) * s * .1 * open, s * .035, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function drawLeaf(ctx, x, y, s, ang) { ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = '#6a9a58'; ctx.beginPath(); ctx.ellipse(s * .5, 0, s * .55, s * .22, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s, 0); ctx.stroke(); ctx.restore(); }
function drawDowel(ctx, x, y, hpx, z, alpha = 1) {
  const w = z * 2.2; ctx.save(); ctx.globalAlpha = alpha;
  const gr = ctx.createLinearGradient(x - w, 0, x + w, 0); gr.addColorStop(0, '#9c7a4e'); gr.addColorStop(.4, '#e8cb98'); gr.addColorStop(1, '#8a6a42');
  ctx.fillStyle = gr; ctx.fillRect(x - w, y - hpx, w * 2, hpx);
  ctx.fillStyle = '#f2ddb6'; ctx.beginPath(); ctx.ellipse(x, y - hpx, w, w * K * 1.6, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}
function drawPillar(ctx, x, y, hpx, z) {
  const w = z * 3.2; ctx.save();
  ctx.globalAlpha = .55; const gr = ctx.createLinearGradient(x - w, 0, x + w, 0); gr.addColorStop(0, 'rgba(150,200,235,.9)'); gr.addColorStop(.3, 'rgba(255,255,255,.95)'); gr.addColorStop(.6, 'rgba(180,220,245,.7)'); gr.addColorStop(1, 'rgba(120,170,215,.9)');
  ctx.fillStyle = gr; ctx.fillRect(x - w, y - hpx, w * 2, hpx);
  ctx.globalAlpha = .9; ctx.fillStyle = 'rgba(220,240,255,.9)'; ctx.beginPath(); ctx.ellipse(x, y - hpx, w, w * K * 1.6, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = z * .35; ctx.beginPath(); ctx.moveTo(x - w * .6, y - hpx + w * .2); ctx.lineTo(x - w * .6, y); ctx.stroke();
  ctx.restore();
}
function drawRod(ctx, t, g) {
  const R = t.rod, p = topToScreen(t, 0, 0), z = g.z;
  const above = R.len * (1 - R.depth) * z, w = z * 3;
  if (above < 1 && !R.showHead) return;
  const gr = ctx.createLinearGradient(p.x - w, 0, p.x + w, 0); gr.addColorStop(0, '#7f858d'); gr.addColorStop(.4, '#f1f4f8'); gr.addColorStop(1, '#5f656d');
  ctx.fillStyle = gr; ctx.fillRect(p.x - w, p.y - above, w * 2, above);
  ctx.fillStyle = '#d8dde3'; ctx.beginPath(); ctx.ellipse(p.x, p.y - above, w * 1.6, w * 1.6 * K * 1.5, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#6d737b'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#c9ced5'; ctx.fillRect(p.x - w * 1.6, p.y - above, w * 3.2, z * 2.2); // head rim
}
function drawClearPlate(ctx, cx, y, rx, z) {
  const ry = rx * K; ctx.save();
  ctx.fillStyle = 'rgba(190,225,250,.55)'; ctx.beginPath(); ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI); ctx.lineTo(cx - rx, y); ctx.ellipse(cx, y - z * 2.5, rx, ry, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(225,245,255,.75)'; ctx.beginPath(); ctx.ellipse(cx, y - z * 2.5, rx, ry, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = z * .5; ctx.stroke();
  ctx.restore();
}

/* ---------- the work lift: patissier + tool deck (screen anchored) ---------- */
function layoutPlatform() {
  PLAT.slots = [];
  if (PORTRAIT) {
    const ph = clamp(H * .16, 100, 160);
    PLAT.deckY = H - ph; PLAT.x0 = 0; PLAT.x1 = W; PLAT.dir = 1;
    PLAT.chef = { x: W * .16, y: PLAT.deckY };
    for (let i = 0; i < 3; i++) PLAT.slots.push({ x: W * (.44 + i * .22), y: PLAT.deckY - ph * .05, s: ph * .42 });
  } else {
    const pw = clamp(W * .27, 200, 330);
    PLAT.deckY = H * .72; PLAT.x0 = W - pw; PLAT.x1 = W; PLAT.dir = -1;
    PLAT.chef = { x: W - pw * .78, y: PLAT.deckY };
    for (let i = 0; i < 3; i++) PLAT.slots.push({ x: W - pw * .4 + (i - 1) * pw * .28, y: PLAT.deckY - pw * .02, s: pw * .27 });
  }
}
function drawLift(ctx, time, lowered) {
  const dy = PLAT.deckY + (lowered || 0);
  const x0 = PLAT.x0, x1 = PLAT.x1, w = x1 - x0;
  const floorY = Math.min(H + 40, sY(-8));
  // scissor legs
  const legH = floorY - dy - 14;
  if (legH > 10) {
    const lx0 = PORTRAIT ? W * .05 : x0 + w * .12, lx1 = PORTRAIT ? W * .95 : x1 - w * .12;
    const seg = Math.max(40, Math.min(110, (lx1 - lx0) * .55)); const n = Math.max(1, Math.ceil(legH / seg));
    ctx.strokeStyle = '#7b8088'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const ya = dy + 14 + i * legH / n, yb = ya + legH / n;
      if (ya > H) break;
      ctx.beginPath(); ctx.moveTo(lx0, ya); ctx.lineTo(lx1, yb); ctx.moveTo(lx1, ya); ctx.lineTo(lx0, yb); ctx.stroke();
      ctx.fillStyle = '#4c5158'; ctx.beginPath(); ctx.arc((lx0 + lx1) / 2, (ya + yb) / 2, 5, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(lx0, dy + 14); ctx.lineTo(lx0, Math.min(H, floorY)); ctx.moveTo(lx1, dy + 14); ctx.lineTo(lx1, Math.min(H, floorY)); ctx.stroke();
  }
  // deck (steel plate)
  ctx.save();
  const grd = ctx.createLinearGradient(0, dy, 0, dy + 16); grd.addColorStop(0, '#dfe3e8'); grd.addColorStop(.5, '#b5bac2'); grd.addColorStop(1, '#7d838b');
  ctx.fillStyle = grd; ctx.fillRect(x0, dy, w, 16);
  ctx.fillStyle = '#5f646c'; ctx.fillRect(x0, dy + 16, w, PORTRAIT ? H - dy : 10);
  ctx.fillStyle = 'rgba(255,255,255,.35)'; for (let x = x0 + 8; x < x1; x += 18) ctx.fillRect(x, dy + 4, 8, 2);
  // railing behind
  ctx.strokeStyle = '#b2b8c0'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x0 + 6, dy); ctx.lineTo(x0 + 6, dy - 70); ctx.lineTo(x1 - 6, dy - 70); ctx.lineTo(x1 - 6, dy); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0 + 6, dy - 38); ctx.lineTo(x1 - 6, dy - 38); ctx.stroke();
  ctx.restore();
}
function drawChef(ctx, x, y, s, time, look, busy) {
  // s: height in px. Looks toward look {x,y} (screen)
  ctx.save(); ctx.translate(x, y);
  const bob = Math.sin(time * 2.2) * s * .012;
  const dx = look ? clamp((look.x - x) / 300, -1, 1) : 0, dyy = look ? clamp((look.y - (y - s * .8)) / 300, -1, 1) : 0;
  // shoes
  ctx.fillStyle = '#3b3733'; ctx.beginPath(); ctx.ellipse(-s * .12, 0, s * .1, s * .035, 0, 0, TAU); ctx.ellipse(s * .12, 0, s * .1, s * .035, 0, 0, TAU); ctx.fill();
  // legs
  ctx.fillStyle = '#2f3a52'; ctx.fillRect(-s * .17, -s * .38, s * .14, s * .38); ctx.fillRect(s * .03, -s * .38, s * .14, s * .38);
  // coat
  ctx.fillStyle = '#fbfbfb'; ctx.beginPath(); ctx.roundRect(-s * .24, -s * .75 + bob, s * .48, s * .42, s * .06); ctx.fill();
  ctx.fillStyle = '#e6e6ea'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-s * .06, -s * .68 + bob + i * s * .1, s * .018, 0, TAU); ctx.arc(s * .06, -s * .68 + bob + i * s * .1, s * .018, 0, TAU); ctx.fill(); }
  // apron stripe
  ctx.fillStyle = '#f2c9c9'; ctx.fillRect(-s * .2, -s * .5 + bob, s * .4, s * .16);
  // arms
  ctx.strokeStyle = '#fbfbfb'; ctx.lineWidth = s * .09; ctx.lineCap = 'round';
  const ax = busy ? dx * s * .3 : s * .1, ay = busy ? -s * .62 + dyy * s * .2 : -s * .5;
  ctx.beginPath(); ctx.moveTo(s * .2, -s * .68 + bob); ctx.lineTo(s * .2 + ax + s * .12, ay + bob); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-s * .2, -s * .68 + bob); ctx.lineTo(-s * .3, -s * .48 + bob); ctx.stroke();
  ctx.fillStyle = '#f7d2b8'; ctx.beginPath(); ctx.arc(s * .2 + ax + s * .12, ay + bob, s * .055, 0, TAU); ctx.arc(-s * .3, -s * .48 + bob, s * .055, 0, TAU); ctx.fill();
  // head
  ctx.fillStyle = '#f7d2b8'; ctx.beginPath(); ctx.arc(0, -s * .87 + bob, s * .13, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5a3d2b'; ctx.beginPath(); ctx.ellipse(0, -s * .93 + bob, s * .13, s * .07, 0, Math.PI, TAU); ctx.fill();
  // eyes look
  ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.arc(-s * .045 + dx * s * .02, -s * .87 + bob + dyy * s * .015, s * .016, 0, TAU); ctx.arc(s * .045 + dx * s * .02, -s * .87 + bob + dyy * s * .015, s * .016, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#c96a6a'; ctx.lineWidth = s * .012; ctx.beginPath(); ctx.arc(0, -s * .84 + bob, s * .04, .15 * Math.PI, .85 * Math.PI); ctx.stroke();
  ctx.fillStyle = '#f0a8a8'; ctx.globalAlpha = .5; ctx.beginPath(); ctx.arc(-s * .09, -s * .84 + bob, s * .025, 0, TAU); ctx.arc(s * .09, -s * .84 + bob, s * .025, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  // toque
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-s * .13, -s * 1.03 + bob, s * .26, s * .09, s * .02); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, -s * 1.1 + bob, s * .17, s * .12, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-s * .09, -s * 1.13 + bob, s * .09, s * .08, 0, 0, TAU); ctx.ellipse(s * .09, -s * 1.13 + bob, s * .09, s * .08, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

/* ---------- hint: ghost finger ---------- */
function drawGhostHand(ctx, x, y, alpha, pressing) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y);
  const s = Math.max(22, Math.min(W, H) * .07);
  if (pressing) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, s * .55 + Math.sin(G.time * 8) * 3, 0, TAU); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.strokeStyle = 'rgba(60,50,60,.7)'; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(-s * .16, s * .05); ctx.lineTo(-s * .16, s * .45); ctx.lineTo(-s * .42, s * .5); ctx.lineTo(-s * .42, s * .95); ctx.lineTo(s * .5, s * .95); ctx.lineTo(s * .55, s * .55); ctx.lineTo(s * .5, s * .28); ctx.lineTo(s * .16, s * .2); ctx.lineTo(s * .16, s * .05); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * .16, s * .3); ctx.lineTo(s * .16, s * .55); ctx.moveTo(s * .34, s * .35); ctx.lineTo(s * .34, s * .6); ctx.stroke();
  ctx.restore();
}
function drawGlowRing(ctx, x, y, r, color = '255,255,255', t = 0) {
  const pulse = .5 + .5 * Math.sin(t * 4);
  ctx.save(); ctx.strokeStyle = `rgba(${color},${.25 + .45 * pulse})`; ctx.lineWidth = 3 + 2 * pulse; ctx.beginPath(); ctx.arc(x, y, r * (1 + .12 * pulse), 0, TAU); ctx.stroke(); ctx.restore();
}
