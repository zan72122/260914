import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/levels.js';
import { parseLevel, placedFromList } from '../src/sim/grid.js';
import { simulate } from '../src/sim/simulate.js';
import { solve } from '../src/sim/solver.js';

test('levels are numbered 1..n without gaps', () => {
  LEVELS.forEach((l, i) => assert.equal(l.id, i + 1));
});

for (const def of LEVELS) {
  test(`level ${def.id}: unsolved initially, stored solution clears, solver agrees`, () => {
    const lv = parseLevel(def);
    assert.equal(simulate(lv, new Map()).outcome, 'fail');
    assert.equal(simulate(lv, placedFromList(def.solution)).outcome, 'clear');
    const { solutions } = solve(lv, { maxPieces: 10, maxSolutions: 1 });
    assert.equal(solutions.length, 1);
  });
}

test('levels 1-4 and 6 have a unique traversed-piece solution', () => {
  for (const id of [1, 2, 3, 4, 6]) {
    const lv = parseLevel(LEVELS[id - 1]);
    const { solutions } = solve(lv, { maxPieces: 4, maxSolutions: 5 });
    assert.equal(solutions.length, 1, `level ${id}`);
  }
});
