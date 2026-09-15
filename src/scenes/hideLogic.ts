/**
 * Scene 7 rules, kept free of Pixi so they can be unit-tested.
 *
 * Every kid belongs to one bush, and a bush is either still hiding people or
 * has been found. The scene is over when there is nobody left to find.
 */
import { BUSH_TAP_RX, BUSH_TAP_RY } from '../art/geometry';

/** Still behind the bush. */
export const HIDDEN = 0;
/** Mid-leap, on the way out. */
export const POPPING = 1;
/** Out, laughing, playing in the open. */
export const FOUND = 2;

/** Seconds a kid spends in the air coming out of a bush. */
export const POP_SEC = 0.5;
/** How high the leap goes, in world units. */
export const POP_LIFT = 150;

/**
 * Where each bush sits. A loose scatter, never a grid.
 *
 * Every spot is chosen so the whole bush (BUSH_W x BUSH_H, centred here) stays
 * inside the 1000-unit square safe zone: on an iPhone in portrait that square
 * is exactly the visible world, and a bush with somebody in it that is half
 * off the edge of the screen is a hiding place a child cannot find.
 */
export const BUSH_SPOTS: readonly (readonly [number, number])[] = [
  [-320, -150],
  [40, -215],
  [355, -120],
  [-350, 95],
  [-55, 40],
  [265, 105],
  [95, 285],
] as const;

/** True when the point is inside the bush's (elliptical) touch area. */
export function insideBush(bx: number, by: number, x: number, y: number, slack = 0): boolean {
  const rx = BUSH_TAP_RX + slack;
  const ry = BUSH_TAP_RY + slack;
  const dx = (x - bx) / rx;
  const dy = (y - by) / ry;
  return dx * dx + dy * dy <= 1;
}

/** The completion condition of scene 7: nobody is left hiding. */
export function allFound(states: readonly number[]): boolean {
  if (states.length === 0) return false;
  for (let i = 0; i < states.length; i++) if (states[i] !== FOUND) return false;
  return true;
}

/** 0..1 share of the crowd that has been found. */
export function foundFraction(states: readonly number[]): number {
  if (states.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < states.length; i++) if (states[i] === FOUND) n++;
  return n / states.length;
}

/** Index of the first bush that still has somebody in it, or -1. */
export function firstHidingBush(states: readonly number[], bushOf: readonly number[]): number {
  for (let i = 0; i < states.length; i++) if (states[i] === HIDDEN) return bushOf[i];
  return -1;
}
