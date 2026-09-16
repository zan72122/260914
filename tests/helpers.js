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
 * Pull every item off the line. One pull pops at most one peg (by design), so
 * this just keeps pulling until nothing is HANGING any more.
 */
export async function playAllItems(page, { maxStrokes = 60 } = {}) {
  for (let stroke = 0; stroke < maxStrokes; stroke++) {
    const s = await snapshot(page);
    const hanging = s.items.filter((it) => it.state === 'HANGING');
    if (!hanging.length) return s;
    const it = hanging[0];
    const dist = 170;
    const x1 = it.x + s.inDir.x * dist;
    const y1 = it.y + s.inDir.y * dist;
    await drag(page, it.x, it.y, x1, y1);
    await page.waitForTimeout(60);
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
