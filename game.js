/* Cake Tower — wordless cake-architecture game for small hands.
   Single finger. Portrait & landscape. No text, no buttons. */
'use strict';
(() => {
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
  }
}
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
    const tw = G.tweens[i];
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

// ---------------- stage 0: dowels + board
function newRound() {
  G.nodes.length = 0; G.internals.length = 0; G.parts.length = 0; G.hits.length = 0; G.tweens.length = 0; G.confetti.length = 0;
  G.flavor = G.round % FLAVORS.length;
  G.T1 = new Node('tier', { w: 290, h: 96, holes: [-92, 0, 92], wob: 1, lift: -900, flavor: G.flavor });
  G.root = G.T1; G.nodes.push(G.T1); initFrost(G.T1);
  G.board = null; G.T2 = null; G.slab = null; G.balls = []; G.spire = null; G.candle = null; G.rod = null; G.crane = null; G.struts = []; G.skewer = null; G.rope = null; G.buckets = []; G.toppingsCount = 0;
  G.camSnap = true;
}
stages.dowels = {
  enter() {
    newRound();
    const T1 = G.T1;
    tween(T1, { lift: 0 }, 0.9, easeBounce, () => {
      audio.thud(); G.shake = 8; burst(0, 0, 14, ['#fff', '#f8e2b0'], 200, .5, 400, 5);
      later(0.5, () => {
        T1.dowelsIn = 0;
        for (let i = 0; i < 3; i++) {
          const p = addPart({ kind: 'dowel', hole: null, len: 78 });
          p.hit = addHit({ r: 50, pos: () => [p.x, p.y], down: () => { p.state = 'drag'; audio.plip(); }, move: wp => { p.x = wp[0]; p.y = wp[1] - 40; }, up: () => releaseDowel(p) });
          G.dragKind = 'dowel';
        }
      });
    });
    function releaseDowel(p) {
      const h = nearestHole(p); if (h) {
        p.state = 'done'; removeHit(p.hit);
        const tw = { x: p.x, y: p.y };
        tween(tw, { x: h.wx, y: h.wy - 42 }, 0.16, easeOut, () => {
          removePart(p); T1.holesFilled[h.i] = true; T1.dowelsIn++;
          G.internals.push({ owner: T1, x: h.x, y0: -T1.h - 6, y1: -8, r: 11, c: '#e9cd93', e: '#a8814d', cap: true, drive: 1 });
          const ins = G.internals[G.internals.length - 1]; ins.drive = 0; tween(ins, { drive: 1 }, 0.18, easeIn, () => { snapFx(h.wx, h.wy); T1.wob = Math.max(0, 1 - T1.dowelsIn / 3); T1.squash = 1; if (T1.dowelsIn === 3) allDowels(); });
        });
        p.fly = tw; return;
      }
      p.state = 'tray';
    }
    function nearestHole(p) {
      let best = null, bd = 90 / Math.min(1, G.cam.s * 1.2);
      T1.holes.forEach((hx, i) => { if (T1.holesFilled[i]) return; const [wx, wy] = T1.world(hx, -T1.h); const d = dist(wx, wy, p.x, p.y + 40); if (d < bd) { bd = d; best = { i, x: hx, wx, wy }; } });
      return best;
    }
    T1.holesFilled = [false, false, false];
    function allDowels() {
      T1.wob = 0; sparkle(...T1.topWorld(), 16); audio.shing();
      later(0.7, () => {
        const b = addPart({ kind: 'board', w: 310, h: 12, scale: 0.55 });
        b.hit = addHit({ r: 70, pos: () => [b.x, b.y], down: () => { b.state = 'drag'; tween(b, { scale: 1 }, .2); audio.plip(); }, move: wp => { b.x = wp[0]; b.y = wp[1] - 30; }, up: () => {
          const [tx, ty] = T1.topWorld();
          if (dist(b.x, b.y, tx, ty - 6) < 130 / Math.min(1, G.cam.s * 1.2)) {
            b.state = 'done'; removeHit(b.hit); const tw = { x: b.x, y: b.y };
            tween(tw, { x: tx, y: ty - 6 }, .14, easeOut, () => { removePart(b); const bd = T1.add(new Node('board', { w: 310, h: 12, lift: -18 })); G.board = bd; tween(bd, { lift: 0 }, .12, easeIn, () => { snapFx(tx, ty); later(.5, () => setStage('hammer')); }); });
            b.fly = tw;
          } else { b.state = 'tray'; tween(b, { scale: .55 }, .2); }
        } });
      });
    }
  },
  downAny(wp) { if (!tapWithTrayPart(wp)) jiggleAt(wp); },
  focus() { const T1 = G.T1; return { cx: 0, top: -T1.h - 110, bottom: 30, w: T1.w + 40, tray: true }; },
  update() {},
  draw() {},
};

// ---------------- stage 1: crane lowers T2, hammer the center rod
stages.hammer = {
  enter() {
    const T2 = G.board.add(new Node('tier', { w: 210, h: 130, lift: -700, wob: 0 })); G.T2 = T2; initFrost(T2);
    G.crane = { x: 0, y: -1400, hookTo: T2, mode: 'lower' };
    tween(T2, { lift: 0 }, 1.5, easeInOut, () => {
      audio.thud(); G.shake = 10; T2.wob = 1; burst(...T2.bottomWorld(), 16, ['#fff', '#f8e2b0'], 220, .5, 400, 5);
      G.crane.hookTo = null;
      later(0.7, () => {
        const rod = { owner: T2, x: 0, y0: -T2.h - 224, y1: -T2.h + 4, r: 10, c: '#c9d3dc', e: '#6d7b8a', cap: true, head: true, drive: 1, hits: 0 };
        G.rod = rod; G.internals.push(rod);
        G.crane.hookTo = rod; G.crane.mode = 'hold';
        const hit = addHit({ r: 70, big: 1.3, pos: () => T2.world(rod.x, rod.y0), down: () => { strike(); G.holdT = 0; }, move: () => {}, up: () => { G.holdT = -1; } });
        G.holdT = -1;
        function strike() {
          if (rod.hits >= 6 || rod.busy) return; rod.hits++; rod.busy = true;
          const step = 33; audio.don(); G.shake = 9; T2.sy = 0.86; tween(T2, { sy: 1 }, .35, easeBack);
          tween(rod, { y0: rod.y0 + step, y1: rod.y1 + step }, .1, easeIn, () => {
            rod.busy = false; burst(...T2.world(0, -T2.h), 6, ['#fff', '#e0c7a0'], 150, .4, 400, 4);
            T2.wob = Math.max(0, 1 - rod.hits / 6);
            if (rod.hits >= 6) { removeHit(hit); T2.wob = 0; snapFx(...T2.topWorld()); G.crane.hookTo = null; G.crane.mode = 'leave'; tween(G.crane, { y: -2000 }, 1.2, easeIn); later(.8, () => setStage('slab')); }
          });
        }
        this.strike = strike;
      });
    });
  },
  downAny(wp) { jiggleAt(wp); },
  update(dt) { if (G.holdT >= 0) { G.holdT += dt; if (G.holdT > .42) { G.holdT = 0; this.strike && this.strike(); } } },
  focus() { const T2 = G.T2; const top = G.rod ? T2.world(0, G.rod.y0)[1] - 60 : T2.topWorld()[1] - 220; return { cx: 0, top: Math.min(top, T2.topWorld()[1] - 120), bottom: 20, w: 320 }; },
  draw() {},
};

// ---------------- stage 2: slab on balloons, choose its position, then diagonal struts
stages.slab = {
  enter() {
    const T2 = G.T2;
    const slab = T2.add(new Node('slab', { w: 420, h: 48, lift: -70, x: 0 })); G.slab = slab; initFrost(slab);
    slab.balloons = 1; slab.floatIn = 0; slab.lift = -600; tween(slab, { lift: -70 }, 1.4, easeOut, () => { slab.hover = true; });
    let dragging = false, dragged = false;
    const hit = addHit({ r: 120, big: 1.4, pos: () => slab.world(0, -slab.h / 2), down: () => { dragging = true; dragged = false; audio.plip(); }, move: wp => { const [lx] = T2.local(wp[0], wp[1]); slab.x = clamp(lx, -78, 78); dragged = true; }, up: () => { if (!slab.hover) return; drop(); } });
    function drop() {
      dragging = false; slab.hover = false; removeHit(hit); audio.pop(); slab.balloons = 0;
      burst(...slab.world(0, -slab.h - 80), 14, ['#ff6b8a', '#ffd1dc', '#fff'], 260, .5, 300, 6);
      tween(slab, { lift: 0 }, .45, easeBounce, () => {
        audio.thud(); G.shake = 9; slab.wob = 0.6;
        // overhang -> ends droop
        slab.bendL = 0; slab.bendR = 0; tween(slab, { bendL: 22 + Math.max(0, -slab.x) * .1, bendR: 22 + Math.max(0, slab.x) * .1 }, .6, easeBack);
        later(0.5, () => { spawnStrut('L'); spawnStrut('R'); });
      });
    }
    G.struts = [];
    function sockets(side) {
      const sgn = side === 'L' ? -1 : 1;
      const up = [sgn * (slab.w / 2 - 28), 0];                       // slab-local, under the end
      const lo = T2.local(...T2.world(sgn * T2.w / 2, -T2.h * .5));   // T2 side wall (world)
      return { up, upW: slab.world(...up), loW: T2.world(sgn * T2.w / 2, -T2.h * .5), sgn };
    }
    function spawnStrut(side) {
      const p = addPart({ kind: 'strut', len: 120, side });
      p.hit = addHit({ r: 60, pos: () => [p.x, p.y], down: () => { p.state = 'drag'; audio.plip(); }, move: wp => { p.x = wp[0]; p.y = wp[1] - 30; }, up: () => {
        const s = bestSide(p); if (s) { p.state = 'done'; removeHit(p.hit); const sk = sockets(s); const mid = [(sk.upW[0] + sk.loW[0]) / 2, (sk.upW[1] + sk.loW[1]) / 2];
          const tw = { x: p.x, y: p.y }; tween(tw, { x: mid[0], y: mid[1] }, .15, easeOut, () => { removePart(p); attachStrut(s); }); p.fly = tw; }
        else p.state = 'tray';
      } });
    }
    const done = { L: false, R: false };
    function bestSide(p) {
      let best = null, bd = 150 / Math.min(1, G.cam.s * 1.2);
      for (const s of ['L', 'R']) { if (done[s]) continue; const sk = sockets(s); const mid = [(sk.upW[0] + sk.loW[0]) / 2, (sk.upW[1] + sk.loW[1]) / 2]; const d = dist(mid[0], mid[1], p.x, p.y + 30); if (d < bd) { bd = d; best = s; } }
      return best;
    }
    function attachStrut(s) {
      done[s] = true; const sk = sockets(s); const lo = slab.local(...sk.loW);
      const st = { side: s, a: sk.up, b: lo, grow: 0 }; G.struts.push(st);
      tween(st, { grow: 1 }, .18, easeOut, () => {
        snapFx(...sk.upW); if (s === 'L') tween(slab, { bendL: 0 }, .35, easeBack); else tween(slab, { bendR: 0 }, .35, easeBack);
        if (done.L && done.R) { slab.wob = 0; later(.6, () => setStage('balls')); } else slab.wob = 0.3;
      });
    }
    this.ghostSide = () => { const p = G.parts.find(q => q.kind === 'strut' && q.state === 'drag'); return p ? bestSide(p) : null; };
    this.sockets = sockets; this.done = done;
  },
  downAny(wp) { if (!tapWithTrayPart(wp)) jiggleAt(wp); },
  update() { const s = G.slab; if (s && s.hover) s.lift = -70 + Math.sin(G.t * 2) * 7; },
  focus() { const s = G.slab; const top = s.topWorld()[1] - (s.balloons ? 200 : 60); const sp = slabSpan(); return { cx: s.balloons ? 0 : sp.cx, top, bottom: G.T2.bottomWorld()[1] + 60, w: s.balloons ? 600 : sp.w }; },
  draw() {},
};

// ---------------- stage 3: balls flicked onto a skewer
stages.balls = {
  enter() {
    const slab = G.slab;
    G.skewer = { h: 0 }; tween(G.skewer, { h: 230 }, .5, easeBack, () => audio.shing());
    G.stackH = 0; G.balls = [];
    const specs = [{ r: 46, x: -178 }, { r: 36, x: 178 }, { r: 28, x: -96 }];
    later(.6, () => specs.forEach((sp, i) => later(i * .25, () => spawnBall(sp))));
    function spawnBall(sp) {
      const b = new Node('ball', { r: sp.r, x: sp.x, lift: -500, wob: 0, flavor: (G.flavor + 1 + G.balls.length) % FLAVORS.length }); slab.add(b); initFrost(b); G.balls.push(b);
      tween(b, { lift: 0 }, .55, easeBounce, () => { audio.boing(); b.wob = 1; b.free = true; });
      const hit = addHit({ r: b.r + 30, pos: () => b.world(0, -b.r), down: () => { if (!b.free) return; b.grab = true; b.wob = 0; audio.plip(); }, move: wp => { if (!b.grab) return; const l = slab.local(wp[0], wp[1] - b.r * .3); b.x = l[0]; b.lift = Math.min(0, l[1] + b.r) ; }, up: () => { if (!b.grab) return; b.grab = false; fly(b, hit); } });
    }
    function fly(b, hit) {
      b.free = false; removeHit(hit); audio.whistle();
      const topY = -G.skewer.h - b.r * 2 - 10; // above the skewer tip (slab-local)
      const startX = b.x, startL = b.lift; const arc = { t: 0 };
      tween(arc, { t: 1 }, .45, easeInOut, () => {
        // thread down the skewer
        const restL = -G.stackH; tween(b, { lift: restL }, .28, easeIn, () => {
          audio.shuk(); G.shake = 5; sparkle(...b.world(0, -b.r), 8); G.stackH += b.r * 2; b.stacked = true;
          for (const o of G.balls) if (o.stacked && o !== b) { o.sy = .9; tween(o, { sy: 1 }, .3, easeBack); }
          if (G.balls.every(o => o.stacked)) { audio.kachon(); later(.6, () => setStage('spire')); }
        });
      });
      arc.update = () => { b.x = lerp(startX, 0, arc.t); b.lift = lerp(startL, topY, arc.t) - Math.sin(arc.t * Math.PI) * 120; };
      G.arcs = G.arcs || []; G.arcs.push(arc);
    }
  },
  downAny(wp) { jiggleAt(wp); },
  update() { if (G.arcs) { G.arcs = G.arcs.filter(a => a.t < 1); G.arcs.forEach(a => a.update()); } },
  focus() { const slab = G.slab; const sp = slabSpan(); return { cx: sp.cx, top: slab.topWorld()[1] - G.skewer.h - 130, bottom: slab.bottomWorld()[1] + 90, w: sp.w }; },
  draw() {},
};

// ---------------- stage 4: balloon spire, pop it, wind the winch to straighten
stages.spire = {
  enter() {
    const top = [...G.balls].sort((a, b) => a.world(0, -a.r)[1] - b.world(0, -b.r)[1])[0]; // highest ball
    const spire = top.add(new Node('spire', { w: 78, h: 190, lift: -500, flavor: (G.flavor + 2) % FLAVORS.length })); G.spire = spire; initFrost(spire);
    spire.balloon = 1; tween(spire, { lift: -60 }, 1.6, easeOut, () => { spire.hover = true; });
    const hit = addHit({ r: 80, big: 1.3, pos: () => spire.world(0, -spire.h - 95), down: () => { if (!spire.hover) return; pop(); } });
    function pop() {
      spire.hover = false; removeHit(hit); spire.balloon = 0; audio.pop(); burst(...spire.world(0, -spire.h - 95), 16, ['#7fd3ff', '#d7f1ff', '#fff'], 260, .5, 300, 6);
      tween(spire, { lift: 0 }, .3, easeIn, () => {
        audio.kachon(); G.shake = 6; sparkle(...spire.bottomWorld(), 8);
        // it's tall and soft: it leans
        tween(spire, { lean: -0.5 }, 1.4, easeInOut, () => { spire.wob = 1; setupWinch(); });
      });
    }
    function setupWinch() {
      const slab = G.slab; const w = { x: slab.w / 2 - 34, y: -slab.h, ang: 0, held: false, next: -0.5 }; G.rope = w;
      const h = addHit({ r: 80, big: 1.4, pos: () => slab.world(w.x, w.y - 14), down: () => { w.held = true; audio.click(); wind(0.05); }, move: () => {}, up: () => { w.held = false; } });
      const h2 = addHit({ r: 40, pos: () => spire.world(0, -spire.h), down: () => { w.held = true; wind(0.05); }, move: () => {}, up: () => { w.held = false; } });
      stages.spire.wind = wind;
      function wind(d) {
        if (w.locked) return; spire.lean = Math.min(0, spire.lean + d); w.ang += d * 6; spire.wob = Math.max(.2, -spire.lean * 2);
        if (spire.lean > w.next) { audio.ratchet(); w.next += 0.06; }
        if (spire.lean >= 0) { w.locked = true; w.held = false; spire.lean = 0; spire.wob = 0; removeHit(h); removeHit(h2); snapFx(...spire.world(0, -spire.h)); audio.shing(); later(.8, () => setStage('frost')); }
      }
    }
  },
  downAny(wp) { jiggleAt(wp); },
  update(dt) { const w = G.rope; if (w && w.held && this.wind) this.wind(0.55 * dt); },
  focus() { const s = G.spire; const sp = slabSpan(); return { cx: sp.cx, top: s.world(0, -s.h)[1] - (s.balloon ? 160 : 60), bottom: G.slab.bottomWorld()[1] + 60, w: sp.w }; },
  draw() {},
};

// ---------------- stage 5: frost everything (hide the construction site)
function frostables() { return [G.T1, G.T2, G.slab, ...G.balls, G.spire].filter(Boolean); }
stages.frost = {
  enter() {
    G.brush = null; G.lastP = null;
    CREAMS.forEach((c, i) => {
      const b = addPart({ kind: 'bucket', cream: c, squish: 0 }); G.buckets.push(b);
      b.hit = addHit({ r: 55, pos: () => [b.x, b.y - 10], down: () => pick(b), move: wp => { G.lastP = null; this.moveAny(wp); }, up: () => {} });
    });
    function pick(b) { G.brush = b.cream; b.squish = 1; tween(b, { squish: 0 }, .35, easeBack); audio.plip(); G.lastP = null; }
    this.pick = pick;
  },
  downAny(wp) { if (!G.brush) this.pick(G.buckets[0]); G.lastP = wp; this.paintAt(wp); },
  moveAny(wp) {
    if (!G.brush) this.pick(G.buckets[0]);
    const lp = G.lastP || wp; const d = dist(lp[0], lp[1], wp[0], wp[1]); const n = Math.max(1, Math.ceil(d / 14));
    for (let i = 1; i <= n; i++) this.paintAt([lerp(lp[0], wp[0], i / n), lerp(lp[1], wp[1], i / n)]);
    G.lastP = wp;
  },
  upAny() { G.lastP = null; },
  paintAt(wp) {
    for (const n of frostables()) {
      if (n.fill > 0) continue; const l = n.local(wp[0], wp[1]);
      if (paintFrost(n, l[0], l[1], 40)) {
        if (!n.cream) n.cream = G.brush; n.creamLast = G.brush; n.painting = 0.1;
        if (n.coverage >= (n.kind === 'ball' ? 0.55 : n.kind === 'spire' ? 0.5 : 0.6)) complete(n);
      }
    }
    function complete(n) {
      n.cream = n.creamLast || n.cream; n.fill = 0.01; tween(n, { fill: 1 }, .35, easeOut); audio.fwoosh(); n.sy = 1.06; tween(n, { sy: 1 }, .4, easeBack);
      const c = n.world(0, -n.h / 2); burst(c[0], c[1], 14, [n.cream.hi, n.cream.c, '#fff'], 200, .6, 200, 6);
      if (frostables().every(o => o.fill > 0)) { later(.4, () => { audio.chime(); setStage('topping'); }); }
    }
  },
  update(dt) { for (const n of frostables()) if (n.painting > 0) n.painting -= dt; },
  focus() { return fullCakeFocus(); },
  draw() {},
};
function slabSpan() { const s = G.slab; return { cx: s ? s.x * .5 : 0, w: s ? s.w + Math.abs(s.x) + 60 : 470 }; }
function fullCakeFocus(extraTop = 40) { const top = G.candle ? G.candle.world(0, -G.candle.h - 40)[1] : G.spire.world(0, -G.spire.h)[1]; const sp = slabSpan(); return { cx: sp.cx, top: top - extraTop, bottom: 30, w: sp.w }; }

// ---------------- stage 6: toppings by tap, then candle
const TOPPINGS = ['strawberry', 'cherry', 'star', 'candy', 'blueberry'];
stages.topping = {
  enter() {
    G.parts.length = 0; G.hits.length = 0; G.buckets = [];
    const bowl = addPart({ kind: 'bowl' }); G.bowl = bowl; G.toppingsCount = 0; G.candle = null; G.idle = 0;
    bowl.hit = addHit({ r: 60, pos: () => [bowl.x, bowl.y], down: () => { bowl.squish = 1; tween(bowl, { squish: 0 }, .3, easeBack); audio.plip(); burst(bowl.x, bowl.y - 30, 6, ['#ff5c7a', '#ffd400', '#7bd1ff'], 160, .5, 500, 5); } });
  },
  downAny(wp) {
    // nearest frosted body under the finger
    let best = null, bl = null;
    for (const n of frostables()) { const l = n.local(wp[0], wp[1]); if (l[0] > -n.w / 2 - 14 && l[0] < n.w / 2 + 14 && l[1] > -n.h - 14 && l[1] < 14) { best = n; bl = l; } }
    if (!best) return;
    // keep on the surface
    bl[0] = clamp(bl[0], -best.w / 2 + 10, best.w / 2 - 10); bl[1] = clamp(bl[1], -best.h + 8, -6);
    const t = { x: bl[0], y: bl[1], kind: TOPPINGS[(G.toppingsCount + Math.floor(Math.random() * 2)) % TOPPINGS.length], s: 0, rot: rnd(-.3, .3) };
    best.toppings.push(t); tween(t, { s: 1 }, .25, easeBack); audio.pon(1 + Math.random() * .3); G.toppingsCount++; G.idle = 0;
    sparkle(wp[0], wp[1], 4);
    if (G.toppingsCount >= 5 && !G.candle) this.candle();
  },
  candle() {
    const spire = G.spire; const c = spire.add(new Node('candle', { w: 22, h: 60, lift: -500, lit: 0 })); G.candle = c; G.parts.length = 0; G.hits.length = 0;
    tween(c, { lift: 0 }, 1.3, easeOut, () => { audio.kachon(); c.landed = true; sparkle(...c.world(0, -c.h), 6); });
    addHit({ r: 70, big: 1.4, pos: () => c.world(0, -c.h - 10), down: () => { if (!c.landed || c.lit) return; c.lit = 1; audio.fwoosh(); burst(...c.world(0, -c.h - 10), 10, ['#ffd166', '#ff7b3a', '#fff'], 120, .5, -100, 5); later(.9, () => setStage('reveal')); } });
  },
  update(dt) { G.idle += dt; if (G.idle > 9 && !G.candle) this.candle(); },
  focus() { const c = G.candle; if (c && c.landed) { const t = c.world(0, -c.h)[1]; return { cx: c.world(0, 0)[0], top: t - 90, bottom: G.spire.world(0, -G.spire.h * .4)[1], w: 260, slow: true }; } return fullCakeFocus(); },
  draw() {},
};

// ---------------- stage 7: pull back, reveal how huge it is, blow out, begin again
stages.reveal = {
  enter() {
    G.parts.length = 0; G.hits.length = 0; G.revealT = 0; G.blown = false;
    later(1.6, () => { audio.fanfare(); G.confettiOn = true; });
    later(2.4, () => { G.kidJump = 1; });
    addHit({ r: 40, big: 1.2, pos: () => G.candle.world(0, -G.candle.h - 10), down: () => this.blow() });
  },
  downAny() { this.blow(); },
  blow() {
    if (G.blown || G.revealT < 2.2) return; G.blown = true; audio.blow(); G.candle.lit = 0; G.confettiOn = false;
    const p = G.candle.world(0, -G.candle.h - 10); for (let i = 0; i < 10; i++) G.particles.push({ x: p[0] + rnd(-6, 6), y: p[1], vx: rnd(-20, 20), vy: rnd(-60, -30), life: 1.2, max: 1.2, grav: -20, c: 'rgba(120,120,120,.5)', s: rnd(6, 12), shape: 1 });
    G.fade = 0; tween(G, { fade: 1 }, 1.4, easeInOut, () => { G.round++; setStage('dowels'); tween(G, { fade: 0 }, .8, easeInOut); });
  },
  update(dt) {
    G.revealT += dt; if (G.confettiOn && G.confetti.length < 160 && Math.random() < .6) {
      const v = toWorld(rnd(0, W), -20); G.confetti.push({ x: v[0], y: v[1], vx: rnd(-40, 40), vy: rnd(40, 120), r: rnd(0, TAU), c: ['#ff5c7a', '#ffd400', '#7bd1ff', '#8be37a', '#c58bff'][Math.floor(rnd(0, 5))], s: rnd(6, 11) / G.cam.s, life: 6 });
    }
    for (let i = G.confetti.length - 1; i >= 0; i--) { const c = G.confetti[i]; c.life -= dt; c.x += (c.vx + Math.sin(G.t * 3 + c.r) * 30) * dt / G.cam.s; c.y += c.vy * dt / G.cam.s; c.r += dt * 4; if (c.life <= 0) G.confetti.splice(i, 1); }
    if (G.kidJump > 0) G.kidJump = Math.max(0, G.kidJump - dt * .6);
  },
  focus() { const f = fullCakeFocus(60); return { cx: 0, top: Math.min(f.top - 40, -930), bottom: 200, w: portrait ? 760 : 1200, slow: true, veryslow: G.revealT < 3.5 }; },
  draw() {},
};

// ============================================================ rendering
function setCam(m) { const c = G.cam; const shx = G.shake > 0 ? rnd(-G.shake, G.shake) : 0, shy = G.shake > 0 ? rnd(-G.shake, G.shake) : 0; const CM = [c.s, 0, 0, c.s, W / 2 - c.x * c.s + shx, H / 2 - c.y * c.s + shy]; const M = mul(mul([DPR, 0, 0, DPR, 0, 0], CM), m || I); ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]); }
function viewRect() { const a = toWorld(0, 0), b = toWorld(W, H); return { l: a[0], t: a[1], r: b[0], b: b[1] }; }

function drawBackground() {
  const v = viewRect(); setCam();
  // wall
  ctx.fillStyle = '#fdf3e3'; ctx.fillRect(v.l, v.t, v.r - v.l, v.b - v.t);
  // wallpaper dots (only in view)
  ctx.fillStyle = 'rgba(240,200,170,.35)'; const g = 120;
  const i0 = Math.floor(v.l / g), i1 = Math.ceil(v.r / g), j0 = Math.floor(v.t / g), j1 = Math.ceil(v.b / g);
  if ((i1 - i0) * (j1 - j0) < 900) for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { ctx.beginPath(); ctx.arc(i * g + (j % 2) * g / 2, j * g, 7, 0, TAU); ctx.fill(); }
  // window (left) and shelf (right)
  ctx.fillStyle = '#bfe6ff'; rr(-820, -470, 220, 300, 18); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-710, -470); ctx.lineTo(-710, -170); ctx.moveTo(-820, -320); ctx.lineTo(-600, -320); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-760, -400, 26, 0, TAU); ctx.arc(-730, -390, 32, 0, TAU); ctx.arc(-700, -405, 22, 0, TAU); ctx.fill();
  ctx.fillStyle = '#d9a66b'; rr(560, -360, 220, 14, 4); ctx.fill();
  ctx.fillStyle = '#e88'; rr(580, -410, 40, 50, 6); ctx.fill(); ctx.fillStyle = '#8bd'; rr(630, -420, 30, 60, 6); ctx.fill(); ctx.fillStyle = '#fc6'; rr(670, -400, 50, 40, 8); ctx.fill();
  // ceiling lamp far above (scale cue)
  ctx.strokeStyle = '#8a7a6a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -3000); ctx.lineTo(0, -900); ctx.stroke();
  ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.moveTo(-70, -840); ctx.lineTo(-30, -905); ctx.lineTo(30, -905); ctx.lineTo(70, -840); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,240,180,.35)'; ctx.beginPath(); ctx.ellipse(0, -838, 70, 12, 0, 0, TAU); ctx.fill();
  // floor
  ctx.fillStyle = '#e6c8a0'; ctx.fillRect(v.l, 90, v.r - v.l, Math.max(0, v.b - 90));
  ctx.strokeStyle = 'rgba(160,110,70,.25)'; ctx.lineWidth = 3; for (let x = Math.floor(v.l / 140) * 140; x < v.r; x += 140) { ctx.beginPath(); ctx.moveTo(x, 90); ctx.lineTo(x, v.b); ctx.stroke(); }
  // table
  ctx.fillStyle = '#b5773f'; rr(-260, 14, 30, 80, 4); ctx.fill(); rr(230, 14, 30, 80, 4); ctx.fill();
  ctx.fillStyle = '#d9a066'; rr(-300, -2, 600, 20, 8); ctx.fill(); ctx.fillStyle = '#f2c98f'; rr(-300, -2, 600, 8, 6); ctx.fill();
  // chair & the little baker (scale cue at the end)
  drawKid();
}
function drawKid() {
  const jump = G.kidJump ? Math.sin(G.kidJump * Math.PI * 4) * 20 * G.kidJump : 0;
  ctx.save(); ctx.translate(-330, 90 - Math.abs(jump));
  const wave = Math.sin(G.t * 6) * 0.5;
  ctx.fillStyle = '#5aa9ff'; rr(-14, -46, 28, 30, 8); ctx.fill();            // body
  ctx.fillStyle = '#ffd6b0'; ctx.beginPath(); ctx.arc(0, -60, 15, 0, TAU); ctx.fill(); // head
  ctx.fillStyle = '#ff6b8a'; ctx.beginPath(); ctx.moveTo(-12, -70); ctx.lineTo(12, -70); ctx.lineTo(4, -96); ctx.closePath(); ctx.fill(); // party hat
  ctx.fillStyle = '#3a2a20'; ctx.beginPath(); ctx.arc(-5, -62, 2, 0, TAU); ctx.arc(5, -62, 2, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#3a2a20'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -56, 5, 0.2, Math.PI - .2); ctx.stroke();
  ctx.strokeStyle = '#ffd6b0'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-14, -40); ctx.lineTo(-28, -60 + wave * 10); ctx.moveTo(14, -40); ctx.lineTo(28, -60 - wave * 10); ctx.stroke(); // arms up
  ctx.strokeStyle = '#3d5a8a'; ctx.beginPath(); ctx.moveTo(-7, -16); ctx.lineTo(-7, 0); ctx.moveTo(7, -16); ctx.lineTo(7, 0); ctx.stroke();
  ctx.restore();
  // chair
  ctx.fillStyle = '#c98a55'; rr(300, 30, 60, 10, 3); ctx.fill(); rr(300, 40, 8, 50, 2); ctx.fill(); rr(352, 40, 8, 50, 2); ctx.fill(); rr(300, -20, 8, 50, 2); ctx.fill();
}

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

function drawPart(p) {
  setCam(); const bob = p.state === 'tray' ? Math.sin(G.t * 2.4 + p.x * .01) * 5 : 0;
  const x = p.fly ? p.fly.x : p.x, y = (p.fly ? p.fly.y : p.y) + bob;
  ctx.save(); ctx.translate(x, y); const sc = (p.scale || 1) * (p.enter < 1 ? easeBack(p.enter) : 1); ctx.scale(sc, sc);
  ctx.lineWidth = 3; ctx.lineJoin = 'round';
  switch (p.kind) {
    case 'dowel': // standing like the holes it goes into
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(0, 42, 18, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e9cd93'; ctx.strokeStyle = '#a8814d'; rr(-11, -38, 22, 78, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c7a46b'; rr(-11, -38, 22, 10, 6); ctx.fill(); break;
    case 'board':
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(0, 22, p.w / 2, 8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e7e0d0'; ctx.strokeStyle = '#8f8878'; rr(-p.w / 2, -p.h / 2, p.w, p.h, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c9c0ad'; rr(-p.w / 2 + 14, -1, p.w - 28, 3, 2); ctx.fill(); break;
    case 'strut': {
      const s = p.side === 'L' ? 1 : -1; ctx.rotate(s * 0.9);
      ctx.fillStyle = '#9fb3c8'; ctx.strokeStyle = '#4f6275'; rr(-9, -p.len / 2, 18, p.len, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4f6275'; ctx.beginPath(); ctx.arc(0, -p.len / 2 + 8, 5, 0, TAU); ctx.arc(0, p.len / 2 - 8, 5, 0, TAU); ctx.fill(); break;
    }
    case 'bucket': {
      const sq = 1 + (p.squish || 0) * 0.25; ctx.scale(1 + (p.squish || 0) * .2, 1 / sq);
      ctx.fillStyle = '#dfe6ea'; ctx.strokeStyle = '#7d8a94'; ctx.beginPath(); ctx.moveTo(-32, -20); ctx.lineTo(32, -20); ctx.lineTo(26, 34); ctx.lineTo(-26, 34); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = p.cream.c; ctx.beginPath(); ctx.ellipse(0, -20, 32, 12, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = p.cream.hi; ctx.beginPath(); ctx.arc(-8, -26, 8, 0, TAU); ctx.arc(6, -22, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = p.cream.c; ctx.beginPath(); ctx.arc(0, -34 - Math.sin(G.t * 3 + p.x) * 3, 12, 0, TAU); ctx.fill(); // a floating dollop invites a touch
      ctx.strokeStyle = p.cream.lo; ctx.beginPath(); ctx.ellipse(0, -20, 32, 12, 0, 0, TAU); ctx.stroke(); break;
    }
    case 'bowl': {
      const sq = 1 + (p.squish || 0) * 0.2; ctx.scale(sq, 1 / sq);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#a9a9b5'; ctx.beginPath(); ctx.moveTo(-40, -8); ctx.quadraticCurveTo(-30, 40, 0, 40); ctx.quadraticCurveTo(30, 40, 40, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
      const cols = ['#ff5c7a', '#ffd400', '#7bd1ff', '#8be37a', '#c58bff', '#ff9a3c'];
      for (let i = 0; i < 9; i++) { ctx.fillStyle = cols[i % 6]; ctx.beginPath(); ctx.arc(-28 + (i % 5) * 14 + (i > 4 ? 7 : 0), -14 - Math.floor(i / 5) * 12 - Math.sin(G.t * 3 + i) * 2, 7, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#e63946'; drawStrawberry(20, -34, .9); break;
    }
  }
  ctx.restore();
}

function drawInternal(it) {
  const o = it.owner; setCam(o.m);
  const d = it.drive === undefined ? 1 : it.drive; const y0 = it.y0, y1 = it.y1;
  ctx.save(); ctx.globalAlpha = o.alpha;
  const bob = it.head && it.hits < 6 && !it.busy ? Math.sin(G.t * 5) * 6 - 6 : 0;
  const top = y0 + (1 - d) * -50 + bob; // slides in from above during insertion; the head bobs to be struck
  ctx.fillStyle = it.c; ctx.strokeStyle = it.e; ctx.lineWidth = 3;
  rr(it.x - it.r, top, it.r * 2, y1 - top, it.r * .8); ctx.fill(); ctx.stroke();
  if (it.cap) { ctx.fillStyle = it.e; rr(it.x - it.r, top, it.r * 2, 9, it.r * .6); ctx.fill(); }
  if (it.head) { ctx.fillStyle = '#7d8b9a'; rr(it.x - it.r * 2.1, top - 14, it.r * 4.2, 18, 8); ctx.fill(); ctx.fillStyle = '#b7c3ce'; rr(it.x - it.r * 2.1, top - 14, it.r * 4.2, 7, 6); ctx.fill(); }
  ctx.restore();
}

function drawNodeBody(n) {
  setCam(n.m); const F = FLAVORS[n.flavor];
  const frosted = n.fill > 0;
  ctx.save();
  ctx.globalAlpha = n.alpha * (frosted ? 1 : 0.78);
  ctx.lineWidth = 3; ctx.lineJoin = 'round';
  bodyPath(n);
  if (n.kind === 'board') { ctx.fillStyle = '#e7e0d0'; ctx.fill(); ctx.strokeStyle = '#8f8878'; ctx.stroke(); }
  else if (n.kind === 'candle') { ctx.fillStyle = '#ff9fc6'; ctx.fill(); ctx.strokeStyle = '#d4638f'; ctx.stroke(); ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { rr(-n.w / 2, -n.h + 10 + i * 18, n.w, 6, 2); ctx.fill(); } }
  else {
    ctx.fillStyle = F.sponge; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = F.layer; const layers = Math.max(1, Math.floor(n.h / 42));
    for (let i = 1; i <= layers; i++) { const y = -n.h * i / (layers + 1); ctx.fillRect(-n.w / 2, y - 4, n.w, 8); }
    // frosting smears (partial) then full fill
    if (n.cells && !frosted) {
      ctx.globalAlpha = n.alpha; const cr = n.cream || CREAMS[0];
      for (let j = 0; j < n.rows; j++) for (let i = 0; i < n.cols; i++) { const k = j * n.cols + i; if (!n.cells[k]) continue;
        const cx = -n.w / 2 + i * CS + CS / 2 + ((k * 7) % 5 - 2), cy = -n.h + j * CS + CS / 2 + ((k * 3) % 5 - 2);
        ctx.fillStyle = cr.c; ctx.beginPath(); ctx.arc(cx, cy, CS * .78, 0, TAU); ctx.fill(); }
    }
    if (frosted) { ctx.globalAlpha = n.alpha * n.fill; ctx.fillStyle = n.cream.c; ctx.fillRect(-n.w / 2 - 5, -n.h - 5, n.w + 10, n.h + 10);
      ctx.fillStyle = n.cream.hi; ctx.globalAlpha = n.alpha * n.fill * .8; ctx.beginPath(); ctx.ellipse(-n.w * .22, -n.h * .78, n.w * .18, n.h * .07, -.2, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.globalAlpha = n.alpha; bodyPath(n);
    ctx.strokeStyle = frosted ? n.cream.lo : F.edge; ctx.stroke();
    if (n.kind === 'tier' && n.holes && !frosted) { // holes on top (the invitation)
      n.holes.forEach((hx, i) => { const filled = n.holesFilled && n.holesFilled[i];
        ctx.fillStyle = filled ? '#c7a46b' : '#5a3b21'; ctx.beginPath(); ctx.ellipse(hx, -n.h, 13, 6, 0, 0, TAU); ctx.fill();
        if (!filled && G.dragKind === 'dowel') { const pulse = .5 + .5 * Math.sin(G.t * 5 + i); ctx.strokeStyle = `rgba(255,255,255,${.35 + .45 * pulse})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(hx, -n.h, 17 + pulse * 4, 8 + pulse * 2, 0, 0, TAU); ctx.stroke(); }
      });
    }
    if (frosted) { // drips over the edge
      ctx.fillStyle = n.cream.c; ctx.globalAlpha = n.alpha * n.fill; const k = Math.max(2, Math.floor(n.w / 46));
      for (let i = 0; i < k; i++) { const x = -n.w / 2 + n.w * (i + .5) / k + ((i * 13) % 7 - 3); const r = 7 + ((i * 5) % 4) * 2.5; ctx.beginPath(); ctx.arc(x, n.kind === 'ball' ? -n.r * .35 : -n.h * .12, r, 0, TAU); ctx.fill(); ctx.fillRect(x - r, n.kind === 'ball' ? -n.r * .35 - 20 : -n.h * .12 - 22, r * 2, 22); }
      // rope, struts, winch fade with the spire/slab
      for (const t of n.toppings) drawTopping(t);
    }
  }
  ctx.restore();
  if (n.kind === 'candle') drawFlame(n);
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
function drawFlame(c) {
  setCam(c.m); const x = 0, y = -c.h;
  ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 10); ctx.stroke();
  if (!c.lit) { const p = .5 + .5 * Math.sin(G.t * 6); ctx.fillStyle = `rgba(255,140,60,${.3 + .5 * p})`; ctx.beginPath(); ctx.arc(x, y - 12, 3 + p * 2, 0, TAU); ctx.fill(); return; }
  const f = 1 + Math.sin(G.t * 14) * .1, g = Math.sin(G.t * 9) * 3;
  ctx.fillStyle = 'rgba(255,200,80,.25)'; ctx.beginPath(); ctx.arc(x, y - 24, 40 * f, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ff7b3a'; ctx.beginPath(); ctx.moveTo(x - 10, y - 8); ctx.quadraticCurveTo(x - 12, y - 34, x + g, y - 48 * f); ctx.quadraticCurveTo(x + 12, y - 34, x + 10, y - 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(x - 5, y - 8); ctx.quadraticCurveTo(x - 6, y - 24, x + g * .5, y - 32 * f); ctx.quadraticCurveTo(x + 6, y - 24, x + 5, y - 8); ctx.closePath(); ctx.fill();
}

function drawStructures() {
  const slab = G.slab, T2 = G.T2;
  // sockets + struts (slab frame)
  if (slab && !(slab.fill > 0)) {
    const st = stages.slab; const ghost = G.stage === 'slab' && st.ghostSide ? st.ghostSide() : null;
    for (const side of ['L', 'R']) {
      if (G.stage !== 'slab' || !st.sockets) break; if (st.done[side]) continue;
      const sk = st.sockets(side); const pulse = .5 + .5 * Math.sin(G.t * 5 + (side === 'L' ? 0 : 2));
      setCam(); ctx.lineWidth = 4; ctx.strokeStyle = `rgba(80,100,120,${.5 + .4 * pulse})`; ctx.fillStyle = '#3f5062';
      for (const p of [sk.upW, sk.loW]) { ctx.beginPath(); ctx.arc(p[0], p[1], 9 + pulse * 3, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, TAU); ctx.fill(); }
      if (ghost === side) { ctx.strokeStyle = 'rgba(120,150,180,.6)'; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(...sk.upW); ctx.lineTo(...sk.loW); ctx.stroke(); }
    }
  }
  if (slab) {
    setCam(slab.m); const frosted = slab.fill > 0;
    for (const s of G.struts) {
      const a = s.a, b = s.b; const bx = lerp(a[0], b[0], s.grow), by = lerp(a[1], b[1], s.grow);
      ctx.lineCap = 'round'; ctx.lineWidth = 18; ctx.strokeStyle = frosted ? '#fff' : '#4f6275'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(bx, by); ctx.stroke();
      ctx.lineWidth = 12; ctx.strokeStyle = frosted ? '#ff6b8a' : '#9fb3c8';
      if (frosted) { ctx.setLineDash([10, 10]); } ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
      if (!frosted) { ctx.fillStyle = '#3f5062'; ctx.beginPath(); ctx.arc(a[0], a[1], 7, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(bx, by, 7, 0, TAU); ctx.fill(); }
    }
  }
  // winch + rope (slab frame / world)
  const w = G.rope, spire = G.spire;
  if (w && spire && !(spire.fill > 0)) {
    const drum = slab.world(w.x, w.y - 14); const top = spire.world(0, -spire.h + 8);
    setCam(); const slack = Math.max(0, -spire.lean) * 140;
    ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.quadraticCurveTo((top[0] + drum[0]) / 2 + slack * .3, Math.max(top[1], drum[1]) + slack, drum[0], drum[1]); ctx.stroke();
    setCam(slab.m); ctx.translate(w.x, w.y - 14);
    ctx.fillStyle = '#6b5a4a'; rr(-16, 8, 32, 8, 3); ctx.fill();
    ctx.rotate(w.ang); const pulse = w.locked ? 0 : .5 + .5 * Math.sin(G.t * 6);
    ctx.fillStyle = '#c98a55'; ctx.beginPath(); ctx.arc(0, 0, 14 + pulse * 2, 0, TAU); ctx.fill(); ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#7a4a2a'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(22, -6); ctx.stroke(); ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(22, -6, 7, 0, TAU); ctx.fill();
  }
}
function drawCrane() {
  const c = G.crane; if (!c) return; setCam();
  let hx = 0, hy = c.y;
  if (c.hookTo) { if (c.hookTo instanceof Node) { const p = c.hookTo.world(0, -c.hookTo.h); hx = p[0]; hy = p[1]; } else { const p = c.hookTo.owner.world(c.hookTo.x, c.hookTo.y0 - 14); hx = p[0]; hy = p[1]; } }
  else if (c.mode === 'leave') { hy = c.y; } else { hy = G.T2 ? G.T2.topWorld()[1] - 260 : c.y; }
  const v = viewRect();
  ctx.strokeStyle = '#6d6d6d'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(hx, Math.min(v.t - 10, hy - 3000)); ctx.lineTo(hx, hy - 26); ctx.stroke();
  ctx.fillStyle = '#ffbf3f'; ctx.strokeStyle = '#8a6a1a'; ctx.lineWidth = 3; rr(hx - 16, hy - 40, 32, 16, 5); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(hx + 8, hy - 8, 12, Math.PI * .5, Math.PI * 1.6); ctx.stroke();
}
function drawBalloons(n, count, color) {
  setCam(n.m); const bob = Math.sin(G.t * 2 + n.phase) * 6;
  const top = -n.h; const bx = 0, by = top - 90 + bob;
  ctx.strokeStyle = '#7a7a7a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-n.w * .3, top); ctx.lineTo(bx - 20, by + 40); ctx.moveTo(n.w * .3, top); ctx.lineTo(bx + 20, by + 40); ctx.stroke();
  for (const dx of (count > 1 ? [-24, 24] : [0])) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(bx + dx, by, 30, 38, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(bx + dx - 10, by - 14, 8, 12, -.4, 0, TAU); ctx.fill(); }
}
function drawGhostDowel() {
  const p = G.parts.find(q => q.kind === 'dowel' && q.state === 'drag'); if (!p || G.stage !== 'dowels') return;
  const T1 = G.T1; let best = null, bd = 90 / Math.min(1, G.cam.s * 1.2);
  T1.holes.forEach((hx, i) => { if (T1.holesFilled[i]) return; const [wx, wy] = T1.world(hx, -T1.h); const d = dist(wx, wy, p.x, p.y + 40); if (d < bd) { bd = d; best = hx; } });
  if (best === null) return; setCam(T1.m); ctx.globalAlpha = .45; ctx.fillStyle = '#e9cd93'; rr(best - 11, -T1.h - 6, 22, T1.h - 14, 8); ctx.fill(); ctx.globalAlpha = 1;
}
function drawParticles() {
  setCam();
  for (const p of G.particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.c; if (p.shape) { ctx.beginPath(); ctx.arc(p.x, p.y, p.s / 2, 0, TAU); ctx.fill(); } else ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
  ctx.globalAlpha = 1;
  for (const c of G.confetti) { ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.fillStyle = c.c; ctx.fillRect(-c.s / 2, -c.s / 4, c.s, c.s / 2); ctx.restore(); }
}
function drawFingerCream() {
  if (G.stage !== 'frost' || !G.brush || !G.finger.down) return; setCam();
  ctx.fillStyle = G.brush.c; ctx.beginPath(); ctx.arc(G.finger.x, G.finger.y, 26, 0, TAU); ctx.fill(); ctx.fillStyle = G.brush.hi; ctx.beginPath(); ctx.arc(G.finger.x - 8, G.finger.y - 8, 8, 0, TAU); ctx.fill();
}

function walk(n, fn) { fn(n); for (const c of n.children) walk(c, fn); }
function render() {
  drawBackground();
  // pass 1: everything hidden inside the cake (x-ray while unfrosted)
  for (const it of G.internals) drawInternal(it);
  // pass 2: bodies (with skewer under the balls)
  const order = []; walk(G.root, n => order.push(n));
  for (const n of order) { if (n === G.balls[0] && G.skewer) { const s = G.slab; setCam(s.m); const h = G.skewer.h; ctx.fillStyle = '#d9d2c5'; ctx.strokeStyle = '#7b7568'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-5, -s.h); ctx.lineTo(-5, -s.h - h + 14); ctx.lineTo(0, -s.h - h); ctx.lineTo(5, -s.h - h + 14); ctx.lineTo(5, -s.h); ctx.closePath(); ctx.fill(); ctx.stroke(); } drawNodeBody(n); }
  drawStructures();
  if (G.slab && G.slab.balloons) drawBalloons(G.slab, 2, '#ff6b8a');
  if (G.spire && G.spire.balloon) drawBalloons(G.spire, 1, '#7fd3ff');
  drawCrane(); drawTray(); drawGhostDowel();
  for (const p of G.parts) drawPart(p);
  drawParticles(); drawFingerCream();
  if (G.fade > 0) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = `rgba(20,10,30,${G.fade})`; ctx.fillRect(0, 0, W, H); }
}

// ============================================================ loop
let last = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts; G.t += dt; G.stageT += dt;
  updateTweens(dt); updateParts(dt); updateParticles(dt);
  stages[G.stage].update(dt);
  G.root.update(T(0, 0), G.t);
  if (G.T1 && G.T1.squash) { G.T1.squash = 0; G.T1.sy = .93; tween(G.T1, { sy: 1 }, .3, easeBack); }
  updateCamera(dt); G.shake = Math.max(0, G.shake - dt * 30);
  render();
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
resize(); setStage('dowels'); requestAnimationFrame(frame);

// debug hooks for automated play-testing (no UI)
window.__game = {
  G, stages, toScreen,
  state() { return { stage: G.stage, stageT: G.stageT, parts: G.parts.map(p => ({ kind: p.kind, state: p.state })), hits: G.hits.length, dowels: G.T1 && G.T1.dowelsIn, rodHits: G.rod && G.rod.hits, struts: G.struts.length, balls: G.balls.filter(b => b.stacked).length, lean: G.spire && G.spire.lean, fills: frostables().map(n => [n.kind, n.fill, +n.coverage.toFixed(2)]), toppings: G.toppingsCount, candle: !!G.candle, lit: G.candle && G.candle.lit, cam: { ...G.cam } }; },
  targets() { return G.hits.filter(h => !h.disabled).map(h => { const p = h.pos(); const s = toScreen(p[0], p[1]); return { x: s[0], y: s[1] }; }); },
  screen(wx, wy) { return toScreen(wx, wy); },
  holes() { return G.T1.holes.map((hx, i) => ({ filled: G.T1.holesFilled[i], p: toScreen(...G.T1.world(hx, -G.T1.h)) })); },
  strutMid(side) { const sk = stages.slab.sockets(side); return toScreen((sk.upW[0] + sk.loW[0]) / 2, (sk.upW[1] + sk.loW[1]) / 2); },
  node(name) { const n = G[name]; if (!n) return null; const b = n.bottomWorld(), t = n.topWorld(); return { bottom: toScreen(...b), top: toScreen(...t), w: n.w * G.cam.s, h: n.h * G.cam.s }; },
};
})();
