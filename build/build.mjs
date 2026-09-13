// src/ を1ファイルにバンドルし、template.html にインラインして index.html を生成する。
// iOS Safari の file:// では ES modules / fetch / WASM が不安定なため、全てインライン化する。
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['safari15'],
  write: false,
  legalComments: 'none',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const tpl = readFileSync('src/template.html', 'utf8');
const html = tpl.replace('<!--APP-->', () => `<script>${js}</script>`);
writeFileSync('index.html', html);
console.log(`index.html written (${(html.length / 1024).toFixed(0)} KB)`);
