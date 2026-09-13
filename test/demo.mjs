import { chromium } from 'playwright';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('file://' + resolve('index.html'));
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 15000 });
const t0 = Date.now();
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(250);
  const d = await page.evaluate(() => window.__game.debug());
  if (d.demoActive) { console.log('demo active at', (Date.now() - t0) / 1000, d); await page.waitForTimeout(1100); await page.screenshot({ path: 'test/out/demo.png' }); break; }
}
await browser.close();
