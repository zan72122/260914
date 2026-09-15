import { expect, test, type Page } from '@playwright/test';

const VIEWPORTS = [
  { name: 'iphone-portrait', width: 390, height: 844 },
  { name: 'iphone-landscape', width: 844, height: 390 },
  { name: 'ipad-portrait', width: 820, height: 1180 },
  { name: 'ipad-landscape', width: 1180, height: 820 },
] as const;

async function waitForFirstFrame(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelector('#app canvas') !== null);
  // 明滅や旗の揺れを安定させるため、数フレーム進めてから撮る
  await page.waitForTimeout(900);
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
