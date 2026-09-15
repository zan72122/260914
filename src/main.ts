import { Game } from './game/Game';
import { PRODUCTION_SCENARIO, type ScenarioName } from './scenarios/scenarios';

const container = document.getElementById('app') as HTMLElement;
container.style.width = '100%';
container.style.height = '100%';

function devParams(): { scenario: ScenarioName; captureSpeech: boolean } {
  if (!import.meta.env.DEV) {
    return { scenario: PRODUCTION_SCENARIO, captureSpeech: false };
  }
  const params = new URLSearchParams(location.search);
  return {
    scenario: (params.get('scenario') ?? PRODUCTION_SCENARIO) as ScenarioName,
    // 検証では実発話せず、発話予定テキストを記録する（?speak=1 で実発話）
    captureSpeech: !params.has('speak'),
  };
}

async function boot(): Promise<Game> {
  const { scenario, captureSpeech } = devParams();
  return Game.create({ container, captureSpeech, clockMode: 'real', scenario });
}

/** 開発用入口（src/dev/devMain.ts）だけがこれを使う。本番ビルドには devMain が含まれない。 */
export const gameReady: Promise<Game> = boot();
