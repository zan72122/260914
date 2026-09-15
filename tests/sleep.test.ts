import { describe, expect, it } from 'vitest';
import {
  ASLEEP,
  AWAKE,
  DAWN_SEC,
  MAX_STARS,
  MORNING_SEC,
  SLEEPERS_PER_TAP,
  YAWNING,
  YAWN_SEC,
  allAsleep,
  asleepFraction,
  mixColor,
  twinkle,
  yawningFraction,
} from '../src/scenes/sleepLogic';
import { MORNING, NIGHT } from '../src/art/palette';

/** Perceived brightness of a packed colour, 0..255. */
function luma(hex: number): number {
  return 0.299 * ((hex >> 16) & 0xff) + 0.587 * ((hex >> 8) & 0xff) + 0.114 * (hex & 0xff);
}

describe('scene 10 sleep: the night is never black', () => {
  it('is a deep lavender-indigo, not darkness', () => {
    const r = (NIGHT >> 16) & 0xff;
    const g = (NIGHT >> 8) & 0xff;
    const b = NIGHT & 0xff;
    // Plainly lit, plainly purple: blue leads, red beats green.
    expect(luma(NIGHT)).toBeGreaterThan(70);
    expect(b).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(g);
    expect(Math.min(r, g, b)).toBeGreaterThan(60);
  });

  it('brightens into a morning that is lighter than the night', () => {
    expect(luma(MORNING)).toBeGreaterThan(luma(NIGHT) + 60);
  });
});

describe('scene 10 sleep: the dawn', () => {
  it('blends night into morning without ever passing through black', () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const c = mixColor(NIGHT, MORNING, t);
      const l = luma(c);
      expect(l).toBeGreaterThanOrEqual(luma(NIGHT) - 0.5);
      expect(l).toBeGreaterThanOrEqual(prev - 0.5);
      prev = l;
    }
    expect(mixColor(NIGHT, MORNING, 0)).toBe(NIGHT);
    expect(mixColor(NIGHT, MORNING, 1)).toBe(MORNING);
  });

  it('clamps outside 0..1 instead of producing nonsense', () => {
    expect(mixColor(NIGHT, MORNING, -5)).toBe(NIGHT);
    expect(mixColor(NIGHT, MORNING, 5)).toBe(MORNING);
  });

  it('takes long enough to read as a sunrise, short enough not to bore', () => {
    expect(DAWN_SEC).toBeGreaterThan(1.5);
    expect(DAWN_SEC + MORNING_SEC).toBeLessThan(6);
  });
});

describe('scene 10 sleep: stars', () => {
  it('twinkles without ever going out', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < 20; t += 0.05) {
      const b = twinkle(t, 0.7);
      min = Math.min(min, b);
      max = Math.max(max, b);
    }
    expect(min).toBeGreaterThan(0.35);
    expect(max).toBeLessThanOrEqual(1.0001);
  });

  it('caps the sky, so a child holding a finger down cannot flood it', () => {
    expect(MAX_STARS).toBeGreaterThan(10);
    expect(MAX_STARS).toBeLessThanOrEqual(40);
  });
});

describe('scene 10 sleep: yawning and the completion condition', () => {
  it('yawns first and lies down after', () => {
    expect(AWAKE).not.toBe(YAWNING);
    expect(YAWNING).not.toBe(ASLEEP);
    // Long enough to see the stretch, short enough that a tap feels answered.
    expect(YAWN_SEC).toBeGreaterThan(0.3);
    expect(YAWN_SEC).toBeLessThan(1.2);
  });

  it('does not count a yawning kid as asleep', () => {
    expect(allAsleep([ASLEEP, YAWNING])).toBe(false);
    expect(asleepFraction([ASLEEP, YAWNING, ASLEEP, AWAKE])).toBeCloseTo(0.5, 6);
    expect(yawningFraction([ASLEEP, YAWNING, ASLEEP, YAWNING])).toBeCloseTo(0.5, 6);
  });

  it('is done only when the last kid is asleep', () => {
    expect(allAsleep([ASLEEP, ASLEEP])).toBe(true);
    expect(allAsleep([ASLEEP, AWAKE])).toBe(false);
    expect(allAsleep([])).toBe(false);
  });

  it('puts several kids to bed per tap, so the field empties by hand', () => {
    expect(SLEEPERS_PER_TAP).toBeGreaterThanOrEqual(2);
    // 28 kids, 3 per tap: a dozen taps, which is a minute of happy tapping.
    expect(Math.ceil(28 / SLEEPERS_PER_TAP)).toBeLessThan(16);
  });
});
