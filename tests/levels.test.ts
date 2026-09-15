import { describe, expect, it } from 'vitest';
import { levels } from '../src/levels';
import { buildBoard, buildTools } from '../src/levels/schema';
import { solve } from '../src/core/solve';
import { applyTool } from '../src/core/tools';
import { findTile } from '../src/core/board';
import type { GameState } from '../src/core/types';
import { HIT_SIZE } from '../src/render/overlay';

/** 6.1: どの面も正解手数は最大 6 操作 */
const MAX_MOVES = 6;

function stateKey(s: GameState): string {
  const b = s.board.tiles.map((t) => `${t.kind}${t.rot}${t.height}${t.layer}`).join('|');
  const tools = s.tools.map((t) => (t.used ? '1' : '0')).join('');
  return `${b}#${tools}`;
}

/**
 * 総当たり(幅優先)で最短手数を求める。
 *
 * 1 手 = ツール 1 つを 1 回タップ。回転は 4 回で元に戻り、上げ下げは 2 回で元に戻り、
 * 破壊は 1 回で使い切りなので、探索空間は「各ツールの適用回数の組合せ」そのものになる。
 * ただし破壊で現れたタイルを回す(レベル 9)のように順序が効く場合があるため、
 * 回数の組合せではなく順序込みの幅優先で探索する(回数の組合せを完全に含む)。
 */
function minMoves(start: GameState, limit: number): number | undefined {
  if (solve(start.board).connected) return 0;
  let frontier: GameState[] = [start];
  const seen = new Set<string>([stateKey(start)]);
  for (let depth = 1; depth <= limit; depth++) {
    const next: GameState[] = [];
    for (const s of frontier) {
      for (let i = 0; i < s.tools.length; i++) {
        const r = applyTool(s, i);
        if (!r.changed) continue;
        const k = stateKey(r.state);
        if (seen.has(k)) continue;
        seen.add(k);
        if (solve(r.state.board).connected) return depth;
        next.push(r.state);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return undefined;
}

function initialState(levelIndex: number): GameState {
  const level = levels[levelIndex]!;
  return { board: buildBoard(level), tools: buildTools(level) };
}

describe('levels', () => {
  it('10 面ある', () => {
    expect(levels.length).toBe(10);
  });

  it('ID が重複していない', () => {
    expect(new Set(levels.map((l) => l.id)).size).toBe(levels.length);
  });

  levels.forEach((level, index) => {
    describe(level.id, () => {
      it('start と goal がちょうど 1 つずつある', () => {
        const b = buildBoard(level);
        expect(findTile(b, 'start')).toBeDefined();
        expect(findTile(b, 'goal')).toBeDefined();
        expect(b.tiles.filter((t) => t.kind === 'start').length).toBe(1);
        expect(b.tiles.filter((t) => t.kind === 'goal').length).toBe(1);
      });

      it('グリッドは最大 7x7、乗り物は 1 台(決定事項 Q6 / 6.1)', () => {
        expect(level.size.w).toBeLessThanOrEqual(7);
        expect(level.size.h).toBeLessThanOrEqual(7);
      });

      it('ツールの範囲が盤面内にある', () => {
        for (const t of level.tools) {
          expect(t.cells.length).toBeGreaterThan(0);
          for (const c of t.cells) {
            expect(c.x).toBeGreaterThanOrEqual(0);
            expect(c.y).toBeGreaterThanOrEqual(0);
            expect(c.x).toBeLessThan(level.size.w);
            expect(c.y).toBeLessThan(level.size.h);
          }
        }
      });

      it('破壊ツールの範囲には block が含まれる(壊す対象は block のみ)', () => {
        const b = buildBoard(level);
        for (const t of level.tools) {
          if (t.kind !== 'destroy') continue;
          const hasBlock = t.cells.some((c) => b.tiles[c.y * b.w + c.x]?.kind === 'block');
          expect(hasBlock).toBe(true);
        }
      });

      it('初期状態では解けていない(3.3-(5))', () => {
        expect(solve(buildBoard(level)).connected).toBe(false);
      });

      it(`総当たりで解ける状態が存在し、最短手数が ${MAX_MOVES} 以下(6.1)`, () => {
        const n = minMoves(initialState(index), MAX_MOVES);
        expect(n).toBeDefined();
        expect(n!).toBeGreaterThan(0);
        expect(n!).toBeLessThanOrEqual(MAX_MOVES);
        // 難易度曲線の確認用に手数を出力する
        console.log(`${level.id}: 最短 ${n} 手`);
      });
    });
  });

  it('難易度曲線: 手数は 1 手から始まり、後半でも 6 手以内', () => {
    const counts = levels.map((_, i) => minMoves(initialState(i), MAX_MOVES));
    expect(counts[0]).toBe(1); // レベル 1 は 1 タップ(6.4)
    for (const c of counts) {
      expect(c).toBeDefined();
      expect(c!).toBeLessThanOrEqual(MAX_MOVES);
    }
    console.log(`全10面の最短手数: ${counts.join(', ')}`);
  });
});

describe('level01', () => {
  const level = levels[0]!;

  it('回転ツールがちょうど 1 つ', () => {
    expect(level.tools.length).toBe(1);
    expect(level.tools[0]?.kind).toBe('rotate');
  });

  it('回転 1 回だけで繋がる(チュートリアル)', () => {
    const state = initialState(0);
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

describe('列車のレベルは線路レイヤーになる', () => {
  for (const level of levels.filter((l) => l.vehicle === 'train')) {
    it(`${level.id} の全タイルが rail`, () => {
      const b = buildBoard(level);
      expect(b.tiles.every((t) => t.layer === 'rail')).toBe(true);
    });
  }
});

describe('当たり判定(5.2)', () => {
  it('隣り合うタイルのツールでも板が重ならない', () => {
    // 板は 1 タイル間隔で並ぶので、一辺が 1 未満なら重ならない
    expect(HIT_SIZE).toBeLessThan(1);
  });

  levels.forEach((level) => {
    it(`${level.id}: 同じマスに «同時に触れる» ツールが 2 つ載っていない`, () => {
      const board = buildBoard(level);
      const active = level.tools.filter((tool) => {
        // 瓦礫の上のツール(破壊以外)は、壊れて道が現れるまで隠れている
        if (tool.kind === 'destroy') return true;
        return !tool.cells.every((c) => board.tiles[c.y * board.w + c.x]?.kind === 'block');
      });
      const seen = new Set<string>();
      for (const tool of active) {
        for (const c of tool.cells) {
          const k = `${c.x},${c.y}`;
          expect(seen.has(k), `${k} が重複`).toBe(false);
          seen.add(k);
        }
      }
    });
  });
});
