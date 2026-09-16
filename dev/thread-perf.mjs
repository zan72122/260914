/**
 * Free-running fps + page-error check for one scene on all four devices.
 * `SC=sand node dev/thread-perf.mjs` points it somewhere else.
 *
 * dev/fps.mjs supersedes this (it drives a closed loop on the mouth, reports
 * min/p10/median and can break the frame down with --profile); this is kept
 * because it is two screenfuls and it also watches the console.
 */
import { startServer } from './serve.mjs';
import { launch } from './shot.mjs';

const SC = process.env.SC || 'thread';
const DEV = { 'iphone-portrait': [390, 844], 'iphone-landscape': [844, 390], 'ipad-portrait': [820, 1180], 'ipad-landscape': [1180, 820] };
const { server, url } = await startServer(Number(process.env.PORT || 0) || 8456);
const browser = await launch();
for (const [name, [w, h]] of Object.entries(DEV)) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
  await page.goto(`${url}/index.html?scene=${SC}&seed=1337&dev=1&mute=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.game);
  // drive the pointer across the room while it runs at real time
  await page.evaluate(() => {
    const f = [];
    for (let t = 0; t <= 4000; t += 25) {
      const u = t / 4000;
      f.push({ t, x: 0.2 + 0.6 * u, y: 0.8 - 0.45 * Math.sin(u * Math.PI), down: true });
    }
    window.game.input.replay(f);
  });
  await page.waitForTimeout(4200);
  const s = await page.evaluate(() => window.game.state());
  console.log(name, 'fps', s.fps, 'remaining', s.scene.remaining, 'cup', s.vacuum.cup, 'errors', errs.length ? errs : 'none');
  if (errs.length) console.log('  ', errs.join(' | '));
  await ctx.close();
}
await browser.close();
server.close();
