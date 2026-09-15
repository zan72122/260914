/**
 * Performance harness.
 *
 * Loads the built game in a phone-sized Chromium, fills the live scene up to
 * `--kids` bodies through the debug hook `window.__kids.stress(n)`, and then
 * measures two things:
 *
 *   1. frames per second, counted by requestAnimationFrame inside the page
 *      (the frames the page actually presented), alongside Chrome's own
 *      Performance metrics over the same window (script and task time);
 *   2. heap growth over a longer run, with a forced collection at each end,
 *      which is how a per-frame allocation shows itself.
 *
 * This machine has no GPU: Chromium falls back to SwiftShader and renders
 * WebGL on the CPU. The frame rate here is therefore a FLOOR, not the number
 * an iPhone will produce — it is useful for catching regressions and for
 * proving the loop allocates nothing, not for claiming a device figure.
 *
 *   node scripts/perf.mjs [--scene gather] [--kids 150] [--seconds 5]
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/opt/pw-browsers';

const SCENES = [
  'gather', 'march', 'tickle', 'ballpit', 'butterfly',
  'slide', 'hide', 'balloon', 'tower', 'sleep',
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const scene = arg('scene', 'gather');
const kids = Number(arg('kids', '150'));
const seconds = Number(arg('seconds', '5'));
const heapSeconds = Number(arg('heap-seconds', '10'));
const port = Number(arg('port', '4174'));
const url = `http://127.0.0.1:${port}/`;

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
  stdio: 'ignore',
});
process.on('exit', () => server.kill());

if (!(await waitForServer(60_000))) {
  console.error(`preview server did not come up on ${url} — run "npm run build" first`);
  server.kill();
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
await cdp.send('HeapProfiler.enable');

const metrics = async () => {
  const { metrics: m } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(m.map((x) => [x.name, x.value]));
};

await page.goto(url);
await page.waitForFunction(() => window.__kids?.ready === true, undefined, { timeout: 30_000 });
await page.evaluate((i) => window.__kids.gotoScene(i), SCENES.indexOf(scene));
await page.waitForTimeout(800);
const total = await page.evaluate((n) => window.__kids.stress(n), kids);
// Let the crowd settle, and let the first-frame costs fall out of the window.
await page.waitForTimeout(1500);

// --- frame rate --------------------------------------------------------
const before = await metrics();
const frames = await page.evaluate(async (ms) => {
  let n = 0;
  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      n++;
      if (performance.now() - t0 >= ms) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return { frames: n, ms: performance.now() - t0 };
}, seconds * 1000);
const after = await metrics();
const wall = (after.Timestamp - before.Timestamp) || frames.ms / 1000;
const tickerFps = await page.evaluate(() => window.__kids.fps());

// --- heap growth -------------------------------------------------------
await cdp.send('HeapProfiler.collectGarbage');
await page.waitForTimeout(300);
const heap0 = (await metrics()).JSHeapUsedSize;
await page.waitForTimeout(heapSeconds * 1000);
await cdp.send('HeapProfiler.collectGarbage');
await page.waitForTimeout(300);
const heap1 = (await metrics()).JSHeapUsedSize;

const kb = (b) => `${(b / 1024).toFixed(0)} KiB`;
console.log(`scene           ${scene}`);
console.log(`bodies          ${total}`);
console.log(`window          ${(frames.ms / 1000).toFixed(2)} s`);
console.log(`frames          ${frames.frames}`);
console.log(`fps (rAF)       ${(frames.frames / (frames.ms / 1000)).toFixed(1)}`);
console.log(`fps (ticker)    ${tickerFps.toFixed(1)}`);
console.log(`script time     ${(((after.ScriptDuration - before.ScriptDuration) / wall) * 100).toFixed(1)} % of wall`);
console.log(`task time       ${(((after.TaskDuration - before.TaskDuration) / wall) * 100).toFixed(1)} % of wall`);
console.log(`layouts         ${after.LayoutCount - before.LayoutCount}`);
console.log(`heap after gc   ${kb(heap0)} -> ${kb(heap1)} over ${heapSeconds}s (${kb(heap1 - heap0)})`);

await browser.close();
server.kill();
