// main.js — 起動・リサイズ・メインループ
import { Game } from './state.js';
import { computeLayout } from './layout.js';
import { attachInput } from './input.js';
import { drawBackground } from './render/background.js';
import { drawBoard, Marks } from './render/board.js';
import { drawSpindle } from './render/spindle.js';
import { drawBow, drawStringBack, drawStringFront } from './render/bow.js';
import { drawNest } from './render/nest.js';
import { drawCharacter } from './render/character.js';
import { drawParticles, drawEmber, drawFlame } from './render/effects.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });
const game = new Game();
const marks = new Marks();
let L = computeLayout(window.innerWidth, window.innerHeight);

function viewport() {
  const vv = window.visualViewport;
  const w = Math.max(1, Math.round(vv ? vv.width : window.innerWidth));
  const h = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));
  return { w, h };
}

function resize() {
  const { w, h } = viewport();
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // 2 で頭打ち（性能のため）
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 途中経過を失わずに構図だけ組み替える
  L = computeLayout(w, h);
  marks.ensure(w, h);
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resize);
  window.visualViewport.addEventListener('scroll', resize);
}
resize();

attachInput(canvas, game, () => L);

function render() {
  drawBackground(ctx, L, game);
  drawCharacter(ctx, L, game, 'back');
  drawBoard(ctx, L, game, marks);
  drawNest(ctx, L, game);
  drawStringBack(ctx, L, game);   // 弦はきり棒のうしろを通り…
  drawSpindle(ctx, L, game);
  drawStringFront(ctx, L, game);  // …手前で巻きついてから弓へもどる
  drawCharacter(ctx, L, game, 'front');
  drawParticles(ctx, L, game, ['dust', 'smoke']);
  drawEmber(ctx, L, game);
  drawFlame(ctx, L, game);
  drawParticles(ctx, L, game, ['breath', 'spark']);
  drawBow(ctx, L, game);

  if (game.fade > 0) {
    ctx.globalAlpha = game.fade;
    ctx.fillStyle = '#ffe3b0';
    ctx.fillRect(0, 0, L.w, L.h);
    ctx.globalAlpha = 1;
  }
}

const STEP = 1 / 60;
let acc = 0;
let last = performance.now();

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;          // タブ復帰などで飛ばない
  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard++ < 5) {
    game.update(STEP, L);
    acc -= STEP;
  }
  if (game.markReset) { marks.clear(); game.markReset = false; }
  marks.consume(game.markQueue);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// テスト用の読み取り専用フック（画面には何も出さない）
const dbg = {};
Object.defineProperties(dbg, {
  phase: { get: () => game.phase, enumerable: true },
  progress: { get: () => game.progress, enumerable: true },
  strokeCount: { get: () => game.strokeCount, enumerable: true },
  layout: {
    get: () => ({
      mode: L.mode, w: L.w, h: L.h,
      bowY: L.bow.cy, bowX: L.bow.cx, travel: L.bow.travel,
      nest: { x: L.nest.x, y: L.nest.y, r: L.nest.r },
      friction: { x: L.friction.x, y: L.friction.y },
    }),
    enumerable: true,
  },
});
window.__game = dbg;
