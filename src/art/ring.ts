/** The soft crayon ring that blooms under every finger. */
import { Texture } from 'pixi.js';
import { LINE } from './palette';
import { crayonEllipsePath, seededRandom, strokeStyle } from './crayon';

export const RING_SIZE = 128;

/** Draws the ring art into a 2d context (pure Canvas2D, testable). */
export function drawRing(ctx: CanvasRenderingContext2D): void {
  const c = RING_SIZE / 2;
  ctx.clearRect(0, 0, RING_SIZE, RING_SIZE);
  // Three slightly offset wobbly circles: reads as a crayon scribble ring.
  for (let i = 0; i < 3; i++) {
    const rng = seededRandom(11 + i * 31);
    ctx.save();
    ctx.globalAlpha = 0.55 - i * 0.12;
    crayonEllipsePath(ctx, c, c, c - 10 - i * 2, c - 10 - i * 2, { rng, wobble: 3 });
    strokeStyle(ctx, { color: LINE, width: 5 - i });
    ctx.stroke();
    ctx.restore();
  }
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
