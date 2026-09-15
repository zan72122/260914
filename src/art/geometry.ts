/**
 * Shared, Pixi-free geometry for the props that scenes have to reason about.
 *
 * The drawing code (`art/props.ts`) and the scene logic (`scenes/*Logic.ts`)
 * must agree about exactly where a path curves, where a slide's slope runs and
 * how big a bush is — otherwise a kid slides through the air. Keeping the
 * numbers here, with no imports at all, lets both sides share them and lets the
 * unit tests exercise the maths without a browser.
 *
 * All values are world units unless a name says otherwise.
 */

// ---------------------------------------------------------------------------
// Scene 2: the crayon path
// ---------------------------------------------------------------------------

/**
 * World length of one repeat of the path texture.
 *
 * Three repeats are laid end to end, from -2 periods to +1, which covers the
 * whole visible world in both orientations and keeps the scene's own drawing
 * inside the +-680 unit budget that PAN_STEP allows each scene.
 */
export const PATH_PERIOD = 680;
/** How far the path wanders up and down. */
export const PATH_AMP = 70;
/** Half the width of the walkable band. */
export const PATH_HALF_W = 74;
/** Texture height of the path tile (it is drawn 1 px per world unit). */
export const PATH_TEX_H = 340;

/** Centre-line height of the path at world x. */
export function pathY(x: number): number {
  return Math.sin((x / PATH_PERIOD) * Math.PI * 2) * PATH_AMP;
}

/** dy/dx of the path centre line — used to point walking kids along it. */
export function pathSlope(x: number): number {
  return (Math.cos((x / PATH_PERIOD) * Math.PI * 2) * PATH_AMP * Math.PI * 2) / PATH_PERIOD;
}

// ---------------------------------------------------------------------------
// Scene 6: the slide
// ---------------------------------------------------------------------------

/** Size of the slide's world box. Local slide coords run (0,0)..(W,H). */
export const SLIDE_W = 600;
export const SLIDE_H = 460;
/** World position of the slide box's top-left corner. */
export const SLIDE_X = -300;
export const SLIDE_Y = -250;

/** Ladder uprights and the platform, in local slide coordinates. */
export const LADDER_X = 110;
export const LADDER_HALF = 40;
export const LADDER_FOOT_Y = 430;
export const LADDER_TOP_Y = 78;
/** Where the sitting kid waits, in local coordinates. */
export const SLIDE_TOP_X = 150;
export const SLIDE_TOP_Y = 66;

/** Quadratic bezier control points of the slope, in local coordinates. */
const SLOPE: [number, number][] = [
  [178, 78],
  [300, 330],
  [548, 396],
];
/** Half-width of the slope band. */
export const SLOPE_HALF = 26;

export interface Vec {
  x: number;
  y: number;
}

/** Local slide coordinates -> world. */
export function slideToWorld(lx: number, ly: number, out: Vec): Vec {
  out.x = SLIDE_X + lx;
  out.y = SLIDE_Y + ly;
  return out;
}

/** Point on the slope, t in 0..1, in LOCAL slide coordinates. */
export function slopeLocal(t: number, out: Vec): Vec {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  const m = 1 - u;
  const [p0, p1, p2] = SLOPE;
  out.x = m * m * p0[0] + 2 * m * u * p1[0] + u * u * p2[0];
  out.y = m * m * p0[1] + 2 * m * u * p1[1] + u * u * p2[1];
  return out;
}

/** Point on the slope, t in 0..1, in WORLD coordinates. */
export function slopePoint(t: number, out: Vec): Vec {
  slopeLocal(t, out);
  return slideToWorld(out.x, out.y, out);
}

/** Point on the ladder, t in 0..1 (0 = foot, 1 = platform), in WORLD space. */
export function ladderPoint(t: number, out: Vec): Vec {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return slideToWorld(LADDER_X, LADDER_FOOT_Y + (LADDER_TOP_Y - LADDER_FOOT_Y) * u, out);
}

/** Where the one kid who is already up there sits, in WORLD space. */
export function slideTop(out: Vec): Vec {
  return slideToWorld(SLIDE_TOP_X, SLIDE_TOP_Y, out);
}

// ---------------------------------------------------------------------------
// Scene 7: the bushes
// ---------------------------------------------------------------------------

/**
 * World size of one bush. Tall enough that a 150-unit kid crouched behind it
 * is hidden from the shoulders up, with only their feet showing underneath —
 * which is the whole signifier of the scene (§2.5).
 */
export const BUSH_W = 260;
export const BUSH_H = 190;
/** How close a finger has to be to a bush's centre to shake it. */
export const BUSH_TAP_RX = BUSH_W * 0.55;
export const BUSH_TAP_RY = BUSH_H * 0.8;

// ---------------------------------------------------------------------------
// Scene 8: the balloons
// ---------------------------------------------------------------------------

/** World height of a balloon sprite, string included. */
export const BALLOON_H = 150;
/**
 * Where a kid's raised hand is, relative to their feet. Derived from the atlas:
 * the `hold` pose puts the hand at about -58 px in a 128 px frame that is
 * scaled to 150 world units, i.e. -58 * 150/128.
 */
export const BALLOON_HAND_Y = -68;
export const BALLOON_HAND_X = 18;

// ---------------------------------------------------------------------------
// Scene 9: the tower
// ---------------------------------------------------------------------------

/** Vertical spacing between two kids in the tower. */
export const STACK_STEP = 104;
/** Nobody climbs higher than this; the tower always falls over first. */
export const TOWER_MAX = 6;
