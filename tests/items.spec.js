// The flourishes, and the things that must NOT release.
//
// Phase 4 made one gesture -- pull the cloth toward the room -- work on all
// five items (tests/naive.spec.js proves that). What is left here is the other
// half of the contract: the older, nicer ways in still work for anyone who
// finds them, and none of the near misses release anything.

import { test, expect } from '@playwright/test';
import {
  IPHONE_PORTRAIT, IPAD_LANDSCAPE, collectErrors, openGame, snapshot, waitFor,
  setTimeScale, liftAndArc, swipeClips, flick, naiveStroke, drag, tapPeg,
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
  test(`${name}: the shirt still comes off a deliberate lift-then-arc`, async ({ page }) => {
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
    s = await snapshot(page);
    expect(item(s, 'pinch').clips).toBe(0);
    // ...and the empty frame takes itself indoors, with nothing else touched.
    s = await waitFor(page, (st) => item(st, 'pinch').state === 'IN_BASKET', 25000, 'pinch in basket');
    expect(s.basket).toBe(1);
    expect(item(s, 'towel').state).toBe('HANGING');
    expect(item(s, 'pants').state).toBe('HANGING');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test(`${name}: a plain pull rides the shirt's hook up off the bar`, async ({ page }) => {
    const errors = collectErrors(page);
    const s = await ready(page, vp);
    const it = item(s, 'shirt');
    const dist = Math.min(vp.width, vp.height) * 0.42;

    // A pull toward the room. No upward movement anywhere in it.
    await page.mouse.move(it.x, it.y);
    await page.mouse.down();
    let sawLift = false;
    for (let i = 1; i <= 20; i++) {
      const t = i / 20;
      await page.mouse.move(it.x + s.inDir.x * dist * t, it.y + s.inDir.y * dist * t);
      await page.waitForTimeout(16);
      if (!sawLift) {
        const now = item(await snapshot(page), 'shirt');
        // The world does the lifting: the hook climbs as the pull grows.
        if (now.lift > 4) sawLift = true;
      }
    }
    await page.mouse.up();
    expect(sawLift, 'the hook never rose off the pole').toBe(true);
    const done = await waitFor(page, (st) => item(st, 'shirt').state === 'IN_BASKET',
      25000, 'shirt in basket');
    expect(done.basket).toBe(1);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

// ---- and the near misses -------------------------------------------------

test('pulling the shirt the wrong way leaves the hook on the bar', async ({ page }) => {
  const errors = collectErrors(page);
  const s = await ready(page, IPHONE_PORTRAIT);
  const before = item(s, 'shirt');
  for (let i = 0; i < 3; i++) {
    // portrait: inDir is (0, 1), so straight up is exactly wrong.
    await drag(page, before.x, before.y, before.x, before.y - 150, 16);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(600);
  const after = item(await snapshot(page), 'shirt');
  expect(after.state).toBe('HANGING');
  expect(after.clips).toBe(2);
  expect(after.lifted).toBe(false);
  // It settled back onto the pole rather than staying stretched out.
  expect(Math.abs(after.y - before.y)).toBeLessThan(60);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a quick flick never unclips the jeans', async ({ page }) => {
  const errors = collectErrors(page);
  const s = await ready(page, IPHONE_PORTRAIT);
  // Real time for this one: the weight of the thing is measured in seconds.
  await setTimeScale(page, 1);
  for (let i = 0; i < 4; i++) {
    const now = await snapshot(page);
    await flick(page, now, item(now, 'pants'));
    await page.waitForTimeout(220);
  }
  const after = item(await snapshot(page), 'pants');
  expect(after.state).toBe('HANGING');
  expect(after.clips).toBe(2);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a slow pull that stops short of the distance does nothing either', async ({ page }) => {
  const s = await ready(page, IPHONE_PORTRAIT);
  await setTimeScale(page, 1);
  // Long in time, short in distance: the jeans want the distance.
  await naiveStroke(page, s, item(s, 'pants'), { dist: 46, hold: 1200, steps: 10 });
  await page.waitForTimeout(400);
  const after = item(await snapshot(page), 'pants');
  expect(after.state).toBe('HANGING');
  expect(after.clips).toBe(2);
});

test('the jeans take both clips on one long pull, with no waiting asked for', async ({ page }) => {
  const s = await ready(page, IPHONE_PORTRAIT);
  await setTimeScale(page, 1);
  await naiveStroke(page, s, item(s, 'pants'), { hold: 900 });
  const after = item(await snapshot(page), 'pants');
  expect(after.clips).toBe(0);
  expect(after.state).not.toBe('HANGING');
});

test('only the clips the finger touches pop', async ({ page }) => {
  const errors = collectErrors(page);
  const s = await ready(page, IPHONE_PORTRAIT);
  const pts = item(s, 'pinch').clipPts;
  expect(pts.length).toBeGreaterThanOrEqual(6);
  await page.mouse.click(pts[0].x, pts[0].y);
  await page.waitForTimeout(250);
  const after = item(await snapshot(page), 'pinch');
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

test('dragging the pinch hanger the wrong way pops nothing it did not touch', async ({ page }) => {
  const s = await ready(page, IPHONE_PORTRAIT);
  const pinch = item(s, 'pinch');
  const below = { x: pinch.x, y: pinch.y + 70 };
  // Up and away: away from the room, and away from every clip.
  await page.mouse.move(below.x, below.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(below.x - i * 6, below.y - i * 8);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(200);
  const after = item(await snapshot(page), 'pinch');
  expect(after.state).toBe('HANGING');
  expect(after.clips).toBe(6);
});

test('a touch on one of the sheet\'s pegs opens exactly that peg', async ({ page }) => {
  const errors = collectErrors(page);
  await ready(page, IPHONE_PORTRAIT);
  await tapPeg(page, INDEX.sheet, 0);
  const after = item(await snapshot(page), 'sheet');
  expect(after.clips).toBe(3);
  expect(after.state).toBe('HANGING');
  expect(after.clipPts[0].popped).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});
