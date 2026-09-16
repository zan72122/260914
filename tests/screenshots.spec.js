import { test } from '@playwright/test';
import {
  IPHONE_PORTRAIT, IPAD_LANDSCAPE, openGame, snapshot, waitFor,
  playAllItems, closeSash, setTimeScale,
} from './helpers.js';

const DIR = 'tests/screenshots';

const CASES = [
  ['portrait', IPHONE_PORTRAIT],
  ['landscape', IPAD_LANDSCAPE],
];

for (const [name, vp] of CASES) {
  test(`screenshots: ${name}`, async ({ page }) => {
    const shot = (n) => page.screenshot({ path: `${DIR}/${name}-${n}.png` });

    await openGame(page, vp);
    await page.waitForTimeout(1200);
    await shot('1-calm');

    await waitFor(page, (s) => s.state === 'FIRST_DROP', 12000, 'FIRST_DROP');
    await page.waitForTimeout(1400); // let the drop swell and start running
    await shot('2-first-drop');

    await waitFor(page, (s) => s.state === 'WIND' || s.state === 'RAIN_RAMP', 12000, 'wind');
    await page.waitForTimeout(600);
    await shot('3-wind');

    await setTimeScale(page, 4);
    await waitFor(page, (s) => s.rain > 0.5, 30000, 'mid rain');
    await page.waitForTimeout(400);
    await shot('4-mid-rain');

    await setTimeScale(page, 3);
    await playAllItems(page);
    await waitFor(page, (s) => s.state === 'EMPTY_LINE', 45000, 'EMPTY_LINE');
    await page.waitForTimeout(900);
    await shot('5-empty-line');

    await closeSash(page);
    await page.waitForTimeout(1600);
    await shot('6-after');

    // eslint-disable-next-line no-unused-vars
    const final = await snapshot(page);
  });
}
