import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Device viewports from the plan: iPhone, iPad portrait, iPad landscape. */
const VIEWPORTS = [
  { name: 'iphone-390x844', width: 390, height: 844 },
  { name: 'ipad-1024x1366-portrait', width: 1024, height: 1366 },
  { name: 'ipad-1366x1024-landscape', width: 1366, height: 1024 },
] as const;

const SHOT_DIR = 'tests/e2e/__screenshots__';

interface KidsHooks {
  ready: boolean;
  textCount: () => number;
  kidCount: () => number;
  fps: () => number;
}

declare global {
  interface Window {
    __kids?: KidsHooks;
  }
}

async function bootGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__kids?.ready === true, undefined, { timeout: 30_000 });
  // Let the crowd settle so the screenshots show a living playground.
  await page.waitForTimeout(1500);
}

/** Visible text nodes anywhere in the DOM (the <title> is not rendered). */
async function domTextNodes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const t = (node.nodeValue ?? '').trim();
      if (t.length > 0) found.push(t);
      node = walker.nextNode();
    }
    return found;
  });
}

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('boots wordless and reacts to every touch', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('pageerror', (e) => consoleErrors.push(String(e)));
      await bootGame(page);

      // The crowd is actually simulated.
      expect(await page.evaluate(() => window.__kids!.kidCount())).toBe(120);

      // Charter: zero text. No DOM text nodes...
      expect(await domTextNodes(page)).toEqual([]);
      // ...and no Pixi Text / BitmapText objects on the stage.
      expect(await page.evaluate(() => window.__kids!.textCount())).toBe(0);

      // No buttons, inputs or links either - there is no UI at all.
      expect(await page.locator('button, a, input, select, textarea').count()).toBe(0);

      await page.screenshot({ path: `${SHOT_DIR}/${vp.name}-idle.png` });

      // A tap anywhere must be handled without error and stay wordless.
      const cx = vp.width / 2;
      const cy = vp.height / 2;
      await page.mouse.click(cx, cy);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOT_DIR}/${vp.name}-tap.png` });

      // A drag: press, move a long way, release.
      await page.mouse.move(cx - 120, cy - 80);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(cx - 120 + i * 20, cy - 80 + i * 10);
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOT_DIR}/${vp.name}-drag.png` });

      expect(await page.evaluate(() => window.__kids!.textCount())).toBe(0);
      expect(await domTextNodes(page)).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
}

test.describe('multi-touch', () => {
  test.use({ viewport: { width: 1024, height: 1366 }, hasTouch: true });

  test('two fingers at once do not conflict', async ({ page }) => {
    await bootGame(page);
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
    expect(await page.evaluate(() => window.__kids!.textCount())).toBe(0);
    expect(await page.evaluate(() => window.__kids!.kidCount())).toBe(120);
  });
});

test.describe('rotation', () => {
  test.use({ viewport: { width: 1024, height: 1366 } });

  test('survives an orientation change without restarting', async ({ page }) => {
    await bootGame(page);
    await page.setViewportSize({ width: 1366, height: 1024 });
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.__kids!.kidCount())).toBe(120);
    expect(await page.evaluate(() => window.__kids!.textCount())).toBe(0);
    await page.screenshot({ path: `${SHOT_DIR}/ipad-rotated.png` });
  });
});
