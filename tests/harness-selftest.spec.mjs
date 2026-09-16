// @ts-check
/**
 * Harness self-test. Runs against tests/fixtures/stub.html — a minimal fake
 * implementation of the window.__game contract — so the gesture helpers and the
 * __game bridge are proven correct independently of the real game.
 * If these fail, the bug is in tests/, not in src/.
 */
import { test, expect } from '@playwright/test';
import {
  tap, sloppyTap, longPress, drag, trace, circle,
  waitForGame, waitIdle, hit, hitPoints, installTextSpy, textCalls,
} from './helpers/gestures.mjs';

const STUB = '/tests/fixtures/stub.html';

test.describe('harness self-test', () => {
  test('bridge: ready / idle / hitPoints / hit by id and prefix', async ({ page }) => {
    await page.goto(STUB);
    await waitForGame(page);
    await waitIdle(page);

    const pts = await hitPoints(page);
    expect(pts.length).toBeGreaterThan(5);

    const flame = await hit(page, 'flame');
    expect(flame.id).toBe('flame');

    const anyDish = await hit(page, 'dish:'); // prefix lookup
    expect(anyDish.id.startsWith('dish:')).toBe(true);
  });

  test('tap and sloppyTap deliver a down/up pair', async ({ page }) => {
    await page.goto(STUB);
    await waitForGame(page);
    const p = await hit(page, 'dish:lithium');
    await tap(page, p.x, p.y);
    await sloppyTap(page, p.x, p.y);
    const log = await page.evaluate(() => window.__log);
    expect(log.down).toBe(2);
    expect(log.up).toBe(2);
    expect(log.move, 'sloppyTap must smear with 4 distinct moves').toBeGreaterThanOrEqual(4);
  });

  test('longPress holds for the requested duration', async ({ page }) => {
    await page.goto(STUB);
    await waitForGame(page);
    const p = await hit(page, 'flame');
    await longPress(page, p.x, p.y, 900);
    const log = await page.evaluate(() => window.__log);
    expect(log.holdMs).toBeGreaterThan(800);
    expect(log.holdMs).toBeLessThan(2500);
  });

  test('drag walks from start to target with jitter', async ({ page }) => {
    await page.goto(STUB);
    await waitForGame(page);
    const from = await hit(page, 'dish:lithium');
    const to = await hit(page, 'flame');
    await drag(page, { x: from.x, y: from.y }, { x: to.x, y: to.y }, { steps: 20, jitter: 8, ms: 400 });
    const log = await page.evaluate(() => window.__log);
    expect(log.move).toBeGreaterThanOrEqual(18);
    const last = log.points[log.points.length - 1];
    expect(Math.hypot(last[0] - to.x, last[1] - to.y)).toBeLessThan(3);
  });

  test('trace follows the path but deliberately deviates from it', async ({ page }) => {
    await page.goto(STUB);
    await waitForGame(page);
    const path = await page.evaluate(() => window.__game.state.tracePath);
    await trace(page, path, { steps: 30, jitter: 40, ms: 600 });
    const log = await page.evaluate(() => window.__log);
    // measure max perpendicular distance from the straight ideal path
    const [a, b] = path;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const dev = Math.max(
      ...log.points.map(([x, y]) => Math.abs((b.x - a.x) * (a.y - y) - (a.x - x) * (b.y - a.y)) / len)
    );
    expect(dev).toBeGreaterThan(10); // it really does wander off-path
    expect(log.move).toBeGreaterThan(20);
  });

  test('circle accumulates the requested turns even with reversals', async ({ page }) => {
    await page.goto(STUB);
    await waitForGame(page);
    const c = await hit(page, 'circle:center');
    await circle(page, { x: c.x, y: c.y }, {
      radiusPx: 80, turns: 3, steps: 60, jitter: 6, reversals: 2, ms: 1500,
    });
    const log = await page.evaluate(() => window.__log);
    // |Δθ| accumulation (the barium rule) must clear 2.5 turns
    expect(log.turns).toBeGreaterThan(2.5);
  });

  test('the fillText spy actually catches canvas text', async ({ page }) => {
    await installTextSpy(page);
    await page.goto(STUB + '#text'); // the stub draws one glyph per frame here
    await waitForGame(page);
    await expect.poll(async () => (await textCalls(page)).total, { timeout: 5_000 }).toBeGreaterThan(0);

    // ...and reports zero when nothing draws text
    const page2 = await page.context().newPage();
    await installTextSpy(page2);
    await page2.goto(STUB);
    await waitForGame(page2);
    await page2.waitForTimeout(500);
    expect((await textCalls(page2)).total).toBe(0);
  });
});
