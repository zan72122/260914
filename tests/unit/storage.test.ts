import { describe, it, expect } from 'vitest';
import { saveSong, loadSong, isValidSong, migrateV1, STORAGE_KEY, STORAGE_KEY_V1 } from '../../src/app/storage';
import { createSong } from '../../src/app/levels';
import { setPlacement, removePlacement, currentLayer, isFree, MAX_PLACEMENTS, type Layer } from '../../src/app/state';

function mem() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    map: m,
  };
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
    s.setItem(STORAGE_KEY, '{"version":2}');
    expect(loadSong(s)).toBeNull();
    s.setItem(STORAGE_KEY, 'not json');
    expect(loadSong(s)).toBeNull();
    expect(isValidSong({ ...createSong(1), currentLevel: 9 })).toBe(false);
  });
  it('v1 のデータは train として移行され、v1 は消える', () => {
    const s = mem();
    const v2 = createSong(3);
    const v1 = { ...v2, version: 1, layers: v2.layers.map(({ kind: _k, ...rest }) => rest) };
    s.setItem(STORAGE_KEY_V1, JSON.stringify(v1));
    const loaded = loadSong(s);
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(2);
    expect(loaded!.layers.every((l) => l.kind === 'train')).toBe(true);
    expect(s.map.has(STORAGE_KEY)).toBe(true);
    expect(s.map.has(STORAGE_KEY_V1)).toBe(false);
    expect(migrateV1({ version: 3 })).toBeNull();
  });
});

describe('placements', () => {
  it('汽車ループは 1 穴 1 楽器', () => {
    const l: Layer = { ...createSong(1).layers[0], kind: 'train' };
    setPlacement(l, { slot: 2, inst: 'drum', pitch: 0 });
    setPlacement(l, { slot: 2, inst: 'bell', pitch: 4 });
    expect(l.placements).toEqual([{ slot: 2, inst: 'bell', pitch: 4 }]);
    expect(isFree(l, 2, 1)).toBe(false);
    expect(removePlacement(l, 2)?.inst).toBe('bell');
    expect(l.placements).toEqual([]);
  });
  it('格子は列 × 行で一意、上限あり', () => {
    const l: Layer = { ...createSong(1).layers[1], kind: 'grid', placements: [] };
    setPlacement(l, { slot: 2, inst: 'drum', pitch: 0 });
    setPlacement(l, { slot: 2, inst: 'bell', pitch: 4 });
    setPlacement(l, { slot: 2, inst: 'bird', pitch: 4 });
    expect(l.placements.map((p) => p.inst)).toEqual(['drum', 'bird']);
    expect(isFree(l, 2, 4)).toBe(false);
    expect(isFree(l, 2, 1)).toBe(true);
    for (let i = 0; i < 20; i++) { const slot = i % 8, pitch = Math.floor(i / 8) + 1; if (isFree(l, slot, pitch)) setPlacement(l, { slot, inst: 'bell', pitch }); }
    expect(l.placements.length).toBe(MAX_PLACEMENTS);
    expect(isFree(l, 7, 4)).toBe(false);
    expect(removePlacement(l, 2, 4)?.inst).toBe('bird');
  });
});
