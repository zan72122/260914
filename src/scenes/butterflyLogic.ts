/**
 * Scene 5 rules, kept free of Pixi so they can be unit-tested.
 *
 * The butterfly is two numbers and a spring. With a finger down it chases the
 * finger; with no finger it drifts on a slow figure-of-eight so it is never
 * still. When it passes the edge of the world it has taken everybody with it.
 */

/** How fast the butterfly closes on a finger, per second. */
export const FOLLOW_RATE = 3.4;
/** How fast it drifts back towards the middle when nobody is playing. */
export const DRIFT_RATE = 0.55;
/** Amplitude of the idle drift, in world units. */
export const DRIFT_AMP = 190;
/** Speed of the idle drift, in radians per second. */
export const DRIFT_SPEED = 0.42;

export interface Point {
  x: number;
  y: number;
}

/**
 * Exponential approach: `from` moves a `rate`-governed fraction of the way to
 * `to` this frame. Frame-rate independent, and it can never overshoot, so the
 * butterfly is always gentle no matter how fast a child waves their finger.
 */
export function approach(from: number, to: number, rate: number, dt: number): number {
  return to + (from - to) * Math.exp(-rate * dt);
}

/** Where the butterfly wants to be when nobody is touching the screen. */
export function driftTarget(time: number, out: Point): Point {
  out.x = Math.sin(time * DRIFT_SPEED) * DRIFT_AMP;
  // Well above the crowd's heads. Drifting at the crowd's own height put the
  // butterfly among forty faces, where a 4-year-old simply cannot pick it out;
  // the one thing in this game that flies has to be seen to be flying.
  out.y = Math.sin(time * DRIFT_SPEED * 2) * DRIFT_AMP * 0.45 - 270;
  return out;
}

/** True once the butterfly has led the crowd past the edge of the picture. */
export function leftThePicture(x: number, edgeX: number): boolean {
  return x >= edgeX;
}

/** 0..1 how far the butterfly has travelled towards the exit edge. */
export function leadProgress(x: number, startX: number, edgeX: number): number {
  if (edgeX <= startX) return 1;
  const t = (x - startX) / (edgeX - startX);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Roughly how wide (and tall) the butterfly is on screen, in world units.
 *
 * The drawing fills its 128px cell to about 108px across and the scene draws
 * it at scale 1, so this is the number the "is it visible over the crowd"
 * rule below is measured against. It is about twice the width of a kid's head.
 */
export const BUTTERFLY_SPAN = 108;

/**
 * How far below the butterfly the crowd gathers, in world units.
 *
 * The whole point of the scene is that the butterfly can be picked out from
 * the crowd at a glance, so the crowd is kept a clear body's length beneath
 * it. `clearsHeads` is the rule this number has to satisfy.
 */
export const CROWD_LAG = 250;

/**
 * True when a butterfly hovering at `by` is completely above the head of a kid
 * whose feet are at `ky`. (A kid's sprite grows upwards from its feet.)
 */
export function clearsHeads(by: number, ky: number, kidHeight: number): boolean {
  return by + BUTTERFLY_SPAN / 2 < ky - kidHeight;
}
