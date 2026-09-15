import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  PAD_LANDSCAPE,
  PAD_PORTRAIT,
  PHONE,
  SHOT_DIR,
  bootGame,
  drag,
  expectWordless,
  geom,
  jumpToScene,
  waitForPhase,
} from './helpers';
import type { Geom } from './helpers';
import { BUSH_SPOTS } from '../../src/scenes/hideLogic';

test.describe.configure({ mode: 'serial' });

// ---------------------------------------------------------------------------
// Gestures a 4-year-old actually makes
// ---------------------------------------------------------------------------

async function tapRing(page: Page, g: Geom, r: number, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    await page.mouse.click(g.cx + Math.cos(a) * r, g.cy + Math.sin(a) * r);
    await page.waitForTimeout(40);
  }
}

/** A grid of taps over the whole picture: the "poke everything" gesture. */
async function tapGrid(page: Page, g: Geom, cols: number, rows: number): Promise<void> {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = ((c + 0.5) / cols) * g.width;
      const y = ((r + 0.5) / rows) * g.height;
      await page.mouse.click(x, y);
      await page.waitForTimeout(30);
    }
  }
}

/** Sweeps a finger up the screen `n` times, spread across the width. */
async function sweepUp(page: Page, g: Geom, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n) * g.width;
    await drag(page, x, g.height * 0.82, x, g.height * 0.15, 12);
  }
}

/** Sweeps a finger left to right across `n` horizontal bands. */
async function sweepAcross(page: Page, g: Geom, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const y = ((i + 0.5) / n) * g.height;
    await drag(page, g.width * 0.06, y, g.width * 0.94, y, 16);
  }
}

// ---------------------------------------------------------------------------
// The ten scenes
// ---------------------------------------------------------------------------

interface SceneCase {
  name: string;
  /** Phases that count as "this scene has reached its ending". */
  end: string[];
  /** What a child does here. */
  play: (page: Page, g: Geom) => Promise<void>;
  /** False where the idle world moves the progress number around by itself. */
  strictProgress?: boolean;
}

const SCENES: SceneCase[] = [
  {
    name: 'gather',
    end: ['clapping', 'running', 'done'],
    play: async (page, g) => {
      for (const [x, y] of [
        [g.width * 0.1, g.height * 0.12],
        [g.width * 0.9, g.height * 0.12],
        [g.width * 0.1, g.height * 0.88],
        [g.width * 0.9, g.height * 0.88],
      ]) {
        await drag(page, x, y, g.cx, g.cy, 14);
      }
      await tapRing(page, g, Math.min(g.width, g.height) * 0.28, 8);
    },
  },
  {
    name: 'march',
    end: ['running', 'done'],
    // Stroking the line along the path is the whole interaction.
    play: async (page, g) => {
      for (let i = 0; i < 4; i++) await sweepAcross(page, g, 3);
    },
  },
  {
    name: 'tickle',
    end: ['tumbling', 'done'],
    play: async (page, g) => {
      await tapGrid(page, g, 3, 4);
      await sweepAcross(page, g, 2);
    },
  },
  {
    name: 'ballpit',
    end: ['overflow', 'running', 'done'],
    play: async (page, g) => {
      await tapRing(page, g, Math.min(g.width, g.height) * 0.22, 8);
      await drag(page, g.width * 0.08, g.cy, g.cx, g.cy, 14);
    },
  },
  {
    name: 'butterfly',
    end: ['running', 'done'],
    // The butterfly comes to the finger; leading it to the edge is the game.
    play: async (page, g) => {
      await drag(page, g.cx, g.cy, g.width * 0.9, g.cy - g.height * 0.08, 26);
      await page.waitForTimeout(300);
    },
    strictProgress: false,
  },
  {
    name: 'slide',
    end: ['running', 'done'],
    // A tap puts a kid on the ladder; climbing up and sliding down takes a
    // couple of seconds, so the taps are spaced out to let the queue move.
    play: async (page, g) => {
      for (let round = 0; round < 3; round++) {
        await tapGrid(page, g, 3, 3);
        await page.waitForTimeout(2200);
      }
    },
  },
  {
    name: 'hide',
    end: ['running', 'done'],
    // Tap the bushes themselves, exactly where the scene drew them.
    play: async (page, g) => {
      for (const [wx, wy] of BUSH_SPOTS) {
        await page.mouse.click(g.cx + wx * g.scale, g.cy + wy * g.scale);
        await page.waitForTimeout(90);
      }
    },
  },
  {
    name: 'balloon',
    end: ['away', 'done'],
    play: async (page, g) => {
      await sweepUp(page, g, 4);
      await tapGrid(page, g, 3, 3);
    },
  },
  {
    name: 'tower',
    end: ['topple', 'running', 'done'],
    play: async (page, g) => {
      for (let i = 0; i < 3; i++) {
        await page.mouse.click(g.cx - g.width * 0.28, g.cy + g.height * 0.1);
        await page.waitForTimeout(800);
      }
    },
  },
  {
    name: 'sleep',
    end: ['morning'],
    play: async (page, g) => {
      await tapGrid(page, g, 3, 3);
    },
  },
];

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
        await scene.play(page, g);
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
