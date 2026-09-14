/** 曲・レベル・配置の状態モデル(v2)。描画や音に依存しない純粋なデータ。 */

export type InstrumentId =
  | 'drum' | 'clap' | 'shaker'
  | 'bell' | 'bird' | 'marimba' | 'flute' | 'frog';

export type InstrumentKind = 'perc' | 'melody';

export const INSTRUMENT_KIND: Record<InstrumentId, InstrumentKind> = {
  drum: 'perc', clap: 'perc', shaker: 'perc',
  bell: 'melody', bird: 'melody', marimba: 'melody', flute: 'melody', frog: 'melody',
};

export type ThemeId = 'meadow' | 'beach' | 'snow' | 'sunset';

/** レベル形式: 汽車ループ / 格子の島 / オルゴール台 */
export type LevelKind = 'train' | 'grid' | 'musicbox';

export const STEPS = 8;           // 1 周のステップ数(= 列)
export const PITCHES = 5;         // ペンタトニック 5 音(= 行)
export const MAX_LEVELS = 4;      // 4 層で駅へ
export const TEMPOS_BPM = [80, 100, 125] as const;
export const MAX_PLACEMENTS = 12; // grid / musicbox の 1 レベルあたり上限

/** C メジャーペンタトニック(半音) */
export const SCALE = [0, 2, 4, 7, 9] as const;

export interface Placement {
  slot: number;        // 0..STEPS-1(列 = 拍)
  inst: InstrumentId;
  pitch: number;       // 0..PITCHES-1(行 = 高さ。打楽器では音に影響しない)
}

export interface Layer {
  kind: LevelKind;
  theme: ThemeId;
  instruments: InstrumentId[];  // このレベルのおもちゃ箱の中身
  baseMidi: number;             // pitch=0 の MIDI ノート番号
  placements: Placement[];
  muted: boolean;
}

export type Phase = 'level' | 'finale';

export interface Song {
  version: 2;
  seed: number;
  layers: Layer[];        // 常に MAX_LEVELS 個
  currentLevel: number;   // 0..MAX_LEVELS-1
  tempoIdx: number;       // 0..TEMPOS_BPM.length-1
  phase: Phase;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function pitchToMidi(layer: Layer, pitch: number): number {
  const p = Math.max(0, Math.min(PITCHES - 1, Math.round(pitch)));
  return layer.baseMidi + SCALE[p];
}

export function currentLayer(song: Song): Layer {
  return song.layers[song.currentLevel];
}

/** 汽車の後ろに付いている貨車(= 完成済みの層) */
export function wagonLayers(song: Song): Layer[] {
  return song.phase === 'finale'
    ? song.layers
    : song.layers.slice(0, song.currentLevel);
}

/** 汽車ループは 1 列 1 つ。それ以外は列 × 行で一意。 */
export function onePerSlot(kind: LevelKind): boolean {
  return kind === 'train';
}

export function placementsAt(layer: Layer, slot: number): Placement[] {
  return layer.placements.filter((p) => p.slot === slot);
}

export function placementAt(layer: Layer, slot: number, pitch?: number): Placement | undefined {
  if (onePerSlot(layer.kind) || pitch === undefined) return layer.placements.find((p) => p.slot === slot);
  return layer.placements.find((p) => p.slot === slot && p.pitch === pitch);
}

export function isFree(layer: Layer, slot: number, pitch: number): boolean {
  if (placementAt(layer, slot, pitch)) return false;
  return onePerSlot(layer.kind) || layer.placements.length < MAX_PLACEMENTS;
}

export function setPlacement(layer: Layer, placement: Placement): void {
  layer.placements = layer.placements.filter((p) =>
    onePerSlot(layer.kind) ? p.slot !== placement.slot : !(p.slot === placement.slot && p.pitch === placement.pitch));
  layer.placements.push({ ...placement });
  layer.placements.sort((a, b) => a.slot - b.slot || a.pitch - b.pitch);
}

export function removePlacement(layer: Layer, slot: number, pitch?: number): Placement | undefined {
  const found = placementAt(layer, slot, pitch);
  if (!found) return undefined;
  layer.placements = layer.placements.filter((p) => p !== found);
  return found;
}
