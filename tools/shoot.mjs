// 開発用: ローカルで画面を撮って確認する。node tools/shoot.mjs <outdir>
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const out = process.argv[2] || 'shots';
const srv = spawn('npx', ['http-server', '.', '-p', '8123', '-s'], { cwd: path.resolve('.'), stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
async function shoot(name, vw, vh, actions) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ': ' + m.text()); });
  await page.goto('http://localhost:8123/index.html');
  await page.waitForTimeout(600);
  if (actions) await actions(page);
  await page.screenshot({ path: `${out}/${name}.png` });
  await ctx.close();
}
const tile = (page, W, H, u, v) => page.evaluate(([u, v]) => { const G = window.__game.G; return [G.px + G.M + u * G.T, G.py + G.M + v * G.T]; }, [u, v]);
async function drag(page, from, to, steps = 12) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
    await page.waitForTimeout(16);
  }
}
await shoot('portrait-l1', 390, 844);
await shoot('landscape-l1', 844, 390);
await shoot('ipad-l1', 820, 1180);
await shoot('portrait-l1-midfold', 390, 844, async (page) => {
  const a = await tile(page, 0, 0, 3.6, 2);
  const b = await tile(page, 0, 0, 2.6, 2);
  await drag(page, a, b);
  await page.waitForTimeout(100);
});
await shoot('portrait-l1-folded', 390, 844, async (page) => {
  const a = await tile(page, 0, 0, 3.6, 2);
  const b = await tile(page, 0, 0, 1.4, 2);
  await drag(page, a, b);
  await page.mouse.up();
  await page.waitForTimeout(900);
  const g = await tile(page, 0, 0, 0.5, 3.5);
  await page.mouse.click(g[0], g[1]);
  await page.waitForTimeout(1400);
});
await shoot('portrait-l1-clear', 390, 844, async (page) => {
  const a = await tile(page, 0, 0, 3.6, 2);
  const b = await tile(page, 0, 0, 1.4, 2);
  await drag(page, a, b);
  await page.mouse.up();
  await page.waitForTimeout(900);
  const g = await tile(page, 0, 0, 0.5, 3.5);
  await page.mouse.click(g[0], g[1]);
  await page.waitForTimeout(3600);
});
await shoot('portrait-l2-after-turn', 390, 844, async (page) => {
  const a = await tile(page, 0, 0, 3.6, 2);
  const b = await tile(page, 0, 0, 1.4, 2);
  await drag(page, a, b);
  await page.mouse.up();
  await page.waitForTimeout(900);
  const g = await tile(page, 0, 0, 0.5, 3.5);
  await page.mouse.click(g[0], g[1]);
  await page.waitForTimeout(6500);
});
for (const [i, name] of [[4, 'l5'], [6, 'l7'], [7, 'l8'], [8, 'l9'], [9, 'l10']]) {
  await shoot('portrait-' + name, 390, 844, async (page) => {
    await page.evaluate((i) => window.__game.loadLevel(i), i);
    await page.waitForTimeout(300);
  });
}
await shoot('finale', 390, 844, async (page) => {
  await page.evaluate(() => window.__game.loadLevel(10));
  await page.waitForTimeout(800);
});
await browser.close();
srv.kill();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
