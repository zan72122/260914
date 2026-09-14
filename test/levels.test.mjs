import { LEVELS } from '../src/levels.js';
import { parseLevel, composite, bfs } from '../src/paper.js';
import { solve } from '../src/solver.js';

let fail = 0;
LEVELS.forEach((def, i) => {
  const lv = parseLevel(def, i);
  const sol = solve(lv);
  const direct = bfs(composite(lv, null), lv.start).has(lv.goal.r, lv.goal.c);
  const folds = sol ? sol.filter((a) => a.type !== 'walk').map((a) => (a.type === 'fold' ? a.side : '-' + a.side)) : null;
  const ok = sol && !direct;
  if (!ok) fail++;
  console.log(`${ok ? 'ok ' : 'NG '} level ${i + 1} (${lv.scene}): ${sol ? sol.length + ' actions, folds ' + folds.join(' ') : 'UNSOLVABLE'}${direct ? ' [goal reachable without folding]' : ''}`);
});
if (fail) {
  console.error(`${fail} level(s) failed`);
  process.exit(1);
}
