/* ---------- tools & deck items ---------- */
'use strict';
function drawItem(ctx, kind, x, y, s, active, time) {
  ctx.save(); ctx.translate(x, y);
  const wob = active ? Math.sin(time * 6) * .06 : 0;
  if (active) { const gl = ctx.createRadialGradient(0, -s * .3, s * .1, 0, -s * .3, s * 1.1); gl.addColorStop(0, 'rgba(255,240,180,.55)'); gl.addColorStop(1, 'rgba(255,240,180,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, -s * .3, s * 1.1, 0, TAU); ctx.fill(); }
  ctx.rotate(wob);
  switch (kind) {
    case 'board': { ctx.fillStyle = '#d9c8a6'; ctx.beginPath(); ctx.ellipse(0, -s * .1, s * .9, s * .9 * .35, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#a98f66'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#c4b08c'; ctx.beginPath(); ctx.ellipse(0, -s * .1, s * .7, s * .7 * .35, 0, 0, TAU); ctx.fill(); break; }
    case 'fondant': { ctx.fillStyle = ctx.__fondColor || '#fdf8f2'; ctx.beginPath(); ctx.roundRect(-s * .95, -s * .5, s * 1.9, s * .55, s * .1); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(-s * .95, -s * .05, s * 1.9, s * .05); ctx.beginPath(); ctx.ellipse(0, -s * .55, s * .95, s * .3, 0, 0, TAU); ctx.fillStyle = shade(ctx.__fondColor || '#fdf8f2', .1); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.1)'; ctx.stroke(); ctx.fillStyle = '#d9a35f'; ctx.fillRect(-s * 1.05, -s * .68, s * 2.1, s * .12); break; }
    case 'bowl': { ctx.fillStyle = '#f4f4f6'; ctx.beginPath(); ctx.moveTo(-s * .8, -s * .55); ctx.lineTo(-s * .55, s * 0); ctx.lineTo(s * .55, s * 0); ctx.lineTo(s * .8, -s * .55); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#4b2a1a'; ctx.beginPath(); ctx.ellipse(0, -s * .55, s * .8, s * .25, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(-s * .2, -s * .6, s * .3, s * .08, 0, 0, TAU); ctx.fill(); break; }
    case 'spool': { ctx.fillStyle = ctx.__ribbonColor || '#c94b6e'; ctx.beginPath(); ctx.roundRect(-s * .55, -s * .8, s * 1.1, s * .8, s * .1); ctx.fill(); ctx.fillStyle = '#eee'; ctx.fillRect(-s * .65, -s * .85, s * 1.3, s * .1); ctx.fillRect(-s * .65, -s * .05, s * 1.3, s * .1); ctx.fillStyle = shade(ctx.__ribbonColor || '#c94b6e', .3); ctx.fillRect(s * .3, -s * .8, s * .12, s * .8); break; }
    case 'mat': { ctx.fillStyle = '#d7d7de'; ctx.beginPath(); ctx.roundRect(-s * .95, -s * .5, s * 1.9, s * .5, s * .06); ctx.fill(); ctx.save(); ctx.beginPath(); ctx.roundRect(-s * .95, -s * .5, s * 1.9, s * .5, s * .06); ctx.clip(); ctx.scale(.5, .5); ctx.fillStyle = PAT.lace; ctx.fillRect(-s * 2, -s * 1, s * 4, s * 1); ctx.restore(); break; }
    case 'topper': { drawTopper(ctx, 0, 0, s * 1.1, time); break; }
    case 'pillars': { ctx.fillStyle = '#c9ced5'; ctx.fillRect(-s * .9, -s * .2, s * 1.8, s * .22); for (let i = 0; i < 4; i++) drawPillar(ctx, -s * .6 + i * s * .4, -s * .2, s * .9, s * .12); break; }
    case 'pearls': { ctx.fillStyle = '#8fa3b8'; ctx.beginPath(); ctx.roundRect(-s * .8, -s * .5, s * 1.6, s * .5, s * .08); ctx.fill(); for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) drawPearl(ctx, -s * .6 + i * s * .3, -s * .35 + j * s * .22, s * .11); break; }
    case 'goldpot': { ctx.fillStyle = '#3d3a44'; ctx.beginPath(); ctx.roundRect(-s * .6, -s * .6, s * 1.2, s * .6, s * .08); ctx.fill(); ctx.save(); ctx.beginPath(); ctx.ellipse(0, -s * .6, s * .6, s * .2, 0, 0, TAU); ctx.clip(); ctx.fillStyle = PAT.gold; ctx.scale(.6, .6); ctx.fillRect(-s * 2, -s * 2, s * 4, s * 4); ctx.restore(); break; }
    case 'flowers': { ctx.fillStyle = '#e8d6c0'; ctx.beginPath(); ctx.roundRect(-s * .85, -s * .5, s * 1.7, s * .5, s * .08); ctx.fill(); drawFlower(ctx, -s * .45, -s * .5, s * .32, '#f39ab3'); drawFlower(ctx, s * .1, -s * .55, s * .36, '#fbe6ea'); drawFlower(ctx, s * .55, -s * .48, s * .3, '#e6748f'); break; }
    case 'bag': { drawPipingBag(ctx, 0, -s * .2, s, -.4, ctx.__bagColor || '#f7c6d0'); break; }
    case 'spatula': { drawSpatula(ctx, 0, -s * .2, s, -.5); break; }
    case 'wheel': { drawWheel(ctx, 0, -s * .3, s); break; }
    case 'smoother': { drawSmoother(ctx, 0, -s * .3, s); break; }
    case 'mallet': { drawMallet(ctx, 0, -s * .3, s, 0); break; }
  }
  ctx.restore();
}
function drawSpatula(ctx, x, y, s, ang) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = '#3a2e2a'; ctx.beginPath(); ctx.roundRect(-s * .08, -s * 1.2, s * .16, s * .6, s * .06); ctx.fill();
  ctx.fillStyle = '#d0d5dc'; ctx.beginPath(); ctx.roundRect(-s * .18, -s * .65, s * .36, s * 1.0, s * .08); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(-s * .12, -s * .55, s * .08, s * .8);
  ctx.restore();
}
function drawPipingBag(ctx, x, y, s, ang, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, s * .35); ctx.lineTo(-s * .5, -s * .9); ctx.quadraticCurveTo(0, -s * 1.25, s * .5, -s * .9); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.moveTo(-s * .05, s * .2); ctx.lineTo(-s * .35, -s * .8); ctx.lineTo(-s * .2, -s * .85); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#b8bec6'; ctx.beginPath(); ctx.moveTo(-s * .12, s * .2); ctx.lineTo(s * .12, s * .2); ctx.lineTo(s * .06, s * .45); ctx.lineTo(-s * .06, s * .45); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d9c9c1'; ctx.beginPath(); ctx.roundRect(-s * .3, -s * 1.1, s * .6, s * .12, s * .04); ctx.fill();
  ctx.restore();
}
function drawWheel(ctx, x, y, s, spin = 0) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#3a2e2a'; ctx.beginPath(); ctx.roundRect(-s * .08, -s * 1.1, s * .16, s * .7, s * .06); ctx.fill();
  ctx.strokeStyle = '#b8bec6'; ctx.lineWidth = s * .08; ctx.beginPath(); ctx.moveTo(0, -s * .45); ctx.lineTo(0, -s * .05); ctx.stroke();
  ctx.save(); ctx.rotate(spin); const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, s * .4); gr.addColorStop(0, '#f2f4f7'); gr.addColorStop(1, '#8e959e'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, s * .4, 0, TAU); ctx.fill(); ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, s * .06, 0, TAU); ctx.fillStyle = '#555'; ctx.fill(); ctx.restore();
  ctx.restore();
}
function drawSmoother(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#f2f2f4'; ctx.beginPath(); ctx.roundRect(-s * .5, -s * .25, s * 1.0, s * .5, s * .06); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#d9dbe0'; ctx.beginPath(); ctx.roundRect(-s * .3, -s * .55, s * .6, s * .32, s * .1); ctx.fill();
  ctx.restore();
}
function drawMallet(ctx, x, y, s, ang) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = '#8b5e3c'; ctx.beginPath(); ctx.roundRect(-s * .06, -s * 1.1, s * .12, s * .9, s * .04); ctx.fill();
  ctx.fillStyle = '#5d6168'; ctx.beginPath(); ctx.roundRect(-s * .35, -s * .35, s * .7, s * .4, s * .08); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-s * .3, -s * .3, s * .6, s * .08);
  ctx.restore();
}
function drawKnife(ctx, x, y, s, ang) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = '#3a2e2a'; ctx.beginPath(); ctx.roundRect(-s * 1.5, -s * .13, s * .5, s * .26, s * .08); ctx.fill();
  const gr = ctx.createLinearGradient(0, -s * .2, 0, s * .2); gr.addColorStop(0, '#f5f7fa'); gr.addColorStop(1, '#a9b0b8'); ctx.fillStyle = gr;
  ctx.beginPath(); ctx.moveTo(-s * 1.0, -s * .16); ctx.lineTo(s * 1.4, -s * .1); ctx.lineTo(s * 1.5, s * .05); ctx.lineTo(-s * 1.0, s * .12); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#7d848c'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = -9; i < 14; i++) { ctx.moveTo(i * s * .1, s * .12 - i * s * .003); ctx.lineTo(i * s * .1 + s * .05, s * .17 - i * s * .003); } ctx.stroke();
  ctx.restore();
}
function drawTopper(ctx, x, y, s, time) {
  ctx.save(); ctx.translate(x, y);
  // golden heart on a stem with sparkle
  ctx.fillStyle = '#c9a23a'; ctx.fillRect(-s * .04, -s * .45, s * .08, s * .45);
  const gr = ctx.createRadialGradient(-s * .1, -s * .8, s * .05, 0, -s * .7, s * .5); gr.addColorStop(0, '#fff2b0'); gr.addColorStop(.5, '#f2c94c'); gr.addColorStop(1, '#b8861b');
  drawHeart(ctx, 0, -s * .75, s * .38, gr);
  ctx.strokeStyle = '#8a6412'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#fff'; const tw = .5 + .5 * Math.sin(time * 5);
  for (const [px, py, sc] of [[-s * .25, -s * 1.05, 1], [s * .32, -s * .55, .7], [s * .18, -s * 1.1, .5]]) { ctx.save(); ctx.translate(px, py); ctx.scale(sc * (.6 + .4 * tw), sc * (.6 + .4 * tw)); ctx.beginPath(); for (let k = 0; k < 4; k++) { ctx.moveTo(0, 0); ctx.lineTo(Math.cos(k * Math.PI / 2) * s * .14, Math.sin(k * Math.PI / 2) * s * .14); } ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore(); }
  ctx.restore();
}

/* ---------- Step base ---------- */
class Step {
  constructor(o) { Object.assign(this, o); this.done = false; this.t = 0; this.doneT = 0; }
  get tier() { return G.cake.tiers[this.ti]; }
  enter() { } exit() { }
  down(p) { } move(p) { } up(p) { }
  update(dt) { this.t += dt; }
  draw(ctx) { }           // world overlay after cake (tools in world)
  drawFront(ctx) { }      // after deck (dragged items)
  hint() { return null; }
  camera() { return null; }
  items() { return []; }
  finish(x, y) { if (this.done) return; this.done = true; G.onStepDone(x, y); }
  // helpers
  onTier(p, t, tol = 1.15) { const g = tierGeom(t); return Math.abs(p.x - g.cx) <= g.rx * tol && p.y > g.top - g.ry * 1.5 && p.y < g.bot + g.ry * 1.5; }
}
function fitZoom(r, h) {
  const freeW = PORTRAIT ? W : (PLAT.x0);
  const freeH = PORTRAIT ? PLAT.deckY : H;
  return Math.min(freeW * (PORTRAIT ? .86 : .62) / (2 * r), freeH * (PORTRAIT ? .5 : .58) / h);
}
function camForTier(t, extraTop = 0) { return { y: t.y0 + t.h * .5 + extraTop, zoom: fitZoom(t.r, t.h + extraTop) }; }
function nearSlot(p, slot) { return dist(p.x, p.y, slot.x, slot.y - slot.s * .4) < slot.s * 1.6; }
function angleAround(g, x, y) { return Math.atan2(x - g.cx, (y - g.top - (g.bot - g.top) / 2) / K); }

/* ---------- 1. Lower a giant object from the hoist ---------- */
class LowerStep extends Step {
  // o: {def, targetY, kind:'sponge'|'plate', plateR}
  enter() {
    const d = this.def; this.r = d.r; this.h = d.h;
    this.obj = { r: d.r, h: d.h, y0: 0, surface: 'sponge', layers: d.layers || 3 };
    this.startOff = this.h * 1.15 + this.r * .3;
    this.y = this.targetY + this.startOff; this.goal = this.y; this.sway = 0; this.swayV = 0;
    this.landed = false; this.grab = null; this.vy = 0; this.chainSlack = 0;
    this.obj.y0 = this.y;
  }
  camera() { const span = this.startOff + this.h + this.r * .55; return { y: this.targetY + span * .5 - this.r * .1, zoom: fitZoom(this.r, span) }; }
  down(p) { if (this.landed) return; this.grab = { y: p.y, objY: this.y }; this.swayV += (p.dx || 0) * .01; SFX.creak(); }
  move(p) {
    if (!this.grab || this.landed) return;
    const dyW = (p.y - this.grab.y) / CAM.zoom;
    this.goal = clamp(this.grab.objY - dyW, this.targetY, this.targetY + this.startOff + this.h * .3);
    this.swayV += p.dx * .0025;
  }
  up(p) { this.grab = null; }
  update(dt) {
    super.update(dt);
    if (this.landed) { this.doneT += dt; if (this.doneT > .9) this.finish(); return; }
    if (!this.grab) { // gentle drift down when close, otherwise hang
      if (this.y - this.targetY < this.h * .5) this.goal = this.targetY;
    }
    const prev = this.y;
    this.y += (this.goal - this.y) * Math.min(1, dt * 5.5);
    const v = (prev - this.y) / Math.max(dt, .001);
    if (v > 2) SFX.hiss(v / 40);
    this.swayV += -this.sway * 9 * dt; this.swayV *= (1 - 2.5 * dt); this.sway += this.swayV * dt; this.sway = clamp(this.sway, -.12, .12);
    if (this.y - this.targetY < .6) {
      this.y = this.targetY; this.landed = true; this.sway = 0;
      SFX.kotón(); G.shake(this.h * .25); G.puff(0, this.targetY, this.r, this.kind === 'plate' ? '#ffffff' : '#e8c48a');
      G.addTier(Object.assign({}, this.def, { y0: this.targetY, plate: this.kind === 'plate' }));
      G.chefCheer();
    }
    this.obj.y0 = this.y;
  }
  draw(ctx) {
    const z = CAM.zoom, p = w2s(0, this.y + this.h), sw = this.landed ? 0 : this.sway;
    // chains from the top of the screen
    const topY = -20, hookY = p.y - this.r * z * K - 12 * z;
    ctx.save(); ctx.translate(p.x, 0); ctx.rotate(sw * .3);
    if (!this.landed || this.doneT < .5) {
      const slack = this.landed ? this.doneT * 120 : 0;
      ctx.strokeStyle = '#6e737a'; ctx.lineWidth = Math.max(3, z * .9); ctx.setLineDash([z * 2.2, z * 1.4]);
      for (const dx of [-this.r * z * .45, this.r * z * .45]) { ctx.beginPath(); ctx.moveTo(dx * .15, topY - slack); ctx.lineTo(dx * .15, hookY - 30 * z * .3 - slack); ctx.stroke(); }
      ctx.setLineDash([]);
      // spreader bar + straps
      const barY = hookY - 8 * z - slack;
      ctx.fillStyle = '#8b9199'; ctx.fillRect(-this.r * z * .5, barY - z * 1.2, this.r * z, z * 2.4);
      ctx.strokeStyle = '#c9a44a'; ctx.lineWidth = Math.max(3, z * 1.6);
      if (!this.landed) for (const dx of [-this.r * z * .45, this.r * z * .45]) { ctx.beginPath(); ctx.moveTo(dx, barY); ctx.lineTo(dx * 1.9, p.y + this.r * z * K * .1); ctx.stroke(); }
    }
    ctx.restore();
    if (this.landed) return;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(sw * .5); ctx.translate(-p.x, -p.y);
    // straps under the object (sling)
    if (this.kind === 'plate') { drawClearPlate(ctx, p.x, sY(this.y), (this.plateR || this.r + 4) * z, z); }
    drawTier(ctx, this.obj);
    ctx.strokeStyle = '#c9a44a'; ctx.lineWidth = Math.max(3, z * 1.6);
    const g = tierGeom(this.obj);
    ctx.beginPath(); ctx.moveTo(g.cx - g.rx * .86, g.top); ctx.lineTo(g.cx - g.rx * .86, g.bot + g.ry * .5); ctx.moveTo(g.cx + g.rx * .86, g.top); ctx.lineTo(g.cx + g.rx * .86, g.bot + g.ry * .5); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(g.cx, g.bot, g.rx * .86, g.ry * .86, 0, 0, Math.PI); ctx.stroke();
    // shadow on the target below
    const tg = w2s(0, this.targetY), dh = this.y - this.targetY, sh = clamp(1 - dh / (this.h * 2), 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${.28 * sh})`; ctx.beginPath(); ctx.ellipse(tg.x, tg.y, this.r * z * (0.7 + .3 * sh), this.r * z * K * (0.7 + .3 * sh), 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  hint() { const g = tierGeom(this.obj); return { kind: 'drag', pts: [{ x: g.cx, y: (g.top + g.bot) / 2 }, { x: g.cx, y: sY(this.targetY) - 20 }] }; }
}

/* ---------- 2. Board imprint ---------- */
class BoardStep extends Step {
  enter() { this.drag = null; this.pos = null; this.phase = 'wait'; this.anim = 0; }
  items() { return this.phase === 'wait' ? [{ kind: 'board', slot: 1, active: true }] : []; }
  camera() { return camForTier(this.tier, this.tier.h * .35); }
  down(p) { if (this.phase !== 'wait') return; const slot = PLAT.slots[1]; if (nearSlot(p, slot) || this.onTier(p, this.tier)) { this.phase = 'drag'; this.pos = { x: p.x, y: p.y }; SFX.tap(); } }
  move(p) { if (this.phase !== 'drag') return; this.pos.x += (p.x - this.pos.x) * .5; this.pos.y += (p.y - this.pos.y) * .5; this.check(); }
  up(p) { if (this.phase === 'drag') { if (!this.check(true)) { this.phase = 'wait'; } } }
  check(force) {
    const t = this.tier, g = tierGeom(t);
    const d = dist(this.pos.x, this.pos.y, g.cx, g.top);
    if (d < g.rx * (force ? 1.2 : .55)) { this.phase = 'press'; this.anim = 0; SFX.squelch(); return true; }
    return false;
  }
  update(dt) {
    super.update(dt);
    if (this.phase === 'drag') { const s = PLAT.slots[1]; if (!G.pointer.down) { this.pos.x += (s.x - this.pos.x) * dt * 6; this.pos.y += (s.y - this.pos.y) * dt * 6; } }
    if (this.phase === 'press') {
      this.anim += dt;
      if (this.anim > .55 && !this.tier.imprint) {
        const t = this.tier, n = this.n || 5; t.imprint = this.nextR; t.marks = [];
        if (n > 1) for (let i = 0; i < n - 1; i++) t.marks.push({ rho: this.nextR * .58, phi: i / (n - 1) * TAU + .3, filled: false });
        t.marks.push({ rho: 0, phi: 0, filled: false });
        SFX.pop(); G.chefCheer();
      }
      if (this.anim > 1.4) this.finish();
    }
  }
  drawFront(ctx) {
    if (this.phase === 'wait') return;
    const t = this.tier, g = tierGeom(t), z = CAM.zoom;
    let x = this.pos.x, y = this.pos.y, rx = this.nextR * z, ry = rx * K, alpha = 1;
    if (this.phase === 'press') {
      const a = this.anim; x = g.cx;
      if (a < .5) { const u = easeOut(a / .5); y = lerp(this.pos.y, g.top + z * 1.5, u); }
      else if (a < .8) { y = g.top + z * 1.5; }
      else { const u = clamp((a - .8) / .5, 0, 1); y = g.top - u * 90 - u * u * 200; alpha = 1 - u; }
    }
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(g.cx, g.top, rx * .95, ry * .95, 0, 0, TAU); if (this.phase === 'drag') ctx.fill();
    ctx.fillStyle = '#e2d3b3'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d3c19c'; ctx.beginPath(); ctx.ellipse(x, y, rx * .85, ry * .85, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#a58e63'; ctx.lineWidth = Math.max(1.5, z * .5); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.stroke();
    // holes showing where the dowels will go
    const n = this.n || 5; ctx.fillStyle = 'rgba(90,60,30,.55)';
    for (let i = 0; i < n; i++) { const rho = i === n - 1 ? 0 : this.nextR * .58, phi = i === n - 1 ? 0 : i / (n - 1) * TAU + .3, a = phi + G.cake.rot; ctx.beginPath(); ctx.ellipse(x + Math.sin(a) * rho * z, y + Math.cos(a) * rho * z * K, z * 2, z * 2 * K, 0, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  hint() { const s = PLAT.slots[1], g = tierGeom(this.tier); return { kind: 'drag', pts: [{ x: s.x, y: s.y - s.s * .4 }, { x: g.cx, y: g.top }] }; }
}

/* ---------- 3. Insert dowels ---------- */
class DowelStep extends Step {
  enter() { this.tier.dowels = this.tier.dowels || []; this.falling = []; }
  camera() { return camForTier(this.tier, this.tier.h * .35); }
  down(p) { this.tryMark(p); }
  move(p) { this.tryMark(p); }
  tryMark(p) {
    const t = this.tier, z = CAM.zoom, tol = Math.max(z * 9, 40);
    for (const m of t.marks) if (!m.filled) {
      const s = topToScreen(t, m.rho, m.phi);
      if (dist(p.x, p.y, s.x, s.y) < tol) {
        m.filled = true; const d = { rho: m.rho, phi: m.phi, out: rnd(6, 13), cut: false };
        t.dowels.push(d); this.falling.push({ d, from: d.out + 40, t: 0, target: d.out }); d.out = d.out + 40;
        SFX.tap(); break;
      }
    }
  }
  update(dt) {
    super.update(dt);
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i]; f.t += dt; const u = Math.min(1, f.t / .35);
      f.d.out = lerp(f.from, f.target, easeIn(u));
      if (u >= 1) { this.falling.splice(i, 1); SFX.clank(); G.shake(.6); const p = topToScreen(this.tier, f.d.rho, f.d.phi); G.fx.burst(p.x, p.y, 8, { color: '#e6cfa3', speed: 80, r: 2, life: .4 }); }
    }
    if (this.tier.marks.every(m => m.filled) && !this.falling.length) { this.doneT += dt; if (this.doneT > .4) this.finish(); }
  }
  hint() { const m = this.tier.marks.find(m => !m.filled); if (!m) return null; const s = topToScreen(this.tier, m.rho, m.phi); return { kind: 'tap', pts: [s] }; }
}

/* ---------- 4. Level all dowels with one big swipe ---------- */
class LevelStep extends Step {
  enter() { this.x = null; this.minX = Infinity; this.maxX = -Infinity; this.lastX = null; this.cutAll = false; }
  camera() { return camForTier(this.tier, this.tier.h * .35); }
  down(p) { this.x = p.x; this.y = p.y; this.lastX = p.x; this.minX = p.x; this.maxX = p.x; }
  move(p) {
    if (this.x === null) return;
    const t = this.tier, g = tierGeom(t);
    this.x = p.x; this.y = clamp(p.y, g.top - g.ry * 3, g.top + g.ry * 1.5); this.minX = Math.min(this.minX, p.x); this.maxX = Math.max(this.maxX, p.x);
    // blade passes over dowels between lastX and x
    const lo = Math.min(this.lastX, p.x), hi = Math.max(this.lastX, p.x);
    for (const d of t.dowels) if (!d.cut && d.out > 0.1) { const s = topToScreen(t, d.rho, d.phi); if (s.x >= lo - 4 && s.x <= hi + 4) this.cut(d, s); }
    if (Math.abs(p.dx) > 2) SFX.rub(.5);
    this.lastX = p.x;
    if (this.maxX - this.minX > g.rx * 1.3) { for (const d of t.dowels) if (!d.cut) this.cut(d, topToScreen(t, d.rho, d.phi)); }
  }
  cut(d, s) {
    d.cut = true; const piece = d.out; d.out = 0;
    G.fx.add({ x: s.x, y: s.y - piece * CAM.zoom * .5, vx: rnd(-40, 40) + (this.x > this.lastX ? 90 : -90), vy: -160, g: 500, life: 1.1, r: CAM.zoom * 2.2, color: '#d7b98a', kind: 'stick', rot: 0, vr: rnd(-8, 8) });
    G.fx.burst(s.x, s.y, 6, { color: '#ead6b0', speed: 60, r: 1.5, life: .4 }); SFX.click();
  }
  up(p) { this.x = null; }
  update(dt) { super.update(dt); if (this.tier.dowels.every(d => d.cut)) { this.doneT += dt; if (this.doneT > .5) { this.tier.marks = null; this.finish(); } } }
  draw(ctx) {
    const t = this.tier, g = tierGeom(t), z = CAM.zoom;
    // blade rests at the platform side of the tier when idle
    const idleX = clamp(g.cx + g.rx * 1.1 * (PORTRAIT ? 1 : -1), 70, W - 70), idleY = g.top - g.ry * 2.6 + Math.sin(this.t * 3) * 4;
    const x = this.x === null ? idleX : this.x, y = this.x === null ? idleY : this.y;
    drawKnife(ctx, x, y, Math.max(24, g.rx * .45), 0);
  }
  hint() { const g = tierGeom(this.tier); return { kind: 'drag', pts: [{ x: g.cx - g.rx * 1.1, y: g.top - g.ry }, { x: g.cx + g.rx * 1.1, y: g.top - g.ry }] }; }
}

/* ---------- 5. Cream coat by dragging ---------- */
class CreamStep extends Step {
  enter() { const t = this.tier; t.creamGrid = new Grid(NA, NH); t.creamColor = this.color; this.fill = 0; this.active = false; }
  items() { return [{ kind: 'spatula', slot: 1, active: !this.active && this.t < 4 }]; }
  down(p) { this.active = true; this.paint(p); }
  move(p) { if (this.active) this.paint(p); }
  up(p) { this.active = false; }
  paint(p) {
    if (this.fill > 0) return;
    const t = this.tier, s = screenToSide(t, p.x, p.y); if (!s.inX || s.f < -.2 || s.f > 1.2) return;
    const b = 11 + Math.min(10, (p.speed || 0) * .01);
    t.creamGrid.paint(s.th, clamp(s.f, 0, 1), b / t.r, b / t.h, .9);
    if (p.speed > 30) SFX.rub(p.speed / 800);
    if (t.creamGrid.meanFront(G.cake.rot) > .62) { this.fill = 0.001; SFX.chime(0); }
  }
  update(dt) {
    super.update(dt);
    if (this.fill > 0 && this.fill < 1) {
      this.fill = Math.min(1, this.fill + dt * 1.6); const t = this.tier;
      for (let i = 0; i < t.creamGrid.v.length; i++) t.creamGrid.v[i] = Math.max(t.creamGrid.v[i], this.fill);
      if (this.fill >= 1) { t.surface = 'cream'; t.creamGrid = null; t.rough = new Float32Array(NA).fill(1); this.finish(); }
    }
  }
  draw(ctx) { if (this.active && G.pointer.down) drawSpatula(ctx, G.pointer.x + 14, G.pointer.y - 6, Math.max(30, CAM.zoom * 8), -.6); }
  hint() { const g = tierGeom(this.tier); const pts = []; for (let i = 0; i < 5; i++) pts.push({ x: g.cx - g.rx * .7 + i * g.rx * .35, y: i % 2 ? g.bot - g.ry : g.top + g.ry * 1.5 }); return { kind: 'drag', pts }; }
}

/* ---------- 6. Turntable + fixed scraper ---------- */
class TurntableStep extends Step {
  enter() { const t = this.tier; if (!t.rough) t.rough = new Float32Array(NA).fill(1); this.bladeIn = 0; this.spun = 0; this.last = null; this.doneAnim = 0; }
  bladeAngle() { return PORTRAIT ? 1.05 : -1.05; }
  down(p) { this.last = { x: p.x, y: p.y }; }
  move(p) {
    if (!this.last || this.doneAnim > 0) return;
    const g = tierGeom(this.tier);
    let d = p.dx / g.rx;
    const a0 = angleAround(g, this.last.x, this.last.y), a1 = angleAround(g, p.x, p.y);
    const circ = wrapAng(a1 - a0);
    if (Math.abs(circ) < 1 && dist(p.x, p.y, g.cx, (g.top + g.bot) / 2) > g.rx * .5) d = (Math.abs(circ) > Math.abs(d)) ? circ : d;
    G.cake.rotVel = clamp(G.cake.rotVel * .5 + d / Math.max(.008, G.dt) * .5, -9, 9);
    this.last = { x: p.x, y: p.y };
  }
  up(p) { this.last = null; }
  update(dt) {
    super.update(dt); const t = this.tier, cake = G.cake;
    this.bladeIn = Math.min(1, this.bladeIn + dt * 2.5);
    if (this.doneAnim > 0) { this.doneAnim += dt; this.bladeIn = Math.max(0, 1 - (this.doneAnim - .3) * 2); if (this.doneAnim > 1.1) this.finish(); return; }
    const w = Math.abs(cake.rotVel);
    if (w > .05 && this.bladeIn >= 1) {
      const cw = TAU / NA, ab = this.bladeAngle();
      let maxr = 0;
      for (let a = 0; a < NA; a++) {
        const ang = (a + .5) * cw - Math.PI + cake.rot;
        if (Math.abs(wrapAng(ang - ab)) < cw * 1.8) t.rough[a] = Math.max(0, t.rough[a] - dt * w * .6);
        maxr = Math.max(maxr, t.rough[a]);
      }
      SFX.grind(Math.min(1, w / 3));
      if (Math.random() < w * dt * 3) { const s = sideToScreen(t, ab - cake.rot, t.y0 + rnd(t.h)); G.fx.add({ x: s.x + 8 * Math.sign(ab), y: s.y, vx: rnd(20, 60) * Math.sign(ab), vy: rnd(-30, 20), g: 300, life: .6, r: 3, color: t.creamColor, kind: 'dot', rot: 0, vr: 0 }); }
      if (maxr < .06) { this.doneAnim = .001; t.rough = null; SFX.ding(); G.chefCheer(); }
    }
  }
  draw(ctx) {
    const t = this.tier, g = tierGeom(t), z = CAM.zoom, ab = this.bladeAngle();
    const sx = g.cx + Math.sin(ab) * g.rx, side = Math.sign(ab);
    const off = (1 - this.bladeIn) * 140 * side;
    const bx = sx + off + side * z * .6, wBlade = Math.max(10, z * 3.5);
    ctx.save();
    const gr = ctx.createLinearGradient(bx, 0, bx + side * wBlade, 0); gr.addColorStop(0, '#f6f8fb'); gr.addColorStop(1, '#8e959e');
    ctx.fillStyle = gr; ctx.fillRect(Math.min(bx, bx + side * wBlade), g.top - g.ry * .5 - z * 2, wBlade, g.bot - g.top + g.ry * 1.5 + z * 4);
    // holder arm to the platform
    ctx.strokeStyle = '#5f646c'; ctx.lineWidth = Math.max(4, z * 1.4); ctx.beginPath(); ctx.moveTo(bx + side * wBlade, (g.top + g.bot) / 2); ctx.lineTo(bx + side * wBlade + side * 70, (g.top + g.bot) / 2 + 40); ctx.stroke();
    ctx.fillStyle = '#3a3e45'; ctx.beginPath(); ctx.arc(bx + side * wBlade + side * 70, (g.top + g.bot) / 2 + 40, Math.max(6, z * 2), 0, TAU); ctx.fill();
    // rotation arrow-less motion cue: little spin marks on the top rim
    ctx.restore();
  }
  hint() { const g = tierGeom(this.tier); return { kind: 'drag', pts: [{ x: g.cx - g.rx * .8, y: (g.top + g.bot) / 2 }, { x: g.cx + g.rx * .8, y: (g.top + g.bot) / 2 }], repeat: true }; }
}

/* ---------- 7. Fondant drape ---------- */
class DrapeStep extends Step {
  enter() { this.phase = 'wait'; this.pos = null; this.drop = 0; this.wob = 0; this.vel = { x: 0, y: 0 }; }
  items() { return this.phase === 'wait' ? [{ kind: 'fondant', slot: 1, active: true, color: this.color }] : []; }
  camera() { return camForTier(this.tier, this.tier.h * .5); }
  down(p) { if (this.phase !== 'wait') return; if (nearSlot(p, PLAT.slots[1]) || this.onTier(p, this.tier, 1.3)) { this.phase = 'drag'; this.pos = { x: p.x, y: p.y }; SFX.swish(); } }
  move(p) { if (this.phase !== 'drag') return; this.vel.x = p.dx; this.vel.y = p.dy; this.check(false); }
  up(p) { if (this.phase === 'drag' && !this.check(true)) this.phase = 'back'; }
  check(force) {
    const g = tierGeom(this.tier);
    if (Math.abs(this.pos.x - g.cx) < g.rx * (force ? 1.1 : .5) && this.pos.y < g.top + g.ry * (force ? 3 : .5)) { this.phase = 'drop'; this.drop = 0; SFX.fasa(); return true; }
    return false;
  }
  update(dt) {
    super.update(dt);
    const s = PLAT.slots[1], g = tierGeom(this.tier);
    if (this.phase === 'drag') { this.pos.x += (G.pointer.x - this.pos.x) * Math.min(1, dt * 10); this.pos.y += (G.pointer.y - this.pos.y) * Math.min(1, dt * 10); this.wob += dt * 6; }
    if (this.phase === 'back') { this.pos.x += (s.x - this.pos.x) * dt * 5; this.pos.y += (s.y - this.pos.y) * dt * 5; if (dist(this.pos.x, this.pos.y, s.x, s.y) < 6) this.phase = 'wait'; }
    if (this.phase === 'drop') {
      this.drop += dt;
      if (this.drop > .55 && !this.applied) {
        this.applied = true; const t = this.tier;
        t.surface = 'fondant'; t.fondant = { color: this.color, wrinkles: [], skirt: 1, skirtLen: Math.max(6, t.h * .28), skirtFall: 0 };
        const n = 10 + Math.floor(t.h / 5);
        for (let i = 0; i < n; i++) t.fondant.wrinkles.push({ th: rnd(-1.25, 1.25) - G.cake.rot, y: rnd(0, t.h * .3), len: rnd(t.h * .35, t.h * .8), amp: rnd(.7, 1.2), tilt: rnd(-.1, .1), bend: rnd(-3, 3) });
        t.rough = null; t.pearls = t.pearls || null;
        G.puff(0, t.y0 + t.h, t.r, '#ffffff'); G.shake(.4); G.chefCheer();
      }
      if (this.drop > 1.2) this.finish();
    }
  }
  drawFront(ctx) {
    if (this.phase === 'wait') return;
    const t = this.tier, g = tierGeom(t), z = CAM.zoom, col = this.color;
    const sw = g.rx * 2.6, sh = (t.h + t.r * 1.2) * z; // sheet size
    ctx.save();
    if (this.phase === 'drop') {
      const u = clamp(this.drop / .55, 0, 1), e = easeIn(u);
      // sheet falls and wraps: draw top ellipse growing + sides
      const y = lerp(this.pos.y, g.top, e), spread = lerp(1.15, 1.0, e);
      ctx.globalAlpha = 1 - clamp((this.drop - .55) / .3, 0, 1);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(g.cx, y, g.rx * spread * (1 + .2 * (1 - e)), g.ry * spread + (1 - e) * 30, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(g.cx - g.rx * spread, y); ctx.lineTo(g.cx - g.rx * spread * (1 + .05 * (1 - e)), y + sh * .6 * e); ctx.lineTo(g.cx + g.rx * spread * (1 + .05 * (1 - e)), y + sh * .6 * e); ctx.lineTo(g.cx + g.rx * spread, y); ctx.closePath(); ctx.fill();
      ctx.restore(); return;
    }
    const x = this.pos.x, y = this.pos.y;
    // big floppy sheet hanging from the finger, corners lag & flutter with altitude wind
    const alt = clamp(t.y0 / 300, 0, 1), fl = (3 + alt * 10);
    const lagx = clamp(-this.vel.x * 1.2, -60, 60), lagy = clamp(-this.vel.y * .8, -40, 40);
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(x, y + sh * .45, sw * .5, sw * .5 * K, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(x - sw * .12, y - 6); ctx.lineTo(x + sw * .12, y - 6);
    ctx.quadraticCurveTo(x + sw * .5 + lagx, y + sh * .35 + Math.sin(this.wob) * fl, x + sw * .48 + lagx * 1.4, y + sh * .8 + lagy + Math.cos(this.wob * 1.3) * fl);
    ctx.quadraticCurveTo(x + lagx * .5, y + sh * .95 + Math.sin(this.wob * .7) * fl, x - sw * .48 + lagx * 1.4, y + sh * .8 + lagy + Math.sin(this.wob * 1.1) * fl);
    ctx.quadraticCurveTo(x - sw * .5 + lagx, y + sh * .35 + Math.cos(this.wob) * fl, x - sw * .12, y - 6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 2; ctx.stroke();
    // folds
    ctx.strokeStyle = 'rgba(0,0,0,.09)'; ctx.lineWidth = Math.max(2, z * .8);
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * sw * .05, y + 4); ctx.quadraticCurveTo(x + i * sw * .18 + lagx * .5, y + sh * .5, x + i * sw * .2 + lagx, y + sh * .8 + lagy); ctx.stroke(); }
    ctx.restore();
  }
  hint() { const s = PLAT.slots[1], g = tierGeom(this.tier); return { kind: 'drag', pts: [{ x: s.x, y: s.y - s.s * .4 }, { x: g.cx, y: g.top - g.ry }] }; }
}

/* ---------- 8. Smooth wrinkles top→bottom ---------- */
class SmoothStep extends Step {
  enter() { this.active = false; this.sheen = 0; }
  items() { return [{ kind: 'smoother', slot: 1, active: !this.active && this.t < 4 }]; }
  down(p) { this.active = true; }
  move(p) {
    if (!this.active || this.sheen > 0) return;
    const t = this.tier, f = t.fondant, z = CAM.zoom, br = Math.max(24, z * 11);
    const down = p.dy > 0 ? 1 : .35; let hit = 0;
    for (const w of f.wrinkles) {
      if (w.amp <= 0) continue;
      const mid = sideToScreen(t, w.th, t.y0 + t.h - w.y - w.len * .5); if (mid.depth < 0) continue;
      const d = dist(p.x, p.y, mid.x, mid.y);
      if (d < br + w.len * z * .5) { const k = Math.hypot(p.dx, p.dy) / (12 * z) * .35 * down; w.amp -= k; w.y += k * t.h * .6; hit++; if (w.y + w.len > t.h) w.len = Math.max(0, t.h - w.y); if (w.amp < .06 || w.len < 2) w.amp = 0; }
    }
    if (hit && p.speed > 20) SFX.rub(.4);
    if (f.wrinkles.every(w => w.amp <= 0)) { this.sheen = .001; f.wrinkles = null; SFX.ding(); G.chefCheer(); }
  }
  up(p) { this.active = false; }
  update(dt) { super.update(dt); if (this.sheen > 0) { this.sheen += dt; if (this.sheen > 1.0) this.finish(); } }
  draw(ctx) {
    const t = this.tier, g = tierGeom(t);
    if (this.active && G.pointer.down && this.sheen === 0) drawSmoother(ctx, G.pointer.x, G.pointer.y, Math.max(34, CAM.zoom * 9));
    if (this.sheen > 0) { ctx.save(); bodyPath(ctx, g); ctx.clip(); const u = this.sheen / 1.0, x = g.cx - g.rx * 1.3 + u * g.rx * 2.6; const gr = ctx.createLinearGradient(x - 40, 0, x + 40, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gr; ctx.fillRect(x - 40, g.top - g.ry, 80, g.bot - g.top + g.ry * 2); ctx.restore(); }
  }
  hint() { const t = this.tier, w = (t.fondant.wrinkles || []).find(w => w.amp > 0); if (!w) return null; const a = sideToScreen(t, w.th, t.y0 + t.h), b = sideToScreen(t, w.th, t.y0); return { kind: 'drag', pts: [{ x: a.x, y: a.y - 10 }, { x: b.x, y: b.y }] }; }
}

/* ---------- 9. Trim the skirt ---------- */
class TrimStep extends Step {
  enter() { this.bins = new Array(20).fill(false); this.active = false; this.spin = 0; this.falling = 0; }
  items() { return [{ kind: 'wheel', slot: 1, active: !this.active && this.t < 4 }]; }
  down(p) { this.active = true; this.trace(p); }
  move(p) { if (this.active) this.trace(p); }
  up(p) { this.active = false; }
  trace(p) {
    if (this.falling > 0) return;
    const t = this.tier, g = tierGeom(t), z = CAM.zoom;
    const s = clamp((p.x - g.cx) / g.rx, -1, 1), a = Math.asin(s), rimY = g.bot + Math.cos(a) * g.ry;
    const tol = Math.max(30, z * 8) + t.fondant.skirtLen * z * .5;
    if (Math.abs(p.x - g.cx) <= g.rx * 1.08 && Math.abs(p.y - rimY - t.fondant.skirtLen * z * .1) < tol) {
      const i = Math.floor((a + Math.PI / 2) / Math.PI * this.bins.length);
      for (let k = i - 1; k <= i + 1; k++) if (k >= 0 && k < this.bins.length && !this.bins[k]) { this.bins[k] = true; SFX.tick(); }
      this.spin += Math.hypot(p.dx, p.dy) * .05;
      if (this.bins.filter(b => b).length >= this.bins.length * .85) { this.falling = .001; SFX.swish(); G.chefCheer(); }
    }
  }
  update(dt) {
    super.update(dt);
    if (this.falling > 0) { this.falling += dt; const f = this.tier.fondant; f.skirtFall = clamp(this.falling / .8, 0, 1); if (this.falling > .9) { f.skirt = 0; this.finish(); } }
  }
  draw(ctx) {
    const t = this.tier, g = tierGeom(t), z = CAM.zoom;
    // dotted cut guide where already traced
    ctx.save(); ctx.strokeStyle = 'rgba(80,60,60,.35)'; ctx.lineWidth = Math.max(2, z * .6); ctx.setLineDash([z * 1.5, z * 1.5]);
    ctx.beginPath(); let started = false; for (let i = 0; i < this.bins.length; i++) { if (!this.bins[i]) { started = false; continue; } const a0 = -Math.PI / 2 + i / this.bins.length * Math.PI, a1 = a0 + Math.PI / this.bins.length; for (const a of [a0, a1]) { const x = g.cx + Math.sin(a) * g.rx, y = g.bot + Math.cos(a) * g.ry; started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true; } } ctx.stroke(); ctx.restore();
    if (this.active && G.pointer.down && this.falling === 0) drawWheel(ctx, G.pointer.x, G.pointer.y, Math.max(26, z * 7), this.spin);
  }
  hint() { const g = tierGeom(this.tier); const pts = []; for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + i / 6 * Math.PI; pts.push({ x: g.cx + Math.sin(a) * g.rx, y: g.bot + Math.cos(a) * g.ry }); } return { kind: 'drag', pts }; }
}

/* ---------- 10. Pearl border ---------- */
class PearlStep extends Step {
  enter() { this.tier.pearls = this.tier.pearls || []; this.bins = new Array(16).fill(false); this.last = null; this.active = false; this.count = 0; }
  items() { return [{ kind: 'pearls', slot: 1, active: this.t < 5 && !this.active }]; }
  down(p) { this.active = true; this.last = null; this.trace(p); }
  move(p) { if (this.active) this.trace(p); }
  up(p) { this.active = false; }
  trace(p) {
    const t = this.tier, g = tierGeom(t), z = CAM.zoom;
    const s = clamp((p.x - g.cx) / g.rx, -1, 1), a = Math.asin(s), rimY = g.bot + Math.cos(a) * g.ry;
    if (Math.abs(p.x - g.cx) > g.rx * 1.1 || Math.abs(p.y - rimY) > Math.max(34, z * 10)) return;
    const size = clamp(2.2 + (p.speed || 0) * .0025, 2.2, 3.6);
    const x = g.cx + Math.sin(a) * g.rx * 1.02, y = rimY - size * z * .6;
    if (!this.last || dist(x, y, this.last.x, this.last.y) > size * z * 2.1) {
      this.last = { x, y }; t.pearls.push({ th: wrapAng(a - G.cake.rot), y: t.y0 + size * .9, size, color: this.color || '#fdf6ec' });
      SFX.pearl(this.count++);
      const i = Math.floor((a + Math.PI / 2) / Math.PI * this.bins.length); if (i >= 0 && i < this.bins.length) this.bins[i] = true;
      if (this.bins.filter(b => b).length >= this.bins.length * .8) this.completeBack();
    }
  }
  completeBack() {
    // mirror the front pattern to the hidden back half so it is complete when the cake turns later
    const t = this.tier, front = t.pearls.filter(p => Math.cos(p.th + G.cake.rot) > 0);
    for (const p of front) t.pearls.push({ th: wrapAng(p.th + Math.PI), y: p.y, size: p.size, color: p.color });
    this.finish();
  }
  hint() { const g = tierGeom(this.tier); const pts = []; for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + i / 6 * Math.PI; pts.push({ x: g.cx + Math.sin(a) * g.rx, y: g.bot + Math.cos(a) * g.ry - 6 }); } return { kind: 'drag', pts }; }
}

/* ---------- 11. Spread filling on top (jam) ---------- */
class TopPaintStep extends Step {
  enter() { const t = this.tier; t.topGrid = new Grid(24, 5); t.topColor = this.color; this.fill = 0; this.active = false; }
  items() { return [{ kind: 'spatula', slot: 1, active: !this.active && this.t < 4 }]; }
  camera() { return camForTier(this.tier, this.tier.h * .4); }
  down(p) { this.active = true; this.paint(p); }
  move(p) { if (this.active) this.paint(p); }
  up(p) { this.active = false; }
  paint(p) {
    if (this.fill > 0) return;
    const t = this.tier, g = tierGeom(t);
    const ex = (p.x - g.cx) / g.rx, ey = (p.y - g.top) / g.ry; if (ex * ex + ey * ey > 1.3) return;
    const phi = Math.atan2(p.x - g.cx, (p.y - g.top) / K) - G.cake.rot, rho = Math.hypot(p.x - g.cx, (p.y - g.top) / K) / CAM.zoom;
    const b = 9;
    t.topGrid.paint(phi, rho / t.r, b / Math.max(rho, 8), b / t.r, .9);
    if (p.speed > 30) SFX.rub(.3);
    if (t.topGrid.mean() > .6) { this.fill = .001; SFX.chime(1); }
  }
  update(dt) {
    super.update(dt);
    if (this.fill > 0 && this.fill < 1) { this.fill = Math.min(1, this.fill + dt * 1.8); const g = this.tier.topGrid; for (let i = 0; i < g.v.length; i++) g.v[i] = Math.max(g.v[i], this.fill); if (this.fill >= 1) this.finish(); }
  }
  draw(ctx) { if (this.active && G.pointer.down) drawSpatula(ctx, G.pointer.x + 12, G.pointer.y - 8, Math.max(30, CAM.zoom * 8), -.9); }
  hint() { const g = tierGeom(this.tier); const pts = []; for (let i = 0; i < 5; i++) pts.push({ x: g.cx - g.rx * .6 + i * g.rx * .3, y: g.top + (i % 2 ? .6 : -.6) * g.ry }); return { kind: 'drag', pts }; }
}

/* ---------- 12. Central support rod: press & hold, x-ray view ---------- */
class RodStep extends Step {
  // tis: indices of tiers the rod passes through, top first
  enter() {
    const top = G.cake.tiers[this.tis[0]], bottom = G.cake.tiers[this.tis[this.tis.length - 1]];
    this.len = top.h + 10; this.topY = top.y0 + top.h;
    top.rod = { len: this.len, depth: .45, showHead: true, topY: this.topY };
    for (const i of this.tis) G.cake.tiers[i].rodRef = top.rod;
    this.holding = false; this.hit = false; this.hammer = 0;
  }
  camera() { const t = G.cake.tiers[this.tis[0]]; const above = this.len * .55 + 8; return { y: this.topY - t.h * .5 + above * .5, zoom: fitZoom(t.r, t.h + above) }; }
  down(p) { const t = G.cake.tiers[this.tis[0]], g = tierGeom(t); const rod = t.rod, above = rod.len * (1 - rod.depth) * CAM.zoom; if (Math.abs(p.x - g.cx) < g.rx * .75 && p.y < g.top + g.ry * 2 && p.y > g.top - above - 80) { this.holding = true; } }
  up(p) { this.holding = false; }
  move(p) { }
  update(dt) {
    super.update(dt);
    const rod = G.cake.tiers[this.tis[0]].rod;
    for (const i of this.tis) { const t = G.cake.tiers[i]; t.xray = clamp((t.xray || 0) + (this.holding && !this.hit ? dt * 2 : -dt * 1.5), 0, 1); }
    if (this.holding && !this.hit) {
      this.hammer += dt * 7; rod.depth = Math.min(1, rod.depth + dt * .2);
      if (Math.floor(this.hammer) !== Math.floor(this.hammer - dt * 7)) { SFX.metalHit(); G.shake(.5); }
      if (rod.depth >= 1) { this.hit = true; this.holding = false; rod.showHead = false; SFX.thud(); G.shake(3); const t = G.cake.tiers[this.tis[0]], p = topToScreen(t, 0, 0); G.fx.burst(p.x, p.y, 20, { colors: ['#fff', '#ffe08a'], speed: 140, r: 3, life: .5, kind: 'spark' }); G.chefCheer(); }
    }
    if (this.hit) { this.doneT += dt; if (this.doneT > 1.0) { for (const i of this.tis) { G.cake.tiers[i].xray = 0; G.cake.tiers[i].rodRef = null; } G.cake.tiers[this.tis[0]].rod = null; this.finish(); } }
  }
  draw(ctx) {
    const t = G.cake.tiers[this.tis[0]], g = tierGeom(t), rod = t.rod, z = CAM.zoom; if (!rod) return;
    const above = rod.len * (1 - rod.depth) * z, hx = g.cx, hy = g.top - above;
    if (this.holding && !this.hit) { const k = Math.abs(Math.sin(this.hammer * Math.PI)); drawMallet(ctx, hx + z * 6, hy - z * 4 - k * 30, Math.max(40, z * 10), -.6 + k * .5); }
    else if (!this.hit) { drawMallet(ctx, hx + z * 8 + Math.sin(this.t * 3) * 4, hy - z * 6, Math.max(40, z * 10), -.6); }
  }
  hint() { const t = G.cake.tiers[this.tis[0]], g = tierGeom(t), rod = t.rod; return { kind: 'hold', pts: [{ x: g.cx, y: g.top - rod.len * (1 - rod.depth) * CAM.zoom }] }; }
}

/* ---------- 13. Ganache pour around the rim ---------- */
class PourStep extends Step {
  enter() { const t = this.tier; t.drips = []; t.creamColor = this.color; t.topGrid = new Grid(24, 5); t.topColor = this.color; this.phase = 'wait'; this.pos = null; this.fill = 0; this.bins = new Array(NA).fill(false); }
  items() { return this.phase === 'wait' ? [{ kind: 'bowl', slot: 1, active: true }] : []; }
  camera() { return camForTier(this.tier, this.tier.h * .3); }
  down(p) { if (this.phase === 'wait' && (nearSlot(p, PLAT.slots[1]) || this.onTier(p, this.tier))) { this.phase = 'drag'; this.pos = { x: p.x, y: p.y }; SFX.tap(); } }
  move(p) { if (this.phase !== 'drag' || this.fill > 0) return; this.pour(p); }
  up(p) { if (this.phase === 'drag' && this.fill === 0) this.phase = 'back'; }
  pour(p) {
    const t = this.tier, g = tierGeom(t);
    const ex = (p.x - g.cx) / g.rx, ey = (p.y - g.top) / g.ry; const rr = Math.sqrt(ex * ex + ey * ey);
    if (rr > 1.35 || p.y > g.bot) return;
    const phi = Math.atan2(p.x - g.cx, (p.y - g.top) / K), rho = Math.min(1, rr);
    t.topGrid.paint(phi - G.cake.rot, rho, 22 / t.r / Math.max(.3, rho), 12 / t.r, .8);
    if (rr > .55) { // near the rim: drips over the edge
      const th = wrapAng(phi - G.cake.rot), a = Math.floor((th + Math.PI) / TAU * NA);
      if (!this.bins[a]) { this.bins[a] = true; t.drips.push({ th, w: rnd(2.5, 4.5), len: 0, target: rnd(t.h * .3, t.h * .8) }); SFX.squelch(); }
      const front = this.bins.filter((b, i) => b && Math.cos((i + .5) / NA * TAU - Math.PI + G.cake.rot) > .1).length, tot = this.bins.filter((b, i) => Math.cos((i + .5) / NA * TAU - Math.PI + G.cake.rot) > .1).length;
      if (front >= tot * .7) { this.fill = .001; this.phase = 'done'; SFX.chime(2); G.chefCheer(); }
    }
  }
  update(dt) {
    super.update(dt); const t = this.tier, s = PLAT.slots[1];
    if (this.phase === 'drag') { this.pos.x += (G.pointer.x - this.pos.x) * Math.min(1, dt * 12); this.pos.y += (G.pointer.y - this.pos.y) * Math.min(1, dt * 12); }
    if (this.phase === 'back') { this.pos.x += (s.x - this.pos.x) * dt * 5; this.pos.y += (s.y - this.pos.y) * dt * 5; if (dist(this.pos.x, this.pos.y, s.x, s.y) < 6) this.phase = 'wait'; }
    for (const d of t.drips) d.len = Math.min(d.target, d.len + dt * t.h * .5);
    if (this.fill > 0) {
      this.fill = Math.min(1, this.fill + dt * .8);
      for (const d of t.drips) d.target = Math.max(d.target, t.h * 1.2 * this.fill);
      for (let i = 0; i < t.topGrid.v.length; i++) t.topGrid.v[i] = Math.max(t.topGrid.v[i], this.fill);
      for (let a = 0; a < NA; a++) if (!this.bins[a] && Math.random() < dt * 3) { this.bins[a] = true; t.drips.push({ th: (a + .5) / NA * TAU - Math.PI, w: rnd(2.5, 4.5), len: 0, target: t.h * 1.2 }); }
      if (this.fill >= 1 && t.drips.every(d => d.len >= t.h * 1.1)) { t.surface = 'cream'; t.drips = null; t.topGrid = null; t.rough = new Float32Array(NA).fill(1); this.finish(); }
    }
  }
  drawFront(ctx) {
    if (this.phase === 'wait' || !this.pos) return;
    const z = CAM.zoom, s = Math.max(40, z * 9), x = this.pos.x, y = this.pos.y;
    ctx.save(); ctx.translate(x, y); ctx.rotate(this.phase === 'drag' ? .9 : .2);
    ctx.fillStyle = '#f4f4f6'; ctx.beginPath(); ctx.moveTo(-s * .8, -s * .55); ctx.lineTo(-s * .55, s * 0); ctx.lineTo(s * .55, s * 0); ctx.lineTo(s * .8, -s * .55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = this.color; ctx.beginPath(); ctx.ellipse(0, -s * .55, s * .8, s * .25, 0, 0, TAU); ctx.fill();
    ctx.restore();
    if (this.phase === 'drag' && this.fill === 0) { // pouring stream
      ctx.fillStyle = this.color; ctx.beginPath(); ctx.moveTo(x + s * .45, y - s * .5); ctx.quadraticCurveTo(x + s * .5, y + 20, x + s * .35, y + 60); ctx.lineTo(x + s * .55, y + 60); ctx.quadraticCurveTo(x + s * .7, y + 10, x + s * .6, y - s * .55); ctx.closePath(); ctx.fill(); }
  }
  hint() { const s = PLAT.slots[1], g = tierGeom(this.tier); const pts = [{ x: s.x, y: s.y - s.s * .4 }]; for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i / 5 * Math.PI; pts.push({ x: g.cx + Math.sin(a) * g.rx * .9, y: g.top + Math.cos(a) * g.ry * .9 }); } return { kind: 'drag', pts }; }
}

/* ---------- 14. Ribbon wrap + bow ---------- */
class RibbonStep extends Step {
  enter() { this.phase = 'wait'; this.pos = null; this.last = null; }
  items() { return this.phase === 'wait' ? [{ kind: 'spool', slot: 1, active: true, color: this.color }] : []; }
  down(p) {
    const t = this.tier;
    if (this.phase === 'wait' && (nearSlot(p, PLAT.slots[1]) || this.onTier(p, t))) { this.phase = 'drag'; this.pos = { x: p.x, y: p.y }; SFX.tap(); }
    else if (this.phase === 'wrap') { this.last = { x: p.x, y: p.y }; }
    else if (this.phase === 'tie') { const s = sideToScreen(t, t.ribbon.start, t.y0 + t.h * t.ribbon.f); if (dist(p.x, p.y, s.x, s.y) < Math.max(50, CAM.zoom * 12)) { this.phase = 'bow'; SFX.pop(); } }
  }
  move(p) {
    const t = this.tier;
    if (this.phase === 'drag') { this.pos = { x: p.x, y: p.y }; if (this.onTier(p, t, 1.0)) { const s = screenToSide(t, p.x, p.y); t.ribbon = { start: s.th, progress: 0.02, f: this.f, w: this.w, color: this.color, bow: 0 }; this.phase = 'wrap'; this.last = { x: p.x, y: p.y }; SFX.click(); } }
    else if (this.phase === 'wrap' && this.last) {
      const g = tierGeom(t); let d = Math.abs(p.dx) / (TAU * g.rx) * 1.6;
      const circ = Math.abs(wrapAng(angleAround(g, p.x, p.y) - angleAround(g, this.last.x, this.last.y))); if (circ < 1 && circ / TAU > d) d = circ / TAU;
      t.ribbon.progress = Math.min(1, t.ribbon.progress + d);
      G.cake.rot = -(t.ribbon.start + t.ribbon.progress * TAU); // the cake turns as the ribbon wraps
      if (p.speed > 20) SFX.rub(.3);
      this.last = { x: p.x, y: p.y };
      if (t.ribbon.progress >= 1) { this.phase = 'tie'; SFX.chime(3); }
    }
  }
  up(p) { if (this.phase === 'drag') this.phase = 'wait'; this.last = null; }
  update(dt) { super.update(dt); const t = this.tier; if (this.phase === 'bow') { t.ribbon.bow = Math.min(1, t.ribbon.bow + dt * 3); if (t.ribbon.bow >= 1) { this.doneT += dt; if (this.doneT > .5) { G.chefCheer(); this.finish(); } } } }
  drawFront(ctx) { if (this.phase === 'drag' && this.pos) { ctx.save(); ctx.__ribbonColor = this.color; drawItem(ctx, 'spool', this.pos.x, this.pos.y + 20, Math.max(30, CAM.zoom * 8), false, this.t); ctx.restore(); } }
  hint() {
    const t = this.tier, g = tierGeom(t);
    if (this.phase === 'wait') { const s = PLAT.slots[1]; return { kind: 'drag', pts: [{ x: s.x, y: s.y - s.s * .4 }, { x: g.cx, y: g.top + (g.bot - g.top) * (1 - this.f) }] }; }
    if (this.phase === 'wrap') return { kind: 'drag', pts: [{ x: g.cx - g.rx * .8, y: g.top + (g.bot - g.top) * (1 - this.f) }, { x: g.cx + g.rx * .8, y: g.top + (g.bot - g.top) * (1 - this.f) }], repeat: true };
    if (this.phase === 'tie') { const s = sideToScreen(t, t.ribbon.start, t.y0 + t.h * this.f); return { kind: 'tap', pts: [s] }; }
    return null;
  }
}

/* ---------- 15. Clear pillars rise from sockets ---------- */
class PillarStep extends Step {
  enter() { const t = this.tier; t.sockets = []; t.pillars = []; for (let i = 0; i < this.n; i++) t.sockets.push({ rho: this.rho, phi: i / this.n * TAU + .4, filled: false }); }
  camera() { return camForTier(this.tier, this.tier.h * .4 + this.h); }
  items() { return [{ kind: 'pillars', slot: 1, active: this.t < 4 }]; }
  down(p) { this.tryTap(p); } move(p) { this.tryTap(p); }
  tryTap(p) {
    const t = this.tier, tol = Math.max(44, CAM.zoom * 9);
    for (const s of t.sockets) if (!s.filled) { const q = topToScreen(t, s.rho, s.phi); if (dist(p.x, p.y, q.x, q.y) < tol) { s.filled = true; t.pillars.push({ rho: s.rho, phi: s.phi, h: this.h, up: 0.001 }); SFX.glass(); break; } }
  }
  update(dt) {
    super.update(dt); const t = this.tier;
    for (const pl of t.pillars) if (pl.up < 1) { pl.up = Math.min(1, pl.up + dt * 2.2); if (pl.up >= 1) { const q = topToScreen(t, pl.rho, pl.phi); G.fx.burst(q.x, q.y - this.h * CAM.zoom, 8, { colors: ['#fff', '#bfe6ff'], speed: 60, r: 2, life: .5, kind: 'spark' }); } }
    if (t.sockets.every(s => s.filled) && t.pillars.every(p => p.up >= 1)) { this.doneT += dt; if (this.doneT > .4) { t.sockets = null; this.finish(); } }
  }
  hint() { const s = (this.tier.sockets || []).find(s => !s.filled); if (!s) return null; return { kind: 'tap', pts: [topToScreen(this.tier, s.rho, s.phi)] }; }
}

/* ---------- 16. Ruffles: pipe wavy bands ---------- */
class RuffleStep extends Step {
  enter() { const t = this.tier; t.ruffles = []; this.slots = new Array(this.bands).fill(false); this.path = null; }
  items() { return [{ kind: 'bag', slot: 1, active: this.t < 4 && !this.path, color: this.color }]; }
  down(p) { this.path = []; this.add(p); }
  move(p) { if (this.path) { this.add(p); if (p.speed > 20) SFX.rub(.25); } }
  add(p) { const t = this.tier; if (this.onTier(p, t, 1.2)) this.path.push({ x: p.x, y: p.y }); }
  up(p) {
    const path = this.path; this.path = null; if (!path || path.length < 4) return;
    const t = this.tier, g = tierGeom(t);
    const xs = path.map(q => q.x), minX = Math.min(...xs), maxX = Math.max(...xs);
    if (maxX - minX < g.rx * .9) { SFX.click(); return; }
    const ys = path.map(q => q.y), my = ys.reduce((a, b) => a + b) / ys.length;
    let jit = 0, turns = 0; for (let i = 1; i < path.length; i++) { jit += Math.abs(path[i].y - my); if (i > 1 && Math.sign(path[i].y - path[i - 1].y) !== Math.sign(path[i - 1].y - path[i - 2].y)) turns++; }
    jit /= path.length;
    const f = clamp(1 - (my - g.top) / (g.bot - g.top), 0.02, .98);
    let best = 0, bd = 9; for (let i = 0; i < this.bands; i++) { const d = Math.abs(f - (i + .5) / this.bands); if (d < bd) { bd = d; best = i; } }
    this.slots[best] = true;
    const hgt = t.h / this.bands * 1.15;
    t.ruffles = t.ruffles.filter(r => r.slot !== best);
    t.ruffles.push({ slot: best, f: (best + .5) / this.bands - .5 / this.bands, hgt, amp: clamp(.4 + jit / CAM.zoom * .35, .5, 2.4), freq: clamp(.5 + turns * .04, .55, 1.4), ph: rnd(TAU), color: this.color });
    t.ruffles.sort((a, b) => b.slot - a.slot);
    SFX.pop(); G.fx.burst(g.cx, my, 8, { color: this.color, speed: 50, r: 3, life: .4 });
    if (this.slots.every(s => s)) { G.chefCheer(); this.finish(); }
  }
  draw(ctx) {
    if (!this.path) return;
    const z = CAM.zoom; ctx.save(); ctx.strokeStyle = this.color; ctx.lineWidth = Math.max(8, z * 3.5); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); this.path.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = Math.max(3, z * 1.2); ctx.stroke(); ctx.restore();
    drawPipingBag(ctx, G.pointer.x + 10, G.pointer.y - 30, Math.max(36, z * 9), -.5, this.color);
  }
  hint() { const g = tierGeom(this.tier); const i = this.slots.findIndex(s => !s); if (i < 0) return null; const y = g.top + (g.bot - g.top) * (1 - (i + .5) / this.bands); const pts = []; for (let k = 0; k <= 8; k++) pts.push({ x: g.cx - g.rx * .95 + k / 8 * g.rx * 1.9, y: y + (k % 2 ? -1 : 1) * 10 }); return { kind: 'drag', pts }; }
}

/* ---------- 17. Lace mat: place, rub, peel ---------- */
class LaceStep extends Step {
  enter() { this.phase = 'wait'; this.pos = null; this.peel = 0; }
  items() { return this.phase === 'wait' ? [{ kind: 'mat', slot: 1, active: true }] : []; }
  down(p) {
    const t = this.tier;
    if (this.phase === 'wait' && (nearSlot(p, PLAT.slots[1]) || this.onTier(p, t))) { this.phase = 'drag'; this.pos = { x: p.x, y: p.y }; SFX.tap(); }
    else if (this.phase === 'rub') this.rub(p);
  }
  move(p) {
    const t = this.tier;
    if (this.phase === 'drag') { this.pos = { x: p.x, y: p.y }; if (this.onTier(p, t, 1.0)) { t.lace = { grid: new Grid(NA, 1), alpha: 1, f0: this.f0, f1: this.f1, mat: 1 }; this.phase = 'rub'; SFX.squelch(); } }
    else if (this.phase === 'rub') this.rub(p);
  }
  up(p) { if (this.phase === 'drag') this.phase = 'wait'; }
  rub(p) {
    const t = this.tier, s = screenToSide(t, p.x, p.y); if (!s.inX) return;
    const amt = clamp((p.speed || 0) / 900, .15, .6);
    t.lace.grid.paint(s.th, .5, 12 / t.r, 1, amt);
    if (p.speed > 20) SFX.rub(.5);
    if (t.lace.grid.meanFront(G.cake.rot) > .7) { for (let i = 0; i < NA; i++) t.lace.grid.v[i] = Math.max(t.lace.grid.v[i], .45); this.phase = 'peel'; SFX.swish(); G.chefCheer(); }
  }
  update(dt) { super.update(dt); if (this.phase === 'peel') { this.peel += dt; this.tier.lace.mat = 1 - clamp(this.peel / .8, 0, 1); if (this.peel > 1.2) this.finish(); } }
  draw(ctx) {
    const t = this.tier; if (!t.lace || !t.lace.mat) return;
    const g = tierGeom(t), y0 = g.top + (g.bot - g.top) * t.lace.f0 + g.ry * .4, y1 = g.top + (g.bot - g.top) * t.lace.f1 + g.ry * .6;
    ctx.save(); bodyPath(ctx, g); ctx.clip();
    const m = t.lace.mat, lift = (1 - m) * (y1 - y0);
    ctx.globalAlpha = .55 * m; ctx.fillStyle = '#d9dbe3';
    ctx.beginPath(); ctx.moveTo(g.cx - g.rx * 1.1, y0 - lift * .3); ctx.lineTo(g.cx + g.rx * 1.1, y0 - lift * 1.2); ctx.lineTo(g.cx + g.rx * 1.1, y1 - lift * 1.2); ctx.lineTo(g.cx - g.rx * 1.1, y1); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  drawFront(ctx) { if (this.phase === 'drag' && this.pos) drawItem(ctx, 'mat', this.pos.x, this.pos.y + 20, Math.max(34, CAM.zoom * 8), false, this.t); }
  hint() {
    const g = tierGeom(this.tier), ym = g.top + (g.bot - g.top) * (this.f0 + this.f1) / 2;
    if (this.phase === 'wait') { const s = PLAT.slots[1]; return { kind: 'drag', pts: [{ x: s.x, y: s.y - s.s * .4 }, { x: g.cx, y: ym }] }; }
    if (this.phase === 'rub') { const pts = []; for (let i = 0; i < 7; i++) pts.push({ x: g.cx - g.rx * .8 + i * g.rx * .27, y: ym + (i % 2 ? -1 : 1) * (g.bot - g.top) * .12 }); return { kind: 'drag', pts }; }
    return null;
  }
}

/* ---------- 18. Big flowers: hold to bloom ---------- */
class FlowerStep extends Step {
  enter() { const t = this.tier; t.flowers = t.flowers || []; this.cur = null; }
  items() { return [{ kind: 'flowers', slot: 1, active: this.t < 4 && !this.cur }]; }
  down(p) { const t = this.tier; if (!this.onTier(p, t, 1.0)) return; const s = screenToSide(t, p.x, p.y); if (s.f < -.05 || s.f > 1.05) return; this.cur = { th: s.th, y: clamp(s.y, t.y0 + 3, t.y0 + t.h - 3), size: 3, color: this.colors[t.flowers.length % this.colors.length], bloom: 0 }; t.flowers.push(this.cur); SFX.bloom(); }
  move(p) { if (this.cur && G.pointer.down) { const s = screenToSide(this.tier, p.x, p.y); if (s.inX) { this.cur.th = s.th; this.cur.y = clamp(s.y, this.tier.y0 + 3, this.tier.y0 + this.tier.h - 3); } } }
  up(p) { if (this.cur) { const c = this.cur; this.cur = null; if (c.bloom < .25) { this.tier.flowers.splice(this.tier.flowers.indexOf(c), 1); return; } const s = sideToScreen(this.tier, c.th, c.y); G.fx.burst(s.x, s.y, 10, { color: shade(c.color, .3), speed: 70, r: 3, life: .6, kind: 'petal', g: 60 }); SFX.chime(this.tier.flowers.length); if (this.tier.flowers.length >= this.n) { G.chefCheer(); this.finish(); } } }
  update(dt) { super.update(dt); if (this.cur) { this.cur.bloom = Math.min(1, this.cur.bloom + dt * .8); this.cur.size = 3 + this.cur.bloom * this.maxSize; if (Math.random() < dt * 4) SFX.tick(); } }
  hint() { const g = tierGeom(this.tier); return { kind: 'hold', pts: [{ x: g.cx - g.rx * .35 + (this.tier.flowers.length % 3) * g.rx * .35, y: g.top + (g.bot - g.top) * .5 }] }; }
}

/* ---------- 19. Gold leaf rubbing ---------- */
class GoldStep extends Step {
  enter() { this.tier.gold = new Grid(NA, NH); this.active = false; }
  items() { return [{ kind: 'goldpot', slot: 1, active: this.t < 4 && !this.active }]; }
  down(p) { this.active = true; this.rub(p); } move(p) { if (this.active) this.rub(p); } up(p) { this.active = false; }
  rub(p) {
    const t = this.tier, s = screenToSide(t, p.x, p.y); if (!s.inX || s.f < -.1 || s.f > 1.1) return;
    if (this.done) return;
    const amt = clamp(.55 - (p.speed || 0) / 2500, .12, .55); // fast strokes leave a sparser, flaky finish
    t.gold.paint(s.th, s.f, 7 / t.r, 7 / t.h, amt);
    if (Math.random() < .3) { G.fx.add({ x: p.x + rnd(-20, 20), y: p.y + rnd(-20, 20), vx: rnd(-30, 30), vy: rnd(-60, -10), g: 80, life: .6, r: 2, color: pick(['#ffe680', '#f2c94c', '#fff']), kind: 'spark', rot: 0, vr: 5 }); SFX.gold(); }
    let s2 = 0, n = 0; for (let a = 0; a < NA; a++) { const th = (a + .5) / NA * TAU - Math.PI + G.cake.rot, c = Math.cos(th); if (c < .15) continue; for (let j = 0; j < Math.floor(NH * this.f); j++) { s2 += Math.min(1, t.gold.v[a + j * NA] * 1.6) * c; n += c; } }
    if (n && s2 / n > .5) { // mirror the back so the finish is complete
      for (let a = 0; a < NA; a++) for (let j = 0; j < NH; j++) { const th = (a + .5) / NA * TAU - Math.PI + G.cake.rot; if (Math.cos(th) < .15) { const src = (a + NA / 2) % NA; t.gold.v[a + j * NA] = t.gold.v[src + j * NA]; } }
      G.chefCheer(); this.finish();
    }
  }
  hint() { const g = tierGeom(this.tier); const pts = []; for (let i = 0; i < 8; i++) pts.push({ x: g.cx - g.rx * .9 + i * g.rx * .257, y: g.bot + g.ry * .5 - (g.bot - g.top) * this.f * (i % 2 ? .15 : .85) }); return { kind: 'drag', pts }; }
}

/* ---------- 20. Flower cascade across several tiers ---------- */
class CascadeStep extends Step {
  enter() { this.list = []; this.active = false; this.last = null; this.minF = 1; this.count = 0; for (const i of this.tis) G.cake.tiers[i].flowers = G.cake.tiers[i].flowers || []; }
  items() { return [{ kind: 'flowers', slot: 1, active: this.t < 4 && !this.active }]; }
  camera() { const top = G.cake.tiers[this.tis[0]], bot = G.cake.tiers[this.tis[this.tis.length - 1]]; const hh = top.y0 + top.h - bot.y0; return { y: bot.y0 + hh * .5, zoom: fitZoom(top.r * 1.6, hh) }; }
  down(p) { this.active = true; this.last = null; this.place(p); }
  move(p) { if (this.active) this.place(p); }
  up(p) { this.active = false; }
  place(p) {
    if (this.done) return;
    for (const i of this.tis) {
      const t = G.cake.tiers[i]; if (!this.onTier(p, t, 1.05)) continue;
      const s = screenToSide(t, p.x, p.y); if (s.f < -.1 || s.f > 1.1) continue;
      if (this.last && dist(p.x, p.y, this.last.x, this.last.y) < Math.max(18, CAM.zoom * 5)) return;
      this.last = { x: p.x, y: p.y };
      const size = rnd(3, 6) * (1 - .25 * (p.speed || 0) / 1500);
      t.flowers.push({ th: s.th, y: clamp(s.y, t.y0 + 2, t.y0 + t.h - 2), size, color: pick(this.colors), bloom: 1 });
      if (Math.random() < .35) t.flowers.push({ th: s.th + rnd(-.15, .15), y: clamp(s.y + rnd(-4, 4), t.y0 + 2, t.y0 + t.h - 2), size: size * .5, color: '#fff7f0', bloom: 1 });
      this.count++; SFX.pearl(this.count); G.fx.burst(p.x, p.y, 3, { color: '#f8c7d4', speed: 40, r: 3, life: .5, kind: 'petal', g: 60 });
      const bot = G.cake.tiers[this.tis[this.tis.length - 1]];
      if (i === this.tis[this.tis.length - 1] && s.f < .5 && this.count >= 10) { G.chefCheer(); this.finish(); }
      return;
    }
  }
  hint() { const top = G.cake.tiers[this.tis[0]], bot = G.cake.tiers[this.tis[this.tis.length - 1]]; const a = sideToScreen(top, .3 - G.cake.rot, top.y0 + top.h * .8), b = sideToScreen(bot, -.5 - G.cake.rot, bot.y0 + bot.h * .3); return { kind: 'drag', pts: [a, { x: (a.x + b.x) / 2 + 40, y: (a.y + b.y) / 2 }, b] }; }
}

/* ---------- 21. Swags (drag point to point, drooping garlands) ---------- */
class SwagStep extends Step {
  enter() { this.tier.swags = []; this.start = null; this.path = null; this.bins = new Array(12).fill(false); }
  items() { return [{ kind: 'bag', slot: 1, active: this.t < 4 && !this.start, color: this.color }]; }
  down(p) { const t = this.tier; if (!this.onTier(p, t, 1.15)) return; const s = screenToSide(t, p.x, p.y); if (s.f < -.1 || s.f > 1.1) return; this.start = { th: s.th, y: clamp(s.y, t.y0 + 2, t.y0 + t.h - 2), x: p.x, y0: p.y }; this.path = [{ x: p.x, y: p.y }]; }
  move(p) { if (this.path) { this.path.push({ x: p.x, y: p.y }); if (p.speed > 20) SFX.rub(.2); } }
  up(p) {
    const st = this.start; this.start = null; const path = this.path; this.path = null; if (!st) return;
    const t = this.tier, g = tierGeom(t), s = screenToSide(t, p.x, p.y);
    if (!s.inX || Math.abs(p.x - st.x) < g.rx * .25) { SFX.click(); return; }
    const chordY = (st.y0 + p.y) / 2; let droop = 0; for (const q of path) droop = Math.max(droop, q.y - chordY);
    t.swags.push({ th0: st.th, y0: clamp(st.y, t.y0 + 2, t.y0 + t.h - 2), th1: s.th, y1: clamp(s.y, t.y0 + 2, t.y0 + t.h - 2), droop: clamp(droop / CAM.zoom, 2, t.h * .5), color: this.color });
    SFX.pop();
    const a0 = Math.asin(clamp((st.x - g.cx) / g.rx, -1, 1)), a1 = Math.asin(clamp((p.x - g.cx) / g.rx, -1, 1));
    for (let a = Math.min(a0, a1) - .2; a <= Math.max(a0, a1) + .2; a += .05) { const i = Math.floor((a + Math.PI / 2) / Math.PI * this.bins.length); if (i >= 0 && i < this.bins.length) this.bins[i] = true; }
    if (this.bins.filter(b => b).length >= this.bins.length * .75) { // mirror to the back
      for (const sw of t.swags.slice()) t.swags.push(Object.assign({}, sw, { th0: wrapAng(sw.th0 + Math.PI), th1: wrapAng(sw.th1 + Math.PI) }));
      G.chefCheer(); this.finish();
    }
  }
  draw(ctx) {
    if (!this.path) return; const z = CAM.zoom;
    ctx.save(); ctx.strokeStyle = this.color; ctx.lineWidth = Math.max(8, z * 3.2); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); this.path.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke(); ctx.restore();
    drawPipingBag(ctx, G.pointer.x + 10, G.pointer.y - 30, Math.max(36, z * 9), -.5, this.color);
  }
  hint() { const g = tierGeom(this.tier); const i = this.bins.findIndex(b => !b); const a0 = -Math.PI / 2 + Math.max(0, i) / this.bins.length * Math.PI, a1 = Math.min(Math.PI / 2, a0 + Math.PI * .3); const y = g.top + (g.bot - g.top) * .35; return { kind: 'drag', pts: [{ x: g.cx + Math.sin(a0) * g.rx * .93, y }, { x: g.cx + Math.sin((a0 + a1) / 2) * g.rx * .93, y: y + (g.bot - g.top) * .3 }, { x: g.cx + Math.sin(a1) * g.rx * .93, y }] }; }
}

/* ---------- 22. Topper → Reveal ---------- */
class TopperStep extends Step {
  enter() { this.phase = 'wait'; this.pos = null; this.land = 0; }
  items() { return this.phase === 'wait' ? [{ kind: 'topper', slot: 1, active: true }] : []; }
  camera() { return camForTier(this.tier, this.tier.h * .8); }
  down(p) { if (this.phase === 'wait' && (nearSlot(p, PLAT.slots[1]) || this.onTier(p, this.tier))) { this.phase = 'drag'; this.pos = { x: p.x, y: p.y }; SFX.sparkle(); } }
  move(p) { if (this.phase === 'drag') { this.pos = { x: p.x, y: p.y }; this.check(false); } }
  up(p) { if (this.phase === 'drag' && !this.check(true)) this.phase = 'wait'; }
  check(force) { const g = tierGeom(this.tier); if (dist(this.pos.x, this.pos.y, g.cx, g.top) < g.rx * (force ? 1.5 : .6)) { this.phase = 'land'; this.land = 0; return true; } return false; }
  update(dt) {
    super.update(dt);
    if (this.phase === 'land') { this.land += dt; if (this.land > .5 && !this.tier.topper) { this.tier.topper = true; SFX.glass(); const g = tierGeom(this.tier); G.fx.burst(g.cx, g.top - 20, 30, { colors: ['#fff', '#ffe08a', '#f7c8d8'], speed: 200, r: 3, life: .8, kind: 'spark', g: 100 }); } if (this.land > 1.3) { this.finish(); } }
  }
  drawFront(ctx) {
    if (this.phase === 'wait') return; const g = tierGeom(this.tier), z = CAM.zoom, s = Math.max(40, z * 11);
    if (this.phase === 'drag') drawTopper(ctx, this.pos.x, this.pos.y + 10, s, this.t);
    else if (!this.tier.topper) { const u = easeOut(clamp(this.land / .5, 0, 1)); drawTopper(ctx, lerp(this.pos.x, g.cx, u), lerp(this.pos.y, g.top, u), s, this.t); }
  }
  hint() { const s = PLAT.slots[1], g = tierGeom(this.tier); return { kind: 'drag', pts: [{ x: s.x, y: s.y - s.s * .4 }, { x: g.cx, y: g.top - 10 }] }; }
}
class RevealStep extends Step {
  enter() { G.revealed = true; G.reveal = 0; this.last = null; this.fw = 0; SFX.fanfare(); }
  camera() {
    const tiers = G.cake.tiers, top = tiers[tiers.length - 1], totalH = top.y0 + top.h + 16, rmax = Math.max(...tiers.map(t => t.r));
    const freeH = H * .86, freeW = W * .9;
    return { y: totalH * .5 - 6, zoom: Math.min(freeH / (totalH + 12), freeW / (rmax * 2.4)) };
  }
  down(p) { this.last = { x: p.x, y: p.y }; G.fx.burst(p.x, p.y, 6, { colors: ['#f7c8d8', '#fff', '#ffd97a'], speed: 80, r: 4, life: .8, kind: 'heart', g: -30 }); SFX.sparkle(); }
  move(p) { if (this.last) { G.cake.rotVel = clamp(p.dx / Math.max(.008, G.dt) * .004, -4, 4); this.last = { x: p.x, y: p.y }; } }
  up(p) { this.last = null; }
  update(dt) {
    super.update(dt); G.reveal = Math.min(1, G.reveal + dt / 4.5);
    this.fw += dt; if (this.fw > .55 && this.t < 14) { this.fw = 0; const x = rnd(W * .15, W * .85), y = rnd(H * .1, H * .5); G.fx.burst(x, y, 40, { colors: ['#ffd97a', '#f7c8d8', '#a9d9ff', '#fff'], speed: 220, r: 2.5, life: 1.2, kind: 'spark', g: 60, drag: 1.2 }); SFX.sparkle(); }
    if (Math.random() < dt * 20) G.fx.add({ x: rnd(W), y: -10, vx: rnd(-20, 20), vy: rnd(40, 90), g: 0, life: 8, r: rnd(3, 6), color: pick(['#f7c8d8', '#ffd97a', '#a9d9ff', '#fff', '#c9f2c7']), kind: 'confetti', rot: rnd(TAU), vr: rnd(-4, 4) });
    if (this.t > 2 && Math.abs(G.cake.rotVel) < .05 && !this.last) G.cake.rotVel = .12;
  }
}

/* ---------- 23. Sugar snow: tap to shake the sieve ---------- */
class SugarStep extends Step {
  enter() { this.tier.sugar = 0; this.shake = 0; this.taps = 0; }
  camera() { return camForTier(this.tier, this.tier.h * .9); }
  down(p) { const g = tierGeom(this.tier); if (p.y > g.bot + g.ry * 2) return; this.shake = 1; this.taps++; SFX.click(); const sx = g.cx, sy = g.top - g.ry - Math.max(50, CAM.zoom * 12); for (let i = 0; i < 30; i++) G.fx.add({ x: sx + rnd(-g.rx, g.rx), y: sy + 10, vx: rnd(-15, 15), vy: rnd(30, 90), g: 120, life: rnd(.5, .9), r: rnd(1.2, 2.6), color: '#fff', kind: 'dot', rot: 0, vr: 0 }); }
  update(dt) { super.update(dt); const t = this.tier; if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 4); t.sugar = Math.min(1, t.sugar + dt * .9); } if (t.sugar >= 1) { this.doneT += dt; if (this.doneT > .5) { G.chefCheer(); this.finish(); } } }
  draw(ctx) {
    const g = tierGeom(this.tier), z = CAM.zoom, s = Math.max(50, z * 12), x = g.cx + Math.sin(this.t * 2) * 6 + (this.shake ? Math.sin(this.t * 60) * 8 * this.shake : 0), y = g.top - g.ry - s;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#c9ced5'; ctx.beginPath(); ctx.ellipse(0, 0, s * .8, s * .28, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e9ecf0'; ctx.beginPath(); ctx.ellipse(0, -s * .12, s * .8, s * .28, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(120,125,135,.6)'; ctx.lineWidth = 1; for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(i * s * .12, -s * .12 - Math.sqrt(1 - (i / 6.7) ** 2) * s * .28); ctx.lineTo(i * s * .12, -s * .12 + Math.sqrt(1 - (i / 6.7) ** 2) * s * .28); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, -s * .16, s * .55, s * .16, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2e2a'; ctx.beginPath(); ctx.roundRect(s * .75, -s * .2, s * .7, s * .14, s * .05); ctx.fill();
    ctx.restore();
  }
  hint() { const g = tierGeom(this.tier); return { kind: 'tap', pts: [{ x: g.cx, y: g.top - g.ry - Math.max(50, CAM.zoom * 12) }] }; }
}
