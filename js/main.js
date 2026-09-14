'use strict';
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath(); };
}
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let DPR = 1, SW = 1, SH = 1, portrait = true;

const stations = { tamaire: new Tamaire(), oodama: new Oodama(), taifu: new Taifu(), relay: new Relay(), tsuna: new Tsuna() };
const stationList = Object.values(stations);
const World = { W: 64, H: 128, trees: [], tents: [], spectators: [] };

function layout() {
  portrait = SH >= SW;
  const S = stations;
  if (portrait) {
    World.W = 64; World.H = 130;
    S.tamaire.setLayout(32, 24, 1, 0, 17, 13, 32, 25);
    S.oodama.setLayout(12, 72, 0, -1, 13, 20, 16, 57);
    S.taifu.setLayout(46, 62, 0, -1, 13, 20, 45, 60);
    S.relay.setLayout(32, 86, 1, 0, 17, 11, 32, 86);
    S.tsuna.setLayout(32, 111, 0, 1, 13, 19, 32, 111);
    World.trees = [[-3, 14], [-4, 40], [-3, 70], [-4, 100], [-3, 126], [67, 14], [68, 40], [67, 70], [68, 100], [67, 126], [10, 130], [30, 131], [50, 130]];
    World.tents = [[8, 12, 14], [56, 12, 14]];
  } else {
    World.W = 128; World.H = 74;
    S.tamaire.setLayout(18, 40, 1, 0, 16, 13, 18, 41);
    S.oodama.setLayout(40, 18, 1, 0, 21, 9, 56, 22);
    S.taifu.setLayout(94, 22, 1, 0, 21, 10, 98, 20);
    S.relay.setLayout(74, 43, 1, 0, 35, 9, 74, 43);
    S.tsuna.setLayout(74, 62, 1, 0, 19, 9, 74, 62);
    World.trees = [[-3, 12], [-4, 32], [-3, 52], [-4, 72], [131, 12], [132, 32], [131, 52], [132, 72], [10, 78], [40, 79], [70, 78], [100, 79], [125, 78]];
    World.tents = [[8, 9, 14], [120, 9, 14]];
  }
  World.spectators = [];
  for (const [tx, ty, tw] of World.tents) for (let i = 0; i < 6; i++) World.spectators.push({ x: tx - tw / 2 + 1.5 + i * (tw - 3) / 5, y: ty - 3.5 + (i % 2) * 1.4, col: ['#8fb4d9', '#f0a0a0', '#c9d98f', '#e8c88a', '#b9a0d9', '#f0d090'][i] });
}

// ---------- camera ----------
const cam = { x: 32, y: 60, z: 6, tx: 32, ty: 60, tz: 6, focus: null, panX: 0, panY: 0 };
function overviewTarget() {
  const pad = 3; const z = Math.min(SW / (World.W + pad * 2), SH / (World.H + pad * 2));
  return { x: World.W / 2, y: World.H / 2, z };
}
function focusTarget(st) {
  const ov = overviewTarget(); const b = st.bounds; const pad = 3;
  let z = Math.min(SW / (b.hw * 2 + pad * 2), SH / (b.hh * 2 + pad * 2));
  z = clamp(z, ov.z * 1.15, ov.z * 3.2);
  let cx = b.cx, cy = b.cy;
  if (st.focusCenter) { const c = st.focusCenter(); cx = c.x; cy = c.y; }
  // keep the view inside the playground (a little margin) when it is smaller than the playground
  const hw = SW / (2 * z), hh = SH / (2 * z), m = 3;
  if (hw < World.W / 2 + m) cx = clamp(cx, hw - m, World.W - hw + m); else cx = World.W / 2;
  if (hh < World.H / 2 + m) cy = clamp(cy, hh - m, World.H - hh + m); else cy = World.H / 2;
  return { x: cx, y: cy, z };
}
function setFocus(st) {
  cam.focus = st;
  for (const s of stationList) s.focused = s === st;
}
function updateCamera(dt) {
  const tgt = cam.focus ? focusTarget(cam.focus) : overviewTarget();
  cam.tx = tgt.x + cam.panX; cam.ty = tgt.y + cam.panY; cam.tz = tgt.z;
  const r = 1 - Math.exp(-4.5 * dt);
  cam.x += (cam.tx - cam.x) * r; cam.y += (cam.ty - cam.y) * r; cam.z += (cam.tz - cam.z) * r;
}
function toWorld(sx, sy) { return { x: (sx - SW / 2) / cam.z + cam.x, y: (sy - SH / 2) / cam.z + cam.y }; }

// ---------- input ----------
const ptr = { down: false, id: null, st: null, ground: false, sx: 0, sy: 0, lx: 0, ly: 0, moved: 0, panStartX: 0, panStartY: 0 };
function onDown(e) {
  if (ptr.down) return;
  Audio2.init();
  if (hitSoundButton(e.clientX, e.clientY)) { Audio2.setMuted(!Audio2.muted); return; }
  ptr.down = true; ptr.id = e.pointerId; ptr.sx = ptr.lx = e.clientX; ptr.sy = ptr.ly = e.clientY; ptr.moved = 0; ptr.st = null; ptr.ground = false;
  const w = toWorld(e.clientX, e.clientY);
  Particles.dust(w.x, w.y, 4, 0.8);
  // prefer the focused station
  const order = cam.focus ? [cam.focus, ...stationList.filter(s => s !== cam.focus)] : stationList;
  for (const s of order) {
    const l = s.toLocal(w.x, w.y);
    if (s.hit(l.u, l.v, cam.z)) { ptr.st = s; s.active = true; setFocus(s); cam.panX = cam.panY = 0; s.down(l.u, l.v); return; }
  }
  // not on a thing: if we are far away, step closer to whichever spot was tapped
  if (!cam.focus) {
    let best = null, bd = 1e9;
    for (const s of stationList) { const b = s.bounds; const dx = Math.max(0, Math.abs(w.x - b.cx) - b.hw), dy = Math.max(0, Math.abs(w.y - b.cy) - b.hh); const d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = s; } }
    if (best && bd < 6) { setFocus(best); cam.panX = cam.panY = 0; ptr.stepped = true; }
  } else ptr.stepped = false;
  ptr.ground = true; ptr.panStartX = cam.panX; ptr.panStartY = cam.panY;
}
function onMove(e) {
  if (!ptr.down || e.pointerId !== ptr.id) return;
  const dx = e.clientX - ptr.lx, dy = e.clientY - ptr.ly; ptr.lx = e.clientX; ptr.ly = e.clientY; ptr.moved += Math.hypot(dx, dy);
  if (ptr.st) {
    const w = toWorld(e.clientX, e.clientY); const l = ptr.st.toLocal(w.x, w.y);
    const d = ptr.st.worldDir ? null : null;
    const ddx = dx / cam.z, ddy = dy / cam.z; const du = ddx * ptr.st.ux + ddy * ptr.st.uy, dv = ddx * ptr.st.px + ddy * ptr.st.py;
    ptr.st.move(l.u, l.v, du, dv);
  } else if (ptr.ground && cam.focus && !ptr.stepped) {
    cam.panX = ptr.panStartX - (e.clientX - ptr.sx) / cam.z; cam.panY = ptr.panStartY - (e.clientY - ptr.sy) / cam.z;
  }
}
function onUp(e) {
  Audio2.init();
  if (!ptr.down || e.pointerId !== ptr.id) return;
  ptr.down = false;
  if (ptr.st) { const w = toWorld(e.clientX, e.clientY); const l = ptr.st.toLocal(w.x, w.y); ptr.st.up(l.u, l.v); ptr.st.active = false; ptr.st = null; return; }
  if (ptr.ground && cam.focus && !ptr.stepped) {
    const panned = Math.hypot(cam.panX, cam.panY) * cam.z;
    if (panned > Math.min(SW, SH) * 0.18 || (ptr.moved < 8 && !cam.focus.isBusy())) { setFocus(null); }
    cam.panX = cam.panY = 0;
  }
}
canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
document.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());

// ---------- director: decides when to pull back and who beckons next ----------
const director = { inviteT: 3, last: null, restT: 0 };
function updateDirector(dt) {
  const f = cam.focus;
  if (f && f.phase === 'done' && f.doneT > 2.6 && !ptr.down) { director.last = f; setFocus(null); director.inviteT = 1.6; }
  if (!cam.focus) {
    director.inviteT -= dt;
    if (director.inviteT <= 0) {
      const cands = stationList.filter(s => s !== director.last && s.phase === 'idle');
      const pick = cands.length ? cands[randi(0, cands.length - 1)] : stationList[randi(0, stationList.length - 1)];
      pick.invite(); director.last = pick; director.inviteT = rand(5, 8);
    }
  }
}

// ---------- drawing ----------
function soundBtn() { const s = 22 * Math.min(1.4, DPR); return { x: SW - 26, y: 26 + (window.visualViewport ? 0 : 0), r: 16 }; }
function hitSoundButton(sx, sy) { const b = soundBtn(); return dist(sx, sy, b.x, b.y) < b.r + 6; }
function drawSoundButton() {
  const b = soundBtn(); ctx.save(); ctx.translate(b.x, b.y);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#555'; ctx.beginPath(); ctx.moveTo(-7, -3); ctx.lineTo(-3, -3); ctx.lineTo(2, -7); ctx.lineTo(2, 7); ctx.lineTo(-3, 3); ctx.lineTo(-7, 3); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1.6;
  if (Audio2.muted) { ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(10, 4); ctx.moveTo(10, -4); ctx.lineTo(4, 4); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(2, 0, 5, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(2, 0, 9, -0.9, 0.9); ctx.stroke(); }
  ctx.restore();
}
function drawGround(t) {
  // sand everywhere, field a touch lighter, white oval track around the field
  ctx.fillStyle = '#cdb98e'; ctx.fillRect(cam.x - SW / cam.z, cam.y - SH / cam.z, SW * 2 / cam.z, SH * 2 / cam.z);
  ctx.fillStyle = COL.sand; ctx.fillRect(0, 0, World.W, World.H);
  // subtle sand noise dots (cheap, fixed)
  ctx.fillStyle = 'rgba(0,0,0,0.03)';
  for (let i = 0; i < 90; i++) { const x = (i * 37.3) % World.W, y = (i * 53.7) % World.H; ctx.beginPath(); ctx.arc(x, y, 0.8 + (i % 3) * 0.4, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = COL.line; ctx.lineWidth = 0.25;
  ctx.beginPath(); ctx.roundRect(1.5, 9.5, World.W - 3, World.H - 11, 12); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(3.0, 11, World.W - 6, World.H - 14, 11); ctx.stroke();
  // school at the top
  drawSchool(ctx, World.W / 2, 8, portrait ? 40 : 60);
  for (const s of stationList) s.drawGround(ctx);
}
function drawScene(t) {
  for (const [x, y, r] of World.trees) Scene.add(y, (c) => drawTree(c, x, y, 2.6, t));
  for (const [x, y, w] of World.tents) Scene.add(y, (c) => drawTent(c, x, y, w, 4));
  for (const sp of World.spectators) Scene.add(sp.y + 0.5, (c) => drawSpectator(c, sp.x, sp.y, sp.col, t * 2 + sp.x));
  const vx0 = cam.x - SW / (2 * cam.z) - 8, vx1 = cam.x + SW / (2 * cam.z) + 8, vy0 = cam.y - SH / (2 * cam.z) - 8, vy1 = cam.y + SH / (2 * cam.z) + 8;
  for (const s of stationList) {
    const b = s.bounds; if (b.cx + b.hw < vx0 || b.cx - b.hw > vx1 || b.cy + b.hh < vy0 || b.cy - b.hh > vy1) continue;
    s.draw(ctx, cam);
  }
  Scene.flush(ctx);
  Particles.draw(ctx);
  // bunting high above everything
  drawBunting(ctx, 2, 6.5, World.W / 2, 9.5, t, 0); drawBunting(ctx, World.W / 2, 9.5, World.W - 2, 6.5, t, 3);
}

// ---------- loop ----------
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  const vv = window.visualViewport; SW = Math.round(vv ? vv.width : window.innerWidth); SH = Math.round(vv ? vv.height : window.innerHeight);
  canvas.width = SW * DPR; canvas.height = SH * DPR; canvas.style.width = SW + 'px'; canvas.style.height = SH + 'px';
  const wasPortrait = portrait; layout();
  const tgt = cam.focus ? focusTarget(cam.focus) : overviewTarget();
  if (wasPortrait !== portrait || !resize.done) { cam.x = tgt.x; cam.y = tgt.y; cam.z = tgt.z; }
  resize.done = true;
}
window.addEventListener('resize', resize); if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

let last = performance.now(), T = 0;
function frame(now) {
  let dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
  for (const s of stationList) s.update(dt);
  Particles.update(dt); updateDirector(dt); updateCamera(dt);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.save(); ctx.translate(SW / 2, SH / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
  ctx.lineJoin = 'round';
  drawGround(T); drawScene(T);
  ctx.restore();
  drawSoundButton();
  requestAnimationFrame(frame);
window.GAME = { stations, stationList, cam, toWorld, toScreen: (x, y) => ({ x: (x - cam.x) * cam.z + SW / 2, y: (y - cam.y) * cam.z + SH / 2 }), setFocus, World };
}
requestAnimationFrame(frame);
