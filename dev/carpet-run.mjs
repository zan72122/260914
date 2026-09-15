/**
 * Carpet-specific frame grabber: same idea as dev/shot.mjs, plus a `--pre`
 * hook that puts the scene into a state the standard harness cannot reach
 * (buried items already surfaced, or the rug already combed for the finale).
 *
 *   node dev/carpet-run.mjs --device=iphone-portrait --gesture=approach-slow \
 *        --pre=surface --target=glitter --frames=16 --every=100
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { launch, DEVICES } from './shot.mjs';
import { makeGesture, resolveTarget } from './gestures.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'dev', 'out');

const a = {};
for (const s of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(s);
  if (m) a[m[1]] = m[2] === undefined ? true : m[2];
}
const deviceName = a.device || 'iphone-portrait';
const dim = DEVICES[deviceName];
const gestureName = a.gesture || 'approach-slow';
const frames = parseInt(a.frames || '16', 10);
const every = parseInt(a.every || '100', 10);
const skip = parseInt(a.skip || '0', 10);
const dirName = a.out || `carpet-${deviceName}-${a.pre || 'plain'}-${gestureName}`;
const dir = join(OUT, dirName);
await rm(dir, { recursive: true, force: true });
await mkdir(dir, { recursive: true });

const { server, url } = await startServer(Number(process.env.PORT || 0) || 8233);
const browser = await launch();
const ctx = await browser.newContext({
  viewport: { width: dim.width, height: dim.height },
  deviceScaleFactor: Math.min(2, dim.dpr), isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) console.error('CONSOLE:', m.text()); });
await page.goto(`${url}/index.html?scene=carpet&seed=${a.seed || 1337}&dev=${a.devoverlay ? 1 : 0}&mute=1`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => { window.game.pause(); window.game.step(0.25); });

if (a.pre === 'surface' || a.pre === 'finale') {
  await page.evaluate((pre) => {
    const sc = window.game._g.scene;
    const vac = window.game._g.vacuum;
    if (pre === 'finale') {
      // a whole run's worth of collected debris, then a finished rug
      const cols = ['#b7ada0', '#d7a866', '#e8dcc6', '#a9a094', '#f6f0e2', '#ff6fb5', '#ffd34d', '#8ad7ff'];
      for (let i = 0; i < 90; i++) {
        vac.transit({ kind: i % 3 ? 'fluff' : 'crumb', color: cols[i % cols.length], size: 6 + (i % 7) });
      }
      window.game.step(3);
      sc.devFinish();
    } else {
      for (const d of sc.debris) if (d.applyComb) d.applyComb(1.5, vac);
      window.game.step(0.05);
    }
  }, a.pre);
}

const state0 = await page.evaluate(() => window.game.state());
const tgt = resolveTarget(state0, a.target || 'auto');
const rest = { x: state0.input.x / state0.viewport.w, y: state0.input.y / state0.viewport.h };
let from = rest;
if (tgt) {
  const dx = rest.x - tgt.x, dy = rest.y - tgt.y;
  const d = Math.hypot(dx, dy) || 1;
  if (d < 0.26) from = { x: Math.min(0.94, Math.max(0.06, tgt.x + dx * 0.32 / d)), y: Math.min(0.94, Math.max(0.06, tgt.y + dy * 0.32 / d)) };
}
const g = makeGesture(gestureName, { from, to: tgt || { x: 0.5, y: 0.55 }, dur: a.dur ? +a.dur : undefined });
await page.evaluate((f) => window.game.input.replay(f), g);
if (skip > 0) await page.evaluate((dt) => window.game.step(dt), skip / 1000);

const states = [];
for (let i = 0; i < frames; i++) {
  await page.evaluate((dt) => window.game.step(dt), every / 1000);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: join(dir, String(i).padStart(3, '0') + '.png') });
  states.push(await page.evaluate(() => window.game.state()));
}
await writeFile(join(dir, 'state.json'), JSON.stringify({ device: deviceName, gesture: gestureName, pre: a.pre || null, target: tgt, every, states }, null, 1));

const cols = frames <= 12 ? 4 : 6;
const html = `<!doctype html><meta charset=utf-8><style>
 body{margin:0;background:#101013;font:11px/1.4 monospace;color:#8fa}
 #sheet{display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:6px;width:${cols * 220 + 40}px}
 figure{margin:0;position:relative} img{width:100%;display:block;border:1px solid #2a2a30}
 figcaption{position:absolute;left:3px;top:3px;background:#000a;padding:1px 4px;color:#7fe}
</style><div id=sheet>${Array.from({ length: frames }, (_, i) => `<figure><img src="${String(i).padStart(3, '0')}.png"><figcaption>${i}</figcaption></figure>`).join('')}</div>`;
await writeFile(join(dir, 'contact.html'), html);
await page.setViewportSize({ width: cols * 220 + 40, height: 900 });
await page.goto(`${url}/dev/out/${dirName}/contact.html`, { waitUntil: 'load' });
await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
await page.locator('#sheet').screenshot({ path: join(dir, 'contact.png') });

console.log('wrote', frames, 'frames to', dir);
await browser.close();
server.close();
