// @ts-check
/**
 * C. spectroscope.spec.mjs — DESIGN.md §6.4-C / §3.3.
 * Tagged @spectro.
 */
import { test, expect } from '@playwright/test';
import { hasApp, hasSpectroscope, hasWorld } from './helpers/app.mjs';
import { hit, drag, waitIdle, waitForGame, sleep } from './helpers/gestures.mjs';

test.describe('spectroscope @spectro', () => {
  test.skip(() => !hasApp(), 'index.html does not exist yet (owned by engineer A)');
  test.skip(() => !hasSpectroscope(), 'src/scenes/spectroscope.js does not exist yet (owned by engineer G)');
  test.describe.configure({ timeout: 90_000 });

  /**
   * Unlock, put a sample in the flame, then grab the spectroscope while the
   * flame is still coloured. That window is narrow at both ends: the scope only
   * reacts once the flame has taken the element's colour (~0.5s after the
   * sample lands) and the hearth hands off to the world at ~2.4s (§1.5). We aim
   * for the middle of it and retry from the hub if we fall into the world.
   */
  async function look(page, elementId, { reset = true, attempts = 3 } = {}) {
    let landed = null;
    for (let i = 0; i < attempts; i++) {
      await page.evaluate(
        ([doReset]) => {
          if (doReset) window.__game.resetProgress();
          window.__game.setProgress({ plays: { lithium: 1, strontium: 1 }, spectroscopeUnlocked: true });
          window.__game.goto('hearth');
        },
        [reset && i === 0]
      );
      await waitIdle(page);

      // 2. the spectroscope is present once unlocked
      const scope = await hit(page, 'spectroscope', { timeout: 10_000 });
      expect(scope, 'the spectroscope must be reachable once unlocked').toBeTruthy();

      // 3. sample -> flame, then immediately scope -> flame
      const dish = await hit(page, `dish:${elementId}`);
      const flame = await hit(page, 'flame');
      await drag(page, { x: dish.x, y: dish.y }, { x: flame.x, y: flame.y }, { steps: 20, jitter: 10, ms: 500 });
      await sleep(600); // let the flame take the element's colour
      await drag(page, { x: scope.x, y: scope.y }, { x: flame.x, y: flame.y }, { steps: 16, jitter: 8, ms: 350 });

      try {
        await page.waitForFunction(() => window.__game.sceneId === 'spectroscope', null, { timeout: 8_000 });
        await waitIdle(page, 30_000);
        return page.evaluate(() => window.__game.state);
      } catch {
        landed = await page.evaluate(() => window.__game.sceneId).catch(() => '<unavailable>');
        // The coloured-flame window was missed (we fell into the world instead);
        // go back to the hub and try again.
        await page.evaluate(() => window.__game.goto('hearth'));
        await waitIdle(page, 30_000);
      }
    }
    throw new Error(
      `the spectroscope never opened for "${elementId}" after ${attempts} attempts ` +
        `(last sceneId after the scope drag: "${landed}"). The scope must be grabbable ` +
        `while the flame is coloured, before the hearth hands off to the world.`
    );
  }

  test('lithium shows a sparse spectrum @spectro', async ({ page }) => {
    test.skip(!hasWorld('lithium'), 'src/worlds/lithium.js does not exist yet');
    await page.goto('/');
    await waitForGame(page);
    const st = await look(page, 'lithium');
    expect(st.spectrumId).toBe('lithium');
    expect(st.lineCount).toBe(2);
  });

  test('strontium shows a busy spectrum with a blue line @spectro', async ({ page }) => {
    test.skip(!hasWorld('strontium'), 'src/worlds/strontium.js does not exist yet');
    await page.goto('/');
    await waitForGame(page);
    const st = await look(page, 'strontium');
    expect(st.spectrumId).toBe('strontium');
    expect(st.lineCount).toBeGreaterThanOrEqual(5);
    expect(st.hasBlueLine).toBe(true);
  });

  test('both reds seen -> progress.spectraSeen records both @spectro', async ({ page }) => {
    test.skip(!hasWorld('lithium') || !hasWorld('strontium'), 'red worlds do not exist yet');
    await page.goto('/');
    await waitForGame(page);
    await look(page, 'lithium');
    await page.evaluate(() => window.__game.goto('hearth'));
    await waitIdle(page);
    await look(page, 'strontium', { reset: false });
    await expect
      .poll(() => page.evaluate(() => window.__game.progress.spectraSeen || {}), { timeout: 10_000 })
      .toMatchObject({ lithium: true, strontium: true });
  });
});
