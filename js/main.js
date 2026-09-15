// main.js — boot, initial layout, resize, restart (docs/01.md 4.1, 4.4).

import { Board } from './board.js';
import { Tile, TILE_DEFS, loadArt } from './tile.js';
import { InputController, hardenGestures } from './input.js';
import { PuzzleRunner, stageEnding } from './puzzles.js';
import { HintController } from './hints.js';

// Initial placement (docs/02.md D2): top-left empty, T4 top-right (grey),
// T1 bottom-left, T2 bottom-right. T3 only appears once P1 is solved.
const START = [
  [null, 'T4'],
  ['T1', 'T2']
];

function build(board) {
  board.clear();
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const id = START[r][c];
      if (!id) continue;
      board.add(new Tile(TILE_DEFS[id]), r, c);
    }
  }
  board.layout();
}

async function boot() {
  await loadArt();

  const boardEl = document.getElementById('board');
  const tilesEl = document.getElementById('tiles');
  const fxEl = document.getElementById('fx');
  const stageEl = document.getElementById('stage');
  const board = new Board(boardEl, tilesEl);

  build(board);

  /** Ending -> the flower drops a seed -> tapping it floats back to the start. */
  async function restart() {
    stageEl.classList.add('fading');
    await new Promise((r) => setTimeout(r, 560));
    fxEl.replaceChildren();
    document.body.classList.remove('ending');
    build(board);
    runner.reset();
    board.busy = false;
    document.dispatchEvent(new CustomEvent('game:restart'));
    stageEl.classList.remove('fading');
  }

  const runner = new PuzzleRunner(board, { onEnding: () => stageEnding(board, restart) });

  hardenGestures(document);
  new InputController(board);
  const hints = new HintController(board, runner);

  const relayout = () => board.layout();
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', () => setTimeout(relayout, 60));
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(boardEl);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout).catch(() => {});

  // exposed for the e2e harness only; carries no UI and no text
  window.__game = { board, runner, hints, relayout, restart };
  document.documentElement.dataset.ready = '1';
}

boot();
