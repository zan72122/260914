// @ts-check
/**
 * Touch gesture helpers for the flame-test game QA harness (DESIGN.md §6.3).
 *
 * Why CDP instead of `page.touchscreen`: Playwright's touchscreen API only
 * supports `tap()`. The game needs real touchstart/touchmove/touchend streams
 * (and the pointerdown/pointermove/pointerup they synthesise) so that drag,
 * trace, long-press and circle recognisers in `src/core/gestures.js` see a
 * believable, jittery, 4-year-old finger. `Input.dispatchTouchEvent` over a raw
 * CDP session gives us exactly that.
 *
 * All coordinates are CSS pixels, canvas/viewport relative — the same space
 * `window.__game.hitPoints()` reports in (DESIGN.md §5.10).
 */

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {{x:number,y:number}} Pt */
/** @typedef {{id:string,x:number,y:number,r:number}} HitPoint */

const sessions = new WeakMap();

/** Lazily create (and reuse) one CDP session per page. */
async function cdp(page) {
  let s = sessions.get(page);
  if (!s) {
    s = await page.context().newCDPSession(page);
    sessions.set(page, s);
  }
  return s;
}

const rnd = (n) => (Math.random() * 2 - 1) * n;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sleep = (ms) => (ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));
// Each CDP dispatch already costs a round-trip (~10-40ms), so tiny dwells are dropped:
// the nominal `ms` of a gesture is a floor, not a promise.
const dwellSleep = (ms) => sleep(ms > 15 ? ms - 12 : 0);

function touchPoint(x, y) {
  return {
    x: Math.round(x),
    y: Math.round(y),
    radiusX: 12,
    radiusY: 12,
    force: 1,
    rotationAngle: 0,
    id: 1,
  };
}

async function send(page, type, pt) {
  const s = await cdp(page);
  await s.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [touchPoint(pt.x, pt.y)],
    modifiers: 0,
    timestamp: Date.now() / 1000,
  });
}

export async function touchStart(page, x, y) {
  await send(page, 'touchStart', { x, y });
}
export async function touchMove(page, x, y) {
  await send(page, 'touchMove', { x, y });
}
export async function touchEnd(page, x, y) {
  await send(page, 'touchEnd', { x, y });
}
export async function touchCancel(page, x, y) {
  await send(page, 'touchCancel', { x, y });
}

/* ------------------------------------------------------------------ *
 * Basic gestures
 * ------------------------------------------------------------------ */

/** Clean single tap. */
export async function tap(page, x, y) {
  await touchStart(page, x, y);
  await sleep(40);
  await touchEnd(page, x, y);
  await sleep(30);
}

/**
 * Tap the way a 4-year-old taps: press, smear a few px, release.
 * Must still be recognised as a tap (maxMoveRatio = 0.06*S, DESIGN.md §5.5.7).
 */
export async function sloppyTap(page, x, y, { drift = 9, ms = 160 } = {}) {
  await touchStart(page, x, y);
  const steps = 4;
  for (let i = 1; i <= steps; i++) {
    await sleep(ms / (steps + 1));
    await touchMove(page, x + rnd(drift), y + rnd(drift));
  }
  await sleep(ms / (steps + 1));
  await touchEnd(page, x + rnd(drift), y + rnd(drift));
  await sleep(30);
}

/**
 * Hold a finger down for `ms`, wobbling slightly (fingers are never still).
 * Long-press tolerates movement up to 0.25*S, so the wobble must not cancel it.
 */
export async function longPress(page, x, y, ms = 900, { jitter = 5 } = {}) {
  await touchStart(page, x, y);
  const t0 = Date.now();
  // Short presses (the deliberate "too short to fire" case) get no intermediate
  // moves at all: every CDP dispatch costs a round-trip and would overshoot the
  // 300ms threshold we are trying to stay under.
  const moves = ms < 320 ? 0 : Math.max(1, Math.round(ms / 60));
  for (let i = 0; i < moves; i++) {
    await dwellSleep(ms / (moves + 1));
    await touchMove(page, x + rnd(jitter), y + rnd(jitter));
  }
  const remaining = ms - (Date.now() - t0);
  if (remaining > 0) await sleep(remaining);
  const pressedMs = Date.now() - t0;
  await touchEnd(page, x + rnd(jitter), y + rnd(jitter));
  await sleep(30);
  // Wall-clock duration the page actually saw the finger down (best effort:
  // measured around the dispatches, so it is an upper bound).
  return { pressedMs };
}

/**
 * Drag from -> to with per-step hand tremor.
 * @param {Page} page
 * @param {Pt} from
 * @param {Pt} to
 * @param {{steps?:number, jitter?:number, ms?:number, release?:boolean}} [opts]
 *   release:false leaves the finger down (caller must call touchEnd).
 */
export async function drag(page, from, to, { steps = 24, jitter = 6, ms = 700, release = true } = {}) {
  await touchStart(page, from.x, from.y);
  const dwell = ms / steps;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t + (i < steps ? rnd(jitter) : 0);
    const y = from.y + (to.y - from.y) * t + (i < steps ? rnd(jitter) : 0);
    await touchMove(page, x, y);
    await dwellSleep(dwell);
  }
  if (release) {
    await touchEnd(page, to.x, to.y);
    await sleep(30);
  }
}

/**
 * Trace along a polyline, deliberately deviating from the ideal path.
 * The deviation is a smooth sine bulge (up to `jitter` px perpendicular-ish)
 * plus small per-step noise — i.e. exactly the "off path but still counts"
 * case the copper world must tolerate (DESIGN.md §2.2, §6.4-B).
 *
 * @param {Page} page
 * @param {Pt[]} pathPoints
 * @param {{steps?:number, jitter?:number, ms?:number, release?:boolean, stopAt?:number}} [opts]
 *   stopAt: 0..1 — lift the finger after this fraction of the path (tests auto-complete).
 */
export async function trace(page, pathPoints, { steps = 40, jitter = 14, ms = 1200, release = true, stopAt = 1 } = {}) {
  const pts = resample(pathPoints, steps);
  const last = Math.max(1, Math.floor(pts.length * clamp(stopAt, 0.02, 1)));
  const dwell = ms / Math.max(1, last);

  const start = pts[0];
  await touchStart(page, start.x, start.y);
  for (let i = 1; i < last; i++) {
    const t = i / (pts.length - 1);
    const p = pts[i];
    const prev = pts[i - 1];
    // perpendicular unit vector of the local tangent
    let nx = -(p.y - prev.y);
    let ny = p.x - prev.x;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    // deliberate excursion: one full sine bulge across the path + noise
    const bulge = Math.sin(t * Math.PI * 2) * jitter;
    await touchMove(page, p.x + nx * bulge + rnd(jitter * 0.25), p.y + ny * bulge + rnd(jitter * 0.25));
    await dwellSleep(dwell);
  }
  const end = pts[last - 1];
  if (release) {
    await touchEnd(page, end.x, end.y);
    await sleep(30);
  }
  return end;
}

/**
 * Circular stirring around `center`. Radius wanders, direction can reverse —
 * barium must accumulate |Δθ| regardless (DESIGN.md §2.5).
 *
 * @param {Page} page
 * @param {Pt} center
 * @param {{radiusPx?:number, turns?:number, steps?:number, jitter?:number,
 *          reversals?:number, radiusWobble?:number, ms?:number, release?:boolean}} [opts]
 */
export async function circle(
  page,
  center,
  { radiusPx = 90, turns = 3, steps = 90, jitter = 10, reversals = 0, radiusWobble = 0.35, ms = 3000, release = true } = {}
) {
  const total = Math.max(8, Math.round(steps * turns));
  const dwell = ms / total;
  // Where (in step index) the direction flips.
  const flips = [];
  for (let i = 1; i <= reversals; i++) flips.push(Math.round((total * i) / (reversals + 1)));

  let dir = 1;
  let angle = 0;
  const step = (Math.PI * 2 * turns) / total;

  const radiusAt = (i) => radiusPx * (1 + Math.sin(i * 0.23) * radiusWobble) + rnd(jitter);
  const at = (a, r) => ({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r });

  let p = at(angle, radiusAt(0));
  await touchStart(page, p.x, p.y);
  for (let i = 1; i <= total; i++) {
    if (flips.includes(i)) dir *= -1;
    angle += step * dir;
    p = at(angle, radiusAt(i));
    await touchMove(page, p.x + rnd(jitter * 0.3), p.y + rnd(jitter * 0.3));
    await dwellSleep(dwell);
  }
  if (release) {
    await touchEnd(page, p.x, p.y);
    await sleep(30);
  }
  return p;
}

/** Resample a polyline into ~n evenly spaced points. */
function resample(points, n) {
  if (points.length < 2) return points.slice();
  const segLens = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    segLens.push(d);
    total += d;
  }
  if (total === 0) return points.slice();
  const out = [];
  for (let k = 0; k <= n; k++) {
    let want = (total * k) / n;
    let i = 0;
    while (i < segLens.length && want > segLens[i]) {
      want -= segLens[i];
      i++;
    }
    i = Math.min(i, segLens.length - 1);
    const t = segLens[i] ? want / segLens[i] : 0;
    out.push({
      x: points[i].x + (points[i + 1].x - points[i].x) * t,
      y: points[i].y + (points[i + 1].y - points[i].y) * t,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * window.__game bridge (DESIGN.md §5.10)
 * ------------------------------------------------------------------ */

/** Wait until `window.__game.ready === true`. */
export async function waitForGame(page, timeout = 15_000) {
  await page.waitForFunction(() => !!(window.__game && window.__game.ready === true), null, { timeout });
}

/** Wait until no transition is running (`__game.busy === false`). */
export async function waitIdle(page, timeout = 20_000) {
  await page.waitForFunction(() => !!(window.__game && window.__game.busy === false), null, { timeout });
}

/** Wait until `__game.sceneId === id`. */
export async function waitScene(page, id, timeout = 20_000) {
  await page.waitForFunction((want) => !!(window.__game && window.__game.sceneId === want), id, { timeout });
}

/** Raw hitPoints() array. */
export async function hitPoints(page) {
  return /** @type {Promise<HitPoint[]>} */ (
    page.evaluate(() => (window.__game && window.__game.hitPoints ? window.__game.hitPoints() : []))
  );
}

/**
 * Resolve one hit point by exact id, else by id prefix (first match).
 * Waits for it to appear (worlds publish hit points asynchronously).
 * Returns {id,x,y,r}.
 */
export async function hit(page, id, { timeout = 20_000, context = '' } = {}) {
  let handle;
  try {
    handle = await page.waitForFunction(
      (want) => {
        const g = window.__game;
        if (!g || !g.hitPoints) return null;
        const pts = g.hitPoints() || [];
        return pts.find((p) => p.id === want) || pts.find((p) => String(p.id).startsWith(want)) || null;
      },
      id,
      { timeout }
    );
  } catch (err) {
    // Name the world and the missing id: while the worlds are being written,
    // this is by far the most common failure and must be self-explanatory.
    const seen = await page
      .evaluate(() => ({
        scene: window.__game && window.__game.sceneId,
        ids: (window.__game && window.__game.hitPoints ? window.__game.hitPoints() : []).map((p) => p.id),
      }))
      .catch(() => ({ scene: '<unavailable>', ids: [] }));
    throw new Error(
      `${context ? context + ': ' : ''}hitPoint "${id}" never appeared within ${timeout}ms.\n` +
        `  scene   : ${seen.scene}\n` +
        `  exposed : ${seen.ids.length ? seen.ids.join(', ') : '(none)'}\n` +
        `  expected: an id equal to "${id}" or starting with it ` +
        `(see the id table at the top of tests/helpers/flows.mjs).`
    );
  }
  const value = await handle.jsonValue();
  await handle.dispose();
  return /** @type {HitPoint} */ (value);
}

/** Convenience: centre point of a hit point. */
export async function hitXY(page, id, opts) {
  const p = await hit(page, id, opts);
  return { x: p.x, y: p.y };
}

/** Current debugState(). */
export function state(page) {
  return page.evaluate(() => (window.__game ? window.__game.state : null));
}

/** Current sceneId. */
export function sceneId(page) {
  return page.evaluate(() => (window.__game ? window.__game.sceneId : null));
}

/** Current Progress object. */
export function progress(page) {
  return page.evaluate(() => (window.__game ? window.__game.progress : null));
}

/** Fix the RNG for deterministic screenshots. */
export async function seed(page, n = 12345) {
  await page.evaluate((v) => window.__game && window.__game.seed && window.__game.seed(v), n);
}

/** Jump straight to a scene (test-only hook). */
export async function goto(page, id, opts = undefined) {
  await page.evaluate(([sid, o]) => window.__game.goto(sid, o), [id, opts]);
  await waitIdle(page);
}

/**
 * Install a spy on canvas text drawing BEFORE any page script runs.
 * Counts every fillText/strokeText call into `window.__textCalls`.
 * The constitution (DESIGN.md §0.2, §6.4-D) says this must stay at 0.
 */
export async function installTextSpy(page) {
  await page.addInitScript(() => {
    window.__textCalls = { fillText: 0, strokeText: 0, total: 0, samples: [] };
    const proto = CanvasRenderingContext2D.prototype;
    for (const name of ['fillText', 'strokeText']) {
      const orig = proto[name];
      proto[name] = function (...args) {
        const rec = window.__textCalls;
        rec[name]++;
        rec.total++;
        if (rec.samples.length < 20) {
          rec.samples.push({
            fn: name,
            text: String(args[0]).slice(0, 40),
            stack: (new Error().stack || '').split('\n').slice(1, 4).join(' | '),
          });
        }
        return orig.apply(this, args);
      };
    }
  });
}

/** Read back the text spy counters. */
export function textCalls(page) {
  return page.evaluate(() => window.__textCalls || { fillText: 0, strokeText: 0, total: 0, samples: [] });
}

/** Attach a console-error collector; returns the (growing) array. */
export function collectConsoleErrors(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err && err.message ? err.message : err)));
  return errors;
}

export { sleep };
