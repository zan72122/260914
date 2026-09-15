/**
 * Scene 9 rules, kept free of Pixi so they can be unit-tested.
 *
 * A tower is a list of kids, bottom first. The higher it gets the more it
 * sways, and once it reaches TOWER_MAX it always comes down — into a heap of
 * laughing children, never into a fall. There is no way to "lose" it.
 */
import { STACK_STEP, TOWER_MAX } from '../art/geometry';

export { STACK_STEP, TOWER_MAX };

/** On the ground, watching. */
export const ON_GROUND = 0;
/** Climbing up the side of the tower. */
export const CLIMBING = 1;
/** Standing on somebody's shoulders. */
export const STACKED = 2;
/** Part of the laughing heap at the end. */
export const TUMBLED = 3;

/** Seconds a kid takes to climb into place. */
export const CLIMB_SEC = 0.75;
/** Rate of the sway, radians per second. */
export const WOBBLE_RATE = 2.3;
/** Sway of a two-high tower, in world units; it grows fast with height. */
export const WOBBLE_BASE = 7;

/** Height of the kid at level `level` (0 = the one standing on the ground). */
export function stackY(baseY: number, level: number): number {
  return baseY - level * STACK_STEP;
}

/** How far the top of a tower of `height` kids swings. */
export function wobbleAmp(height: number): number {
  if (height <= 1) return 0;
  return WOBBLE_BASE * Math.pow(height - 1, 1.7);
}

/**
 * Sideways offset of the kid at `level` in a tower of `height`, at `time`.
 * The sway is proportional to how high up the kid is, exactly as a real stack
 * of children would behave.
 */
export function swayAt(time: number, level: number, height: number): number {
  if (height <= 1) return 0;
  return Math.sin(time * WOBBLE_RATE) * wobbleAmp(height) * (level / (height - 1));
}

/** True once the tower is as high as it is ever going to get. */
export function shouldTopple(height: number): boolean {
  return height >= TOWER_MAX;
}

/** 0..1 how close the tower is to its big moment. */
export function towerProgress(height: number): number {
  return Math.min(1, height / TOWER_MAX);
}
