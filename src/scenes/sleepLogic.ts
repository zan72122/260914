/**
 * Scene 10 rules, kept free of Pixi so they can be unit-tested.
 *
 * Kids are awake or asleep; when the last one is asleep the night turns into
 * morning and the whole game starts again. There is no other outcome.
 */

export const AWAKE = 0;
/** Sitting up with both arms stretched over their head: a yawn. */
export const YAWNING = 1;
export const ASLEEP = 2;

/** Seconds a kid spends yawning and stretching before they lie down. */
export const YAWN_SEC = 0.55;

/** How many kids one tap sends to sleep. */
export const SLEEPERS_PER_TAP = 3;
/** Seconds the sky takes to turn from night to morning. */
export const DAWN_SEC = 2.6;
/** Seconds of morning before the director wraps round to scene 1. */
export const MORNING_SEC = 1.6;
/** Most stars that can be in the sky at once (the sprite pool size). */
export const MAX_STARS = 30;

/** Blends two packed 0xRRGGBB colours. Used to bring the dawn up. */
export function mixColor(a: number, b: number, t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * u);
  const g = Math.round(ag + (bg - ag) * u);
  const bl = Math.round(ab + (bb - ab) * u);
  return (r << 16) | (g << 8) | bl;
}

/** Twinkle brightness of a star, 0..1. */
export function twinkle(time: number, phase: number): number {
  return 0.7 + 0.3 * Math.sin(time * 2.4 + phase);
}

/** 0..1 share of the crowd that is mid-yawn. */
export function yawningFraction(states: readonly number[]): number {
  if (states.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < states.length; i++) if (states[i] === YAWNING) n++;
  return n / states.length;
}

/** The completion condition of scene 10: everybody is asleep. */
export function allAsleep(states: readonly number[]): boolean {
  if (states.length === 0) return false;
  for (let i = 0; i < states.length; i++) if (states[i] !== ASLEEP) return false;
  return true;
}

/** 0..1 share of the crowd that is asleep. */
export function asleepFraction(states: readonly number[]): number {
  if (states.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < states.length; i++) if (states[i] === ASLEEP) n++;
  return n / states.length;
}
