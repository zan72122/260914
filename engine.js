/* Sweet Towers — shared engine for the wordless one-finger building games.
   Single finger. Portrait & landscape. No text, no buttons. */
'use strict';

// ============================================================ basics
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
let W = 0, H = 0, DPR = 1, portrait = true;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// affine matrices, canvas layout [a,b,c,d,e,f]
const I = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]];
const T = (x, y) => [1, 0, 0, 1, x, y];
const R = a => { const c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, 0, 0]; };
const S = (x, y) => [x, 0, 0, y, 0, 0];
const apply = (m, x, y) => [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];
const inv = m => { const det = m[0]*m[3] - m[1]*m[2]; const a = m[3]/det, b = -m[1]/det, c = -m[2]/det, d = m[0]/det; return [a, b, c, d, -(a*m[4] + c*m[5]), -(b*m[4] + d*m[5])]; };

// easing
const easeOut = t => 1 - (1 - t) * (1 - t);
const easeIn = t => t * t;
const easeInOut = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
const easeBack = t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const easeBounce = t => { const n = 7.5625, d = 2.75; if (t < 1/d) return n*t*t; if (t < 2/d) return n*(t -= 1.5/d)*t + .75; if (t < 2.5/d) return n*(t -= 2.25/d)*t + .9375; return n*(t -= 2.625/d)*t + .984375; };

// ============================================================ audio (synthesized, no files)
const audio = (() => {
  let ac = null, master = null;
  function unlock() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination); } catch (e) { ac = null; }
    }
    if (ac && ac.state === 'suspended') ac.resume();
  }
  function tone(f0, f1, dur, type, vol, delay = 0) {
    if (!ac) return; const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
  }
  let noiseBuf = null;
  function noise(dur, vol, fLo, fHi, delay = 0) {
    if (!ac) return; const t = ac.currentTime + delay;
    if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(fLo, t); f.frequency.exponentialRampToValueAtTime(fHi, t + dur); f.Q.value = 0.8;
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .02);
  }
  return {
    unlock,
    kachon() { noise(.04, .5, 3000, 1500); tone(900, 300, .09, 'square', .12); tone(220, 160, .18, 'sine', .35, .02); },
    don() { tone(120, 55, .25, 'sine', .6); noise(.08, .4, 400, 120); },
    thud() { tone(90, 40, .35, 'sine', .7); noise(.12, .5, 300, 80); },
    pop() { tone(500, 1400, .07, 'sine', .3); noise(.05, .3, 2000, 4000); },
    shuk() { noise(.14, .45, 2500, 500); tone(700, 350, .12, 'triangle', .15); },
    click() { tone(1600, 1200, .025, 'square', .12); },
    fwoosh() { noise(.45, .5, 300, 3500); },
    pon(p = 1) { tone(600 * p, 900 * p, .06, 'sine', .25); tone(1200 * p, 1000 * p, .1, 'sine', .12, .03); },
    plip() { tone(350, 700, .08, 'sine', .25); },
    boing() { tone(200, 320, .12, 'triangle', .3); tone(320, 250, .18, 'triangle', .2, .12); },
    shing() { tone(1500, 2600, .3, 'sine', .15); tone(2200, 3200, .3, 'sine', .08, .05); },
    chime() { const n = [523, 659, 784, 1047, 1319]; n.forEach((f, i) => tone(f, f, .5, 'sine', .22, i * .11)); },
    fanfare() { const n = [523, 523, 523, 659, 784, 1047]; const d = [0, .15, .3, .45, .6, .8]; n.forEach((f, i) => tone(f, f, .35, 'triangle', .22, d[i])); tone(1319, 1319, 1.2, 'sine', .15, 1.0); },
    blow() { noise(.6, .6, 800, 200); },
    ratchet() { tone(2000, 1500, .02, 'square', .08); },
    whistle() { tone(900, 1800, .35, 'sine', .12); },
    splat() { noise(.12, .35, 900, 300); tone(300, 150, .12, 'sine', .2); },
  };
})();

// ============================================================ world state
const G = {
  t: 0, stage: null, stageT: 0,
  root: null, nodes: [], internals: [], parts: [], particles: [], tweens: [], hits: [],
  cam: { x: 0, y: -200, s: 1 }, camT: { x: 0, y: -200, s: 1 }, camSnap: true, shake: 0,
  tray: { x: 0, y: 0, tx: 0, ty: 0, visible: false },
  finger: { x: 0, y: 0, down: false },
  T1: null, board: null, T2: null, slab: null, balls: [], spire: null, candle: null,
  flavor: 0, round: 0, confetti: [],
};
const FLAVORS = [
  { sponge: '#f6d9a0', layer: '#fff4dc', edge: '#b98a55' },
  { sponge: '#c68b5c', layer: '#f1d7bd', edge: '#7a4a2a' },
  { sponge: '#f7c8cf', layer: '#fff0f2', edge: '#c67a88' },
  { sponge: '#cfe0a0', layer: '#f4f9e2', edge: '#8aa05a' },
];
const CREAMS = [
  { c: '#ffb3d1', hi: '#ffe1ee', lo: '#e58fb3' },
  { c: '#b9ecd8', hi: '#e6fff5', lo: '#82c9ad' },
  { c: '#8f5a3c', hi: '#c9946e', lo: '#5e3620' },
  { c: '#fff1a3', hi: '#fffbe0', lo: '#e0c96a' },
];

// ---- nodes (the cake tree)
class Node {
  constructor(kind, o) {
    this.kind = kind; this.x = 0; this.rot = 0; this.lift = 0; this.wob = 0; this.sy = 1; this.lean = 0;
    this.phase = Math.random() * TAU; this.children = []; this.parent = null;
    this.fill = 0; this.cream = null; this.cells = null; this.toppings = []; this.alpha = 1;
    this.bendL = 0; this.bendR = 0; this.flavor = G.flavor;
    Object.assign(this, o);
    if (this.kind === 'ball') { this.w = this.r * 2; this.h = this.r * 2; }
    this.m = I.slice();
  }
  get topY() { return -this.h; }
  add(c) { c.parent = this; this.children.push(c); G.nodes.push(c); return c; }
  wobRot(t) {
    switch (this.kind) {
      case 'tier': return this.wob * 0.05 * Math.sin(t * 6 + this.phase) + this.wob * 0.02 * Math.sin(t * 13 + this.phase);
      case 'ball': return this.wob * 0.16 * Math.sin(t * 7 + this.phase);
      case 'spire': return this.wob * 0.05 * Math.sin(t * 3.2 + this.phase);
      case 'slab': return this.wob * 0.03 * Math.sin(t * 5 + this.phase);
      default: return 0;
    }
  }
  update(pm, t) {
    let m = mul(pm, T(this.x, (this.parent ? this.parent.topY : 0) + this.lift));
    m = mul(m, R(this.rot + this.lean + this.wobRot(t)));
    if (this.sy !== 1) m = mul(m, S(1, this.sy));
    this.m = m; this.im = null;
    for (const c of this.children) c.update(m, t);
  }
  local(wx, wy) { if (!this.im) this.im = inv(this.m); return apply(this.im, wx, wy); }
  world(lx, ly) { return apply(this.m, lx, ly); }
  topWorld() { return this.world(0, this.topY); }
  bottomWorld() { return this.world(0, 0); }
}

function bodyPath(n) {
  const { w, h } = n;
  switch (n.kind) {
    case 'tier': rr(-w / 2, -h, w, h, 16); break;
    case 'board': rr(-w / 2, -h, w, h, 4); break;
    case 'slab': {
      const bl = n.bendL, br = n.bendR;
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h + bl); ctx.quadraticCurveTo(-w / 4, -h - bl * .2, 0, -h); ctx.quadraticCurveTo(w / 4, -h - br * .2, w / 2, -h + br);
      ctx.lineTo(w / 2, br); ctx.quadraticCurveTo(w / 4, -br * .2, 0, 0); ctx.quadraticCurveTo(-w / 4, -bl * .2, -w / 2, bl); ctx.closePath(); break;
    }
    case 'ball': ctx.beginPath(); ctx.arc(0, -n.r, n.r, 0, TAU); break;
    case 'spire': ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.quadraticCurveTo(-w * .22, -h * .5, 0, -h); ctx.quadraticCurveTo(w * .22, -h * .5, w / 2, 0); ctx.closePath(); break;
    case 'candle': rr(-w / 2, -h, w, h, 4); break;
    default: if (BODY_PATHS[n.kind]) BODY_PATHS[n.kind](n);
  }
}
const BODY_PATHS = {}; // extra body shapes registered by games
function rr(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

// ---- frosting grid
const CS = 20;
function initFrost(n) {
  const cols = Math.ceil(n.w / CS) + 1, rows = Math.ceil(n.h / CS) + 1;
  n.cells = new Uint8Array(cols * rows); n.cols = cols; n.rows = rows;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); bodyPath(n);
  let inside = 0; n.inside = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const cx = -n.w / 2 + i * CS + CS / 2, cy = -n.h + j * CS + CS / 2;
    const ok = ctx.isPointInPath(cx, cy) || ctx.isPointInPath(cx, cy - CS / 2) || ctx.isPointInPath(cx, cy + CS / 2);
    n.inside[j * cols + i] = ok ? 1 : 0; if (ok) inside++;
  }
  ctx.restore(); n.insideCount = Math.max(1, inside); n.painted = 0; n.coverage = 0;
}
function paintFrost(n, lx, ly, rad) {
  if (!n.cells || n.fill > 0) return false;
  if (lx < -n.w / 2 - rad || lx > n.w / 2 + rad || ly < -n.h - rad || ly > rad) return false;
  let hit = false;
  for (let j = 0; j < n.rows; j++) for (let i = 0; i < n.cols; i++) {
    const k = j * n.cols + i; if (n.cells[k]) continue;
    const cx = -n.w / 2 + i * CS + CS / 2, cy = -n.h + j * CS + CS / 2;
    if (dist(cx, cy, lx, ly) < rad) { n.cells[k] = 1; hit = true; if (n.inside[k]) n.painted++; }
  }
  n.coverage = n.painted / n.insideCount; return hit;
}

// ---- tweens / particles
function tween(obj, to, dur, ease = easeOut, onDone = null) { const tw = { obj, to, from: null, t: 0, dur, ease, onDone }; G.tweens.push(tw); return tw; }
function updateTweens(dt) {
  for (let i = G.tweens.length - 1; i >= 0; i--) {
    const tw = G.tweens[i]; if (!tw) continue;
    if (!tw.from) { tw.from = {}; for (const k in tw.to) tw.from[k] = tw.obj[k]; }
    tw.t += dt; const p = Math.min(1, tw.t / tw.dur), e = tw.ease(p);
    for (const k in tw.to) tw.obj[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
    if (p >= 1) { G.tweens.splice(i, 1); if (tw.onDone) tw.onDone(); }
  }
}
function burst(x, y, n, colors, spd = 220, life = .7, grav = 500, size = 6) {
  for (let i = 0; i < n; i++) {
    if (G.particles.length > 220) G.particles.shift();
    const a = rnd(0, TAU), v = rnd(spd * .3, spd);
    G.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * .4, life, max: life, grav, c: colors[i % colors.length], s: rnd(size * .6, size * 1.3), shape: Math.random() < .5 ? 0 : 1 });
  }
}
function sparkle(x, y, n = 8) { burst(x, y, n, ['#fff7c0', '#ffffff', '#ffe37a'], 120, .6, 60, 5); }
function updateParticles(dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i]; p.life -= dt; if (p.life <= 0) { G.particles.splice(i, 1); continue; }
    p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= (1 - dt * 1.5);
  }
}

// ---- hit registry
function addHit(h) { G.hits.push(h); return h; }
function removeHit(h) { const i = G.hits.indexOf(h); if (i >= 0) G.hits.splice(i, 1); }
function pickHit(wp) {
  let best = null, bestQ = 1;
  for (const h of G.hits) {
    if (h.disabled) continue;
    const p = h.pos(); const r = Math.max(h.r || 40, 34 / G.cam.s) * (h.big || 1);
    const q = dist(p[0], p[1], wp[0], wp[1]) / r; if (q < bestQ) { bestQ = q; best = h; }
  }
  return best;
}

// ---- tray (floating supply platform that rides beside the work)
function trayHome(i, n) {
  const gap = portrait ? 96 : 84; const off = (i - (n - 1) / 2) * gap;
  return portrait ? [G.tray.x + off, G.tray.y] : [G.tray.x, G.tray.y + off];
}
function addPart(p) { p.state = 'tray'; p.scale = p.scale || 1; p.enter = 0; G.parts.push(p); p.x = G.tray.tx + (portrait ? 0 : -400); p.y = G.tray.ty + (portrait ? 400 : 0); return p; }
function trayParts() { return G.parts.filter(p => p.state === 'tray'); }
function updateParts(dt) {
  const tp = trayParts();
  tp.forEach((p, i) => { const h = trayHome(i, tp.length); p.x += (h[0] - p.x) * Math.min(1, dt * 7); p.y += (h[1] - p.y) * Math.min(1, dt * 7); p.enter = Math.min(1, p.enter + dt * 2); });
  G.tray.visible = tp.length > 0 || G.parts.some(p => p.state === 'drag');
  G.tray.x += (G.tray.tx - G.tray.x) * Math.min(1, dt * 5); G.tray.y += (G.tray.ty - G.tray.y) * Math.min(1, dt * 5);
}
function removePart(p) { const i = G.parts.indexOf(p); if (i >= 0) G.parts.splice(i, 1); if (p.hit) removeHit(p.hit); }

// ============================================================ camera
function focusToCam(f) {
  const marginX = 50, marginY = 60;
  const fw = f.w + marginX * 2, fh = (f.bottom - f.top) + marginY * 2;
  const cy = (f.top + f.bottom) / 2;
  let s, x, y;
  if (portrait) {
    const reserve = G.tray.visible || f.tray ? 0.26 : 0.06;
    const availH = H * (1 - reserve - 0.05);
    s = Math.min(W / fw, availH / fh);
    s = clamp(s, 0.16, 1.6);
    const screenCy = H * (0.05 + (1 - reserve - 0.05) / 2);
    x = f.cx; y = cy - (screenCy - H / 2) / s;
  } else {
    const reserve = G.tray.visible || f.tray ? 0.3 : 0.05;
    const availW = W * (1 - reserve - 0.04);
    s = Math.min(availW / fw, H * 0.92 / fh);
    s = clamp(s, 0.16, 1.6);
    const screenCx = W * (reserve + 0.04 + (1 - reserve - 0.04) / 2);
    x = f.cx - (screenCx - W / 2) / s; y = cy;
  }
  return { x, y, s };
}
function toWorld(sx, sy, c = G.cam) { return [(sx - W / 2) / c.s + c.x, (sy - H / 2) / c.s + c.y]; }
function toScreen(wx, wy, c = G.cam) { return [(wx - c.x) * c.s + W / 2, (wy - c.y) * c.s + H / 2]; }
function updateCamera(dt) {
  const st = stages[G.stage]; const f = st.focus();
  const ct = focusToCam(f); G.camT = ct;
  if (G.camSnap) { Object.assign(G.cam, ct); G.camSnap = false; }
  else { const k = Math.min(1, dt * (f.veryslow ? 0.9 : f.slow ? 1.6 : 4)); G.cam.x = lerp(G.cam.x, ct.x, k); G.cam.y = lerp(G.cam.y, ct.y, k); G.cam.s = lerp(G.cam.s, ct.s, k); }
  // tray anchor from the target camera (stable while items rest)
  const tp = portrait ? toWorld(W / 2, H * 0.865, ct) : toWorld(W * 0.16, H * 0.5, ct);
  G.tray.tx = tp[0]; G.tray.ty = tp[1];
}

// ============================================================ stages
const stages = {};
function setStage(name) { G.hits.length = 0; G.stage = name; G.stageT = 0; stages[name].enter(); }
function later(sec, fn) { G.tweens.push({ obj: {}, to: {}, from: {}, t: 0, dur: sec, ease: easeOut, onDone: fn }); }
function jiggleAt(wp) { // the world answers every touch, even an aimless one
  for (const n of G.nodes) { const l = n.local(wp[0], wp[1]); if (l[0] > -n.w / 2 && l[0] < n.w / 2 && l[1] > -n.h && l[1] < 0) { n.sy = .92; tween(n, { sy: 1 }, .35, easeBack); audio.boing(); sparkle(wp[0], wp[1], 3); return true; } }
  return false;
}
function tapWithTrayPart(wp) { // a tap on the target pulls the matching part over by itself
  const p = trayParts().find(q => q.hit && q.hit.up); if (!p) return false;
  const ox = p.x, oy = p.y; p.x = wp[0]; p.y = wp[1] - (p.kind === 'dowel' ? 40 : 30); p.state = 'drag'; p.hit.up(wp);
  if (p.state === 'tray') { p.x = ox; p.y = oy; return false; } return true;
}
function snapFx(x, y) { audio.kachon(); sparkle(x, y, 10); G.shake = Math.max(G.shake, 4); }


const TOPPINGS = ['strawberry', 'cherry', 'star', 'candy', 'blueberry'];

// ============================================================ rendering
function setCam(m) { const c = G.cam; const shx = G.shake > 0 ? rnd(-G.shake, G.shake) : 0, shy = G.shake > 0 ? rnd(-G.shake, G.shake) : 0; const CM = [c.s, 0, 0, c.s, W / 2 - c.x * c.s + shx, H / 2 - c.y * c.s + shy]; const M = mul(mul([DPR, 0, 0, DPR, 0, 0], CM), m || I); ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]); }
function viewRect() { const a = toWorld(0, 0), b = toWorld(W, H); return { l: a[0], t: a[1], r: b[0], b: b[1] }; }

function drawTray() {
  if (!G.tray.visible && G.parts.length === 0) return;
  const tp = trayParts(); if (tp.length === 0) return;
  setCam();
  const n = tp.length; const len = (n - 1) * (portrait ? 96 : 84) + (portrait ? 150 : 110);
  ctx.save(); ctx.translate(G.tray.x, G.tray.y + Math.sin(G.t * 1.5) * 3);
  if (portrait) { ctx.fillStyle = '#c99a62'; rr(-len / 2, 40, len, 18, 8); ctx.fill(); ctx.fillStyle = '#e8bd85'; rr(-len / 2, 40, len, 6, 4); ctx.fill(); }
  else { ctx.fillStyle = '#c99a62'; rr(-52, -len / 2, 104, len, 14); ctx.fill(); ctx.fillStyle = '#e8bd85'; rr(-46, -len / 2 + 6, 92, len - 12, 10); ctx.fill(); }
  ctx.restore();
}


const PART_DRAW = {};  // part kind -> drawer, registered by each game
function drawPart(p) {
  setCam(); const bob = p.state === 'tray' ? Math.sin(G.t * 2.4 + p.x * .01) * 5 : 0;
  const x = p.fly ? p.fly.x : p.x, y = (p.fly ? p.fly.y : p.y) + bob;
  ctx.save(); ctx.translate(x, y); const sc = (p.scale || 1) * (p.enter < 1 ? easeBack(p.enter) : 1); ctx.scale(sc, sc);
  ctx.lineWidth = 3; ctx.lineJoin = 'round';
  const f = PART_DRAW[p.kind]; if (f) f(p);
  ctx.restore();
}

function drawTopping(t) {
  ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.rot); ctx.scale(t.s, t.s); ctx.lineWidth = 2;
  switch (t.kind) {
    case 'strawberry': drawStrawberry(0, 0, 1); break;
    case 'cherry': ctx.strokeStyle = '#4b7b2a'; ctx.beginPath(); ctx.moveTo(0, -4); ctx.quadraticCurveTo(6, -22, 12, -24); ctx.stroke(); ctx.fillStyle = '#d62839'; ctx.beginPath(); ctx.arc(0, 2, 11, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff8fa0'; ctx.beginPath(); ctx.arc(-4, -2, 3, 0, TAU); ctx.fill(); break;
    case 'star': ctx.fillStyle = '#ffd400'; ctx.strokeStyle = '#d9a400'; ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 6 : 14, a = i * Math.PI / 5 - Math.PI / 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    case 'candy': ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill(); ctx.strokeStyle = '#ff5c7a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.stroke(); ctx.strokeStyle = '#ff5c7a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.stroke(); break;
    case 'blueberry': ctx.fillStyle = '#4b5bd6'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(i * 10 - 10, (i % 2) * -8, 7, 0, TAU); ctx.fill(); } ctx.fillStyle = '#9aa6ff'; ctx.beginPath(); ctx.arc(-12, -3, 2.5, 0, TAU); ctx.fill(); break;
  }
  ctx.restore();
}
function drawStrawberry(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.moveTo(-12, -6); ctx.quadraticCurveTo(-14, 14, 0, 16); ctx.quadraticCurveTo(14, 14, 12, -6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#4b9b3a'; ctx.beginPath(); ctx.moveTo(-12, -6); ctx.lineTo(-4, -14); ctx.lineTo(0, -7); ctx.lineTo(4, -14); ctx.lineTo(12, -6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffe08a'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-6 + (i % 3) * 6, -1 + Math.floor(i / 3) * 7, 1.4, 0, TAU); ctx.fill(); }
  ctx.restore();
}

function drawParticles() {
  setCam();
  for (const p of G.particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.c; if (p.shape) { ctx.beginPath(); ctx.arc(p.x, p.y, p.s / 2, 0, TAU); ctx.fill(); } else ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
  ctx.globalAlpha = 1;
  for (const c of G.confetti) { ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.fillStyle = c.c; ctx.fillRect(-c.s / 2, -c.s / 4, c.s, c.s / 2); ctx.restore(); }
}
function drawFingerCream() {
  if (!G.paintMode || !G.brush || !G.finger.down) return; setCam();
  ctx.fillStyle = G.brush.c; ctx.beginPath(); ctx.arc(G.finger.x, G.finger.y, 26, 0, TAU); ctx.fill(); ctx.fillStyle = G.brush.hi; ctx.beginPath(); ctx.arc(G.finger.x - 8, G.finger.y - 8, 8, 0, TAU); ctx.fill();
}

function walk(n, fn) { fn(n); for (const c of n.children) walk(c, fn); }

function drawFade() { if (G.fade > 0) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = `rgba(20,10,30,${G.fade})`; ctx.fillRect(0, 0, W, H); } }

// ============================================================ games
function clearWorld() {
  G.nodes.length = 0; G.internals.length = 0; G.parts.length = 0; G.hits.length = 0; G.tweens.length = 0; G.confetti.length = 0; G.particles.length = 0;
  G.root = null; G.rootM = null; G.paintMode = false; G.brush = null;
  G.T1 = null; G.board = null; G.T2 = null; G.slab = null; G.balls = []; G.spire = null; G.candle = null; G.rod = null; G.crane = null; G.struts = []; G.skewer = null; G.rope = null; G.buckets = []; G.toppingsCount = 0;
  G.camSnap = true;
}
const GAMES = {};   // name -> { start(), update(dt), render() }
function setGame(name) { G.game = GAMES[name]; G.gameName = name; G.game.start(); }

// ============================================================ loop
let last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts; G.t += dt; G.stageT += dt;
  updateTweens(dt); updateParts(dt); updateParticles(dt);
  stages[G.stage].update(dt);
  if (G.root) G.root.update(G.rootM || T(0, 0), G.t);
  if (G.game.update) G.game.update(dt);
  updateCamera(dt); G.shake = Math.max(0, G.shake - dt * 30);
  G.game.render(); drawFade();
}

// ============================================================ input (one finger only)
let pointerId = null, active = null;
function evWorld(e) { return toWorld(e.clientX, e.clientY); }
canvas.addEventListener('pointerdown', e => {
  e.preventDefault(); if (pointerId !== null) return; pointerId = e.pointerId; try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  audio.unlock(); const wp = evWorld(e); G.finger.x = wp[0]; G.finger.y = wp[1]; G.finger.down = true;
  const st = stages[G.stage]; active = pickHit(wp);
  if (active && active.down) active.down(wp); else if (st.downAny) st.downAny(wp);
}, { passive: false });
canvas.addEventListener('pointermove', e => {
  if (e.pointerId !== pointerId) return; const wp = evWorld(e); G.finger.x = wp[0]; G.finger.y = wp[1];
  const st = stages[G.stage]; if (active && active.move) active.move(wp); else if (!active && st.moveAny) st.moveAny(wp);
});
function end(e) {
  if (e.pointerId !== pointerId) return; const wp = evWorld(e); const st = stages[G.stage];
  if (active && active.up) active.up(wp); else if (!active && st.upAny) st.upAny(wp);
  active = null; pointerId = null; G.finger.down = false;
}
canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
canvas.addEventListener('touchend', () => audio.unlock(), { passive: true }); canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());

function resize() { DPR = Math.min(2, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight; canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR); canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; portrait = H >= W; G.camSnap = true; }
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 50));

// debug hooks for automated play-testing (no UI)
window.__game = {
  G, stages, toScreen, setGame,
  state() { const s = { game: G.gameName, stage: G.stage, stageT: G.stageT, parts: G.parts.map(p => ({ kind: p.kind, state: p.state })), hits: G.hits.length, cam: { ...G.cam } }; if (G.game.debugState) Object.assign(s, G.game.debugState()); return s; },
  targets() { return G.hits.filter(h => !h.disabled).map(h => { const p = h.pos(); const s = toScreen(p[0], p[1]); return { x: s[0], y: s[1] }; }); },
  screen(wx, wy) { return toScreen(wx, wy); },
  holes() { return G.T1.holes.map((hx, i) => ({ filled: G.T1.holesFilled[i], p: toScreen(...G.T1.world(hx, -G.T1.h)) })); },
  strutMid(side) { const sk = stages.slab.sockets(side); return toScreen((sk.upW[0] + sk.loW[0]) / 2, (sk.upW[1] + sk.loW[1]) / 2); },
  node(name) { const n = G[name]; if (!n) return null; const b = n.bottomWorld(), t = n.topWorld(); return { bottom: toScreen(...b), top: toScreen(...t), w: n.w * G.cam.s, h: n.h * G.cam.s }; },
};
