// @ts-check
/**
 * D. no-text.spec.mjs — the constitution, mechanically enforced (DESIGN.md §0.2, §6.4-D).
 * 1. No visible text nodes in the DOM.
 * 2. Zero fillText/strokeText calls on the canvas across a full playthrough.
 */
import { test, expect } from '@playwright/test';
import { hasApp, hasWorld, ELEMENTS } from './helpers/app.mjs';
import { installTextSpy, textCalls, waitForGame, waitIdle, sleep } from './helpers/gestures.mjs';
import { startGame, enterWorld, playUntilComplete, waitReturnToHearth } from './helpers/flows.mjs';

test.describe('no text', () => {
  test.skip(() => !hasApp(), 'index.html does not exist yet (owned by engineer A)');

  test('the DOM contains no visible text', async ({ page }) => {
    await installTextSpy(page);
    await page.goto('/');
    await waitForGame(page);
    await waitIdle(page);

    const visible = await page.evaluate(() => {
      const found = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const txt = (n.nodeValue || '').trim();
        if (!txt) continue;
        const el = n.parentElement;
        if (!el) continue;
        const tag = el.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'title') continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        found.push(`<${tag}> ${txt.slice(0, 60)}`);
      }
      return found;
    });
    expect(visible, `visible DOM text found:\n${visible.join('\n')}`).toHaveLength(0);

    // Idle hearth must already be text-free.
    await sleep(1500);
    const calls = await textCalls(page);
    expect(calls.total, `canvas text drawn on the hearth:\n${JSON.stringify(calls.samples, null, 2)}`).toBe(0);
  });

  test('zero canvas text across a full playthrough of every world', async ({ page }) => {
    test.setTimeout(5 * 90_000);
    const available = ELEMENTS.filter((e) => hasWorld(e));
    test.skip(available.length === 0, 'no world files exist yet');

    await installTextSpy(page);
    await startGame(page);

    for (const element of available) {
      try {
        await enterWorld(page, element);
        await playUntilComplete(page, element, { attempts: 4, timeout: 60_000 });
        await waitReturnToHearth(page, 30_000);
      } catch (err) {
        throw new Error(`full playthrough stopped in world "${element}".\n${err.message}`);
      }
      const calls = await textCalls(page);
      expect(
        calls.total,
        `canvas text drawn during "${element}":\n${JSON.stringify(calls.samples, null, 2)}`
      ).toBe(0);
    }

    const calls = await textCalls(page);
    expect(calls.fillText).toBe(0);
    expect(calls.strokeText).toBe(0);
  });
});
