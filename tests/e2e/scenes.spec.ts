import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  SHOT_DIR,
  VIEWPORTS,
  bootGame,
  drag,
  expectWordless,
  gotoScene,
  waitForPhase,
} from './helpers';

test.describe.configure({ mode: 'serial' });

/** Taps in a ring of `n` points of screen radius `r` around the centre. */
async function tapRing(page: Page, cx: number, cy: number, r: number, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    await page.mouse.click(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    await page.waitForTimeout(40);
  }
}

for (const vp of VIEWPORTS) {
  const cx = vp.width / 2;
  const cy = vp.height / 2;
  const unit = Math.min(vp.width, vp.height); // the world scale is 1000 units per short axis

  test.describe(`${vp.name} scenes`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('scene 1 gather: idle, taps, completion', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await bootGame(page);
      expect(await page.evaluate(() => window.__kids!.sceneName())).toBe('gather');

      // Idle: one kid waving in the middle, everybody else scattered.
      await expectWordless(page);
      expect(await page.evaluate(() => window.__kids!.sceneProgress())).toBeLessThan(0.3);
      await page.screenshot({ path: `${SHOT_DIR}/gather-${vp.name}-idle.png` });

      // Taps and a drag: kids come over.
      await tapRing(page, cx, cy, unit * 0.3, 8);
      await drag(page, cx + unit * 0.36, cy - unit * 0.2, cx + unit * 0.06, cy);
      await page.waitForTimeout(1400);
      await expectWordless(page);
      await page.screenshot({ path: `${SHOT_DIR}/gather-${vp.name}-tap.png` });

      // Completion: everyone gathers, then the whole crowd claps.
      await page.evaluate(() => window.__kids!.autoAdvance());
      await waitForPhase(page, ['clapping', 'running', 'done']);
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${SHOT_DIR}/gather-${vp.name}-done.png` });
      await expectWordless(page);
      expect(await page.evaluate(() => window.__kids!.sceneProgress())).toBeGreaterThan(0.75);
      expect(errors).toEqual([]);
    });

    test('scene 4 ball pit: idle, taps, completion', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await bootGame(page);
      await gotoScene(page, 'ballpit');

      // Idle: balls bouncing, kids around the rim.
      await expectWordless(page);
      expect(await page.evaluate(() => window.__kids!.sceneProgress())).toBe(0);
      await page.screenshot({ path: `${SHOT_DIR}/ballpit-${vp.name}-idle.png` });

      // The idle hint has to be harmless and wordless too.
      await page.evaluate(() => window.__kids!.idleHint());
      await page.waitForTimeout(400);
      await expectWordless(page);

      // Taps around the rim + a drag into the pit: kids jump in.
      await tapRing(page, cx, cy, unit * 0.22, 6);
      await drag(page, cx - unit * 0.34, cy, cx, cy);
      await page.waitForTimeout(1200);
      expect(await page.evaluate(() => window.__kids!.sceneProgress())).toBeGreaterThan(0);
      await page.screenshot({ path: `${SHOT_DIR}/ballpit-${vp.name}-tap.png` });
      await expectWordless(page);

      // Completion: the last kids go in by themselves and the pit overflows.
      await page.evaluate(() => window.__kids!.autoAdvance());
      await waitForPhase(page, ['overflow', 'running', 'done'], 45_000);
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${SHOT_DIR}/ballpit-${vp.name}-done.png` });
      await expectWordless(page);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('hands only', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  // Playing a scene by hand takes a while: many small synthetic gestures.
  test.setTimeout(120_000);

  /**
   * The one test that proves the scene is actually playable: no debug hooks,
   * no auto-advance — just taps and drags, exactly what a 4-year-old does.
   */
  test('scene 1 can be completed with taps and drags alone', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await bootGame(page);
    expect(await page.evaluate(() => window.__kids!.sceneName())).toBe('gather');

    const cx = 195;
    const cy = 422;
    const started = Date.now();
    // What a child actually does: sweep a finger across the picture, over and
    // over, towards the kid who is waving. Each sweep drags whoever it passes.
    const sweeps: [number, number, number, number][] = [
      [40, 60, cx, cy],
      [195, 40, cx, cy],
      [350, 60, cx, cy],
      [40, 800, cx, cy],
      [195, 810, cx, cy],
      [350, 800, cx, cy],
      [30, 250, cx, cy],
      [360, 250, cx, cy],
      [30, 600, cx, cy],
      [360, 600, cx, cy],
    ];
    for (let round = 0; round < 3; round++) {
      for (const [x0, y0, x1, y1] of sweeps) {
        await drag(page, x0, y0, x1, y1, 16);
        if ((await page.evaluate(() => window.__kids!.scenePhase())) !== 'scatter') break;
      }
      await tapRing(page, cx, cy, 120, 8);
      await page.waitForTimeout(800);
      if ((await page.evaluate(() => window.__kids!.scenePhase())) !== 'scatter') break;
    }
    await page.waitForFunction(() => window.__kids!.scenePhase() !== 'scatter', undefined, {
      timeout: 20_000,
    });
    // The 30s "nobody is playing" rescue never ran: every gesture resets that
    // timer, so the crowd gathered because of the gestures and nothing else.
    expect(await page.evaluate(() => window.__kids!.autoFired())).toBe(false);
    expect(Date.now() - started).toBeLessThan(90_000);
    await page.screenshot({ path: `${SHOT_DIR}/gather-hands-only-complete.png` });
    await expectWordless(page);

    // ...and it carries on into the ball pit by itself.
    await page.waitForFunction(() => window.__kids!.sceneName() === 'ballpit', undefined, {
      timeout: 20_000,
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOT_DIR}/gather-hands-only-next-scene.png` });
    await expectWordless(page);
    expect(errors).toEqual([]);
  });
});
