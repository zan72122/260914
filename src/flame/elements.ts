/** v1 の元素。赤2種（ストロンチウム=緋 / リチウム=深紅）を最初から共存させる。 */
export type ElementId = 'copper' | 'strontium' | 'lithium';

export const ELEMENT_IDS: readonly ElementId[] = ['copper', 'strontium', 'lithium'];

/** 発話用のかな。名前は「求める声」と「礼の声」としてだけ現れる。 */
export const ELEMENT_KANA: Record<ElementId, string> = {
  copper: 'どう',
  strontium: 'すとろんちうむ',
  lithium: 'りちうむ',
};

/** ログ・報告用の表記（画面には描かない）。 */
export const ELEMENT_LABEL: Record<ElementId, string> = {
  copper: '銅',
  strontium: 'ストロンチウム',
  lithium: 'リチウム',
};
