/**
 * Scene props, drawn once with Canvas2D and uploaded as textures.
 *
 * Nothing here is ever redrawn per frame: the ball pit ring, the balls and the
 * confetti dots each become a single texture at boot, and the scenes only move
 * pooled Sprites around. That keeps the hot loop allocation-free.
 */
import { Texture } from 'pixi.js';
import {
  BALLOONS,
  BALLS,
  BUSH_DARK,
  BUSH_FILL,
  BUTTERFLY_SPOT,
  BUTTERFLY_TRAIL,
  BUTTERFLY_WING,
  BUTTERFLY_WING2,
  CONFETTI,
  LINE,
  PATH_EDGE,
  PATH_FILL,
  PIT_FILL,
  PIT_RIM,
  SHADOW,
  SHADOW_ALPHA,
  SLIDE_FRAME,
  SLIDE_SLOPE,
  STAR_FILL,
  STAR_GLOW,
  hexToCss,
} from './palette';
import {
  crayonBlob,
  crayonDot,
  crayonEllipsePath,
  crayonLine,
  seededRandom,
  strokeStyle,
  softShadow,
} from './crayon';
import type { Ctx2D } from './crayon';
import {
  BALLOON_H,
  BUSH_H,
  BUSH_W,
  LADDER_HALF,
  LADDER_FOOT_Y,
  LADDER_TOP_Y,
  LADDER_X,
  PATH_AMP,
  PATH_HALF_W,
  PATH_PERIOD,
  PATH_TEX_H,
  SLIDE_H,
  SLIDE_W,
  SLOPE_HALF,
  slopeLocal,
} from './geometry';

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

/** Texture pixel size of one butterfly frame. */
export const BUTTERFLY_SIZE = 128;
/** The slide is drawn at twice world resolution and halved by the sprite. */
export const SLIDE_TEX_SCALE = 2;
/** Texture pixel width of one balloon (height comes from the geometry). */
export const BALLOON_W = 96;
/** Texture pixel size of one star. */
export const STAR_SIZE = 96;

/**
 * Scene 2's path: one full sine repeat of a wide cream band with two wobbly
 * crayon edges, plus a scatter of little pebbles. Because the curve completes
 * exactly one period across the texture, copies laid end to end join up
 * seamlessly and the path really does run off both sides of the screen.
 */
export function drawPath(ctx: Ctx2D): void {
  const w = PATH_PERIOD;
  const h = PATH_TEX_H;
  const mid = h / 2;
  ctx.clearRect(0, 0, w, h);
  const yAt = (x: number) => mid + Math.sin((x / PATH_PERIOD) * Math.PI * 2) * PATH_AMP;

  // The band itself: one filled ribbon following the curve.
  ctx.beginPath();
  for (let x = 0; x <= w; x += 8) ctx.lineTo(x, yAt(x) - PATH_HALF_W);
  for (let x = w; x >= 0; x -= 8) ctx.lineTo(x, yAt(x) + PATH_HALF_W);
  ctx.closePath();
  ctx.fillStyle = hexToCss(PATH_FILL);
  ctx.fill();

  // Two crayon edges, drawn in short wobbly dashes like a child's outline.
  for (const side of [-1, 1] as const) {
    const rng = seededRandom(side === 1 ? 401 : 733);
    strokeStyle(ctx, { color: PATH_EDGE, width: 7 });
    ctx.beginPath();
    for (let x = 0; x <= w; x += 10) {
      const y = yAt(x) + side * PATH_HALF_W + (rng() - 0.5) * 4;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Pebbles: a few pale dots so the path has some texture underfoot.
  const rng = seededRandom(97);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = hexToCss(PATH_EDGE);
  for (let i = 0; i < 26; i++) {
    const x = rng() * w;
    const y = yAt(x) + (rng() - 0.5) * PATH_HALF_W * 1.3;
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + rng() * 5, 3 + rng() * 3, rng() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Scene 5's butterfly: the single most salient thing on its screen.
 *
 * It is drawn nearly to the edge of its 128px cell (a wingspan of about 108
 * world units, roughly twice a kid's head) in vivid orange and yellow, with
 * deep-orange spots and the same dark-brown crayon outline every kid has. The
 * scene draws it in a layer ABOVE the whole crowd and never depth-sorts it
 * with them, so it can never end up behind a head.
 */
export function drawButterfly(ctx: Ctx2D, frame: number): void {
  const s = BUTTERFLY_SIZE;
  const c = s / 2;
  ctx.clearRect(0, 0, s, s);
  const rng = seededRandom(17 + frame * 29);
  // Frame 0 = wings spread wide, frame 1 = wings up and half folded.
  const spread = frame === 0 ? 1 : 0.62;
  const rise = frame === 0 ? 0 : -7;
  for (const side of [-1, 1] as const) {
    // Upper wing.
    const ux = c + side * 26 * spread;
    const uy = c - 15 + rise;
    crayonBlob(ctx, ux, uy, 26 * spread, 22, BUTTERFLY_WING, { rng, wobble: 2, width: 4.5 });
    // Lower wing.
    const lx = c + side * 20 * spread;
    const ly = c + 15 + rise * 0.4;
    crayonBlob(ctx, lx, ly, 19 * spread, 16, BUTTERFLY_WING2, { rng, wobble: 2, width: 4.5 });
    // Spots: two on the upper wing, one on the lower. A pattern is what makes
    // a shape read as a creature rather than as a coloured smudge.
    crayonDot(ctx, ux + side * 7 * spread, uy - 4, 5 * spread + 1.2, BUTTERFLY_SPOT);
    crayonDot(ctx, ux - side * 4 * spread, uy + 8, 3.4 * spread + 0.9, BUTTERFLY_SPOT);
    crayonDot(ctx, lx + side * 4 * spread, ly + 2, 4 * spread + 1, BUTTERFLY_SPOT);
  }
  // Body and head.
  crayonBlob(ctx, c, c + 2, 6, 24, LINE, { rng, wobble: 1, width: 3 });
  crayonBlob(ctx, c, c - 24, 6.5, 6, LINE, { rng, wobble: 1, width: 3 });
  // Antennae, with a little club on the end of each.
  for (const side of [-1, 1] as const) {
    const tipX = c + side * 15;
    const tipY = c - 46;
    crayonLine(ctx, c + side * 3, c - 27, tipX, tipY, { rng, width: 3, wobble: 0.8 });
    crayonDot(ctx, tipX, tipY, 3, LINE);
  }
}

/** Texture pixel size of one dot of the butterfly's crayon trail. */
export const TRAIL_SIZE = 28;

/**
 * One dot of the faint dotted trail the butterfly leaves behind it: a soft
 * crayon smudge, no outline. The scene pools these and fades them out, so the
 * path the butterfly has just flown is visible for about a second — which is
 * what tells a child that the thing is moving *because of their finger*.
 */
export function drawTrailDot(ctx: Ctx2D): void {
  const s = TRAIL_SIZE;
  const c = s / 2;
  ctx.clearRect(0, 0, s, s);
  const rng = seededRandom(613);
  crayonEllipsePath(ctx, c, c, c * 0.52, c * 0.46, { rng, wobble: 1.4 });
  ctx.fillStyle = hexToCss(BUTTERFLY_TRAIL);
  ctx.fill();
}

/** Scene 6's slide: a sky-blue ladder and frame with an apricot slope. */
export function drawSlide(ctx: Ctx2D): void {
  const k = SLIDE_TEX_SCALE;
  ctx.clearRect(0, 0, SLIDE_W * k, SLIDE_H * k);
  ctx.save();
  ctx.scale(k, k);
  const rng = seededRandom(313);

  softShadow(ctx, LADDER_X, LADDER_FOOT_Y + 6, 90, 14, SHADOW, SHADOW_ALPHA);
  softShadow(ctx, 470, 404, 120, 16, SHADOW, SHADOW_ALPHA);

  // Ladder: two uprights and a row of rungs.
  for (const side of [-1, 1] as const) {
    crayonLine(
      ctx,
      LADDER_X + side * LADDER_HALF,
      LADDER_FOOT_Y,
      LADDER_X + side * LADDER_HALF * 0.7,
      LADDER_TOP_Y - 14,
      { rng, color: SLIDE_FRAME, width: 14, wobble: 1.6 },
    );
  }
  const rungs = 6;
  for (let i = 0; i <= rungs; i++) {
    const t = i / rungs;
    const y = LADDER_FOOT_Y + (LADDER_TOP_Y - 6 - LADDER_FOOT_Y) * t;
    const half = LADDER_HALF * (1 - 0.3 * t);
    crayonLine(ctx, LADDER_X - half, y, LADDER_X + half, y, {
      rng,
      color: SLIDE_FRAME,
      width: 10,
      wobble: 1.4,
    });
  }

  // Platform.
  crayonLine(ctx, LADDER_X - LADDER_HALF - 12, LADDER_TOP_Y, 190, LADDER_TOP_Y, {
    rng,
    color: SLIDE_FRAME,
    width: 18,
    wobble: 1.6,
  });

  // The slope: a fat apricot band along the bezier, with a raised lip.
  const pt = { x: 0, y: 0 };
  const steps = 40;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    slopeLocal(i / steps, pt);
    ctx.lineTo(pt.x, pt.y + SLOPE_HALF);
  }
  for (let i = steps; i >= 0; i--) {
    slopeLocal(i / steps, pt);
    ctx.lineTo(pt.x, pt.y - SLOPE_HALF);
  }
  ctx.closePath();
  ctx.fillStyle = hexToCss(SLIDE_SLOPE);
  ctx.fill();
  strokeStyle(ctx, { color: LINE, width: 5 });
  ctx.stroke();

  // A lighter centre line: the polished part a child slides down.
  ctx.save();
  ctx.globalAlpha = 0.55;
  strokeStyle(ctx, { color: 0xffffff, width: 10 });
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    slopeLocal(i / steps, pt);
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();
  ctx.restore();

  // A leg holding the middle of the slope up.
  slopeLocal(0.62, pt);
  crayonLine(ctx, pt.x, pt.y, pt.x - 10, LADDER_FOOT_Y, {
    rng,
    color: SLIDE_FRAME,
    width: 12,
    wobble: 1.4,
  });
  ctx.restore();
}

/** Scene 7's bush: three overlapping green crayon blobs. */
export function drawBush(ctx: Ctx2D): void {
  const w = BUSH_W;
  const h = BUSH_H;
  ctx.clearRect(0, 0, w, h);
  const rng = seededRandom(577);
  crayonBlob(ctx, w * 0.28, h * 0.62, w * 0.26, h * 0.3, BUSH_DARK, { rng, wobble: 3, width: 5 });
  crayonBlob(ctx, w * 0.72, h * 0.62, w * 0.26, h * 0.3, BUSH_DARK, { rng, wobble: 3, width: 5 });
  crayonBlob(ctx, w * 0.5, h * 0.46, w * 0.34, h * 0.38, BUSH_FILL, { rng, wobble: 3.4, width: 5 });
  // A few scribbled leaves so it reads as foliage, not a green pillow.
  ctx.save();
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < 12; i++) {
    const a = rng() * Math.PI * 2;
    const x = w * 0.5 + Math.cos(a) * w * 0.26 * rng();
    const y = h * 0.5 + Math.sin(a) * h * 0.26 * rng();
    crayonLine(ctx, x, y, x + 12, y - 10, { rng, color: BUSH_DARK, width: 4, wobble: 1 });
  }
  ctx.restore();
}

/** Scene 8's balloon: a round pastel balloon on a long wobbly string. */
export function drawBalloon(ctx: Ctx2D, color: number, seed: number): void {
  const w = BALLOON_W;
  const h = BALLOON_H;
  ctx.clearRect(0, 0, w, h);
  const rng = seededRandom(seed);
  const cx = w / 2;
  const r = w * 0.36;
  const cy = r + 8;
  // String first, so the knot covers where it meets the balloon.
  strokeStyle(ctx, { color: LINE, width: 3 });
  ctx.beginPath();
  ctx.moveTo(cx, cy + r);
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    ctx.lineTo(cx + Math.sin(t * 5) * 7, cy + r + (h - 6 - (cy + r)) * t);
  }
  ctx.stroke();
  crayonBlob(ctx, cx, cy, r, r * 1.12, color, { rng, wobble: 2, width: 4 });
  // Knot.
  crayonBlob(ctx, cx, cy + r * 1.1, 5, 5, color, { rng, wobble: 1, width: 3 });
  // Highlight.
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.34, cy - r * 0.4, r * 0.24, r * 0.3, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

/** Scene 10's star: a soft five-pointed crayon star with a warm glow. */
export function drawStar(ctx: Ctx2D): void {
  const s = STAR_SIZE;
  const c = s / 2;
  ctx.clearRect(0, 0, s, s);
  const glow = ctx.createRadialGradient(c, c, 2, c, c, c);
  glow.addColorStop(0, 'rgba(255,248,216,0.55)');
  glow.addColorStop(1, 'rgba(255,248,216,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, s, s);

  const rng = seededRandom(881);
  const outer = c * 0.62;
  const inner = outer * 0.44;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = (i % 2 === 0 ? outer : inner) * (1 + (rng() - 0.5) * 0.1);
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = hexToCss(STAR_FILL);
  ctx.fill();
  strokeStyle(ctx, { color: STAR_GLOW, width: 4 });
  ctx.stroke();
}

export interface PropTextures {
  pit: Texture;
  /** One texture per pastel ball colour (index matches `BALLS`). */
  balls: Texture[];
  /** One texture per confetti colour (index matches `CONFETTI`). */
  confetti: Texture[];
  /** Scene 2: one repeat of the curvy crayon path, tiled end to end. */
  path: Texture;
  /** Scene 5: the butterfly, two flap frames. */
  butterfly: Texture[];
  /** Scene 5: one dot of the butterfly's fading crayon trail. */
  trailDot: Texture;
  /** Scene 6: ladder + platform + slope, one drawing. */
  slide: Texture;
  /** Scene 7: a bush to hide behind. */
  bush: Texture;
  /** Scene 8: one texture per balloon colour (index matches `BALLOONS`). */
  balloons: Texture[];
  /** Scene 10: a star in the night sky. */
  star: Texture;
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
    path: canvasTexture(PATH_PERIOD, PATH_TEX_H, drawPath),
    butterfly: [0, 1].map((f) =>
      canvasTexture(BUTTERFLY_SIZE, BUTTERFLY_SIZE, (ctx) => drawButterfly(ctx, f)),
    ),
    trailDot: canvasTexture(TRAIL_SIZE, TRAIL_SIZE, drawTrailDot),
    slide: canvasTexture(SLIDE_W * SLIDE_TEX_SCALE, SLIDE_H * SLIDE_TEX_SCALE, drawSlide),
    bush: canvasTexture(BUSH_W, BUSH_H, drawBush),
    balloons: BALLOONS.map((c, i) =>
      canvasTexture(BALLOON_W, BALLOON_H, (ctx) => drawBalloon(ctx, c, 3 + i * 11)),
    ),
    star: canvasTexture(STAR_SIZE, STAR_SIZE, drawStar),
  };
}
