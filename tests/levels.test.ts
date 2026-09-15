import { describe, expect, it } from 'vitest';
import { levels } from '../src/levels';
import { buildBoard, buildTools } from '../src/levels/schema';
import { solve } from '../src/core/solve';
import { applyTool } from '../src/core/tools';
import { findTile } from '../src/core/board';
import type { GameState } from '../src/core/types';

/** 最大 depth 手までの総当たりで解けるかを調べる */
function searchSolution(state: GameState, depth: number): number[] | undefined {
  if (solve(state.board).connected) return [];
  if (depth <= 0) return undefined;
  for (let i = 0; i < state.tools.length; i++) {
    const r = applyTool(state, i);
    if (!r.changed) continue;
    const rest = searchSolution(r.state, depth - 1);
    if (rest) return [i, ...rest];
  }
  return undefined;
}

describe('levels', () => {
  it('レベルが 1 つ以上ある', () => {
    expect(levels.length).toBeGreaterThan(0);
  });

  for (const level of levels) {
    describe(level.id, () => {
      it('start と goal がちょうど 1 つずつある', () => {
        const b = buildBoard(level);
        expect(findTile(b, 'start')).toBeDefined();
        expect(findTile(b, 'goal')).toBeDefined();
        expect(b.tiles.filter((t) => t.kind === 'start').length).toBe(1);
        expect(b.tiles.filter((t) => t.kind === 'goal').length).toBe(1);
      });

      it('グリッドは最大 7x7(決定事項 Q6)', () => {
        expect(level.size.w).toBeLessThanOrEqual(7);
        expect(level.size.h).toBeLessThanOrEqual(7);
      });

      it('初期状態では解けていない', () => {
        expect(solve(buildBoard(level)).connected).toBe(false);
      });

      it('6 手以内で解ける(6.1)', () => {
        const state: GameState = { board: buildBoard(level), tools: buildTools(level) };
        const sol = searchSolution(state, 6);
        expect(sol).toBeDefined();
      });
    });
  }
});

describe('level01', () => {
  const level = levels[0]!;

  it('回転ツールがちょうど 1 つ', () => {
    expect(level.tools.length).toBe(1);
    expect(level.tools[0]?.kind).toBe('rotate');
  });

  it('回転 1 回だけで繋がる(チュートリアル)', () => {
    const state: GameState = { board: buildBoard(level), tools: buildTools(level) };
    expect(solve(state.board).connected).toBe(false);
    const after = applyTool(state, 0);
    expect(after.changed).toBe(true);
    const r = solve(after.state.board);
    expect(r.connected).toBe(true);
    expect(r.path.length).toBe(7);
  });

  it('切れ目の手前までプレビュー線が伸びる', () => {
    const r = solve(buildBoard(level));
    expect(r.connected).toBe(false);
    expect(r.path.at(-1)).toEqual({ x: 1, y: 2 });
  });
});
