// board.js — 2x2 grid state, placement, stacking, snapping (docs/01.md 4.2, 4.4).
//
// State shape mirrors the plan:
//   cells[r][c] = [ 'T3', 'T1' ]   // bottom -> top; the last entry is the visible top tile
// Every mutation dispatches `board:changed` on document (puzzles.js listens).

export const ROWS = 2;
export const COLS = 2;

export class Board {
  constructor(boardEl, tilesEl) {
    this.boardEl = boardEl;
    this.tilesEl = tilesEl;
    this.tiles = new Map();                       // id -> Tile
    this.cells = [[[], []], [[], []]];
    this.cellEls = [[null, null], [null, null]];
    for (const el of boardEl.querySelectorAll('.cell')) {
      this.cellEls[+el.dataset.r][+el.dataset.c] = el;
    }
    this._quiet = false;
    // set while a staged sequence is running: input is refused, never left stuck
    this.busy = false;
  }

  /** Remove every tile (used by the ending -> restart cycle). */
  clear() {
    for (const tile of this.tiles.values()) tile.el.remove();
    this.tiles.clear();
    this.cells = [[[], []], [[], []]];
  }

  add(tile, r, c) {
    this.tiles.set(tile.id, tile);
    this.tilesEl.appendChild(tile.el);
    this.cells[r][c].push(tile.id);
  }

  /* ---------- queries ---------- */

  stack(r, c) { return this.cells[r][c]; }
  topAt(r, c) {
    const s = this.cells[r][c];
    return s.length ? this.tiles.get(s[s.length - 1]) : null;
  }
  isEmpty(r, c) { return this.cells[r][c].length === 0; }

  locate(tileId) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = this.cells[r][c].indexOf(tileId);
        if (i >= 0) return { r, c, i };
      }
    }
    return null;
  }

  /** Cell under a point given in board-local pixels. */
  cellAtPoint(px, py) {
    const b = this.boardEl.getBoundingClientRect();
    if (px < 0 || py < 0 || px > b.width || py > b.height) return null;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const g = this.cellGeom(r, c);
        if (px >= g.x && px <= g.x + g.size && py >= g.y && py <= g.y + g.size) return { r, c };
      }
    }
    return null;
  }

  cellGeom(r, c) {
    const el = this.cellEls[r][c];
    return { x: el.offsetLeft, y: el.offsetTop, size: el.offsetWidth };
  }

  /* ---------- mutations ---------- */

  /** Move a tile (with nothing under it) to an empty cell. */
  moveTo(tileId, r, c) {
    const at = this.locate(tileId);
    if (!at) return false;
    this.cells[at.r][at.c].splice(at.i, 1);
    this.cells[r][c].push(tileId);
    this.layout();
    this.changed({ type: 'move', tile: tileId, from: at, to: { r, c } });
    return true;
  }

  /**
   * G5: slide `tileId` underneath `targetId`'s stack. Only allowed when the tile
   * currently on top there has a hole to see through.
   */
  slideUnder(tileId, r, c) {
    const top = this.topAt(r, c);
    if (!top || !top.hole) return false;
    const at = this.locate(tileId);
    if (!at) return false;
    this.cells[at.r][at.c].splice(at.i, 1);
    this.cells[r][c].unshift(tileId);
    this.layout();
    this.changed({ type: 'stack', tile: tileId, under: top.id, to: { r, c } });
    return true;
  }

  changed(detail) {
    if (this._quiet) return;
    document.dispatchEvent(new CustomEvent('board:changed', { detail: { board: this, ...detail } }));
  }

  /* ---------- layout ---------- */

  layout() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const g = this.cellGeom(r, c);
        this.cells[r][c].forEach((id, i) => {
          const tile = this.tiles.get(id);
          tile.setRect(g.x, g.y, g.size);
          tile.el.style.zIndex = String(10 + i);
          // only the topmost tile of a stack is grabbable; lower ones are seen
          // through the hole but not touched.
          tile.el.style.pointerEvents = (i === this.cells[r][c].length - 1) ? 'auto' : 'none';
        });
      }
    }
  }

  highlight(cell) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        this.cellEls[r][c].classList.toggle('hot', !!cell && cell.r === r && cell.c === c);
      }
    }
  }

  /** Serializable snapshot (docs 4.2). */
  snapshot() {
    return {
      cells: this.cells.map((row) => row.map((s) => s.slice())),
      zoom: Object.fromEntries([...this.tiles].map(([id, t]) => [id, t.zoom]))
    };
  }
}
