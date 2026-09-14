/**
 * Procedural kid spritesheet.
 *
 * Parts (head / body / arms / legs / face) are drawn with Canvas2D crayon
 * primitives into one atlas canvas at startup, then uploaded once as a single
 * texture. Every pose is a frame rectangle in that atlas, so the crowd renders
 * from one texture with zero per-frame allocation.
 *
 * Proportions: 2.5 heads tall, round silhouette, two dot eyes + a smile arc.
 * The kids are ALWAYS smiling.
 */
import { Texture, Rectangle } from 'pixi.js';
import { HAIRS, LINE, SHADOW, SHADOW_ALPHA, SHIRTS, SKINS } from './palette';
import { crayonArc, crayonBlob, crayonDot, crayonLine, seededRandom, softShadow } from './crayon';
import type { Ctx2D } from './crayon';

export type PoseName = 'idle' | 'walk' | 'run' | 'laugh' | 'jump' | 'clap' | 'sleep';

/** Frame counts per pose, in atlas order. */
export const POSE_FRAMES: Record<PoseName, number> = {
  idle: 2, // "boil" — the line breathes even when standing still
  walk: 4,
  run: 4,
  laugh: 2,
  jump: 1,
  clap: 2,
  sleep: 1,
};

export const POSE_ORDER: PoseName[] = ['idle', 'walk', 'run', 'laugh', 'jump', 'clap', 'sleep'];

/** Total frames in one variant row. */
export const FRAMES_PER_VARIANT = POSE_ORDER.reduce((n, p) => n + POSE_FRAMES[p], 0);

/** Number of kid variants (one per pastel shirt colour). */
export const VARIANTS = SHIRTS.length;

export const FRAME_W = 96;
export const FRAME_H = 128;
/** World-space height of a kid (2.5 heads tall silhouette). */
export const KID_WORLD_H = 46;

export interface FrameKey {
  variant: number;
  pose: PoseName;
  frame: number;
}

/** Column index of a pose's first frame inside a variant row. */
export function poseColumn(pose: PoseName): number {
  let col = 0;
  for (const p of POSE_ORDER) {
    if (p === pose) return col;
    col += POSE_FRAMES[p];
  }
  return 0;
}

/** Atlas frame index (0..VARIANTS*FRAMES_PER_VARIANT-1). */
export function frameIndex(variant: number, pose: PoseName, frame: number): number {
  const v = ((variant % VARIANTS) + VARIANTS) % VARIANTS;
  const n = POSE_FRAMES[pose];
  const f = ((frame % n) + n) % n;
  return v * FRAMES_PER_VARIANT + poseColumn(pose) + f;
}

export const ATLAS_W = FRAME_W * FRAMES_PER_VARIANT;
export const ATLAS_H = FRAME_H * VARIANTS;

interface PoseParams {
  /** Vertical body offset (jump). */
  lift: number;
  /** Leg swing in radians. */
  legSwing: number;
  /** Arm swing in radians. */
  armSwing: number;
  /** Body lean. */
  lean: number;
  /** Extra body squash (laugh shake). */
  squash: number;
  /** Eyes closed (sleep, laugh). */
  eyesClosed: boolean;
  /** Arms forward together (clap). */
  clapAmount: number;
  /** Whole figure lying down (sleep). */
  lying: boolean;
  /** Mouth openness of the (always present) smile. */
  smile: number;
}

/** Deterministic pose parameters for a given pose/frame. */
export function poseParams(pose: PoseName, frame: number): PoseParams {
  const base: PoseParams = {
    lift: 0,
    legSwing: 0,
    armSwing: 0,
    lean: 0,
    squash: 0,
    eyesClosed: false,
    clapAmount: 0,
    lying: false,
    smile: 1,
  };
  switch (pose) {
    case 'idle':
      base.squash = frame === 0 ? 0 : 0.02;
      base.armSwing = frame === 0 ? 0.05 : -0.05;
      break;
    case 'walk': {
      const phase = (frame / 4) * Math.PI * 2;
      base.legSwing = Math.sin(phase) * 0.45;
      base.armSwing = -Math.sin(phase) * 0.35;
      base.lift = Math.abs(Math.cos(phase)) * 2;
      break;
    }
    case 'run': {
      const phase = (frame / 4) * Math.PI * 2;
      base.legSwing = Math.sin(phase) * 0.85;
      base.armSwing = -Math.sin(phase) * 0.7;
      base.lift = Math.abs(Math.cos(phase)) * 5;
      base.lean = 0.18;
      break;
    }
    case 'laugh':
      base.squash = frame === 0 ? 0.08 : -0.04;
      base.lean = frame === 0 ? -0.1 : 0.1;
      base.armSwing = 0.6;
      base.eyesClosed = true;
      base.smile = 1.5;
      break;
    case 'jump':
      base.lift = 12;
      base.legSwing = 0.5;
      base.armSwing = -1.1;
      break;
    case 'clap':
      base.clapAmount = frame === 0 ? 0.15 : 0.95;
      base.squash = frame === 0 ? 0 : 0.03;
      break;
    case 'sleep':
      base.lying = true;
      base.eyesClosed = true;
      base.smile = 0.6;
      break;
  }
  return base;
}

/** Draws one kid frame into ctx, filling a FRAME_W x FRAME_H cell at (ox, oy). */
export function drawKidFrame(
  ctx: Ctx2D,
  ox: number,
  oy: number,
  variant: number,
  pose: PoseName,
  frame: number,
): void {
  const shirt = SHIRTS[variant % SHIRTS.length];
  const skin = SKINS[variant % SKINS.length];
  const hair = HAIRS[variant % HAIRS.length];
  const p = poseParams(pose, frame);
  // Seed per (variant,pose,frame) so wobble is stable but varied.
  const rng = seededRandom(1000 + variant * 97 + poseColumn(pose) * 13 + frame * 7);

  ctx.save();
  ctx.translate(ox + FRAME_W / 2, oy + FRAME_H);

  // 2.5-head proportions inside the cell.
  const headR = 19;
  const groundY = -8;

  if (p.lying) {
    // Sleeping: rotate the whole figure onto its side.
    softShadow(ctx, 0, groundY + 3, 34, 8, SHADOW, SHADOW_ALPHA);
    ctx.rotate(-Math.PI / 2);
    ctx.translate(-30, -14);
  } else {
    softShadow(ctx, 0, groundY + 2, 20 - p.lift * 0.5, 6, SHADOW, SHADOW_ALPHA);
  }

  ctx.translate(0, -p.lift);
  ctx.rotate(p.lean);

  const bodyTop = groundY - 34;
  const bodyBottom = groundY - 8;
  const bodyCY = (bodyTop + bodyBottom) / 2;
  const bodyRX = 15 * (1 + p.squash);
  const bodyRY = 14 * (1 - p.squash);

  // Legs (behind the body).
  const legLen = 12;
  for (const side of [-1, 1] as const) {
    const a = p.legSwing * side;
    const hx = side * 6;
    const hy = bodyBottom - 1;
    crayonLine(
      ctx,
      hx,
      hy,
      hx + Math.sin(a) * legLen,
      hy + Math.cos(a) * legLen,
      { rng, width: 5, wobble: 0.9 },
    );
  }

  // Arms.
  const armLen = 13;
  for (const side of [-1, 1] as const) {
    const sx = side * (bodyRX - 1);
    const sy = bodyCY - 3;
    let ex: number;
    let ey: number;
    if (p.clapAmount > 0) {
      const inward = p.clapAmount;
      ex = sx + side * armLen * (1 - inward) + -side * armLen * inward * 0.75;
      ey = sy + 6 - inward * 8;
    } else {
      const a = p.armSwing * side;
      ex = sx + side * Math.cos(a) * armLen * 0.6;
      ey = sy + Math.cos(a) * armLen * 0.8 + Math.sin(a) * armLen * 0.6;
    }
    crayonLine(ctx, sx, sy, ex, ey, { rng, width: 4.5, wobble: 0.9 });
    crayonDot(ctx, ex, ey, 3, skin);
  }

  // Body (shirt).
  crayonBlob(ctx, 0, bodyCY, bodyRX, bodyRY, shirt, { rng, wobble: 1.4 });

  // Head.
  const headCY = bodyTop - headR + 3;
  crayonBlob(ctx, 0, headCY, headR, headR * 0.95, skin, { rng, wobble: 1.5 });

  // Hair: a soft cap arc over the top of the head.
  crayonArc(ctx, 0, headCY - 1, headR - 1, Math.PI * 1.08, Math.PI * 1.92, {
    rng,
    color: hair,
    width: 7,
    wobble: 1.0,
  });

  // Face: two dot eyes + a smile arc. ALWAYS smiling.
  const eyeY = headCY + 1;
  const eyeDX = 6.5;
  if (p.eyesClosed) {
    crayonArc(ctx, -eyeDX, eyeY + 1, 3.2, Math.PI * 1.1, Math.PI * 1.9, { rng, width: 2.6 });
    crayonArc(ctx, eyeDX, eyeY + 1, 3.2, Math.PI * 1.1, Math.PI * 1.9, { rng, width: 2.6 });
  } else {
    crayonDot(ctx, -eyeDX, eyeY, 2.6, LINE);
    crayonDot(ctx, eyeDX, eyeY, 2.6, LINE);
  }
  crayonArc(ctx, 0, eyeY + 3, 5.5 * p.smile, Math.PI * 0.15, Math.PI * 0.85, {
    rng,
    width: 2.8,
    wobble: 0.5,
  });

  ctx.restore();
}

/** Draws the whole atlas into a canvas-2d context. Pure Canvas2D, no Pixi. */
export function drawKidSheet(ctx: Ctx2D): void {
  ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);
  for (let v = 0; v < VARIANTS; v++) {
    let col = 0;
    for (const pose of POSE_ORDER) {
      for (let f = 0; f < POSE_FRAMES[pose]; f++) {
        drawKidFrame(ctx, col * FRAME_W, v * FRAME_H, v, pose, f);
        col++;
      }
    }
  }
}

export interface KidSheet {
  /** All frames, indexed by `frameIndex()`. */
  textures: Texture[];
  canvas: HTMLCanvasElement;
  get(variant: number, pose: PoseName, frame: number): Texture;
}

/** Builds the atlas canvas and slices it into Pixi textures (browser only). */
export function buildKidSheet(): KidSheet {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas2d unavailable');
  drawKidSheet(ctx);

  const base = Texture.from(canvas).source;
  base.scaleMode = 'linear';
  const textures: Texture[] = [];
  for (let v = 0; v < VARIANTS; v++) {
    for (let c = 0; c < FRAMES_PER_VARIANT; c++) {
      textures.push(
        new Texture({
          source: base,
          frame: new Rectangle(c * FRAME_W, v * FRAME_H, FRAME_W, FRAME_H),
        }),
      );
    }
  }
  return {
    textures,
    canvas,
    get(variant, pose, frame) {
      return textures[frameIndex(variant, pose, frame)];
    },
  };
}
