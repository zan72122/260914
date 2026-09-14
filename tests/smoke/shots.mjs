// 各レベル形式のスクリーンショットを撮るだけの補助スクリプト(node tests/smoke/shots.mjs <outdir>)
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
const out = process.argv[2] || 'test-results/shots';
const server = await createServer({ root: process.cwd(), server: { port: 5199 } });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
async function run(name, w, h, kinds) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:5199/?test');
  // 指定した形式のレベルをセットして再読込
  await page.evaluate((kinds) => {
    const s = window.__tt.song();
    s.layers.forEach((l, i) => { l.kind = kinds[i]; });
    s.currentLevel = 0;
    localStorage.setItem('tune-train/song/v2', JSON.stringify(s));
  }, kinds);
  for (let level = 0; level < 3; level++) {
    await page.evaluate((level) => { const s = JSON.parse(localStorage.getItem('tune-train/song/v2')); s.currentLevel = level; s.layers[level].placements = [{ slot: 2, inst: s.layers[level].instruments[0], pitch: 3 }, { slot: 5, inst: s.layers[level].instruments[1], pitch: 1 }]; localStorage.setItem('tune-train/song/v2', JSON.stringify(s)); }, level);
    await page.reload();
    await page.waitForTimeout(500);
    await page.touchscreen.tap(w / 2, h * 0.3);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}/${name}-${level}-${kinds[level]}.png` });
  }
  console.log(name, 'errors:', errors.slice(0, 3));
  await ctx.close();
}
await run('portrait', 390, 844, ['train', 'grid', 'musicbox', 'train']);
await run('landscape', 1180, 820, ['train', 'grid', 'musicbox', 'train']);
await browser.close(); await server.close();
