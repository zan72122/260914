// tests/audio.spec.js -- spec 10.6: the whole game, with no audio at all.
//
// Not "muted", and not "the context is suspended because Chromium has not had
// a gesture yet" -- which is what the suite has been proving so far, and is a
// much weaker claim. Here `AudioContext` and `webkitAudioContext` are deleted
// from the window before a single line of the game is parsed, so every path
// through audio.js fails at construction and every later call has to be a
// silent no-op. Sound is decoration: the game has to be finishable without it,
// with nothing on the console.

import { test, expect } from '@playwright/test';
import {
  IPHONE_PORTRAIT, IPAD_LANDSCAPE, collectErrors, openGame, snapshot,
  waitFor, playAllItems, closeSash,
} from './helpers.js';

const DEAF = () => {
  delete window.AudioContext;
  delete window.webkitAudioContext;
  // Belt and braces: if anything reaches for one anyway, it throws.
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    get() { throw new Error('AudioContext must not be used'); },
  });
};

const CASES = [
  ['iPhone portrait', IPHONE_PORTRAIT],
  ['iPad landscape', IPAD_LANDSCAPE],
];

for (const [name, vp] of CASES) {
  test(`${name}: the whole game plays through with no AudioContext at all`, async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page, vp, { timeScale: 3, initScript: DEAF });

    // It really is gone, and the game knows it.
    expect(await page.evaluate(() => {
      try { return !!window.__gameInstance.audio.ok; } catch (e) { return 'threw: ' + e.message; }
    })).toBe(false);

    await waitFor(page, (s) => s.state === 'WIND' || s.state === 'RAIN_RAMP', 20000, 'wind');
    await playAllItems(page);
    const stowed = await waitFor(page, (s) => s.items.every((i) => i.state === 'IN_BASKET'),
      45000, 'everything in the basket');
    expect(stowed.basket).toBe(5);

    const done = await closeSash(page);
    expect(done.state).toBe('AFTER');
    expect(done.sash).toBe(1);

    const text = await page.evaluate(() => (document.body.innerText || '').trim());
    expect(text).toBe('');
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('the restart tap still works with no audio', async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page, IPHONE_PORTRAIT, { timeScale: 4, initScript: DEAF });
  await waitFor(page, (s) => s.state === 'WIND' || s.state === 'RAIN_RAMP', 20000, 'wind');
  await playAllItems(page);
  await closeSash(page);
  // Hidden, and only after a few quiet seconds.
  await page.waitForTimeout(400);
  await page.mouse.click(IPHONE_PORTRAIT.width * 0.5, IPHONE_PORTRAIT.height * 0.85);
  expect((await snapshot(page)).state).toBe('AFTER');
  await page.waitForTimeout(3200);
  await page.mouse.click(IPHONE_PORTRAIT.width * 0.5, IPHONE_PORTRAIT.height * 0.85);
  const s = await waitFor(page, (st) => st.state === 'CALM' || st.state === 'FIRST_DROP',
    8000, 'back to the beginning');
  expect(s.basket).toBe(0);
  expect(s.items.every((i) => i.state === 'HANGING')).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});
