/** 色パレットと共有マテリアル。同じ色は 1 つのマテリアルを使い回す。 */
import { MeshLambertMaterial, MeshBasicMaterial, Color, DoubleSide } from 'three';

const cache = new Map<string, MeshLambertMaterial>();

export function mat(color: string | number, opts: { emissive?: number; flat?: boolean } = {}): MeshLambertMaterial {
  const key = `${color}|${opts.emissive ?? 0}|${opts.flat ?? true}`;
  let m = cache.get(key);
  if (!m) {
    m = new MeshLambertMaterial({ color: new Color(color), flatShading: opts.flat ?? true });
    if (opts.emissive) m.emissive = new Color(opts.emissive);
    cache.set(key, m);
  }
  return m;
}

/** 光る・半透明のもの用(影に影響しない) */
export function glow(color: string | number, opacity = 0.5): MeshBasicMaterial {
  return new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity, depthWrite: false, side: DoubleSide });
}

export const PALETTE = {
  wood: '#c98a4b', woodDark: '#8b5a2b', woodLight: '#e0b883',
  rail: '#5c3a1a', tie: '#a9835a', bed: '#d9c39a',
  red: '#d94f4f', yellow: '#f2c744', blue: '#4f8fd9', green: '#5cb85c',
  cream: '#fff3d6', dark: '#3a2a1a', black: '#2b2b2b',
  orange: '#f2a33a', pink: '#f28cb0', purple: '#8a5aa8',
};

export const INSTRUMENT_COLOR = {
  drum: '#d94f4f', clap: '#a2643a', shaker: '#f2c744', bell: '#e0a92c',
  bird: '#4f8fd9', marimba: '#c98a4b', flute: '#8b5a2b', frog: '#5cb85c',
} as const;

export const WAGON_COLORS = ['#4f8fd9', '#5cb85c', '#f2c744', '#c98a4b'];
