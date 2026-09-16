// Shared helpers for the Playwright suite.

export const IPHONE_PORTRAIT = { width: 390, height: 844 };
export const IPAD_LANDSCAPE = { width: 1180, height: 820 };

/** Attach console-error / pageerror collectors. */
export function collectErrors(page) {
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  return errors;
}

export async function openGame(page, viewport, opts = {}) {
  await page.setViewportSize(viewport);
  // The game only fills window.__game when it is asked to: on a phone that
  // bookkeeping is per-frame garbage nobody needs. Ask, before it boots.
  await page.addInitScript(() => { window.__game = { debug: true, timeScale: 1 }; });
  if (opts.initScript) await page.addInitScript(opts.initScript);
  await page.goto('/index.html');
  await page.waitForFunction(() => window.__game && window.__game.items && window.__game.items.length === 5);
  if (opts.timeScale) await setTimeScale(page, opts.timeScale);
  return page;
}

export async function setTimeScale(page, v) {
  await page.evaluate((s) => { window.__game.timeScale = s; }, v);
}

export function state(page) {
  return page.evaluate(() => window.__game.state);
}

export function snapshot(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify({
    state: window.__game.state,
    rain: window.__game.rain,
    sash: window.__game.sash,
    basket: window.__game.basket,
    orientation: window.__game.orientation,
    inDir: window.__game.inDir,
    handle: window.__game.handle,
    view: { width: window.innerWidth, height: window.innerHeight },
    items: window.__game.items,
  })));
}

export async function waitFor(page, fn, timeout = 40000, label = 'condition') {
  const start = Date.now();
  for (;;) {
    const s = await snapshot(page);
    if (fn(s)) return s;
    if (Date.now() - start > timeout) {
      throw new Error(`timed out waiting for ${label}; last: ${JSON.stringify(s)}`);
    }
    await page.waitForTimeout(80);
  }
}

/** A slow, child-sized drag. */
export async function drag(page, x0, y0, x1, y1, steps = 14) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    await page.waitForTimeout(12);
  }
  await page.waitForTimeout(40);
  await page.mouse.up();
}

/**
 * THE gesture: put a finger on the cloth and haul it toward the room.
 *
 * No aiming, no lifting, no rhythm -- the whole body of the item is the
 * target, the direction is the one the wind is already blowing, and the only
 * thing being asked of the stroke is that it keeps going. One of these, on any
 * of the five, has to bring that item in: that is spec §10.1, and it is what
 * the phase-3 playtest could not do.
 *
 * `hold` is the child who has pulled it as far as her arm goes and is still
 * pulling: the world answers with a peg, a beat, another peg.
 */
export async function naiveStroke(page, s, it, opts = {}) {
  const span = Math.min(s.view.width, s.view.height);
  const dist = opts.dist === undefined ? span * 0.42 : opts.dist;
  const hold = opts.hold === undefined ? 1900 : opts.hold;
  const steps = opts.steps === undefined ? 24 : opts.steps;
  const x1 = it.x + s.inDir.x * dist;
  const y1 = it.y + s.inDir.y * dist;
  await page.mouse.move(it.x, it.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(it.x + (x1 - it.x) * t, it.y + (y1 - it.y) * t);
    await page.waitForTimeout(16);
  }
  // Still pulling. A real finger is never perfectly still.
  const beats = Math.max(1, Math.round(hold / 70));
  for (let i = 0; i < beats; i++) {
    await page.mouse.move(x1 + (i % 2 ? 1 : -1), y1 + (i % 3 ? 1 : 0));
    await page.waitForTimeout(70);
  }
  await page.mouse.up();
}

/** Item #1 and #5: a slow pull toward the room. */
export async function pullIn(page, s, it, dist = 170) {
  await drag(page, it.x, it.y, it.x + s.inDir.x * dist, it.y + s.inDir.y * dist);
}

/**
 * Item #2's flourish: lift the hanger clear of the pole by hand, then arc.
 * Still supported, still nicer, and no longer the only way in.
 */
export async function liftAndArc(page, s, it, { lift = 44, reach = 150 } = {}) {
  await page.mouse.move(it.x, it.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(it.x, it.y - (lift * i) / 6);
    await page.waitForTimeout(14);
  }
  await page.waitForTimeout(40);
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    await page.mouse.move(it.x + s.inDir.x * reach * t, it.y - lift + s.inDir.y * reach * t);
    await page.waitForTimeout(14);
  }
  await page.waitForTimeout(40);
  await page.mouse.up();
}

/** Item #3: trace one finger along the row of little clips. */
export async function swipeClips(page, index) {
  const s = await snapshot(page);
  const pts = s.items[index].clipPts;
  if (!pts || !pts.length) throw new Error('item ' + index + ' has no clips to trace');
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    for (let k = 1; k <= 3; k++) {
      await page.mouse.move(a.x + (b.x - a.x) * (k / 3), a.y + (b.y - a.y) * (k / 3));
      await page.waitForTimeout(16);
    }
  }
  await page.waitForTimeout(40);
  await page.mouse.up();
}

/** Item #3, all of it: one trace, then a tap on anything the trace missed. */
export async function popPinch(page, index) {
  await swipeClips(page, index);
  for (let attempt = 0; attempt < 8; attempt++) {
    const s = await snapshot(page);
    const it = s.items[index];
    if (it.state !== 'HANGING' || !it.clipPts) return;
    const left = it.clipPts.filter((c) => !c.popped);
    if (!left.length) return;
    await page.mouse.click(left[0].x, left[0].y);
    await page.waitForTimeout(90);
  }
}

/** Item #4, the wrong way: a fast flick. Heavy things ignore fast. */
export async function flick(page, s, it, dist = 260) {
  await page.mouse.move(it.x, it.y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) {
    const t = i / 5;
    await page.mouse.move(it.x + s.inDir.x * dist * t, it.y + s.inDir.y * dist * t);
  }
  await page.mouse.up();
}

/** Tap a single peg. The sheet's pegs open to a touch; so do the pinch's. */
export async function tapPeg(page, index, which = 0) {
  const s = await snapshot(page);
  const pts = s.items[index].clipPts.filter((c) => !c.popped);
  const peg = pts[Math.min(which, pts.length - 1)];
  await page.mouse.click(peg.x, peg.y);
  await page.waitForTimeout(140);
  return peg;
}

/**
 * Bring the whole line in the way a child would: find something still hanging,
 * pull it toward the room, repeat. One gesture, five items.
 */
export async function playAllItems(page, { maxStrokes = 30 } = {}) {
  for (let stroke = 0; stroke < maxStrokes; stroke++) {
    const s = await snapshot(page);
    const index = s.items.findIndex((it) => it.state === 'HANGING');
    if (index < 0) return s;
    await naiveStroke(page, s, s.items[index]);
    await page.waitForTimeout(120);
  }
  throw new Error('items did not come off the line: ' + JSON.stringify(await snapshot(page)));
}

export async function closeSash(page) {
  await waitFor(page, (s) => s.state === 'EMPTY_LINE', 40000, 'EMPTY_LINE');
  const s = await snapshot(page);
  const h = s.handle;
  await drag(page, h.x, h.y, 4, h.y, 22);
  return waitFor(page, (st) => st.state === 'AFTER', 20000, 'AFTER');
}
