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
  out.y = Math.sin(time * DRIFT_SPEED * 2) * DRIFT_AMP * 0.45 - 120;
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
