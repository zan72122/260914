import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../src/core/audio/context';
import { Sfx } from '../src/core/audio/sfx';
import {
  Bgm,
  LOOK_AHEAD_SEC,
  MAX_NOTES_PER_TICK,
  PENTATONIC,
  SCHEDULER_TICK_MS,
  buildLoop,
  midiToHz,
  scheduleDue,
} from '../src/core/audio/bgm';
import type { LoopCursor } from '../src/core/audio/bgm';

describe('audio before unlock', () => {
  it('reports itself locked when there is no AudioContext', () => {
    const engine = new AudioEngine();
    expect(engine.unlocked).toBe(false);
    expect(engine.unlock()).toBe(false);
  });

  it('plays sfx silently instead of throwing', () => {
    const sfx = new Sfx(new AudioEngine());
    expect(sfx.play('pon')).toBe(false);
    expect(sfx.play('pote')).toBe(false);
    expect(sfx.play('laugh')).toBe(false);
    expect(sfx.activeVoices).toBe(0);
  });

  it('queues bgm instead of throwing', () => {
    const bgm = new Bgm(new AudioEngine());
    expect(() => bgm.play({ root: 60, tempo: 90 })).not.toThrow();
    expect(() => bgm.stop()).not.toThrow();
  });
});

describe('bgm generator', () => {
  it('produces a deterministic pentatonic loop', () => {
    const a = buildLoop({ root: 60, tempo: 90, seed: 3 });
    const b = buildLoop({ root: 60, tempo: 90, seed: 3 });
    expect(a).toEqual(b);
    expect(a).toHaveLength(16);
    for (const note of a) {
      const degree = ((note - 60) % 12 + 12) % 12;
      expect(PENTATONIC).toContain(degree);
    }
  });

  it('converts midi to hz', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6);
    expect(midiToHz(81)).toBeCloseTo(880, 6);
  });
});

/**
 * The scheduler, driven by a fake audio clock and a deliberately unreliable
 * timer. No AudioContext and no Pixi: this is arithmetic, and it is the part
 * that has to be right, because a drifting loop is audible immediately.
 */
describe('bgm look-ahead scheduler', () => {
  const STEP = 60 / 92 / 2; // scene 1's tempo

  /** Runs `ticks` wake-ups of the pump against a clock that advances by `advance()`. */
  function run(
    ticks: number,
    advance: (i: number) => number,
    stepSec = STEP,
  ): { times: number[]; indices: number[]; cursor: LoopCursor; now: number } {
    const cursor: LoopCursor = { nextTime: 0, index: 0 };
    const times: number[] = [];
    const indices: number[] = [];
    let now = 0;
    for (let i = 0; i < ticks; i++) {
      now += advance(i);
      scheduleDue(cursor, now, stepSec, (t, index) => {
        times.push(t);
        indices.push(index);
      });
    }
    return { times, indices, cursor, now };
  }

  it('places every note on an exact multiple of the step, however late the timer is', () => {
    // A timer that fires anywhere between 5ms and 400ms late: far worse than
    // anything a busy frame could do to it.
    let seed = 7;
    const jitter = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return 0.005 + (seed / 2147483648) * 0.395;
    };
    const { times } = run(600, jitter);
    expect(times.length).toBeGreaterThan(100);
    for (let i = 0; i < times.length; i++) {
      // Zero drift, not "small" drift: the nth note is exactly n steps in.
      expect(times[i]).toBeCloseTo(times[0] + i * STEP, 9);
    }
  });

  it('keeps the loop in time over a simulated ten minutes of steady ticking', () => {
    const tick = SCHEDULER_TICK_MS / 1000;
    const { times, now } = run(Math.round(600 / tick), () => tick);
    expect(times[times.length - 1] - times[0]).toBeCloseTo((times.length - 1) * STEP, 9);
    // Everything due by now has been scheduled, and nothing much beyond.
    expect(times.length).toBeGreaterThanOrEqual(Math.floor(now / STEP));
    expect(times.length).toBeLessThanOrEqual(Math.floor(now / STEP) + 2);
  });

  it('never hands Web Audio a note more than the look-ahead in advance', () => {
    const cursor: LoopCursor = { nextTime: 0, index: 0 };
    for (let now = 0; now < 30; now += 0.025) {
      scheduleDue(cursor, now, STEP, (t) => {
        expect(t).toBeLessThan(now + LOOK_AHEAD_SEC);
      });
    }
  });

  it('counts the notes of the loop in order, so the tune is the tune', () => {
    const { indices } = run(400, () => 0.025);
    for (let i = 0; i < indices.length; i++) expect(indices[i]).toBe(i);
  });

  it('skips the silence instead of dumping a burst after a backgrounded tab', () => {
    const cursor: LoopCursor = { nextTime: 0, index: 0 };
    let n = scheduleDue(cursor, 0, STEP, () => {});
    expect(n).toBe(1);
    // Ten minutes with the page asleep.
    n = scheduleDue(cursor, 600, STEP, () => {});
    expect(n).toBeLessThanOrEqual(MAX_NOTES_PER_TICK);
    expect(n).toBeLessThanOrEqual(2);
    // ...and the loop carries on from where the clock actually is.
    expect(cursor.nextTime).toBeGreaterThan(600);
    expect(cursor.nextTime).toBeLessThan(600 + STEP * 2);
  });

  it('never schedules more than its cap in one wake-up', () => {
    const cursor: LoopCursor = { nextTime: 0, index: 0 };
    // A look-ahead of a whole minute would otherwise queue hundreds of notes.
    const n = scheduleDue(cursor, 0, STEP, () => {}, 60);
    expect(n).toBe(MAX_NOTES_PER_TICK);
  });

  it('does nothing at all for a nonsense tempo instead of looping forever', () => {
    const cursor: LoopCursor = { nextTime: 0, index: 0 };
    expect(scheduleDue(cursor, 1, 0, () => {})).toBe(0);
    expect(scheduleDue(cursor, 1, -1, () => {})).toBe(0);
  });
});
