// Deterministic train simulation. No DOM, no randomness.
import { VEC, OPP, effectiveCell, exitDir, inBounds } from './grid.js';

export const MAX_TICKS = 80;

// Result:
// {
//   outcome: 'clear' | 'fail',
//   fail: null | { kind: 'stuck'|'crash'|'order'|'loop', tick, cars: [indices], cell: {x,y} | null },
//   ticks: [ snapshot, ... ]   snapshot = { cars: [{x,y,dir,inDir,coupled}], tail: {x,y,inDir} }
//   coupleTicks: { [carIndex]: tick }
//   visited: Set of "x,y" cells traversed by any car
// }
export function simulate(level, placed) {
  // dir = direction the car will leave its current cell; inDir = direction it entered it.
  const cars = level.cars.map((c) => ({ x: c.x, y: c.y, dir: c.dir, inDir: c.dir, color: c.color, coupled: false }));
  // A car couples when it moves into the tail's cell travelling the way the tail entered it.
  let tail = { x: level.loco.x, y: level.loco.y, inDir: level.loco.dir };
  const order = [...cars].map((c, i) => i).sort((a, b) => cars[a].color - cars[b].color);
  let nextIdx = 0; // index into order: which car must couple next
  const ticks = [snapshot(cars, tail)];
  const coupleTicks = {};
  const visited = new Set(cars.map((c) => `${c.x},${c.y}`));
  const nextOf = (c) => ({ x: c.x + VEC[c.dir].dx, y: c.y + VEC[c.dir].dy });

  for (let t = 1; t <= MAX_TICKS; t++) {
    // 1. couplings (repeat: a car directly behind a car that just coupled couples too)
    let changed = true;
    let fail = null;
    while (changed && !fail) {
      changed = false;
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (c.coupled) continue;
        const n = nextOf(c);
        if (n.x === tail.x && n.y === tail.y) {
          if (c.dir !== tail.inDir) {
            fail = { kind: 'crash', tick: t, cars: [i], cell: n };
            break;
          }
          if (order[nextIdx] !== i) {
            fail = { kind: 'order', tick: t, cars: [i], cell: n };
            break;
          }
          c.coupled = true;
          coupleTicks[i] = t;
          nextIdx++;
          tail = { x: c.x, y: c.y, inDir: c.inDir };
          changed = true;
        }
      }
    }
    if (fail) return finish('fail', fail);
    if (cars.every((c) => c.coupled)) {
      ticks.push(snapshot(cars, tail));
      return finish('clear', null);
    }

    // 2. compute moves
    const moves = [];
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (c.coupled) continue;
      const n = nextOf(c);
      const cell = inBounds(level, n.x, n.y) ? effectiveCell(level, placed, n.x, n.y) : null;
      const out = exitDir(cell, c.dir);
      if (!out) {
        return finish('fail', { kind: 'stuck', tick: t, cars: [i], cell: n, placeable: !!cell && cell.kind === 'empty' });
      }
      // moving into a coupled (non-tail) car
      const occ = cars.findIndex((o) => o.coupled && o.x === n.x && o.y === n.y);
      if (occ >= 0) return finish('fail', { kind: 'crash', tick: t, cars: [i, occ], cell: n });
      moves.push({ i, n, out });
    }
    // 3. collisions: same target, or swapping cells
    for (let a = 0; a < moves.length; a++) {
      for (let b = a + 1; b < moves.length; b++) {
        const A = moves[a], B = moves[b];
        if (A.n.x === B.n.x && A.n.y === B.n.y) {
          return finish('fail', { kind: 'crash', tick: t, cars: [A.i, B.i], cell: A.n });
        }
        const ca = cars[A.i], cb = cars[B.i];
        if (A.n.x === cb.x && A.n.y === cb.y && B.n.x === ca.x && B.n.y === ca.y) {
          return finish('fail', { kind: 'crash', tick: t, cars: [A.i, B.i], cell: A.n });
        }
      }
    }
    // 4. apply
    for (const m of moves) {
      const c = cars[m.i];
      c.x = m.n.x; c.y = m.n.y; c.inDir = c.dir; c.dir = m.out;
      visited.add(`${c.x},${c.y}`);
    }
    ticks.push(snapshot(cars, tail));
  }
  return finish('fail', { kind: 'loop', tick: MAX_TICKS, cars: [], cell: null });

  function finish(outcome, fail) {
    return { outcome, fail, ticks, coupleTicks, visited, order };
  }
}

function snapshot(cars, tail) {
  return { cars: cars.map((c) => ({ x: c.x, y: c.y, dir: c.dir, inDir: c.inDir, coupled: c.coupled })), tail: { ...tail } };
}
