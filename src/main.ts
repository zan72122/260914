import { createPlayScreen } from './screens/play';
import { level01 } from './levels';

/**
 * 起動即プレイ画面(3.2: タイトル画面なし)。
 * 地図画面は M4 で追加する。文字は一切描画しない。
 */
const container = document.getElementById('app');
if (container) {
  createPlayScreen(container, level01);
}
