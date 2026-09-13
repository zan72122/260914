// 全レベルをランダムに撃ち尽くし、エラー無く clear か rewind に遷移することを確認する
import { chromium } from 'playwright';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('file://' + resolve('index.html'));
await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 15000 });
const cdp = await page.context().newCDPSession(page);
const tp = (type, xx, yy) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: xx, y: yy, id: 1 }] });
const g = () => page.evaluate(() => ({ s: window.__game.state, lv: window.__game.level, n: window.__game.blocks.count(), rack: window.__game.balls.rackCount() }));
let fails = 0;
for (let lv = 0; lv < 10; lv++) {
  await page.evaluate((i) => window.__game.startLevel(i), lv);
  await page.waitForFunction((i) => window.__game.state === 'play' && window.__game.level === i, lv, { timeout: 15000 });
  await page.waitForTimeout(300);
  const start = await g();
  let shots = 0;
  for (let i = 0; i < 14; i++) {
    const st = await g();
    if (st.s !== 'play' || st.lv !== lv) break;
    if (st.rack === 0) { await page.waitForTimeout(700); continue; }
    const x = 195, y = 650, dx = (Math.random() - 0.5) * 60, dy = 20 + Math.random() * 120;
    await tp('touchStart', x, y);
    for (let k = 1; k <= 6; k++) { await tp('touchMove', x + dx * k / 6, y + dy * k / 6); await page.waitForTimeout(25); }
    await tp('touchEnd', 0, 0); shots++;
    await page.waitForTimeout(1500);
  }
  const t0 = Date.now(); let st;
  while (Date.now() - t0 < 15000) { st = await g(); if (st.s !== 'play' || st.lv !== lv) break; await page.waitForTimeout(300); }
  const ok = st.s !== 'play' || st.lv !== lv;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} level ${lv + 1}: blocks ${start.n}, balls ${start.rack}, shots ${shots} -> ${st.s === 'play' ? 'cleared (next level)' : st.s} remaining=${st.n}`);
}
console.log(errors.length ? `errors: ${JSON.stringify(errors.slice(0, 5))}` : 'no page errors');
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
