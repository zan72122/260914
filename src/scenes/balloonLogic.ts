/**
 * Scene 8 rules, kept free of Pixi so they can be unit-tested.
 *
 * A kid holding a balloon is either still on the grass or on their way up.
 * Going up is deliberately unhurried: a balloon lifts, it does not launch.
 */

/** Feet on the ground, balloon in hand. */
export const GROUNDED = 0;
/** Lifting off. */
export const RISING = 1;
/** Above the top of the picture, gone. */
export const GONE = 2;

/** Rising speed a moment after lift-off, world units per second. */
export const RISE_SPEED = 240;
/** How quickly a kid reaches that speed (exponential, per second). */
export const RISE_RAMP = 1.6;
/** Sideways drift, so the crowd leaves up and towards the next place. */
export const DRIFT_SPEED = 80;
/** Amplitude and rate of the gentle side-to-side sway on the way up. */
export const SWAY_AMP = 26;
export const SWAY_RATE = 1.7;

/** Vertical speed `t` seconds after lift-off. */
export function riseSpeed(t: number): number {
  return RISE_SPEED * (1 - Math.exp(-RISE_RAMP * t));
}

/** Horizontal sway offset `t` seconds after lift-off, for a kid's phase. */
export function swayOffset(t: number, phase: number): number {
  return Math.sin(t * SWAY_RATE + phase) * SWAY_AMP;
}

/** True once a rising kid is safely above the top of the visible world. */
export function offTheTop(y: number, topY: number): boolean {
  return y <= topY;
}

/** The completion condition of scene 8: everybody is in the sky. */
export function allFloated(states: readonly number[]): boolean {
  if (states.length === 0) return false;
  for (let i = 0; i < states.length; i++) if (states[i] !== GONE) return false;
  return true;
}

/** 0..1 share of the crowd that has floated away. */
export function floatedFraction(states: readonly number[]): number {
  if (states.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < states.length; i++) if (states[i] === GONE) n++;
  return n / states.length;
}
