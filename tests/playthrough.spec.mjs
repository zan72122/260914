// @ts-check
/**
 * B. playthrough.spec.mjs — DESIGN.md §6.4-B.
 * One test per element, played back with deliberately sloppy "4-year-old"
 * gestures. Tagged @play so it can be run (or skipped) as a group:
 *   npx playwright test --config=tests/playwright.config.mjs --grep @play
 *
 * Each test skips itself while its world file does not exist yet.
 * See tests/helpers/flows.mjs for the hitPoint id conventions assumed here.
 */
import { test, expect } from '@playwright/test';
import { hasApp, hasWorld, ELEMENTS } from './helpers/app.mjs';
import { sleep, waitIdle } from './helpers/gestures.mjs';
import {
  startGame,
  enterWorld,
  enterWorldByTap,
  playUntilComplete,
  waitComplete,
  waitReturnToHearth,
  PLAY,
} from './helpers/flows.mjs';

test.describe('playthrough @play', () => {
  test.skip(() => !hasApp(), 'index.html does not exist yet (owned by engineer A)');
  test.describe.configure({ timeout: 90_000 });

  for (const element of ELEMENTS) {
    test(`${element}: sloppy play reaches the world change @play`, async ({ page }) => {
      test.skip(!hasWorld(element), `src/worlds/${element}.js does not exist yet`);

      await startGame(page);

      // 2-4. drag the dish into the flame; land in the world.
      await enterWorld(page, element);
      expect(await page.evaluate(() => window.__game.sceneId)).toBe(element);

      // 5-6. the world-specific bad gesture, until the world changes.
      if (element === 'strontium') {
        const { firedTooEarly } = await PLAY.strontium(page);
        // 250ms press must not launch anything (§2.4 tolerance rules)
        expect(firedTooEarly, 'a 250ms press must not fire').toBe(0);
      }
      await playUntilComplete(page, element, { attempts: 4, timeout: 60_000 });
      await waitComplete(page, 60_000);

      // 7. the element name is spoken exactly at the climax.
      await expect
        .poll(() => page.evaluate(() => window.__game.lastVoice), { timeout: 10_000 })
        .toBe(element);

      // 8. the world returns to the hub by itself and progress is recorded.
      await waitReturnToHearth(page, 30_000);
      expect(await page.evaluate(() => window.__game.sceneId)).toBe('hearth');
      await expect
        .poll(() => page.evaluate((id) => (window.__game.progress.plays || {})[id] || 0, element), {
          timeout: 10_000,
        })
        .toBe(1);
    });
  }

  test('a plain tap on a dish also sends the sample into the flame @play', async ({ page }) => {
    test.skip(!hasWorld('lithium'), 'src/worlds/lithium.js does not exist yet');
    await startGame(page);
    await enterWorldByTap(page, 'lithium');
    expect(await page.evaluate(() => window.__game.sceneId)).toBe('lithium');
  });

  test('letting go mid-drag returns the sample to its dish, nothing breaks @play', async ({ page }) => {
    await startGame(page);
    const { hit, drag } = await import('./helpers/gestures.mjs');
    const dish = await hit(page, 'dish:copper');
    const flame = await hit(page, 'flame');
    // release far from the flame: the sample must float back, scene unchanged
    await drag(
      page,
      { x: dish.x, y: dish.y },
      { x: (dish.x + flame.x) / 2, y: (dish.y + flame.y) / 2 },
      { steps: 12, jitter: 14, ms: 400 }
    );
    await sleep(1200);
    await waitIdle(page);
    expect(await page.evaluate(() => window.__game.sceneId)).toBe('hearth');
  });
});
