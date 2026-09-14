/* ---------- small math / helpers ---------- */
'use strict';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const easeInOut = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const wrapAng = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// seeded deterministic noise for textures
function hash(n) { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function shade(h, k) { // k>0 lighter, k<0 darker
  const [r, g, b] = hexToRgb(h);
  const f = (c) => Math.round(clamp(k > 0 ? c + (255 - c) * k : c * (1 + k), 0, 255));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
}

/* ---------- coverage grid on a cylinder side (angle x height) ---------- */
class Grid {
  constructor(na, nh, init = 0) { this.na = na; this.nh = nh; this.v = new Float32Array(na * nh).fill(init); }
  idx(a, j) { return ((a % this.na) + this.na) % this.na + j * this.na; }
  get(a, j) { return this.v[this.idx(a, j)]; }
  // paint around local angle th (rad), height fraction f (0..1); ra in rad, rf in fraction
  paint(th, f, ra, rf, amt, target = 1) {
    let changed = 0;
    const ac = (th + Math.PI) / TAU * this.na, jc = f * this.nh;
    const aR = ra / TAU * this.na, jR = rf * this.nh;
    for (let a = Math.floor(ac - aR); a <= Math.ceil(ac + aR); a++) {
      for (let j = Math.max(0, Math.floor(jc - jR)); j <= Math.min(this.nh - 1, Math.ceil(jc + jR)); j++) {
        const da = (a + .5 - ac) / aR, dj = (j + .5 - jc) / jR;
        const d = da * da + dj * dj;
        if (d > 1) continue;
        const i = this.idx(a, j);
        const old = this.v[i];
        const nv = amt > 0 ? Math.min(target, old + amt * (1 - d * .6)) : Math.max(target, old + amt * (1 - d * .6));
        if (nv !== old) { changed += Math.abs(nv - old); this.v[i] = nv; }
      }
    }
    return changed;
  }
  fill(v) { this.v.fill(v); }
  mean() { let s = 0; for (let i = 0; i < this.v.length; i++) s += this.v[i]; return s / this.v.length; }
  // mean over the columns that face the viewer for a given view rotation
  meanFront(rot) { // weighted by how much of the column faces the viewer
    let s = 0, n = 0;
    for (let a = 0; a < this.na; a++) {
      const th = (a + .5) / this.na * TAU - Math.PI + rot, c = Math.cos(th);
      if (c < .12) continue;
      for (let j = 0; j < this.nh; j++) { s += Math.min(1, this.v[a + j * this.na] * 1.5) * c; n += c; }
    }
    return n ? s / n : 1;
  }
}

/* ---------- particles ---------- */
class Particles {
  constructor() { this.list = []; }
  add(p) { p.age = 0; p.life = p.life || 1; this.list.push(p); return p; }
  burst(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = rnd(TAU), s = rnd(opts.speed || 60) * (0.4 + Math.random());
      this.add({
        x, y, vx: Math.cos(a) * s + (opts.vx || 0), vy: Math.sin(a) * s + (opts.vy || 0),
        g: opts.g === undefined ? 200 : opts.g, life: rnd(opts.life || .8, (opts.life || .8) * 1.8),
        r: rnd(opts.r || 3, (opts.r || 3) * 2.2), color: opts.colors ? pick(opts.colors) : (opts.color || '#fff'),
        kind: opts.kind || 'dot', rot: rnd(TAU), vr: rnd(-6, 6), drag: opts.drag || 0, world: !!opts.world
      });
    }
  }
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.age += dt;
      if (p.age > p.life) { L.splice(i, 1); continue; }
      p.vy += p.g * dt;
      if (p.drag) { p.vx *= (1 - p.drag * dt); p.vy *= (1 - p.drag * dt); }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
  }
  draw(ctx, toScreen) {
    for (const p of this.list) {
      const t = p.age / p.life, al = t < .7 ? 1 : 1 - (t - .7) / .3;
      let x = p.x, y = p.y, r = p.r;
      if (p.world) { const s = toScreen(p.x, p.y); x = s.x; y = s.y; r = p.r * s.z; }
      ctx.save();
      ctx.globalAlpha = al * (p.alpha === undefined ? 1 : p.alpha);
      ctx.fillStyle = p.color;
      ctx.translate(x, y); ctx.rotate(p.rot);
      if (p.kind === 'dot') { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); }
      else if (p.kind === 'spark') { ctx.beginPath(); for (let k = 0; k < 4; k++) { ctx.moveTo(0, 0); ctx.lineTo(Math.cos(k * Math.PI / 2) * r * 2, Math.sin(k * Math.PI / 2) * r * 2); } ctx.strokeStyle = p.color; ctx.lineWidth = r * .5; ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, r * .6, 0, TAU); ctx.fill(); }
      else if (p.kind === 'confetti') { ctx.fillRect(-r, -r * .5, r * 2, r); }
      else if (p.kind === 'petal') { ctx.beginPath(); ctx.ellipse(0, 0, r, r * .55, 0, 0, TAU); ctx.fill(); }
      else if (p.kind === 'heart') { drawHeart(ctx, 0, 0, r, p.color); }
      else if (p.kind === 'stick') { ctx.fillStyle = p.color; ctx.fillRect(-r * .3, -r * 1.5, r * .6, r * 3); }
      ctx.restore();
    }
  }
}
function drawHeart(ctx, x, y, s, color) {
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x, y + s * .9);
  ctx.bezierCurveTo(x - s * 1.6, y - s * .3, x - s * .6, y - s * 1.3, x, y - s * .4);
  ctx.bezierCurveTo(x + s * .6, y - s * 1.3, x + s * 1.6, y - s * .3, x, y + s * .9);
  ctx.fill();
}

/* ---------- noise pattern canvases for materials ---------- */
function makePattern(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); fn(g, w, h); return c;
}
