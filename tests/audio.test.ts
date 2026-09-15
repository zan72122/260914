import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAudioContext, resetAudio, resumeAudio } from '../src/audio/context';
import {
  playDestroy,
  playEnterIsland,
  playExitIsland,
  playFanfare,
  playFirework,
  playHorn,
  playLift,
  playMiss,
  playRotate,
  playSparkle,
  startEngine,
  stopEngine,
} from '../src/audio/sfx';
import { BGM_LEVEL, currentBgm, startBgm, stopBgm } from '../src/audio/bgm';

/**
 * 音は Playwright では鳴らせないので、ここでは AudioContext をモックして
 * 「例外なく呼べること」と「ノードが生成されること」だけを見る(7.5)。
 */

interface Created {
  oscillators: number;
  gains: number;
  filters: number;
  sources: number;
  delays: number;
}

const created: Created = { oscillators: 0, gains: 0, filters: 0, sources: 0, delays: 0 };

class Param {
  value = 0;
  setValueAtTime(): this {
    return this;
  }
  exponentialRampToValueAtTime(): this {
    return this;
  }
  linearRampToValueAtTime(): this {
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

class Node {
  connect(): this {
    return this;
  }
  disconnect(): void {
    /* noop */
  }
}

class Osc extends Node {
  type = 'sine';
  frequency = new Param();
  started = false;
  stopped = false;
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
}

class Gain extends Node {
  gain = new Param();
}

class Filter extends Node {
  type = 'bandpass';
  frequency = new Param();
  Q = new Param();
}

class Src extends Node {
  buffer: unknown = null;
  loop = false;
  start(): void {
    /* noop */
  }
  stop(): void {
    /* noop */
  }
}

class Delay extends Node {
  delayTime = new Param();
}

class MockAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state = 'suspended';
  destination = new Node();
  resumed = 0;
  resume(): Promise<void> {
    this.resumed++;
    this.state = 'running';
    return Promise.resolve();
  }
  createOscillator(): Osc {
    created.oscillators++;
    return new Osc();
  }
  createGain(): Gain {
    created.gains++;
    return new Gain();
  }
  createBiquadFilter(): Filter {
    created.filters++;
    return new Filter();
  }
  createBufferSource(): Src {
    created.sources++;
    return new Src();
  }
  createDelay(): Delay {
    created.delays++;
    return new Delay();
  }
  createBuffer(_ch: number, len: number): { getChannelData(): Float32Array } {
    const data = new Float32Array(len);
    return { getChannelData: () => data };
  }
}

function reset(): void {
  created.oscillators = 0;
  created.gains = 0;
  created.filters = 0;
  created.sources = 0;
  created.delays = 0;
}

beforeEach(() => {
  resetAudio();
  reset();
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = MockAudioContext;
});

afterEach(() => {
  stopBgm();
  stopEngine();
  resetAudio();
  delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
});

describe('AudioContext', () => {
  it('最初のタップで resume される(R1)', () => {
    resumeAudio();
    const ctx = getAudioContext() as unknown as MockAudioContext;
    expect(ctx.resumed).toBeGreaterThan(0);
  });

  it('AudioContext が無い環境でも例外を投げない', () => {
    resetAudio();
    delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
    expect(() => resumeAudio()).not.toThrow();
    expect(() => playRotate()).not.toThrow();
    expect(() => startBgm('desert-day')).not.toThrow();
    expect(getAudioContext()).toBeUndefined();
  });
});

describe('効果音(7.5)', () => {
  const cases: [string, () => void][] = [
    ['回転', playRotate],
    ['上げ', () => playLift(true)],
    ['下げ', () => playLift(false)],
    ['破壊', playDestroy],
    ['空振り', playMiss],
    ['クラクション', playHorn],
    ['ファンファーレ', playFanfare],
    ['紙吹雪', playSparkle],
    ['島に入る', playEnterIsland],
    ['島から出る', playExitIsland],
    ['花火', playFirework],
  ];

  for (const [name, fn] of cases) {
    it(`${name} は例外なく鳴らせて、ノードを作る`, () => {
      reset();
      expect(fn).not.toThrow();
      const total = created.oscillators + created.sources;
      expect(total).toBeGreaterThan(0);
      expect(created.gains).toBeGreaterThan(0);
    });
  }

  it('走行音は車と列車で作られ、止められる', () => {
    for (const kind of ['car', 'train'] as const) {
      reset();
      expect(() => startEngine(kind)).not.toThrow();
      expect(created.oscillators + created.sources).toBeGreaterThan(0);
      expect(() => stopEngine()).not.toThrow();
    }
  });

  it('走行音を二重に始めても例外にならない', () => {
    startEngine('car');
    expect(() => startEngine('train')).not.toThrow();
    stopEngine();
    expect(() => stopEngine()).not.toThrow();
  });
});

describe('BGM(7.5)', () => {
  it('テーマごとに開始でき、ノードを作る', () => {
    startBgm('desert-day');
    expect(currentBgm()).toBe('desert-day');
    expect(created.oscillators).toBeGreaterThan(0);
    expect(created.delays).toBeGreaterThan(0);
  });

  it('同じテーマを二重に開始しても鳴り直さない', () => {
    startBgm('night-rail');
    const first = created.oscillators;
    startBgm('night-rail');
    expect(created.oscillators).toBe(first);
  });

  it('別のテーマに切り替えられる', () => {
    startBgm('meadow');
    startBgm('map');
    expect(currentBgm()).toBe('map');
  });

  it('停止できる', () => {
    startBgm('map');
    stopBgm();
    expect(currentBgm()).toBeUndefined();
  });

  it('音量は効果音より控えめ(40% 程度)', () => {
    expect(BGM_LEVEL).toBeLessThanOrEqual(0.4);
    expect(BGM_LEVEL).toBeGreaterThan(0);
  });
});
