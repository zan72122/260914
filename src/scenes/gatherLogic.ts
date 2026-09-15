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
