import { describe, expect, it } from 'vitest';
import { solve } from '../src/core/solve';
import type { Board, Height, Layer, Tile } from '../src/core/types';

type Spec = [kind: Tile['kind'], rot?: number, height?: Height, layer?: Layer];

function board(w: number, h: number, specs: readonly (Spec | null)[]): Board {
  const tiles: Tile[] = specs.map((s) =>
    s === null
      ? { kind: 'empty', rot: 0, height: 0, layer: 'road' }
      : {
          kind: s[0],
          rot: ((s[1] ?? 0) % 4) as Tile['rot'],
          height: s[2] ?? 0,
          layer: s[3] ?? 'road',
        },
  );
  expect(tiles.length).toBe(w * h);
  return { w, h, tiles };
}

describe('solve', () => {
  it('start と goal が無ければ繋がらない', () => {
    const b = board(2, 1, [null, null]);
    expect(solve(b).connected).toBe(false);
    expect(solve(b).path).toEqual([]);
  });

  it('start → goal が横一直線で繋がる', () => {
    // S(東) - 直線(東西) - G(西)
    const b = board(3, 1, [['start', 1], ['straight', 1], ['goal', 3]]);
    const r = solve(b);
    expect(r.connected).toBe(true);
    expect(r.path).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
  });

  it('真ん中の直線の向きが違うと繋がらず、path は最遠点で止まる', () => {
    const b = board(3, 1, [['start', 1], ['straight', 0], ['goal', 3]]);
    const r = solve(b);
    expect(r.connected).toBe(false);
    expect(r.path).toEqual([{ x: 0, y: 0 }]);
  });

  it('片方向だけの接続では進めない(双方向の握手)', () => {
    // start は東へ出るが、隣のカーブは 北-東 で西に開いていない
    const b = board(3, 1, [['start', 1], ['curve', 0], ['goal', 3]]);
    expect(solve(b).connected).toBe(false);
  });

  it('段差があると繋がらない', () => {
    const b = board(3, 1, [
      ['start', 1, 0],
      ['straight', 1, 1],
      ['goal', 3, 1],
    ]);
    expect(solve(b).connected).toBe(false);
    expect(solve(b).path).toEqual([{ x: 0, y: 0 }]);
  });

  it('高さが揃えば繋がる', () => {
    const b = board(3, 1, [
      ['start', 1, 1],
      ['straight', 1, 1],
      ['goal', 3, 1],
    ]);
    expect(solve(b).connected).toBe(true);
  });

  it('レイヤーが違うと繋がらない(道路と線路)', () => {
    const b = board(3, 1, [
      ['start', 1, 0, 'road'],
      ['straight', 1, 0, 'rail'],
      ['goal', 3, 0, 'rail'],
    ]);
    expect(solve(b).connected).toBe(false);
  });

  it('線路同士なら繋がる', () => {
    const b = board(3, 1, [
      ['start', 1, 0, 'rail'],
      ['straight', 1, 0, 'rail'],
      ['goal', 3, 0, 'rail'],
    ]);
    expect(solve(b).connected).toBe(true);
  });

  it('block は通れない', () => {
    const b = board(3, 1, [['start', 1], ['block'], ['goal', 3]]);
    expect(solve(b).connected).toBe(false);
  });

  it('十字はどの向きからでも通れる', () => {
    const b = board(3, 1, [['start', 1], ['cross', 2], ['goal', 3]]);
    expect(solve(b).connected).toBe(true);
  });

  it('L 字の経路を復元できる', () => {
    // 2x2: (0,0)S南 (0,1)カーブ北東 (1,1)G西
    const b = board(2, 2, [['start', 2], null, ['curve', 0], ['goal', 3]]);
    const r = solve(b);
    expect(r.connected).toBe(true);
    expect(r.path).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
  });

  it('繋がらないとき path は start から進める最遠点まで伸びる', () => {
    // S東 - 直線東西 - 直線東西 - 空地 - G西
    const b = board(5, 1, [['start', 1], ['straight', 1], ['straight', 1], null, ['goal', 3]]);
    const r = solve(b);
    expect(r.connected).toBe(false);
    expect(r.path).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
  });
});
