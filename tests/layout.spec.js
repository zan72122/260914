// tests/layout.spec.js -- the line has to be packed, not stacked.
//
// The bug this file exists to stop coming back: an item class overriding its
// own slot and width, ending up on top of its neighbour, and hiding behind it
// on a phone. items/index.js is now the only place those numbers live, so the
// packing is a property of the registry and can be checked directly -- in
// every orientation of both devices, all at once.

import { test, expect } from '@playwright/test';
import { collectErrors, openGame, snapshot } from './helpers.js';

const VIEWPORTS = [
  ['iPhone portrait', { width: 390, height: 844 }],
  ['iPhone landscape', { width: 844, height: 390 }],
  ['iPad portrait', { width: 820, height: 1180 }],
  ['iPad landscape', { width: 1180, height: 820 }],
];

const ORDER = ['towel', 'shirt', 'pinch', 'pants', 'sheet'];

for (const [name, vp] of VIEWPORTS) {
  test(`${name}: the five items are packed, not stacked`, async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page, vp);
    await page.waitForTimeout(400);
    const s = await snapshot(page);
    const pole = await page.evaluate(() => window.__game.pole);

    expect(s.items.map((i) => i.id)).toEqual(ORDER);

    // --- nothing overlaps anything ---------------------------------------
    for (let i = 0; i < s.items.length; i++) {
      for (let j = i + 1; j < s.items.length; j++) {
        const a = s.items[i].box, b = s.items[j].box;
        const gap = Math.max(b.x0 - a.x1, a.x0 - b.x1);
        expect(gap,
          `${s.items[i].id} and ${s.items[j].id} overlap: ${JSON.stringify([a, b])}`)
          .toBeGreaterThan(0);
      }
    }

    // --- and every one is in reach ---------------------------------------
    for (const it of s.items) {
      expect(it.pad, `${it.id} hit pad`).toBeGreaterThanOrEqual(64);
      const w = it.box.x1 - it.box.x0 + it.pad * 2;
      const h = it.box.y1 - it.box.y0 + it.pad * 2;
      expect(Math.min(w, h), `${it.id} hit area`).toBeGreaterThanOrEqual(64);
    }

    // --- the sheet is still the signature object -------------------------
    const sheet = s.items[4];
    const sheetW = sheet.box.x1 - sheet.box.x0;
    expect(sheetW / pole.width).toBeGreaterThanOrEqual(0.35);
    for (let i = 0; i < 4; i++) {
      expect(sheetW).toBeGreaterThan(s.items[i].box.x1 - s.items[i].box.x0);
    }

    // --- and all of it hangs on the pole, inside the opening -------------
    for (const it of s.items) {
      expect(it.box.x0).toBeGreaterThanOrEqual(pole.x0 - 1);
      expect(it.box.x1).toBeLessThanOrEqual(pole.x0 + pole.width + 1);
      expect(Math.abs(it.box.y0 - pole.y)).toBeLessThan(1);
    }

    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('portrait: the washing fills the balcony instead of banding the top', async ({ page }) => {
  await openGame(page, { width: 390, height: 844 });
  await page.waitForTimeout(400);
  const s = await snapshot(page);
  const { opening, pole } = await page.evaluate(() => ({
    opening: window.__game.opening, pole: window.__game.pole,
  }));
  const outdoorH = 844 * 0.59;

  // The hems reach about two thirds of the way down the balcony...
  const hems = s.items.map((i) => i.box.y1);
  const deepest = Math.max(...hems);
  expect(deepest / outdoorH).toBeGreaterThan(0.62);
  expect(deepest).toBeLessThan(844 * 0.59); // ...and still hang above the room

  // ...and the line itself spans most of the width of the phone.
  expect(pole.width / 390).toBeGreaterThan(0.65);
  expect(opening.h).toBeGreaterThan(844 * 0.5);
});
