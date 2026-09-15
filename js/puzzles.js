// puzzles.js — condition framework for P1..P3 (docs/01.md 3.3, 4.2).
//
// Conditions are written purely with three predicates — adjacent / stacked / zoomOf —
// over the tile data model, and are evaluated on `board:changed`, never per frame.
// Phase F1/F2: satisfying a condition only logs and nudges the tiles.
// The staging (rain falling, sprouting, blooming) lands in F4.

import { wiggle } from './fx.js';

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

/* ---------------- puzzle conditions ---------------- */

export const PUZZLES = [
  {
    // P1 "rain": T2 directly above T1 so the cut-off drops fall into the pot.
    id: 'P1',
    focus: ['T2', 'T1'],
    test: (b) => pours(b, 'T2', 'T1')
  },
  {
    // P2 "light": T3 slid under T1 so the sun shows through the window hole.
    id: 'P2',
    focus: ['T1', 'T3'],
    test: (b) => fits(b, 'T1', 'T3')
  },
  {
    // P3 "butterfly": T4 immediately left of T1 so the flight trail joins up.
    id: 'P3',
    focus: ['T4', 'T1'],
    test: (b) => seamed(b, 'T4', 'T1', 'right')
  }
];

export class PuzzleRunner {
  constructor(board) {
    this.board = board;
    this.solved = new Set();
    document.addEventListener('board:changed', (e) => this.evaluate(e.detail));
  }

  evaluate(detail = {}) {
    for (const p of PUZZLES) {
      if (this.solved.has(p.id)) continue;
      let ok = false;
      try { ok = p.test(this.board); } catch (_) { ok = false; }
      if (!ok) continue;
      this.solved.add(p.id);
      // F4 replaces this with the actual staging.
      console.log('[puzzle] solved', p.id, detail.type || '', this.board.snapshot().cells);
      for (const id of p.focus) {
        const tile = this.board.tiles.get(id);
        if (tile) wiggle(tile.el, 4, 520);
      }
      document.dispatchEvent(new CustomEvent('puzzle:solved', { detail: { id: p.id } }));
    }
  }
}
