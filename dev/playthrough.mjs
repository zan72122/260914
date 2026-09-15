/**
 * Whole-game playthrough, driven by synthetic ONE-FINGER input.
 *
 *   node dev/playthrough.mjs                       # all four devices
 *   node dev/playthrough.mjs --device=ipad-portrait
 *   node dev/playthrough.mjs --devices=iphone-portrait,ipad-landscape --seed=7
 *
 * An autopilot is injected into the page and drives `window.game.input.pointer`
 * on every animation frame — nothing else. It is a closed loop on the MOUTH:
 * it measures where the mouth actually is on screen, compares that with where
 * the thing it is hunting is, and moves the finger by the error. That means it
 * needs no knowledge of the lead offsets, the hose lag or the camera, and it
 * behaves like a (very patient) child: creep up, stop, hold, and when nothing
 * is happening any more, go and look at something else.
 *
 * Per scene it adds exactly what that scene's mechanic needs and nothing more:
 *   carpet   rub the head back and forth (the brush roll) and raster the rug
 *   toy      the nest under a toy is hidden, so drive the head into the toy
 *   sofa     when the room is clear, back out from under the furniture
 *
 * It records, per device: per-scene wall-clock completion time, min/median fps
 * measured in REAL time, every page error, and a contact sheet of the
 * transitions at dev/out/playthrough-<device>/contact.png.
 *
 * Exit code is non-zero if any device failed to finish the chain or hit a page
 * error, so this doubles as the integration test.
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { launch, DEVICES } from './shot.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'dev', 'out');

/** The chain, in order. The run is done when carpet has handed back to intro. */
const CHAIN = ['intro', 'kitchen', 'paper', 'toy', 'thread', 'sand', 'sofa', 'carpet'];

function args() {
  const a = {};
  for (const s of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(s);
    if (m) a[m[1]] = m[2] === undefined ? true : m[2];
  }
  return a;
}

const A = args();
const deviceNames = A.device ? [A.device]
  : (A.devices ? String(A.devices).split(',') : Object.keys(DEVICES));
const SEED = A.seed || '1337';
const BUDGET = parseInt(A.budget || '150', 10);        // seconds per scene before giving up
const MAX_SHOTS = parseInt(A.shots || '30', 10);
const FROM = A.from || 'intro';          // start mid-chain while debugging

// --------------------------------------------------------------- autopilot

/**
 * Injected into the page as a plain function body. Keep it self-contained: it
 * runs before any module has loaded and waits for `window.game` itself.
 */
function AUTOPILOT(cfg) {
  const R = {
    started: 0, done: false, failed: null, scenes: [], errors: [],
    scene: null, shot: 0, note: '',
  };
  window.__pt = R;
  window.addEventListener('error', (e) => R.errors.push('error: ' + (e.message || e)));
  window.addEventListener('unhandledrejection', (e) => R.errors.push('rejection: ' + (e.reason && e.reason.message)));

  const CHAIN = cfg.chain;
  const now = () => performance.now();
  let F = { x: 0.5, y: 0.82 };          // the finger, normalized
  let cur = null;                        // current scene record
  let targetId = null;
  let sinceTarget = 0;
  let bestErr = 1e9;
  let stall = 0;
  let holdUntil = 0;
  let avoid = {};                        // id -> time it may be tried again
  let rasterI = 0;
  let inFlow = false;
  let last = now();
  const P = { x: 0, y: 0 };
  const AIMP = { x: 0, y: 0 };

  function boot() {
    if (!window.game || !window.game._g || !window.game._g.scene) { requestAnimationFrame(boot); return; }
    R.started = now();
    beginScene();
    requestAnimationFrame(tick);
  }

  function beginScene() {
    const g = window.game._g;
    cur = {
      id: g.scene.id, t0: now(), t: null, fps: [], errors0: R.errors.length,
      startLeft: g.scene.remaining(),
    };
    R.scenes.push(cur);
    R.scene = cur.id;
    targetId = null; sinceTarget = 0; bestErr = 1e9; stall = 0; avoid = {}; rasterI = 0;
    F = { x: g.scene.startPointer.x, y: g.scene.startPointer.y };
  }

  /** Screen position of the mouth, normalized. */
  function mouthN(g, out) {
    g.camera.toScreen(g.vacuum.mouthX, g.vacuum.mouthY, out);
    out.x /= g.w; out.y /= g.h;
    return out;
  }

  /** Pick what to hunt: the nearest live piece the scene can actually act on. */
  function pickTarget(g, mx, my) {
    const sc = g.scene;
    let best = null, bd = 1e9;
    for (let i = 0; i < sc.debris.length; i++) {
      const d = sc.debris[i];
      if (d.decor || d.state === 'in-cup') continue;
      if (avoid[d.id] && avoid[d.id] > now()) continue;
      // a dormant piece is under something: its position is still where we must
      // drive the head, because that is what shoves the thing off it
      d.aim(AIMP);
      g.camera.toScreen(AIMP.x, AIMP.y, P);
      const nx = P.x / g.w, ny = P.y / g.h;
      const dd = (nx - mx) * (nx - mx) + (ny - my) * (ny - my) * 1.15;
      if (dd < bd) { bd = dd; best = { d, nx, ny }; }
    }
    return best;
  }

  function tick() {
    if (R.done || R.failed) return;
    requestAnimationFrame(tick);
    const g = window.game._g;
    if (!g || !g.scene) return;
    const t = now();
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;

    if (g.loop && g.loop.fps) cur.fps.push(g.loop.fps);

    // ---- scene changes / transitions -----------------------------------
    if (g.scene.id !== cur.id) {
      cur.t = (t - cur.t0) / 1000;
      cur.errors = R.errors.length - cur.errors0;
      if (CHAIN.indexOf(g.scene.id) <= CHAIN.indexOf(cur.id) || R.scenes.length >= CHAIN.length) {
        // carpet handed back to intro: the chain is closed
        R.done = true;
        R.loopedTo = g.scene.id;
        window.game.input.pointer(F.x, F.y, false);
        return;
      }
      beginScene();
      return;
    }
    if ((t - cur.t0) / 1000 > cfg.budget) {
      cur.t = (t - cur.t0) / 1000;
      cur.left = g.scene.remaining();
      cur.stuckOn = g.scene.debris.filter((d) => !d.decor && d.state !== 'in-cup')
        .map((d) => d.id + '@' + Math.round(d.x) + ',' + Math.round(d.y) + ' ' + d.state
          + (d.dormant ? ' DORMANT' : '') + ' s=' + d.strength.toFixed(2));
      R.failed = 'scene ' + cur.id + ' did not finish in ' + cfg.budget + 's (left ' + cur.left
        + ': ' + cur.stuckOn.join('; ') + ')';
      return;
    }
    // during a scene transition the world is not ours to drive
    if (g.transition) { window.game.input.pointer(F.x, F.y, true); return; }

    const sc = g.scene;
    mouthN(g, P);
    const mx = P.x, my = P.y;
    let tx, ty, rub = 0;

    const pick = pickTarget(g, mx, my);
    if (pick) {
      if (pick.d.id !== targetId) { targetId = pick.d.id; sinceTarget = 0; bestErr = 1e9; stall = 0; }
      tx = pick.nx; ty = pick.ny;
      // is the flow actually reaching it? That decides whether standing still is
      // patience (the mother bunny takes a long, long hold) or futility
      inFlow = pick.d.strength > 0.08;
    } else if (sc.id === 'carpet' && sc.rug && sc.combFrac !== undefined && sc.combFrac < 0.66) {
      // the room is clear but the rug is not combed: raster it, cell by cell,
      // moving on as soon as the roller has actually reached each one
      const r = sc.rug;
      const cols = 4, rows = 6;
      const k = rasterI % (cols * rows);
      const row = Math.floor(k / cols);
      const col = row % 2 ? cols - 1 - (k % cols) : k % cols;
      const wx = r.x0 + ((col + 0.5) / cols) * (r.x1 - r.x0);
      const wy = r.y0 + ((row + 0.5) / rows) * (r.y1 - r.y0);
      g.camera.toScreen(wx, wy, P);
      tx = P.x / g.w; ty = P.y / g.h;
      if (targetId !== 'raster' + k) { targetId = 'raster' + k; bestErr = 1e9; stall = 0; }
      if (Math.hypot(tx - mx, ty - my) < 0.07) rasterI += dt * 1.6;
    } else {
      // nothing left to hunt: go back to where the scene parks the vacuum.
      // Under the sofa that is also how you get out from under the furniture.
      tx = sc.startPointer.x; ty = sc.startPointer.y - 0.10;
      targetId = null;
    }

    // ---- the brush roll: the carpet only gives things up to rubbing ------
    if (sc.id === 'carpet') rub = 1;
    // ...and on a rug, standing perfectly still achieves nothing at all
    if (rub) holdUntil = 0;

    // ---- closed loop on the mouth ---------------------------------------
    let ex = tx - mx, ey = ty - my;
    const err = Math.hypot(ex, ey);
    sinceTarget += dt;
    if (err < bestErr - 0.004) { bestErr = err; stall = 0; } else stall += dt;

    // Nothing is getting closer: stop dead and let the airflow work. That is
    // the press-and-hold the whole game is built on, and it is also the only
    // way to win the deep nook under the sofa, where the head cannot reach.
    // Nothing is getting closer: stop dead and let the airflow work. Hold
    // longer when the air IS reaching the thing (the mother bunny under the
    // sofa is won by patience alone), but always move on eventually — a piece
    // merely trembling at 0.1 will not let go on this visit, and the room has
    // other things in it. Coming back to it later, thinner, is what wins.
    if (stall > 0.8 && t > holdUntil) holdUntil = t + (inFlow ? 4500 : 2200);
    if (t < holdUntil) {
      window.game.input.pointer(F.x, F.y, true);
      if (stall > 5.5 && targetId) { avoid[targetId] = t + (inFlow ? 5000 : 9000); stall = 0; bestErr = 1e9; }
      return;
    }
    if (sinceTarget > 22 && targetId) { avoid[targetId] = t + (inFlow ? 6000 : 12000); sinceTarget = 0; }

    if (err > 0.012) {
      const step = Math.min(1, (dt * 2.6) / Math.max(0.08, err)) * 0.55;
      F.x += ex * step; F.y += ey * step;
    }
    if (rub) {
      // a real back-and-forth: this is what vac.scrub counts (reversals of the
      // HEAD's own motion) and what spins the roller
      const a = t * 0.017;
      F.x += Math.sin(a) * 0.055;
      F.y += Math.cos(a * 0.91) * 0.030;
    }
    F.x = Math.max(0.04, Math.min(0.96, F.x));
    F.y = Math.max(0.06, Math.min(0.96, F.y));
    window.game.input.pointer(F.x, F.y, true);
  }

  boot();
}

// ------------------------------------------------------------------- runner

async function runDevice(url, browser, name) {
  const dim = DEVICES[name];
  const dir = join(OUT, 'playthrough-' + name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const ctx = await browser.newContext({
    viewport: { width: dim.width, height: dim.height },
    deviceScaleFactor: Math.min(2, dim.dpr),
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.addInitScript({
    content: '(' + AUTOPILOT.toString() + ')(' + JSON.stringify({ chain: CHAIN, budget: BUDGET }) + ');',
  });
  await page.goto(`${url}/index.html?scene=${FROM}&seed=${SEED}&mute=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pt && window.__pt.started > 0, null, { timeout: 30000 });

  // poll: grab a frame whenever the scene is handing over, and watch for the end
  const shots = [];
  let lastScene = null;
  let shotsThisTransition = 0;
  const t0 = Date.now();
  for (;;) {
    const s = await page.evaluate(() => {
      const g = window.game && window.game._g;
      return {
        pt: {
          done: window.__pt.done, failed: window.__pt.failed,
          scene: window.__pt.scene, loopedTo: window.__pt.loopedTo,
          scenes: window.__pt.scenes.map((x) => ({ id: x.id, t: x.t, left: x.left })),
        },
        transition: g && g.transition ? g.transition.phase : null,
        left: g && g.scene ? g.scene.remaining() : -1,
        id: g && g.scene ? g.scene.id : null,
      };
    });
    const want = (s.transition && shotsThisTransition < 2) || s.id !== lastScene;
    if (want && shots.length < MAX_SHOTS) {
      const f = String(shots.length).padStart(3, '0') + '.png';
      await page.screenshot({ path: join(dir, f) });
      shots.push({ file: f, scene: s.id, phase: s.transition || 'enter' });
      if (s.transition) shotsThisTransition++;
    }
    if (!s.transition) shotsThisTransition = 0;
    lastScene = s.id;
    if (s.pt.done || s.pt.failed) {
      if (shots.length < MAX_SHOTS) {
        const f = String(shots.length).padStart(3, '0') + '.png';
        await page.screenshot({ path: join(dir, f) });
        shots.push({ file: f, scene: s.id, phase: 'end' });
      }
      break;
    }
    if (Date.now() - t0 > (BUDGET * CHAIN.length + 120) * 1000) break;
    await page.waitForTimeout(220);
  }

  const result = await page.evaluate(() => {
    const R = window.__pt;
    const stat = (a) => {
      if (!a.length) return { min: 0, median: 0, n: 0 };
      const s = a.slice().sort((x, y) => x - y);
      return { min: +s[0].toFixed(1), median: +s[(s.length / 2) | 0].toFixed(1), n: s.length };
    };
    return {
      done: R.done, failed: R.failed, loopedTo: R.loopedTo,
      total: +((performance.now() - R.started) / 1000).toFixed(1),
      scenes: R.scenes.map((s) => ({
        id: s.id,
        t: s.t === null ? null : +s.t.toFixed(1),
        left: s.left === undefined ? 0 : s.left,
        stuckOn: s.stuckOn || undefined,
        errors: s.errors || 0,
        fps: stat(s.fps),
      })),
      pageErrors: R.errors,
    };
  });
  result.device = name;
  result.errors = errors.concat(result.pageErrors || []);
  delete result.pageErrors;
  result.shots = shots;

  await writeFile(join(dir, 'result.json'), JSON.stringify(result, null, 1));
  await contactSheet(page, url, 'playthrough-' + name, dir, shots, name);
  await ctx.close();
  return result;
}

async function contactSheet(page, url, dirName, dir, shots, device) {
  if (!shots.length) return;
  const cols = Math.min(6, Math.max(3, Math.ceil(Math.sqrt(shots.length))));
  const html = `<!doctype html><meta charset=utf-8><style>
    body{margin:0;background:#101013;font:11px/1.4 monospace;color:#8fa}
    #sheet{display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:6px;width:${cols * 230 + 40}px}
    figure{margin:0;position:relative}
    img{width:100%;display:block;border:1px solid #2a2a30}
    figcaption{position:absolute;left:3px;top:3px;background:#000a;padding:1px 4px;color:#7fe}
    h1{font:12px monospace;color:#cde;margin:8px 10px 0}
  </style><h1>playthrough / ${device} — scene transitions</h1>
  <div id=sheet>${shots.map((s, i) =>
    `<figure><img src="/dev/out/${dirName}/${s.file}"><figcaption>${i} ${s.scene}:${s.phase}</figcaption></figure>`).join('')}</div>`;
  await writeFile(join(dir, 'contact.html'), html);
  await page.setViewportSize({ width: cols * 230 + 40, height: 900 });
  await page.goto(`${url}/dev/out/${dirName}/contact.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
  await page.locator('#sheet').screenshot({ path: join(dir, 'contact.png') });
}

// ---------------------------------------------------------------------- main

const { server, url } = await startServer(Number(process.env.PORT || 0) || 8145);
const browser = await launch();
const results = [];
for (const name of deviceNames) {
  if (!DEVICES[name]) throw new Error('unknown device ' + name);
  process.stdout.write('· ' + name + ' ...\n');
  const r = await runDevice(url, browser, name);
  results.push(r);
  process.stdout.write((r.done ? '  ok   ' : '  FAIL ') + name + '  ' + r.total + 's  '
    + r.scenes.map((s) => s.id + ':' + (s.t === null ? '—' : s.t + 's')).join(' ')
    + (r.errors.length ? '  errors=' + r.errors.length : '') + '\n');
}
await browser.close();
server.close();

await writeFile(join(OUT, 'playthrough.json'), JSON.stringify(results, null, 1));

// the table
const rows = [];
rows.push('| device | ' + CHAIN.join(' | ') + ' | total | fps min/med | errors |');
rows.push('|' + '---|'.repeat(CHAIN.length + 4));
for (const r of results) {
  const by = {};
  for (const s of r.scenes) by[s.id] = s;
  const allf = r.scenes.filter((s) => s.fps.n);
  const fmin = allf.length ? Math.min(...allf.map((s) => s.fps.min)) : 0;
  const fmed = allf.length ? median(allf.map((s) => s.fps.median)) : 0;
  rows.push('| ' + r.device + ' | '
    + CHAIN.map((id) => (by[id] && by[id].t !== null ? by[id].t + 's' : (by[id] ? 'STUCK' : '—'))).join(' | ')
    + ' | ' + r.total + 's | ' + fmin + ' / ' + fmed + ' | ' + r.errors.length + ' |');
}
console.log('\n' + rows.join('\n') + '\n');
for (const r of results) for (const e of r.errors.slice(0, 5)) console.log(r.device + ' ERROR: ' + e);

function median(a) { const s = a.slice().sort((x, y) => x - y); return s[(s.length / 2) | 0]; }

const bad = results.filter((r) => !r.done || r.errors.length);
if (bad.length) { console.error('FAILED: ' + bad.map((r) => r.device).join(', ')); process.exit(1); }
console.log('all devices completed the chain with zero page errors');
