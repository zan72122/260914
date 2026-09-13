// Drives the game in headless Chromium at iPhone/iPad sizes and saves screenshots to shots/.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8080/';
const OUT = process.env.OUT || 'shots';
mkdirSync(OUT, { recursive: true });

const devices = [
  { name: 'iphone-portrait', width: 393, height: 852, dpr: 3, mobile: true },
  { name: 'iphone-landscape', width: 852, height: 393, dpr: 3, mobile: true },
  { name: 'ipad-portrait', width: 820, height: 1180, dpr: 2, mobile: true },
  { name: 'ipad-landscape', width: 1180, height: 820, dpr: 2, mobile: true },
];

const browser = await chromium.launch();
const errors = [];
for (const d of devices) {
  const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.dpr, isMobile: d.mobile, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${d.name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${d.name}: ${m.text()}`); });
  await page.goto(BASE + 'index.html?t=' + Date.now());
  await page.waitForFunction(() => window.__poppo && window.__poppo.app.map);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${d.name}-1-map.png` });
  // open level 1
  const st = await page.evaluate(() => window.__poppo.station(0));
  await page.touchscreen.tap(st.x, st.y);
  await page.waitForFunction(() => window.__poppo.app.scene === 'level' && window.__poppo.app.fadeDir === 0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${d.name}-2-level1.png` });
  // place the missing piece then start the train
  const c = await page.evaluate(() => window.__poppo.cellCenter(2, 1));
  await page.touchscreen.tap(c.x, c.y);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${d.name}-3-connected.png` });
  const loco = await page.evaluate(() => { const l = window.__poppo.app.lv.level.loco; return window.__poppo.cellCenter(l.x, l.y); });
  await page.touchscreen.tap(loco.x, loco.y);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${d.name}-4-running.png` });
  await page.waitForFunction(() => ['clear', 'depart'].includes(window.__poppo.app.lv.phase), null, { timeout: 8000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${d.name}-5-clear.png` });
  await page.waitForFunction(() => window.__poppo.app.scene === 'map', null, { timeout: 15000 });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/${d.name}-6-map-after.png` });
  if (d.name === 'iphone-portrait') {
    // level 2 through fail: open, start without track -> stuck -> rewind
    const s2 = await page.evaluate(() => window.__poppo.station(1));
    await page.touchscreen.tap(s2.x, s2.y);
    await page.waitForFunction(() => window.__poppo.app.scene === 'level' && window.__poppo.app.fadeDir === 0);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${d.name}-7-level2-ghost.png` });
    const l2 = await page.evaluate(() => { const l = window.__poppo.app.lv.level.loco; return window.__poppo.cellCenter(l.x, l.y); });
    await page.touchscreen.tap(l2.x, l2.y);
    await page.waitForFunction(() => window.__poppo.app.lv.phase === 'fail', null, { timeout: 8000 });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/${d.name}-8-level2-stuck.png` });
    await page.waitForFunction(() => window.__poppo.app.lv.phase === 'idle', null, { timeout: 8000 });
    // a 3-car level for visual check
    await page.evaluate(() => { localStorage.setItem('poppo.v1', JSON.stringify({ cleared: Object.fromEntries([...Array(14).keys()].map((i) => [i + 1, true])) })); });
    await page.goto(BASE + 'index.html?t=' + Date.now());
    await page.waitForFunction(() => window.__poppo && window.__poppo.app.map);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${d.name}-9-map-progress.png` });
    const s15 = await page.evaluate(() => window.__poppo.station(14));
    await page.touchscreen.tap(s15.x, s15.y);
    await page.waitForFunction(() => window.__poppo.app.scene === 'level' && window.__poppo.app.fadeDir === 0);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${d.name}-10-level15.png` });
  }
  await ctx.close();
}
await browser.close();
if (errors.length) { console.error('PAGE ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('screenshots written to', OUT);
