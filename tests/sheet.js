// フレーム画像からコンタクトシート PNG を作る（レビュー用）
//   node tests/sheet.js <prefix> <out.png> [crop "x,y,w,h"] [cols] [scale]
// 例: node tests/sheet.js open screenshots/frames/sheet-open.png 0,60,390,280
import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'screenshots', 'frames');

const [prefix, outArg, cropSpec, colsArg, scaleArg] = process.argv.slice(2);
if (!prefix || !outArg) {
  console.error('usage: node tests/sheet.js <prefix> <out.png> [x,y,w,h] [cols] [scale]');
  process.exit(1);
}
const out = path.resolve(ROOT, outArg);

const rx = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+\\.png$`);
const files = fs.readdirSync(DIR).filter((f) => rx.test(f)).sort();
if (!files.length) {
  console.error(`no frames matching "${prefix}*" in ${DIR}`);
  process.exit(1);
}
const imgs = files.map((f) => 'data:image/png;base64,' + fs.readFileSync(path.join(DIR, f)).toString('base64'));

const [cx, cy, cw, ch] = (cropSpec || '0,0,390,844').split(',').map(Number);
const cols = Number(colsArg) || 5;
const scale = Number(scaleArg) || 0.6;
const cellW = cw * scale, cellH = ch * scale;

const html = `<body style="margin:0;background:#222">
<div style="display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:4px">
${imgs.map((s, i) => `<div style="position:relative;width:${cellW}px;height:${cellH}px;overflow:hidden">
<img src="${s}" style="position:absolute;left:${-cx * scale}px;top:${-cy * scale}px;transform-origin:0 0;transform:scale(${scale})">
<span style="position:absolute;left:2px;top:2px;color:#fff;font:12px sans-serif;text-shadow:0 0 3px #000">${i + 1}</span>
</div>`).join('')}
</div></body>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: Math.ceil(cols * (cellW + 4)), height: Math.ceil(Math.ceil(imgs.length / cols) * (cellH + 4)) });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`${files.length} frames -> ${path.relative(ROOT, out)}`);
