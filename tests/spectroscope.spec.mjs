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

  /** Unlock, put a sample in the flame, then drag the spectroscope into it. */
  async function look(page, elementId, { reset = true } = {}) {
    await page.evaluate((doReset) => {
      if (doReset) window.__game.resetProgress();
      window.__game.setProgress({ plays: { lithium: 1, strontium: 1 }, spectroscopeUnlocked: true });
      window.__game.goto('hearth');
    }, reset);
    await waitIdle(page);

    // 2. the spectroscope is present once unlocked
    const scope = await hit(page, 'spectroscope', { timeout: 10_000 });
    expect(scope).toBeTruthy();

    // 3. sample -> flame, then scope -> flame
    const dish = await hit(page, `dish:${elementId}`);
    const flame = await hit(page, 'flame');
    await drag(page, { x: dish.x, y: dish.y }, { x: flame.x, y: flame.y }, { steps: 24, jitter: 10, ms: 800 });
    await sleep(600);

    const scope2 = await hit(page, 'spectroscope', { timeout: 10_000 });
    const flame2 = await hit(page, 'flame');
    await drag(page, { x: scope2.x, y: scope2.y }, { x: flame2.x, y: flame2.y }, { steps: 24, jitter: 10, ms: 800 });

    await page.waitForFunction(() => window.__game.sceneId === 'spectroscope', null, { timeout: 30_000 });
    await waitIdle(page, 30_000);
    return page.evaluate(() => window.__game.state);
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
