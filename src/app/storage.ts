/** 進行中の曲の自動保存・復元(localStorage)。v1 のデータは v2 に移行する。 */
import { type Song, type Layer, MAX_LEVELS, STEPS, PITCHES, TEMPOS_BPM } from './state';

export const STORAGE_KEY = 'tune-train/song/v2';
export const STORAGE_KEY_V1 = 'tune-train/song/v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function saveSong(song: Song, storage: StorageLike | undefined = safeStorage()): void {
  if (!storage) return;
  try { storage.setItem(STORAGE_KEY, JSON.stringify(song)); } catch { /* 容量不足などは無視 */ }
}

export function loadSong(storage: StorageLike | undefined = safeStorage()): Song | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const song = JSON.parse(raw);
      return isValidSong(song) ? song : null;
    }
    const v1 = storage.getItem(STORAGE_KEY_V1);
    if (v1) {
      const migrated = migrateV1(JSON.parse(v1));
      if (migrated) {
        saveSong(migrated, storage);
        storage.removeItem?.(STORAGE_KEY_V1);
      }
      return migrated;
    }
    return null;
  } catch {
    return null;
  }
}

/** v1(汽車ループのみ)→ v2: すべての層を kind: 'train' として引き継ぐ */
export function migrateV1(s: unknown): Song | null {
  if (!s || typeof s !== 'object') return null;
  const o = s as { version?: number; layers?: Partial<Layer>[]; seed?: number; currentLevel?: number; tempoIdx?: number; phase?: string };
  if (o.version !== 1 || !Array.isArray(o.layers)) return null;
  const song = {
    ...o,
    version: 2 as const,
    layers: o.layers.map((l) => ({ ...l, kind: 'train' as const })),
  } as Song;
  return isValidSong(song) ? song : null;
}

export function isValidSong(s: unknown): s is Song {
  if (!s || typeof s !== 'object') return false;
  const o = s as Song;
  if (o.version !== 2) return false;
  if (!Array.isArray(o.layers) || o.layers.length !== MAX_LEVELS) return false;
  if (!Number.isInteger(o.currentLevel) || o.currentLevel < 0 || o.currentLevel >= MAX_LEVELS) return false;
  if (!Number.isInteger(o.tempoIdx) || o.tempoIdx < 0 || o.tempoIdx >= TEMPOS_BPM.length) return false;
  if (o.phase !== 'level' && o.phase !== 'finale') return false;
  if (typeof o.seed !== 'number') return false;
  return o.layers.every((l) =>
    (l.kind === 'train' || l.kind === 'grid' || l.kind === 'musicbox') &&
    Array.isArray(l.instruments) && l.instruments.length > 0 &&
    typeof l.baseMidi === 'number' && typeof l.theme === 'string' &&
    typeof l.muted === 'boolean' &&
    Array.isArray(l.placements) &&
    l.placements.every((p) =>
      Number.isInteger(p.slot) && p.slot >= 0 && p.slot < STEPS &&
      typeof p.inst === 'string' &&
      Number.isInteger(p.pitch) && p.pitch >= 0 && p.pitch < PITCHES));
}

function safeStorage(): StorageLike | undefined {
  try { return typeof localStorage !== 'undefined' ? localStorage : undefined; } catch { return undefined; }
}
