// 手動確認用: 指定ビューポートで起動し、数秒後にスクリーンショットを撮る
import { chromium } from 'playwright';
import { resolve } from 'node:path';
const [,, w = '390', h = '844', name = 'shot', waitMs = '4000'] = process.argv;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('file://' + resolve('index.html'));
await page.waitForTimeout(+waitMs);
await page.screenshot({ path: `test/out/${name}.png` });
console.log('state', await page.evaluate(() => ({ s: window.__game.state, lv: window.__game.level, n: window.__game.blocks.count(), rack: window.__game.balls.rackCount() })));
await browser.close();
