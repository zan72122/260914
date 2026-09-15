import { expect, test } from '@playwright/test';
import { SHOT_DIR, VIEWPORTS, bootGame, expectWordless, gotoScene } from './helpers';

/**
 * The charter checks (§2 of the plan): every scene, on every device, must show
 * zero text, zero buttons, and must react to any touch at all.
 */
for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('boots wordless and reacts to every touch', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('pageerror', (e) => consoleErrors.push(String(e)));
      await bootGame(page);

      // The crowd is actually simulated.
      expect(await page.evaluate(() => window.__kids!.kidCount())).toBeGreaterThan(20);
      await expectWordless(page);

      const cx = vp.width / 2;
      const cy = vp.height / 2;
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(300);
      await expectWordless(page);

      // A drag: press, move a long way, release.
      await page.mouse.move(cx - 120, cy - 80);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(cx - 120 + i * 20, cy - 80 + i * 10);
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
      await page.waitForTimeout(400);
      await expectWordless(page);

      // ...and the second scene has to be just as wordless as the first.
      await gotoScene(page, 'ballpit');
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(400);
      await expectWordless(page);
      expect(consoleErrors).toEqual([]);
    });
  });
}

test.describe('multi-touch', () => {
  test.use({ viewport: { width: 1024, height: 1366 }, hasTouch: true });

  test('two fingers at once do not conflict', async ({ page }) => {
    await bootGame(page);
    const before = await page.evaluate(() => window.__kids!.kidCount());
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: 300, y: 500, id: 1 },
        { x: 700, y: 900, id: 2 },
      ],
    });
    await page.waitForTimeout(150);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: 360, y: 560, id: 1 },
        { x: 640, y: 840, id: 2 },
      ],
    });
    await page.waitForTimeout(150);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOT_DIR}/ipad-multitouch.png` });
    await expectWordless(page);
    expect(await page.evaluate(() => window.__kids!.kidCount())).toBe(before);
  });
});

test.describe('rotation', () => {
  test.use({ viewport: { width: 1024, height: 1366 } });

  test('survives an orientation change without restarting', async ({ page }) => {
    await bootGame(page);
    const before = await page.evaluate(() => window.__kids!.kidCount());
    await page.setViewportSize({ width: 1366, height: 1024 });
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.__kids!.kidCount())).toBe(before);
    await expectWordless(page);
    await page.screenshot({ path: `${SHOT_DIR}/ipad-rotated.png` });
  });
});

test.describe('transitions', () => {
  test.use({ viewport: { width: 1024, height: 1366 } });

  test('runs the two scenes in order and wraps around, with no blackout', async ({ page }) => {
    await bootGame(page);
    expect(await page.evaluate(() => window.__kids!.sceneName())).toBe('gather');
    // End scene 1 the way the game does: the crowd runs off to the right and
    // the camera follows them into the next scene.
    await page.evaluate(() => window.__kids!.finishScene());
    // Mid-pan both worlds are on screen at once: the camera moves, nothing cuts.
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => window.__kids!.panning())).toBe(true);
    await page.screenshot({ path: `${SHOT_DIR}/transition-pan.png` });
    await expectWordless(page);
    await page.waitForTimeout(1400);
    expect(await page.evaluate(() => window.__kids!.panning())).toBe(false);
    expect(await page.evaluate(() => window.__kids!.sceneName())).toBe('ballpit');
    expect(await page.evaluate(() => window.__kids!.sceneIndex())).toBe(1);

    await page.evaluate(() => window.__kids!.advanceScene());
    await page.waitForTimeout(2200);
    expect(await page.evaluate(() => window.__kids!.sceneName())).toBe('gather');
    expect(await page.evaluate(() => window.__kids!.sceneIndex())).toBe(0);
    await expectWordless(page);
  });
});
