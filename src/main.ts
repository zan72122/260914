import { createPlayScreen, type PlayScreen } from './screens/play';
import { createMapScreen } from './screens/map';
import { levelByNumber, levels, type Level } from './levels';

/**
 * 起動即、地図画面(3.2: タイトル画面なし)。画面は地図とプレイの 2 つだけ(5.5)。
 * 文字は一切描画しない。
 *
 * 地図画面は 1 度だけ作り、プレイ中は隠しておく(作り直すと戻るたびに固まるため)。
 *
 * デバッグ用に URL クエリを 3 つだけ見る(プレイヤーには一切見えない):
 *   ?level=N … N 面のプレイ画面から始める
 *   ?debug=1 … window.__game に読み取り口を出す(E2E のタップ位置計算用)
 */
const params = new URLSearchParams(location.search);
const requested = Number.parseInt(params.get('level') ?? '', 10);
const startLevel = Number.isFinite(requested) ? levelByNumber(requested) : undefined;

const container = document.getElementById('app');

let currentKind: 'map' | 'play' = 'map';
let play: PlayScreen | undefined;

/** 画面遷移の実測(ms)。E2E で «0.8s + 0.2s 以内» を確認する */
const timing = { toPlay: 0, toMap: 0, playBuild: 0 };
let enterStartedAt = 0;
let exitStartedAt = 0;

if (container) {
  const map = createMapScreen(container, {
    onEnterStart() {
      enterStartedAt = performance.now();
    },
    onEnter(level, index) {
      showPlay(level, index);
    },
  });

  function showMap(from?: number): void {
    play?.dispose();
    play = undefined;
    currentKind = 'map';
    map.show(from);
    if (exitStartedAt > 0) {
      timing.toMap = performance.now() - exitStartedAt;
      exitStartedAt = 0;
    }
  }

  function showPlay(level: Level, index: number): void {
    map.hide();
    currentKind = 'play';
    const t0 = performance.now();
    play = createPlayScreen(container!, level, {
      onExitStart() {
        exitStartedAt = performance.now();
      },
      onExit() {
        showMap(index);
      },
    });
    timing.playBuild = performance.now() - t0;
    if (enterStartedAt > 0) {
      timing.toPlay = performance.now() - enterStartedAt;
      enterStartedAt = 0;
    }
  }

  if (startLevel) {
    // デバッグ指定のときは «戻る» で地図へ出られるようにする
    showPlay(startLevel, levels.indexOf(startLevel));
  } else {
    map.show();
  }

  if (import.meta.env.DEV || params.get('debug') === '1') {
    // 画面が入れ替わっても同じ口から読めるよう、委譲するオブジェクトを 1 つだけ置く
    const readers = (): Record<string, unknown> =>
      ((currentKind === 'play' ? play?.debug : map.debug) ?? {}) as Record<string, unknown>;
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
      rotating: () => call('rotating', false),
      islandDiameterPx: () => call('islandDiameterPx', 0),
      portrait: () => call('portrait', false),
      timing: () => ({ ...timing }),
    };
  }
}
