import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCTION_SCENARIO, SCENARIOS } from '../src/scenarios/scenarios';

const root = resolve(__dirname, '..');
const dist = join(root, 'dist');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

describe('本番ビルド', () => {
  it('出力に開発用入口 __fire が含まれない', () => {
    // 本番ビルドをその場で作り直してから調べる
    execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: root, stdio: 'inherit' });
    const files = walk(dist);
    expect(files.length).toBeGreaterThan(0);
    const leaked = files.filter((f) => readFileSync(f, 'utf8').includes('__fire'));
    expect(leaked, `dev entry leaked into: ${leaked.join(', ')}`).toEqual([]);
    // 開発用モジュール自体が含まれないことも確かめる
    const devLeak = files.filter((f) => readFileSync(f, 'utf8').includes('installDevEntry'));
    expect(devLeak).toEqual([]);
  }, 120000);
});

describe('本番の開始状態', () => {
  it('毎回同じ一つのシナリオから始まる', () => {
    expect(PRODUCTION_SCENARIO).toBe('copper_called');
    expect(SCENARIOS[PRODUCTION_SCENARIO]).toBeDefined();
  });

  it('シナリオと発話の切り替えは開発ビルドの中でしか読まない', () => {
    const main = readFileSync(join(root, 'src/main.ts'), 'utf8');
    const guard = main.indexOf('import.meta.env.DEV');
    expect(guard).toBeGreaterThan(0);
    // location.search / URLSearchParams の読み取りはすべて DEV の判定より後にある
    for (const needle of ['location.search', 'URLSearchParams']) {
      const at = main.indexOf(needle);
      expect(at, `${needle} は DEV の判定より前で読まれている`).toBeGreaterThan(guard);
    }
  });
});
