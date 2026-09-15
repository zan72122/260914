import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  PAD_LANDSCAPE,
  PAD_PORTRAIT,
  PHONE,
  SHOT_DIR,
  bootGame,
  expectWordless,
  geom,
  jumpToScene,
  waitForPhase,
} from './helpers';
import type { Geom } from './helpers';
import { PLAY_ROUND } from './gestures';

test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// The ten scenes
// ---------------------------------------------------------------------------

interface SceneCase {
  name: string;
  /** Phases that count as "this scene has reached its ending". */
  end: string[];
  /** How many rounds of this scene's own gesture to play before the photo. */
  rounds?: number;
  /** False where the idle world moves the progress number around by itself. */
  strictProgress?: boolean;
}

const SCENES: SceneCase[] = [
  { name: 'gather', end: ['clapping', 'running', 'done'] },
  { name: 'march', end: ['running', 'done'], rounds: 4 },
  { name: 'tickle', end: ['tumbling', 'done'] },
  { name: 'ballpit', end: ['overflow', 'running', 'done'] },
  { name: 'butterfly', end: ['running', 'done'], strictProgress: false },
  { name: 'slide', end: ['running', 'done'], rounds: 3 },
  { name: 'hide', end: ['running', 'done'] },
  { name: 'balloon', end: ['away', 'done'] },
  { name: 'tower', end: ['topple', 'running', 'done'] },
  { name: 'sleep', end: ['morning'] },
];

/** Plays a scene's own gesture the stated number of times. */
async function play(page: Page, g: Geom, scene: SceneCase): Promise<void> {
  for (let i = 0; i < (scene.rounds ?? 1); i++) await PLAY_ROUND[scene.name](page, g);
}

/** iPad portrait only needs three scenes; these are the three. */
const PORTRAIT_SCENES = new Set(['gather', 'hide', 'sleep']);

for (const vp of [PHONE, PAD_LANDSCAPE, PAD_PORTRAIT]) {
  const g = geom(vp.width, vp.height);

  test.describe(`${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const scene of SCENES) {
      if (vp === PAD_PORTRAIT && !PORTRAIT_SCENES.has(scene.name)) continue;

      test(`${scene.name}: idle, hands, ending`, async ({ page }) => {
        test.setTimeout(150_000);
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        await bootGame(page);
        await jumpToScene(page, scene.name);

        // --- idle: the world invites, wordlessly, before anyone touches it.
        await expectWordless(page);
        expect(await page.evaluate(() => window.__kids!.kidCount())).toBeGreaterThan(15);
        const before = await page.evaluate(() => window.__kids!.sceneProgress());
        await page.screenshot({ path: `${SHOT_DIR}/${scene.name}-${vp.name}-idle.png` });

        // --- the 8-12s hint has to be wordless and harmless too.
        await page.evaluate(() => window.__kids!.idleHint());
        await page.waitForTimeout(400);
        await expectWordless(page);

        // --- hands: taps and drags only, and something must happen.
        await play(page, g, scene);
        await page.waitForTimeout(700);
        const after = await page.evaluate(() => ({
          name: window.__kids!.sceneName(),
          progress: window.__kids!.sceneProgress(),
        }));
        // Some scenes are finished off by this handful of gestures alone, and
        // the director has already moved on. That is a pass, not a failure.
        const finishedByHand = after.name !== scene.name;
        if (!finishedByHand && scene.strictProgress !== false) {
          expect(after.progress).toBeGreaterThan(before);
        }
        await expectWordless(page);
        await page.screenshot({ path: `${SHOT_DIR}/${scene.name}-${vp.name}-tap.png` });

        // --- ending: the 30s rescue finishes whatever is left, in world.
        if (finishedByHand) await jumpToScene(page, scene.name);
        await page.evaluate(() => window.__kids!.autoAdvance());
        await waitForPhase(page, scene.end, 60_000);
        await page.waitForTimeout(scene.name === 'sleep' ? 1800 : 400);
        await page.screenshot({ path: `${SHOT_DIR}/${scene.name}-${vp.name}-done.png` });
        await expectWordless(page);
        expect(await page.evaluate(() => window.__kids!.sceneProgress())).toBeGreaterThan(before);
        expect(errors).toEqual([]);
      });
    }
  });
}
