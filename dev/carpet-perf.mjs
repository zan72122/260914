/** Real-time fps probe for the carpet scene (and any other, for comparison). */
import { startServer } from './serve.mjs';
import { launch } from './shot.mjs';
import { makeGesture } from './gestures.mjs';

const scene = process.argv[2] || 'carpet';
const dev = process.argv[3] || 'iphone-portrait';
const DEV = { 'iphone-portrait': [390, 844, 3], 'iphone-landscape': [844, 390, 3], 'ipad-portrait': [820, 1180, 2], 'ipad-landscape': [1180, 820, 2] }[dev];

const { server, url } = await startServer(Number(process.env.PORT || 0) || 8232);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: DEV[0], height: DEV[1] }, deviceScaleFactor: Math.min(2, DEV[2]), isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`${url}/index.html?scene=${scene}&seed=1337&mute=1`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
// a long rub right across the middle, looping
const g = makeGesture('rub', { from: { x: 0.5, y: 0.8 }, to: { x: 0.5, y: 0.5 }, dur: 9000 });
await page.evaluate((f) => window.game.input.replay(f), g);
if (process.env.DISABLE) {
  await page.evaluate((what) => {
    const sc = window.game._g.scene;
    if (what.includes('pile')) sc.floor.drawPile = () => {};
    if (what.includes('base')) sc.floor.draw = () => {};
    if (what.includes('reveal')) { const f = sc.floor; f.draw = (c) => { c.drawImage(f.base, f.rect.x0, f.rect.y0); }; }
    if (what.includes('onlyreveal')) { const f = sc.floor; f.draw = (c) => { c.drawImage(f.reveal, f.rug.x0, f.rug.y0); }; }
    if (what.includes('debris')) sc.drawDebris = () => {};
    if (what.includes('roller')) sc._drawRoller = () => {};
    if (what.includes('comb')) sc.floor.comb = () => 0;
  }, process.env.DISABLE);
}
const out = [];
for (let i = 0; i < 18; i++) {
  await page.waitForTimeout(500);
  out.push(await page.evaluate(() => window.game.state().fps));
}
out.sort((a, b) => a - b);
console.log(scene, dev, 'fps samples', out.map((v) => v.toFixed(0)).join(' '));
console.log('  median', out[out.length >> 1].toFixed(1), 'p10', out[1].toFixed(1), 'min', out[0].toFixed(1));
await browser.close();
server.close();
