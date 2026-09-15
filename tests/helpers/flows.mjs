// @ts-check
/**
 * Reusable "4-year-old plays the game" flows, shared by playthrough /
 * spectroscope / screenshot specs.
 *
 * ============================================================
 * hitPoint id conventions these tests assume (window.__game.hitPoints())
 * ------------------------------------------------------------
 *  hearth      : 'dish:lithium' | 'dish:copper' | 'dish:sodium'
 *                | 'dish:strontium' | 'dish:barium'
 *                'flame'                       (the flame / wire loop target)
 *                'spectroscope'                (only once unlocked)
 *  lithium     : 'fragment'  (the energy pellet)      'slot' (the battery slot)
 *  copper      : 'trace:start' 'trace:end'
 *                + debugState().tracePath = [{x,y}, ...] (ideal path, css px)
 *  sodium      : 'tap'          (phase 1: salt; anywhere in the upper half works)
 *                'lamp:0' ... 'lamp:4'   (phase 2: street lamps)
 *  strontium   : 'seed'  (the star seed)   'tube' (the launch tube)
 *  barium      : 'circle:center'  (centre of the turntable)
 *
 * Every lookup is done by exact id first, then by *prefix*, so a world may use
 * e.g. 'lamp:left-1' or 'trace:start#a' and still be found.
 * ============================================================
 */
import { expect } from '@playwright/test';
import * as G from './gestures.mjs';

const { drag, trace, circle, sloppyTap, tap, longPress, hit, waitIdle, waitForGame, sleep } = G;

/** hit() with the world named in the failure message. */
const h = (page, id, world, opts = {}) => hit(page, id, { context: `world "${world}"`, ...opts });

/** Load the app, fix the RNG, clear progress and land on the hearth. */
export async function startGame(page, { seed = 12345, reset = true } = {}) {
  await page.goto('/');
  await waitForGame(page);
  await page.evaluate((s) => window.__game.seed && window.__game.seed(s), seed);
  if (reset) await page.evaluate(() => window.__game.resetProgress && window.__game.resetProgress());
  await page.evaluate(() => window.__game.goto && window.__game.goto('hearth'));
  await waitIdle(page);
}

/**
 * Hearth -> world: drag the sample dish into the flame, deliberately sloppily.
 * (DESIGN.md §1.4 — a plain tap must work too; see `enterWorldByTap`.)
 */
export async function enterWorld(page, elementId) {
  const dish = await hit(page, `dish:${elementId}`, { context: `entering world "${elementId}"` });
  const flame = await hit(page, 'flame', { context: `entering world "${elementId}"` });
  await drag(page, { x: dish.x, y: dish.y }, { x: flame.x, y: flame.y }, { steps: 28, jitter: 12, ms: 900 });
  await waitIdle(page, 30_000);
  await expectSceneBecomes(page, elementId);
}

/** Wait for a scene id, failing with a message that names what we got instead. */
async function expectSceneBecomes(page, elementId, timeout = 30_000) {
  try {
    await page.waitForFunction((id) => window.__game.sceneId === id, elementId, { timeout });
  } catch {
    const now = await page.evaluate(() => window.__game.sceneId).catch(() => '<unavailable>');
    throw new Error(
      `world "${elementId}" was never entered: sceneId is still "${now}" after ${timeout}ms ` +
        `(the dish -> flame drag did not start the transition).`
    );
  }
}

/** Alternative entry: a 4-year-old taps before they drag. */
export async function enterWorldByTap(page, elementId) {
  const dish = await hit(page, `dish:${elementId}`);
  await sloppyTap(page, dish.x, dish.y);
  await waitIdle(page, 30_000);
  await expectSceneBecomes(page, elementId);
}

const phaseOf = (page) => page.evaluate(() => (window.__game.state || {}).phase);

export async function isComplete(page) {
  return (await phaseOf(page)) === 'complete';
}

/** Wait for the world to report `state.phase === 'complete'` (§6.4-B.6). */
export async function waitComplete(page, timeout = 60_000) {
  await page.waitForFunction(() => (window.__game.state || {}).phase === 'complete', null, { timeout });
}

/* ------------------------------------------------------------------ *
 * Per-world "deliberately bad" gestures (DESIGN.md §6.4-B.5)
 * ------------------------------------------------------------------ */

/** lithium: drag the pellet but let go 40px short of the slot -> magnetic snap. */
export async function playLithium(page) {
  const frag = await h(page, 'fragment', 'lithium');
  const slot = await h(page, 'slot', 'lithium');
  const dx = slot.x - frag.x;
  const dy = slot.y - frag.y;
  const len = Math.hypot(dx, dy) || 1;
  const short = 40; // stop 40 px short on purpose
  const to = { x: slot.x - (dx / len) * short, y: slot.y - (dy / len) * short };
  await drag(page, { x: frag.x, y: frag.y }, to, { steps: 26, jitter: 10, ms: 900 });
}

/** copper: trace the ideal path while wandering up to ~60px off it. */
export async function playCopper(page) {
  const start = await h(page, 'trace:start', 'copper');
  const end = await h(page, 'trace:end', 'copper');
  const path = await page.evaluate(() => {
    const st = window.__game.state || {};
    return Array.isArray(st.tracePath) ? st.tracePath : null;
  });
  const pts = path && path.length >= 2 ? path : [{ x: start.x, y: start.y }, { x: end.x, y: end.y }];
  await trace(page, pts, { steps: 48, jitter: 60, ms: 1800 });
}

/** sodium: sloppy taps for the salt, then sloppy taps on the lamps. */
export async function playSodium(page) {
  let target = null;
  try {
    target = await h(page, 'tap', 'sodium', { timeout: 5_000 });
  } catch {
    const box = page.viewportSize();
    target = { x: box.width / 2, y: box.height * 0.35, r: 0 };
  }
  for (let i = 0; i < 5; i++) {
    await sloppyTap(page, target.x + (i - 2) * 11, target.y + (i % 2 ? 9 : -9));
    await sleep(120);
  }
  // Phase 2: the street lamps. 3 of 5 chain-light the rest (§2.3).
  for (let i = 0; i < 6; i++) {
    if (await isComplete(page)) return;
    let lamp;
    try {
      lamp = await h(page, 'lamp:', 'sodium', { timeout: 6_000 });
    } catch {
      break;
    }
    await sloppyTap(page, lamp.x, lamp.y);
    await sleep(350);
  }
}

/** strontium: load, a too-short 250ms press (must NOT fire), then 900ms (must fire). */
export async function playStrontium(page) {
  const seed = await h(page, 'seed', 'strontium');
  const tube = await h(page, 'tube', 'strontium');
  await drag(page, { x: seed.x, y: seed.y }, { x: tube.x, y: tube.y }, { steps: 20, jitter: 10, ms: 700 });
  await sleep(600);

  const t2 = await h(page, 'tube', 'strontium');
  // Below the 300ms threshold: a dud. CDP dispatch latency can push the real
  // press over the line, so we report what actually happened and let the caller
  // decide whether the assertion is meaningful.
  const { pressedMs } = await longPress(page, t2.x, t2.y, 250);
  await sleep(500);
  const firedTooEarly = await page.evaluate(() => Number((window.__game.state || {}).shots || 0));

  await longPress(page, t2.x, t2.y, 900); // comfortably over the threshold
  await sleep(500);
  return { firedTooEarly, shortPressMs: pressedMs };
}

/** barium: stir in circles, wandering radius, two direction reversals. */
export async function playBarium(page) {
  const c = await h(page, 'circle:center', 'barium');
  const vp = page.viewportSize();
  const radius = Math.min(vp.width, vp.height) * 0.22;
  await circle(page, { x: c.x, y: c.y }, {
    radiusPx: radius,
    turns: 4,
    steps: 40,
    jitter: 12,
    reversals: 2,
    radiusWobble: 0.4,
    ms: 4200,
  });
}

/** Dispatch by element id. */
export const PLAY = {
  lithium: playLithium,
  copper: playCopper,
  sodium: playSodium,
  strontium: playStrontium,
  barium: playBarium,
};

/**
 * Keep nudging the world with its gesture until it reports complete.
 * Tolerant of timing: repeats the gesture (worlds are forgiving by design)
 * rather than sleeping blindly.
 */
export async function playUntilComplete(page, elementId, { attempts = 4, timeout = 60_000 } = {}) {
  const started = Date.now();
  for (let i = 0; i < attempts; i++) {
    if (await isComplete(page)) break;
    try {
      await PLAY[elementId](page);
    } catch (err) {
      throw new Error(`world "${elementId}": its gesture flow failed on attempt ${i + 1}.\n${err.message}`);
    }
    try {
      await waitComplete(page, Math.max(4_000, Math.min(20_000, timeout - (Date.now() - started))));
      break;
    } catch {
      /* try once more — the world never "fails", it just waits */
    }
  }
  try {
    await waitComplete(page, Math.max(5_000, timeout - (Date.now() - started)));
  } catch {
    const phase = await phaseOf(page).catch(() => '<unavailable>');
    throw new Error(
      `world "${elementId}" never reached state.phase === 'complete' ` +
        `(last phase: ${String(phase)}) after ${attempts} gesture attempts in ${Date.now() - started}ms.`
    );
  }
}

/** After completion the world returns to the hearth on its own (§1.7). */
export async function waitReturnToHearth(page, timeout = 30_000) {
  await page.waitForFunction(() => window.__game.sceneId === 'hearth', null, { timeout });
  await waitIdle(page, timeout);
}

export { expect };
