import type { World } from '../game/world';

export type ScenarioName = 'bench_idle' | 'copper_called';

export interface Scenario {
  name: ScenarioName;
  /** 既定の乱数種（困りの発生順、火花の散り方） */
  seed: number;
  /** 通常の初期化で生まれた世界を、開始状態まで進める */
  apply: (world: World) => void;
}

/**
 * 名前付きシナリオ。どれも「通常の初期化 → 世界生成 → 指定状態へ進める」の順で、
 * 前回の残りを持ち越さない（Game.loadScenario が必ず全破棄から始める）。
 */
export const SCENARIOS: Record<ScenarioName, Scenario> = {
  // 全材料が台、困りなし、炎は青
  bench_idle: {
    name: 'bench_idle',
    seed: 20250914,
    apply: () => {},
  },
  // 配線が切れて火花、作業員が「どう〜」を呼んだ直後
  copper_called: {
    name: 'copper_called',
    seed: 20250915,
    apply: (world) => {
      world.raiseTrouble('wiring');
    },
  },
};

export const SCENARIO_NAMES = Object.keys(SCENARIOS) as ScenarioName[];
