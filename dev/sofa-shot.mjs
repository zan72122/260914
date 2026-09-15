/**
 * Scene-specific frame grabber for `sofa`.
 *
 * The stock gestures in dev/gestures.mjs all aim at one debris; this scene is
 * about TRAVELLING: crossing under the sofa's front edge, going deep, and
 * coming back out. So the paths here are waypoint lists (normalized screen
 * coords + duration), replayed through window.game.input.replay.
 *
 *   node dev/sofa-shot.mjs --path=enter --device=iphone-portrait --frames=16 --every=180
 *
 * paths: enter, deep, sock, mother, leave, passby
 * Everything else works like dev/shot.mjs (--frames --every --skip --seed --out
 * --devoverlay --complete). Writes dev/out/<name>/ with contact.png.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { launch, DEVICES } from './shot.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'dev', 'out');

/** [x, y, ms to get there] — the first point is where the finger goes down. */
const PATHS = {
  portrait: {
    enter: [[0.50, 0.84, 0], [0.50, 0.62, 1100], [0.50, 0.46, 1400], [0.50, 0.36, 1200], [0.50, 0.34, 1800]],
    deep: [[0.50, 0.84, 0], [0.50, 0.50, 1300], [0.46, 0.34, 1400], [0.40, 0.30, 1400], [0.55, 0.30, 1600],
      [0.50, 0.28, 1600], [0.50, 0.28, 2400]],
    sock: [[0.50, 0.84, 0], [0.52, 0.52, 1200], [0.60, 0.40, 1400], [0.62, 0.38, 2600], [0.62, 0.38, 2000]],
    mother: [[0.50, 0.84, 0], [0.50, 0.46, 1200], [0.49, 0.36, 1500], [0.49, 0.32, 1800], [0.49, 0.32, 5000]],
    leave: [[0.50, 0.36, 0], [0.50, 0.40, 900], [0.50, 0.62, 1200], [0.50, 0.82, 1200], [0.50, 0.84, 900]],
    passby: [[0.50, 0.84, 0], [0.42, 0.54, 1200], [0.28, 0.44, 900], [0.88, 0.44, 1000], [0.92, 0.46, 900]],
  },
  landscape: {
    enter: [[0.20, 0.82, 0], [0.26, 0.60, 1100], [0.30, 0.42, 1400], [0.32, 0.34, 1200], [0.32, 0.32, 1800]],
    deep: [[0.20, 0.82, 0], [0.28, 0.50, 1300], [0.36, 0.34, 1400], [0.55, 0.32, 1800], [0.74, 0.34, 1800],
      [0.80, 0.32, 1600], [0.80, 0.32, 2000]],
    sock: [[0.20, 0.82, 0], [0.30, 0.55, 1200], [0.46, 0.34, 1600], [0.50, 0.30, 2600], [0.50, 0.30, 2000]],
    mother: [[0.20, 0.82, 0], [0.34, 0.50, 1200], [0.60, 0.34, 1600], [0.80, 0.30, 1800], [0.82, 0.29, 4000]],
    leave: [[0.60, 0.32, 0], [0.60, 0.40, 900], [0.58, 0.62, 1200], [0.55, 0.82, 1200], [0.55, 0.84, 900]],
    passby: [[0.20, 0.82, 0], [0.28, 0.52, 1200], [0.26, 0.40, 800], [0.88, 0.40, 1000], [0.92, 0.42, 900]],
  },
};

function build(wps) {
  const out = [];
  out.push({ t: 0, x: wps[0][0], y: wps[0][1], down: false });
  let t = 40;
  let prev = wps[0];
  out.push({ t, x: prev[0], y: prev[1], down: true });
  for (let i = 1; i < wps.length; i++) {
    const w = wps[i];
    const n = Math.max(2, Math.round(w[2] / 25));
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      const e = u * u * (3 - 2 * u);
      out.push({
        t: Math.round(t + u * w[2]),
        x: +(prev[0] + (w[0] - prev[0]) * e).toFixed(4),
        y: +(prev[1] + (w[1] - prev[1]) * e).toFixed(4),
        down: true,
      });
    }
    t += w[2];
    prev = w;
  }
  return out;
}

function args() {
  const a = {};
  for (const s of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(s);
    if (m) a[m[1]] = m[2] === undefined ? true : m[2];
  }
  return a;
}

async function main() {
  const a = args();
  const deviceName = a.device || 'iphone-portrait';
  const pathName = a.path || 'enter';
  const frames = parseInt(a.frames || '16', 10);
  const every = parseInt(a.every || '180', 10);
  const skip = parseInt(a.skip || '0', 10);
  const seed = a.seed || '1337';
  const dim = DEVICES[deviceName];
  if (!dim) throw new Error('unknown device ' + deviceName);
  const pose = dim.width >= dim.height ? 'landscape' : 'portrait';
  const wps = PATHS[pose][pathName];
  if (!wps) throw new Error('unknown path ' + pathName + ' (' + Object.keys(PATHS[pose]).join(', ') + ')');

  const dirName = a.out || `sofa-${deviceName}-${pathName}`;
  const dir = join(OUT, dirName);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const { server, url } = await startServer(Number(process.env.PORT || 0) || 8123);
  const browser = await launch();
  const ctx = await browser.newContext({
    viewport: { width: dim.width, height: dim.height },
    deviceScaleFactor: Math.min(2, dim.dpr), isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.error('PAGE ERROR:', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) console.error('CONSOLE:', m.text()); });

  await page.goto(`${url}/index.html?scene=sofa&seed=${seed}&dev=${a.devoverlay ? 1 : 0}&mute=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.game);
  await page.evaluate(() => { window.game.pause(); window.game.step(0.25); });
  if (a.complete) {
    await page.evaluate(() => {
      const sc = window.game._g.scene;
      sc.debris.forEach((d) => { d.dormant = false; d.state = 'in-cup'; });
    });
  }
  const g = build(wps);
  await page.evaluate((f) => window.game.input.replay(f), g);
  if (skip > 0) await page.evaluate((dt) => window.game.step(dt), skip / 1000);

  const states = [];
  for (let i = 0; i < frames; i++) {
    await page.evaluate((dt) => window.game.step(dt), every / 1000);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: join(dir, String(i).padStart(3, '0') + '.png') });
    states.push(await page.evaluate(() => window.game.state()));
  }
  await writeFile(join(dir, 'state.json'), JSON.stringify({
    scene: 'sofa', device: deviceName, path: pathName, every, seed, errors, gestureFrames: g, states,
  }, null, 1));

  const cols = frames <= 12 ? 4 : 6;
  const imgs = [];
  for (let i = 0; i < frames; i++) imgs.push(`dev/out/${dirName}/${String(i).padStart(3, '0')}.png`);
  const html = `<!doctype html><meta charset=utf-8><style>
    body{margin:0;background:#101013;font:11px/1.4 monospace;color:#8fa}
    #sheet{display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:6px;width:${cols * 220 + 40}px}
    figure{margin:0;position:relative}img{width:100%;display:block;border:1px solid #2a2a30}
    figcaption{position:absolute;left:3px;top:3px;background:#000a;padding:1px 4px;color:#7fe}
    h1{font:12px monospace;color:#cde;margin:8px 10px 0}
  </style><h1>sofa / ${deviceName} / ${pathName} — ${every}ms per frame</h1>
  <div id=sheet>${imgs.map((s, i) => `<figure><img src="/${s}"><figcaption>${i}</figcaption></figure>`).join('')}</div>`;
  await writeFile(join(dir, 'contact.html'), html);
  await page.setViewportSize({ width: cols * 220 + 40, height: 900 });
  await page.goto(`${url}/dev/out/${dirName}/contact.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
  await page.locator('#sheet').screenshot({ path: join(dir, 'contact.png') });

  const last = states[states.length - 1];
  console.log('wrote ' + frames + ' frames to ' + dir);
  console.log('fps ' + last.fps + '  under ' + last.scene.under + '  dark ' + last.scene.dark +
    '  left ' + last.scene.remaining + '  errors ' + errors.length);
  await browser.close();
  server.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
