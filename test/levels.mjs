// 全レベルのスクリーンショットを撮る（レイアウト確認用）
import { chromium } from 'playwright';
import { resolve } from 'node:path';
const [,, w='390', h='844'] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, hasTouch: true, isMobile: true });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('file://' + resolve('index.html'));
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 15000 });
const n = await page.evaluate(() => 10);
for (let i = 0; i < n; i++) {
  await page.evaluate((i) => window.__game.startLevel(i), i);
  await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 15000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `test/out/level-${String(i + 1).padStart(2, '0')}-${w}x${h}.png` });
}
await browser.close();
