import { createPlayScreen } from './screens/play';
import { levelByNumber, levels } from './levels';

/**
 * 起動即プレイ画面(3.2: タイトル画面なし)。
 * 地図画面は M4 で追加する。文字は一切描画しない。
 *
 * デバッグ用に URL クエリを 2 つだけ見る(プレイヤーには一切見えない):
 *   ?level=N … N 面から始める
 *   ?debug=1 … window.__game に読み取り口を出す(E2E のタップ位置計算用)
 */
const params = new URLSearchParams(location.search);
const requested = Number.parseInt(params.get('level') ?? '', 10);
const level = (Number.isFinite(requested) ? levelByNumber(requested) : undefined) ?? levels[0]!;

const container = document.getElementById('app');
if (container) {
  const screen = createPlayScreen(container, level);
  if (import.meta.env.DEV || params.get('debug') === '1') {
    (window as unknown as { __game?: unknown }).__game = screen.debug;
  }
}
