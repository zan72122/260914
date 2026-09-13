import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel, placedFromList, exitDir, suggestPiece, nextPiece } from '../src/sim/grid.js';
import { simulate } from '../src/sim/simulate.js';
import { solve } from '../src/sim/solver.js';

const L = (map, extra = {}) => parseLevel({ id: 't', map, ...extra });

test('exitDir on pieces and junctions', () => {
  assert.equal(exitDir({ kind: 'track', piece: 'H' }, 'E'), 'E');
  assert.equal(exitDir({ kind: 'track', piece: 'H' }, 'N'), null);
  // travelling N into a cell that connects S and E -> we exit E
  assert.equal(exitDir({ kind: 'track', piece: 'SE' }, 'N'), 'E');
  assert.equal(exitDir({ kind: 'track', piece: 'SE' }, 'W'), 'S');
  const j = { kind: 'junction', trunk: 'E', branches: ['W', 'N'] };
  assert.equal(exitDir(j, 'E'), 'E'); // from W branch
  assert.equal(exitDir(j, 'S'), 'E'); // from N branch
  assert.equal(exitDir(j, 'W'), 'W'); // from trunk -> primary branch W
});

test('single car: stuck on empty cell, then clear with straight', () => {
  const lv = L(`
    .. .. .. ..
    1> == .. L>
    .. .. .. ..
    .. .. .. ..`);
  const r0 = simulate(lv, new Map());
  assert.equal(r0.outcome, 'fail');
  assert.equal(r0.fail.kind, 'stuck');
  assert.deepEqual(r0.fail.cell, { x: 2, y: 1 });
  assert.equal(r0.fail.placeable, true);
  const r1 = simulate(lv, placedFromList([[2, 1, 'H']]));
  assert.equal(r1.outcome, 'clear');
  assert.equal(r1.coupleTicks[0], 3);
});

test('curve routing', () => {
  const lv = L(`
    .. .. .. ..
    .. .. == L>
    .. || .. ..
    .. 1^ .. ..`);
  assert.equal(simulate(lv, placedFromList([[1, 1, 'SE']])).outcome, 'clear');
  assert.equal(simulate(lv, placedFromList([[1, 1, 'SW']])).fail.kind, 'stuck');
});

test('two cars in line couple in order', () => {
  const lv = L(`
    .. .. .. .. ..
    2> 1> .. .. L>
    .. .. .. .. ..
    .. .. .. .. ..
    .. .. .. .. ..`);
  const r = simulate(lv, placedFromList([[2, 1, 'H'], [3, 1, 'H']]));
  assert.equal(r.outcome, 'clear');
  assert.ok(r.coupleTicks[0] <= r.coupleTicks[1]);
});

test('wrong order fails with kind order', () => {
  const lv = L(`
    .. .. .. .. ..
    1> 2> .. .. L>
    .. .. .. .. ..
    .. .. .. .. ..
    .. .. .. .. ..`);
  const r = simulate(lv, placedFromList([[2, 1, 'H'], [3, 1, 'H']]));
  assert.equal(r.outcome, 'fail');
  assert.equal(r.fail.kind, 'order');
});

test('head-on collision is a crash', () => {
  const lv = L(`
    .. .. .. .. ..
    1> .. .. 2< L>
    .. .. .. .. ..
    .. .. .. .. ..
    .. .. .. .. ..`);
  const r = simulate(lv, placedFromList([[1, 1, 'H'], [2, 1, 'H']]));
  assert.equal(r.outcome, 'fail');
  assert.equal(r.fail.kind, 'crash');
});

test('junction merge with collision when arriving together', () => {
  const lv = L(`
    .. .. 1v .. ..
    .. .. .. .. ..
    2> .. Y  .. L>
    .. .. .. .. ..
    .. .. .. .. ..`, { junctions: [{ x: 2, y: 2, trunk: 'E', branches: ['W', 'N'] }] });
  const r = simulate(lv, placedFromList([[2, 1, 'V'], [1, 2, 'H'], [3, 2, 'H']]));
  assert.equal(r.outcome, 'fail');
  assert.equal(r.fail.kind, 'crash');
  assert.deepEqual(r.fail.cell, { x: 2, y: 2 });
});

test('suggestPiece connects neighbouring rails; nextPiece cycles to removal', () => {
  const lv = L(`
    .. .. .. ..
    .. .. == L>
    .. || .. ..
    .. 1^ .. ..`);
  const placed = new Map();
  assert.equal(suggestPiece(lv, placed, 1, 1), 'SE');
  let p = nextPiece(lv, placed, 1, 1);
  assert.equal(p, 'SE');
  const seen = [p];
  for (let i = 0; i < 6; i++) {
    placed.set('1,1', p);
    p = nextPiece(lv, placed, 1, 1);
    seen.push(p);
  }
  assert.equal(seen.at(-1), null);
  assert.equal(new Set(seen.slice(0, 6)).size, 6);
});

test('solver finds the unique solution for a simple level', () => {
  const lv = L(`
    .. .. .. ..
    .. .. == L>
    .. || .. ..
    .. 1^ .. ..`);
  const { solutions } = solve(lv, { maxSolutions: 5 });
  assert.equal(solutions.length, 1);
  assert.equal(solutions[0].get('1,1'), 'SE');
});

test('a follower couples to a tail that sits on a curve (same entry direction)', () => {
  // car 1 turns north at (2,2) into the loco above it; car 2 follows the same way.
  const lv = L(`
    .. .. L^ ..
    .. .. .. ..
    2> 1> .. ..
    .. .. .. ..`);
  const r = simulate(lv, placedFromList([[2, 2, 'NW'], [2, 1, 'V']]));
  assert.equal(r.outcome, 'clear');
});
