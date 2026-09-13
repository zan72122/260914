// Verifies every level: the initial state is unsolved, the stored solution clears,
// and the lazy solver finds solutions. Prints solution counts (capped).
import { LEVELS } from '../src/levels.js';
import { parseLevel, placedFromList } from '../src/sim/grid.js';
import { simulate } from '../src/sim/simulate.js';
import { solve, solutionToList } from '../src/sim/solver.js';

let bad = 0;
for (const def of LEVELS) {
  const lv = parseLevel(def);
  const init = simulate(lv, new Map());
  const sol = simulate(lv, placedFromList(def.solution));
  const t0 = Date.now();
  const { solutions, nodes } = solve(lv, { maxPieces: 10, maxSolutions: 50 });
  const ms = Date.now() - t0;
  const ok = init.outcome === 'fail' && sol.outcome === 'clear' && solutions.length > 0;
  if (!ok) bad++;
  console.log(
    `L${String(def.id).padStart(2)} ${lv.cols}x${lv.rows} cars=${lv.cars.length} ` +
      `init=${init.outcome}/${init.fail && init.fail.kind} stored=${sol.outcome}` +
      (sol.fail ? `(${sol.fail.kind} t${sol.fail.tick} @${sol.fail.cell && sol.fail.cell.x},${sol.fail.cell && sol.fail.cell.y})` : '') +
      ` pieces=${def.solution.length} solutions=${solutions.length}${solutions.length >= 50 ? '+' : ''} nodes=${nodes} ${ms}ms ${ok ? 'OK' : 'FAIL'}`,
  );
  if (process.argv.includes('-v')) {
    for (const s of solutions.slice(0, 6)) console.log('   ', JSON.stringify(solutionToList(s)));
  }
}
if (bad) { console.error(`${bad} level(s) failed`); process.exit(1); }
