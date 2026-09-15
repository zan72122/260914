// main.js — boot, initial layout, resize, save/restore, restart (docs/01.md 4.1, 4.4, 3.4).

import { Board } from './board.js';
import { Tile, TILE_DEFS, loadArt } from './tile.js';
import { InputController, hardenGestures } from './input.js';
import { PuzzleRunner, PUZZLES, stageEnding } from './puzzles.js';
import { restoreTo } from './staging.js';
import { HintController } from './hints.js';
import { loadProgress, saveProgress, clearProgress } from './save.js';
import { audio } from './audio.js';

// Initial placement (docs/02.md D2): top-left empty, T4 top-right (grey),
// T1 bottom-left, T2 bottom-right. T3 only appears once P1 is solved.
const START = [
  [null, 'T4'],
  ['T1', 'T2']
];

const RESET_HOLD_MS = 3000;   // docs/01.md 3.4: the only hidden gesture
const RESET_SLOP = 14;        // px of finger travel still counted as "held"

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

  /**
   * Run `fn` with every board transition switched off, then let them back in on
   * the next frame. Used by the silent restore and by the restart (R3): the new
   * state is reached instantly instead of easing in front of the child.
   */
  function withoutTransitions(fn) {
    document.body.classList.add('instant');
    fn();
    void boardEl.offsetWidth;                 // settle the new values now
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.body.classList.remove('instant');
      board.layout();
    }));
  }

  // Saved progress: rebuild that state silently, with no staging and no sound
  // (docs/03.md F5). Done before the runner exists, so nothing can re-fire.
  const saved = loadProgress();
  if (saved > 0) withoutTransitions(() => restoreTo(board, saved));

  /** Ending -> the flower drops a seed -> tapping it floats back to the start. */
  async function restart() {
    stageEl.classList.add('fading');
    await new Promise((r) => setTimeout(r, 560));
    fxEl.replaceChildren();
    // R3: snap every ending transition (gap, cell frames, vignette, sky) back to
    // its initial value while the stage is invisible, instead of easing for 2.4s.
    withoutTransitions(() => {
      document.body.classList.remove('ending');
      build(board);
      runner.reset();
      board.busy = false;
    });
    document.dispatchEvent(new CustomEvent('game:restart'));
    stageEl.classList.remove('fading');
  }

  /** The hidden reset: three seconds on the open flower (docs/01.md 3.4). */
  function hardReset() {
    clearProgress();
    return restart();
  }

  const runner = new PuzzleRunner(board, { onEnding: () => stageEnding(board, restart) });
  runner.index = saved;
  for (let i = 0; i < saved; i++) runner.solved.add(PUZZLES[i].id);

  document.addEventListener('puzzle:solved', () => saveProgress(runner.index));
  document.addEventListener('puzzle:ending', () => clearProgress());
  document.addEventListener('game:restart', () => clearProgress());

  hardenGestures(document);
  new InputController(board);
  const hints = new HintController(board, runner);

  /* ---- sound wakes up on the first touch (iOS needs the gesture) ---- */
  window.addEventListener('pointerdown', () => audio.unlock(), { capture: true, passive: true });

  /* ---- 3 second press on the open flower = back to the very beginning ---- */
  let holdTimer = null;
  let holdFrom = null;
  const cancelHold = () => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    holdFrom = null;
  };
  window.addEventListener('pointerdown', (e) => {
    const g = e.target && e.target.closest && e.target.closest('[data-layer="flower"]');
    if (!g) return;
    // only once the flower is actually open; while it is still invisible the
    // group is transparent and must not answer to anything.
    let visible = false;
    try { visible = parseFloat(getComputedStyle(g).opacity) > 0.5; } catch (_) { visible = false; }
    if (!visible) return;
    cancelHold();
    holdFrom = { x: e.clientX, y: e.clientY };
    holdTimer = setTimeout(() => { holdTimer = null; hardReset(); }, RESET_HOLD_MS);
  }, { capture: true });
  window.addEventListener('pointermove', (e) => {
    if (!holdTimer || !holdFrom) return;
    if (Math.hypot(e.clientX - holdFrom.x, e.clientY - holdFrom.y) > RESET_SLOP) cancelHold();
  }, { capture: true, passive: true });
  window.addEventListener('pointerup', cancelHold, { capture: true, passive: true });
  window.addEventListener('pointercancel', cancelHold, { capture: true, passive: true });

  const relayout = () => board.layout();
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', () => setTimeout(relayout, 60));
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(boardEl);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout).catch(() => {});

  // exposed for the e2e harness only; carries no UI and no text
  window.__game = { board, runner, hints, relayout, restart, hardReset, audio };
  document.documentElement.dataset.ready = '1';
}

boot();
