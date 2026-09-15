import { expect, test } from '@playwright/test';
import { PHONE, SCENE_ORDER, SHOT_DIR, bootGame, expectWordless, geom } from './helpers';
import { PLAY_ROUND } from './gestures';

/**
 * The test that says the game is a game.
 *
 * It plays all ten scenes, in order, all the way round to scene 1 again, using
 * nothing but synthetic taps and drags — no `finishScene`, no `advanceScene`,
 * no `autoAdvance`. The only debug hooks it reads are the ones that say where
 * the game currently is.
 *
 * Every poll asserts that the 30-second "nobody is playing" rescue has NOT
 * fired. That is what makes the claim honest: each scene was finished by the
 * gestures, not by the safety net carrying the test over the line.
 */
test.describe('hands only', () => {
  test.use({ viewport: { width: PHONE.width, height: PHONE.height } });

  test('plays the whole loop 1 -> 10 -> 1 with taps and drags alone', async ({ page }) => {
    test.setTimeout(900_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const g = geom(PHONE.width, PHONE.height);
    await bootGame(page);
    expect(await page.evaluate(() => window.__kids!.sceneName())).toBe('gather');

    const started = Date.now();
    const seconds: number[] = [];

    // Ten scenes, and then scene 1 again: the eleventh landing is the wrap.
    for (let step = 0; step < SCENE_ORDER.length; step++) {
      const name = SCENE_ORDER[step];
      const sceneStart = Date.now();
      expect(await page.evaluate(() => window.__kids!.sceneName())).toBe(name);

      // Play this scene until the director moves on by itself.
      for (let round = 0; round < 40; round++) {
        const state = await page.evaluate(() => ({
          name: window.__kids!.sceneName(),
          auto: window.__kids!.autoFired(),
        }));
        // The rescue must never be what moved us on.
        expect(state.auto).toBe(false);
        if (state.name !== name) break;
        await PLAY_ROUND[name](page, g);
      }

      // The ending (a run-off, a topple, a sunrise) plays itself out; keep
      // checking that the rescue stayed out of it while it does.
      await page.waitForFunction(
        (current) => window.__kids!.sceneName() !== current,
        name,
        { timeout: 120_000 },
      );
      expect(await page.evaluate(() => window.__kids!.autoFired())).toBe(false);

      const took = (Date.now() - sceneStart) / 1000;
      seconds.push(took);
      // eslint-disable-next-line no-console
      console.log(`scene ${step + 1} ${name}: ${took.toFixed(1)}s`);

      const next = SCENE_ORDER[(step + 1) % SCENE_ORDER.length];
      // The camera is still panning or has just landed; either way the next
      // scene is already the live one, with no blackout in between.
      expect(await page.evaluate(() => window.__kids!.sceneName())).toBe(next);
      await expectWordless(page);
      await page.screenshot({ path: `${SHOT_DIR}/loop-${step + 1}-${name}-handed-over.png` });
    }

    // Round the corner: scene 10 ended in the morning and scene 1 is running
    // again, built from scratch.
    expect(await page.evaluate(() => window.__kids!.sceneName())).toBe('gather');
    expect(await page.evaluate(() => window.__kids!.sceneIndex())).toBe(0);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${SHOT_DIR}/loop-wrapped-to-scene-1.png` });
    await expectWordless(page);

    const total = (Date.now() - started) / 1000;
    // eslint-disable-next-line no-console
    console.log(`full loop by hand: ${total.toFixed(1)}s (${seconds.map((s) => s.toFixed(0)).join(', ')})`);
    expect(errors).toEqual([]);
  });
});
