// @ts-check
/**
 * E. screenshots.spec.mjs — DESIGN.md §6.4-E.
 * Human review material, not an automatic comparison. Deterministic via
 * `__game.seed(12345)`. Output: tests/__screens__/{project}/{scene}-{phase}.png
 * (git-ignored). Tagged @shots.
 *
 * Phases captured:
 *   hearth-idle            — the hub before anything is touched
 *   <world>-unfinished     — the world right after arrival (nothing done yet)
 *   <world>-mid            — during the gesture
 *   <world>-changed        — right after the world change
 *   hearth-return          — back at the hub with the new mini-diorama
 */
import { test } from '@playwright/test';
import path from 'node:path';
import { hasApp, hasWorld, ELEMENTS, repoRoot } from './helpers/app.mjs';
import { sleep, waitIdle } from './helpers/gestures.mjs';
import { startGame, enterWorld, playUntilComplete, waitReturnToHearth, PLAY } from './helpers/flows.mjs';

const shotDir = (project) => path.join(repoRoot, 'tests', '__screens__', project);

test.describe('screenshots @shots', () => {
  test.skip(() => !hasApp(), 'index.html does not exist yet (owned by engineer A)');
  test.describe.configure({ timeout: 120_000 });

  test('capture every scene phase @shots', async ({ page }, testInfo) => {
    test.setTimeout(6 * 90_000);
    const dir = shotDir(testInfo.project.name);
    const shot = (name) => page.screenshot({ path: path.join(dir, `${name}.png`) });

    await startGame(page, { seed: 12345 });
    await sleep(800);
    await shot('hearth-idle');

    for (const element of ELEMENTS) {
      if (!hasWorld(element)) continue;

      await enterWorld(page, element);
      await sleep(600);
      await shot(`${element}-unfinished`);

      // one pass of the world's gesture, captured while it is happening
      const mid = PLAY[element](page);
      await sleep(700);
      await shot(`${element}-mid`);
      await mid.catch(() => {});

      await playUntilComplete(page, element, { attempts: 4, timeout: 60_000 });
      await sleep(500);
      await shot(`${element}-changed`);

      await waitReturnToHearth(page, 30_000);
      await waitIdle(page);
      await sleep(600);
      await shot('hearth-return');
    }
  });
});
