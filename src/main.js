// 起動・リサイズ・メインループ
import { computeLayout } from './layout.js';
import { attachInput } from './input.js';
import { createGame, update, pointerDown, pointerMove, pointerUp, onLayout, omeletScreen, resetGame, S } from './state.js';
import { render } from './render/scene.js';
import { invalidateTable } from './render/table.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });

const G = createGame();
let L = null;
let cssW = 0, cssH = 0, dpr = 1;

function viewportSize() {
  const vv = window.visualViewport;
  const w = Math.max(1, Math.round(vv ? vv.width : document.documentElement.clientWidth || window.innerWidth));
  const h = Math.max(1, Math.round(vv ? vv.height : document.documentElement.clientHeight || window.innerHeight));
  return { w, h };
}

function resize() {
  const { w, h } = viewportSize();
  const d = Math.min(2, window.devicePixelRatio || 1);   // DPR 上限2
  if (w === cssW && h === cssH && d === dpr) return;
  cssW = w; cssH = h; dpr = d;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  invalidateTable();
  // 状態はそのまま、座標系だけ作り直す
  L = computeLayout(w, h);
  onLayout(G, L);
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 60));
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resize);
  window.visualViewport.addEventListener('scroll', resize);
}
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

attachInput(canvas, {
  down: (p) => { resize(); pointerDown(G, L, p); },
  move: (p) => pointerMove(G, L, p),
  up: (p) => pointerUp(G, L, p),
});

resize();

let prev = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.0001, (now - prev) / 1000));
  prev = now;
  resize();
  update(G, L, dt);
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render(ctx, G, L);
  ctx.restore();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- テスト用フック（ゲーム本体の挙動には影響しない） ----
const api = {
  get state() { return G.state; },
  get variant() { return G.variantId; },
  states: S,
  geom() {
    const o = omeletScreen(G, L);
    return {
      w: L.w, h: L.h, portrait: L.portrait, unit: L.unit,
      plate: { x: L.plate.cx, y: L.plate.cy, r: L.plate.r, ry: L.plate.ry },
      pan: { x: L.pan.cx, y: L.pan.cy, r: L.pan.r, ry: L.pan.ry },
      tools: L.tools,
      toolR: L.toolR,
      buttons: L.buttons.map((b) => ({ id: b.id, x: b.x, y: b.y, r: b.r })),
      omelet: { x: o.x, y: o.y, rx: o.rx, ry: o.ry, place: G.omelet.place },
    };
  },
  progress() {
    return {
      ketchup: G.ketchup.amount / G.ketchup.need,
      strokes: G.ketchup.strokes.length,
      cover: G.mix.cover,
      morph: G.mix.morph,
      spread: G.egg.spread,
      gather: G.egg.gather,
      panProg: G.pan.prog,
      cut: G.omelet.cut,
      open: G.omelet.open,
      tororo: G.omelet.tororo,
      drawStrokes: G.draw.strokes.length,
      drawPoints: G.draw.strokes.reduce((a, s) => a + s.pts.length, 0),
    };
  },
  // 操作対象の画面座標
  hit(name) {
    const g = api.geom();
    switch (name) {
      case 'bottle': return { x: G.bottle.x, y: G.bottle.y };
      case 'spatula': return { x: G.spatula.x, y: G.spatula.y };
      case 'bowl': return { x: G.bowl.x, y: G.bowl.y };
      case 'plate': return { x: g.plate.x, y: g.plate.y };
      case 'pan': return { x: g.pan.x, y: g.pan.y };
      case 'omelet': return { x: g.omelet.x, y: g.omelet.y };
      case 'again':
      case 'variant':
      case 'redraw': {
        const b = g.buttons.find((q) => q.id === name);
        return { x: b.x, y: b.y };
      }
      default: return { x: g.plate.x, y: g.plate.y };
    }
  },
  // 皿ローカル正規化 → 画面座標（回転テストで使う）
  plateAt(u, v) { return { x: L.plate.cx + u * L.plate.r, y: L.plate.cy + v * L.plate.ry }; },
  reset(v) { resetGame(G, v == null ? G.variantId : v); onLayout(G, L); },
};
window.__game = api;
