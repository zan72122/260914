import { test, expect } from '@playwright/test';
import {
  IPHONE_PORTRAIT, IPAD_LANDSCAPE, collectErrors, openGame, snapshot,
  waitFor, playAllItems, closeSash,
} from './helpers.js';

const CASES = [
  ['iPhone portrait', IPHONE_PORTRAIT],
  ['iPad landscape', IPAD_LANDSCAPE],
];

for (const [name, vp] of CASES) {
  test(`${name}: all five items come in, then the sash closes`, async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page, vp, { timeScale: 3 });

    await waitFor(page, (s) => s.state === 'WIND' || s.state === 'RAIN_RAMP', 20000, 'rain to start');
    await playAllItems(page);
    const stowed = await waitFor(page, (s) => s.items.every((i) => i.state === 'IN_BASKET'),
      45000, 'everything in the basket');
    expect(stowed.basket).toBe(5);

    const empty = await waitFor(page, (s) => s.state === 'EMPTY_LINE', 20000, 'EMPTY_LINE');
    expect(empty.sash).toBe(0);

    const done = await closeSash(page);
    expect(done.state).toBe('AFTER');
    expect(done.sash).toBe(1);

    const text = await page.evaluate(() => (document.body.innerText || '').trim());
    expect(text).toBe('');
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('the sash cannot be moved before the line is empty', async ({ page }) => {
  await openGame(page, IPHONE_PORTRAIT, { timeScale: 3 });
  await waitFor(page, (s) => s.state === 'RAIN_RAMP', 20000, 'RAIN_RAMP');
  const s = await snapshot(page);
  await page.mouse.move(s.handle.x, s.handle.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(s.handle.x - i * 20, s.handle.y);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  const after = await snapshot(page);
  expect(after.sash).toBe(0);
});

test('a sideways drag stretches the cloth but never releases it', async ({ page }) => {
  await openGame(page, IPHONE_PORTRAIT, { timeScale: 3 });
  await waitFor(page, (s) => s.state === 'RAIN_RAMP', 20000, 'RAIN_RAMP');
  const s = await snapshot(page);
  const it = s.items[0];
  // portrait: inDir is (0,1), so drag straight up -- the wrong way
  await page.mouse.move(it.x, it.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(it.x, it.y - i * 14);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await snapshot(page);
  expect(after.items[0].state).toBe('HANGING');
  expect(after.items[0].clips).toBe(2);
});
