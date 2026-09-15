/**
 * Scene 6 rules, kept free of Pixi so they can be unit-tested.
 *
 * Every kid is in exactly one of five roles, and the scene is over when they
 * have all reached the last one. The geometry of the slide itself lives in
 * `art/geometry.ts`, shared with the drawing code.
 */

/** Waiting at the bottom of the ladder. */
export const ROLE_QUEUE = 0;
/** On the ladder, on the way up. */
export const ROLE_CLIMB = 1;
/** Sitting on the platform at the top. */
export const ROLE_TOP = 2;
/** On the slope. */
export const ROLE_SLIDE = 3;
/** Landed, and off playing at the bottom. */
export const ROLE_LANDED = 4;

/** Seconds to climb the ladder. */
export const CLIMB_SEC = 1.15;
/** Seconds to come down the slope. */
export const SLIDE_SEC = 0.95;
/** How long a kid sits at the top before letting go. */
export const TOP_PAUSE = 0.3;
/** How many kids may be on the ladder at once. */
export const MAX_CLIMBERS = 3;

/**
 * Sliding is not linear: a child creeps over the lip and then accelerates.
 * Quadratic ease-in, so the "whee" lands where it should.
 */
export function slideEase(t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u) * 0.35 + u * u * 0.65;
}

/** The completion condition of scene 6: everybody has been down the slide. */
export function allSlid(roles: readonly number[]): boolean {
  if (roles.length === 0) return false;
  for (let i = 0; i < roles.length; i++) if (roles[i] !== ROLE_LANDED) return false;
  return true;
}

/** 0..1 share of the crowd that has already been down. */
export function slidFraction(roles: readonly number[]): number {
  if (roles.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < roles.length; i++) if (roles[i] === ROLE_LANDED) n++;
  return n / roles.length;
}

/** How many kids are currently on the ladder. */
export function climberCount(roles: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < roles.length; i++) if (roles[i] === ROLE_CLIMB) n++;
  return n;
}
