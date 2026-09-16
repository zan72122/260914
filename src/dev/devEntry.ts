import type { Game } from '../game/Game';
import type { ClockMode } from '../core/GameClock';
import type { ScenarioName } from '../scenarios/scenarios';
import { SCENARIO_NAMES } from '../scenarios/scenarios';

/**
 * 開発用の薄い入口。開発ビルド（dev サーバ）でのみ読み込まれる。
 * 本番ビルドにはこのモジュールごと含まれない。
 */
export function installDevEntry(game: Game): void {
  const api = {
    scenarios: SCENARIO_NAMES,
    loadScenario: (name: ScenarioName) => game.loadScenario(name),
    ready: () => game.ready(),
    state: () => game.state(),
    log: (n?: number) => game.logTail(n),
    clock: {
      mode: (m?: ClockMode) => {
        if (m) game.clock.setMode(m);
        return game.clock.mode;
      },
      step: (ms: number) => game.clock.step(ms),
      timeMs: () => game.clock.timeMs,
    },
    rng: {
      seed: (n: number) => game.setSeed(n),
    },
    speech: {
      captured: () => game.speech.captured(),
    },
    dump: (section: 'materials' | 'jobs' | 'flame' | 'layout' | 'audio') => game.dump(section),
    // 検証が実ポインタを当てるための世界座標（状態の代入はできない）
    points: () => game.points(),
    flameRect: () => game.flameRect(),
  };
  (window as unknown as Record<string, unknown>).__fire = api;
}
