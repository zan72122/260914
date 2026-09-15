/**
 * Scene 3 rules, kept free of Pixi so they can be unit-tested.
 *
 * The whole scene is one boolean per kid — "is this one laughing yet" — plus
 * the pacing of the giggle chain that turns one laugh into forty.
 */

/** Seconds between two rings of the giggle spreading outwards. */
export const SPREAD_INTERVAL = 0.42;
/** How far a laugh reaches, in world units (about one kid apart). */
export const SPREAD_RADIUS = 150;
/**
 * Chance that a neighbour catches it on any given ring. Below 1 so the laugh
 * ripples raggedly through the crowd like a real one, instead of expanding as
 * a tidy circle — but high enough that it never stalls.
 */
export const SPREAD_CHANCE = 0.55;

/** How many of `flags` are set. */
export function laughingCount(flags: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < flags.length; i++) if (flags[i] !== 0) n++;
  return n;
}

/** The completion condition of scene 3: everybody is laughing. */
export function allLaughing(flags: readonly number[]): boolean {
  return flags.length > 0 && laughingCount(flags) === flags.length;
}

/** 0..1 share of the crowd that is laughing. */
export function laughingFraction(flags: readonly number[]): number {
  if (flags.length === 0) return 0;
  return laughingCount(flags) / flags.length;
}
