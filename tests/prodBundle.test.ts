import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
