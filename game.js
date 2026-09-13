/* Mirror Cake — a one-finger, no-text mirror-glaze cake toy for small hands.
   Canvas 2D only. No dependencies. Everything is drawn procedurally.        */
(() => {
'use strict';

// ---------------------------------------------------------------- utils
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeOutBack = t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
// exponential approach (frame-rate independent)
const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function pickDifferent(arr, prev) {
  if (arr.length < 2) return arr[0];
  let v; do { v = pick(arr); } while (v === prev);
  return v;
}
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
// tiny seeded prng for per-round stable patterns
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgbStr(r, g, b, a = 1) { return `rgba(${r | 0},${g | 0},${b | 0},${a})`; }
function mix(hex, hex2, t, a = 1) { const c = hexToRgb(hex), d = hexToRgb(hex2); return rgbStr(lerp(c[0], d[0], t), lerp(c[1], d[1], t), lerp(c[2], d[2], t), a); }
const lighten = (hex, t, a) => mix(hex, '#ffffff', t, a);
const darken = (hex, t, a) => mix(hex, '#000000', t, a);
const alpha = (hex, a) => { const c = hexToRgb(hex); return rgbStr(c[0], c[1], c[2], a); };

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function heartPath(ctx, cx, cy, s) {
  ctx.moveTo(cx, cy + s * 0.95);
  ctx.bezierCurveTo(cx - s * 1.25, cy + s * 0.15, cx - s * 0.95, cy - s * 0.95, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 0.95, cy - s * 0.95, cx + s * 1.25, cy + s * 0.15, cx, cy + s * 0.95);
  ctx.closePath();
}
function starPath(ctx, cx, cy, r, n = 5, inner = 0.45) {
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / n, rad = i % 2 ? r * inner : r;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------- audio (optional; game reads fully without it)
const audio = {
  ctx: null, pourNode: null, pourGain: null,
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
  },
  tone(freq, dur = 0.15, type = 'sine', vol = 0.18, when = 0, slide = 0) {
    const c = this.ctx; if (!c) return;
    const t0 = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  },
  pop() { this.tone(520, 0.12, 'sine', 0.2, 0, 300); },
  snap() { this.tone(880, 0.08, 'triangle', 0.14); this.tone(1320, 0.1, 'sine', 0.08, 0.04); },
  thud() { this.tone(140, 0.2, 'sine', 0.25, 0, -60); },
  slice() { this.noise(0.25, 1800, 0.12); },
  chime() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.5, 'sine', 0.12, i * 0.09)); },
  sparkle() { this.tone(1760, 0.18, 'sine', 0.06); this.tone(2200, 0.22, 'sine', 0.05, 0.06); },
  noise(dur, freq, vol) {
    const c = this.ctx; if (!c) return;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.7; g.gain.value = vol;
    s.connect(f).connect(g).connect(c.destination); s.start();
  },
  pour(on) {
    const c = this.ctx; if (!c) return;
    if (on && !this.pourNode) {
      const buf = c.createBuffer(1, c.sampleRate * 1, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = buf; s.loop = true; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0.0001;
      s.connect(f).connect(g).connect(c.destination); s.start();
      g.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 0.2);
      this.pourNode = s; this.pourGain = g;
    } else if (!on && this.pourNode) {
      const s = this.pourNode, g = this.pourGain; this.pourNode = null;
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.2); s.stop(c.currentTime + 0.25);
    }
  }
};

// ---------------------------------------------------------------- content
const PALETTES = [
  { c1: '#e0245e', c2: '#ffffff' },   // ruby + white swirl
  { c1: '#1f6fe0', c2: '#7be6ff' },   // ocean
  { c1: '#2fb37a', c2: '#fff1b8' },   // mint + cream
  { c1: '#8a55d9', c2: '#ffb8ea' },   // lavender + pink
  { c1: '#ff7a1a', c2: '#ffd166' },   // sunset
  { c1: '#2a2c78', c2: '#ffd54a' },   // midnight + gold
  { c1: '#ff69a8', c2: '#ffffff' },   // pink + white
  { c1: '#5b2e17', c2: '#e2a56b' },   // chocolate + caramel
  { c1: '#3a1f6e', c2: '#ff6ad5' },   // galaxy
  { c1: '#1fb5b0', c2: '#ffffff' },   // teal
];
const SHAPES = ['round', 'tall', 'loaf', 'dome'];
const INTERIORS = ['rainbow', 'heart', 'strawberry', 'checker', 'funfetti', 'matcha', 'star', 'ombre'];
const DECOS = ['strawberry', 'blueberries', 'raspberry', 'cherry', 'macaron', 'gold', 'shard', 'mint', 'pearls', 'orange', 'flower', 'starcookie'];
const MOLD_TINTS = ['#9fd7ff', '#ffc0d9', '#c9f0c1', '#ffe1a6', '#d9c9ff'];

// crumb / matte noise texture
const noiseCanvas = (() => {
  const s = document.createElement('canvas'); s.width = s.height = 40;
  const sx = s.getContext('2d'); const img = sx.createImageData(40, 40);
  for (let i = 0; i < img.data.length; i += 4) { const v = 100 + Math.random() * 110; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  sx.putImageData(img, 0, 0);
  const c = document.createElement('canvas'); c.width = c.height = 120;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.drawImage(s, 0, 0, 120, 120); return c;
})();
let noisePattern = null;

// ---------------------------------------------------------------- state
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
let W = 1, H = 1, DPR = 1, portrait = true;
let L = null;                        // layout
let round = null, oldRound = null;   // current / departing round
let transT = 0;                      // transition progress
const pointer = { down: false, x: 0, y: 0, dx: 0, dy: 0, accDy: 0, id: null, grab: null, ox: 0, oy: 0, downX: 0, downY: 0, downT: 0 };
let idle = 0;                        // seconds since last meaningful input
let now = 0, last = 0;
const particles = [];
const NCOL = 44;
let prev = { palette: null, shape: null, interior: null };
let roundCount = 0;

function newRound() {
  roundCount++;
  const palette = pickDifferent(PALETTES, prev.palette); prev.palette = palette;
  const shape = pickDifferent(SHAPES, prev.shape); prev.shape = shape;
  const interior = pickDifferent(INTERIORS, prev.interior); prev.interior = interior;
  const seed = Math.floor(Math.random() * 1e9);
  const r = {
    seed, stage: 'unmold', stageT: 0, t: 0,
    shape, palette, interior, marble: Math.random() < 0.6, moldTint: pick(MOLD_TINTS),
    cake: { x: 0, y: 0, R: 100, h: 80, e: 30, vx: 0, wobble: 0, wobbleV: 0, frost: 1, scale: 1, onStand: false, dragging: false, lift: 0 },
    mold: { lift: 0, gone: false, fly: 0, vy: 0, bob: 0 },
    glaze: { blobs: [], side: new Float32Array(NCOL + 1), drips: [], drops: [], puddle: 0, done: false, splash: 0, pouring: false, landX: 0, landY: 0, coverage: 0 },
    pitcher: { x: 0, y: 0, tilt: 0, vis: 0, home: true },
    stand: { x: 0, y: 0, vis: 0, glow: 0, home: true },
    rack: { x: 0, y: 0, vis: 1 },
    tray: { items: shuffle(DECOS).slice(0, 4), vis: 0, hidden: false },
    decos: [],                    // placed: {type, slot, x, y, pop}
    dragDeco: null,
    knife: { x: 0, y: 0, ang: 0.2, vis: 0, cut: 0, cutDone: false, cutAnim: 0, magnet: 0 },
    reveal: { t: 0, burst: false },
    nextMold: { vis: 0, x: 0, y: 0 },
    offX: 0,
  };
  const rng = mulberry(seed);
  r.rng = rng;
  // pre-baked pattern bits
  r.sprinkles = Array.from({ length: 60 }, () => ({ x: rng(), y: rng(), a: rng() * TAU, c: pick(['#ff5c8a', '#ffd23f', '#3fd2ff', '#7cf07a', '#b784ff', '#ff8a3d']) }));
  r.marbleStrokes = Array.from({ length: 5 }, (_, i) => ({ y0: rng(), amp: 0.2 + rng() * 0.4, ph: rng() * TAU, w: 0.06 + rng() * 0.1, f: 1.5 + rng() * 2 }));
  r.frostDots = Array.from({ length: 90 }, () => ({ x: rng() * 2 - 1, y: rng(), s: 0.6 + rng() * 1.6, p: rng() * TAU }));
  r.slots = [];
  applyCakeGeometry(r);
  return r;
}

function applyCakeGeometry(r) {
  const base = L.R;
  const c = r.cake;
  switch (r.shape) {
    case 'round': c.R = base; c.h = base * 0.78; c.e = base * 0.3; break;
    case 'tall': c.R = base * 0.86; c.h = base * 1.2; c.e = base * 0.86 * 0.3; break;
    case 'loaf': c.R = base * 1.18; c.h = base * 0.62; c.e = base * 1.18 * 0.16; break;
    case 'dome': c.R = base * 1.02; c.h = base * 0.95; c.e = 0; break;
  }
  // decoration slots on top (local coords, origin at top-centre)
  const R = c.R, e = c.e;
  if (r.shape === 'dome') {
    const sy = x => c.h - c.h * Math.sqrt(Math.max(0, 1 - (x / R) ** 2));
    r.slots = [[0, sy(0)], [-0.42 * R, sy(-0.42 * R)], [0.42 * R, sy(0.42 * R)], [-0.72 * R, sy(-0.72 * R)], [0.72 * R, sy(0.72 * R)]];
  } else {
    r.slots = [[0, -0.55 * e], [-0.62 * R, 0.05 * e], [0.62 * R, 0.05 * e], [-0.3 * R, 0.62 * e], [0.3 * R, 0.62 * e]];
  }
}

// ---------------------------------------------------------------- layout
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  portrait = H >= W;
  const m = Math.min(W, H);
  const R = clamp(portrait ? Math.min(W * 0.27, H * 0.18) : Math.min(H * 0.26, W * 0.14), 60, 210);
  L = { R, m };
  if (portrait) {
    L.cakeHome = { x: W * 0.5, y: H * 0.5 + R * 0.45 };
    L.pitcherDock = { x: W * 0.8, y: H * 0.17 };
    L.standDock = { x: W * 0.5, y: H * 0.86 };
    L.trayDock = { x: W * 0.5, y: H - R * 0.55 - Math.max(12, H * 0.02), horizontal: true, len: W * 0.92 };
    L.knifeDock = { x: W * 0.78, y: H * 0.16 };
    L.nextDock = { x: W * 0.2, y: H * 0.17 };
  } else {
    L.cakeHome = { x: W * 0.46, y: H * 0.58 + R * 0.45 };
    L.pitcherDock = { x: W * 0.84, y: H * 0.24 };
    L.standDock = { x: W * 0.84, y: H * 0.74 };
    L.trayDock = { x: R * 0.55 + Math.max(12, W * 0.015), y: H * 0.5, horizontal: false, len: H * 0.9 };
    L.knifeDock = { x: W * 0.84, y: H * 0.22 };
    L.nextDock = { x: W * 0.14, y: H * 0.26 };
  }
  if (round) applyCakeGeometry(round);
  if (oldRound) applyCakeGeometry(oldRound);
  if (!noisePattern) noisePattern = ctx.createPattern(noiseCanvas, 'repeat');
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 60));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

// ---------------------------------------------------------------- particles
function spawn(kind, x, y, n, opt = {}) {
  for (let i = 0; i < n; i++) {
    const a = rnd(TAU), sp = rnd(opt.sp0 || 20, opt.sp1 || 120);
    particles.push({ kind, x: x + rnd(-(opt.sx || 0), opt.sx || 0), y: y + rnd(-(opt.sy || 0), opt.sy || 0), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.up || 0), life: rnd(0.5, 1.2) * (opt.life || 1), age: 0, s: rnd(2, 5) * (opt.size || 1), c: opt.c || pick(['#ffffff', '#fff3a8', '#ffd54a']), rot: rnd(TAU), vr: rnd(-6, 6) });
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.age += dt;
    if (p.age > p.life) { particles.splice(i, 1); continue; }
    if (p.kind === 'confetti') { p.vy += 260 * dt; p.vx *= 0.98; }
    else if (p.kind === 'mist') { p.vy -= 20 * dt; p.vx *= 0.96; }
    else { p.vx *= 0.9; p.vy *= 0.9; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
  }
}
function drawParticles() {
  for (const p of particles) {
    const k = 1 - p.age / p.life;
    ctx.save(); ctx.translate(p.x, p.y);
    if (p.kind === 'confetti') {
      ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = p.c;
      ctx.fillRect(-p.s, -p.s * 0.6, p.s * 2, p.s * 1.2);
    } else if (p.kind === 'mist') {
      ctx.globalAlpha = 0.09 * k; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, p.s * 2 * (1 + p.age * 1.2), 0, TAU); ctx.fill();
    } else {
      ctx.rotate(p.rot); ctx.globalAlpha = k; ctx.fillStyle = p.c;
      ctx.beginPath(); starPath(ctx, 0, 0, p.s * (0.6 + k), 4, 0.35); ctx.fill();
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- cake geometry (local coords: origin at top-centre of body)
function surfTop(r, x) {        // y of the visible glaze start line at column x
  const c = r.cake, q = Math.sqrt(Math.max(0, 1 - (x / c.R) ** 2));
  return r.shape === 'dome' ? c.h - c.h * q : c.e * q;
}
function surfBottom(r, x) {
  const c = r.cake, q = Math.sqrt(Math.max(0, 1 - (x / c.R) ** 2));
  return r.shape === 'dome' ? c.h : c.h + c.e * q;
}
function silhouette(r, pad = 0) {
  const c = r.cake, R = c.R + pad, h = c.h + pad * 0.6, e = c.e + pad * 0.3;
  ctx.beginPath();
  if (r.shape === 'dome') {
    ctx.ellipse(0, c.h, R, h, 0, Math.PI, TAU); ctx.closePath();
  } else {
    ctx.moveTo(-R, 0); ctx.lineTo(-R, h);
    ctx.ellipse(0, h, R, e, 0, Math.PI, 0, true);
    ctx.lineTo(R, 0);
    ctx.ellipse(0, 0, R, e, 0, 0, Math.PI, true);
    ctx.closePath();
  }
}
function topFace(r) { const c = r.cake; ctx.beginPath(); ctx.ellipse(0, 0, c.R, Math.max(c.e, 0.01), 0, 0, TAU); }

// ---------------------------------------------------------------- matte cake
function drawMatteCake(r) {
  const c = r.cake, R = c.R, h = c.h, e = c.e;
  ctx.save();
  silhouette(r); ctx.clip();
  const g = ctx.createLinearGradient(-R, 0, R, 0);
  g.addColorStop(0, '#d9c19c'); g.addColorStop(0.35, '#f1dfbd'); g.addColorStop(0.7, '#e8d2ab'); g.addColorStop(1, '#c9ad85');
  ctx.fillStyle = g; ctx.fillRect(-R - 2, -e - 2, R * 2 + 4, h + e * 2 + 4);
  ctx.globalAlpha = 0.14; ctx.fillStyle = noisePattern; ctx.fillRect(-R - 2, -e - 2, R * 2 + 4, h + e * 2 + 4);
  ctx.globalAlpha = 1;
  // bottom shade
  const g2 = ctx.createLinearGradient(0, h * 0.5, 0, h + e);
  g2.addColorStop(0, 'rgba(90,60,30,0)'); g2.addColorStop(1, 'rgba(90,60,30,0.28)');
  ctx.fillStyle = g2; ctx.fillRect(-R - 2, h * 0.5, R * 2 + 4, h + e);
  if (r.shape !== 'dome') {
    topFace(r); ctx.fillStyle = '#f6e7c8'; ctx.fill();
    ctx.globalAlpha = 0.18; ctx.fillStyle = noisePattern; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(120,90,50,0.25)'; ctx.lineWidth = 1.2; ctx.stroke();
  } else {
    const g3 = ctx.createRadialGradient(-R * 0.3, h * 0.35, R * 0.1, 0, h * 0.6, R * 1.2);
    g3.addColorStop(0, 'rgba(255,255,255,0.35)'); g3.addColorStop(1, 'rgba(120,80,40,0.25)');
    ctx.fillStyle = g3; ctx.fillRect(-R, 0, R * 2, h);
  }
  // frost: a cold white bloom with tiny ice sparkles (fades after unmolding)
  if (c.frost > 0.01) {
    ctx.globalAlpha = 0.35 * c.frost; ctx.fillStyle = '#ffffff';
    ctx.fillRect(-R - 2, -e - 2, R * 2 + 4, h + e * 2 + 4);
    ctx.globalAlpha = 1;
    for (const d of r.frostDots) {
      const tw = 0.5 + 0.5 * Math.sin(now * 3 + d.p);
      ctx.globalAlpha = c.frost * tw * 0.9; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(d.x * R, d.y * h, d.s, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// ---------------------------------------------------------------- glaze
function curtainPath(r) {
  const c = r.cake, R = c.R, g = r.glaze, s = g.side;
  ctx.beginPath();
  const xs = i => -R + 2 * R * i / NCOL;
  ctx.moveTo(xs(0) - 1, surfTop(r, xs(0)) - 1);
  for (let i = 0; i <= NCOL; i++) ctx.lineTo(xs(i), surfTop(r, xs(i)) - 1);
  for (let i = NCOL; i >= 0; i--) {
    const x = xs(i);
    const sm = (s[Math.max(0, i - 1)] + s[i] * 2 + s[Math.min(NCOL, i + 1)]) / 4;
    const top = surfTop(r, x), bot = surfBottom(r, x);
    const y = top + sm * (bot - top) + (sm > 0.001 && sm < 0.99 ? Math.sin(x * 0.11 + i) * 2 : 0);
    if (i === NCOL) ctx.lineTo(x + 1, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
function frontEdge(r) {                 // polyline of the glaze front (for the bead highlight)
  const c = r.cake, R = c.R, s = r.glaze.side; const pts = [];
  for (let i = 0; i <= NCOL; i++) {
    const x = -R + 2 * R * i / NCOL;
    const sm = (s[Math.max(0, i - 1)] + s[i] * 2 + s[Math.min(NCOL, i + 1)]) / 4;
    if (sm > 0.02 && sm < 0.985) pts.push([x, surfTop(r, x) + sm * (surfBottom(r, x) - surfTop(r, x))]); else pts.push(null);
  }
  return pts;
}
function poolPath(r) {
  const c = r.cake, R = c.R, e = Math.max(c.e, R * 0.12);
  ctx.beginPath();
  for (const b of r.glaze.blobs) { ctx.moveTo(b.x + b.r, b.y); ctx.ellipse(b.x, b.y, b.r, b.r * e / R, 0, 0, TAU); }
}
function paintGlaze(r, x0, y0, w, h, { gloss = true, vertical = true } = {}) {
  const { c1, c2 } = r.palette, c = r.cake;
  const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, lighten(c1, 0.22)); g.addColorStop(0.35, c1); g.addColorStop(1, darken(c1, 0.35));
  ctx.fillStyle = g; ctx.fillRect(x0, y0, w, h);
  // horizontal shading (cylinder roundness)
  const g2 = ctx.createLinearGradient(x0, 0, x0 + w, 0);
  g2.addColorStop(0, 'rgba(0,0,0,0.28)'); g2.addColorStop(0.25, 'rgba(255,255,255,0.10)'); g2.addColorStop(0.5, 'rgba(0,0,0,0)'); g2.addColorStop(0.82, 'rgba(0,0,0,0.12)'); g2.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = g2; ctx.fillRect(x0, y0, w, h);
  if (r.marble) {
    ctx.save(); ctx.lineCap = 'round'; ctx.globalAlpha = 0.75;
    for (const m of r.marbleStrokes) {
      ctx.beginPath(); ctx.lineWidth = m.w * c.R * 0.5;
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        let x, y;
        if (vertical) { y = y0 + t * h; x = x0 + (m.y0 * 0.8 + 0.1) * w + Math.sin(t * m.f * 2 + m.ph) * m.amp * w * 0.12; }
        else { x = x0 + t * w; y = y0 + (m.y0 * 0.7 + 0.15) * h + Math.sin(t * m.f * TAU + m.ph) * m.amp * h * 0.25; }
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = c2; ctx.stroke();
      ctx.lineWidth = m.w * c.R * 0.12; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.stroke();
    }
    ctx.restore();
  }
  if (gloss) {
    // mirror-like window reflections
    ctx.save(); ctx.globalAlpha = 0.42; ctx.fillStyle = '#ffffff';
    ctx.beginPath(); rr(ctx, x0 + w * 0.13, y0 + h * 0.12, w * 0.12, h * 0.62, w * 0.06); ctx.fill();
    ctx.globalAlpha = 0.25;
    ctx.beginPath(); rr(ctx, x0 + w * 0.29, y0 + h * 0.2, w * 0.045, h * 0.4, w * 0.02); ctx.fill();
    ctx.globalAlpha = 0.18;
    ctx.beginPath(); rr(ctx, x0 + w * 0.78, y0 + h * 0.15, w * 0.05, h * 0.5, w * 0.02); ctx.fill();
    // soft broad sheen
    const g3 = ctx.createLinearGradient(x0, y0, x0 + w * 0.6, y0 + h);
    g3.addColorStop(0, 'rgba(255,255,255,0.35)'); g3.addColorStop(0.35, 'rgba(255,255,255,0)'); g3.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = g3; ctx.fillRect(x0, y0, w, h);
    ctx.restore();
  }
}
function drawGlaze(r) {
  const c = r.cake, R = c.R, h = c.h, e = c.e, g = r.glaze;
  if (!g.blobs.length) return;
  // curtain down the sides
  ctx.save();
  silhouette(r); ctx.clip();
  curtainPath(r); ctx.clip();
  paintGlaze(r, -R - 2, -e - 2, R * 2 + 4, h + e * 2 + 4);
  ctx.restore();
  // thick bead along the moving front
  const pts = frontEdge(r);
  ctx.save(); silhouette(r); ctx.clip();
  ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = darken(r.palette.c1, 0.45, 0.9);
  ctx.beginPath(); let pen = false;
  for (const p of pts) { if (!p) { pen = false; continue; } if (pen) ctx.lineTo(p[0], p[1] + 1); else ctx.moveTo(p[0], p[1] + 1); pen = true; }
  ctx.stroke();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); pen = false;
  for (const p of pts) { if (!p) { pen = false; continue; } if (pen) ctx.lineTo(p[0], p[1] - 2); else ctx.moveTo(p[0], p[1] - 2); pen = true; }
  ctx.stroke();
  ctx.restore();
  // pool on top face
  ctx.save();
  if (r.shape !== 'dome') { topFace(r); ctx.clip(); }
  else { silhouette(r); ctx.clip(); }
  poolPath(r); ctx.clip();
  paintGlaze(r, -R - 2, -e * 1.2 - 2, R * 2 + 4, e * 2.4 + 4 + (r.shape === 'dome' ? h : 0), { gloss: false, vertical: false });
  // specular on pool
  ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(-R * 0.35, -e * 0.25, R * 0.28, Math.max(2, e * 0.22), -0.2, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.25;
  ctx.beginPath(); ctx.ellipse(R * 0.3, e * 0.2, R * 0.12, Math.max(1.5, e * 0.1), 0.3, 0, TAU); ctx.fill();
  ctx.restore();
  // rim highlight where pool meets the edge
  if (r.shape !== 'dome' && g.coverage > 0.05) {
    ctx.save(); topFace(r); ctx.clip(); poolPath(r); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, R - 1, Math.max(e - 1, 1), 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.restore();
  }
  // splash ripples where the stream lands
  if (g.splash > 0.01 && g.pouring) {
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) {
      const k = ((now * 1.6 + i * 0.5) % 1);
      ctx.globalAlpha = (1 - k) * 0.7;
      ctx.beginPath(); ctx.ellipse(g.landX, g.landY, R * 0.08 + k * R * 0.25, (R * 0.08 + k * R * 0.25) * 0.35, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
}
function drawDrips(r) {
  const c = r.cake, col = r.palette.c1;
  for (const d of r.glaze.drips) {
    const y0 = surfBottom(r, d.x) - 1;
    const w = d.w;
    const bulb = Math.min(w * 1.25, d.len * 0.5), by = y0 + d.len - bulb;
    ctx.beginPath();
    ctx.moveTo(d.x - w, y0);
    ctx.quadraticCurveTo(d.x - w * 0.75, by - bulb * 0.6, d.x - bulb, by);
    ctx.arc(d.x, by, bulb, Math.PI, 0, true);
    ctx.quadraticCurveTo(d.x + w * 0.75, by - bulb * 0.6, d.x + w, y0);
    ctx.closePath();
    const g = ctx.createLinearGradient(d.x - w, 0, d.x + w, 0);
    g.addColorStop(0, darken(col, 0.4)); g.addColorStop(0.45, lighten(col, 0.1)); g.addColorStop(1, darken(col, 0.5));
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.ellipse(d.x - w * 0.3, y0 + d.len * 0.5, w * 0.2, d.len * 0.28, 0, 0, TAU); ctx.fill();
  }
}
function drawDrops(r) {            // detached falling drops (world coords)
  const col = r.palette.c1;
  for (const d of r.glaze.drops) {
    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.w * 0.8, d.w * 1.3, 0, 0, TAU);
    ctx.fillStyle = col; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(d.x - d.w * 0.25, d.y - d.w * 0.4, d.w * 0.25, 0, TAU); ctx.fill();
  }
}

// ---------------------------------------------------------------- mold (an upside-down silicone shell with a pull tab)
function drawMold(r, lift, a = 1) {
  const c = r.cake, R = c.R, h = c.h, e = c.e, tint = r.moldTint;
  const pad = R * 0.07;
  ctx.save(); ctx.globalAlpha *= a;
  ctx.translate(0, -lift);
  // shell
  silhouette(r, pad);
  const g = ctx.createLinearGradient(-R, 0, R, 0);
  g.addColorStop(0, darken(tint, 0.25, 0.7)); g.addColorStop(0.3, lighten(tint, 0.4, 0.62)); g.addColorStop(0.6, alpha(tint, 0.6)); g.addColorStop(1, darken(tint, 0.35, 0.72));
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = darken(tint, 0.35, 0.8); ctx.stroke();
  // bottom lip flare (silicone rim) — reads as "peel me"
  ctx.beginPath();
  if (r.shape === 'dome') ctx.ellipse(0, h + pad * 0.6, R + pad * 2.2, pad * 1.1, 0, 0, TAU);
  else ctx.ellipse(0, h + pad * 0.6, R + pad * 2.2, e + pad * 0.9, 0, 0, TAU);
  ctx.fillStyle = alpha(tint, 0.55); ctx.fill(); ctx.stroke();
  // highlight streaks
  ctx.save(); silhouette(r, pad); ctx.clip();
  ctx.globalAlpha = 0.45; ctx.fillStyle = '#ffffff';
  ctx.beginPath(); rr(ctx, -R * 0.72, h * 0.08, R * 0.16, h * 0.7, R * 0.08); ctx.fill();
  ctx.globalAlpha = 0.2; ctx.beginPath(); rr(ctx, R * 0.55, h * 0.12, R * 0.08, h * 0.55, R * 0.04); ctx.fill();
  ctx.restore();
  // pull tab / knob on top
  const ky = r.shape === 'dome' ? 0 - pad * 0.6 : -e - pad * 0.3;
  ctx.beginPath(); ctx.ellipse(0, ky, R * 0.28, R * 0.1, 0, 0, TAU); ctx.fillStyle = darken(tint, 0.25); ctx.fill();
  ctx.beginPath(); rr(ctx, -R * 0.2, ky - R * 0.32, R * 0.4, R * 0.34, R * 0.12);
  const kg = ctx.createLinearGradient(-R * 0.2, 0, R * 0.2, 0); kg.addColorStop(0, lighten(tint, 0.5)); kg.addColorStop(0.5, tint); kg.addColorStop(1, darken(tint, 0.3));
  ctx.fillStyle = kg; ctx.fill(); ctx.strokeStyle = darken(tint, 0.4, 0.8); ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); rr(ctx, -R * 0.09, ky - R * 0.25, R * 0.18, R * 0.12, R * 0.06); ctx.fillStyle = darken(tint, 0.45, 0.7); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- rack + drip tray
function drawRack(r, x, y, vis) {
  if (vis <= 0.01) return;
  const c = r.cake, R = c.R, rh = c.h * 0.3, w = R * 1.25, d = R * 0.5;
  ctx.save(); ctx.globalAlpha = vis; ctx.translate(x, y);
  // tray below
  ctx.beginPath(); rr(ctx, -w - R * 0.2, rh - d * 0.45, (w + R * 0.2) * 2, d * 1.15, R * 0.2);
  ctx.fillStyle = '#c8cdd3'; ctx.fill(); ctx.strokeStyle = '#9aa2ab'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); rr(ctx, -w - R * 0.12, rh - d * 0.35, (w + R * 0.12) * 2, d * 0.95, R * 0.16);
  ctx.fillStyle = '#dfe4e9'; ctx.fill();
  // puddle of glaze that dripped through
  if (r.glaze.puddle > 0) {
    const pr = Math.min(w * 0.85, R * 0.3 + r.glaze.puddle * R * 0.12);
    ctx.beginPath(); ctx.ellipse(0, rh + d * 0.45, pr, Math.min(d * 0.3, pr * 0.3), 0, 0, TAU);
    ctx.fillStyle = r.palette.c1; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-pr * 0.3, rh + d * 0.38, pr * 0.3, pr * 0.07, 0, 0, TAU); ctx.fill();
  }
  // wire rack: rounded frame + bars, standing on 4 little legs
  ctx.strokeStyle = '#8f979f'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (const lx of [-w * 0.85, w * 0.85]) { ctx.beginPath(); ctx.moveTo(lx, d * 0.25); ctx.lineTo(lx, rh); ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(0, 0, w, d * 0.5, 0, 0, TAU);
  ctx.fillStyle = 'rgba(200,205,210,0.45)'; ctx.fill();
  ctx.strokeStyle = '#a7aeb6'; ctx.lineWidth = 3.5; ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = '#b8bfc7';
  for (let i = -5; i <= 5; i++) {
    const xx = i * w / 6, yy = d * 0.5 * Math.sqrt(1 - (xx / w) ** 2);
    ctx.beginPath(); ctx.moveTo(xx, -yy); ctx.lineTo(xx, yy); ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- cake stand
function drawStand(r, x, y, vis, glow, cakeOn) {
  if (vis <= 0.01) return;
  const R = L.R, pr = R * 1.5, pe = pr * 0.28, stem = R * 0.55;
  ctx.save(); ctx.globalAlpha = vis; ctx.translate(x, y);
  if (glow > 0.01) {
    const g = ctx.createRadialGradient(0, 0, pr * 0.3, 0, 0, pr * 1.6);
    g.addColorStop(0, `rgba(255,225,140,${0.55 * glow})`); g.addColorStop(1, 'rgba(255,225,140,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, pr * 1.6, pr * 0.8, 0, 0, TAU); ctx.fill();
  }
  // base
  ctx.beginPath(); ctx.ellipse(0, stem, pr * 0.55, pe * 0.55, 0, 0, TAU); ctx.fillStyle = '#e9e2d6'; ctx.fill(); ctx.strokeStyle = '#c8b58f'; ctx.lineWidth = 2; ctx.stroke();
  // stem
  ctx.beginPath(); ctx.moveTo(-R * 0.16, 0); ctx.bezierCurveTo(-R * 0.05, stem * 0.4, -R * 0.3, stem * 0.75, -R * 0.36, stem);
  ctx.lineTo(R * 0.36, stem); ctx.bezierCurveTo(R * 0.3, stem * 0.75, R * 0.05, stem * 0.4, R * 0.16, 0); ctx.closePath();
  const sg = ctx.createLinearGradient(-R * 0.3, 0, R * 0.3, 0); sg.addColorStop(0, '#cfc7b8'); sg.addColorStop(0.5, '#fbf7ef'); sg.addColorStop(1, '#c4bbaa');
  ctx.fillStyle = sg; ctx.fill();
  // plate
  ctx.beginPath(); ctx.ellipse(0, pe * 0.18, pr, pe, 0, 0, TAU); ctx.fillStyle = '#cbbb98'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 0, pr, pe, 0, 0, TAU);
  const pg = ctx.createRadialGradient(-pr * 0.3, -pe * 0.3, pr * 0.1, 0, 0, pr);
  pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.7, '#f4efe6'); pg.addColorStop(1, '#e2d9c8');
  ctx.fillStyle = pg; ctx.fill(); ctx.strokeStyle = '#d8b96a'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, pr * 0.82, pe * 0.82, 0, 0, TAU); ctx.strokeStyle = 'rgba(216,185,106,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
  if (glow > 0.01 && !cakeOn) {   // dotted landing ring that pulses: "put it here"
    ctx.setLineDash([6, 8]); ctx.lineDashOffset = -now * 30;
    ctx.strokeStyle = `rgba(230,170,60,${0.7 * glow})`; ctx.lineWidth = 3;
    const k = 1 + 0.05 * Math.sin(now * 5);
    ctx.beginPath(); ctx.ellipse(0, 0, r.cake.R * 1.05 * k, Math.max(r.cake.e, r.cake.R * 0.25) * 1.05 * k, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- pitcher
function pitcherSize() { return { w: L.R * 0.8, h: L.R * 0.95 }; }
function spoutLocal() { const { w, h } = pitcherSize(); return [-w * 0.55, -h * 0.42]; }
function drawPitcher(r, x, y, tilt, a = 1) {
  const { w, h } = pitcherSize(), col = r.palette.c1;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.rotate(tilt);
  // shadow-ish ground contact omitted (it floats when held)
  // body path (glass measuring jug)
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-w * 0.42, -h * 0.42);
    ctx.lineTo(-w * 0.55, -h * 0.5);            // spout tip
    ctx.lineTo(-w * 0.34, -h * 0.34);
    ctx.lineTo(-w * 0.4, h * 0.38);
    ctx.quadraticCurveTo(-w * 0.4, h * 0.5, -w * 0.25, h * 0.5);
    ctx.lineTo(w * 0.3, h * 0.5);
    ctx.quadraticCurveTo(w * 0.45, h * 0.5, w * 0.45, h * 0.38);
    ctx.lineTo(w * 0.45, -h * 0.42);
    ctx.quadraticCurveTo(w * 0.1, -h * 0.5, -w * 0.42, -h * 0.42);
    ctx.closePath();
  };
  // handle
  ctx.beginPath(); ctx.moveTo(w * 0.42, -h * 0.25);
  ctx.bezierCurveTo(w * 0.95, -h * 0.3, w * 0.95, h * 0.3, w * 0.42, h * 0.25);
  ctx.lineWidth = w * 0.13; ctx.strokeStyle = '#d9e4ea'; ctx.lineCap = 'round'; ctx.stroke();
  ctx.lineWidth = w * 0.05; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
  // liquid inside (level stays horizontal-ish in world: counter-rotate)
  ctx.save(); body(); ctx.clip();
  ctx.fillStyle = '#eef4f7'; ctx.fillRect(-w, -h, w * 2, h * 2);
  ctx.rotate(-tilt);
  const lvl = -h * 0.05;
  const lg = ctx.createLinearGradient(0, lvl, 0, lvl + h);
  lg.addColorStop(0, lighten(col, 0.25)); lg.addColorStop(0.5, col); lg.addColorStop(1, darken(col, 0.4));
  ctx.fillStyle = lg; ctx.fillRect(-w * 1.5, lvl, w * 3, h * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(0, lvl, w * 0.7, h * 0.05, 0, 0, TAU); ctx.fill();
  ctx.restore();
  // glass highlights + outline
  ctx.save(); body(); ctx.clip();
  ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffffff';
  ctx.beginPath(); rr(ctx, -w * 0.3, -h * 0.28, w * 0.09, h * 0.6, w * 0.04); ctx.fill();
  ctx.globalAlpha = 0.25; ctx.beginPath(); rr(ctx, w * 0.28, -h * 0.25, w * 0.05, h * 0.5, w * 0.02); ctx.fill();
  ctx.restore();
  body(); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(120,150,170,0.8)'; ctx.stroke();
  ctx.restore();
}
function drawStream(r, sx, sy, lx, ly, a = 1) {
  const col = r.palette.c1, w = L.R * 0.11;
  ctx.save(); ctx.globalAlpha *= a;
  ctx.beginPath();
  ctx.moveTo(sx - w * 0.6, sy);
  ctx.bezierCurveTo(sx - w * 0.9, sy + 12, lx - w * 0.5, sy + (ly - sy) * 0.3, lx - w * 0.42, ly);
  ctx.lineTo(lx + w * 0.42, ly);
  ctx.bezierCurveTo(lx + w * 0.5, sy + (ly - sy) * 0.3, sx + w * 0.4, sy + 10, sx + w * 0.6, sy);
  ctx.closePath();
  const g = ctx.createLinearGradient(lx - w, 0, lx + w, 0);
  g.addColorStop(0, darken(col, 0.35)); g.addColorStop(0.4, lighten(col, 0.15)); g.addColorStop(1, darken(col, 0.45));
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = w * 0.22;
  ctx.beginPath(); ctx.moveTo(sx - w * 0.15, sy + 6); ctx.bezierCurveTo(lx - w * 0.2, sy + (ly - sy) * 0.4, lx - w * 0.15, ly - 10, lx - w * 0.12, ly - 3); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- decorations (origin at base, size s ≈ height)
function drawDeco(type, s, r, a = 1) {
  ctx.save(); ctx.globalAlpha *= a;
  const shadow = () => { ctx.fillStyle = 'rgba(60,30,20,0.22)'; ctx.beginPath(); ctx.ellipse(0, 2, s * 0.45, s * 0.14, 0, 0, TAU); ctx.fill(); };
  switch (type) {
    case 'strawberry': {
      shadow();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-s * 0.55, -s * 0.25, -s * 0.5, -s * 0.85, 0, -s * 0.85);
      ctx.bezierCurveTo(s * 0.5, -s * 0.85, s * 0.55, -s * 0.25, 0, 0); ctx.closePath();
      const g = ctx.createRadialGradient(-s * 0.15, -s * 0.55, s * 0.05, 0, -s * 0.4, s * 0.6);
      g.addColorStop(0, '#ff6b6b'); g.addColorStop(0.6, '#e5203c'); g.addColorStop(1, '#a3122b'); ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = '#ffe680';
      for (let i = 0; i < 7; i++) { const yy = -s * (0.2 + (i % 3) * 0.2), xx = ((i * 37) % 5 - 2) * s * 0.11; ctx.beginPath(); ctx.ellipse(xx, yy, s * 0.03, s * 0.05, 0, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#3fae4a';
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(i * s * 0.12, -s * 0.86, s * 0.07, s * 0.16, i * 0.5, 0, TAU); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-s * 0.18, -s * 0.6, s * 0.08, s * 0.14, 0.3, 0, TAU); ctx.fill();
      break;
    }
    case 'blueberries': {
      shadow();
      for (const [x, y, k] of [[-s * 0.25, -s * 0.22, 1], [s * 0.25, -s * 0.2, 0.95], [0, -s * 0.5, 0.9]]) {
        const rad = s * 0.27 * k;
        const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, rad * 0.1, x, y, rad);
        g.addColorStop(0, '#7f8fe6'); g.addColorStop(0.6, '#3f4bb0'); g.addColorStop(1, '#22276b');
        ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = 'rgba(20,20,60,0.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); starPath(ctx, x, y - rad * 0.25, rad * 0.32, 5, 0.5); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(x - rad * 0.35, y - rad * 0.35, rad * 0.22, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'raspberry': {
      shadow(); ctx.fillStyle = '#d63384';
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4 - (j === 3 ? 1 : 0); i++) {
        const xx = (i - 1.5 + (j % 2) * 0.5 - 0.25) * s * 0.22, yy = -s * 0.15 - j * s * 0.2;
        const g = ctx.createRadialGradient(xx - s * 0.03, yy - s * 0.03, 1, xx, yy, s * 0.13);
        g.addColorStop(0, '#ff8ac2'); g.addColorStop(1, '#c2185b'); ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(xx, yy, s * 0.13, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'cherry': {
      shadow();
      ctx.strokeStyle = '#4b7d2a'; ctx.lineWidth = s * 0.06; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.3); ctx.quadraticCurveTo(0, -s * 1.05, s * 0.2, -s * 0.3); ctx.stroke();
      for (const x of [-s * 0.22, s * 0.22]) {
        const g = ctx.createRadialGradient(x - s * 0.08, -s * 0.36, s * 0.02, x, -s * 0.3, s * 0.3);
        g.addColorStop(0, '#ff5a6e'); g.addColorStop(0.7, '#c8102e'); g.addColorStop(1, '#7a0a1e');
        ctx.beginPath(); ctx.arc(x, -s * 0.28, s * 0.28, 0, TAU); ctx.fillStyle = g; ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(x - s * 0.09, -s * 0.38, s * 0.06, s * 0.09, 0.4, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'macaron': {
      shadow();
      const base = r ? (r.palette.c2 === '#ffffff' ? r.palette.c1 : r.palette.c2) : '#f7a8c9';
      const col = lighten(base, 0.3), dark = darken(base, 0.1), top = lighten(base, 0.5);
      ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(0, -s * 0.18, s * 0.5, s * 0.2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff4e6'; ctx.beginPath(); ctx.ellipse(0, -s * 0.3, s * 0.42, s * 0.12, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -s * 0.45, s * 0.5, s * 0.2, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -s * 0.55, s * 0.4, s * 0.16, 0, 0, TAU); ctx.fillStyle = top; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-s * 0.15, -s * 0.62, s * 0.14, s * 0.05, 0, 0, TAU); ctx.fill();
      break;
    }
    case 'gold': {
      ctx.beginPath(); ctx.moveTo(-s * 0.45, -s * 0.1); ctx.lineTo(-s * 0.2, -s * 0.55); ctx.lineTo(s * 0.1, -s * 0.4); ctx.lineTo(s * 0.5, -s * 0.6); ctx.lineTo(s * 0.4, -s * 0.05); ctx.lineTo(s * 0.05, 0); ctx.closePath();
      const g = ctx.createLinearGradient(-s * 0.4, -s * 0.5, s * 0.4, 0); g.addColorStop(0, '#fff2a8'); g.addColorStop(0.4, '#e6b422'); g.addColorStop(0.7, '#fff0b0'); g.addColorStop(1, '#c9931a');
      ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = '#fff8d0'; ctx.beginPath(); starPath(ctx, s * 0.25, -s * 0.5, s * 0.12, 4, 0.3); ctx.fill();
      break;
    }
    case 'shard': {
      shadow();
      ctx.beginPath(); ctx.moveTo(-s * 0.3, 0); ctx.lineTo(-s * 0.15, -s * 0.95); ctx.lineTo(s * 0.35, -s * 0.6); ctx.lineTo(s * 0.25, 0); ctx.closePath();
      const g = ctx.createLinearGradient(-s * 0.3, 0, s * 0.3, -s * 0.9); g.addColorStop(0, '#3b1d10'); g.addColorStop(0.5, '#6b3a20'); g.addColorStop(1, '#2d150a');
      ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(-s * 0.13, -s * 0.8); ctx.lineTo(-s * 0.02, -s * 0.85); ctx.lineTo(s * 0.02, -s * 0.15); ctx.lineTo(-s * 0.1, -s * 0.1); ctx.closePath(); ctx.fill();
      break;
    }
    case 'mint': {
      shadow();
      for (const k of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(k * s * 0.55, -s * 0.25, k * s * 0.5, -s * 0.6); ctx.quadraticCurveTo(k * s * 0.15, -s * 0.55, 0, 0); ctx.closePath();
        const g = ctx.createLinearGradient(0, 0, k * s * 0.5, -s * 0.6); g.addColorStop(0, '#2e7d32'); g.addColorStop(1, '#7fd67f');
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = 'rgba(20,80,20,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(k * s * 0.3, -s * 0.3, k * s * 0.45, -s * 0.55); ctx.stroke();
      }
      break;
    }
    case 'pearls': {
      shadow();
      for (const [x, y] of [[-s * 0.3, -s * 0.15], [s * 0.05, -s * 0.12], [s * 0.35, -s * 0.2], [-s * 0.12, -s * 0.4], [s * 0.2, -s * 0.45]]) {
        const g = ctx.createRadialGradient(x - s * 0.05, y - s * 0.05, 1, x, y, s * 0.16);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#e9e4f5'); g.addColorStop(1, '#b9b0d0');
        ctx.beginPath(); ctx.arc(x, y, s * 0.16, 0, TAU); ctx.fillStyle = g; ctx.fill();
      }
      break;
    }
    case 'orange': {
      shadow();
      ctx.save(); ctx.translate(0, -s * 0.45); ctx.rotate(-0.25); ctx.scale(1, 0.55); ctx.translate(0, s * 0.45);
      ctx.beginPath(); ctx.arc(0, -s * 0.45, s * 0.5, 0, TAU); ctx.fillStyle = '#ff9a1f'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, -s * 0.45, s * 0.42, 0, TAU); ctx.fillStyle = '#ffd27a'; ctx.fill();
      ctx.fillStyle = '#ff8c00';
      for (let i = 0; i < 8; i++) { const a0 = i * TAU / 8 + 0.06, a1 = a0 + TAU / 8 - 0.12; ctx.beginPath(); ctx.moveTo(0, -s * 0.45); ctx.arc(0, -s * 0.45, s * 0.38, a0, a1); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      break;
    }
    case 'flower': {
      shadow();
      const pc = r ? lighten(r.palette.c1, 0.55) : '#ffc0d9';
      for (let i = 0; i < 5; i++) {
        const a = i * TAU / 5 - Math.PI / 2;
        ctx.beginPath(); ctx.ellipse(Math.cos(a) * s * 0.28, -s * 0.45 + Math.sin(a) * s * 0.22, s * 0.2, s * 0.14, a, 0, TAU);
        ctx.fillStyle = pc; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, -s * 0.45, s * 0.14, 0, TAU); ctx.fillStyle = '#ffd23f'; ctx.fill();
      break;
    }
    case 'starcookie': {
      shadow();
      ctx.beginPath(); starPath(ctx, 0, -s * 0.45, s * 0.5, 5, 0.5); ctx.fillStyle = '#e8b86d'; ctx.fill(); ctx.strokeStyle = '#b8863d'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); starPath(ctx, 0, -s * 0.45, s * 0.36, 5, 0.5); ctx.fillStyle = '#fff6e0'; ctx.fill();
      ctx.fillStyle = '#ff5c8a'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(Math.cos(i * 1.7) * s * 0.15, -s * 0.45 + Math.sin(i * 1.7) * s * 0.12, s * 0.035, 0, TAU); ctx.fill(); }
      break;
    }
  }
  ctx.restore();
}
function decoSize() { return L.R * 0.42; }

// ---------------------------------------------------------------- tray of decorations
function trayItemPos(i, n) {
  const T = L.trayDock, step = T.len / (n + 0.6);
  if (T.horizontal) return { x: T.x + (i - (n - 1) / 2) * step, y: T.y };
  return { x: T.x, y: T.y + (i - (n - 1) / 2) * step };
}
function drawTray(r) {
  const t = r.tray; if (t.vis <= 0.01) return;
  const T = L.trayDock, s = decoSize(), n = t.items.length;
  const slide = (1 - t.vis) * L.R * 1.6;
  ctx.save();
  ctx.translate(T.horizontal ? 0 : -slide, T.horizontal ? slide : 0);
  const pad = s * 0.55;
  ctx.beginPath();
  if (T.horizontal) rr(ctx, T.x - T.len / 2, T.y - pad, T.len, pad * 1.9, pad * 0.6);
  else rr(ctx, T.x - pad, T.y - T.len / 2, pad * 1.9, T.len, pad * 0.6);
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill(); ctx.strokeStyle = 'rgba(190,160,130,0.6)'; ctx.lineWidth = 2; ctx.stroke();
  for (let i = 0; i < n; i++) {
    const p = trayItemPos(i, n);
    const bob = Math.sin(now * 2.2 + i * 1.3) * 2;
    ctx.save(); ctx.translate(p.x, p.y + s * 0.4 + bob); ctx.scale(1.15, 1.15);
    ctx.beginPath(); ctx.ellipse(0, 4, s * 0.55, s * 0.18, 0, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fill();
    drawDeco(t.items[i], s, r);
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- knife
function knifeLen() { return L.R * 1.5; }
function drawKnife(r, x, y, ang, a = 1) {
  const Lk = knifeLen(), bw = Lk * 0.16;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.rotate(ang);
  // handle (to +x), blade (to -x)
  ctx.beginPath(); rr(ctx, 0, -bw * 0.42, Lk * 0.42, bw * 0.84, bw * 0.3);
  const hg = ctx.createLinearGradient(0, -bw * 0.4, 0, bw * 0.4); hg.addColorStop(0, '#7a4a2b'); hg.addColorStop(0.5, '#4a2b16'); hg.addColorStop(1, '#2d1a0d');
  ctx.fillStyle = hg; ctx.fill();
  ctx.fillStyle = '#d8b56a'; for (const rx of [Lk * 0.1, Lk * 0.28]) { ctx.beginPath(); ctx.arc(rx, 0, bw * 0.12, 0, TAU); ctx.fill(); }
  // blade
  ctx.beginPath(); ctx.moveTo(0, -bw * 0.5); ctx.lineTo(-Lk * 0.55, -bw * 0.5); ctx.quadraticCurveTo(-Lk * 0.85, -bw * 0.5, -Lk, bw * 0.05);
  ctx.quadraticCurveTo(-Lk * 0.7, bw * 0.55, -Lk * 0.3, bw * 0.55); ctx.lineTo(0, bw * 0.55); ctx.closePath();
  const bg = ctx.createLinearGradient(0, -bw * 0.5, 0, bw * 0.55); bg.addColorStop(0, '#f4f7fa'); bg.addColorStop(0.5, '#c9d3dc'); bg.addColorStop(0.8, '#eef2f5'); bg.addColorStop(1, '#8d9aa6');
  ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = '#8091a0'; ctx.lineWidth = 1.5; ctx.stroke();
  // glint sweeping along blade
  ctx.clip();
  const k = (now * 0.5) % 1.4; ctx.globalAlpha *= 0.9;
  ctx.beginPath(); ctx.moveTo(-Lk * k - bw * 0.2, -bw * 0.5); ctx.lineTo(-Lk * k + bw * 0.1, -bw * 0.5); ctx.lineTo(-Lk * k - bw * 0.1, bw * 0.5); ctx.lineTo(-Lk * k - bw * 0.4, bw * 0.5); ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- cross-section face (the reveal)
function facePath(r, R, h) {
  ctx.beginPath();
  if (r.shape === 'dome') { ctx.ellipse(0, h, R, h, 0, Math.PI, TAU); ctx.closePath(); }
  else rr(ctx, -R, 0, R * 2, h, R * 0.06);
}
function drawInterior(r, R, h) {
  const t = r.interior;
  const band = (i, n, col) => { ctx.fillStyle = col; ctx.fillRect(-R - 2, h * i / n, R * 2 + 4, h / n + 0.5); };
  const cream = (y, th = h * 0.02) => { ctx.fillStyle = '#fff8e8'; ctx.fillRect(-R - 2, y - th / 2, R * 2 + 4, th); };
  switch (t) {
    case 'rainbow': {
      const cols = ['#ef3b57', '#ff8c1a', '#ffd23f', '#3fc46d', '#2d8cf0', '#8a4fd6'];
      cols.forEach((c, i) => band(i, 6, c)); for (let i = 1; i < 6; i++) cream(h * i / 6);
      break;
    }
    case 'heart': {
      ctx.fillStyle = '#f6e4c1'; ctx.fillRect(-R - 2, -2, R * 2 + 4, h + 4);
      ctx.globalAlpha = 0.25; ctx.fillStyle = noisePattern; ctx.fillRect(-R - 2, -2, R * 2 + 4, h + 4); ctx.globalAlpha = 1;
      ctx.beginPath(); heartPath(ctx, 0, h * 0.5, h * 0.36); ctx.fillStyle = '#e8305a'; ctx.fill();
      ctx.beginPath(); heartPath(ctx, -h * 0.03, h * 0.47, h * 0.24); ctx.fillStyle = 'rgba(255,120,150,0.55)'; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-h * 0.14, h * 0.32, h * 0.06, h * 0.09, 0.5, 0, TAU); ctx.fill();
      break;
    }
    case 'strawberry': {
      band(0, 1, '#f6e4c1');
      ctx.globalAlpha = 0.25; ctx.fillStyle = noisePattern; ctx.fillRect(-R - 2, -2, R * 2 + 4, h + 4); ctx.globalAlpha = 1;
      ctx.fillStyle = '#fffaf0'; ctx.fillRect(-R - 2, h * 0.28, R * 2 + 4, h * 0.44);
      ctx.fillStyle = '#e53950'; ctx.fillRect(-R - 2, h * 0.28, R * 2 + 4, h * 0.05); ctx.fillRect(-R - 2, h * 0.67, R * 2 + 4, h * 0.05);
      const n = Math.max(3, Math.round(R / (h * 0.28)));
      for (let i = 0; i < n; i++) {
        const x = -R + (i + 0.5) * 2 * R / n, y = h * 0.5, sw = h * 0.16, sh = h * 0.2;
        ctx.beginPath(); ctx.moveTo(x - sw, y - sh * 0.6); ctx.quadraticCurveTo(x - sw, y + sh, x, y + sh); ctx.quadraticCurveTo(x + sw, y + sh, x + sw, y - sh * 0.6); ctx.quadraticCurveTo(x, y - sh * 0.9, x - sw, y - sh * 0.6); ctx.closePath();
        ctx.fillStyle = '#ff3b5c'; ctx.fill();
        ctx.fillStyle = '#ffd6dc'; ctx.beginPath(); ctx.moveTo(x, y - sh * 0.5); ctx.lineTo(x - sw * 0.45, y + sh * 0.6); ctx.lineTo(x + sw * 0.45, y + sh * 0.6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; for (const k of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.moveTo(x, y - sh * 0.3); ctx.lineTo(x + k * sw * 0.7, y + sh * 0.75); ctx.stroke(); }
      }
      break;
    }
    case 'checker': {
      const cols = 6, rows = 3;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        ctx.fillStyle = (i + j) % 2 ? '#5a3220' : '#f7e3b9';
        ctx.fillRect(-R + i * 2 * R / cols - 1, j * h / rows - 1, 2 * R / cols + 2, h / rows + 2);
      }
      ctx.strokeStyle = 'rgba(255,248,232,0.9)'; ctx.lineWidth = 2;
      for (let i = 1; i < cols; i++) { ctx.beginPath(); ctx.moveTo(-R + i * 2 * R / cols, 0); ctx.lineTo(-R + i * 2 * R / cols, h); ctx.stroke(); }
      for (let j = 1; j < rows; j++) { ctx.beginPath(); ctx.moveTo(-R, j * h / rows); ctx.lineTo(R, j * h / rows); ctx.stroke(); }
      break;
    }
    case 'funfetti': {
      band(0, 1, '#fff3d6');
      ctx.globalAlpha = 0.2; ctx.fillStyle = noisePattern; ctx.fillRect(-R - 2, -2, R * 2 + 4, h + 4); ctx.globalAlpha = 1;
      for (const s of r.sprinkles) { ctx.save(); ctx.translate(-R + s.x * 2 * R, s.y * h); ctx.rotate(s.a); ctx.fillStyle = s.c; ctx.beginPath(); rr(ctx, -h * 0.045, -h * 0.014, h * 0.09, h * 0.028, h * 0.014); ctx.fill(); ctx.restore(); }
      break;
    }
    case 'matcha': {
      const n = 11; for (let i = 0; i < n; i++) band(i, n, i % 2 ? '#fff9e6' : '#a8d08d');
      break;
    }
    case 'star': {
      band(0, 1, '#4a2a1a');
      ctx.globalAlpha = 0.2; ctx.fillStyle = noisePattern; ctx.fillRect(-R - 2, -2, R * 2 + 4, h + 4); ctx.globalAlpha = 1;
      ctx.beginPath(); starPath(ctx, 0, h * 0.5, h * 0.4, 5, 0.5); ctx.fillStyle = '#ffd23f'; ctx.fill();
      ctx.beginPath(); starPath(ctx, 0, h * 0.5, h * 0.25, 5, 0.5); ctx.fillStyle = '#fff0a0'; ctx.fill();
      break;
    }
    case 'ombre': {
      const cols = ['#ffe3ec', '#ffb6cf', '#ff86ae', '#f4568c', '#d62a68'];
      cols.forEach((c, i) => band(i, 5, c)); for (let i = 1; i < 5; i++) cream(h * i / 5, h * 0.015);
      break;
    }
  }
}
function drawFace(r, R, h) {          // full cross-section with glaze rim
  ctx.save(); facePath(r, R, h); ctx.clip();
  drawInterior(r, R, h);
  ctx.globalAlpha = 0.07; ctx.fillStyle = noisePattern; ctx.fillRect(-R - 2, -2, R * 2 + 4, h + 4); ctx.globalAlpha = 1;
  // glaze rim (only where glaze is: top + sides; bottom stays crumb)
  const band = R * 0.09;
  ctx.save(); ctx.beginPath(); ctx.rect(-R - 4, -4, R * 2 + 8, h - band * 0.3); ctx.clip();
  facePath(r, R, h); ctx.lineWidth = band * 2; ctx.strokeStyle = r.palette.c1; ctx.stroke();
  ctx.lineWidth = band * 2 - 3; ctx.strokeStyle = lighten(r.palette.c1, 0.12); ctx.stroke();
  ctx.restore();
  // little glaze that ran onto the top edge + specular
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); rr(ctx, -R * 0.75, band * 0.15, R * 0.5, band * 0.45, band * 0.2); ctx.fill();
  ctx.restore();
  facePath(r, R, h); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(60,30,20,0.35)'; ctx.stroke();
}

// ---------------------------------------------------------------- glaze simulation
function pourAt(r, lx, dt) {                 // lx: local x on the top face
  const g = r.glaze, R = r.cake.R;
  lx = clamp(lx, -R * 0.98, R * 0.98);
  let b = null, best = R * 0.28;
  for (const bb of g.blobs) { const d = Math.abs(bb.x - lx); if (d < best) { best = d; b = bb; } }
  if (!b) { b = { x: lx, y: r.shape === 'dome' ? surfTop(r, lx) : rnd(-0.3, 0.3) * r.cake.e, r: 2, max: R * 0.15 }; g.blobs.push(b); if (g.blobs.length > 14) g.blobs.shift(); }
  b.max = Math.min(R * 0.62, b.max + R * 0.5 * dt);
  g.landX = lx; g.landY = b.y; g.splash = 1;
}
function updateGlaze(r, dt) {
  const g = r.glaze, c = r.cake, R = c.R, s = g.side;
  for (const b of g.blobs) b.r = approach(b.r, b.max, 3, dt);
  // column coverage from blobs → curtains flow down
  let full = 0;
  for (let i = 0; i <= NCOL; i++) {
    const x = -R + 2 * R * i / NCOL;
    let cov = false;
    for (const b of g.blobs) if (Math.abs(x - b.x) < b.r * 0.98) { cov = true; break; }
    if (cov) s[i] = Math.min(1.15, s[i] + 0.55 * dt);
    if (s[i] >= 0.999) full++;
  }
  // sideways creep: glaze spreads along the surface into neighbouring columns
  const prevS = Float32Array.from(s);
  for (let i = 0; i <= NCOL; i++) {
    const nb = Math.max(prevS[Math.max(0, i - 1)], prevS[Math.min(NCOL, i + 1)]);
    if (nb > prevS[i] + 0.05) s[i] = Math.min(nb, s[i] + 0.9 * dt * (nb - prevS[i]));
  }
  g.coverage = full / (NCOL + 1);
  // settle: once nearly covered, the last matte slivers close by themselves (no fiddly edges)
  if (g.coverage > 0.86 && !g.done) {
    for (let i = 0; i <= NCOL; i++) s[i] = Math.min(1.15, s[i] + 0.6 * dt);
    for (const b of g.blobs) b.max = Math.max(b.max, R * 0.9);
  }
  if (!g.done && g.coverage >= 0.999) { g.done = true; for (const b of g.blobs) { b.max = R * 1.3; } audio.sparkle(); }
  // drips: a full column occasionally sheds a drip
  for (let i = 0; i <= NCOL; i++) {
    if (s[i] >= 1.0 && g.drips.length < 7 && Math.random() < dt * 0.6) {
      const x = -R + 2 * R * i / NCOL;
      if (!g.drips.some(d => Math.abs(d.x - x) < R * 0.22)) g.drips.push({ x, len: 0, max: rnd(R * 0.1, R * 0.3) * (c.onStand ? 0.45 : 1), w: rnd(R * 0.035, R * 0.06), stuck: c.onStand || Math.random() < 0.5 });
    }
  }
  for (let i = g.drips.length - 1; i >= 0; i--) {
    const d = g.drips[i];
    if (d.len < d.max) d.len = Math.min(d.max, d.len + R * 0.22 * dt);
    else if (!d.stuck) {
      // detach a drop
      g.drops.push({ x: c.x + d.x, y: c.y - c.h + surfBottom(r, d.x) + d.len, vy: 0, w: d.w * 0.9 });
      d.len = d.max * 0.35; d.max = rnd(R * 0.1, R * 0.3); d.stuck = Math.random() < 0.6;
    }
  }
  const floorY = c.onStand ? c.y + L.R * 0.1 : r.rack.y + c.h * 0.3 + L.R * 0.5 * 0.15;
  for (let i = g.drops.length - 1; i >= 0; i--) {
    const d = g.drops[i]; d.vy += 900 * dt; d.y += d.vy * dt;
    if (d.y >= floorY) { g.drops.splice(i, 1); if (!c.onStand && !c.dragging) g.puddle = Math.min(5, g.puddle + 0.6); }
  }
  g.splash = Math.max(0, g.splash - dt * 4);
}

// ---------------------------------------------------------------- stage machine
function setStage(r, s) { r.stage = s; r.stageT = 0; idle = 0; }

function freeSlot(r) {
  const used = new Set(r.decos.map(d => d.slot));
  for (let i = 0; i < r.slots.length; i++) if (!used.has(i)) return i;
  return -1;
}
function nearestFreeSlot(r, lx, ly) {
  const used = new Set(r.decos.map(d => d.slot));
  let best = -1, bd = Infinity;
  for (let i = 0; i < r.slots.length; i++) {
    if (used.has(i)) continue;
    const d = dist(lx, ly, r.slots[i][0], r.slots[i][1]); if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function cakeTopY(r) { return r.cake.y - r.cake.h; }
function overCake(r, x, y, slack = 1.35) {
  const c = r.cake;
  return Math.abs(x - c.x) < c.R * slack && y > c.y - c.h - c.e - c.R * 0.6 && y < c.y + c.e + c.R * 0.3;
}

function update(dt) {
  now += dt; idle += dt;
  const r = round;
  r.t += dt; r.stageT += dt;
  const c = r.cake;
  // cake body wobble (spring)
  c.wobbleV += -c.wobble * 90 * dt - c.wobbleV * 5 * dt; c.wobble += c.wobbleV * dt;
  c.frost = approach(c.frost, r.stage === 'unmold' ? 1 : 0, 0.5, dt);

  // --- resting positions derived from layout each frame (so rotation just works)
  const home = L.cakeHome;
  r.rack.x = home.x; r.rack.y = home.y;
  if (!c.dragging && !c.onStand && r.stage !== 'move') { c.x = approach(c.x, home.x, 12, dt); c.y = approach(c.y, home.y, 12, dt); }
  if (r.stage === 'move' && !c.dragging && !c.onStand) { c.x = approach(c.x, home.x, 6, dt); c.y = approach(c.y, home.y, 6, dt); }

  switch (r.stage) {
    case 'unmold': {
      const m = r.mold;
      m.bob = Math.sin(r.t * 2.4) * L.R * 0.03 + L.R * 0.03;
      if (m.gone) {
        m.vy -= 2400 * dt; m.fly += m.vy * dt * -1;   // flies up and away
        if (m.fly > H) setStage(r, 'glaze');
      } else if (!pointer.down || pointer.grab !== 'mold') {
        m.lift = approach(m.lift, 0, 10, dt);
      }
      // while lifted a lot: cold mist rolls off
      if (m.lift > c.h * 0.4 && Math.random() < dt * 30) spawn('mist', c.x + rnd(-c.R, c.R), c.y - c.h * 0.5 + rnd(-c.h * 0.4, c.h * 0.4), 1, { sp0: 5, sp1: 20, life: 1.6, size: 2 });
      break;
    }
    case 'glaze': {
      const p = r.pitcher;
      p.vis = approach(p.vis, 1, 4, dt);
      const g = r.glaze;
      if (pointer.grab === 'pitcher' && pointer.down) {
        const [sx, sy] = spoutLocal();
        // hold pitcher so the spout hovers above the cake while over it
        let tx = pointer.x + pointer.ox, ty = pointer.y + pointer.oy;
        const spoutX = tx + sx;
        const over = Math.abs(spoutX - c.x) < c.R * 1.25;
        const minY = cakeTopY(r) - c.e - pitcherSize().h * 0.8;
        if (over) ty = Math.min(ty, minY);
        p.x = approach(p.x, tx, 25, dt); p.y = approach(p.y, ty, 25, dt);
        const pouring = over && !g.done;
        p.tilt = approach(p.tilt, pouring ? -0.95 : -0.15, 8, dt);
        if (pouring && p.tilt < -0.55) {
          const cosT = Math.cos(p.tilt), sinT = Math.sin(p.tilt);
          const wsx = p.x + sx * cosT - sy * sinT;
          pourAt(r, wsx - c.x, dt);
          if (!g.pouring) { g.pouring = true; audio.pour(true); }
        } else if (g.pouring) { g.pouring = false; audio.pour(false); }
      } else {
        if (g.pouring) { g.pouring = false; audio.pour(false); }
        const d = L.pitcherDock;
        p.x = approach(p.x, d.x, 6, dt); p.y = approach(p.y, d.y, 6, dt);
        p.tilt = approach(p.tilt, Math.sin(r.t * 2.5) * 0.12 - 0.1, 4, dt);
      }
      updateGlaze(r, dt);
      if (g.done) {
        r.doneT = (r.doneT || 0) + dt;
        if (r.doneT > 0.9 && pointer.grab !== 'pitcher') { setStage(r, 'move'); audio.pop(); }
      }
      break;
    }
    case 'move': {
      const p = r.pitcher, st = r.stand;
      p.vis = approach(p.vis, 0, 4, dt);
      const pd = L.pitcherDock; p.x = approach(p.x, pd.x + (portrait ? L.R : L.R * 1.5), 4, dt); p.y = approach(p.y, pd.y - L.R, 4, dt);
      st.vis = approach(st.vis, 1, 4, dt);
      const dock = L.standDock;
      if (pointer.grab !== 'stand') { st.x = approach(st.x, dock.x, 8, dt); st.y = approach(st.y, dock.y, 8, dt); }
      const near = dist(c.x, c.y, st.x, st.y) < L.R * 1.4;
      st.glow = approach(st.glow, near ? 1 : 0.45 + 0.25 * Math.sin(r.t * 3), 8, dt);
      // magnet
      if (c.dragging && near) { c.x = approach(c.x, st.x, 4, dt); c.y = approach(c.y, st.y, 4, dt); }
      updateGlaze(r, dt);
      break;
    }
    case 'settle': {                              // cake sits on stand → whole group glides to centre
      const st = r.stand;
      st.x = approach(st.x, L.cakeHome.x, 5, dt); st.y = approach(st.y, L.cakeHome.y, 5, dt);
      c.x = st.x; c.y = st.y - 2;
      r.rack.vis = approach(r.rack.vis, 0, 6, dt);
      st.glow = approach(st.glow, 0, 4, dt);
      updateGlaze(r, dt);
      if (r.stageT > 0.9) setStage(r, 'decorate');
      break;
    }
    case 'decorate': case 'slice': {
      const st = r.stand;
      st.x = approach(st.x, L.cakeHome.x, 8, dt); st.y = approach(st.y, L.cakeHome.y, 8, dt);
      c.x = st.x; c.y = st.y - 2;
      r.rack.vis = 0;
      const full = freeSlot(r) < 0;
      r.tray.vis = approach(r.tray.vis, (full || r.stage === 'slice') ? 0 : 1, 5, dt);
      const k = r.knife;
      const showKnife = r.decos.length >= 1 || r.stageT > 14;
      k.vis = approach(k.vis, showKnife ? 1 : 0, 5, dt);
      if (r.stage === 'slice' && pointer.grab === 'knife' && pointer.down) {
        let tx = pointer.x + pointer.ox, ty = pointer.y + pointer.oy;
        const nearX = Math.abs(tx - c.x) < c.R * 0.9;
        if (nearX) tx = lerp(tx, c.x, 0.6);                                  // magnet to the cut line
        k.x = approach(k.x, tx, 25, dt); k.y = approach(k.y, ty, 25, dt);
        k.ang = approach(k.ang, -Math.PI / 2, 10, dt);
        const over = Math.abs(k.x - c.x) < c.R * 0.8 && pointer.y > cakeTopY(r) - c.e - c.R && pointer.y < c.y + c.R * 0.8;
        if (over && pointer.accDy > 0) {
          if (k.cut === 0) audio.slice();
          k.cut = Math.min(1, k.cut + pointer.accDy / (c.h + c.e * 2) * 1.4);
          if (k.cut >= 0.999 && !k.cutDone) { k.cutDone = true; setStage(r, 'reveal'); audio.thud(); }
        }
        pointer.accDy = 0;
      } else {
        const d = L.knifeDock;
        k.x = approach(k.x, d.x, 6, dt); k.y = approach(k.y, d.y, 6, dt);
        k.ang = approach(k.ang, 0.25 + Math.sin(r.t * 2.2) * 0.12, 5, dt);
        if (r.stage === 'slice' && !pointer.down) setStage(r, 'decorate');  // let go → back to decorating (knife stays)
      }
      for (const d of r.decos) d.pop = approach(d.pop, 0, 6, dt);
      updateGlaze(r, dt);
      break;
    }
    case 'reveal': {
      const k = r.knife, rv = r.reveal;
      k.vis = approach(k.vis, 0, 3, dt); k.x = approach(k.x, L.knifeDock.x + L.R, 3, dt); k.y = approach(k.y, L.knifeDock.y - L.R, 3, dt);
      rv.t = Math.min(1, rv.t + dt * 0.7);
      if (rv.t > 0.55 && !rv.burst) {
        rv.burst = true; audio.chime();
        spawn('confetti', c.x, c.y - c.h * 0.5, 70, { sx: c.R, sy: c.h * 0.5, sp0: 60, sp1: 260, up: 220, life: 1.6, c: null, size: 1.2 });
        spawn('star', c.x, c.y - c.h * 0.5, 30, { sx: c.R * 1.2, sy: c.h * 0.6, sp0: 10, sp1: 60, life: 1.4 });
      }
      if (rv.t >= 1) { setStage(r, 'done'); }
      updateGlaze(r, dt);
      break;
    }
    case 'done': {
      const nm = r.nextMold;
      nm.vis = approach(nm.vis, r.stageT > 1.2 ? 1 : 0, 4, dt);
      nm.x = L.nextDock.x; nm.y = L.nextDock.y;
      if (Math.random() < dt * 2) spawn('star', c.x + rnd(-c.R * 1.6, c.R * 1.6), c.y - c.h * 0.5 + rnd(-c.h, c.h * 0.4), 1, { sp0: 0, sp1: 10, life: 1.2 });
      if (r.stageT > 14) startNextRound();
      updateGlaze(r, dt);
      break;
    }
  }
  // decoration drag
  if (r.dragDeco) { r.dragDeco.x = approach(r.dragDeco.x, pointer.x, 30, dt); r.dragDeco.y = approach(r.dragDeco.y, pointer.y - decoSize() * 0.6, 30, dt); }

  // transition between rounds
  if (oldRound) {
    transT = Math.min(1, transT + dt * 1.4);
    const k = easeInOut(transT);
    oldRound.offX = -W * 1.2 * k;
    r.offX = W * 1.2 * (1 - k);
    if (transT >= 1) { oldRound = null; r.offX = 0; }
  }
  updateParticles(dt);
}

function startNextRound() {
  audio.pop();
  const nr = newRound();
  nr.cake.x = L.cakeHome.x; nr.cake.y = L.cakeHome.y;
  nr.pitcher.x = L.pitcherDock.x; nr.pitcher.y = L.pitcherDock.y;
  nr.stand.x = L.standDock.x; nr.stand.y = L.standDock.y;
  nr.knife.x = L.knifeDock.x; nr.knife.y = L.knifeDock.y;
  oldRound = round; round = nr; transT = 0;
  pointer.grab = null; pointer.down = false;
}

// ---------------------------------------------------------------- input (one finger; first pointer wins)
function localOf(r, x, y) { return [x - r.cake.x, y - (r.cake.y - r.cake.h)]; }
function onDown(x, y) {
  audio.unlock();
  const r = round; if (oldRound) return;
  pointer.down = true; pointer.x = x; pointer.y = y; pointer.downX = x; pointer.downY = y; pointer.downT = now; idle = 0;
  pointer.grab = null;
  const c = r.cake;
  switch (r.stage) {
    case 'unmold':
      if (!r.mold.gone) pointer.grab = 'mold';
      break;
    case 'glaze': {
      const p = r.pitcher, { w, h } = pitcherSize();
      if (Math.abs(x - p.x) < w * 0.9 && Math.abs(y - p.y) < h * 0.8) { pointer.ox = p.x - x; pointer.oy = p.y - y; }
      else { pointer.ox = w * 0.35; pointer.oy = h * 0.25; }    // touched elsewhere: pitcher comes to the finger, spout near it
      pointer.grab = 'pitcher';
      break;
    }
    case 'move': {
      const st = r.stand;
      if (dist(x, y, st.x, st.y) < L.R * 1.4 && !overCake(r, x, y)) { pointer.grab = 'stand'; pointer.ox = st.x - x; pointer.oy = st.y - y; }
      else { pointer.grab = 'cake'; c.dragging = true; if (overCake(r, x, y)) { pointer.ox = c.x - x; pointer.oy = c.y - y; } else { pointer.ox = 0; pointer.oy = c.h * 0.5; } }
      break;
    }
    case 'decorate': case 'slice': {
      const s = decoSize(), n = r.tray.items.length, T = L.trayDock;
      // placed decoration? pick it back up
      let hit = -1;
      for (let i = r.decos.length - 1; i >= 0; i--) { const d = r.decos[i]; if (dist(x, y, d.x, d.y - s * 0.4) < s * 0.7) { hit = i; break; } }
      if (hit >= 0) { const d = r.decos.splice(hit, 1)[0]; r.dragDeco = { type: d.type, x: d.x, y: d.y - s * 0.4 }; pointer.grab = 'deco'; break; }
      // tray item?
      if (r.tray.vis > 0.5) {
        const stepHalf = T.len / (n + 0.6) / 2;
        for (let i = 0; i < n; i++) {
          const p = trayItemPos(i, n);
          if (Math.abs(x - p.x) < (T.horizontal ? stepHalf : s * 1.1) && Math.abs(y - p.y) < (T.horizontal ? s * 1.1 : stepHalf)) {
            r.dragDeco = { type: r.tray.items[i], x: p.x, y: p.y }; pointer.grab = 'deco'; audio.pop(); break;
          }
        }
        if (pointer.grab) break;
      }
      // knife (anywhere else, once it exists)
      if (r.knife.vis > 0.5) {
        const k = r.knife;
        pointer.grab = 'knife'; pointer.ox = 0; pointer.oy = -knifeLen() * 0.55; pointer.accDy = 0;
        setStage(r, 'slice');
      } else {
        c.wobbleV += 3;   // the cake jiggles when poked — it's alive, keep exploring
      }
      break;
    }
    case 'done':
      startNextRound();
      break;
  }
  canvas.classList.toggle('grabbing', !!pointer.grab);
}
function onMove(x, y) {
  pointer.dx = x - pointer.x; pointer.dy = y - pointer.y; pointer.x = x; pointer.y = y;
  if (!pointer.down) return;
  pointer.accDy += Math.max(0, pointer.dy);
  idle = 0;
  const r = round, c = r.cake;
  if (pointer.grab === 'mold') {
    r.mold.lift = Math.max(0, pointer.downY - y) * 1.15;
    if (r.mold.lift > c.h * 1.0 + c.e) releaseMold(r);
  } else if (pointer.grab === 'cake') {
    c.x = x + pointer.ox; c.y = y + pointer.oy;
  } else if (pointer.grab === 'stand') {
    r.stand.x = x + pointer.ox; r.stand.y = y + pointer.oy;
  }
}
function releaseMold(r) {
  const m = r.mold; if (m.gone) return;
  m.gone = true; m.vy = -900; m.fly = m.lift;
  pointer.grab = null;
  r.cake.wobbleV += 6; audio.pop();
  spawn('star', r.cake.x, r.cake.y - r.cake.h * 0.5, 18, { sx: r.cake.R, sy: r.cake.h * 0.5, sp0: 20, sp1: 90, life: 1 });
  spawn('mist', r.cake.x, r.cake.y - r.cake.h * 0.6, 8, { sx: r.cake.R, sy: r.cake.h * 0.3, sp0: 10, sp1: 40, life: 1.6, size: 2 });
}
function onUp() {
  if (!pointer.down) return;
  pointer.down = false; idle = 0;
  const r = round, c = r.cake;
  if (!r) return;
  switch (pointer.grab) {
    case 'mold':
      if (r.mold.lift > c.h * 0.45) releaseMold(r);
      else if (r.mold.lift < c.h * 0.1 && now - pointer.downT < 0.3) { r.mold.lift = c.h * 0.3; c.wobbleV += 2; audio.pop(); }  // a tap makes it hop: "lift me"
      break;
    case 'cake': case 'stand': {
      c.dragging = false;
      const st = r.stand;
      const tapOnStand = pointer.grab === 'stand' && now - pointer.downT < 0.3 && dist(pointer.x, pointer.y, pointer.downX, pointer.downY) < 12;
      if (tapOnStand || dist(c.x, c.y, st.x, st.y) < L.R * 1.4) {
        c.onStand = true; c.x = st.x; c.y = st.y - 2; c.wobbleV += 4; audio.snap();
        r.glaze.drops.length = 0;
        spawn('star', c.x, c.y - c.h * 0.5, 14, { sx: c.R, sy: c.h * 0.5, sp0: 10, sp1: 60, life: 0.9 });
        setStage(r, 'settle');
      }
      break;
    }
    case 'deco': {
      const d = r.dragDeco; r.dragDeco = null;
      const s = decoSize();
      const [lx, ly] = localOf(r, d.x, d.y + s * 0.4);
      if (overCake(r, d.x, d.y + s * 0.4, 1.4)) {
        const slot = nearestFreeSlot(r, lx, ly);
        if (slot >= 0) {
          r.decos.push({ type: d.type, slot, x: c.x + r.slots[slot][0], y: c.y - c.h + r.slots[slot][1], pop: 1 });
          audio.snap();
          spawn('star', c.x + r.slots[slot][0], c.y - c.h + r.slots[slot][1] - s * 0.4, 8, { sp0: 20, sp1: 70, life: 0.7 });
        } else { audio.pop(); }
      }
      break;
    }
    case 'knife':
      break;
  }
  pointer.grab = null;
  canvas.classList.remove('grabbing');
}
canvas.addEventListener('pointerdown', e => { if (pointer.id !== null) return; pointer.id = e.pointerId; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} onDown(e.clientX, e.clientY); e.preventDefault(); });
canvas.addEventListener('pointermove', e => { if (e.pointerId !== pointer.id && pointer.id !== null) return; onMove(e.clientX, e.clientY); e.preventDefault(); });
const endP = e => { if (e.pointerId !== pointer.id) return; pointer.id = null; onUp(); e.preventDefault(); };
canvas.addEventListener('pointerup', endP); canvas.addEventListener('pointercancel', endP);
canvas.addEventListener('lostpointercapture', e => { if (e.pointerId === pointer.id) { pointer.id = null; onUp(); } });
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('blur', () => { pointer.id = null; onUp(); });

// ---------------------------------------------------------------- scene rendering
function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#fbf3ea'); g.addColorStop(0.55, '#f3e4d6'); g.addColorStop(1, '#e6cdb9');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // table surface line, soft
  const ty = L.cakeHome.y + L.R * 0.75;
  const g2 = ctx.createLinearGradient(0, ty - 40, 0, ty + 60);
  g2.addColorStop(0, 'rgba(180,130,100,0)'); g2.addColorStop(0.5, 'rgba(180,130,100,0.18)'); g2.addColorStop(1, 'rgba(180,130,100,0)');
  ctx.fillStyle = g2; ctx.fillRect(0, ty - 40, W, 100);
  // vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.8);
  v.addColorStop(0, 'rgba(120,70,40,0)'); v.addColorStop(1, 'rgba(120,70,40,0.22)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}
function softShadow(x, y, rx, ry, a = 0.25) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(70,40,25,${a})`); g.addColorStop(1, 'rgba(70,40,25,0)');
  ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore();
}

function drawCakeExterior(r, { clipHalf = 0 } = {}) {   // in local coords (already translated)
  const c = r.cake;
  ctx.save();
  if (clipHalf) { ctx.beginPath(); ctx.rect(clipHalf < 0 ? -c.R * 3 : 0, -c.R * 2, c.R * 3, c.h + c.R * 3); ctx.clip(); }
  drawMatteCake(r);
  drawGlaze(r);
  drawDrips(r);
  ctx.restore();
}
function drawDecos(r, filter, dx = 0) {
  const s = decoSize(), c = r.cake;
  const list = r.decos.filter(filter || (() => true)).slice().sort((a, b) => r.slots[a.slot][1] - r.slots[b.slot][1]);
  for (const d of list) {
    const [lx, ly] = r.slots[d.slot];
    const k = 1 + d.pop * 0.35 * Math.sin(d.pop * Math.PI);
    ctx.save(); ctx.translate(c.x + lx + dx, c.y - c.h + ly); ctx.scale(k, k);
    drawDeco(d.type, s, r); ctx.restore();
  }
}

function drawRound(r) {
  const c = r.cake;
  ctx.save(); ctx.translate(r.offX, 0);
  // rack (with drip tray) at home
  drawRack(r, r.rack.x, r.rack.y, r.rack.vis);
  // stand
  if (r.stand.vis > 0.01) { softShadow(r.stand.x, r.stand.y + L.R * 0.6, L.R * 1.6, L.R * 0.45, 0.25); drawStand(r, r.stand.x, r.stand.y, r.stand.vis, r.stand.glow, c.onStand); }

  const isSplit = r.stage === 'reveal' || r.stage === 'done';
  if (!isSplit) {
    // cake with body wobble
    if (c.dragging) softShadow(c.x, c.y + L.R * 0.25, c.R * 1.3, c.R * 0.4, 0.2);
    else if (!c.onStand) softShadow(c.x, c.y + c.e + 4, c.R * 1.25, c.R * 0.35, 0.22);
    ctx.save(); ctx.translate(c.x, c.y - c.h);
    ctx.translate(0, c.h); ctx.scale(1 + c.wobble * 0.06, 1 - c.wobble * 0.06); ctx.translate(0, -c.h);
    drawCakeExterior(r);
    // cut line while slicing
    const k = r.knife;
    if (k.cut > 0) {
      const yTop = -c.e, yEnd = -c.e + k.cut * (c.h + c.e * 2);
      ctx.save(); silhouette(r); ctx.clip();
      ctx.strokeStyle = 'rgba(70,35,20,0.75)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, yTop); ctx.lineTo(0, yEnd); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(2, yTop); ctx.lineTo(2, yEnd); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    // mold over the cake
    if (r.stage === 'unmold') {
      const m = r.mold, lift = m.gone ? m.fly : m.lift + (pointer.grab === 'mold' ? 0 : m.bob);
      ctx.save(); ctx.translate(c.x, c.y - c.h); drawMold(r, lift); ctx.restore();
    }
    drawDecos(r);
  } else {
    drawSplitCake(r);
  }
  drawDrops(r);

  // pitcher + stream
  const p = r.pitcher;
  if (p.vis > 0.01) {
    const g = r.glaze;
    if (g.pouring && p.tilt < -0.55) {
      const [sx, sy] = spoutLocal(), cosT = Math.cos(p.tilt), sinT = Math.sin(p.tilt);
      const wsx = p.x + sx * cosT - sy * sinT, wsy = p.y + sx * sinT + sy * cosT;
      const lx = clamp(wsx - c.x, -c.R * 0.98, c.R * 0.98);
      drawStream(r, wsx, wsy, c.x + lx, c.y - c.h + (r.shape === 'dome' ? surfTop(r, lx) : g.landY));
    }
    drawPitcher(r, p.x, p.y, p.tilt, p.vis);
  }
  drawTray(r);
  if (r.knife.vis > 0.01) drawKnife(r, r.knife.x, r.knife.y, r.knife.ang, r.knife.vis);
  if (r.dragDeco) { ctx.save(); ctx.translate(r.dragDeco.x, r.dragDeco.y + decoSize() * 0.4); ctx.scale(1.25, 1.25); drawDeco(r.dragDeco.type, decoSize(), r); ctx.restore(); }
  // the next cake peeking in, still in its mold — tap anything to start again
  if (r.nextMold.vis > 0.01) {
    const nm = r.nextMold, sc = 0.55;
    ctx.save(); ctx.globalAlpha = nm.vis; ctx.translate(nm.x, nm.y + (1 - nm.vis) * L.R);
    const ring = (now * 0.9) % 1;
    ctx.strokeStyle = `rgba(255,190,80,${(1 - ring) * 0.8})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, L.R * (0.5 + ring * 0.6), 0, TAU); ctx.stroke();
    ctx.scale(sc, sc); ctx.translate(0, -c.h * 0.5);
    ctx.save(); ctx.globalAlpha *= 0.9; drawMatteCake(r); ctx.restore();
    drawMold(r, Math.sin(now * 3) * 6 + 6);
    ctx.restore();
  }
  ctx.restore();
}

function drawSplitCake(r) {
  const c = r.cake, t = easeInOut(r.reveal.t), R = c.R, h = c.h;
  const gap = R * 0.12, faceS = Math.min(0.95, (W * 0.94 - R) / (2.2 * R));
  const shift = -0.5 * R * t;                            // whole arrangement slides left a bit so the face fits
  // left half: exterior, cut face towards +x (invisible in side view; edge shows crumb)
  ctx.save(); ctx.translate(c.x + shift, c.y - h);
  drawCakeExterior(r, { clipHalf: -1 });
  // exposed crumb edge on the left half (thin sliver of interior at the cut)
  ctx.save(); silhouette(r); ctx.clip(); ctx.beginPath(); ctx.rect(-R * 0.06, -c.e - 2, R * 0.06, h + c.e * 2 + 4); ctx.clip();
  ctx.translate(-R * 0.03, 0); ctx.scale(0.06, 1); drawInterior(r, R, h);
  ctx.restore();
  ctx.restore();
  drawDecos(r, d => r.slots[d.slot][0] <= 0, shift);
  // right half: slides right and turns its cut face toward us
  const flip = t;                                          // 0 → exterior (right half), 1 → face
  const dx = gap * Math.min(1, t * 2.5);                   // small gap opens first
  if (flip < 0.5) {
    const sx = Math.cos(flip * Math.PI);                    // 1 → 0
    ctx.save(); ctx.translate(c.x + shift + dx, c.y - h); ctx.scale(Math.max(0.02, sx), 1);
    drawCakeExterior(r, { clipHalf: 1 });
    ctx.restore();
    drawDecos(r, d => r.slots[d.slot][0] > 0, shift + dx - (1 - sx) * R * 0.5);
  } else {
    const sx = -Math.cos(flip * Math.PI);                   // 0 → 1
    const fw = R * faceS;                                   // half width of face
    ctx.save(); ctx.translate(c.x + shift + dx + fw * sx, c.y - h); ctx.scale(Math.max(0.02, sx) * faceS, 1 + (1 - faceS) * 0.15);
    softShadow(0, h + 4, R * 1.2, R * 0.3, 0.25);
    drawFace(r, R, h);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- ghost hints (only after the child has paused)
function drawGhost(r) {
  const wait = 4.5;
  if (pointer.down || idle < wait || oldRound) return;
  const u = ((idle - wait) % 2.6) / 2.6;                  // loop
  const a = u < 0.15 ? u / 0.15 : u > 0.8 ? (1 - u) / 0.2 : 1;
  const k = easeInOut(clamp((u - 0.1) / 0.6, 0, 1));
  const c = r.cake;
  ctx.save(); ctx.globalAlpha = 0.45 * a;
  switch (r.stage) {
    case 'unmold':
      ctx.translate(c.x, c.y - c.h); drawMold(r, k * (c.h * 1.3) + r.mold.bob, 1);
      break;
    case 'glaze': {
      const d = L.pitcherDock, tx = c.x + c.R * 0.4, ty = cakeTopY(r) - c.e - pitcherSize().h * 0.8;
      const x = lerp(d.x, tx, k), y = lerp(d.y, ty, k), tilt = lerp(-0.1, -0.95, clamp((k - 0.6) / 0.4, 0, 1));
      if (tilt < -0.55) { const [sx, sy] = spoutLocal(); const wsx = x + sx * Math.cos(tilt) - sy * Math.sin(tilt), wsy = y + sx * Math.sin(tilt) + sy * Math.cos(tilt); drawStream(r, wsx, wsy, wsx, cakeTopY(r)); }
      drawPitcher(r, x, y, tilt);
      break;
    }
    case 'move': {
      const st = r.stand, x = lerp(c.x, st.x, k), y = lerp(c.y, st.y, k);
      ctx.translate(x, y - c.h); drawCakeExterior(r);
      break;
    }
    case 'decorate': {
      const slot = freeSlot(r);
      if (slot >= 0 && r.tray.vis > 0.5) {
        const p = trayItemPos(0, r.tray.items.length), s = decoSize();
        ctx.translate(lerp(p.x, c.x + r.slots[slot][0], k), lerp(p.y + s * 0.4, c.y - c.h + r.slots[slot][1], k));
        drawDeco(r.tray.items[0], s, r);
      } else if (r.knife.vis > 0.5) {
        ghostKnife(r, k);
      }
      break;
    }
    case 'slice': ghostKnife(r, k); break;
  }
  ctx.restore();
}
function ghostKnife(r, k) {
  const c = r.cake, d = L.knifeDock;
  const k1 = clamp(k / 0.5, 0, 1), k2 = clamp((k - 0.5) / 0.5, 0, 1);
  const x = lerp(d.x, c.x, k1), y = lerp(d.y, cakeTopY(r) - c.e - knifeLen() * 1.05, k1) + k2 * (c.h + c.e * 2 + knifeLen() * 0.1);
  drawKnife(r, x, y, lerp(0.25, -Math.PI / 2, k1));
}

// ---------------------------------------------------------------- main loop
function render() {
  drawBackground();
  if (oldRound) drawRound(oldRound);
  drawRound(round);
  drawGhost(round);
  drawParticles();
}
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
resize();
round = newRound();
round.cake.x = L.cakeHome.x; round.cake.y = L.cakeHome.y;
round.pitcher.x = L.pitcherDock.x; round.pitcher.y = L.pitcherDock.y;
round.stand.x = L.standDock.x; round.stand.y = L.standDock.y;
round.knife.x = L.knifeDock.x; round.knife.y = L.knifeDock.y;
requestAnimationFrame(frame);

// test hook (harmless in production)
window.__cake = {
  get round() { return round; }, get L() { return L; }, next: startNextRound,
  debug(o) {                       // jump to a state for visual checks
    const r = round; Object.assign(r, o); applyCakeGeometry(r);
    if (o.glazed) { r.glaze.blobs = [{ x: 0, y: 0, r: r.cake.R * 1.3, max: r.cake.R * 1.3 }]; r.glaze.side.fill(1.1); r.glaze.done = true; r.glaze.coverage = 1; r.mold.gone = true; }
    if (o.onStand) { r.cake.onStand = true; r.stand.vis = 1; r.stand.x = L.cakeHome.x; r.stand.y = L.cakeHome.y; r.rack.vis = 0; }
    if (o.decos) r.decos = o.decos.map((type, i) => ({ type, slot: i, x: 0, y: 0, pop: 0 }));
    if (o.stage) setStage(r, o.stage);
    if (o.revealT !== undefined) { r.reveal.t = o.revealT; r.reveal.burst = true; }
  }
};
})();
