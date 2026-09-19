/**
 * Generic real-time fps probe.
 *
 *   node dev/fps.mjs --scene=sofa --device=iphone-portrait --seconds=6
 *   node dev/fps.mjs --scene=sofa --hold=@mother#1 --profile
 *   node dev/fps.mjs --all --seconds=5            # every scene x every device
 *
 * The frame grabber (dev/shot.mjs) steps the clock by hand, so the `fps` it
 * reports means nothing. This runs the page FREE-RUNNING with a synthetic
 * finger and samples `game.state().fps`, which is measured on the real rAF
 * clock — the same number dev/playthrough.mjs reports per scene.
 *
 * The finger is the playthrough autopilot's closed loop on the mouth, cut down
 * to what a probe needs: hunt the nearest live piece, stop when it stops
 * getting closer (which is what winds the motor up to full power, the most
 * expensive state there is). `--hold=@<debrisId|type|auto>` pins it on one
 * piece instead, so a specific moment can be profiled over and over.
 *
 * | flag | default | meaning |
 * |------|---------|---------|
 * | `--scene`   | `sofa` | scene id |
 * | `--device`  | `iphone-portrait` | or `--devices=a,b` / `--all` |
 * | `--all`     | off | every scene x every device — but an explicit `--scene`/
 *                       `--device` still wins on that axis |
 * | `--seconds` | 6 | sampling window (the first second is discarded) |
 * | `--hold`    | — | `@bunny#3`, `@sock`, `@auto`: park the mouth on it |
 * | `--profile` | off | also report ms/frame in sim, scene.draw, vacuum.draw, drawOver, light |
 * | `--seed`    | 1337 | |
 * | `--json`    | off | machine-readable line per run |
 * | `--init`    | — | JavaScript run in the page BEFORE the module loads (flags) |
 */
import { startServer } from './serve.mjs';
import { launch, DEVICES } from './shot.mjs';

/** Every scene in the game, in hallway order. `--all` walks this list. */
const SCENES = ['hall', 'intro', 'kitchen', 'paper', 'toy', 'thread', 'sand', 'sofa', 'carpet',
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
const seconds = parseFloat(A.seconds || '6');
const seed = A.seed || '1337';
/**
 * `--all` means "every scene x every device" — but only for the axis that was
 * not named. `--all --scene=pantry` is one room on four devices, and
 * `--all --device=ipad-portrait` is every room on one, because a probe you have
 * to narrow by hand is a probe nobody narrows.
 */
const namedScenes = A.scenes ? String(A.scenes).split(',') : (A.scene ? [A.scene] : null);
const namedDevices = A.devices ? String(A.devices).split(',') : (A.device ? [A.device] : null);
const scenes = namedScenes || (A.all ? SCENES : ['sofa']);
const devices = namedDevices || (A.all ? Object.keys(DEVICES) : ['iphone-portrait']);

/**
 * Injected into the page. Same shape as the playthrough autopilot: it reads
 * where the MOUTH is on screen and moves the finger by the error, so it needs
 * to know nothing about lead offsets, hose lag or the camera.
 */
function PROBE(cfg) {
  const R = { fps: [], errors: [], prof: null, left: -1, ready: false };
  window.__fps = R;
  window.addEventListener('error', (e) => R.errors.push('error: ' + (e.message || e)));

  const P = { x: 0, y: 0 }, AIM = { x: 0, y: 0 };
  let F = null, held = null, bestErr = 1e9, stall = 0, last = performance.now();

  function installProfiler() {
    const acc = { sim: 0, scene: 0, vac: 0, over: 0, light: 0, frames: 0 };
    R.prof = acc;
    const g = window.game._g;
    // `new Loop((dt) => this.sim(dt), ...)` looks `sim` up on the instance every
    // call, so shadowing the prototype method here is enough to time it.
    const sim0 = g.sim.bind(g), render0 = g.render.bind(g);
    let wrapped = null;
    g.sim = (dt) => { const t = performance.now(); sim0(dt); acc.sim += performance.now() - t; };
    g.render = (al) => {
      const sc = g.scene;
      if (sc && sc !== wrapped) {              // re-wrap when the scene changes
        wrapped = sc;
        const d0 = sc.draw.bind(sc), o0 = sc.drawOver.bind(sc);
        sc.draw = (c, cam) => { const t = performance.now(); d0(c, cam); acc.scene += performance.now() - t; };
        sc.drawOver = (c, cam) => { const t = performance.now(); o0(c, cam); acc.over += performance.now() - t; };
        const v = g.vacuum;
        if (!v.__wrapped) {
          v.__wrapped = true;
          const v0 = v.draw.bind(v);
          v.draw = (c, cam) => { const t = performance.now(); v0(c, cam); acc.vac += performance.now() - t; };
        }
        if (sc.light && !sc.light.__wrapped) {
          sc.light.__wrapped = true;
          const b0 = sc.light.begin.bind(sc.light), c0 = sc.light.composite.bind(sc.light);
          let t0 = 0;
          sc.light.begin = () => { t0 = performance.now(); b0(); };
          sc.light.composite = (c) => { c0(c); acc.light += performance.now() - t0; };
        }
      }
      render0(al);
      acc.frames++;
    };
  }

  function mouthN(g, out) {
    g.camera.toScreen(g.vacuum.mouthX, g.vacuum.mouthY, out);
    out.x /= g.w; out.y /= g.h;
    return out;
  }

  /** The piece to drive at: a fixed one with --hold, else the nearest live one. */
  function pick(g, mx, my) {
    const sc = g.scene;
    if (cfg.hold) {
      if (!held) {
        const sel = cfg.hold.replace(/^@/, '');
        held = sc.debris.find((d) => d.id === sel)
          || sc.debris.find((d) => d.type === sel)
          || sc.debris.find((d) => !d.decor && d.state !== 'in-cup');
      }
      if (!held) return null;
      held.aim(AIM);
      g.camera.toScreen(AIM.x, AIM.y, P);
      return { nx: P.x / g.w, ny: P.y / g.h };
    }
    if (held && held.state !== 'in-cup') {
      held.aim(AIM);
      g.camera.toScreen(AIM.x, AIM.y, P);
      return { nx: P.x / g.w, ny: P.y / g.h };
    }
    held = null;
    let best = null, bd = 1e9;
    for (let i = 0; i < sc.debris.length; i++) {
      const d = sc.debris[i];
      if (d.decor || d.state === 'in-cup') continue;
      d.aim(AIM);
      g.camera.toScreen(AIM.x, AIM.y, P);
      const nx = P.x / g.w, ny = P.y / g.h;
      const dd = (nx - mx) * (nx - mx) + (ny - my) * (ny - my);
      if (dd < bd) { bd = dd; best = { nx, ny, d }; }
    }
    if (best) held = best.d;
    return best;
  }

  function tick() {
    requestAnimationFrame(tick);
    const g = window.game && window.game._g;
    if (!g || !g.scene) return;
    if (!F) {
      F = { x: g.scene.startPointer.x, y: g.scene.startPointer.y };
      if (cfg.profile) installProfiler();       // only once `game` exists
      R.ready = true;
    }
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (g.loop && g.loop.fps) R.fps.push(g.loop.fps);
    R.left = g.scene.remaining();

    mouthN(g, P);
    const mx = P.x, my = P.y;
    const t = pick(g, mx, my);
    if (!t) { window.game.input.pointer(F.x, F.y, true); return; }
    const ex = t.nx - mx, ey = t.ny - my;
    const err = Math.hypot(ex, ey);
    if (err < bestErr - 0.004) { bestErr = err; stall = 0; } else stall += dt;
    // stop dead when it is not getting closer: that is the press-and-hold, and
    // full motor power is the most expensive state the renderer ever sees
    if (stall < 0.7 && err > 0.012) {
      const step = Math.min(1, (dt * 2.6) / Math.max(0.08, err)) * 0.55;
      F.x += ex * step; F.y += ey * step;
    } else if (stall > 6 && !cfg.hold) { held = null; bestErr = 1e9; stall = 0; }
    F.x = Math.max(0.04, Math.min(0.96, F.x));
    F.y = Math.max(0.06, Math.min(0.96, F.y));
    window.game.input.pointer(F.x, F.y, true);
  }
  requestAnimationFrame(tick);
}

const { server, url } = await startServer(Number(process.env.PORT || 0));   // 0 = any free port
const browser = await launch();
const rows = [];
for (const scene of scenes) {
  for (const name of devices) {
    const dim = DEVICES[name];
    if (!dim) throw new Error('unknown device ' + name);
    const ctx = await browser.newContext({
      viewport: { width: dim.width, height: dim.height },
      deviceScaleFactor: Math.min(2, dim.dpr), isMobile: true, hasTouch: true,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    if (A.init) await page.addInitScript({ content: String(A.init) });
    await page.addInitScript({
      content: '(' + PROBE.toString() + ')(' + JSON.stringify({ hold: A.hold || null, profile: !!A.profile }) + ');',
    });
    await page.goto(`${url}/index.html?scene=${scene}&seed=${seed}&mute=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__fps && window.__fps.ready, null, { timeout: 30000 });
    await page.waitForTimeout(1000);                 // discard the warm-up
    await page.evaluate(() => {
      window.__fps.fps.length = 0;
      if (window.__fps.prof) { const p = window.__fps.prof; for (const k in p) p[k] = 0; }
    });
    await page.waitForTimeout(seconds * 1000);
    const r = await page.evaluate(() => {
      const R = window.__fps;
      const s = R.fps.slice().sort((a, b) => a - b);
      const q = (f) => (s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * f))].toFixed(1) : 0);
      return { min: q(0), p10: q(0.1), median: q(0.5), max: q(0.999), n: s.length, left: R.left, prof: R.prof };
    });
    r.scene = scene; r.device = name; r.errors = errors;
    rows.push(r);
    const p = r.prof;
    const prof = p && p.frames
      ? '  | ms/frame sim ' + (p.sim / p.frames).toFixed(2) + ' scene ' + (p.scene / p.frames).toFixed(2)
        + ' vac ' + (p.vac / p.frames).toFixed(2) + ' over ' + (p.over / p.frames).toFixed(2)
        + ' light ' + (p.light / p.frames).toFixed(2)
      : '';
    if (A.json) console.log(JSON.stringify(r));
    else {
      console.log(pad(scene, 8) + pad(name, 18)
        + 'min ' + pad(r.min, 6) + 'p10 ' + pad(r.p10, 6) + 'median ' + pad(r.median, 6)
        + 'left ' + pad(r.left, 4) + (errors.length ? 'ERRORS ' + errors.length : '') + prof);
    }
    await ctx.close();
  }
}
await browser.close();
server.close();

const bad = rows.filter((r) => r.median < 50);
if (bad.length) console.log('\nbelow 50 median: ' + bad.map((r) => r.scene + '/' + r.device + ':' + r.median).join(', '));
else console.log('\nall runs >= 50 fps median');

function pad(v, n) { return String(v).padEnd(n); }
