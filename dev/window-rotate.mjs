/**
 * Play a bit of the window room, rotate the device twice, and check that the
 * room survives it: the pieces already collected stay collected, the nest that
 * has been uncovered stays uncovered, and the stickers that have been wiped
 * clear stay wiped.
 *
 *   node dev/window-rotate.mjs
 */
import { startServer } from './serve.mjs';
import { launch } from './shot.mjs';

const { server, url } = await startServer(Number(process.env.PORT || 0) || 8135);
const browser = await launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`${url}/index.html?scene=window&seed=1337&mute=1`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);

/** Drive the mouth onto the nearest live piece for a while, closed loop. */
const play = (seconds) => page.evaluate((secs) => {
  const g = window.game;
  g.pause();
  for (let i = 0; i < 60 * secs; i++) {
    const s = g.state();
    // stop the moment the room hands back to the hall: this probe is about the
    // room surviving a rotation, and a finished room is a different scene
    if (s.scene.id !== 'window') break;
    const live = s.scene.debris.filter((d) => d.state !== 'in-cup' && !d.decor && !d.dormant);
    if (live.length > 3) {
      const t = live[0];
      const lead = 92 / s.viewport.h + (22 * s.camera.zoom) / s.viewport.h;
      g.input.pointer(t.nx, t.ny + lead, true);
    }
    g.step(1 / 60);
  }
}, seconds);

const snap = () => page.evaluate(() => {
  const s = window.game.state();
  return {
    pose: s.pose, left: s.scene.remaining, cup: s.vacuum.cup,
    covered: s.scene.debris.filter((d) => d.dormant).length,
    id: s.scene.id, lift: s.scene.curtain ? s.scene.curtain.liftMax : null,
  };
});

await play(6);
const before = await snap();

await page.setViewportSize({ width: 844, height: 390 });
await page.evaluate(() => new Promise((r) => setTimeout(r, 340)));
await page.evaluate(() => window.game.step(0.2));
const after = await snap();

await play(4);
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => new Promise((r) => setTimeout(r, 340)));
await page.evaluate(() => window.game.step(0.2));
const back = await snap();

console.log('before', JSON.stringify(before));
console.log('after ', JSON.stringify(after));
console.log('back  ', JSON.stringify(back));
const ok = after.left <= before.left && back.left <= after.left && after.covered <= before.covered;
console.log(ok ? 'OK: progress survived both rotations' : 'FAIL: progress went backwards');
await browser.close(); server.close();
process.exit(ok ? 0 : 1);
