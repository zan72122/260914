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
  { level: 2, name: 'level02-dusk' },
  { level: 3, name: 'level03-meadow' },
  { level: 4, name: 'level04-raise' },
  { level: 5, name: 'level05-water-dusk' },
  { level: 6, name: 'level06-destroy' },
  { level: 7, name: 'level07-green-city-night' },
  { level: 8, name: 'level08-train-range' },
  { level: 9, name: 'level09-bridge' },
  { level: 10, name: 'level10-all' },
] as const;

interface ToolPoint {
  index: number;
  used: boolean;
  x: number;
  y: number;
  z: number;
}

interface IslandPoint {
  index: number;
  cleared: boolean;
  next: boolean;
  x: number;
  y: number;
  z: number;
}

declare global {
  interface Window {
    __game?: {
      screen(): 'map' | 'play';
      tools(): ToolPoint[];
      islands(): IslandPoint[];
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

/** ワールド座標を camera.project でキャンバス座標に落としてタップする */
async function tapWorld(page: Page, pt: { x: number; y: number; z: number } | null): Promise<void> {
  expect(pt, 'タップ対象の座標').not.toBeNull();
  const screen = await page.evaluate((p) => window.__game?.project(p.x, p.y, p.z) ?? null, pt!);
  expect(screen, '画面座標').not.toBeNull();
  await page.mouse.click(screen!.x, screen!.y);
  await page.waitForTimeout(150);
}

async function tapTool(page: Page, index: number): Promise<void> {
  const pt = await page.evaluate((i) => {
    const tool = window.__game?.tools().find((t) => t.index === i);
    return tool ? { x: tool.x, y: tool.y, z: tool.z } : null;
  }, index);
  await tapWorld(page, pt);
}

async function tapIsland(page: Page, index: number): Promise<void> {
  const pt = await page.evaluate((i) => {
    const isle = window.__game?.islands().find((t) => t.index === i);
    return isle ? { x: isle.x, y: isle.y, z: isle.z } : null;
  }, index);
  await tapWorld(page, pt);
}

// --- 地図画面(5.5)。起動直後はここ ---
for (const vp of VIEWPORTS) {
  test(`screenshot map ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('./');
    await waitForFirstFrame(page);
    await page.screenshot({ path: `e2e/screenshots/map-${vp.name}.png` });

    const size = await page.evaluate(() => {
      const c = document.querySelector('#app canvas') as HTMLCanvasElement | null;
      return c ? { w: c.clientWidth, h: c.clientHeight } : null;
    });
    expect(size).not.toBeNull();
    expect(size!.w).toBe(vp.width);
    expect(size!.h).toBe(vp.height);
  });
}

// --- プレイ画面。4 ビューポート ---
for (const vp of VIEWPORTS) {
  test(`screenshot play ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('./?level=1');
    await waitForFirstFrame(page);
    await page.screenshot({ path: `e2e/screenshots/${vp.name}.png` });
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

test('地図には 10 個の島があり、次に遊べる島が 1 つだけ示される', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('./?debug=1');
  await waitForFirstFrame(page);

  expect(await page.evaluate(() => window.__game?.screen())).toBe('map');
  const isles = await page.evaluate(() => window.__game?.islands() ?? []);
  expect(isles).toHaveLength(10);
  expect(isles.filter((i) => i.next)).toHaveLength(1);
  expect(isles[0]!.next).toBe(true); // 進行が空なら 1 面が «次»
  expect(isles.every((i) => !i.cleared)).toBe(true);
  // 左から右へ並ぶ(3.3-(4): 画面上で左にある島は地図でも左にある)
  expect(isles[0]!.x).toBeLessThan(isles[6]!.x);
});

test('島をタップするとカメラが寄ってプレイ画面に入る(5.5)', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('./?debug=1');
  await waitForFirstFrame(page);

  await tapIsland(page, 0);
  await page.waitForFunction(() => window.__game?.screen() === 'play', undefined, { timeout: 10_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'e2e/screenshots/map-enter-level01.png' });
  const tools = await page.evaluate(() => window.__game?.tools() ?? []);
  expect(tools.length).toBeGreaterThan(0);
});

test('レベル 1 をクリアすると地図へ戻り、その島に旗が立つ(3.2)', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('./?debug=1');
  await waitForFirstFrame(page);

  await tapIsland(page, 0);
  await page.waitForFunction(() => window.__game?.screen() === 'play', undefined, { timeout: 10_000 });
  await page.waitForTimeout(400);

  await tapTool(page, 0);
  await page.waitForFunction(() => window.__game?.cleared() === true, undefined, { timeout: 20_000 });

  // 2 秒待つと自動で地図へズームアウトする(3.4)
  await page.waitForFunction(() => window.__game?.screen() === 'map', undefined, { timeout: 20_000 });
  // ズームアウト(0.8s)が終わってから撮る
  await page.waitForTimeout(2500);

  const isles = await page.evaluate(() => window.__game?.islands() ?? []);
  expect(isles[0]!.cleared).toBe(true);
  expect(isles[0]!.next).toBe(false);
  expect(isles[1]!.next).toBe(true); // 次に遊べる島が 2 面へ進む
  await page.screenshot({ path: 'e2e/screenshots/map-after-level01.png' });
});

test('盤面の外側をタップすると地図へ戻る(5.1)', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('./?level=1&debug=1');
  await waitForFirstFrame(page);
  expect(await page.evaluate(() => window.__game?.screen())).toBe('play');

  // 盤面から十分に離れた海をタップする
  await page.mouse.click(90, 700);
  await page.waitForFunction(() => window.__game?.screen() === 'map', undefined, { timeout: 10_000 });
});

test('レベル 1 はタップ 1 回でクリアできる', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('./?level=1&debug=1');
  await waitForFirstFrame(page);

  expect(await page.evaluate(() => window.__game?.connected())).toBe(false);
  await tapTool(page, 0);
  await page.waitForFunction(() => window.__game?.connected() === true, undefined, { timeout: 10_000 });

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

test('プレイ画面にもテキストノードが無い', async ({ page }) => {
  await page.goto('./?level=8');
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
