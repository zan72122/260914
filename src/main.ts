import { createPlayScreen } from './screens/play';
import { createMapScreen } from './screens/map';
import { levelByNumber, levels, type Level } from './levels';

/**
 * 起動即、地図画面(3.2: タイトル画面なし)。画面は地図とプレイの 2 つだけ(5.5)。
 * 文字は一切描画しない。
 *
 * デバッグ用に URL クエリを 3 つだけ見る(プレイヤーには一切見えない):
 *   ?level=N … N 面のプレイ画面から始める
 *   ?map=1   … 地図画面から始める(既定)
 *   ?debug=1 … window.__game に読み取り口を出す(E2E のタップ位置計算用)
 */
const params = new URLSearchParams(location.search);
const requested = Number.parseInt(params.get('level') ?? '', 10);
const startLevel = Number.isFinite(requested) ? levelByNumber(requested) : undefined;

const container = document.getElementById('app');

interface Screen {
  readonly debug: unknown;
  dispose(): void;
}

let current: Screen | undefined;
let currentKind: 'map' | 'play' = 'map';

function showMap(from?: number): void {
  if (!container) return;
  current?.dispose();
  currentKind = 'map';
  current = createMapScreen(container, {
    from,
    onEnter(level, index) {
      showPlay(level, index);
    },
  });
}

function showPlay(level: Level, index: number): void {
  if (!container) return;
  current?.dispose();
  currentKind = 'play';
  current = createPlayScreen(container, level, {
    onExit() {
      showMap(index);
    },
  });
}

if (container) {
  if (startLevel) {
    // デバッグ指定のときは «戻る» で地図へ出られるようにする
    showPlay(startLevel, levels.indexOf(startLevel));
  } else {
    showMap();
  }

  if (import.meta.env.DEV || params.get('debug') === '1') {
    // 画面が入れ替わっても同じ口から読めるよう、委譲するオブジェクトを 1 つだけ置く
    const readers = (): Record<string, unknown> => (current?.debug ?? {}) as Record<string, unknown>;
    const call = <T>(name: string, fallback: T, ...args: unknown[]): T => {
      const fn = readers()[name];
      return typeof fn === 'function' ? (fn as (...a: unknown[]) => T)(...args) : fallback;
    };
    (window as unknown as { __game?: unknown }).__game = {
      screen: () => currentKind,
      tools: () => call('tools', []),
      islands: () => call('islands', []),
      project: (x: number, y: number, z: number) => call('project', { x: 0, y: 0 }, x, y, z),
      connected: () => call('connected', false),
      cleared: () => call('cleared', false),
    };
  }
}
