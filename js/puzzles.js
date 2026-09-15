// puzzles.js — P1..P3 conditions and their staging (docs/01.md 3.3, docs/02.md D2).
//
// Conditions are written purely with three predicates — adjacent / stacked / zoomOf —
// over the tile data model, and are evaluated on `board:changed`, never per frame.
// The puzzles are strictly ordered: only the current one is tested, so P2 can never
// be solved before P1.

import { wiggle } from './fx.js';
import { stageP1, stageP2, stageP3, stageEnding } from './staging.js';

/* ---------------- predicates ---------------- */

const OPPOSITE = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
const DELTA = { left: [0, -1], right: [0, 1], top: [-1, 0], bottom: [1, 0] };

/** b sits on the `side` of a (a's bottom neighbour, a's right neighbour, ...). */
export function adjacent(board, aId, bId, side) {
  const a = board.locate(aId);
  const b = board.locate(bId);
  if (!a || !b || !DELTA[side]) return false;
  const [dr, dc] = DELTA[side];
  return a.r + dr === b.r && a.c + dc === b.c;
}

/** topId lies over bottomId in the same cell. */
export function stacked(board, topId, bottomId) {
  const t = board.locate(topId);
  const b = board.locate(bottomId);
  if (!t || !b) return false;
  return t.r === b.r && t.c === b.c && b.i < t.i;
}

/** Current zoom stage of a tile (0 = whole scene). */
export function zoomOf(board, tileId) {
  const tile = board.tiles.get(tileId);
  return tile ? tile.zoom : 0;
}

/* -------- helpers built from the tile data model (edges / hole / emits) -------- */

function pours(board, fromId, intoId) {
  const from = board.tiles.get(fromId);
  if (!from || !from.emits) return false;
  return adjacent(board, fromId, intoId, from.emits.side);
}

function fits(board, topId, bottomId) {
  const top = board.tiles.get(topId);
  const bottom = board.tiles.get(bottomId);
  if (!top || !bottom || !top.hole) return false;
  return stacked(board, topId, bottomId) &&
         top.hole.accepts.some((item) => bottom.provides.includes(item));
}

function seamed(board, aId, bId, side) {
  const a = board.tiles.get(aId);
  const b = board.tiles.get(bId);
  if (!a || !b) return false;
  const socket = a.edges[side];
  return !!socket && b.edges[OPPOSITE[side]] === socket && adjacent(board, aId, bId, side);
}

const cellOf = (board, id, dr, dc) => {
  const at = board.locate(id);
  if (!at) return null;
  const r = at.r + dr;
  const c = at.c + dc;
  return (r < 0 || r > 1 || c < 0 || c > 1) ? null : { r, c };
};

/* ---------------- puzzles ---------------- */

export const PUZZLES = [
  {
    // P1 "rain": T2 directly above T1 so the cut-off drops fall into the pot.
    id: 'P1',
    focus: ['T2', 'T1'],
    test: (b) => pours(b, 'T2', 'T1'),
    stage: stageP1,
    hint: (b) => ({ supply: 'T2', target: cellOf(b, 'T1', -1, 0), glow: [['T1', 'soil']] })
  },
  {
    // P2 "light": T3 slid under T1 so the sun shows through the window hole.
    id: 'P2',
    focus: ['T1', 'T3'],
    test: (b) => fits(b, 'T1', 'T3'),
    stage: stageP2,
    hint: (b) => ({ supply: 'T3', target: cellOf(b, 'T1', 0, 0), glow: [['T1', 'window']] })
  },
  {
    // P3 "butterfly": T4 immediately right of T1 so the flight trail joins up
    // (docs/02.md D2); a zoomed-in T1 cannot line up, so the world nudges it out.
    id: 'P3',
    focus: ['T4', 'T1'],
    test: (b) => seamed(b, 'T1', 'T4', 'right') && zoomOf(b, 'T1') === 0,
    stage: stageP3,
    hint: (b) => (zoomOf(b, 'T1') > 0
      ? { supply: 'T1', pullOut: true, glow: [['T1', 'pot']] }
      : { supply: 'T4', target: cellOf(b, 'T1', 0, 1), glow: [['T1', 'trail-in'], ['T4', 'trail']] })
  }
];

export class PuzzleRunner {
  constructor(board, { onEnding } = {}) {
    this.board = board;
    this.index = 0;
    this.solved = new Set();
    this.onEnding = onEnding || (() => {});
    document.addEventListener('board:changed', (e) => this.evaluate(e.detail));
  }

  current() { return this.index < PUZZLES.length ? PUZZLES[this.index] : null; }

  /** What the idle hints should point at right now (docs/01.md 4.7). */
  currentHint() {
    const p = this.current();
    if (!p) return null;
    try { return p.hint(this.board); } catch (_) { return null; }
  }

  reset() {
    this.index = 0;
    this.solved.clear();
  }

  async evaluate() {
    if (this.board.busy) return;
    const p = this.current();
    if (!p) return;
    let ok = false;
    try { ok = p.test(this.board); } catch (_) { ok = false; }
    if (!ok) return;

    this.solved.add(p.id);
    this.index++;
    this.board.busy = true;
    document.dispatchEvent(new CustomEvent('puzzle:solved', { detail: { id: p.id } }));
    try {
      for (const id of p.focus) {
        const tile = this.board.tiles.get(id);
        if (tile) wiggle(tile.el, 3, 420);
      }
      await p.stage(this.board);
    } catch (err) {
      console.warn('[stage]', p.id, err && err.message);
    } finally {
      this.board.busy = false;
    }

    if (this.index >= PUZZLES.length) {
      // the ending holds the board: only the falling seed answers from here on
      this.board.busy = true;
      document.dispatchEvent(new CustomEvent('puzzle:ending', { detail: {} }));
      try { await this.onEnding(); } catch (err) { console.warn('[ending]', err && err.message); }
    }
  }
}

export { stageEnding };
