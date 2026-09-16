import { test, expect } from '@playwright/test';
import {
  IPHONE_PORTRAIT, IPAD_LANDSCAPE, collectErrors, openGame, snapshot,
  waitFor, setTimeScale, drag,
} from './helpers.js';

const VIEWPORTS = [
  ['iPhone portrait', IPHONE_PORTRAIT],
  ['iPad landscape', IPAD_LANDSCAPE],
];

for (const [name, vp] of VIEWPORTS) {
  test(`${name}: loads clean, canvas fills the viewport, no visible text`, async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page, vp);
    await page.waitForTimeout(700);

    const box = await page.locator('#c').boundingBox();
    expect(Math.round(box.width)).toBe(vp.width);
    expect(Math.round(box.height)).toBe(vp.height);
    expect(Math.round(box.x)).toBe(0);
    expect(Math.round(box.y)).toBe(0);

    const text = await page.evaluate(() => (document.body.innerText || '').trim());
    expect(text).toBe('');

    const canvasPixels = await page.evaluate(() => {
      const c = document.getElementById('c');
      return { w: c.width, h: c.height };
    });
    expect(canvasPixels.w).toBeGreaterThan(0);

    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('weather reaches WIND within ~8 seconds', async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page, IPHONE_PORTRAIT);
  const started = Date.now();
  const order = ['CALM', 'FIRST_DROP', 'SPOT', 'WIND', 'RAIN_RAMP'];
  const seen = new Set();
  await waitFor(page, (s) => {
    seen.add(s.state);
    return order.indexOf(s.state) >= order.indexOf('WIND');
  }, 12000, 'WIND');
  const elapsed = (Date.now() - started) / 1000;
  expect(elapsed).toBeLessThan(8.5);
  expect(seen.has('FIRST_DROP')).toBe(true);
  expect(seen.has('SPOT')).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('canvas text APIs are never used', async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page, IPHONE_PORTRAIT, {
    initScript: () => {
      const boom = function () { throw new Error('text drawn on canvas'); };
      CanvasRenderingContext2D.prototype.fillText = boom;
      CanvasRenderingContext2D.prototype.strokeText = boom;
      window.__textCalls = 0;
    },
  });
  await setTimeScale(page, 4);
  await waitFor(page, (s) => s.state === 'RAIN_RAMP', 20000, 'RAIN_RAMP');
  await drag(page, IPHONE_PORTRAIT.width * 0.2, 300, IPHONE_PORTRAIT.width * 0.2, 430);
  await page.waitForTimeout(800);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('rotating mid-drag neither throws nor loses state', async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page, IPHONE_PORTRAIT, { timeScale: 3 });
  await waitFor(page, (s) => s.state === 'WIND' || s.state === 'RAIN_RAMP', 20000, 'wind');

  const before = await snapshot(page);
  const item = before.items[0];
  await page.mouse.move(item.x, item.y);
  await page.mouse.down();
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(item.x, item.y + i * 8);
    await page.waitForTimeout(16);
  }
  // rotate while the finger is still down
  await page.setViewportSize(IPAD_LANDSCAPE);
  await page.waitForTimeout(150);
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(item.x + i * 14, item.y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(300);

  const after = await snapshot(page);
  expect(after.orientation).toBe('landscape');
  expect(after.items.length).toBe(5);
  expect(['WIND', 'RAIN_RAMP', 'EMPTY_LINE']).toContain(after.state);
  // rain keeps going, it does not reset
  expect(after.rain).toBeGreaterThanOrEqual(before.rain - 0.01);

  // and it is still playable afterwards
  await page.setViewportSize(IPHONE_PORTRAIT);
  await page.waitForTimeout(200);
  const s = await snapshot(page);
  const it = s.items.find((x) => x.state === 'HANGING');
  expect(it).toBeTruthy();
  await drag(page, it.x, it.y, it.x, it.y + 170);
  await page.waitForTimeout(300);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('visibilitychange does not fast-forward the rain', async ({ page }) => {
  await openGame(page, IPHONE_PORTRAIT);
  await waitFor(page, (s) => s.state === 'RAIN_RAMP', 20000, 'RAIN_RAMP');
  const before = await snapshot(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(200);
  const after = await snapshot(page);
  expect(after.rain - before.rain).toBeLessThan(0.25);
});
