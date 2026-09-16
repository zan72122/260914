// tests/touch.spec.js -- with a real finger, on a real phone.
//
// Every other spec in this suite drives the game with a mouse, and a mouse is
// a lie: it has one button, it never arrives in twos, and it fires a clean
// pointerdown/move/up that hides whatever the touch stack would have done.
// This file runs the same gestures through Chromium's touch emulation on a
// 3x iPhone -- raw Input.dispatchTouchEvent, so the browser synthesises the
// pointer events itself exactly as it would on a device -- and then puts a
// second finger on the glass in the middle of a drag, because a four year old
// holding an iPad has a whole other hand resting on it.

import { test, expect } from '@playwright/test';
import { collectErrors, openGame, snapshot, waitFor } from './helpers.js';

const IPHONE = { width: 390, height: 844 };
const SHEET = 4;

test.use({ viewport: IPHONE, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

/** A finger. CDP takes the touch points; Chromium makes the pointer events. */
class Finger {
  constructor(cdp, id) { this.cdp = cdp; this.id = id; this.x = 0; this.y = 0; }

  point() { return { x: this.x, y: this.y, id: this.id, force: 1, radiusX: 8, radiusY: 8 }; }

  async send(type, others) {
    const pts = type === 'touchEnd' ? (others || []) : [this.point()].concat(others || []);
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  }
}

async function touchDrag(page, cdp, x0, y0, x1, y1, { steps = 16, extra = null, hold = 0 } = {}) {
  const f = new Finger(cdp, 1);
  f.x = x0; f.y = y0;
  await f.send('touchStart');
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    f.x = x0 + (x1 - x0) * t;
    f.y = y0 + (y1 - y0) * t;
    // From half way, a second finger lands and stays there. It must change
    // nothing at all: the gesture belongs to the finger that started it.
    const others = (extra && i > steps / 2) ? [{ x: extra.x, y: extra.y, id: 2, force: 1 }] : null;
    if (others && i === Math.ceil(steps / 2) + 1) {
      await f.send('touchStart', others);   // the second finger arrives
    }
    await f.send('touchMove', others);
    await page.waitForTimeout(14);
  }
  for (let i = 0; i < Math.round(hold / 60); i++) {
    f.x += (i % 2) ? 1 : -1;
    await f.send('touchMove', extra ? [{ x: extra.x, y: extra.y, id: 2, force: 1 }] : null);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(40);
  await f.send('touchEnd');
}

async function ready(page) {
  await openGame(page, IPHONE, { timeScale: 3 });
  await waitFor(page, (s) => s.state === 'WIND' || s.state === 'RAIN_RAMP', 20000, 'wind');
  return snapshot(page);
}

test('a real touch brings the towel in', async ({ page }) => {
  const errors = collectErrors(page);
  const s = await ready(page);
  const cdp = await page.context().newCDPSession(page);
  const towel = s.items[0];

  // Two strokes, one peg each -- exactly what the mouse spec does.
  for (let i = 0; i < 4; i++) {
    const now = await snapshot(page);
    if (now.items[0].state !== 'HANGING') break;
    const it = now.items[0];
    await touchDrag(page, cdp, it.x, it.y, it.x, it.y + 170);
    await page.waitForTimeout(150);
  }
  const done = await waitFor(page, (st) => st.items[0].state === 'IN_BASKET',
    25000, 'towel in the basket');
  expect(done.basket).toBe(1);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a real touch takes the sheet apart, peg by peg', async ({ page }) => {
  const errors = collectErrors(page);
  await ready(page);
  const cdp = await page.context().newCDPSession(page);

  for (let i = 0; i < 4; i++) {
    const s = await snapshot(page);
    const sheet = s.items[SHEET];
    if (sheet.state !== 'HANGING') break;
    const peg = sheet.clipPts.find((c) => !c.popped);
    expect(peg, 'a peg still holding').toBeTruthy();
    await touchDrag(page, cdp, peg.x, peg.y + 10, peg.x, peg.y + 120);
    await waitFor(page, (st) => st.items[SHEET].clips === 3 - i ||
      st.items[SHEET].state !== 'HANGING', 10000, `${3 - i} pegs left`);
  }
  const done = await waitFor(page, (st) => st.items[SHEET].state === 'IN_BASKET',
    25000, 'sheet in the basket');
  expect(done.items[SHEET].clips).toBe(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a second finger on the glass is ignored and does not break the drag', async ({ page }) => {
  const errors = collectErrors(page);
  const s = await ready(page);
  const cdp = await page.context().newCDPSession(page);
  const towel = s.items[0];
  // The palm lands on the far side of the screen, on top of the jeans.
  const palm = { x: s.items[3].x, y: s.items[3].y };

  const before = (await snapshot(page)).items;
  await touchDrag(page, cdp, towel.x, towel.y, towel.x, towel.y + 170, { extra: palm });
  await page.waitForTimeout(400);
  const after = await snapshot(page);

  // The finger that started the gesture finished it...
  expect(after.items[0].clips).toBe(before[0].clips - 1);
  // ...and the one that arrived halfway through did nothing whatsoever.
  expect(after.items[3].state).toBe('HANGING');
  expect(after.items[3].clips).toBe(2);
  expect(errors, errors.join('\n')).toEqual([]);
});
