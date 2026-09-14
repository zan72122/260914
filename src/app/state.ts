/** 曲・レベル・配置の状態モデル。描画や音に依存しない純粋なデータ。 */

export type InstrumentId =
  | 'drum' | 'clap' | 'shaker'
  | 'bell' | 'bird' | 'marimba' | 'flute' | 'frog';

export type InstrumentKind = 'perc' | 'melody';

export const INSTRUMENT_KIND: Record<InstrumentId, InstrumentKind> = {
  drum: 'perc', clap: 'perc', shaker: 'perc',
  bell: 'melody', bird: 'melody', marimba: 'melody', flute: 'melody', frog: 'melody',
};

export type ThemeId = 'meadow' | 'beach' | 'snow' | 'sunset';

export const STEPS = 8;           // 1 周のステップ数
export const PITCHES = 5;         // ペンタトニック 5 音
export const MAX_LEVELS = 4;      // 4 層で駅へ
export const TEMPOS_BPM = [80, 100, 125] as const;

/** C メジャーペンタトニック(半音) */
export const SCALE = [0, 2, 4, 7, 9] as const;

export interface Placement {
  slot: number;        // 0..STEPS-1
  inst: InstrumentId;
  pitch: number;       // 0..PITCHES-1 (打楽器では未使用)
}

export interface Layer {
  theme: ThemeId;
  instruments: InstrumentId[];  // このレベルのおもちゃ箱の中身
  baseMidi: number;             // pitch=0 の MIDI ノート番号
  placements: Placement[];
  muted: boolean;
}

export type Phase = 'level' | 'finale';

export interface Song {
  version: 1;
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

export function placementAt(layer: Layer, slot: number): Placement | undefined {
  return layer.placements.find((p) => p.slot === slot);
}

export function setPlacement(layer: Layer, placement: Placement): void {
  layer.placements = layer.placements.filter((p) => p.slot !== placement.slot);
  layer.placements.push(placement);
  layer.placements.sort((a, b) => a.slot - b.slot);
}

export function removePlacement(layer: Layer, slot: number): Placement | undefined {
  const found = placementAt(layer, slot);
  layer.placements = layer.placements.filter((p) => p.slot !== slot);
  return found;
}
