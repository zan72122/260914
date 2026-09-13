import { chromium } from 'playwright';
import { resolve } from 'node:path';
const [,, w='390', h='844', pullFrac='0.05', dxFrac='0'] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, hasTouch: true, isMobile: true });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('file://' + resolve('index.html'));
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 15000 });
await page.waitForTimeout(500);
const cdp = await page.context().newCDPSession(page);
const tp = (type, xx, yy) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: xx, y: yy, id: 1 }] });
const x = +w / 2, y = +h * 0.78;
await tp('touchStart', x, y);
for (let i = 1; i <= 8; i++) { await tp('touchMove', x + (+dxFrac) * +w * i / 8, y + (+pullFrac) * +h * i / 8); await page.waitForTimeout(30); }
await page.screenshot({ path: 'test/out/probe-aim.png' });
await tp('touchEnd', 0, 0);
for (let t = 0; t < 10; t++) {
  await page.waitForTimeout(300);
  console.log(t*0.3, await page.evaluate(() => ({ n: window.__game.blocks.count(), frozen: window.__game.blocks.frozenCount(), mv: window.__game.blocks.movingCount(), fly: window.__game.balls.flyingCount() })));
  if (t === 2) await page.screenshot({ path: 'test/out/probe-mid.png' });
}
await page.screenshot({ path: 'test/out/probe-end.png' });
await browser.close();
