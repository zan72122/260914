// Lazy depth-first solver: only fills the cell where the simulation gets stuck.
// Complete for solutions in which every placed piece is actually traversed.
import { PIECE_LIST } from './grid.js';
import { simulate } from './simulate.js';

export function solve(level, { maxPieces = 10, maxSolutions = 2, placed = new Map() } = {}) {
  const solutions = [];
  let nodes = 0;
  const dfs = (placed, depth) => {
    if (solutions.length >= maxSolutions) return;
    nodes++;
    const r = simulate(level, placed);
    if (r.outcome === 'clear') {
      solutions.push(new Map(placed));
      return;
    }
    if (r.fail.kind !== 'stuck' || !r.fail.placeable || depth >= maxPieces) return;
    const key = `${r.fail.cell.x},${r.fail.cell.y}`;
    if (placed.has(key)) return; // piece exists but is wrongly oriented -> dead end on this branch
    for (const p of PIECE_LIST) {
      placed.set(key, p);
      dfs(placed, depth + 1);
      placed.delete(key);
      if (solutions.length >= maxSolutions) return;
    }
  };
  dfs(new Map(placed), placed.size);
  return { solutions, nodes };
}

export function solutionToList(m) {
  return [...m.entries()].map(([k, p]) => {
    const [x, y] = k.split(',').map(Number);
    return [x, y, p];
  });
}
