/**
 * Canvas2D crayon primitives: thick, slightly wobbly dark-brown strokes and
 * soft pastel fills. Deterministic wobble (seeded) so a given "boil" frame is
 * reproducible and the same kid does not jitter randomly between rebuilds.
 */
import { LINE, LINE_WIDTH, hexToCss } from './palette';

export type Ctx2D = CanvasRenderingContext2D;

/** mulberry32 — small deterministic PRNG for line wobble. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CrayonOptions {
  /** Line colour. */
  color?: number;
  /** Line thickness in px. */
  width?: number;
  /** Wobble amplitude in px. */
  wobble?: number;
  /** Wobble PRNG. */
  rng?: () => number;
}

export function strokeStyle(ctx: Ctx2D, o: CrayonOptions = {}): void {
  ctx.strokeStyle = hexToCss(o.color ?? LINE);
  ctx.lineWidth = o.width ?? LINE_WIDTH;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

/** A wobbly straight-ish line between two points. */
export function crayonLine(
  ctx: Ctx2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  o: CrayonOptions = {},
): void {
  const rng = o.rng ?? seededRandom(1);
  const w = o.wobble ?? 1.2;
  const segs = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 8));
  strokeStyle(ctx, o);
  ctx.beginPath();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const jx = (rng() - 0.5) * 2 * w * (i === 0 || i === segs ? 0.3 : 1);
    const jy = (rng() - 0.5) * 2 * w * (i === 0 || i === segs ? 0.3 : 1);
    const x = x0 + (x1 - x0) * t + jx;
    const y = y0 + (y1 - y0) * t + jy;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** Builds a wobbly closed ellipse path (does not stroke or fill). */
export function crayonEllipsePath(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  o: CrayonOptions = {},
): void {
  const rng = o.rng ?? seededRandom(7);
  const w = o.wobble ?? 1.4;
  const steps = 22;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const j = 1 + (rng() - 0.5) * 2 * (w / Math.max(rx, ry));
    const x = cx + Math.cos(a) * rx * j;
    const y = cy + Math.sin(a) * ry * j;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Filled + outlined wobbly ellipse — the workhorse of the whole art style. */
export function crayonBlob(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: number,
  o: CrayonOptions = {},
): void {
  crayonEllipsePath(ctx, cx, cy, rx, ry, o);
  ctx.fillStyle = hexToCss(fill);
  ctx.fill();
  strokeStyle(ctx, o);
  ctx.stroke();
}

/** A wobbly arc, used for the smile and for limbs. */
export function crayonArc(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  o: CrayonOptions = {},
): void {
  const rng = o.rng ?? seededRandom(3);
  const w = o.wobble ?? 0.8;
  const steps = Math.max(4, Math.round((Math.abs(a1 - a0) / Math.PI) * 14));
  strokeStyle(ctx, o);
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    const rr = r + (rng() - 0.5) * 2 * w;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/** A filled dot (eye). */
export function crayonDot(ctx: Ctx2D, cx: number, cy: number, r: number, color = LINE): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = hexToCss(color);
  ctx.fill();
}

/** Soft blue-grey blob shadow. Never a hard black shadow. */
export function softShadow(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: number,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = hexToCss(color);
  ctx.fill();
  ctx.restore();
}
