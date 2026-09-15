// main.js — boot, initial layout, resize (docs/01.md 4.1, 4.4).
// Phase F1/F2: no audio, no save, no staging yet.

import { Board } from './board.js';
import { Tile, TILE_DEFS, loadArt } from './tile.js';
import { InputController, hardenGestures } from './input.js';
import { PuzzleRunner } from './puzzles.js';

// Initial placement, docs/01.md 3.3 P1:
//   T3 top-left (dim), T2 top-right, T1 bottom-left, T4 bottom-right (dim)
const START = [
  ['T3', 'T2'],
  ['T1', 'T4']
];

async function boot() {
  await loadArt();

  const boardEl = document.getElementById('board');
  const tilesEl = document.getElementById('tiles');
  const board = new Board(boardEl, tilesEl);

  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const id = START[r][c];
      if (!id) continue;
      board.add(new Tile(TILE_DEFS[id]), r, c);
    }
  }
  board.layout();

  hardenGestures(document);
  new InputController(board);
  new PuzzleRunner(board);

  const relayout = () => board.layout();
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', () => setTimeout(relayout, 60));
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(boardEl);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout).catch(() => {});

  // exposed for the e2e harness only; carries no UI and no text
  window.__game = { board, relayout };
  document.documentElement.dataset.ready = '1';
}

boot();
