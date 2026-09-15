// 状態機械。レイアウトには一切依存しない（座標は正規化 or 毎フレーム layout から取る）。
import { clamp, lerp, easeInOut, springWobble, TAU } from './util.js';
import { toScreen, toLocal } from './layout.js';
import { bakeRice, bakeMixedRice, makeLayer, paintMix, MOUND, moundRadius } from './render/plate.js';
import { sfx, unlock } from './audio.js';

export const S = {
  KETCHUP: 'RICE_KETCHUP',
  MIX: 'RICE_MIX',
  POUR: 'EGG_POUR',
  GATHER: 'EGG_GATHER',
  SLIDE: 'EGG_SLIDE',
  CUT: 'CUT',
  OPEN: 'OPEN',
  DRAW: 'DRAW',
  MENU: 'DONE_MENU',
};

export const VARIANTS = [
  {
    id: 0,
    plate: { rim: '#f6f4ef', mid: '#ded9d0', low: '#b9b1a4', pattern: '#c3d2e8', wellHi: '#ffffff', wellLo: '#ece8df' },
    ketchup: { light: '#f4694a', body: '#d8281b', deep: '#a3130c', shadow: '#6b0a05', gloss: 'rgba(255,220,205,0.95)' },
    // チキンライス（オレンジ寄りの赤）
    rice: { hi: '#f58a4a', mid: '#e85a2a', low: '#d9431e', edge: '#b23a15' },
    egg: {
      hi: '#fff6bd', mid: '#ffd84e', low: '#f5aa1d', edge: '#d8820f',
      torHi: '#ffe89b', torMid: '#ffd24a', torLow: '#f7a928', torEdge: '#d8820f',
    },
  },
  {
    id: 1,
    plate: { rim: '#fdf3f4', mid: '#efdcdf', low: '#cdb4b8', pattern: '#f0b9c3', wellHi: '#ffffff', wellLo: '#f7ecec' },
    ketchup: { light: '#ff7f52', body: '#e8431f', deep: '#b32a08', shadow: '#7a1a03', gloss: 'rgba(255,228,208,0.95)' },
    rice: { hi: '#ff9a5c', mid: '#f06a33', low: '#e04f22', edge: '#bd4014' },
    egg: {
      hi: '#fffad4', mid: '#ffe173', low: '#fbbc3a', edge: '#e09a24',
      torHi: '#fff0ae', torMid: '#ffdb63', torLow: '#fbb53c', torEdge: '#e08d14',
    },
  },
  {
    id: 2,
    plate: { rim: '#fbf6e8', mid: '#e6dcc3', low: '#bfb191', pattern: '#bcd6bb', wellHi: '#fffdf4', wellLo: '#eee7d3' },
    ketchup: { light: '#e75a34', body: '#c11e14', deep: '#8d0d08', shadow: '#5c0704', gloss: 'rgba(255,210,190,0.92)' },
    rice: { hi: '#ee7f3c', mid: '#dc5322', low: '#c63f17', edge: '#a2320e' },
    egg: {
      hi: '#ffeaa0', mid: '#ffc62f', low: '#ee930f', edge: '#c06c08',
      torHi: '#ffdf84', torMid: '#fdc543', torLow: '#ef9a1e', torEdge: '#c67405',
    },
  },
];

const GRID = 32;
// 皿に乗ったオムレツ：ライスマウンドの幅 85% / 高さ 70%、少し上に乗る
export const OM_RX = MOUND.ru * 0.85;
export const OM_RY = MOUND.rv * 0.72;
export const OM_V = MOUND.cv - MOUND.rv * 0.16;
const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createGame() {
  const G = {
    state: S.KETCHUP,
    st: 0,
    time: 0,
    variantId: 0,
    variant: VARIANTS[0],
    assets: { rice: null, mixed: null, mixLayer: makeLayer() },
    ketchup: { strokes: [], cur: null, amount: 0, need: 2.6, full: false },
    bottle: { x: 0, y: 0, tx: 0, ty: 0, angle: 0, grab: false, flow: 0, homed: false },
    spatula: { x: 0, y: 0, tx: 0, ty: 0, angle: 0, grab: false, homed: false },
    bowl: { x: 0, y: 0, tx: 0, ty: 0, angle: 0, grab: false, homed: false },
    mix: { cover: 0, grid: new Uint8Array(GRID * GRID), hit: 0, total: 0, morph: 0, done: false },
    egg: { spread: 0, gather: 0, seed: 1.7, pouring: false, poured: false },
    omelet: { place: 'none', u: 0, v: OM_V, wobT: 99, wobA: 0, cut: 0, open: 0, tororo: 0, ridge: false, fly: 0 },
    pan: { tilt: 0, prog: 0 },
    panAlpha: 1,
    draw: { strokes: [], cur: null },
    cutTrail: [],
    sparkles: [],
    hold: { active: false, t: 0, x: 0, y: 0 },
    next: null,
    pressed: null,
  };
  buildGrid(G);
  applyVariant(G, 0);
  return G;
}

function buildGrid(G) {
  let total = 0;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const u = ((i + 0.5) / GRID) * 2 - 1;
      const v = ((j + 0.5) / GRID) * 2 - 1;
      if (moundRadius(u, v) <= 1) total++;
    }
  }
  G.mix.total = total;
}

export function applyVariant(G, id) {
  G.variantId = ((id % VARIANTS.length) + VARIANTS.length) % VARIANTS.length;
  G.variant = VARIANTS[G.variantId];
  G.assets.rice = bakeRice(G.variant);
  G.assets.mixed = bakeMixedRice(G.variant);
}

export function resetGame(G, variantId = G.variantId) {
  applyVariant(G, variantId);
  G.state = S.KETCHUP;
  G.st = 0;
  G.ketchup.strokes.length = 0;
  G.ketchup.cur = null;
  G.ketchup.amount = 0;
  G.ketchup.full = false;
  G.mix.grid.fill(0);
  G.mix.hit = 0;
  G.mix.cover = 0;
  G.mix.morph = 0;
  G.mix.done = false;
  const c = G.assets.mixLayer.getContext('2d');
  c.clearRect(0, 0, G.assets.mixLayer.width, G.assets.mixLayer.height);
  G.egg.spread = 0;
  G.egg.gather = 0;
  G.egg.pouring = false;
  G.egg.poured = false;
  G.egg.seed = 1 + Math.random() * 9;
  Object.assign(G.omelet, { place: 'none', u: 0, v: OM_V, wobT: 99, wobA: 0, cut: 0, open: 0, tororo: 0, ridge: false, fly: 0 });
  G.pan.tilt = 0;
  G.pan.prog = 0;
  G.panAlpha = 1;
  G.draw.strokes.length = 0;
  G.draw.cur = null;
  G.cutTrail.length = 0;
  G.sparkles.length = 0;
  G.bottle.grab = G.spatula.grab = G.bowl.grab = false;
  G.bottle.angle = G.spatula.angle = G.bowl.angle = 0;
  G.hold.active = false;
  G.pressed = null;
  G.next = null;
}

function setState(G, s) {
  G.state = s;
  G.st = 0;
  G.next = null;
}

// 画面サイズが変わったら道具だけ定位置に戻す（皿の中身は正規化保持なので無傷）
export function onLayout(G, L) {
  if (!G.bottle.grab) { const h = bottleHome(G, L); G.bottle.x = h.x; G.bottle.y = h.y; G.bottle.homed = true; }
  if (!G.spatula.grab) { const h = L.tools.spatula; G.spatula.x = h.x; G.spatula.y = h.y; G.spatula.homed = true; }
  if (!G.bowl.grab) { const h = L.tools.bowl; G.bowl.x = h.x; G.bowl.y = h.y; G.bowl.homed = true; }
}

export function bottleHome(G, L) {
  return (G.state === S.DRAW || G.state === S.MENU) ? L.bottleDraw : L.tools.bottle;
}

// ---------- 更新 ----------
export function update(G, L, dt) {
  G.time += dt;
  G.st += dt;
  if (G.hold.active) G.hold.t += dt;

  // 道具のやわらかい追従／戻り
  const bh = bottleHome(G, L);
  spring(G.bottle, G.bottle.grab ? G.bottle.tx : bh.x, G.bottle.grab ? G.bottle.ty : bh.y, dt, G.bottle.grab ? 22 : 9);
  if (G.state !== S.MIX) spring(G.spatula, G.spatula.grab ? G.spatula.tx : L.tools.spatula.x, G.spatula.grab ? G.spatula.ty : L.tools.spatula.y, dt, G.spatula.grab ? 24 : 9);
  const bowlTarget = G.bowl.grab ? { x: G.bowl.tx, y: G.bowl.ty } : (G.egg.pouring ? panPour(L) : L.tools.bowl);
  spring(G.bowl, bowlTarget.x, bowlTarget.y, dt, G.bowl.grab ? 22 : 8);

  for (let i = G.sparkles.length - 1; i >= 0; i--) {
    const s = G.sparkles[i];
    s.t += dt;
    if (s.t > s.life) G.sparkles.splice(i, 1);
  }

  switch (G.state) {
    case S.KETCHUP: updKetchup(G, L, dt); break;
    case S.MIX: updMix(G, L, dt); break;
    case S.POUR: updPour(G, L, dt); break;
    case S.GATHER: updGather(G, L, dt); break;
    case S.SLIDE: updSlide(G, L, dt); break;
    case S.CUT: updCut(G, L, dt); break;
    case S.OPEN: updOpen(G, L, dt); break;
    case S.DRAW:
    case S.MENU: updDraw(G, L, dt); break;
  }

  if (G.omelet.wobT < 9) G.omelet.wobT += dt;

  // 料理が皿へ移ったらフライパンは静かに退場する
  const late = G.state === S.CUT || G.state === S.OPEN || G.state === S.DRAW || G.state === S.MENU;
  G.panAlpha = lerp(G.panAlpha, late ? 0 : 1, 1 - Math.exp(-4 * dt));

  if (G.next) {
    G.next.t -= dt;
    if (G.next.t <= 0) { const f = G.next.fn; G.next = null; f(); }
  }
}

function later(G, sec, fn) { G.next = { t: sec, fn }; }

function spring(o, tx, ty, dt, k) {
  const a = 1 - Math.exp(-k * dt);
  o.x = lerp(o.x, tx, a);
  o.y = lerp(o.y, ty, a);
}

function panPour(L) { return { x: L.pan.cx - L.pan.r * 0.22, y: L.pan.cy - L.pan.ry * 1.25 }; }

// ---------- 1. ケチャップ ----------
function updKetchup(G, L, dt) {
  const P = L.plate;
  const b = G.bottle;
  const dx = P.cx - b.x, dy = P.cy - b.y;
  const d = Math.hypot(dx, dy);
  const near = clamp(1 - (d - P.r * 0.4) / (P.r * 1.3), 0, 1);
  let want = 0;
  if (b.grab) {
    const a = Math.atan2(dy, dx) - Math.PI / 2;
    want = clamp(norm(a), -1.15, 1.15) * near;   // 皿へ近づくと自動で傾く
  }
  b.angle = lerp(b.angle, want, 1 - Math.exp(-10 * dt));
  b.flow = lerp(b.flow, b.grab && near > 0.5 ? 1 : 0, 1 - Math.exp(-12 * dt));

  if (G.ketchup.full && !G.next) later(G, 0.45, () => setState(G, S.MIX));
}

function squirt(G, L, x, y) {
  const P = L.plate;
  let p = toLocal(P, x, y);
  const m = moundRadius(p.u, p.v);
  if (m > 1.45) { G.ketchup.cur = null; return; }
  if (m > 0.92) { const k = 0.92 / m; p = { u: p.u * k, v: MOUND.cv + (p.v - MOUND.cv) * k }; }
  const k = G.ketchup;
  if (!k.cur) { k.cur = { pts: [], w: 0.085 }; k.strokes.push(k.cur); }
  const last = k.cur.pts[k.cur.pts.length - 1];
  const step = last ? Math.hypot(p.u - last.u, p.v - last.v) : 0;
  if (!last || step > 0.035) {
    k.cur.pts.push({ u: p.u, v: p.v });
    k.amount += last ? step * 1.15 : 0.10;
    sfx.squirt();
  } else {
    k.amount += 0.008;   // 長押しでも溜まる
  }
  if (k.amount >= k.need && !k.full) {
    k.full = true;
    G.bottle.grab = false;
    k.cur = null;
    burst(G, x, y, 10, L.unit * 0.07, L.unit * 0.020);
    sfx.ding();
  }
}

// ---------- 2. 混ぜる ----------
function updMix(G, L, dt) {
  const s = G.spatula;
  const P = L.plate;
  if (!s.grab) {
    const a = -Math.PI * 0.22;
    const bob = Math.abs(Math.sin(G.time * 3.4)) * P.ry * 0.18;
    const tx = P.cx + Math.cos(a) * P.r * 1.04;
    const ty = P.cy + Math.sin(a) * P.ry * 1.06 - bob;
    spring(s, tx, ty, dt, 10);
    s.angle = lerp(s.angle, -0.5 + Math.sin(G.time * 3.4) * 0.24, 1 - Math.exp(-8 * dt));
  } else {
    spring(s, s.tx, s.ty, dt, 24);
    s.angle = lerp(s.angle, 0.35 + Math.sin(G.time * 12) * 0.14, 1 - Math.exp(-10 * dt));
  }
  if (G.mix.done) {
    G.mix.morph = clamp(G.mix.morph + dt / 0.75, 0, 1);
    if (G.mix.morph >= 1 && !G.next) later(G, 0.4, () => setState(G, S.POUR));
  }
}

function rub(G, L, x, y) {
  if (G.mix.done) return;
  const P = L.plate;
  const p = toLocal(P, x, y);
  if (Math.hypot(p.u, p.v) > 1.25) return;
  // ご飯の山からはみ出しても、山の上へやわらかく吸着する
  const m = moundRadius(p.u, p.v);
  const k = m > 0.94 ? 0.94 / m : 1;
  const u = p.u * k, v = MOUND.cv + (p.v - MOUND.cv) * k;
  paintMix(G.assets.mixLayer, u, v, 0.26, G.variant);
  markGrid(G, u, v, 0.22);
  sfx.rub();
  if (G.mix.cover >= 0.8 && !G.mix.done) {
    G.mix.done = true;
    G.spatula.grab = false;
    burst(G, P.cx, P.cy, 14, L.unit * 0.11, L.unit * 0.022);
    sfx.ding();
  }
}

function markGrid(G, u, v, r) {
  const g = G.mix.grid;
  for (let j = 0; j < GRID; j++) {
    const cv = ((j + 0.5) / GRID) * 2 - 1;
    if (Math.abs(cv - v) > r) continue;
    for (let i = 0; i < GRID; i++) {
      const cu = ((i + 0.5) / GRID) * 2 - 1;
      if (moundRadius(cu, cv) > 1) continue;
      const idx = j * GRID + i;
      if (g[idx]) continue;
      if (Math.hypot(cu - u, cv - v) <= r) { g[idx] = 1; G.mix.hit++; }
    }
  }
  G.mix.cover = G.mix.total ? G.mix.hit / G.mix.total : 0;
}

// ---------- 3. 卵を注ぐ ----------
function updPour(G, L, dt) {
  const b = G.bowl;
  const F = L.pan;
  const over = Math.hypot(b.x - F.cx, b.y - F.cy) < F.r * 1.15;
  if (!G.egg.poured && ((b.grab && over) || G.egg.pouring)) {
    if (G.egg.spread === 0) sfx.pour();
    G.egg.pouring = true;
    G.egg.spread = clamp(G.egg.spread + dt / 1.1, 0, 1);
    b.angle = lerp(b.angle, tiltToward(b, F), 1 - Math.exp(-9 * dt));
    if (G.egg.spread >= 1) {
      G.egg.poured = true;
      G.egg.pouring = false;
      b.grab = false;
    }
  } else if (!G.egg.poured) {
    // ボウルがフライパン脇で揺れて誘う
    b.angle = lerp(b.angle, b.grab ? 0.12 : Math.sin(G.time * 3.0) * 0.20, 1 - Math.exp(-8 * dt));
  } else {
    b.angle = lerp(b.angle, 0, 1 - Math.exp(-8 * dt));
    if (!G.next) later(G, 0.6, () => setState(G, S.GATHER));
  }
}

function tiltToward(b, F) {
  const a = Math.atan2(F.cy - b.y, F.cx - b.x) + Math.PI / 2;
  return clamp(norm(a), -1.3, 1.3) * 0.9;
}

// ---------- 4. 寄せる ----------
function updGather(G, L) {
  if (G.egg.gather >= 1 && G.omelet.place === 'none') {
    G.omelet.place = 'pan';
    G.omelet.wobT = 0;
    G.omelet.wobA = 0.11;
    burst(G, L.pan.cx, L.pan.cy, 10, L.unit * 0.09, L.unit * 0.020);
    sfx.ding();
    later(G, 1.0, () => setState(G, S.SLIDE));
  }
}

function gatherSwipe(G, L, p) {
  if (G.egg.gather >= 1) return;
  const F = L.pan;
  const px = p.x - p.dx, py = p.y - p.dy;
  if (Math.hypot(px - F.cx, py - F.cy) > F.r * 1.45) return;
  let cx = F.cx - px, cy = F.cy - py;
  const cl = Math.hypot(cx, cy) || 1;
  cx /= cl; cy /= cl;
  const inward = p.dx * cx + p.dy * cy;
  if (inward <= 0) return;
  const before = G.egg.gather;
  G.egg.gather = clamp(G.egg.gather + inward / (F.r * 1.8), 0, 1);
  if (Math.floor(before * 3) !== Math.floor(G.egg.gather * 3)) sfx.gather();
}

// ---------- 5. スライド ----------
function updSlide(G, L, dt) {
  if (G.omelet.place === 'pan') {
    if (!G.hold.active && G.pan.prog < 1) G.pan.prog = Math.max(0, G.pan.prog - dt * 1.1);
    if (G.hold.active && G.pan.prog < 1) {
      const F = L.pan;
      if (Math.hypot(G.hold.x - F.cx, G.hold.y - F.cy) < F.r * 1.6 && G.hold.t > 0.35) {
        G.pan.prog = clamp(G.pan.prog + dt * 0.9, 0, 1);   // 長押しでも傾く
      }
    }
    G.pan.tilt = lerp(G.pan.tilt, G.pan.prog, 1 - Math.exp(-11 * dt));
    if (G.pan.prog >= 1) {
      G.omelet.place = 'fly';
      G.omelet.fly = 0;
      G.hold.active = false;
    }
  } else if (G.omelet.place === 'fly') {
    G.pan.tilt = lerp(G.pan.tilt, 1, 1 - Math.exp(-11 * dt));
    G.omelet.fly = clamp(G.omelet.fly + dt / 0.55, 0, 1);
    if (G.omelet.fly >= 1) {
      G.omelet.place = 'plate';
      G.omelet.u = 0;
      G.omelet.v = OM_V;
      G.omelet.wobT = 0;
      G.omelet.wobA = 0.18;   // 着地でぷるん
      sfx.land();
      burst(G, L.plate.cx, L.plate.cy, 12, L.unit * 0.11, L.unit * 0.020);
      later(G, 1.15, () => { setState(G, S.CUT); G.omelet.ridge = true; });
    }
  } else {
    G.pan.tilt = lerp(G.pan.tilt, 0, 1 - Math.exp(-6 * dt));
  }
}

// ---------- 6. 切る ----------
function updCut(G, L, dt) {
  if (G.omelet.cut > 0) {
    G.omelet.ridge = false;
    G.omelet.cut = clamp(G.omelet.cut + dt / 0.2, 0, 1);
    if (G.omelet.cut >= 1) setState(G, S.OPEN);
  } else {
    G.omelet.ridge = true;
  }
}

function tryCut(G, L) {
  if (G.omelet.cut > 0) return;
  const tr = G.cutTrail;
  if (tr.length < 2) return;
  const o = omeletScreen(G, L);
  let far = 0, near = false;
  for (let i = 0; i < tr.length; i++) {
    for (let j = i + 1; j < tr.length; j++) {
      const d = Math.hypot(tr[j].x - tr[i].x, tr[j].y - tr[i].y);
      if (d > far) far = d;
    }
    const dx = (tr[i].x - o.x) / (o.rx * 1.5), dy = (tr[i].y - o.y) / (o.ry * 1.9);
    if (dx * dx + dy * dy <= 1) near = true;
  }
  if (near && far >= o.rx * 1.1) {
    G.omelet.cut = 0.01;   // 稜線へ吸着して切れる（精度不要）
    G.omelet.ridge = false;
    G.cutTrail.length = 0;
    sfx.cut();
  }
}

// ---------- 7. 間 → パカッ → トロッ ----------
function updOpen(G, L, dt) {
  const t = G.st;
  G.omelet.cut = 1;
  G.omelet.open = clamp((t - 0.30) / 0.30, 0, 1);
  // 皮が開ききる少し前からとろとろが顔を出す
  G.omelet.tororo = clamp((t - 0.48) / 0.52, 0, 1);
  if (t > 0.30 && t - dt <= 0.30) {
    sfx.paka();
    // 料理を隠さないよう、外周に小さくきらめかせる
    burst(G, L.plate.cx, L.plate.cy, 12, L.unit * 0.13, L.unit * 0.020);
  }
  if (t >= 1.25) setState(G, S.DRAW);
}

// ---------- 8/9. 描く ----------
function updDraw(G, L, dt) {
  G.bottle.angle = lerp(G.bottle.angle, Math.sin(G.time * 2.2) * 0.12, 1 - Math.exp(-6 * dt));
  G.omelet.open = 1;
  G.omelet.tororo = 1;
}

function drawPoint(G, L, x, y) {
  const P = L.plate;
  let p = toLocal(P, x, y);
  const rr = Math.hypot(p.u, p.v);
  if (rr > 0.97) { const k = 0.97 / rr; p = { u: p.u * k, v: p.v * k }; }  // 皿の外は縁へ吸着
  const d = G.draw;
  if (!d.cur) { d.cur = { pts: [], w: 0.072 }; d.strokes.push(d.cur); }
  const last = d.cur.pts[d.cur.pts.length - 1];
  if (!last || Math.hypot(p.u - last.u, p.v - last.v) > 0.018) {
    d.cur.pts.push({ u: p.u, v: p.v });
    sfx.draw();
  }
}

// ---------- 入力 ----------
export function pointerDown(G, L, p) {
  unlock();
  G.hold.active = true;
  G.hold.t = 0;
  G.hold.x = p.x;
  G.hold.y = p.y;

  if (G.state === S.DRAW || G.state === S.MENU) {
    const b = hitButton(L, p.x, p.y);
    if (b) { G.pressed = b.id; return; }
    G.draw.cur = null;
    drawPoint(G, L, p.x, p.y);
    return;
  }
  switch (G.state) {
    case S.KETCHUP: {
      if (G.ketchup.full) return;
      G.bottle.grab = true;
      G.bottle.tx = p.x;
      G.bottle.ty = p.y - L.toolR * 0.6;
      break;
    }
    case S.MIX: {
      if (G.mix.done) return;
      G.spatula.grab = true;
      G.spatula.tx = p.x;
      G.spatula.ty = p.y;
      rub(G, L, p.x, p.y);
      break;
    }
    case S.POUR: {
      if (G.egg.poured) return;
      const b = G.bowl;
      if (Math.hypot(p.x - b.x, p.y - b.y) < L.toolR * 2.4) {
        b.grab = true; b.tx = p.x; b.ty = p.y;
      } else {
        G.egg.pouring = true;   // どこを触っても注ぎに向かう
      }
      break;
    }
    case S.CUT: {
      G.cutTrail.length = 0;
      G.cutTrail.push({ x: p.x, y: p.y });
      break;
    }
    default: break;
  }
}

export function pointerMove(G, L, p) {
  G.hold.x = p.x;
  G.hold.y = p.y;
  if (G.state === S.DRAW || G.state === S.MENU) {
    if (G.pressed) return;
    drawPoint(G, L, p.x, p.y);
    return;
  }
  switch (G.state) {
    case S.KETCHUP: {
      if (!G.bottle.grab) break;
      G.bottle.tx = p.x;
      G.bottle.ty = p.y - L.toolR * 0.6;
      const P = L.plate;
      // ノズルは指の少し先（指の影に隠れない位置）。皿から外れたら指の位置へ吸着。
      const nz = { x: G.bottle.tx, y: G.bottle.ty + L.toolR * 1.7 };
      const a = toLocal(P, nz.x, nz.y);
      if (moundRadius(a.u, a.v) < 1.35) squirt(G, L, nz.x, nz.y);
      else {
        const b = toLocal(P, p.x, p.y);
        if (moundRadius(b.u, b.v) < 1.35) squirt(G, L, p.x, p.y);
        else G.ketchup.cur = null;
      }
      break;
    }
    case S.MIX: {
      if (!G.spatula.grab) break;
      G.spatula.tx = p.x;
      G.spatula.ty = p.y;
      rub(G, L, p.x, p.y);
      break;
    }
    case S.POUR: {
      if (G.bowl.grab) { G.bowl.tx = p.x; G.bowl.ty = p.y; }
      break;
    }
    case S.GATHER: {
      gatherSwipe(G, L, p);
      break;
    }
    case S.SLIDE: {
      if (G.pan.prog >= 1 || G.omelet.place !== 'pan') break;
      const F = L.pan, P = L.plate;
      let tx = P.cx - F.cx, ty = P.cy - F.cy;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const along = p.dx * tx + p.dy * ty;
      const k = along > 0 ? 1 : 0.25;   // 誤方向はやわらかく戻る
      G.pan.prog = clamp(G.pan.prog + (along * k) / (L.unit * 0.30), 0, 1);
      break;
    }
    case S.CUT: {
      if (G.omelet.cut > 0) break;
      const tr = G.cutTrail;
      const last = tr[tr.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 4) tr.push({ x: p.x, y: p.y });
      if (tr.length > 60) tr.shift();
      tryCut(G, L);
      break;
    }
    default: break;
  }
}

export function pointerUp(G, L) {
  G.hold.active = false;
  if (G.state === S.DRAW || G.state === S.MENU) {
    if (G.pressed) {
      const id = G.pressed;
      G.pressed = null;
      pressButton(G, L, id);
      return;
    }
    G.draw.cur = null;
    if (G.draw.strokes.length > 0 && G.state === S.DRAW) { G.state = S.MENU; G.st = 0; }
    return;
  }
  G.bottle.grab = false;
  G.spatula.grab = false;
  G.bowl.grab = false;
  G.ketchup.cur = null;
  if (G.state === S.CUT) G.cutTrail.length = 0;
}

export function pressButton(G, L, id) {
  if (id === 'again') resetGame(G, G.variantId);
  else if (id === 'variant') resetGame(G, G.variantId + 1);
  else if (id === 'redraw') { G.draw.strokes.length = 0; G.draw.cur = null; G.state = S.DRAW; G.st = 0; }
  sfx.ding();
  onLayout(G, L);
}

export function hitButton(L, x, y) {
  for (const b of L.buttons) {
    if (Math.hypot(x - b.x, y - b.y) <= b.r * 1.35) return b;
  }
  return null;
}

// ---------- 補助 ----------
export function omeletScreen(G, L) {
  const P = L.plate, F = L.pan;
  const o = G.omelet;
  const wob = o.wobT < 4 ? springWobble(o.wobT, 13, 3.0) * o.wobA : Math.sin(G.time * 1.9) * 0.014;
  if (o.place === 'pan') {
    return { x: F.cx, y: F.cy, rx: F.r * 0.58, ry: F.ry * 0.54, rot: 0, wob };
  }
  if (o.place === 'fly') {
    const t = easeInOut(o.fly);
    const a = toScreen(F, 0, 0), b = toScreen(P, 0, OM_V);
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t) - Math.sin(t * Math.PI) * L.unit * 0.05,
      rx: lerp(F.r * 0.58, P.r * OM_RX, t),
      ry: lerp(F.ry * 0.54, P.ry * OM_RY, t),
      rot: 0,
      wob: Math.sin(o.fly * 9) * 0.05,
    };
  }
  const c = toScreen(P, o.u, o.v);
  return { x: c.x, y: c.y, rx: P.r * OM_RX, ry: P.ry * OM_RY, rot: 0, wob };
}

export function burst(G, x, y, n, r, size = r) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + Math.random();
    const d = r * (0.6 + Math.random() * 1.6);
    G.sparkles.push({
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d * 0.7,
      r: size * (0.4 + Math.random() * 0.6),
      t: 0,
      life: 0.5 + Math.random() * 0.4,
    });
  }
}
