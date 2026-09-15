import { describe, expect, it } from 'vitest';
import { GameClock, MAX_SLICE_MS } from '../src/core/GameClock';

describe('GameClock', () => {
  it('manual モードでは step した分だけ時間が進む', () => {
    const c = new GameClock('manual');
    let total = 0;
    c.setUpdate((dt) => {
      total += dt;
    });
    c.start();
    for (let i = 0; i < 10; i++) c.step(16);
    expect(c.timeMs).toBeCloseTo(160, 6);
    expect(total).toBeCloseTo(160, 6);
  });

  it('大きな step も刻みに分割して全て update に通す（処理を飛ばさない）', () => {
    const c = new GameClock('manual');
    const slices: number[] = [];
    c.setUpdate((dt) => slices.push(dt));
    c.step(1000);
    expect(slices.length).toBe(Math.ceil(1000 / MAX_SLICE_MS));
    expect(slices.every((s) => s <= MAX_SLICE_MS)).toBe(true);
    expect(slices.reduce((a, b) => a + b, 0)).toBeCloseTo(1000, 6);
    expect(c.timeMs).toBeCloseTo(1000, 6);
  });

  it('step(0) は update を呼ばない', () => {
    const c = new GameClock('manual');
    let calls = 0;
    c.setUpdate(() => calls++);
    c.step(0);
    expect(calls).toBe(0);
    expect(c.timeMs).toBe(0);
  });

  it('同じ step 列は同じ時刻列を作る（再現性）', () => {
    const run = (): number[] => {
      const c = new GameClock('manual');
      const ts: number[] = [];
      c.setUpdate((_dt, t) => ts.push(t));
      [16, 16, 33, 5, 250].forEach((ms) => c.step(ms));
      return ts;
    };
    expect(run()).toEqual(run());
  });

  it('mode を切り替えても時刻は保たれる', () => {
    const c = new GameClock('manual');
    c.setUpdate(() => {});
    c.step(100);
    c.setMode('real');
    expect(c.mode).toBe('real');
    expect(c.timeMs).toBeCloseTo(100, 6);
    c.setMode('manual');
    c.step(50);
    expect(c.timeMs).toBeCloseTo(150, 6);
  });
});
