import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Device viewports from the plan: iPhone, iPad portrait, iPad landscape. */
export const VIEWPORTS = [
  { name: 'iphone-390x844', width: 390, height: 844 },
  { name: 'ipad-1024x1366-portrait', width: 1024, height: 1366 },
  { name: 'ipad-1366x1024-landscape', width: 1366, height: 1024 },
] as const;

export const SHOT_DIR = 'tests/e2e/__screenshots__';

export interface KidsHooks {
  ready: boolean;
  textCount: () => number;
  kidCount: () => number;
  sceneName: () => string;
  sceneIndex: () => number;
  sceneProgress: () => number;
  scenePhase: () => string;
  panning: () => boolean;
  autoFired: () => boolean;
  advanceScene: () => void;
  finishScene: () => void;
  idleHint: () => void;
  autoAdvance: () => void;
  fps: () => number;
}

declare global {
  interface Window {
    __kids?: KidsHooks;
  }
}

export async function bootGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.__kids?.ready === true, undefined, { timeout: 30_000 });
  // Let the world settle so the screenshots show a living scene.
  await page.waitForTimeout(1200);
}

/** Visible text nodes anywhere in the DOM (the <title> is not rendered). */
export async function domTextNodes(page: Page): Promise<string[]> {
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

/**
 * The wordless charter, re-checked in every scene: no DOM text, no Pixi text
 * objects, and no buttons, links or form controls anywhere.
 */
export async function expectWordless(page: Page): Promise<void> {
  expect(await domTextNodes(page)).toEqual([]);
  expect(await page.evaluate(() => window.__kids!.textCount())).toBe(0);
  expect(await page.locator('button, a, input, select, textarea').count()).toBe(0);
}

/** Walks the director forward until `name` is the live scene. */
export async function gotoScene(page: Page, name: string): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const current = await page.evaluate(() => window.__kids!.sceneName());
    if (current === name) break;
    await page.evaluate(() => window.__kids!.advanceScene());
    await page.waitForTimeout(1800);
  }
  expect(await page.evaluate(() => window.__kids!.sceneName())).toBe(name);
  await page.waitForTimeout(600);
}

/** Waits until the live scene reports one of `phases`. */
export async function waitForPhase(page: Page, phases: string[], timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    (want) => want.includes(window.__kids!.scenePhase()),
    phases,
    { timeout },
  );
}

/** A slow drag: presses at (x0,y0), moves to (x1,y1) over `steps`, releases. */
export async function drag(
  page: Page,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  steps = 14,
): Promise<void> {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
    await page.waitForTimeout(18);
  }
  await page.mouse.up();
}
