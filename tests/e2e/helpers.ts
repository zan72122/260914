import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SCENE_ORDER } from '../../src/scenes/order';

export { SCENE_ORDER };

/** Device viewports from the plan: iPhone, iPad portrait, iPad landscape. */
export const VIEWPORTS = [
  { name: 'iphone-390x844', width: 390, height: 844 },
  { name: 'ipad-1024x1366-portrait', width: 1024, height: 1366 },
  { name: 'ipad-1366x1024-landscape', width: 1366, height: 1024 },
] as const;

/**
 * The two devices every scene is photographed on, plus the third that only
 * some of them are: the plan asks for iPhone portrait and iPad landscape
 * everywhere, and iPad portrait on at least three scenes.
 */
export const PHONE = VIEWPORTS[0];
export const PAD_PORTRAIT = VIEWPORTS[1];
export const PAD_LANDSCAPE = VIEWPORTS[2];

export interface Geom {
  width: number;
  height: number;
  cx: number;
  cy: number;
  /** World -> screen scale: the short axis is exactly 1000 world units. */
  scale: number;
}

export function geom(width: number, height: number): Geom {
  return { width, height, cx: width / 2, cy: height / 2, scale: Math.min(width, height) / 1000 };
}

/** World coordinates -> CSS pixels, the same mapping `core/viewport.ts` uses. */
export function toScreen(g: Geom, wx: number, wy: number): [number, number] {
  return [g.cx + wx * g.scale, g.cy + wy * g.scale];
}

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
  gotoScene: (index: number) => void;
  sceneCount: () => number;
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

/**
 * Lands straight on a scene by name (debug hook, screenshots only). The game
 * itself never does this; it is here so photographing scene 10 does not mean
 * sitting through nine transitions first.
 */
export async function jumpToScene(page: Page, name: string): Promise<void> {
  const index = SCENE_ORDER.indexOf(name as (typeof SCENE_ORDER)[number]);
  expect(index).toBeGreaterThanOrEqual(0);
  await page.evaluate((i) => window.__kids!.gotoScene(i), index);
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.__kids!.sceneName())).toBe(name);
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
