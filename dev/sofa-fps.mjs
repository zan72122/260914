/**
 * Real-time fps probe for the sofa scene (the frame grabber steps the clock by
 * hand, so its `fps` number means nothing). Runs the page unpaused with a
 * scripted finger that drives under the sofa, and samples game.state().fps.
 *
 *   node dev/sofa-fps.mjs --device=ipad-landscape --seconds=6
 */
import { startServer } from './serve.mjs';
import { launch, DEVICES } from './shot.mjs';

const a = {};
for (const s of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(s);
  if (m) a[m[1]] = m[2] === undefined ? true : m[2];
}
const deviceName = a.device || 'ipad-landscape';
const seconds = parseFloat(a.seconds || '6');
const dim = DEVICES[deviceName];
const pose = dim.width >= dim.height ? 'landscape' : 'portrait';

const { server, url } = await startServer(Number(process.env.PORT || 0) || 8123);
const browser = await launch();
const ctx = await browser.newContext({
  viewport: { width: dim.width, height: dim.height },
  deviceScaleFactor: Math.min(2, dim.dpr), isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}/index.html?scene=${process.env.SC || 'sofa'}&seed=1337&mute=1`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);

const frames = [];
const x0 = pose === 'portrait' ? 0.5 : 0.2;
for (let t = 0; t <= seconds * 1000; t += 40) {
  const u = Math.min(1, t / (seconds * 700));
  frames.push({
    t, down: t > 60,
    x: x0 + (pose === 'portrait' ? Math.sin(t / 900) * 0.12 : u * 0.55),
    y: 0.82 - u * 0.48,
  });
}
await page.evaluate((f) => window.game.input.replay(f), frames);

const samples = [];
const t0 = Date.now();
while (Date.now() - t0 < seconds * 1000) {
  await page.waitForTimeout(250);
  const s = await page.evaluate(() => window.game.state());
  samples.push({ fps: s.fps, under: s.scene.under, left: s.scene.remaining });
}
const fps = samples.slice(2).map((s) => s.fps);
fps.sort((x, y) => x - y);
console.log(deviceName,
  'min', fps[0], 'p10', fps[Math.floor(fps.length * 0.1)],
  'median', fps[Math.floor(fps.length / 2)], 'max', fps[fps.length - 1],
  '| under', samples[samples.length - 1].under, 'left', samples[samples.length - 1].left,
  '| errors', errors.length, errors.slice(0, 2).join(' '));
await browser.close();
server.close();
