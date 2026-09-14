import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../src/core/audio/context';
import { Sfx } from '../src/core/audio/sfx';
import { Bgm, PENTATONIC, buildLoop, midiToHz } from '../src/core/audio/bgm';

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
