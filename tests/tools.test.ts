import { describe, expect, it } from 'vitest';
import { applyTool, destroyBlocks, rotateTiles, toggleHeight } from '../src/core/tools';
import { tileAt } from '../src/core/board';
import type { Board, GameState, Tile, Tool } from '../src/core/types';

function board(w: number, h: number, tiles: Tile[]): Board {
  return { w, h, tiles };
}
const t = (kind: Tile['kind'], rot = 0, height: Tile['height'] = 0): Tile => ({
  kind,
  rot: rot as Tile['rot'],
  height,
  layer: 'road',
});

describe('rotateTiles', () => {
  it('4 回転で元に戻る', () => {
    let b = board(1, 1, [t('curve', 0)]);
    for (let i = 0; i < 4; i++) b = rotateTiles(b, [{ x: 0, y: 0 }]);
    expect(tileAt(b, { x: 0, y: 0 })?.rot).toBe(0);
  });

  it('1 回転で時計回りに 90 度進む', () => {
    const b = rotateTiles(board(1, 1, [t('curve', 1)]), [{ x: 0, y: 0 }]);
    expect(tileAt(b, { x: 0, y: 0 })?.rot).toBe(2);
  });

  it('種別と高さは変わらない', () => {
    const b = rotateTiles(board(1, 1, [t('tee', 0, 1)]), [{ x: 0, y: 0 }]);
    const tile = tileAt(b, { x: 0, y: 0 });
    expect(tile?.kind).toBe('tee');
    expect(tile?.height).toBe(1);
  });

  it('十字・空地・障害物は回らない', () => {
    for (const kind of ['cross', 'empty', 'block'] as const) {
      const b = rotateTiles(board(1, 1, [t(kind, 0)]), [{ x: 0, y: 0 }]);
      expect(tileAt(b, { x: 0, y: 0 })?.rot).toBe(0);
    }
  });

  it('範囲内の全タイルが同時に回る', () => {
    const b = rotateTiles(board(2, 1, [t('curve', 0), t('straight', 0)]), [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    expect(tileAt(b, { x: 0, y: 0 })?.rot).toBe(1);
    expect(tileAt(b, { x: 1, y: 0 })?.rot).toBe(1);
  });
});

describe('toggleHeight', () => {
  it('0 ⇄ 1 をトグルする', () => {
    const cells = [{ x: 0, y: 0 }];
    let b = board(1, 1, [t('straight', 0, 0)]);
    b = toggleHeight(b, cells);
    expect(tileAt(b, { x: 0, y: 0 })?.height).toBe(1);
    b = toggleHeight(b, cells);
    expect(tileAt(b, { x: 0, y: 0 })?.height).toBe(0);
  });

  it('範囲内が一斉に動く', () => {
    const cells = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    const b = toggleHeight(board(2, 1, [t('straight', 0, 0), t('curve', 0, 0)]), cells);
    expect(tileAt(b, { x: 0, y: 0 })?.height).toBe(1);
    expect(tileAt(b, { x: 1, y: 0 })?.height).toBe(1);
  });

  it('2 段しかないので 0..1 に収まる', () => {
    let b = board(1, 1, [t('straight', 0, 1)]);
    for (let i = 0; i < 5; i++) {
      b = toggleHeight(b, [{ x: 0, y: 0 }]);
      const hgt = tileAt(b, { x: 0, y: 0 })?.height ?? 0;
      expect(hgt === 0 || hgt === 1).toBe(true);
    }
  });
});

describe('destroyBlocks', () => {
  it('block だけを空地にする', () => {
    const b = destroyBlocks(board(2, 1, [t('block'), t('straight', 1)]), [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    expect(tileAt(b, { x: 0, y: 0 })?.kind).toBe('empty');
    expect(tileAt(b, { x: 1, y: 0 })?.kind).toBe('straight');
  });

  it('start / goal は壊せない', () => {
    const b = destroyBlocks(board(2, 1, [t('start'), t('goal')]), [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    expect(tileAt(b, { x: 0, y: 0 })?.kind).toBe('start');
    expect(tileAt(b, { x: 1, y: 0 })?.kind).toBe('goal');
  });
});

describe('applyTool', () => {
  const state = (tiles: Tile[], tools: Tool[]): GameState => ({ board: board(tiles.length, 1, tiles), tools });

  it('回転ツールは何度でも使える', () => {
    let s = state([t('curve', 0)], [{ kind: 'rotate', cells: [{ x: 0, y: 0 }], used: false, touched: false }]);
    for (let i = 0; i < 3; i++) {
      const r = applyTool(s, i === 0 ? 0 : 0);
      expect(r.changed).toBe(true);
      s = r.state;
    }
    expect(tileAt(s.board, { x: 0, y: 0 })?.rot).toBe(3);
    expect(s.tools[0]?.used).toBe(false);
    expect(s.tools[0]?.touched).toBe(true);
  });

  it('破壊ツールは 1 回使うと消える(使い切り)', () => {
    const s = state([t('block')], [{ kind: 'destroy', cells: [{ x: 0, y: 0 }], used: false, touched: false }]);
    const r1 = applyTool(s, 0);
    expect(r1.changed).toBe(true);
    expect(r1.state.tools[0]?.used).toBe(true);
    const r2 = applyTool(r1.state, 0);
    expect(r2.changed).toBe(false);
    expect(r2.state).toBe(r1.state);
  });

  it('壊せるものが無ければ空振りで、ツールは消費されない', () => {
    const s = state([t('straight', 1)], [{ kind: 'destroy', cells: [{ x: 0, y: 0 }], used: false, touched: false }]);
    const r = applyTool(s, 0);
    expect(r.changed).toBe(false);
    expect(r.state.tools[0]?.used).toBe(false);
    expect(r.state.tools[0]?.touched).toBe(true);
  });

  it('存在しないツール番号は何もしない', () => {
    const s = state([t('empty')], []);
    const r = applyTool(s, 3);
    expect(r.changed).toBe(false);
    expect(r.state).toBe(s);
  });
});
