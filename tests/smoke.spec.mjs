// @ts-check
/**
 * A. smoke.spec.mjs — DESIGN.md §6.4-A. Runs on all 4 device projects.
 */
import { test, expect } from '@playwright/test';
import { waitForGame, waitIdle, hitPoints, collectConsoleErrors, sleep } from './helpers/gestures.mjs';
import { hasApp } from './helpers/app.mjs';

/** Harness self-check: proves the runner, CDP touch plumbing and projects work
 *  even before index.html exists. */
test.describe('harness sanity', () => {
  test('runner + CDP touch session work against about:blank', async ({ page }) => {
    await page.goto('about:blank');
    await page.setContent(`<body style="margin:0"><div id="t" style="width:100vw;height:100vh"></div>
      <script>
        window.__ev = [];
        for (const n of ['touchstart','touchmove','touchend'])
          document.addEventListener(n, e => window.__ev.push(n), {passive:true});
      </script></body>`);
    const { tap, drag } = await import('./helpers/gestures.mjs');
    await tap(page, 30, 40);
    await drag(page, { x: 30, y: 40 }, { x: 120, y: 160 }, { steps: 6, ms: 120 });
    const ev = await page.evaluate(() => window.__ev);
    expect(ev).toContain('touchstart');
    expect(ev).toContain('touchmove');
    expect(ev).toContain('touchend');
  });
});

test.describe('smoke', () => {
  test.skip(() => !hasApp(), 'index.html does not exist yet (owned by engineer A)');

  test('boots, fills the viewport, does not scroll, no console errors', async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);

    await page.goto('/');
    // 1. ready within 5s
    await waitForGame(page, 5_000);

    // 2. the page never scrolls
    const scroll = await page.evaluate(() => ({
      sh: document.body.scrollHeight,
      ih: window.innerHeight,
      sw: document.body.scrollWidth,
      iw: window.innerWidth,
    }));
    expect(Math.abs(scroll.sh - scroll.ih)).toBeLessThanOrEqual(1);
    expect(Math.abs(scroll.sw - scroll.iw)).toBeLessThanOrEqual(1);

    // 3. the canvas covers the viewport (+-1px)
    const rect = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, iw: window.innerWidth, ih: window.innerHeight };
    });
    expect(rect, 'a <canvas> must exist').not.toBeNull();
    expect(Math.abs(rect.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(rect.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(rect.w - rect.iw)).toBeLessThanOrEqual(1);
    expect(Math.abs(rect.h - rect.ih)).toBeLessThanOrEqual(1);

    // 6. no console errors
    expect(errors, `console errors:\n${errors.join('\n')}`).toHaveLength(0);
    testInfo.annotations.push({ type: 'scene', description: await page.evaluate(() => window.__game.sceneId) });
  });

  test('hit points stay inside the viewport and inside the safe area after rotation', async ({ page }) => {
    await page.goto('/');
    await waitForGame(page, 5_000);
    await waitIdle(page);

    const vp = page.viewportSize();
    const rotated = { width: vp.height, height: vp.width };

    const insets = await page.evaluate(() => {
      const d = document.createElement('div');
      d.style.cssText =
        'position:fixed;left:0;top:0;padding:env(safe-area-inset-top) env(safe-area-inset-right)' +
        ' env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;';
      document.body.appendChild(d);
      const cs = getComputedStyle(d);
      const o = {
        top: parseFloat(cs.paddingTop) || 0,
        right: parseFloat(cs.paddingRight) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0,
      };
      d.remove();
      return o;
    });

    const checkAll = async (size, label) => {
      // 4 + 5: every touch target is on-screen and inside inset + 8px.
      await expect
        .poll(
          async () => {
            const pts = await hitPoints(page);
            if (!pts.length) return 'no-hit-points';
            const pad = 8;
            const bad = pts.filter(
              (p) =>
                p.x < insets.left + pad ||
                p.y < insets.top + pad ||
                p.x > size.width - insets.right - pad ||
                p.y > size.height - insets.bottom - pad
            );
            return bad.length ? JSON.stringify(bad) : 'ok';
          },
          { message: `hit points out of bounds (${label})`, timeout: 10_000 }
        )
        .toBe('ok');
    };

    await checkAll(vp, 'initial');

    await page.setViewportSize(rotated);
    await sleep(1000); // the engine debounces relayout by 100ms (§5.2)
    await waitIdle(page);
    await checkAll(rotated, 'rotated');
  });

  test('sustains < 20ms average frame time for 3s', async ({ page }) => {
    await page.goto('/');
    await waitForGame(page, 5_000);
    await waitIdle(page);

    const f0 = await page.evaluate(() => window.__game.frameCount);
    const t0 = Date.now();
    await sleep(3000);
    const f1 = await page.evaluate(() => window.__game.frameCount);
    const elapsed = Date.now() - t0;

    const frames = f1 - f0;
    expect(frames, 'the render loop must be running').toBeGreaterThan(30);
    const avgMs = elapsed / frames;
    expect(avgMs).toBeLessThan(20);
  });
});
