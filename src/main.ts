import { Game } from './app/game';
import { attachPointer } from './input/pointer';

const canvas = document.getElementById('c') as HTMLCanvasElement;
try {
  const game = new Game(canvas);
  attachPointer(canvas, {
    down: (x, y) => game.down(x, y),
    move: (x, y) => game.move(x, y),
    up: (x, y) => game.up(x, y),
    cancel: () => game.cancel(),
  });
} catch (e) {
  // WebGL が使えない環境: 背景色だけ残して静かに終える
  console.error(e);
}
