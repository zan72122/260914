/**
 * 言葉なしの操作だけで、置く → 音程 → 扉 → 4 層 → 駅 → 新しい曲、まで通せることを確認する。
 * 状態は localStorage に自動保存されるので、それを観測して検証する。
 */
import { test, expect, type Page } from '@playwright/test';
import { computeLayout, slotPos, boxItemPos } from '../../src/render/layout';
import { placedInstrumentPos } from '../../src/render/scene';
import { STORAGE_KEY } from '../../src/app/storage';
import { INSTRUMENT_KIND, type Song } from '../../src/app/state';

const OUT = process.env.SHOT_DIR ?? 'test-results/shots';

async function song(page: Page): Promise<Song | null> {
  return page.evaluate((k) => { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; }, STORAGE_KEY);
}

async function dragPath(page: Page, pts: { x: number; y: number }[], steps = 10) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0].x, y: pts[0].y }] });
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }] });
      await page.waitForTimeout(16);
    }
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function drag(page: Page, x0: number, y0: number, x1: number, y1: number, steps = 12) {
  await dragPath(page, [{ x: x0, y: y0 }, { x: x1, y: y1 }], steps);
}

test('置く・音程・扉・4 層・駅・新しい曲', async ({ page, viewport }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = (name: string) => page.screenshot({ path: `${OUT}/${info.project.name}-${name}.png` });

  await page.goto('/');
  await page.evaluate((k) => localStorage.removeItem(k), STORAGE_KEY);
  await page.reload();
  const layout = computeLayout(viewport!.width, viewport!.height);
  await page.waitForTimeout(300);
  await shot('0-waiting');

  // 最初のタップで走り出す
  await page.touchscreen.tap(layout.loop.cx, layout.loop.cy);
  await page.waitForTimeout(500);

  for (let level = 0; level < 4; level++) {
    // おもちゃ箱の 1 番目と 2 番目を穴へ
    const before = (await song(page)) ?? null;
    const instruments = before?.layers[level].instruments ?? [];
    // 保存前は箱の中身が不明なので、まず 1 個置いて保存させる
    const b0 = boxItemPos(layout, 0, instruments.length || 4);
    const s0 = slotPos(layout, 2);
    await drag(page, b0.x, b0.y, s0.x, s0.y + layout.unit * 0.8);
    let s = await song(page);
    expect(s, 'ドロップで保存される').not.toBeNull();
    expect(s!.currentLevel).toBe(level);
    expect(s!.layers[level].placements.map((p) => p.slot)).toEqual([2]);

    const items = s!.layers[level].instruments;
    const b1 = boxItemPos(layout, 1, items.length);
    const s1 = slotPos(layout, 5);
    await drag(page, b1.x, b1.y, s1.x, s1.y + layout.unit * 0.8);
    s = await song(page);
    expect(s!.layers[level].placements.map((p) => p.slot)).toEqual([2, 5]);

    // メロディ楽器なら上へドラッグして音程を上げる
    const melodyIdx = s!.layers[level].placements.findIndex((p) => INSTRUMENT_KIND[p.inst] === 'melody');
    if (melodyIdx >= 0) {
      const p = s!.layers[level].placements[melodyIdx];
      const pos = placedInstrumentPos(layout, p.slot, p.inst, p.pitch);
      await drag(page, pos.x, pos.y, pos.x, pos.y - layout.unit * 0.65, 8);
      s = await song(page);
      const after = s!.layers[level].placements.find((q) => q.slot === p.slot)!;
      expect(after.pitch, '上へ動かすと音が高くなる').toBeGreaterThan(p.pitch);
    }
    // 穴の外で離すと箱へ戻る(= 消える)
    const p2 = s!.layers[level].placements[0];
    const pos2 = placedInstrumentPos(layout, p2.slot, p2.inst, p2.pitch);
    // 横に外してから中央へ運び、穴の外で離す
    await dragPath(page, [pos2, { x: pos2.x + layout.unit * 1.2, y: pos2.y }, { x: layout.loop.cx, y: layout.loop.cy }], 6);
    s = await song(page);
    expect(s!.layers[level].placements.length).toBe(1);
    await page.waitForTimeout(800);
    await shot(`1-level${level}`);

    // トンネルの扉を叩く → 汽車がトンネルへ → 次のレベル(または駅)
    const t = layout.loop.pointAt(0);
    await page.touchscreen.tap(t.x, t.y);
    await expect.poll(async () => {
      const x = await song(page);
      return level < 3 ? x!.currentLevel : x!.phase;
    }, { timeout: 15_000 }).toBe(level < 3 ? level + 1 : 'finale');
    await page.waitForTimeout(700);
    await shot(`2-transition${level}`);
    await page.waitForTimeout(1500);
  }

  // 駅: 汽車が止まるのを待って貨車を叩く → ふたが閉まる(ミュート)
  await page.waitForTimeout(4500);
  await shot('3-finale');
  const park = layout.loop.pointAt(0.5);
  const geomSpacing = layout.unit * 1.65;
  const w0 = layout.loop.pointAtLength(0.5 * layout.loop.length - geomSpacing);
  await page.touchscreen.tap(w0.x, w0.y);
  await expect.poll(async () => (await song(page))!.layers[0].muted).toBe(true);
  await page.waitForTimeout(400);
  await shot('4-finale-muted');
  expect(park).toBeTruthy();

  // 新しい汽車を叩く → 新しい曲
  const oldSeed = (await song(page))!.seed;
  const np = layout.portrait
    ? { x: layout.box.x + layout.box.w * 0.5, y: layout.box.y + layout.box.h * 0.5 + layout.unit * 0.1 }
    : { x: layout.box.x + layout.box.w * 0.5, y: layout.box.y + layout.box.h * 0.5 };
  await page.touchscreen.tap(np.x, np.y);
  await expect.poll(async () => (await song(page))!.seed, { timeout: 10_000 }).not.toBe(oldSeed);
  await page.waitForTimeout(1500);
  await shot('5-newsong');
  const fresh = await song(page);
  expect(fresh!.currentLevel).toBe(0);
  expect(fresh!.phase).toBe('level');

  expect(errors, 'コンソールエラーなし').toEqual([]);
});
