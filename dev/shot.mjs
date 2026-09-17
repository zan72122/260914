/**
 * Deterministic frame grabber.
 *
 *   node dev/shot.mjs --scene=intro --device=iphone-portrait \
 *        --gesture=approach-slow --frames=24 --every=100 --contact
 *
 * Writes dev/out/<scene>-<device>-<gesture>/NNN.png, state.json and (with
 * --contact) contact.png: the whole sequence as one grid image.
 *
 * Uses the preinstalled Chromium at PLAYWRIGHT_BROWSERS_PATH (default
 * /opt/pw-browsers). Never run `playwright install`.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { makeGesture, makePath, resolveTarget, gestureNames } from './gestures.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'dev', 'out');

export const DEVICES = {
  'iphone-portrait': { width: 390, height: 844, dpr: 3 },
  'iphone-landscape': { width: 844, height: 390, dpr: 3 },
  'ipad-portrait': { width: 820, height: 1180, dpr: 2 },
  'ipad-landscape': { width: 1180, height: 820, dpr: 2 },
};

function args() {
  const a = {};
  for (const s of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(s);
    if (m) a[m[1]] = m[2] === undefined ? true : m[2];
  }
  return a;
}

/** Find the preinstalled chromium binary (the bundled revision may not match). */
export function chromiumPath() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  const dirs = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort();
  for (const d of dirs.reverse()) {
    const p = join(base, d, 'chrome-linux', 'chrome');
    if (existsSync(p)) return p;
  }
  return undefined;
}

export async function launch() {
  return chromium.launch({
    executablePath: chromiumPath(),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb', '--hide-scrollbars'],
  });
}

async function main() {
  const a = args();
  const sceneId = a.scene || 'intro';
  const deviceName = a.device || 'iphone-portrait';
  const gestureName = a.gesture || 'approach-slow';
  const frames = parseInt(a.frames || '24', 10);
  const every = parseInt(a.every || '100', 10);   // ms of simulated time per frame
  const seed = a.seed || '1337';
  const target = a.target || 'auto';
  const dev = a.devoverlay ? 1 : 0;
  const skip = parseInt(a.skip || '0', 10);   // ms of simulated time before the first frame
  // `?clean=intro,kitchen` sets the hall's door states; `?chain=1` plays the
  // historical linear ring instead of the hub
  const clean = a.clean ? '&clean=' + encodeURIComponent(a.clean) : '';
  const chain = a.chain ? '&chain=1' : '';
  const dim = DEVICES[deviceName];
  if (!dim) throw new Error('unknown device: ' + deviceName + ' (' + Object.keys(DEVICES).join(', ') + ')');
  if (!a.path && !gestureNames().includes(gestureName)) {
    throw new Error('unknown gesture ' + gestureName + ' (' + gestureNames().join(', ') + ')');
  }

  const dirName = a.out || (a.path ? `${sceneId}-${deviceName}-path` : `${sceneId}-${deviceName}-${gestureName}`);
  const dir = join(OUT, dirName);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const { server, url } = await startServer(Number(process.env.PORT || 0) || 8123);
  const browser = await launch();
  const ctx = await browser.newContext({
    viewport: { width: dim.width, height: dim.height },
    deviceScaleFactor: Math.min(2, dim.dpr),   // the game caps DPR at 2
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });

  await page.goto(`${url}/index.html?scene=${sceneId}&seed=${seed}&dev=${dev}&mute=1${clean}${chain}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.game);
  // settle one frame, then take control of time
  await page.evaluate(() => { window.game.pause(); window.game.step(0.25); });

  if (a.complete) {
    // preview the completion camera move without playing the whole scene:
    // the scene's own devFinish() if it has one (it knows what "finished"
    // means for its floor and its finale), otherwise just empty the room
    await page.evaluate(() => {
      const sc = window.game._g.scene;
      if (typeof sc.devFinish === 'function') { sc.devFinish(); return; }
      sc.debris.forEach((d) => { d.dormant = false; d.state = 'in-cup'; });
    });
  }
  if (a.exec) {
    // arbitrary setup in the page before the first frame: move something, flip
    // a flag, jump a phase. `game`, `scene` and `vac` are in scope.
    await page.evaluate((src) => {
      const game = window.game, scene = game._g.scene, vac = game._g.vacuum;
      // eslint-disable-next-line no-new-func
      return new Function('game', 'scene', 'vac', src)(game, scene, vac);
    }, String(a.exec));
  }
  const state0 = await page.evaluate(() => window.game.state());
  const tgt = resolveTarget(state0, target);
  let g;
  if (a.path) {
    g = makePath(parsePath(a.path, state0), {
      seg: parseInt(a.seg || '700', 10),
      hold: parseInt(a.hold || '0', 10),
      release: !!a.release,
    });
  } else {
    const start = startPoint(state0, tgt);
    g = makeGesture(gestureName, { from: start, to: tgt || { x: 0.5, y: 0.55 } });
  }
  await page.evaluate((frames) => window.game.input.replay(frames), g);

  if (skip > 0) {
    await page.evaluate((dt) => { window.game.step(dt); }, skip / 1000);
  }
  const states = [];
  for (let i = 0; i < frames; i++) {
    await page.evaluate((dt) => { window.game.step(dt); }, every / 1000);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const name = String(i).padStart(3, '0') + '.png';
    await page.screenshot({ path: join(dir, name) });
    states.push(await page.evaluate(() => window.game.state()));
  }
  await writeFile(join(dir, 'state.json'), JSON.stringify({
    scene: sceneId, device: deviceName, gesture: a.path ? 'path:' + a.path : gestureName,
    seed, every, skip, exec: a.exec || null, target: tgt, gestureFrames: g, states,
  }, null, 1));

  if (a.contact) {
    await contactSheet(page, url, dirName, dir, frames,
      { sceneId, deviceName, gestureName: a.path ? 'path' : gestureName, every });
  }

  await browser.close();
  server.close();
  console.log('wrote ' + frames + ' frames to ' + dir + (a.contact ? ' (+ contact.png)' : ''));
}

/**
 * `--path=x,y;x,y;...` in normalized screen coords, with optional per-waypoint
 * hold and segment time: `x,y,holdMs,segMs`. A waypoint written `@<selector>`
 * (`@auto`, `@bunny#3`, `@crumb`) resolves to wherever the finger has to be for
 * the MOUTH to land on that debris.
 */
function parsePath(spec, state) {
  return String(spec).split(';').map((chunk) => {
    const c = chunk.trim();
    if (!c) return null;
    if (c[0] === '@') {
      const parts = c.slice(1).split(',');
      const t = resolveTarget(state, parts[0] || 'auto');
      if (!t) throw new Error('--path: no debris matches ' + c);
      return { x: t.x, y: t.y, hold: num(parts[1]), seg: num(parts[2]) };
    }
    const n = c.split(',').map(Number);
    if (!isFinite(n[0]) || !isFinite(n[1])) throw new Error('--path: bad waypoint "' + c + '"');
    return { x: n[0], y: n[1], hold: num(n[2]), seg: num(n[3]) };
  }).filter(Boolean);
}
const num = (v) => (v === undefined || v === '' || !isFinite(Number(v)) ? undefined : Number(v));

/**
 * Where the finger starts. Default: exactly where the scene parks the vacuum,
 * so the sequence shows the real resting pose first; pushed further back if the
 * target is already close, so there is something to approach.
 */
function startPoint(state, tgt) {
  const rest = { x: state.input.x / state.viewport.w, y: state.input.y / state.viewport.h };
  if (!tgt) return rest;
  let dx = rest.x - tgt.x, dy = rest.y - tgt.y;
  const d = Math.hypot(dx, dy) || 1;
  if (d >= 0.26) return rest;
  const k = 0.32 / d;
  return {
    x: Math.min(0.94, Math.max(0.06, tgt.x + dx * k)),
    y: Math.min(0.94, Math.max(0.06, tgt.y + dy * k)),
  };
}

/** Composite the frames into one grid image so a whole sequence reads at a glance. */
async function contactSheet(page, url, dirName, dir, frames, meta) {
  const cols = frames <= 12 ? 4 : 6;
  const imgs = [];
  for (let i = 0; i < frames; i++) imgs.push(`dev/out/${dirName}/${String(i).padStart(3, '0')}.png`);
  const html = `<!doctype html><meta charset=utf-8><style>
    body{margin:0;background:#101013;font:11px/1.4 monospace;color:#8fa}
    #sheet{display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:6px;width:${cols * 220 + 40}px}
    figure{margin:0;position:relative}
    img{width:100%;display:block;border:1px solid #2a2a30}
    figcaption{position:absolute;left:3px;top:3px;background:#000a;padding:1px 4px;color:#7fe}
    h1{font:12px monospace;color:#cde;margin:8px 10px 0}
  </style><h1>${meta.sceneId} / ${meta.deviceName} / ${meta.gestureName} — ${meta.every}ms per frame</h1>
  <div id=sheet>${imgs.map((s, i) => `<figure><img src="/${s}"><figcaption>${i}</figcaption></figure>`).join('')}</div>`;
  const f = join(dir, 'contact.html');
  await writeFile(f, html);
  await page.setViewportSize({ width: cols * 220 + 40, height: 900 });
  await page.goto(`${url}/dev/out/${dirName}/contact.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
  await page.locator('#sheet').screenshot({ path: join(dir, 'contact.png') });
}

if (import.meta.url === 'file://' + process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
