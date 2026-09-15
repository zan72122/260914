/**
 * The app icon: one smiling kid's face, on the same cream paper as the game.
 *
 * It is drawn with the very same crayon primitives and palette as everything
 * else (`scripts/make-icons.mjs` bundles this module and runs it in a real
 * Canvas2D), so the icon on the home screen is genuinely a picture from the
 * game rather than a lookalike drawn twice.
 *
 * Nothing here is used at runtime; the game never draws its own icon.
 */
import { crayonArc, crayonBlob, crayonDot, seededRandom, softShadow } from './crayon';
import type { Ctx2D } from './crayon';
import { HAIRS, LINE, PAPER, SHADOW, SHADOW_ALPHA, SHIRTS, SKINS, hexToCss } from './palette';

/** The size the drawing below is authored at; everything scales from it. */
export const ICON_UNIT = 116;

/** Draws the icon, filling a `size` x `size` square. */
export function drawIcon(ctx: Ctx2D, size: number): void {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = hexToCss(PAPER);
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(size / ICON_UNIT, size / ICON_UNIT);
  // A little headroom: iOS rounds the corners off a home-screen icon, and a
  // face drawn right to the edge loses its hair to the rounding.
  ctx.translate(0, -5);

  const rng = seededRandom(20260915);
  const headR = 30;

  // A shoulder of shirt at the bottom, so the face is a child and not a ball.
  crayonBlob(ctx, 0, headR + 24, 27, 20, SHIRTS[0], { rng, wobble: 2.4, width: 5 });
  // The soft blue-grey blob shadow this game uses everywhere. Never black.
  softShadow(ctx, 0, 6, headR * 1.02, headR * 0.98, SHADOW, SHADOW_ALPHA * 0.5);
  // The face.
  crayonBlob(ctx, 0, 0, headR, headR * 0.95, SKINS[0], { rng, wobble: 2.4, width: 5 });
  // Hair: the same soft cap the kids wear.
  crayonArc(ctx, 0, -1.5, headR - 1.5, Math.PI * 1.06, Math.PI * 1.94, {
    rng,
    color: HAIRS[1],
    width: 11,
    wobble: 1.6,
  });
  // Two dot eyes and a smile. ALWAYS smiling.
  crayonDot(ctx, -10.5, 1.5, 4.2, LINE);
  crayonDot(ctx, 10.5, 1.5, 4.2, LINE);
  crayonArc(ctx, 0, 6, 10, Math.PI * 0.15, Math.PI * 0.85, { rng, width: 4.4, wobble: 0.8 });

  ctx.restore();
}
