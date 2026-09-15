/**
 * Scene props, drawn once with Canvas2D and uploaded as textures.
 *
 * Nothing here is ever redrawn per frame: the ball pit ring, the balls and the
 * confetti dots each become a single texture at boot, and the scenes only move
 * pooled Sprites around. That keeps the hot loop allocation-free.
 */
import { Texture } from 'pixi.js';
import { BALLS, CONFETTI, LINE, PIT_FILL, PIT_RIM, SHADOW, SHADOW_ALPHA, hexToCss } from './palette';
import { crayonEllipsePath, seededRandom, strokeStyle, softShadow } from './crayon';
import type { Ctx2D } from './crayon';

/** Texture pixel size of the pit sprite (drawn square, used as an ellipse). */
export const PIT_SIZE = 512;
/** Texture pixel size of one ball. */
export const BALL_SIZE = 64;
/** Texture pixel size of one confetti dot. */
export const CONFETTI_SIZE = 24;

/**
 * The ball pit: a pale basin with a fat, twice-gone-over crayon rim.
 * Drawn as a flattened ellipse so it reads as a round pit seen from
 * three-quarters above, exactly like the rest of the art.
 */
export function drawPit(ctx: Ctx2D): void {
  const s = PIT_SIZE;
  const cx = s / 2;
  const cy = s / 2;
  const rx = s * 0.46;
  const ry = s * 0.33;
  ctx.clearRect(0, 0, s, s);

  // Soft blue-grey ground shadow under the near rim (never a hard shadow).
  softShadow(ctx, cx, cy + ry * 0.36, rx * 0.98, ry * 0.5, SHADOW, SHADOW_ALPHA * 0.8);

  // Basin fill.
  crayonEllipsePath(ctx, cx, cy, rx, ry, { rng: seededRandom(21), wobble: 5 });
  ctx.fillStyle = hexToCss(PIT_FILL);
  ctx.fill();

  // A lighter inner ellipse suggests depth without any hard edge.
  crayonEllipsePath(ctx, cx, cy + ry * 0.1, rx * 0.8, ry * 0.72, {
    rng: seededRandom(33),
    wobble: 4,
  });
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fill();

  // The rim: a warm crayon ring, gone over twice like a child would.
  for (let i = 0; i < 2; i++) {
    const rng = seededRandom(51 + i * 17);
    ctx.save();
    ctx.globalAlpha = i === 0 ? 0.95 : 0.55;
    crayonEllipsePath(ctx, cx, cy, rx - i * 3, ry - i * 2.5, { rng, wobble: 6 });
    strokeStyle(ctx, { color: i === 0 ? PIT_RIM : LINE, width: i === 0 ? 14 : 6 });
    ctx.stroke();
    ctx.restore();
  }
}

/** One pastel ball: flat pastel fill, crayon outline, a soft highlight. */
export function drawBall(ctx: Ctx2D, color: number, seed: number): void {
  const s = BALL_SIZE;
  const c = s / 2;
  const r = s * 0.42;
  ctx.clearRect(0, 0, s, s);
  const rng = seededRandom(seed);
  crayonEllipsePath(ctx, c, c, r, r * 0.97, { rng, wobble: 1.6 });
  ctx.fillStyle = hexToCss(color);
  ctx.fill();
  strokeStyle(ctx, { color: LINE, width: 3.4 });
  ctx.stroke();
  // Highlight: a little white crescent, up and to the left.
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.ellipse(c - r * 0.3, c - r * 0.34, r * 0.28, r * 0.2, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

/** A confetti speck: a tiny soft-edged pastel dot, no outline. */
export function drawConfetti(ctx: Ctx2D, color: number): void {
  const s = CONFETTI_SIZE;
  const c = s / 2;
  ctx.clearRect(0, 0, s, s);
  ctx.beginPath();
  ctx.ellipse(c, c, c * 0.72, c * 0.58, 0.4, 0, Math.PI * 2);
  ctx.fillStyle = hexToCss(color);
  ctx.fill();
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.ellipse(c, c, c * 0.92, c * 0.78, 0.4, 0, Math.PI * 2);
  ctx.strokeStyle = hexToCss(color);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

export interface PropTextures {
  pit: Texture;
  /** One texture per pastel ball colour (index matches `BALLS`). */
  balls: Texture[];
  /** One texture per confetti colour (index matches `CONFETTI`). */
  confetti: Texture[];
}

function canvasTexture(w: number, h: number, draw: (ctx: Ctx2D) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas2d unavailable');
  draw(ctx);
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'linear';
  return tex;
}

/** Builds every prop texture once. Browser only. */
export function buildProps(): PropTextures {
  return {
    pit: canvasTexture(PIT_SIZE, PIT_SIZE, drawPit),
    balls: BALLS.map((c, i) => canvasTexture(BALL_SIZE, BALL_SIZE, (ctx) => drawBall(ctx, c, 7 + i * 13))),
    confetti: CONFETTI.map((c) =>
      canvasTexture(CONFETTI_SIZE, CONFETTI_SIZE, (ctx) => drawConfetti(ctx, c)),
    ),
  };
}
