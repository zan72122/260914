/**
 * Real-time fps probe for the sand scene: hold the nozzle on the middle of the
 * pile with the clock running normally and read back the loop's own fps.
 *   node dev/sand-bench.mjs [device]
 */
import { startServer } from './serve.mjs';
import { launch, DEVICES } from './shot.mjs';

const device = process.argv[2] || 'iphone-portrait';
const dim = DEVICES[device];
const { server, url } = await startServer(Number(process.env.PORT || 0));
const browser = await launch();
const ctx = await browser.newContext({
  viewport: { width: dim.width, height: dim.height },
  deviceScaleFactor: Math.min(2, dim.dpr), isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
const sceneId = process.argv[4] || 'sand';
await page.goto(`${url}/index.html?scene=${sceneId}&seed=1337&mute=1`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => {
  const st = window.game.state();
  const d = st.scene.debris[0];
  const lead = (st.pose === 'portrait' ? 92 : 78) / st.viewport.h;
  window.__t = { x: d.nx, y: d.ny + lead };
});
// drive the pointer straight onto the pile and hold it there
await page.evaluate(() => window.game.input.pointer(window.__t.x, window.__t.y, true));
const out = [];
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(1000);
  const s = await page.evaluate(() => window.game.state());
  out.push({ t: s.t, fps: s.fps, frac: s.scene.debris[0] && s.scene.debris[0].frac, grains: s.scene.debris[0] && s.scene.debris[0].grains, cup: s.vacuum.cup });
}
console.log(device, JSON.stringify(out, null, 1));
await browser.close();
server.close();
