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

export type PoseName =
  | 'idle'
  | 'walk'
  | 'run'
  | 'laugh'
  | 'jump'
  | 'clap'
  | 'sleep'
  | 'wave'
  | 'sit'
  | 'hold'
  | 'climb'
  | 'roll';

/** Frame counts per pose, in atlas order. */
export const POSE_FRAMES: Record<PoseName, number> = {
  idle: 2, // "boil" — the line breathes even when standing still
  walk: 4,
  run: 4,
  laugh: 2,
  jump: 1,
  clap: 2,
  sleep: 1,
  wave: 2, // arm up / arm down — the one kid who invites the others over
  sit: 2, // sitting at the top of the slide, and sliding down it
  hold: 2, // one arm straight up, holding a balloon string
  climb: 2, // both arms up — climbing a ladder, or onto a friend's shoulders
  roll: 4, // tumbling: the same curled-up kid at four quarter turns
};

export const POSE_ORDER: PoseName[] = [
  'idle',
  'walk',
  'run',
  'laugh',
  'jump',
  'clap',
  'sleep',
  'wave',
  'sit',
  'hold',
  'climb',
  'roll',
];

/** Total frames in one variant row. */
export const FRAMES_PER_VARIANT = POSE_ORDER.reduce((n, p) => n + POSE_FRAMES[p], 0);

/** Number of kid variants (one per pastel shirt colour). */
export const VARIANTS = SHIRTS.length;

export const FRAME_W = 96;
export const FRAME_H = 128;
/**
 * World-space height of a kid (2.5 heads tall silhouette).
 *
 * Phone sizing policy: the square safe zone (SAFE = 1000 units) still has to
 * fit whole in both orientations, so the world->screen scale on a phone is
 * fixed at min(w, h) / 1000 = 0.39 on a 390-wide iPhone. Rather than shrink
 * the safe zone (which would break the "same composition in portrait and
 * landscape" guarantee), a kid is simply drawn bigger *in world units*:
 * 150 units = 15% of the safe zone, which lands at 150 * 0.39 = 58.5 CSS px
 * on an iPhone 390 screen and ~154 px on an iPad. Crowd spacing scales with
 * it (see Crowd.separationRadius), so density is unchanged.
 */
export const KID_WORLD_H = 150;

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

export interface PoseParams {
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
  /** Raised-arm angle for the waving pose (0 = not waving). */
  wave: number;
  /** Sitting: hips on the ground, both legs out in front. */
  sitting: boolean;
  /** One arm straight up, holding something (a balloon string). */
  holding: boolean;
  /** Both arms up, legs apart: climbing. */
  climbing: boolean;
  /** Quarter turns of a curled-up tumbling kid (-1 = not rolling). */
  roll: number;
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
    wave: 0,
    sitting: false,
    holding: false,
    climbing: false,
    roll: -1,
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
    case 'wave':
      // One arm swings overhead between two angles; the body bobs with it.
      // Measured from +x: a low, clearly sideways wave so the arm never
      // disappears behind the head at phone size.
      base.wave = frame === 0 ? 0.52 : 0.95;
      base.squash = frame === 0 ? 0.02 : -0.02;
      base.lift = frame === 0 ? 0 : 1.5;
      base.smile = 1.2;
      break;
    case 'sleep':
      base.lying = true;
      base.eyesClosed = true;
      base.smile = 0.6;
      break;
    case 'sit':
      // Perched: hips down, legs straight out ahead. Frame 1 leans back a
      // little, which reads as "whee" once the kid is on the slope.
      base.sitting = true;
      base.lean = frame === 0 ? 0.04 : -0.1;
      base.armSwing = frame === 0 ? 0.2 : -0.5;
      base.smile = 1.3;
      break;
    case 'hold':
      // One arm straight up on a balloon string; the body drifts with it.
      base.holding = true;
      base.lift = frame === 0 ? 0 : 2;
      base.squash = frame === 0 ? 0.02 : -0.02;
      base.smile = 1.2;
      break;
    case 'climb':
      base.climbing = true;
      base.legSwing = frame === 0 ? 0.5 : -0.4;
      base.lift = frame === 0 ? 0 : 3;
      break;
    case 'roll':
      // Curled into a ball, spun a quarter turn per frame. Eyes shut, biggest
      // smile in the game: falling over is the joke, never the punishment.
      base.roll = frame;
      base.eyesClosed = true;
      base.smile = 1.5;
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

  // Tumbling is its own little drawing: a curled-up ball, spun.
  if (p.roll >= 0) {
    softShadow(ctx, 0, groundY + 2, 20, 6, SHADOW, SHADOW_ALPHA);
    drawCurled(ctx, groundY - 20, headR, p.roll * (Math.PI / 2), shirt, skin, hair, p, rng);
    ctx.restore();
    return;
  }

  if (p.lying) {
    // Sleeping: rotate the whole figure onto its side. The translation is in
    // the ROTATED frame, and is chosen so the lying figure lands inside its
    // 96x128 atlas cell (head at x=13, feet at x=82, thickness y=87..125)
    // rather than hanging out of the bottom of it.
    softShadow(ctx, 0, groundY - 6, 34, 8, SHADOW, SHADOW_ALPHA);
    ctx.rotate(-Math.PI / 2);
    ctx.translate(22, 42);
  } else {
    softShadow(ctx, 0, groundY + 2, 20 - p.lift * 0.5, 6, SHADOW, SHADOW_ALPHA);
  }
  // Sitting drops the whole figure onto its bottom.
  if (p.sitting) ctx.translate(-2, 11);

  ctx.translate(0, -p.lift);
  ctx.rotate(p.lean);

  const bodyTop = groundY - 34;
  const bodyBottom = groundY - 8;
  const bodyCY = (bodyTop + bodyBottom) / 2;
  const bodyRX = 15 * (1 + p.squash);
  const bodyRY = 14 * (1 - p.squash);

  // Legs (behind the body).
  const legLen = 12;
  if (p.sitting) {
    // Drawn after the body, below — see the sitting block further down.
  } else {
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
  }

  // Arms.
  const armLen = 13;
  for (const side of [-1, 1] as const) {
    const sx = side * (bodyRX - 1);
    const sy = bodyCY - 3;
    let ex: number;
    let ey: number;
    // The raised waving/holding arm is drawn last, over the head — see below.
    if ((p.wave > 0 || p.holding) && side === 1) continue;
    // Climbing reaches with both arms, so both are drawn over the head.
    if (p.climbing) continue;
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

  // Sitting legs go OVER the body, straight out in front (the sprite's own
  // +x is "forwards"), otherwise the body blob hides them completely.
  if (p.sitting) {
    for (const side of [-1, 1] as const) {
      const hy = bodyBottom - 4 + side * 4;
      crayonLine(ctx, -4, hy, legLen * 1.9, hy + 5, { rng, width: 5.5, wobble: 0.9 });
      crayonDot(ctx, legLen * 1.9, hy + 5, 3.6, skin);
    }
  }

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

  // The waving arm goes on top of the head, so it is unmistakable even when a
  // kid is only ~58 px tall on a phone. This is the whole signifier of scene 1.
  if (p.wave > 0) {
    const sx = bodyRX - 1;
    const sy = bodyCY - 4;
    const len = armLen * 1.85;
    const ex = sx + Math.cos(-p.wave) * len;
    const ey = sy + Math.sin(-p.wave) * len;
    crayonLine(ctx, sx, sy, ex, ey, { rng, width: 5, wobble: 1 });
    crayonDot(ctx, ex, ey, 4, skin);
    crayonArc(ctx, ex, ey, 5.5, Math.PI * 1.05, Math.PI * 1.95, { rng, width: 2.4, wobble: 0.6 });
  }

  // Holding a balloon string: one arm straight up, hand closed round nothing
  // in particular. The balloon itself is a prop sprite the scene parents to it.
  if (p.holding) {
    const sx = bodyRX - 3;
    const sy = bodyCY - 4;
    // The hand has to clear the top of the head, or the arm disappears into
    // it and the kid just looks like they are standing there.
    const ex = sx + 4;
    const ey = headCY - headR - 12;
    crayonLine(ctx, sx, sy, ex, ey, { rng, width: 5, wobble: 0.9 });
    crayonDot(ctx, ex, ey, 4, skin);
  }

  // Climbing: both arms reaching up over the head.
  if (p.climbing) {
    for (const side of [-1, 1] as const) {
      const sx = side * (bodyRX - 2);
      const sy = bodyCY - 4;
      const ex = sx + side * 6;
      const ey = headCY - headR - (side === 1 ? 14 : 8);
      crayonLine(ctx, sx, sy, ex, ey, { rng, width: 5, wobble: 0.9 });
      crayonDot(ctx, ex, ey, 3.6, skin);
    }
  }

  ctx.restore();
}

/**
 * A kid curled into a tumbling ball, rotated by `angle`. Used for the roll
 * pose: arms and legs tucked in, eyes shut, the widest smile in the atlas.
 */
function drawCurled(
  ctx: Ctx2D,
  cy: number,
  headR: number,
  angle: number,
  shirt: number,
  skin: number,
  hair: number,
  p: PoseParams,
  rng: () => number,
): void {
  ctx.save();
  ctx.translate(0, cy);
  ctx.rotate(angle);

  // Tucked limbs first, so the body and head sit on top of them.
  for (const side of [-1, 1] as const) {
    crayonLine(ctx, side * 8, 4, side * 16, 12, { rng, width: 5, wobble: 0.9 });
    crayonDot(ctx, side * 16, 12, 3.2, skin);
    crayonLine(ctx, side * 9, -4, side * 17, -11, { rng, width: 4.5, wobble: 0.9 });
    crayonDot(ctx, side * 17, -11, 3, skin);
  }

  crayonBlob(ctx, 0, 6, 15, 13, shirt, { rng, wobble: 1.4 });
  const hy = -8;
  crayonBlob(ctx, 0, hy, headR * 0.92, headR * 0.88, skin, { rng, wobble: 1.5 });
  crayonArc(ctx, 0, hy - 1, headR - 3, Math.PI * 1.08, Math.PI * 1.92, {
    rng,
    color: hair,
    width: 7,
    wobble: 1,
  });
  crayonArc(ctx, -6, hy + 2, 3.2, Math.PI * 1.1, Math.PI * 1.9, { rng, width: 2.6 });
  crayonArc(ctx, 6, hy + 2, 3.2, Math.PI * 1.1, Math.PI * 1.9, { rng, width: 2.6 });
  crayonArc(ctx, 0, hy + 4, 5.5 * p.smile, Math.PI * 0.15, Math.PI * 0.85, {
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
