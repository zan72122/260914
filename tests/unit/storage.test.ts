import { describe, it, expect } from 'vitest';
import { saveSong, loadSong, isValidSong, STORAGE_KEY } from '../../src/app/storage';
import { createSong, } from '../../src/app/levels';
import { setPlacement, removePlacement, currentLayer } from '../../src/app/state';

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, map: m };
}

describe('storage', () => {
  it('保存して復元できる', () => {
    const s = mem();
    const song = createSong(7);
    setPlacement(currentLayer(song), { slot: 3, inst: 'drum', pitch: 0 });
    saveSong(song, s);
    expect(loadSong(s)).toEqual(song);
  });
  it('壊れたデータは無視する', () => {
    const s = mem();
    s.setItem(STORAGE_KEY, '{"version":1}');
    expect(loadSong(s)).toBeNull();
    s.setItem(STORAGE_KEY, 'not json');
    expect(loadSong(s)).toBeNull();
    expect(isValidSong({ ...createSong(1), currentLevel: 9 })).toBe(false);
  });
  it('配置は 1 穴 1 楽器', () => {
    const l = createSong(1).layers[0];
    setPlacement(l, { slot: 2, inst: 'drum', pitch: 0 });
    setPlacement(l, { slot: 2, inst: 'bell', pitch: 4 });
    expect(l.placements).toEqual([{ slot: 2, inst: 'bell', pitch: 4 }]);
    expect(removePlacement(l, 2)?.inst).toBe('bell');
    expect(l.placements).toEqual([]);
  });
});
