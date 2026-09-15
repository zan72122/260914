/**
 * Scene 2 rules, kept free of Pixi so they can be unit-tested.
 *
 * The line of kids lives on one number each: how far along the path they are.
 * A finger dragged along the path direction adds "flow", the flow carries the
 * whole line forward, and a kid whose distance passes the exit has left.
 */
import { PATH_HALF_W, pathSlope } from '../art/geometry';

/**
 * Fastest the line ever flows, world units per second. Kept just under what a
 * kid can actually run (220 * 1.8 * the slowest speedScale) so the line always
 * keeps up with its own targets instead of stringing out behind them.
 */
export const FLOW_MAX = 300;
/** How quickly the flow dies away once the finger stops, per second. */
export const FLOW_DECAY = 1.5;
/** Fraction of the finger's along-path speed that becomes flow. */
export const FLOW_GAIN = 0.6;
/** Nobody is ever pushed further back than this, so the line cannot be lost. */
export const PATH_MIN_X = -900;

/** How far off the centre line kid `i` walks (a loose line, not a queue). */
export function laneOffset(i: number): number {
  // Three staggered lanes inside the path band, deterministic per kid.
  return ((i % 3) - 1) * PATH_HALF_W * 0.5;
}

/**
 * The component of a drag that runs along the path at world x, in world units
 * per second. Positive means "onwards", towards the exit.
 */
export function alongPath(vx: number, vy: number, x: number): number {
  const m = pathSlope(x);
  const len = Math.sqrt(1 + m * m);
  return (vx + vy * m) / len;
}

/**
 * Folds one drag sample into the current flow. A drag can only ever speed the
 * line up towards its own direction; it never cancels a faster one already
 * running, so two hands cooperate instead of fighting (§2 multi-touch rule).
 */
export function mergeFlow(flow: number, along: number): number {
  const want = along * FLOW_GAIN;
  if (want > 0) return Math.min(FLOW_MAX, Math.max(flow, want));
  if (want < 0) return Math.max(-FLOW_MAX, Math.min(flow, want));
  return flow;
}

/** One frame of flow decay. */
export function decayFlow(flow: number, dt: number): number {
  return flow * Math.exp(-FLOW_DECAY * dt);
}

/** Advances one kid's distance along the path, clamped at the back. */
export function advance(pathX: number, flow: number, dt: number): number {
  const next = pathX + flow * dt;
  return next < PATH_MIN_X ? PATH_MIN_X : next;
}

/** True when every kid's path distance is past the exit. */
export function allPassed(pathX: readonly number[], exitX: number): boolean {
  if (pathX.length === 0) return false;
  for (let i = 0; i < pathX.length; i++) if (pathX[i] < exitX) return false;
  return true;
}

/** 0..1 share of the line that has already passed the exit. */
export function passedFraction(pathX: readonly number[], exitX: number): number {
  if (pathX.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < pathX.length; i++) if (pathX[i] >= exitX) n++;
  return n / pathX.length;
}
