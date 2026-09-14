/** シード付き乱数によるレベル(色テーマ・楽器セット)の生成。 */
import {
  type InstrumentId, type Layer, type Song, type ThemeId, MAX_LEVELS,
} from './state';

/** mulberry32: 小さく決定的な乱数 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, arr: readonly T[], exclude: T[] = []): T {
  const pool = arr.filter((x) => !exclude.includes(x));
  return pool[Math.floor(r() * pool.length)];
}

const PERC: InstrumentId[] = ['drum', 'clap', 'shaker'];
const MELODY: InstrumentId[] = ['bell', 'bird', 'marimba', 'flute'];
const THEMES: ThemeId[] = ['meadow', 'beach', 'snow', 'sunset'];

/** レベルごとの pitch=0 の高さ。層ごとにオクターブ帯を分けて濁りを防ぐ。 */
const BASE_MIDI = [60, 72, 79, 48]; // C4, C5, G5, C3

export function generateLayer(seed: number, level: number): Layer {
  const r = rng(seed * 7919 + level * 104729 + 1);
  const rt = rng(seed * 31 + 17);
  // テーマは 4 レベルで重複しないように順列を作る
  const themes = [...THEMES];
  for (let i = themes.length - 1; i > 0; i--) {
    const j = Math.floor(rt() * (i + 1));
    [themes[i], themes[j]] = [themes[j], themes[i]];
  }
  const theme = themes[level % themes.length];

  let instruments: InstrumentId[];
  if (level === 0) {
    // 打楽器 2 種 + メロディ 1 種 + 打楽器 1 種(合計 4)
    const a = pick(r, PERC);
    const b = pick(r, PERC, [a]);
    instruments = [a, b, pick(r, MELODY), pick(r, PERC, [a, b])];
  } else if (level === MAX_LEVELS - 1) {
    // ベース必須 + メロディ 2 種 + 打楽器 1 種
    const m1 = pick(r, MELODY);
    instruments = ['frog', m1, pick(r, MELODY, [m1]), pick(r, PERC)];
  } else {
    // メロディ中心: メロディ 2〜3 種 + 打楽器 1 種
    const m1 = pick(r, MELODY);
    const m2 = pick(r, MELODY, [m1]);
    instruments = r() < 0.5
      ? [m1, m2, pick(r, PERC)]
      : [m1, m2, pick(r, MELODY, [m1, m2]), pick(r, PERC)];
  }
  return { theme, instruments, baseMidi: BASE_MIDI[level], placements: [], muted: false };
}

export function createSong(seed = Math.floor(Math.random() * 1e9)): Song {
  const layers: Layer[] = [];
  for (let i = 0; i < MAX_LEVELS; i++) layers.push(generateLayer(seed, i));
  return { version: 1, seed, layers, currentLevel: 0, tempoIdx: 1, phase: 'level' };
}
