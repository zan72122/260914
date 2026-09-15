/**
 * Scene 1 completion rules, kept free of Pixi so they can be unit-tested.
 *
 * The goal is simply "everybody is standing around the kid who is waving".
 * There is no failure state: the condition can only ever become true.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Everyone must be this close to the waving kid for the crowd to count as
 * gathered.
 *
 * It has to be comfortably wider than the ring of slots the crowd settles
 * into (the outermost is about 280 units out), because the separation force
 * keeps jostling the outside of a 44-strong group. At 330 the last two or
 * three kids could hover on the line for half a minute and the scene stalled;
 * at 400 a formed group is unambiguously a formed group, and it still looks
 * exactly the same — the crowd packs itself to about 220 units across.
 */
export const CLUSTER_RADIUS = 400;

/** How many of `kids` are inside `radius` of (cx, cy). */
export function gatheredCount(kids: readonly Point[], cx: number, cy: number, radius: number): number {
  const r2 = radius * radius;
  let n = 0;
  for (let i = 0; i < kids.length; i++) {
    const dx = kids[i].x - cx;
    const dy = kids[i].y - cy;
    if (dx * dx + dy * dy <= r2) n++;
  }
  return n;
}

/** The completion condition of scene 1: every kid inside the cluster radius. */
export function allGathered(
  kids: readonly Point[],
  cx: number,
  cy: number,
  radius: number = CLUSTER_RADIUS,
): boolean {
  return kids.length > 0 && gatheredCount(kids, cx, cy, radius) === kids.length;
}

/** 0..1 how gathered the crowd is (used for the debug progress hook). */
export function gatherProgress(
  kids: readonly Point[],
  cx: number,
  cy: number,
  radius: number = CLUSTER_RADIUS,
): number {
  if (kids.length === 0) return 0;
  return gatheredCount(kids, cx, cy, radius) / kids.length;
}

/** True when every kid has run past `exitX` (the scene's right edge). */
export function allExited(kids: readonly Point[], exitX: number): boolean {
  for (let i = 0; i < kids.length; i++) if (kids[i].x < exitX) return false;
  return true;
}

/**
 * Once this much of the crowd has arrived, the group starts pulling.
 *
 * A half-formed group of children is a real force in a playground: the last
 * few come over because everyone else is already there. Below this fraction
 * nothing happens at all, which matters for two reasons — the scene must
 * never finish itself (the 30-second rescue is the only no-input completion),
 * and the player has to feel that the gathering is theirs.
 */
export const PULL_THRESHOLD = 0.6;

/**
 * The strongest the pull ever gets, in world units per second squared.
 *
 * With the crowd's damping of 2.4/s this settles at about 140 units/s, well
 * under the 190 a kid walks at when they are actually going somewhere: a
 * straggler drifts towards the party, they are never dragged to it.
 */
export const PULL_FORCE = 340;

/**
 * How hard a group that is `fraction` formed tugs at whoever is still outside
 * it. Zero until the threshold, then eased in, so nothing about it is a switch
 * being thrown: the scene simply gets easier the better it is going.
 */
export function stragglerPull(fraction: number): number {
  if (fraction <= PULL_THRESHOLD) return 0;
  const t = Math.min(1, (fraction - PULL_THRESHOLD) / (1 - PULL_THRESHOLD));
  // Smoothstep: the pull arrives gradually rather than snapping on.
  return PULL_FORCE * t * t * (3 - 2 * t);
}
