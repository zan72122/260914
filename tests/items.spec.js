// The three phase-2 gestures, and the things that must NOT release them.
//
// Every item on the line answers to a different kind of intent, and that is
// the point: the shirt wants a lift, the pinch-hanger wants contact, the jeans
// want patience. These tests drive the real gestures in both orientations and
// then check that the near-miss version of each one leaves the washing exactly
// where it was -- stretched, swinging, clinking, but never released.

import { test, expect } from '@playwright/test';
import {
  IPHONE_PORTRAIT, IPAD_LANDSCAPE, collectErrors, openGame, snapshot, waitFor,
  setTimeScale, liftAndArc, plainPull, swipeClips, popPinch, heavyPull, flick,
} from './helpers.js';

const CASES = [
  ['iPhone portrait', IPHONE_PORTRAIT],
  ['iPad landscape', IPAD_LANDSCAPE],
];

const INDEX = { towel: 0, shirt: 1, pinch: 2, pants: 3, sheet: 4 };

/** Get to the rain, where everything is in play. */
async function ready(page, vp, timeScale = 3) {
  await openGame(page, vp, { timeScale });
  await waitFor(page, (s) => s.state === 'WIND' || s.state === 'RAIN_RAMP', 20000, 'rain to start');
  return snapshot(page);
}

const item = (s, id) => s.items[INDEX[id]];

for (const [name, vp] of CASES) {
  test(`${name}: the shirt comes off with lift-then-arc`, async ({ page }) => {
    const errors = collectErrors(page);
    let s = await ready(page, vp);
    await liftAndArc(page, s, item(s, 'shirt'));
    s = await waitFor(page, (st) => item(st, 'shirt').state !== 'HANGING', 10000, 'shirt released');
    expect(item(s, 'shirt').clips).toBe(0);
    s = await waitFor(page, (st) => item(st, 'shirt').state === 'IN_BASKET', 25000, 'shirt in basket');
    expect(s.basket).toBe(1);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test(`${name}: tracing the clips empties the pinch hanger`, async ({ page }) => {
    const errors = collectErrors(page);
    let s = await ready(page, vp);
    await swipeClips(page, INDEX.pinch);
    // One trace is enough for the whole row.
    s = await snapshot(page);
    expect(item(s, 'pinch').clips).toBe(0);
    // ...and the empty frame takes itself indoors, with nothing else touched.
    s = await waitFor(page, (st) => item(st, 'pinch').state === 'IN_BASKET', 25000, 'pinch in basket');
    expect(s.basket).toBe(1);
    expect(item(s, 'towel').state).toBe('HANGING');
    expect(item(s, 'pants').state).toBe('HANGING');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test(`${name}: the jeans need a long held pull`, async ({ page }) => {
    const errors = collectErrors(page);
    let s = await ready(page, vp);
    await heavyPull(page, s, item(s, 'pants'));
    s = await waitFor(page, (st) => item(st, 'pants').state !== 'HANGING', 10000, 'pants released');
    // Both fat clips go on the one long pull, unlike the towel's one-per-pull.
    expect(item(s, 'pants').clips).toBe(0);
    s = await waitFor(page, (st) => item(st, 'pants').state === 'IN_BASKET', 25000, 'pants in basket');
    expect(s.basket).toBe(1);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

// ---- and the near misses -------------------------------------------------

test('the shirt does not come off a plain pull: the hook holds, then it springs back', async ({ page }) => {
  const errors = collectErrors(page);
  const s = await ready(page, IPHONE_PORTRAIT);
  const before = item(s, 'shirt');
  for (let i = 0; i < 3; i++) {
    await plainPull(page, s, before);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(500);
  const after = snapshotItem(await snapshot(page), 'shirt');
  expect(after.state).toBe('HANGING');
  expect(after.clips).toBe(2);
  expect(after.lifted).toBe(false);
  // It settled back onto the pole rather than staying stretched out.
  expect(Math.abs(after.y - before.y)).toBeLessThan(60);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the shirt in landscape also refuses a plain pull', async ({ page }) => {
  const s = await ready(page, IPAD_LANDSCAPE);
  await plainPull(page, s, item(s, 'shirt'), 260);
  await page.waitForTimeout(500);
  const after = snapshotItem(await snapshot(page), 'shirt');
  expect(after.state).toBe('HANGING');
  expect(after.clips).toBe(2);
});

test('a quick flick never unclips the jeans', async ({ page }) => {
  const errors = collectErrors(page);
  const s = await ready(page, IPHONE_PORTRAIT);
  // Real time for this one: the hold is measured in real seconds.
  await setTimeScale(page, 1);
  for (let i = 0; i < 4; i++) {
    const now = await snapshot(page);
    await flick(page, now, item(now, 'pants'));
    await page.waitForTimeout(220);
  }
  const after = snapshotItem(await snapshot(page), 'pants');
  expect(after.state).toBe('HANGING');
  expect(after.clips).toBe(2);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a short pull that stops short of the threshold does nothing either', async ({ page }) => {
  const s = await ready(page, IPHONE_PORTRAIT);
  await setTimeScale(page, 1);
  // Long in time, short in distance: both conditions are required.
  await heavyPull(page, s, item(s, 'pants'), { reach: 40, hold: 900 });
  await page.waitForTimeout(300);
  const after = snapshotItem(await snapshot(page), 'pants');
  expect(after.state).toBe('HANGING');
  expect(after.clips).toBe(2);
});

test('only the clips the finger touches pop', async ({ page }) => {
  const errors = collectErrors(page);
  const s = await ready(page, IPHONE_PORTRAIT);
  const pts = item(s, 'pinch').clipPts;
  expect(pts.length).toBeGreaterThanOrEqual(6);
  await page.mouse.click(pts[0].x, pts[0].y);
  await page.waitForTimeout(250);
  const after = snapshotItem(await snapshot(page), 'pinch');
  expect(after.state).toBe('HANGING');
  expect(after.clips).toBeGreaterThan(2);           // most of the row is untouched
  expect(after.clipPts[0].popped).toBe(true);       // the one under the finger went
  expect(after.clipPts[pts.length - 1].popped).toBe(false); // the far end did not
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the pinch hanger also empties under repeated taps alone', async ({ page }) => {
  const s = await ready(page, IPHONE_PORTRAIT);
  const pts = item(s, 'pinch').clipPts;
  for (const p of pts) {
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(90);
  }
  const after = await waitFor(page, (st) => item(st, 'pinch').state !== 'HANGING',
    10000, 'pinch frame going in');
  expect(item(after, 'pinch').clips).toBe(0);
});

test('dragging the pinch hanger sideways pops nothing it did not touch', async ({ page }) => {
  const s = await ready(page, IPHONE_PORTRAIT);
  const pinch = item(s, 'pinch');
  const below = { x: pinch.x, y: pinch.y + 70 };
  await page.mouse.move(below.x, below.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(below.x - i * 6, below.y + i * 4);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(200);
  const after = snapshotItem(await snapshot(page), 'pinch');
  expect(after.state).toBe('HANGING');
  expect(after.clips).toBe(6);
});

function snapshotItem(s, id) { return s.items[INDEX[id]]; }
