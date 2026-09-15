/** Suck for a while, rotate the device, and check the scene survives it. */
import { startServer } from './serve.mjs';
import { launch, DEVICES } from './shot.mjs';
const { server, url } = await startServer(8134);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`${url}/index.html?scene=sand&seed=1337&mute=1`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => {
  const g = window.game; g.pause(); g.step(0.2);
  const st = g.state(), p = st.scene.debris[0];
  for (let i = 0; i < 60 * 8; i++) {
    const a = i / 60 * 1.4, r = 0.03 + ((i / 720) % 1) * 0.25;
    g.input.pointer(p.nx + Math.cos(a) * r, p.ny + 92 / st.viewport.h + Math.sin(a) * r * 0.9, true);
    g.step(1 / 60);
  }
});
const before = await page.evaluate(() => { const s = window.game.state(); return { frac: s.scene.debris[0].frac, left: s.scene.remaining, cup: s.vacuum.cup }; });
await page.setViewportSize({ width: 844, height: 390 });
await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
await page.evaluate(() => { window.game.step(0.2); });
const after = await page.evaluate(() => { const s = window.game.state(); return { pose: s.pose, frac: s.scene.debris[0].frac, left: s.scene.remaining, cup: s.vacuum.cup }; });
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
await page.evaluate(() => { window.game.step(0.2); });
const back = await page.evaluate(() => { const s = window.game.state(); return { pose: s.pose, frac: s.scene.debris[0].frac, left: s.scene.remaining }; });
console.log('before', JSON.stringify(before), '\nafter ', JSON.stringify(after), '\nback  ', JSON.stringify(back));
await browser.close(); server.close();
