import { Game } from './game/Game';
import type { ScenarioName } from './scenarios/scenarios';

const params = new URLSearchParams(location.search);
const container = document.getElementById('app') as HTMLElement;
container.style.width = '100%';
container.style.height = '100%';

const scenario = (params.get('scenario') ?? 'copper_called') as ScenarioName;

async function boot(): Promise<Game> {
  return Game.create({
    container,
    // 検証では実発話せず、発話予定テキストを記録する（?speak=1 で実発話）
    captureSpeech: import.meta.env.DEV && !params.has('speak'),
    clockMode: 'real',
    scenario,
  });
}

/** 開発用入口（src/dev/devMain.ts）だけがこれを使う。本番ビルドには devMain が含まれない。 */
export const gameReady: Promise<Game> = boot();
