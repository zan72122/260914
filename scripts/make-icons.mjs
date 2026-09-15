/**
 * public/icon.svg から、ホーム画面用の PNG を作る。
 *
 * 追加の依存を入れず、同梱の Chromium（Playwright）で SVG を描いて切り出す。
 *   node scripts/make-icons.mjs
 * 出来上がる物は public/ に置き、そのまま配布物に入る。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(resolve(root, 'public/icon.svg'), 'utf8');

/**
 * maskable は端末が四隅を大きく削るので、炎を内側に寄せる（安全領域 80%）。
 * それ以外は SVG をそのまま出す。
 */
function page(size, maskable) {
  const scale = maskable ? 0.62 : 1;
  return `<!doctype html><html><body style="margin:0;background:#05070d">
<div style="width:${size}px;height:${size}px;background:#05070d;display:flex;align-items:center;justify-content:center;overflow:hidden">
<div style="width:${size}px;height:${size}px;transform:scale(${scale});transform-origin:center">
${svg.replace('width="512" height="512"', `width="${size}" height="${size}"`)}
</div></div></body></html>`;
}

const targets = [
  { file: 'public/icon-192.png', size: 192, maskable: false },
  { file: 'public/icon-512.png', size: 512, maskable: false },
  { file: 'public/icon-maskable-512.png', size: 512, maskable: true },
  // iOS の「ホーム画面に追加」が使う
  { file: 'public/apple-touch-icon.png', size: 180, maskable: false },
];

const browser = await chromium.launch();
for (const t of targets) {
  const p = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
  await p.setContent(page(t.size, t.maskable));
  const buf = await p.screenshot({ type: 'png', omitBackground: false });
  writeFileSync(resolve(root, t.file), buf);
  await p.close();
  console.log(`${t.file} ${t.size}x${t.size}${t.maskable ? ' (maskable)' : ''}`);
}
await browser.close();
