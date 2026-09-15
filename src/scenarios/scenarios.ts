import { BENCH_SURFACE } from '../game/layout';
import { AFTERGLOW_MS, World } from '../game/world';

export type ScenarioName =
  | 'bench_idle'
  | 'copper_called'
  | 'flare_called'
  | 'battery_called'
  | 'wrong_delivery'
  | 'two_reds_on_bench';

export interface Scenario {
  name: ScenarioName;
  /** 既定の乱数種（困りの発生順、火花の散り方） */
  seed: number;
  /** 通常の初期化で生まれた世界を、開始状態まで進める */
  apply: (world: World) => void;
}

/** 台の上の位置（長辺方向の割合で指定）。 */
function benchSpot(world: World, along: number): { x: number; y: number } {
  const b = world.layout.bench;
  return { x: b.x + b.w * along, y: b.y + b.h * (BENCH_SURFACE + 0.08) };
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
    apply: (world) => {
      world.troubleCycle = false;
    },
  },
  // 配線が切れて火花、作業員が「どう〜」を呼んだ直後
  copper_called: {
    name: 'copper_called',
    seed: 20250915,
    apply: (world) => {
      world.raiseTrouble('wiring');
    },
  },
  // 沖の船が手を振り、桟橋の人が「ストロンチウム〜」を呼んだ直後
  flare_called: {
    name: 'flare_called',
    seed: 20250916,
    apply: (world) => {
      world.raiseTrouble('flare');
    },
  },
  // リモコンの電池室が空、机の人が「リチウム〜」を呼んだ直後
  battery_called: {
    name: 'battery_called',
    seed: 20250917,
    apply: (world) => {
      world.raiseTrouble('battery');
    },
  },
  // copper_called と同じだが、手にリチウムを持って配線の上にいる状態の直前。
  // 位置と保持状態だけを置く。届け判定は通常の入力経路（指を離す）を通る。
  wrong_delivery: {
    name: 'wrong_delivery',
    seed: 20250918,
    apply: (world) => {
      world.raiseTrouble('wiring');
      const m = world.materialOfElement('lithium');
      const gap = world.layout.wireGap;
      m.at = 'held';
      m.x = gap.x;
      m.y = gap.y - world.layout.touchRadius * 0.6;
      m.inFlame = false;
      // 炎を通ってきた直後なので、まだ余熱で色を持っている
      m.afterglowMs = AFTERGLOW_MS;
      world.heldId = m.id;
      world.phase = 'delivering';
    },
  },
  // 困りなし。ストロンチウムとリチウムの材料が台の中央に並ぶ（M3 のプリズム用の配置）
  two_reds_on_bench: {
    name: 'two_reds_on_bench',
    seed: 20250919,
    apply: (world) => {
      world.troubleCycle = false;
      const sr = world.materialOfElement('strontium');
      const li = world.materialOfElement('lithium');
      const a = benchSpot(world, 0.63);
      const b = benchSpot(world, 0.75);
      sr.x = a.x;
      sr.y = a.y;
      li.x = b.x;
      li.y = b.y;
    },
  },
};

export const SCENARIO_NAMES = Object.keys(SCENARIOS) as ScenarioName[];

/**
 * 本番の開始状態。起動即工房で、毎回この一つから始まる。
 * 検証用の入口（?scenario= / ?speak=）は開発ビルドでしか読まない。
 */
export const PRODUCTION_SCENARIO: ScenarioName = 'copper_called';
