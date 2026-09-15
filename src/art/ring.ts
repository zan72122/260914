/**
 * The crayon ring that blooms under every finger.
 *
 * It is the one piece of feedback that must ALWAYS be visible, on a cream
 * paper background, on a phone held at arm's length by a 4-year-old. So it is
 * drawn in warm peach-pink (not the dark brown line colour), with thicker
 * strokes and a soft pastel halo behind it, then expanded and faded at runtime.
 */
import { Texture } from 'pixi.js';
import { FINGER_RING } from './palette';
import { crayonEllipsePath, seededRandom, strokeStyle } from './crayon';
import { hexToCss } from './palette';

export const RING_SIZE = 160;

/** Draws the ring art into a 2d context (pure Canvas2D, testable). */
export function drawRing(ctx: CanvasRenderingContext2D): void {
  const c = RING_SIZE / 2;
  ctx.clearRect(0, 0, RING_SIZE, RING_SIZE);

  // A soft pastel halo so the ring reads even over a busy crowd.
  const halo = ctx.createRadialGradient(c, c, c * 0.35, c, c, c * 0.92);
  halo.addColorStop(0, 'rgba(255,143,163,0)');
  halo.addColorStop(0.72, 'rgba(255,143,163,0.22)');
  halo.addColorStop(1, 'rgba(255,143,163,0)');
  ctx.save();
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, RING_SIZE, RING_SIZE);
  ctx.restore();

  // Three slightly offset wobbly circles: reads as a crayon scribble ring.
  // ~3px thicker than the Phase 0 ring and in peach instead of brown.
  for (let i = 0; i < 3; i++) {
    const rng = seededRandom(11 + i * 31);
    ctx.save();
    ctx.globalAlpha = 0.95 - i * 0.2;
    crayonEllipsePath(ctx, c, c, c - 14 - i * 3, c - 14 - i * 3, { rng, wobble: 3.4 });
    strokeStyle(ctx, { color: FINGER_RING, width: 8 - i * 1.5 });
    ctx.stroke();
    ctx.restore();
  }

  // A lighter inner scribble adds the waxy, twice-gone-over crayon look.
  const rng = seededRandom(97);
  ctx.save();
  ctx.globalAlpha = 0.5;
  crayonEllipsePath(ctx, c, c, c - 26, c - 26, { rng, wobble: 4.5 });
  ctx.strokeStyle = hexToCss(0xffc2cd);
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

export function buildRingTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = RING_SIZE;
  canvas.height = RING_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas2d unavailable');
  drawRing(ctx);
  return Texture.from(canvas);
}
