/**
 * Paper-scene probe.
 *
 * `dev/gestures.mjs` assumes a 70px nozzle lead in portrait while the vacuum
 * actually draws the head 92px ahead, so `--target=<id>` stops with the target
 * just BEHIND the mouth — fine for a dust bunny, fatal when what you want to
 * watch is the heavy paper plane being pulled straight into the intake. This
 * drives window.game.input.replay directly with a corrected destination.
 *
 *   node dev/paper-probe.mjs --device=iphone-portrait --target=plane --dur=2600
 *   node dev/paper-probe.mjs --device=iphone-portrait --target=plane --hold=1800
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { launch, DEVICES } from './shot.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'dev', 'out');
const LEAD = { portrait: 92, landscape: 78 };

const a = {};
for (const s of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(s);
  if (m) a[m[1]] = m[2] === undefined ? true : m[2];
}
const deviceName = a.device || 'iphone-portrait';
const dim = DEVICES[deviceName];
const target = a.target || 'plane';
const dur = parseInt(a.dur || '2600', 10);
const hold = parseInt(a.hold || '0', 10);
const frames = parseInt(a.frames || '18', 10);
const every = parseInt(a.every || '170', 10);
const dirName = a.out || `paper-probe-${deviceName}-${target}`;
const dir = join(OUT, dirName);

const { server, url } = await startServer(Number(process.env.PORT || 0) || 8611);
const browser = await launch();
const ctx = await browser.newContext({
  viewport: { width: dim.width, height: dim.height },
  deviceScaleFactor: Math.min(2, dim.dpr), isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`${url}/index.html?scene=paper&seed=${a.seed || 1337}&mute=1`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => { window.game.pause(); window.game.step(0.25); });

const st0 = await page.evaluate(() => window.game.state());
const pose = st0.pose;
const d = st0.scene.debris.find((x) => x.id === target) || st0.scene.debris.find((x) => x.type === target);
if (!d) throw new Error('no such debris: ' + target);
const lead = LEAD[pose] / st0.viewport.h;
const from = { x: 0.5, y: 0.84 };
const to = { x: d.nx, y: d.ny + lead };            // the REAL lead, not 70px

const g = [{ t: 0, x: from.x, y: from.y, down: false }];
const n = Math.round(dur / 25);
for (let i = 0; i <= n; i++) {
  const u = i / n, e = u * u * (3 - 2 * u);
  g.push({ t: 40 + Math.round(u * dur), x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, down: true });
}
for (let t = 25; t <= hold; t += 25) g.push({ t: 40 + dur + t, x: to.x, y: to.y, down: true });
await page.evaluate((fr) => window.game.input.replay(fr), g);

await rm(dir, { recursive: true, force: true });
await mkdir(dir, { recursive: true });
const states = [];
for (let i = 0; i < frames; i++) {
  await page.evaluate((dt) => window.game.step(dt), every / 1000);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: join(dir, String(i).padStart(3, '0') + '.png') });
  states.push(await page.evaluate(() => window.game.state()));
}
await writeFile(join(dir, 'state.json'), JSON.stringify({ device: deviceName, target, to, states }, null, 1));
await browser.close();
server.close();
console.log('wrote', frames, 'frames to', dir);
