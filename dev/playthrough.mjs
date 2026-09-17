/**
 * Whole-game playthrough, driven by synthetic ONE-FINGER input.
 *
 *   node dev/playthrough.mjs                       # all four devices
 *   node dev/playthrough.mjs --device=ipad-portrait
 *   node dev/playthrough.mjs --devices=iphone-portrait,ipad-landscape --seed=7
 *   node dev/playthrough.mjs --chain                # the old linear ring
 *
 * It drives the HUB: from the hall it hunts the nearest door's dust bunny,
 * which is what opens that door, plays the room, comes back out, and goes
 * round again until every door is clean — then it waits for the hall's
 * celebration and its reset. It also knows one thing about the machine: when
 * the dust cup is full, nothing more will go in, so it takes the head to the
 * room's bin and lets it pour. That is the same causal chain the child has to
 * find, so if the autopilot gets stuck on a full cup, so would a child.
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

/** The historical linear ring, still playable with `--chain`. */
const CHAIN = ['intro', 'kitchen', 'paper', 'toy', 'thread', 'sand', 'sofa', 'carpet'];
/** The doors in the hall, in the order they run down the hallway. */
const ROOMS = ['intro', 'kitchen', 'paper', 'toy', 'thread', 'sand', 'sofa', 'carpet',
  'pantry', 'stairs', 'window', 'veranda', 'bedroom'];

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
const HUB = !A.chain;                    // `--chain` plays the old linear ring
const FROM = A.from || (HUB ? 'hall' : 'intro');
const TRACE = !!A.trace;                 // log every target change into result.json
const PRECLEAN = A.clean || '';          // `--clean=intro,kitchen` to skip rooms

// --------------------------------------------------------------- autopilot

/**
 * Injected into the page as a plain function body. Keep it self-contained: it
 * runs before any module has loaded and waits for `window.game` itself.
 */
function AUTOPILOT(cfg) {
  const R = {
    started: 0, done: false, failed: null, scenes: [], errors: [],
    scene: null, shot: 0, note: '', trace: [],
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
  let visited = {};                      // id -> when it was last worked on
  let held = null;                       // the piece currently being worked on
  let grindT = 0;                        // how long we have been holding on it
  let grindTotal = 0;                    // ...including the productive part
  let grindVol = 0;                      // cup volume when this hold last paid
  let forgiveAt = 0;                     // when the avoid list is wiped
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
      vol0: g.vacuum.cupVolTotal, pours: 0,
    };
    R.scenes.push(cur);
    R.scene = cur.id;
    targetId = null; sinceTarget = 0; bestErr = 1e9; stall = 0; rasterI = 0;
    avoid = {}; visited = {}; held = null; grindT = 0; grindTotal = 0;
    grindVol = g.vacuum.cupVolTotal; forgiveAt = now() + 30000;
    F = { x: g.scene.startPointer.x, y: g.scene.startPointer.y };
  }

  /** Screen position of the mouth, normalized. */
  function mouthN(g, out) {
    g.camera.toScreen(g.vacuum.mouthX, g.vacuum.mouthY, out);
    out.x /= g.w; out.y /= g.h;
    return out;
  }

  /**
   * Pick what to hunt.
   *
   * Nearest first — but never the same thing over and over. A child works
   * round a room; an autopilot that always takes the nearest target can stand
   * in one corner forever while four other pieces sit untouched on the far
   * side. So anything visited in the last 15s is passed over while there is
   * anything else at all, and the whole "given up on" list is forgiven every
   * 30s so nothing is abandoned permanently.
   */
  function pickTarget(g, mx, my) {
    const sc = g.scene;
    const t = now();
    if (t > forgiveAt) { avoid = {}; forgiveAt = t + 30000; }
    // STICK to the thing being worked on. Re-choosing the nearest piece every
    // frame makes the driver turn round half way: crossing the room, something
    // behind it becomes the nearest again and it goes back, forever. A target
    // is kept until it is collected, given up on, or has had long enough.
    if (held && held.state !== 'in-cup' && !(avoid[held.id] > t)) {
      held.aim(AIMP);
      g.camera.toScreen(AIMP.x, AIMP.y, P);
      return {
        d: held, nx: P.x / g.w, ny: P.y / g.h,
        wd: Math.hypot(AIMP.x - g.vacuum.mouthX, AIMP.y - g.vacuum.mouthY),
      };
    }
    held = null;
    let best = null, bd = 1e9, fresh = null, fd = 1e9;
    for (let i = 0; i < sc.debris.length; i++) {
      const d = sc.debris[i];
      if (d.decor || d.state === 'in-cup') continue;
      if (avoid[d.id] && avoid[d.id] > t) continue;
      // a dormant piece is under something: its position is still where we must
      // drive the head, because that is what shoves the thing off it
      d.aim(AIMP);
      g.camera.toScreen(AIMP.x, AIMP.y, P);
      const nx = P.x / g.w, ny = P.y / g.h;
      const dd = (nx - mx) * (nx - mx) + (ny - my) * (ny - my) * 1.15;
      const wd = Math.hypot(AIMP.x - g.vacuum.mouthX, AIMP.y - g.vacuum.mouthY);
      if (dd < bd) { bd = dd; best = { d, nx, ny, wd }; }
      if (!visited[d.id] || t - visited[d.id] > 15000) {
        if (dd < fd) { fd = dd; fresh = { d, nx, ny, wd }; }
      }
    }
    const pick = fresh || best;
    if (pick) { visited[pick.d.id] = t; held = pick.d; }
    return pick;
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
    // what this room actually put in the cup, and how often it had to be
    // emptied: the numbers the cup capacity is calibrated against
    cur.cupVol = Math.round(g.vacuum.cupVolTotal - cur.vol0);
    cur.cupFill = +g.vacuum.cupFill.toFixed(2);
    const pouring = !!(g.scene.bin && g.scene.bin.pouring);
    if (pouring && !R._wasPouring) cur.pours = (cur.pours || 0) + 1;
    R._wasPouring = pouring;

    // ---- scene changes / transitions -----------------------------------
    if (g.scene.id !== cur.id) {
      cur.t = (t - cur.t0) / 1000;
      cur.errors = R.errors.length - cur.errors0;
      if (!cfg.hub && (CHAIN.indexOf(g.scene.id) <= CHAIN.indexOf(cur.id) || R.scenes.length >= CHAIN.length)) {
        // carpet handed back to intro: the ring is closed
        R.done = true;
        R.loopedTo = g.scene.id;
        window.game.input.pointer(F.x, F.y, false);
        return;
      }
      beginScene();
      return;
    }

    // ---- the hub: every door clean, then the hall resets the house ------
    if (cfg.hub && g.scene.id === 'hall') {
      const house = window.game._g.house;
      const all = cfg.rooms.every((id) => house.rooms[id] && house.rooms[id].clean);
      if (all && !R.allCleanAt) { R.allCleanAt = t; R.note = 'house clean, waiting for the reset'; }
      if (R.allCleanAt && !all) {
        // the hall has put the dust back and thrown the doors open again
        cur.t = (t - cur.t0) / 1000;
        cur.errors = R.errors.length - cur.errors0;
        R.done = true;
        R.reset = true;
        R.celebration = +((t - R.allCleanAt) / 1000).toFixed(1);
        window.game.input.pointer(F.x, F.y, false);
        return;
      }
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
    let tx, ty, rub = 0, wdist = -1;

    // ---- a full cup takes nothing: go and empty it ----------------------
    // The one thing the driver knows about the machine. It is also the exact
    // chain the child has to find on their own, so a driver that gets stuck
    // here is telling us the teaching does not work.
    const needBin = !!(sc.bin && !sc.bin.pouring && g.vacuum.cupFill > 0.9);
    const pick = needBin ? null : pickTarget(g, mx, my);
    if (needBin) {
      g.camera.toScreen(sc.bin.x, sc.bin.y, P);
      tx = P.x / g.w; ty = P.y / g.h;
      wdist = Math.hypot(sc.bin.x - g.vacuum.mouthX, sc.bin.y - g.vacuum.mouthY);
      if (targetId !== 'bin') {
        targetId = 'bin'; bestErr = 1e9; stall = 0; held = null;
        if (cfg.trace) R.trace.push(Math.round(t - cur.t0) + ' -> BIN fill=' + g.vacuum.cupFill.toFixed(2));
      }
      inFlow = false;
    } else if (pick) {
      if (pick.d.id !== targetId) {
        targetId = pick.d.id; sinceTarget = 0; bestErr = 1e9; stall = 0;
        grindT = 0; grindTotal = 0; grindVol = g.vacuum.cupVolTotal;
        if (cfg.trace) R.trace.push(Math.round(t - cur.t0) + ' -> ' + targetId + ' wd=' + Math.round(pick.wd)
          + ' u=' + (sc.u === undefined ? '' : sc.u.toFixed(2)));
      }
      tx = pick.nx; ty = pick.ny;
      wdist = pick.wd;
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
      wdist = Math.hypot(wx - g.vacuum.mouthX, wy - g.vacuum.mouthY);
      if (targetId !== 'raster' + k) { targetId = 'raster' + k; bestErr = 1e9; stall = 0; }
      if (Math.hypot(tx - mx, ty - my) < 0.07) rasterI += dt * 1.6;
    } else {
      // nothing left to hunt: go back to where the scene parks the vacuum.
      // Under the sofa that is also how you get out from under the furniture.
      tx = sc.startPointer.x; ty = sc.startPointer.y - 0.10;
      wdist = -1;
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
    // Progress is measured in the WORLD, not on the screen. A scene whose
    // camera follows the nozzle (under the sofa) moves the target on screen as
    // fast as the head closes on it, so a screen-space stall detector decides
    // it is stuck while it is in fact walking straight towards the thing.
    const prog = wdist >= 0 ? wdist : err * 1000;
    if (prog < bestErr - 2) { bestErr = prog; stall = 0; } else stall += dt;

    // Nothing is getting closer: stop dead and let the airflow work. That is
    // the press-and-hold the whole game is built on, and it is also the only
    // way to win the deep nook under the sofa, where the head cannot reach.
    // Nothing is getting closer. Either the head cannot get any nearer — the
    // deepest nook under the sofa is deliberately out of its reach, blocked by
    // the skirting board — or there is nothing there. Those need opposite
    // answers, and the piece's own sampled field strength tells them apart.
    //
    // If the air IS on it, stand perfectly still. That is the press-and-hold
    // the whole game is built on: the motor winds to full power, the thing
    // strains, sheds, thins, and its own break-loose threshold comes down to
    // meet the flow. It can take half a minute, and any fidgeting resets it.
    if (inFlow && stall > 0.8) {
      grindT += dt; grindTotal += dt;
      // Is the hold PAYING? The mother bunny under the sofa takes half a minute
      // to win, but the whole time it is shedding fibres and they are going up
      // the tube — the cup keeps growing. A bead wedged behind a toy where the
      // head cannot follow gives nothing at all, and used to be held for a full
      // 45 seconds before the driver looked elsewhere. So: patience while it
      // pays, 14 seconds when it does not, and a hard ceiling either way.
      if (g.vacuum.cupVolTotal > grindVol + 0.01) { grindVol = g.vacuum.cupVolTotal; grindT = 0; }
      if ((grindT > 14 || grindTotal > 45) && targetId) {
        if (cfg.trace) R.trace.push(Math.round(t - cur.t0) + ' ~~ ' + targetId + ' ground out wd='
          + Math.round(wdist) + ' after ' + grindTotal.toFixed(1) + 's (' + grindT.toFixed(1) + 's unpaid)');
        avoid[targetId] = t + 8000;
        grindT = 0; grindTotal = 0; stall = 0; bestErr = 1e9; held = null;
      }
      window.game.input.pointer(F.x, F.y, true);
      return;
    }
    grindT = 0; grindTotal = 0;
    // Nothing there: a short pause in case it is just slow, then move on.
    if (stall > 0.8 && t > holdUntil) holdUntil = t + 2200;
    if (t < holdUntil) {
      window.game.input.pointer(F.x, F.y, true);
      if (stall > 5.5 && targetId) {
        if (cfg.trace) R.trace.push(Math.round(t - cur.t0) + ' xx ' + targetId + ' stalled wd=' + Math.round(wdist));
        avoid[targetId] = t + 9000; stall = 0; bestErr = 1e9; held = null;
      }
      return;
    }
    if (sinceTarget > 40 && targetId) { avoid[targetId] = t + 9000; sinceTarget = 0; held = null; }

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
    content: '(' + AUTOPILOT.toString() + ')('
      + JSON.stringify({ chain: CHAIN, rooms: ROOMS, hub: HUB, budget: BUDGET, trace: TRACE }) + ');',
  });
  const extra = (HUB ? '' : '&chain=1') + (PRECLEAN ? '&clean=' + encodeURIComponent(PRECLEAN) : '');
  await page.goto(`${url}/index.html?scene=${FROM}&seed=${SEED}&mute=1${extra}`, { waitUntil: 'load' });
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
    if (Date.now() - t0 > (BUDGET * (HUB ? ROOMS.length : CHAIN.length) + 180) * 1000) break;
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
      done: R.done, failed: R.failed, loopedTo: R.loopedTo, trace: R.trace,
      reset: !!R.reset, celebration: R.celebration || null,
      total: +((performance.now() - R.started) / 1000).toFixed(1),
      scenes: R.scenes.map((s) => ({
        id: s.id,
        t: s.t === null ? null : +s.t.toFixed(1),
        left: s.left === undefined ? 0 : s.left,
        stuckOn: s.stuckOn || undefined,
        errors: s.errors || 0,
        cupFill: s.cupFill === undefined ? null : s.cupFill,
        cupVol: s.cupVol === undefined ? null : s.cupVol,
        pours: s.pours || 0,
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
const COLS = HUB ? ROOMS : CHAIN;
const rows = [];
rows.push('| device | ' + COLS.join(' | ') + ' | hall | total | fps min/med | errors |');
rows.push('|' + '---|'.repeat(COLS.length + 5));
for (const r of results) {
  const by = {};
  let hall = 0, halls = 0;
  for (const s of r.scenes) {
    if (s.id === 'hall') { hall += s.t || 0; halls++; continue; }
    by[s.id] = s;
  }
  const allf = r.scenes.filter((s) => s.fps.n);
  const fmin = allf.length ? Math.min(...allf.map((s) => s.fps.min)) : 0;
  const fmed = allf.length ? median(allf.map((s) => s.fps.median)) : 0;
  rows.push('| ' + r.device + ' | '
    + COLS.map((id) => (by[id] && by[id].t !== null ? by[id].t + 's' : (by[id] ? 'STUCK' : '—'))).join(' | ')
    + ' | ' + (+hall.toFixed(1)) + 's/' + halls
    + ' | ' + r.total + 's | ' + fmin + ' / ' + fmed + ' | ' + r.errors.length + ' |');
}
console.log('\n' + rows.join('\n') + '\n');
for (const r of results) {
  if (r.celebration !== null && r.celebration !== undefined) {
    console.log(r.device + ': house cleaned, celebration + reset took ' + r.celebration + 's');
  }
}
for (const r of results) for (const e of r.errors.slice(0, 5)) console.log(r.device + ' ERROR: ' + e);

function median(a) { const s = a.slice().sort((x, y) => x - y); return s[(s.length / 2) | 0]; }

const bad = results.filter((r) => !r.done || r.errors.length);
if (bad.length) { console.error('FAILED: ' + bad.map((r) => r.device).join(', ')); process.exit(1); }
console.log('all devices completed the chain with zero page errors');
