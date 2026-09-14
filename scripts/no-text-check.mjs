#!/usr/bin/env node
/**
 * Wordless charter, enforced at build time: nothing under src/ may import
 * `Text` or `BitmapText` (or HTMLText) from pixi.js, and no Pixi text class
 * may be constructed. Dependency-free so it runs anywhere `node` runs.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(root, 'src');

const BANNED_IMPORT = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]pixi\.js['"]/g;
const BANNED_NAMES = /^(Text|BitmapText|HTMLText|CanvasTextMetrics|TextStyle|HTMLTextStyle)$/;
const BANNED_NEW = /\bnew\s+(?:PIXI\.)?(Text|BitmapText|HTMLText)\s*\(/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(p);
  }
  return out;
}

const problems = [];
for (const file of walk(srcDir)) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(root, file);
  for (const m of src.matchAll(BANNED_IMPORT)) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (name && BANNED_NAMES.test(name)) {
        problems.push(`${rel}: imports \`${name}\` from pixi.js`);
      }
    }
  }
  const n = src.match(BANNED_NEW);
  if (n) problems.push(`${rel}: constructs \`${n[1]}\``);
}

if (problems.length > 0) {
  console.error('no-text-check failed - the game must contain zero text:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`no-text-check ok (${walk(srcDir).length} files)`);
