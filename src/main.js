// Entry point: canvas setup, scenes (map / level), input, playback and animation.
import { LEVELS } from './levels.js';
import { parseLevel, nextPiece, suggestPiece, isPlaceable, VEC, OPP } from './sim/grid.js';
import { simulate } from './sim/simulate.js';
import { sidePath, HEADING, lerp, clamp, easeOut, easeInOut } from './render/geom.js';
import { drawGround, drawCells, drawTracks, drawGhost, drawGlow, cellCenter, roundRect, C } from './render/board.js';
import { drawLoco, drawCar } from './render/train.js';
import { FX } from './render/fx.js';
import { layoutMap, drawMap, hitStation, pathPoint } from './render/map.js';
import { unlock, sfx } from './audio.js';
import { storage } from './storage.js';

const TICK = 0.55;          // seconds per simulation tick
const REWIND_SPEED = 3.2;   // ticks per second while rewinding

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const safeEl = document.getElementById('safe');
let W = 0, H = 0, DPR = 1, safe = { t: 0, r: 0, b: 0, l: 0 };
let time = 0, last = performance.now();
const fx = new FX();

const app = { scene: 'map', map: null, lv: null, fade: 0, fadeDir: 0, pending: null };

// ---------------------------------------------------------------- sizing
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const cs = getComputedStyle(safeEl);
  safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  if (app.lv) layoutLevel(app.lv);
  if (app.map) app.map.ML = layoutMap(W, H, safe, LEVELS.length);
  if (app.map) placeMapLoco(app.map);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 50));

// ---------------------------------------------------------------- map scene
function makeMap(opts = {}) {
  const cleared = new Set();
  LEVELS.forEach((l, i) => { if (storage.isCleared(l.id)) cleared.add(i); });
  let current = LEVELS.findIndex((l, i) => !cleared.has(i));
  if (current < 0) current = LEVELS.length - 1;
  const map = { ML: layoutMap(W, H, safe, LEVELS.length), cleared, current, loco: null, travel: null, celebrate: false, puff: 0 };
  if (opts.arriveFrom != null && opts.arriveFrom < LEVELS.length - 1) {
    map.travel = { from: opts.arriveFrom, t: 0 };
  }
  if (opts.finished) { map.celebrate = true; map.celebrateT = 0; }
  placeMapLoco(map);
  return map;
}
function placeMapLoco(map) {
  const ML = map.ML;
  if (map.travel) {
    const p = pathPoint(ML, map.travel.from, easeInOut(map.travel.t));
    map.loco = { x: p.x, y: p.y, ang: p.ang, moving: true };
  } else {
    const s = ML.stations[map.current];
    map.loco = { x: s.x, y: s.y, ang: 0, moving: false };
  }
}
function updateMap(map, dt) {
  const ML = map.ML;
  if (map.travel) {
    map.travel.t += dt / 1.6;
    if (map.travel.t >= 1) { map.travel = null; sfx.arrive(); fx.smoke(map.loco.x, map.loco.y - ML.r * 0.3, ML.r * 0.4, { x: 0, y: -1 }, 3); }
    placeMapLoco(map);
    map.puff += dt;
    if (map.puff > 0.12) { map.puff = 0; fx.smoke(map.loco.x - Math.cos(map.loco.ang) * ML.r * 0.1, map.loco.y - ML.r * 0.35, ML.r * 0.25, { x: -Math.cos(map.loco.ang), y: -0.6 }); }
  } else {
    map.puff += dt;
    if (map.puff > 0.9) { map.puff = 0; fx.smoke(map.loco.x + ML.r * 0.3, map.loco.y - ML.r * 0.35, ML.r * 0.3, { x: 0.2, y: -1 }); }
  }
  if (map.celebrate) {
    map.celebrateT += dt;
    if (map.celebrateT < 6 && Math.random() < dt * 2.5) {
      const s = ML.stations[Math.floor(Math.random() * ML.stations.length)];
      fx.confetti(s.x, s.y, ML.r * 0.35, 14);
    }
  }
}
function drawMapScene(map) {
  drawSky();
  drawMap(ctx, map.ML, map, time);
}
function tapMap(map, x, y) {
  if (map.travel) return;
  const i = hitStation(map.ML, x, y);
  if (i < 0) return;
  const unlocked = i === 0 || map.cleared.has(i - 1);
  if (!unlocked) { fx.smoke(x, y, map.ML.r * 0.3, { x: 0, y: -0.5 }, 2); return; }
  sfx.pop();
  startFade(() => enterLevel(LEVELS[i].id));
}

// ---------------------------------------------------------------- level scene
function enterLevel(id) {
  const def = LEVELS.find((l) => l.id === id);
  const level = parseLevel(def);
  const lv = {
    id, def, level, placed: storage.loadLayout(id), sim: null, ghost: null,
    phase: 'idle', T: 0, timer: 0, press: 0, smokeT: 0, chugTick: 0, L: null,
    depart: null, connectedFlag: false, lastTap: null, fail: null,
  };
  layoutLevel(lv);
  recompute(lv, true);
  storage.setLastLevel(id);
  app.lv = lv; app.map = null; app.scene = 'level';
}
function layoutLevel(lv) {
  const top = safe.t + Math.max(48, H * 0.08);
  const pad = Math.max(10, Math.min(W, H) * 0.03);
  const aw = W - safe.l - safe.r - pad * 2, ah = H - top - safe.b - pad * 2;
  const { cols, rows } = lv.level;
  const cs = Math.floor(Math.min(aw / cols, ah / rows));
  const ox = safe.l + pad + (aw - cs * cols) / 2, oy = top + pad + (ah - cs * rows) / 2;
  lv.L = { ox, oy, cs, cols, rows };
  lv.home = { x: W - safe.r - Math.max(30, H * 0.045), y: safe.t + Math.max(30, H * 0.045), r: Math.max(22, H * 0.032) };
}
function recompute(lv, silent = false) {
  lv.sim = simulate(lv.level, lv.placed);
  lv.ghost = null;
  const f = lv.sim.fail;
  if (f && f.kind === 'stuck' && f.placeable) lv.ghost = { x: f.cell.x, y: f.cell.y, piece: suggestPiece(lv.level, lv.placed, f.cell.x, f.cell.y) };
  const connected = lv.sim.outcome === 'clear';
  if (connected && !lv.connectedFlag && !silent) sfx.connected();
  lv.connectedFlag = connected;
}
function tapLevel(lv, x, y) {
  const { L, level } = lv;
  const hm = lv.home;
  if (Math.hypot(x - hm.x, y - hm.y) < hm.r * 1.4) { sfx.pop(); startFade(() => enterMap({})); return; }
  if (lv.phase !== 'idle') return;
  const cx = Math.floor((x - L.ox) / L.cs), cy = Math.floor((y - L.oy) / L.cs);
  if (cx < 0 || cy < 0 || cx >= L.cols || cy >= L.rows) return;
  if (cx === level.loco.x && cy === level.loco.y) { startRun(lv); return; }
  if (!isPlaceable(level, cx, cy)) return;
  const p = nextPiece(level, lv.placed, cx, cy);
  const c = cellCenter(L, cx, cy);
  if (p) { lv.placed.set(`${cx},${cy}`, p); sfx.tap(); fx.dust(c.x, c.y, L.cs * 0.5, 3); }
  else { lv.placed.delete(`${cx},${cy}`); sfx.remove(); fx.dust(c.x, c.y, L.cs * 0.5, 8); }
  lv.lastTap = { x: cx, y: cy, t: time };
  storage.saveLayout(lv.id, lv.placed);
  recompute(lv);
}
function startRun(lv) {
  lv.phase = 'run'; lv.T = 0; lv.press = 1; lv.chugTick = 0; lv.fail = null;
  sfx.whistle();
  const lp = locoPose(lv);
  fx.smoke(lp.x + Math.cos(lp.ang) * lv.L.cs * 0.25, lp.y + Math.sin(lp.ang) * lv.L.cs * 0.25 - lv.L.cs * 0.2, lv.L.cs * 0.45, { x: 0, y: -1 }, 4);
}
function locoPose(lv) {
  const c = cellCenter(lv.L, lv.level.loco.x, lv.level.loco.y);
  return { x: c.x, y: c.y, ang: HEADING[lv.level.loco.dir] };
}

// Position of car i at continuous tick time T. Returns {x,y,ang} in screen space.
function carPose(lv, i, T) {
  const ticks = lv.sim.ticks;
  const t = clamp(Math.floor(T), 0, ticks.length - 1);
  const f = T - t;
  const a = ticks[t].cars[i];
  const b = ticks[Math.min(t + 1, ticks.length - 1)].cars[i];
  const moved = b.x !== a.x || b.y !== a.y;
  let cell, s, inDir, outDir;
  if (moved && f >= 0.5) { cell = b; s = f - 0.5; inDir = b.inDir; outDir = b.dir; }
  else if (moved) { cell = a; s = 0.5 + f; inDir = a.inDir; outDir = a.dir; }
  else { cell = a; s = 0.5; inDir = a.inDir; outDir = a.dir; }
  return posAt(lv.L, cell.x, cell.y, inDir, outDir, s);
}
function posAt(L, x, y, inDir, outDir, s) {
  const c = cellCenter(L, x, y);
  const p = sidePath(OPP[inDir], outDir, s);
  return { x: c.x + p.x * L.cs, y: c.y + p.y * L.cs, ang: p.ang };
}

function buildDeparture(lv) {
  const last = lv.sim.ticks[lv.sim.ticks.length - 1];
  const order = Object.entries(lv.sim.coupleTicks).sort((a, b) => a[1] - b[1]).map(([i]) => Number(i));
  const loco = lv.level.loco;
  let chain = [{ x: loco.x, y: loco.y, inDir: loco.dir, dir: loco.dir, kind: 'loco' }];
  for (const i of order) { const c = last.cars[i]; chain.push({ x: c.x, y: c.y, inDir: c.inDir, dir: c.dir, kind: 'car', color: lv.level.cars[i].color }); }
  const steps = [chain];
  const { cols, rows } = lv.level;
  for (let k = 0; k < cols + rows + chain.length + 2; k++) {
    const prev = steps[steps.length - 1];
    const next = prev.map((m, i) => {
      if (i === 0) return { ...m, x: m.x + VEC[m.dir].dx, y: m.y + VEC[m.dir].dy, inDir: m.dir, dir: m.dir };
      return { ...prev[i - 1], kind: m.kind, color: m.color };
    });
    steps.push(next);
    if (next.every((m) => m.x < -1 || m.y < -1 || m.x > cols || m.y > rows)) break;
  }
  return steps;
}
function departPose(lv, i, T) {
  const steps = lv.depart;
  const t = clamp(Math.floor(T), 0, steps.length - 1);
  const f = T - t;
  const a = steps[t][i], b = steps[Math.min(t + 1, steps.length - 1)][i];
  const moved = b.x !== a.x || b.y !== a.y;
  if (moved && f >= 0.5) return posAt(lv.L, b.x, b.y, b.inDir, b.dir, f - 0.5);
  if (moved) return posAt(lv.L, a.x, a.y, a.inDir, a.dir, 0.5 + f);
  return posAt(lv.L, a.x, a.y, a.inDir, a.dir, 0.5);
}

function updateLevel(lv, dt) {
  lv.press = Math.max(0, lv.press - dt * 4);
  const L = lv.L;
  const ticks = lv.sim.ticks;
  const lastTick = ticks.length - 1;
  if (lv.phase === 'run') {
    const prevT = lv.T;
    lv.T = Math.min(lastTick, lv.T + dt / TICK);
    const crossed = Math.floor(lv.T) > Math.floor(prevT) ? Math.floor(lv.T) : null;
    if (crossed != null) {
      sfx.chug(crossed);
      for (const [i, ct] of Object.entries(lv.sim.coupleTicks)) {
        if (ct === crossed) { const p = carPose(lv, Number(i), lv.T); fx.sparkle(p.x, p.y, L.cs * 0.5); sfx.couple(); }
      }
    }
    lv.smokeT += dt;
    if (lv.smokeT > 0.28) { lv.smokeT = 0; const lp = locoPose(lv); fx.smoke(lp.x + Math.cos(lp.ang) * L.cs * 0.25, lp.y + Math.sin(lp.ang) * L.cs * 0.25 - L.cs * 0.15, L.cs * 0.35); }
    // wheel dust for moving cars
    if (lv.T >= lastTick) {
      if (lv.sim.outcome === 'clear') {
        lv.phase = 'clear'; lv.timer = 0; sfx.fanfare();
        const lp = locoPose(lv); fx.confetti(lp.x, lp.y, L.cs * 0.5, 60);
        storage.setCleared(lv.id);
      } else {
        lv.phase = 'fail'; lv.timer = 0; lv.fail = lv.sim.fail;
        const f = lv.fail;
        if (f.kind === 'stuck') { sfx.bump(); if (f.cell) { const c = cellCenter(L, f.cell.x, f.cell.y); fx.dust(c.x, c.y, L.cs * 0.6, 10); } }
        else { sfx.boing(); if (f.cell) { const c = cellCenter(L, f.cell.x, f.cell.y); fx.dust(c.x, c.y, L.cs * 0.6, 12); } }
      }
    }
  } else if (lv.phase === 'fail') {
    lv.timer += dt;
    if (lv.timer > 1.0) { lv.phase = 'rewind'; sfx.rewind(); }
  } else if (lv.phase === 'rewind') {
    lv.T = Math.max(0, lv.T - dt * REWIND_SPEED);
    if (lv.T <= 0) { lv.phase = 'idle'; lv.fail = null; }
  } else if (lv.phase === 'clear') {
    lv.timer += dt;
    if (lv.timer > 1.3) { lv.phase = 'depart'; lv.depart = buildDeparture(lv); lv.T = 0; sfx.whistle(); }
  } else if (lv.phase === 'depart') {
    const prevT = lv.T;
    lv.T += dt / (TICK * 0.7);
    if (Math.floor(lv.T) > Math.floor(prevT)) sfx.chug(Math.floor(lv.T));
    lv.smokeT += dt;
    if (lv.smokeT > 0.2) { lv.smokeT = 0; const p = departPose(lv, 0, lv.T); fx.smoke(p.x, p.y - L.cs * 0.2, L.cs * 0.35); }
    if (lv.T >= lv.depart.length - 1) {
      const idx = LEVELS.findIndex((l) => l.id === lv.id);
      const finished = idx === LEVELS.length - 1;
      lv.phase = 'done';
      startFade(() => enterMap({ arriveFrom: idx, finished }));
    }
  }
}

function drawLevelScene(lv) {
  const { L, level } = lv;
  drawSky();
  drawGround(ctx, L, time);
  drawCells(ctx, L, level, lv.placed, time);
  const connected = lv.sim.outcome === 'clear' && lv.phase === 'idle';
  if (connected) drawGlow(ctx, L, lv.sim.visited, time);
  drawTracks(ctx, L, level, lv.placed);
  if (lv.ghost && lv.phase === 'idle') drawGhost(ctx, L, lv.ghost.x, lv.ghost.y, lv.ghost.piece, time);
  // tap ripple on the last edited cell
  if (lv.lastTap && time - lv.lastTap.t < 0.35) {
    const c = cellCenter(L, lv.lastTap.x, lv.lastTap.y);
    const k = (time - lv.lastTap.t) / 0.35;
    ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(c.x, c.y, L.cs * (0.2 + 0.4 * k), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  // trains
  const T = lv.T;
  if (lv.phase === 'depart') {
    const chain = lv.depart[0];
    for (let i = chain.length - 1; i >= 0; i--) {
      const p = departPose(lv, i, T);
      if (i === 0) drawLoco(ctx, p.x, p.y, p.ang, L.cs, { time });
      else drawCar(ctx, p.x, p.y, p.ang, L.cs, chain[i].color, 'joy', time);
    }
  } else {
    const nextColor = expectedColor(lv, T);
    const tags = level.cars.map((c, i) => ({ color: c.color, done: isCoupledAt(lv, i, T) }));
    const lp = locoPose(lv);
    const bob = lv.phase === 'idle' ? (connected ? 1 : 0.35) : 0;
    let shake = 0;
    if (lv.phase === 'fail' && lv.fail && lv.fail.kind !== 'stuck') shake = Math.sin(lv.timer * 40) * L.cs * 0.03 * Math.max(0, 1 - lv.timer);
    // draw cars first (so loco sits on top when adjacent), in reverse order
    for (let i = level.cars.length - 1; i >= 0; i--) {
      const p = carPose(lv, i, T);
      let mood = 'normal';
      let lx = 0, ly = 0;
      if (lv.phase === 'fail' && lv.fail && lv.fail.cars.includes(i)) {
        mood = 'surprised';
        const k = Math.sin(Math.PI * clamp(lv.timer / 0.45, 0, 1)) * L.cs * 0.28;
        lx = Math.cos(p.ang) * k; ly = Math.sin(p.ang) * k;
      } else if (lv.phase === 'rewind' && lv.fail && lv.fail.cars.includes(i)) mood = 'surprised';
      else if (isCoupledAt(lv, i, T) && lv.phase !== 'idle') mood = 'joy';
      else if (lv.phase === 'clear') mood = 'joy';
      drawCar(ctx, p.x + lx, p.y + ly, p.ang, L.cs, level.cars[i].color, mood, time);
    }
    drawLoco(ctx, lp.x + shake, lp.y, lp.ang, L.cs, { bob, press: lv.press, tags, nextColor, time });
  }
  fx.draw(ctx);
  drawHome(lv.home);
}
function isCoupledAt(lv, i, T) {
  const ct = lv.sim.coupleTicks[i];
  return ct != null && T >= ct;
}
function expectedColor(lv, T) {
  for (const i of lv.sim.order) if (!isCoupledAt(lv, i, T)) return lv.level.cars[i].color;
  return null;
}
function drawHome(h) {
  const bob = Math.sin(time * 2.5) * h.r * 0.06;
  ctx.save();
  ctx.translate(h.x, h.y + bob);
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.strokeStyle = '#3a2e2a'; ctx.lineWidth = Math.max(1.5, h.r * 0.08);
  ctx.beginPath(); ctx.arc(0, 0, h.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const r = h.r * 0.55;
  ctx.fillStyle = '#f7b267';
  roundRect(ctx, -r * 0.6, -r * 0.1, r * 1.2, r * 0.9, r * 0.1); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d9534f';
  ctx.beginPath(); ctx.moveTo(-r * 0.8, -r * 0.05); ctx.lineTo(0, -r * 0.75); ctx.lineTo(r * 0.8, -r * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff6d6';
  roundRect(ctx, -r * 0.18, r * 0.25, r * 0.36, r * 0.5, r * 0.06); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- shared drawing
function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.sky1); g.addColorStop(1, C.sky2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // drifting clouds
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 4; i++) {
    const cx = ((time * 8 + i * W * 0.31) % (W + 200)) - 100, cy = H * (0.08 + i * 0.05);
    const r = Math.min(W, H) * 0.035;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.arc(cx + r * 1.1, cy - r * 0.3, r * 0.8, 0, Math.PI * 2); ctx.arc(cx - r * 1.1, cy - r * 0.1, r * 0.7, 0, Math.PI * 2); ctx.arc(cx + r * 0.3, cy - r * 0.6, r * 0.7, 0, Math.PI * 2); ctx.fill();
  }
  // hills
  ctx.fillStyle = C.hill;
  ctx.beginPath(); ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 20) ctx.lineTo(x, H - H * 0.06 - Math.sin(x / W * 6 + 1) * H * 0.03);
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
}

// ---------------------------------------------------------------- transitions
function startFade(fn) {
  if (app.fadeDir !== 0) return;
  app.fadeDir = 1; app.pending = fn;
}
function enterMap(opts) {
  app.lv = null; app.scene = 'map'; app.map = makeMap(opts);
}
function updateFade(dt) {
  if (app.fadeDir === 1) {
    app.fade = Math.min(1, app.fade + dt * 3.5);
    if (app.fade >= 1) { app.pending && app.pending(); app.pending = null; app.fadeDir = -1; }
  } else if (app.fadeDir === -1) {
    app.fade = Math.max(0, app.fade - dt * 3.5);
    if (app.fade <= 0) app.fadeDir = 0;
  }
}

// ---------------------------------------------------------------- input
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  unlock();
  if (app.fadeDir !== 0) return;
  const x = e.clientX, y = e.clientY;
  if (app.scene === 'map') tapMap(app.map, x, y);
  else if (app.scene === 'level') tapLevel(app.lv, x, y);
}, { passive: false });
['touchstart', 'touchmove', 'gesturestart', 'contextmenu', 'dblclick'].forEach((ev) =>
  window.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));

// ---------------------------------------------------------------- loop
function frame(nowMs) {
  const dt = Math.min(0.05, (nowMs - last) / 1000);
  last = nowMs; time += dt;
  updateFade(dt);
  if (app.scene === 'map') updateMap(app.map, dt); else if (app.lv) updateLevel(app.lv, dt);
  fx.update(dt);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (app.scene === 'map') drawMapScene(app.map); else if (app.lv) drawLevelScene(app.lv);
  if (app.scene === 'map') fx.draw(ctx);
  if (app.fade > 0) { ctx.fillStyle = `rgba(230, 244, 255, ${app.fade})`; ctx.fillRect(0, 0, W, H); }
  requestAnimationFrame(frame);
}

// Debug/automation hook (used by tools/screenshots.js).
window.__poppo = { app, cellCenter: (x, y) => cellCenter(app.lv.L, x, y), station: (i) => app.map.ML.stations[i], levels: LEVELS };

resize();
enterMap({});
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
