// tests/sheet.spec.js -- the set piece.
//
// The sheet is the only item released peg by peg, in an order the child
// chooses, so the thing worth testing is exactly that: four separate gestures,
// each one taking exactly one peg off, the cloth growing as it goes, and the
// last one carrying the whole state machine through
// HANGING -> RELEASING -> CARRYING -> IN_BASKET.

import { test, expect } from '@playwright/test';
import {
  IPHONE_PORTRAIT, IPAD_LANDSCAPE, collectErrors, openGame, snapshot,
  waitFor, drag, setTimeScale,
} from './helpers.js';

const DIR = 'tests/screenshots';
const SHEET = 4; // registry order: towel, shirt, pinch, pants, sheet

const CASES = [
  ['portrait', IPHONE_PORTRAIT, 'iPhone portrait'],
  ['landscape', IPAD_LANDSCAPE, 'iPad landscape'],
];

/** Pull the first peg that is still holding, toward the room. */
async function pullPeg(page, dist) {
  const s = await snapshot(page);
  const sheet = s.items[SHEET];
  const peg = sheet.clipPts.find((c) => !c.popped);
  expect(peg, 'a peg that is still holding').toBeTruthy();
  // Start a little below the peg so the finger is on cloth, not on thin air.
  const x0 = peg.x + s.inDir.x * 6;
  const y0 = peg.y + (s.inDir.y ? 10 : 6);
  await drag(page, x0, y0, x0 + s.inDir.x * dist, y0 + s.inDir.y * dist, 16);
  await page.waitForTimeout(120);
  return sheet.clips;
}

function sheetOf(s) { return s.items[SHEET]; }

for (const [name, vp, label] of CASES) {
  test(`${label}: the sheet's four pegs come off one at a time`, async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page, vp, {
      timeScale: 3,
      // Spec §10.5: not one glyph, ever -- including during the set piece.
      initScript: () => {
        const boom = function () { throw new Error('text drawn on canvas'); };
        CanvasRenderingContext2D.prototype.fillText = boom;
        CanvasRenderingContext2D.prototype.strokeText = boom;
      },
    });
    await waitFor(page, (s) => s.state === 'WIND' || s.state === 'RAIN_RAMP', 20000, 'wind');

    const dist = vp.width > 900 ? 150 : 110;
    const start = await snapshot(page);
    expect(sheetOf(start).state).toBe('HANGING');
    expect(sheetOf(start).clips).toBe(4);
    const basket0 = start.basket;

    // --- three pegs, one gesture each ------------------------------------
    for (let i = 1; i <= 3; i++) {
      const before = await snapshot(page);
      await pullPeg(page, dist);
      const after = await waitFor(page, (s) => sheetOf(s).clips === 4 - i,
        8000, `${4 - i} pegs left`);
      expect(sheetOf(after).clips).toBe(sheetOf(before).clips - 1);
      // Still pinned by what is left: it has not gone anywhere yet.
      expect(sheetOf(after).state).toBe('HANGING');
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${DIR}/${name}-sheet-${i}clip${i > 1 ? 's' : ''}.png` });
    }

    // The freed part really does take up the screen: with three pegs off the
    // sheet's own centre of mass has moved well toward the room.
    const loose = await snapshot(page);
    const moved = (sheetOf(loose).x - sheetOf(start).x) * loose.inDir.x +
      (sheetOf(loose).y - sheetOf(start).y) * loose.inDir.y;
    expect(moved).toBeGreaterThan(8);

    // --- the last peg: basa ----------------------------------------------
    // Real speed from here: the whole point of the finale is how long it
    // takes, and polling from node is far too coarse to see it otherwise, so
    // the page records the state changes for us frame by frame.
    await setTimeScale(page, 1);
    await page.evaluate(() => {
      window.__seq = [];
      const tick = () => {
        const it = window.__game.items[4];
        if (it && it.state !== window.__seq[window.__seq.length - 1]) {
          window.__seq.push(it.state);
        }
        requestAnimationFrame(tick);
      };
      tick();
    });

    await pullPeg(page, dist);
    await page.waitForTimeout(260);          // mid-flip, mid-billow
    const mid = await snapshot(page);
    expect(sheetOf(mid).clips).toBe(0);
    await page.screenshot({ path: `${DIR}/${name}-sheet-release.png` });

    // Frame-accurate: the hug is under a second long, so node-side polling
    // would walk straight past it.
    await page.waitForFunction(() => window.__game.items[4].state === 'CARRYING',
      null, { timeout: 15000 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${DIR}/${name}-sheet-hug.png` });

    const done = await waitFor(page, (s) => sheetOf(s).state === 'IN_BASKET',
      20000, 'IN_BASKET');
    expect(done.basket).toBe(basket0 + 1);

    const seq = await page.evaluate(() => window.__seq);
    expect(seq).toEqual(['HANGING', 'RELEASING', 'CARRYING', 'IN_BASKET']);

    const text = await page.evaluate(() => (document.body.innerText || '').trim());
    expect(text).toBe('');
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('the sheet stretches but never lets go when pulled the wrong way', async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page, IPHONE_PORTRAIT, { timeScale: 3 });
  await waitFor(page, (s) => s.state === 'RAIN_RAMP', 20000, 'RAIN_RAMP');
  const s = await snapshot(page);
  const sheet = sheetOf(s);
  const peg = sheet.clipPts.find((c) => !c.popped);
  // portrait inDir is (0, 1): straight up is exactly the wrong way.
  await drag(page, peg.x, peg.y + 14, peg.x, peg.y - 150, 16);
  await page.waitForTimeout(400);
  const after = await snapshot(page);
  expect(sheetOf(after).state).toBe('HANGING');
  expect(sheetOf(after).clips).toBe(4);
  expect(errors, errors.join('\n')).toEqual([]);
});
