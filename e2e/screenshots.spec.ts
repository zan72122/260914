import { expect, test, type Page } from '@playwright/test';

const VIEWPORTS = [
  { name: 'iphone-portrait', width: 390, height: 844 },
  { name: 'iphone-landscape', width: 844, height: 390 },
  { name: 'ipad-portrait', width: 820, height: 1180 },
  { name: 'ipad-landscape', width: 1180, height: 820 },
] as const;

/** ツールの種類が一目でわかる面を iPad 横で撮る(段差・破壊・列車・範囲) */
const LEVEL_SHOTS = [
  { level: 1, name: 'level01-rotate' },
  { level: 4, name: 'level04-raise' },
  { level: 6, name: 'level06-destroy' },
  { level: 8, name: 'level08-train-range' },
  { level: 10, name: 'level10-all' },
] as const;

interface ToolPoint {
  index: number;
  used: boolean;
  x: number;
  y: number;
  z: number;
}

declare global {
  interface Window {
    __game?: {
      tools(): ToolPoint[];
      project(x: number, y: number, z: number): { x: number; y: number };
      connected(): boolean;
      cleared(): boolean;
    };
  }
}

async function waitForFirstFrame(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelector('#app canvas') !== null);
  // 明滅や旗の揺れを安定させるため、数フレーム進めてから撮る
  await page.waitForTimeout(900);
}

/** ツールのワールド座標を camera.project でキャンバス座標に落としてタップする */
async function tapTool(page: Page, index: number): Promise<void> {
  const pt = await page.evaluate((i) => {
    const g = window.__game;
    if (!g) return null;
    const tool = g.tools().find((t) => t.index === i);
    if (!tool) return null;
    return g.project(tool.x, tool.y, tool.z);
  }, index);
  expect(pt, `ツール ${index} の画面座標`).not.toBeNull();
  await page.mouse.click(pt!.x, pt!.y);
  await page.waitForTimeout(150);
}

for (const vp of VIEWPORTS) {
  test(`screenshot ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('./');
    await waitForFirstFrame(page);
    await page.screenshot({ path: `e2e/screenshots/${vp.name}.png` });

    const size = await page.evaluate(() => {
      const c = document.querySelector('#app canvas') as HTMLCanvasElement | null;
      return c ? { w: c.clientWidth, h: c.clientHeight } : null;
    });
    expect(size).not.toBeNull();
    expect(size!.w).toBe(vp.width);
    expect(size!.h).toBe(vp.height);
  });
}

for (const shot of LEVEL_SHOTS) {
  test(`screenshot ipad-landscape ${shot.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.goto(`./?level=${shot.level}`);
    await waitForFirstFrame(page);
    await page.screenshot({ path: `e2e/screenshots/ipad-landscape-${shot.name}.png` });
  });
}

test('レベル 1 はタップ 1 回でクリアできる', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('./?level=1&debug=1');
  await waitForFirstFrame(page);

  expect(await page.evaluate(() => window.__game?.connected())).toBe(false);
  await tapTool(page, 0);
  expect(await page.evaluate(() => window.__game?.connected())).toBe(true);

  // 溜め 0.5 秒 + 1 タイル 0.6 秒で走り、ゴールで紙吹雪
  await page.waitForFunction(() => window.__game?.cleared() === true, undefined, { timeout: 20_000 });
  await page.screenshot({ path: 'e2e/screenshots/level01-cleared.png' });
});

test('レベル 4 は上げ下げツール 2 つでクリアできる', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('./?level=4&debug=1');
  await waitForFirstFrame(page);

  expect(await page.evaluate(() => window.__game?.connected())).toBe(false);
  await tapTool(page, 0);
  expect(await page.evaluate(() => window.__game?.connected())).toBe(false);
  await tapTool(page, 1);
  expect(await page.evaluate(() => window.__game?.connected())).toBe(true);

  await page.waitForFunction(() => window.__game?.cleared() === true, undefined, { timeout: 20_000 });
  await page.screenshot({ path: 'e2e/screenshots/level04-cleared.png' });
});

test('レベル 6: 破壊ツールは 1 回で消え、跡から道が現れる', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('./?level=6&debug=1');
  await waitForFirstFrame(page);

  const before = await page.evaluate(() => window.__game?.tools().map((t) => t.used));
  expect(before).toEqual([false, false, false]);

  await tapTool(page, 0); // 破壊ツール
  // 破片が飛んでいる最中を撮る(0.4 秒)
  await page.screenshot({ path: 'e2e/screenshots/level06-destroying.png' });

  const after = await page.evaluate(() => window.__game?.tools().map((t) => t.used));
  expect(after?.[0]).toBe(true); // 使い切り
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'e2e/screenshots/level06-destroyed.png' });
});

test('debug=1 を付けなければデバッグ口は生えない', async ({ page }) => {
  await page.goto('./');
  await waitForFirstFrame(page);
  expect(await page.evaluate(() => window.__game === undefined)).toBe(true);
});

test('document.body 配下に空白以外のテキストノードが存在しない', async ({ page }) => {
  await page.goto('./');
  await waitForFirstFrame(page);

  const texts = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const found: string[] = [];
    let node = walker.nextNode();
    while (node) {
      const v = node.nodeValue ?? '';
      if (v.trim().length > 0) found.push(v.trim());
      node = walker.nextNode();
    }
    return found;
  });
  expect(texts).toEqual([]);
});

test('WebGL コンテキストが取得できている', async ({ page }) => {
  await page.goto('./');
  await waitForFirstFrame(page);
  const ok = await page.evaluate(() => {
    const c = document.querySelector('#app canvas') as HTMLCanvasElement | null;
    if (!c) return false;
    // three が既に取得済みのコンテキストを取り直す
    return c.getContext('webgl2') !== null || c.getContext('webgl') !== null;
  });
  expect(ok).toBe(true);
});
