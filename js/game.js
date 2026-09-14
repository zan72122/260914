/* ---------- game state, sequencing, input, loop ---------- */
'use strict';
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const G = {
  time: 0, dt: 0,
  cake: { tiers: [], rot: 0, rotVel: 0 },
  steps: [], si: -1, step: null, nextDelay: 0,
  fx: new Particles(), wfx: new Particles(),
  pointer: { x: 0, y: 0, down: false, dx: 0, dy: 0, speed: 0, last: 0 },
  idle: 0, hintT: 0, shakeA: 0, revealed: false, reveal: 0, liftDrop: 0,
  chef: { cheer: 0 },
  shake(a) { this.shakeA = Math.min(14, this.shakeA + a * 2.2); },
  puff(x, y, r, color) {
    for (let i = 0; i < 26; i++) { const a = rnd(TAU); this.wfx.add({ x: x + Math.sin(a) * r, y: y + rnd(0, 2), vx: Math.sin(a) * rnd(20, 60), vy: rnd(5, 25), g: -70, life: rnd(.5, 1), r: rnd(2, 4), color, kind: 'dot', rot: 0, vr: 0, world: true, alpha: .8 }); }
  },
  chefCheer() { this.chef.cheer = 1; },
  addTier(def) {
    const tiers = this.cake.tiers;
    if (def.merge) { const last = tiers[tiers.length - 1]; last.h += def.h; last.layers = 4; last.jamSeam = .5; last.topGrid = null; return last; }
    const t = Object.assign({ surface: 'sponge', layers: 3 }, def);
    tiers.push(t); return t;
  },
  onStepDone(x, y) {
    SFX.chime(this.si % 4);
    const top = this.cake.tiers[this.cake.tiers.length - 1];
    if (top) { const g = tierGeom(top); this.fx.burst(x === undefined ? g.cx : x, y === undefined ? (g.top + g.bot) / 2 : y, 14, { colors: ['#fff', '#ffe9a8', '#fbd0dc'], speed: 120, r: 2.5, life: .7, kind: 'spark', g: 40 }); }
    this.nextDelay = .55;
  },
};

/* ---------- tier definitions (bottom → top) ---------- */
const T = {
  base: { r: 50, h: 30, layers: 3 },
  barrelA: { r: 42, h: 26, layers: 2 },
  barrelB: { r: 42, h: 26, layers: 2, merge: true },
  float: { r: 36, h: 26, layers: 3 },
  lace: { r: 30, h: 30, layers: 3 },
  gold: { r: 25, h: 26, layers: 3 },
  swag: { r: 20, h: 24, layers: 3 },
  top: { r: 14, h: 20, layers: 2 },
};
const PILLAR_H = 18;
const Y = { base: 0, barrel: 30, float: 30 + 52 + PILLAR_H, lace: 126, gold: 156, swag: 182, top: 206 };
const FLOWER_COLORS = ['#f39ab3', '#fbe6ea', '#e6748f', '#f7c1cf', '#fff6f2'];

function buildSequence() {
  return [
    // ---- Tier 1: the foundation. hoist → cream → turntable → giant fondant → smooth → trim → pearls
    new LowerStep({ def: T.base, targetY: Y.base, kind: 'sponge' }),
    new CreamStep({ ti: 0, color: '#fff2dc' }),
    new TurntableStep({ ti: 0 }),
    new DrapeStep({ ti: 0, color: '#fffaf3' }),
    new SmoothStep({ ti: 0 }),
    new TrimStep({ ti: 0 }),
    new PearlStep({ ti: 0, color: '#fdf6ec' }),
    // ---- Tier 2: double barrel. board → dowels → level → barrel A → jam → barrel B → central rod (x-ray) → ganache pour → turntable → giant fondant → smooth → trim → ribbon & bow
    new BoardStep({ ti: 0, nextR: T.barrelA.r, n: 5 }),
    new DowelStep({ ti: 0 }),
    new LevelStep({ ti: 0 }),
    new LowerStep({ def: T.barrelA, targetY: Y.barrel, kind: 'sponge' }),
    new TopPaintStep({ ti: 1, color: '#c8324a' }),
    new LowerStep({ def: T.barrelB, targetY: Y.barrel + T.barrelA.h, kind: 'sponge' }),
    new RodStep({ tis: [1, 0] }),
    new PourStep({ ti: 1, color: '#4a2c1c' }),
    new TurntableStep({ ti: 1 }),
    new DrapeStep({ ti: 1, color: '#fbf1e4' }),
    new SmoothStep({ ti: 1 }),
    new TrimStep({ ti: 1 }),
    new RibbonStep({ ti: 1, color: '#c94b6e', f: .5, w: 5 }),
    // ---- Tier 3: floating tier. clear pillars → plate+tier lowered → cream → turntable → ruffles
    new PillarStep({ ti: 1, n: 4, h: PILLAR_H, rho: T.float.r * .62 }),
    new LowerStep({ def: Object.assign({ plateR: T.float.r + 5 }, T.float), targetY: Y.float, kind: 'plate', plateR: T.float.r + 5 }),
    new CreamStep({ ti: 2, color: '#f9d9df' }),
    new TurntableStep({ ti: 2 }),
    new RuffleStep({ ti: 2, bands: 4, color: '#f7c6d0' }),
    // ---- Tier 4: lace tier. board → dowels → level → lower → cream → fondant → smooth → trim → lace mat → big flowers
    new BoardStep({ ti: 2, nextR: T.lace.r, n: 4 }),
    new DowelStep({ ti: 2 }),
    new LevelStep({ ti: 2 }),
    new LowerStep({ def: T.lace, targetY: Y.lace, kind: 'sponge' }),
    new CreamStep({ ti: 3, color: '#fff2dc' }),
    new DrapeStep({ ti: 3, color: '#f4e4ec' }),
    new SmoothStep({ ti: 3 }),
    new TrimStep({ ti: 3 }),
    new LaceStep({ ti: 3, f0: .22, f1: .78 }),
    new FlowerStep({ ti: 3, n: 3, colors: ['#e6748f', '#fbe6ea', '#f39ab3'], maxSize: 8 }),
    // ---- Tier 5: gold tier. board → dowels → level → lower → cream → turntable → gold leaf → flower cascade down three tiers
    new BoardStep({ ti: 3, nextR: T.gold.r, n: 4 }),
    new DowelStep({ ti: 3 }),
    new LevelStep({ ti: 3 }),
    new LowerStep({ def: T.gold, targetY: Y.gold, kind: 'sponge' }),
    new CreamStep({ ti: 4, color: '#fbf5ea' }),
    new TurntableStep({ ti: 4 }),
    new GoldStep({ ti: 4, f: .6 }),
    new CascadeStep({ tis: [4, 3, 2], colors: FLOWER_COLORS }),
    // ---- Tier 6: swag tier. board → dowels → level → lower → cream → fondant → smooth → trim → swags
    new BoardStep({ ti: 4, nextR: T.swag.r, n: 4 }),
    new DowelStep({ ti: 4 }),
    new LevelStep({ ti: 4 }),
    new LowerStep({ def: T.swag, targetY: Y.swag, kind: 'sponge' }),
    new CreamStep({ ti: 5, color: '#fff2dc' }),
    new DrapeStep({ ti: 5, color: '#fbe9ea' }),
    new SmoothStep({ ti: 5 }),
    new TrimStep({ ti: 5 }),
    new SwagStep({ ti: 5, color: '#fff' }),
    // ---- Tier 7: the top. lower → cream → turntable → sugar snow → topper → REVEAL
    new LowerStep({ def: T.top, targetY: Y.top, kind: 'sponge' }),
    new CreamStep({ ti: 6, color: '#ffffff' }),
    new TurntableStep({ ti: 6 }),
    new SugarStep({ ti: 6 }),
    new TopperStep({ ti: 6 }),
    new RevealStep({}),
  ];
}

/* ---------- sequencing ---------- */
function nextStep() {
  if (G.step) G.step.exit();
  G.si++; G.step = G.steps[G.si] || null;
  if (G.step) { G.step.enter(); G.idle = 0; G.hintT = 0; }
}

/* ---------- resize ---------- */
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight; PORTRAIT = H >= W;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  layoutPlatform();
  CAM.anchor = G.revealed ? .5 : PORTRAIT ? (PLAT.deckY / 2) / H : .5;
  if (!PAT.crumb) buildPatterns(ctx);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 100));

/* ---------- input (one finger only) ---------- */
function pointerPos(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
let activeId = null;
canvas.addEventListener('pointerdown', (e) => {
  if (activeId !== null) return; // one finger only: ignore extra touches
  activeId = e.pointerId; e.preventDefault(); SFX.unlock();
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
  const p = pointerPos(e), P = G.pointer;
  P.x = p.x; P.y = p.y; P.down = true; P.dx = 0; P.dy = 0; P.speed = 0; P.last = performance.now();
  G.idle = 0; G.hintT = 0;
  if (G.step) G.step.down({ x: p.x, y: p.y, dx: 0, dy: 0, speed: 0 });
}, { passive: false });
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== activeId) return; e.preventDefault();
  const p = pointerPos(e), P = G.pointer, now = performance.now(), dt = Math.max(1, now - P.last) / 1000;
  const dx = p.x - P.x, dy = p.y - P.y; P.dx = dx; P.dy = dy; P.speed = Math.hypot(dx, dy) / dt; P.x = p.x; P.y = p.y; P.last = now;
  G.idle = 0;
  if (G.step && P.down) G.step.move({ x: p.x, y: p.y, dx, dy, speed: P.speed });
}, { passive: false });
const endPointer = (e) => {
  if (e.pointerId !== activeId) return; activeId = null; e.preventDefault();
  const p = pointerPos(e), P = G.pointer; P.down = false; P.x = p.x; P.y = p.y;
  if (G.step) G.step.up({ x: p.x, y: p.y, dx: 0, dy: 0, speed: 0 });
};
canvas.addEventListener('pointerup', endPointer, { passive: false });
canvas.addEventListener('pointercancel', endPointer, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());

/* ---------- camera ---------- */
function updateCamera(dt) {
  let c = G.step && G.step.camera();
  if (!c) { const top = G.cake.tiers[G.cake.tiers.length - 1]; c = top ? camForTier(top) : { y: 20, zoom: fitZoom(50, 30) }; }
  CAM.ty = c.y; CAM.tzoom = c.zoom;
  CAM.tx = (PORTRAIT || G.revealed) ? 0 : (W - PLAT.x0) / 2 / c.zoom;
  const targetAnchor = G.revealed ? .5 : PORTRAIT ? (PLAT.deckY / 2) / H : .5;
  CAM.anchor += (targetAnchor - CAM.anchor) * Math.min(1, dt * 2);
  const k = G.revealed ? Math.min(1, dt * .9) : Math.min(1, dt * 2.6);
  CAM.y += (CAM.ty - CAM.y) * k; CAM.x += (CAM.tx - CAM.x) * k;
  CAM.zoom = Math.exp(lerp(Math.log(CAM.zoom), Math.log(CAM.tzoom), k));
}

/* ---------- hint (ghost finger) ---------- */
function drawHint() {
  if (!G.step || G.idle < 3.2) return;
  const h = G.step.hint(); if (!h || !h.pts.length) return;
  const a = clamp((G.idle - 3.2) / .6, 0, 1);
  G.hintT += G.dt;
  const period = h.kind === 'tap' ? 1.4 : h.kind === 'hold' ? 2.4 : 2.4;
  const u = (G.hintT % period) / period;
  const p0 = h.pts[0];
  drawGlowRing(ctx, p0.x, p0.y, Math.max(26, Math.min(W, H) * .06), '255,255,255', G.time);
  let x = p0.x, y = p0.y, pressing = false, al = a;
  if (h.kind === 'drag') {
    const pts = h.pts, segs = pts.length - 1, uu = clamp(u / .8, 0, 1), s = Math.min(segs - 1, Math.floor(uu * segs)), f = uu * segs - s;
    x = lerp(pts[s].x, pts[s + 1].x, f); y = lerp(pts[s].y, pts[s + 1].y, f); pressing = u < .8; al = a * (u < .1 ? u / .1 : u > .85 ? (1 - u) / .15 : 1);
    ctx.save(); ctx.globalAlpha = a * .5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.setLineDash([8, 10]); ctx.lineCap = 'round'; ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke(); ctx.restore();
  } else if (h.kind === 'tap') { pressing = (u % .5) < .2; y += pressing ? 6 : 0; }
  else if (h.kind === 'hold') { pressing = u < .8; y += pressing ? 6 : 0; if (pressing) { ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, 34, -Math.PI / 2, -Math.PI / 2 + TAU * (u / .8)); ctx.stroke(); ctx.restore(); } }
  drawGhostHand(ctx, x + 6, y + 6, al * .9, pressing);
}

/* ---------- draw deck items ---------- */
function drawDeckItems() {
  if (!G.step) return;
  for (const it of G.step.items()) {
    const s = PLAT.slots[it.slot]; if (!s) continue;
    ctx.save(); ctx.__fondColor = it.color; ctx.__ribbonColor = it.color; ctx.__bagColor = it.color;
    drawItem(ctx, it.kind, s.x, s.y, s.s, it.active, G.time); ctx.restore();
  }
}

/* ---------- main loop ---------- */
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  G.dt = dt; G.time += dt;
  update(dt); draw();
  requestAnimationFrame(frame);
}
function update(dt) {
  updateCamera(dt);
  if (G.nextDelay > 0) { G.nextDelay -= dt; if (G.nextDelay <= 0) nextStep(); }
  else if (G.step) G.step.update(dt);
  // turntable physics
  const c = G.cake;
  c.rot += c.rotVel * dt; c.rotVel *= Math.max(0, 1 - dt * (G.pointer.down ? 6 : 1.6)); if (Math.abs(c.rotVel) < .002) c.rotVel = 0;
  G.fx.update(dt); G.wfx.update(dt);
  if (!G.pointer.down || !(G.step instanceof LowerStep)) G.idle += dt; else G.idle = 0;
  if (G.pointer.down) G.idle = 0;
  G.shakeA = Math.max(0, G.shakeA - dt * 30);
  G.chef.cheer = Math.max(0, G.chef.cheer - dt * 1.2);
  if (G.revealed) G.liftDrop = Math.min(1, G.liftDrop + dt * .7);
}
function draw() {
  ctx.save();
  const sh = G.shakeA; if (sh > 0) ctx.translate(rnd(-sh, sh), rnd(-sh, sh) * .6);
  drawBackground(ctx, G.time);
  const tiers = G.cake.tiers, rmax = 50;
  if (sY(0) > -100) drawStand(ctx, rmax, G.cake.rot);
  // the whole cake, bottom → top
  for (const t of tiers) {
    if (t.plate) { const p = w2s(0, t.y0); drawClearPlate(ctx, p.x, p.y + CAM.zoom * 2.5, t.plateR * CAM.zoom, CAM.zoom); }
    drawTier(ctx, t);
  }
  const top = tiers[tiers.length - 1];
  if (top && top.topper) { const g = tierGeom(top); drawTopper(ctx, g.cx, g.top, Math.max(22, CAM.zoom * 11), G.time); }
  if (G.step) G.step.draw(ctx);
  G.wfx.draw(ctx, (x, y) => w2s(x, y));
  // chef at the base for scale when revealed
  if (G.revealed) { const p = w2s(-rmax * .72, -9); const hop = Math.abs(Math.sin(G.time * 4)) * 4 * CAM.zoom; drawChef(ctx, p.x, p.y - hop, 17 * CAM.zoom, G.time, null, true); }
  ctx.restore();
  // lift + patissier + tools (screen anchored)
  if (G.liftDrop < 1) {
    const drop = easeIn(G.liftDrop) * (H + 200);
    drawLift(ctx, G.time, drop);
    const look = G.step && G.idle > 1.5 && G.step.hint() ? G.step.hint().pts[0] : G.pointer;
    const cheer = G.chef.cheer > 0 ? Math.abs(Math.sin(G.chef.cheer * Math.PI * 2)) * 18 : 0;
    const chefS = PORTRAIT ? clamp(H * .19, 120, 190) : clamp(H * .42, 120, 220);
    drawChef(ctx, PLAT.chef.x, PLAT.chef.y + drop - cheer, chefS, G.time, look, G.pointer.down);
    ctx.save(); ctx.translate(0, drop); drawDeckItems(); ctx.restore();
  }
  if (G.step) G.step.drawFront(ctx);
  G.fx.draw(ctx, null);
  drawHint();
}

/* ---------- boot ---------- */
resize();
G.steps = buildSequence();
CAM.y = 20; CAM.zoom = fitZoom(50, 30); CAM.ty = CAM.y; CAM.tzoom = CAM.zoom; CAM.x = CAM.tx = PORTRAIT ? 0 : (W - PLAT.x0) / 2 / CAM.zoom;
nextStep();
requestAnimationFrame(frame);
