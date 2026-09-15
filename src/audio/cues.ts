import type { ElementId } from '../flame/elements';

/**
 * 鳴らす音の種類。音声ファイルは持たず、すべて Web Audio で合成する（PLAN §3.6）。
 *
 * burner / waves は工房に鳴り続ける環境音。
 * material_enter / sparks は子どもの手と世界の反応。
 * current / flare_launch / battery_machine は「仕事が動いた」ときの物理音で、
 * 三つとも別の現象なので音も別に作る（PLAN §3.4）。
 */
export type CueId =
  | 'burner'
  | 'waves'
  | 'material_enter'
  | 'sparks'
  | 'current'
  | 'flare_launch'
  | 'battery_machine';

export type CueAction = 'start' | 'stop' | 'play' | 'change';

/** 検証で読む「鳴らす予定の音の列」の一件。 */
export interface AudioRecord {
  /** ゲーム内時刻（ms）。壁時計は使わない */
  t: number;
  cue: CueId;
  action: CueAction;
  /** その音を特徴づける小さな値（元素・仕事・強さなど） */
  data?: Record<string, unknown>;
}

/** 元素ごとに炎の音の色を少しだけ変える（塩が弾ける成分が増える）。 */
export const BURNER_ELEMENT_TONE: Record<ElementId, { bandHz: number; crackle: number }> = {
  copper: { bandHz: 1650, crackle: 0.35 },
  strontium: { bandHz: 1250, crackle: 0.6 },
  lithium: { bandHz: 1100, crackle: 0.5 },
};

/** 素のガス炎（何も入っていないとき）の音。 */
export const BURNER_BASE_TONE = { bandHz: 1400, crackle: 0.18 };

/** 火花が弾ける間隔（ゲーム内 ms）。切れた線が鳴らし続ける。 */
export const SPARK_INTERVAL_MS = 240;
