/** 進行中の曲の自動保存・復元(localStorage)。 */
import { type Song, MAX_LEVELS, STEPS, PITCHES, TEMPOS_BPM } from './state';

export const STORAGE_KEY = 'tune-train/song/v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function saveSong(song: Song, storage: StorageLike | undefined = safeStorage()): void {
  if (!storage) return;
  try { storage.setItem(STORAGE_KEY, JSON.stringify(song)); } catch { /* 容量不足などは無視 */ }
}

export function loadSong(storage: StorageLike | undefined = safeStorage()): Song | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const song = JSON.parse(raw) as Song;
    return isValidSong(song) ? song : null;
  } catch {
    return null;
  }
}

export function isValidSong(s: unknown): s is Song {
  if (!s || typeof s !== 'object') return false;
  const o = s as Song;
  if (o.version !== 1) return false;
  if (!Array.isArray(o.layers) || o.layers.length !== MAX_LEVELS) return false;
  if (!Number.isInteger(o.currentLevel) || o.currentLevel < 0 || o.currentLevel >= MAX_LEVELS) return false;
  if (!Number.isInteger(o.tempoIdx) || o.tempoIdx < 0 || o.tempoIdx >= TEMPOS_BPM.length) return false;
  if (o.phase !== 'level' && o.phase !== 'finale') return false;
  return o.layers.every((l) =>
    Array.isArray(l.instruments) && l.instruments.length > 0 &&
    typeof l.baseMidi === 'number' && typeof l.theme === 'string' &&
    Array.isArray(l.placements) &&
    l.placements.every((p) =>
      Number.isInteger(p.slot) && p.slot >= 0 && p.slot < STEPS &&
      typeof p.inst === 'string' &&
      Number.isInteger(p.pitch) && p.pitch >= 0 && p.pitch < PITCHES));
}

function safeStorage(): StorageLike | undefined {
  try { return typeof localStorage !== 'undefined' ? localStorage : undefined; } catch { return undefined; }
}
