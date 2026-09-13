// Pure grid model. No DOM.
// Directions are the direction of travel: N = up (y-1), E = right (x+1), S = down (y+1), W = left (x-1).

export const DIRS = ['N', 'E', 'S', 'W'];
export const VEC = { N: { dx: 0, dy: -1 }, E: { dx: 1, dy: 0 }, S: { dx: 0, dy: 1 }, W: { dx: -1, dy: 0 } };
export const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };

// A track piece connects two sides of a cell.
export const PIECES = {
  H: ['E', 'W'],
  V: ['N', 'S'],
  NE: ['N', 'E'],
  NW: ['N', 'W'],
  SE: ['S', 'E'],
  SW: ['S', 'W'],
};
export const PIECE_LIST = Object.keys(PIECES);
// Order pieces are cycled through when a cell is tapped repeatedly.
export const CYCLE = ['H', 'V', 'SE', 'SW', 'NW', 'NE'];

export function pieceFor(a, b) {
  for (const [name, dirs] of Object.entries(PIECES)) {
    if ((dirs[0] === a && dirs[1] === b) || (dirs[0] === b && dirs[1] === a)) return name;
  }
  return null;
}

export function inBounds(level, x, y) {
  return x >= 0 && y >= 0 && x < level.cols && y < level.rows;
}

export function cellAt(level, x, y) {
  if (!inBounds(level, x, y)) return null;
  return level.cells[y][x];
}

// Effective piece on a cell, taking player placements into account.
// `placed` is a Map "x,y" -> piece name.
export function effectiveCell(level, placed, x, y) {
  const cell = cellAt(level, x, y);
  if (!cell) return null;
  if (cell.kind === 'empty') {
    const p = placed && placed.get(`${x},${y}`);
    if (p) return { kind: 'track', piece: p, fixed: false };
    return cell;
  }
  return cell;
}

export function isPlaceable(level, x, y) {
  const c = cellAt(level, x, y);
  return !!c && c.kind === 'empty';
}

// Given a car travelling in direction `dir` entering this cell, return the exit direction or null.
export function exitDir(cell, dir) {
  if (!cell) return null;
  const from = OPP[dir]; // the side we come in through
  if (cell.kind === 'track') {
    const [a, b] = PIECES[cell.piece];
    if (a === from) return b;
    if (b === from) return a;
    return null;
  }
  if (cell.kind === 'junction') {
    if (cell.branches.includes(from)) return cell.trunk;
    if (cell.trunk === from) return cell.branches[0];
    return null;
  }
  return null;
}

// Sides of a cell that have rail on them (used for drawing and for the "smart first piece").
export function openSides(cell) {
  if (!cell) return [];
  if (cell.kind === 'track') return PIECES[cell.piece];
  if (cell.kind === 'junction') return [cell.trunk, ...cell.branches];
  return [];
}

// Choose the most natural piece for an empty cell: connect to neighbouring rails that point at us.
export function suggestPiece(level, placed, x, y) {
  const pointing = [];
  for (const d of DIRS) {
    const nx = x + VEC[d].dx, ny = y + VEC[d].dy;
    const n = effectiveCell(level, placed, nx, ny);
    if (n && openSides(n).includes(OPP[d])) pointing.push(d);
  }
  if (pointing.length >= 2) {
    const p = pieceFor(pointing[0], pointing[1]);
    if (p) return p;
  }
  if (pointing.length === 1) {
    // continue straight through
    return pieceFor(pointing[0], OPP[pointing[0]]);
  }
  return 'H';
}

// Next piece when tapping a cell. null means "remove".
export function nextPiece(level, placed, x, y) {
  const cur = placed.get(`${x},${y}`) || null;
  if (!cur) return suggestPiece(level, placed, x, y);
  const first = suggestPiece(level, placed, x, y);
  // Cycle order: first suggestion, then the rest of CYCLE in order, then empty.
  const order = [first, ...CYCLE.filter((p) => p !== first)];
  const i = order.indexOf(cur);
  if (i < 0 || i === order.length - 1) return null;
  return order[i + 1];
}

// ---- Level parsing -------------------------------------------------------
// Tokens (2 chars, space separated):
//   ..  empty (placeable)      ##  rock         TT  tree
//   ==  fixed horizontal       ||  fixed vertical
//   NE NW SE SW  fixed curves (sides connected)
//   L> L< L^ Lv  locomotive facing E/W/N/S (sits on a fixed straight)
//   1> 2v 3< ... car with colour index and travel direction
//   Y?  junction, resolved from level.junctions: {x,y,trunk,branches}
const DIR_CH = { '>': 'E', '<': 'W', '^': 'N', v: 'S' };

export function parseLevel(def) {
  const lines = def.map.trim().split('\n').map((l) => l.trim().split(/\s+/));
  const rows = lines.length;
  const cols = lines[0].length;
  const cells = [];
  const cars = [];
  let loco = null;
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) {
      const t = lines[y][x];
      let cell;
      if (t === '..') cell = { kind: 'empty' };
      else if (t === '##') cell = { kind: 'rock' };
      else if (t === 'TT') cell = { kind: 'tree' };
      else if (t === '==') cell = { kind: 'track', piece: 'H', fixed: true };
      else if (t === '||') cell = { kind: 'track', piece: 'V', fixed: true };
      else if (PIECES[t]) cell = { kind: 'track', piece: t, fixed: true };
      else if (t[0] === 'L') {
        const dir = DIR_CH[t[1]];
        loco = { x, y, dir };
        cell = { kind: 'track', piece: pieceFor(dir, OPP[dir]), fixed: true, loco: true };
      } else if (/[1-9]/.test(t[0])) {
        const dir = DIR_CH[t[1]];
        cars.push({ x, y, dir, color: parseInt(t[0], 10) });
        cell = { kind: 'track', piece: pieceFor(dir, OPP[dir]), fixed: true };
      } else if (t[0] === 'Y') {
        const j = (def.junctions || []).find((j) => j.x === x && j.y === y);
        if (!j) throw new Error(`junction at ${x},${y} not defined`);
        cell = { kind: 'junction', trunk: j.trunk, branches: j.branches, fixed: true };
      } else throw new Error(`unknown token ${t} at ${x},${y}`);
      row.push(cell);
    }
    cells.push(row);
  }
  if (!loco) throw new Error('level has no locomotive');
  cars.sort((a, b) => a.color - b.color);
  return { id: def.id, cols, rows, cells, cars, loco, solution: def.solution || null };
}

export function placedFromList(list) {
  const m = new Map();
  for (const [x, y, p] of list || []) m.set(`${x},${y}`, p);
  return m;
}
