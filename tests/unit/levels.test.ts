import { describe, it, expect } from 'vitest';
import { createSong, generateLayer } from '../../src/app/levels';
import { MAX_LEVELS, INSTRUMENT_KIND } from '../../src/app/state';

describe('levels', () => {
  it('同じシードなら同じ曲になる', () => {
    expect(createSong(42)).toEqual(createSong(42));
  });
  it('レベル 1 は打楽器 2 種以上、最終レベルはかえるを含む', () => {
    for (let seed = 1; seed < 60; seed++) {
      const l0 = generateLayer(seed, 0);
      expect(l0.instruments.filter((i) => INSTRUMENT_KIND[i] === 'perc').length).toBeGreaterThanOrEqual(2);
      expect(generateLayer(seed, MAX_LEVELS - 1).instruments).toContain('frog');
      const song = createSong(seed);
      expect(new Set(song.layers.map((l) => l.theme)).size).toBe(MAX_LEVELS);
      for (const l of song.layers) expect(new Set(l.instruments).size).toBe(l.instruments.length);
    }
  });
});
