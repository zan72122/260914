import { describe, it, expect } from 'vitest';
import { Clock, nextStepAfter } from '../../src/audio/clock';
import { STEPS } from '../../src/app/state';

describe('Clock', () => {
  it('位相はループで 0..1 を繰り返す', () => {
    const c = new Clock(1, 10);
    expect(c.phase(10)).toBeCloseTo(0);
    expect(c.phase(10 + c.loopDur / 2)).toBeCloseTo(0.5);
    expect(c.phase(10 + c.loopDur * 3)).toBeCloseTo(0);
  });
  it('テンポ変更で位相が保たれる', () => {
    const c = new Clock(0, 0);
    const now = c.loopDur * 0.3;
    c.setTempo(2, now);
    expect(c.phase(now)).toBeCloseTo(0.3);
    expect(c.bpm).toBe(125);
  });
  it('ステップ時刻は枕木の中央(i + 0.5)', () => {
    const c = new Clock(1, 0);
    expect(c.stepTime(0, 0)).toBeCloseTo(c.stepDur * 0.5);
    expect(c.stepTime(1, 2)).toBeCloseTo(c.stepDur * (STEPS + 2.5));
  });
  it('nextStepAfter は now 以降の最初のステップを返す', () => {
    const c = new Clock(1, 0);
    expect(nextStepAfter(c, 0)).toEqual({ loopIndex: 0, step: 0 });
    expect(nextStepAfter(c, c.stepDur * 0.6)).toEqual({ loopIndex: 0, step: 1 });
    expect(nextStepAfter(c, c.stepDur * (STEPS - 0.4))).toEqual({ loopIndex: 1, step: 0 });
  });
});
