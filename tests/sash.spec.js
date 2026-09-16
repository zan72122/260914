// tests/sash.spec.js -- the last gesture of the game, and the first thing a
// four year old tries on it.
//
// The second blind playtest (docs/PLAYTEST-2.md) got the whole line in on one
// stroke each and then stalled on the window: the handle glows, so she pressed
// it, and pressing it did nothing at all. Spec §0 forbids an arrow, a ghost
// hand or a word to explain the drag -- so the press itself has to be the
// answer. One press slides the pane a notch toward shut and leaves it there;
// three shut the window. Meanwhile the pane rocks toward closed on every gust,
// which is the only thing on the screen that says which way it travels.

import { test, expect } from '@playwright/test';
import {
  IPHONE_PORTRAIT, collectErrors, openGame, snapshot, waitFor,
  playAllItems, setTimeScale,
} from './helpers.js';

test('the locked handle is not dead: it knocks in its runners', async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page, IPHONE_PORTRAIT, { timeScale: 3 });
  await waitFor(page, (s) => s.state === 'RAIN_RAMP', 20000, 'the rain');
  const pt = (await snapshot(page)).handle;
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(60);
  const drift = await page.evaluate(() => Math.abs(window.__game.sashDrift));
  // It moved a little...
  expect(drift, 'the locked handle did nothing at all').toBeGreaterThan(0.006);
  // ...and it did not open the window early, which the spec locks shut.
  const s = await snapshot(page);
  expect(s.sash).toBe(0);
  expect(await page.evaluate(() => window.__game.sashEnabled)).toBe(false);

  // ...and it settles back where it was.
  await setTimeScale(page, 1);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => Math.abs(window.__game.sashDrift))).toBeLessThan(0.005);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('three presses on the handle shut the window', async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page, IPHONE_PORTRAIT, { timeScale: 4 });
  await waitFor(page, (s) => s.state === 'WIND' || s.state === 'RAIN_RAMP', 20000, 'wind');
  await setTimeScale(page, 3);
  await playAllItems(page);
  const empty = await waitFor(page, (s) => s.state === 'EMPTY_LINE', 45000, 'EMPTY_LINE');
  await setTimeScale(page, 1);

  // The pane itself rocks toward closed on a gust, and comes back. No arrow
  // is drawn, nothing is labelled: the window shows the direction it moves in.
  let peak = 0;
  for (let i = 0; i < 80; i++) {
    peak = Math.max(peak, await page.evaluate(() => window.__game.sashDrift));
    await page.waitForTimeout(100);
  }
  expect(peak, 'the pane never drifts toward shut').toBeGreaterThan(0.015);
  expect(peak, 'the pane drifts so far it looks like it is closing').toBeLessThan(0.06);

  // Press one: a notch of the window, and it stays there.
  const h = empty.handle;
  await page.mouse.click(h.x, h.y);
  await page.waitForTimeout(800);
  const one = (await snapshot(page)).sash;
  expect(one, 'a press did nothing').toBeGreaterThan(0.12);
  expect(one, 'a press shut the whole thing').toBeLessThan(0.25);
  await page.waitForTimeout(900);
  // It does not spring back open.
  expect((await snapshot(page)).sash).toBeGreaterThanOrEqual(one - 0.01);
  expect(await page.evaluate(() => window.__game.state)).toBe('SASH_CLOSE');

  // Press two, on the handle where it is now.
  const h2 = (await snapshot(page)).handle;
  await page.mouse.click(h2.x, h2.y);
  await page.waitForTimeout(800);
  const two = (await snapshot(page)).sash;
  expect(two).toBeGreaterThan(one + 0.1);

  // Press three carries it past the point where it finishes by itself.
  const h3 = (await snapshot(page)).handle;
  await page.mouse.click(h3.x, h3.y);
  const done = await waitFor(page, (s) => s.state === 'AFTER', 15000, 'AFTER');
  expect(done.sash).toBe(1);
  expect(errors, errors.join('\n')).toEqual([]);
});
