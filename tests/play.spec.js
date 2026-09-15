// 一本指のポインタ操作だけで全工程を通すテスト（Chromium）
// iPhone / iPad の縦横 4 通り＋回転保持 1 ケース
import { test, expect } from '@playwright/test';
import fs from 'fs';
import {
  state, geom, prog, waitState, boot, drag, P,
  doKetchup, doMix, doPour, doGather, doSlide, doCut, expectHandleClear,
} from './helpers.js';

const SHOTS = 'screenshots';
fs.mkdirSync(SHOTS, { recursive: true });

async function shot(page, dev, ori, n, label) {
  await page.screenshot({ path: `${SHOTS}/${dev}-${ori}-${String(n).padStart(2, '0')}-${label}.png` });
}

// 8. 描く: 指でなぞって艶のあるケチャップの絵を描く
async function doDraw(page) {
  const g = await geom(page);
  // 目・目・にっこり
  await drag(page, [P(g, -0.24, -0.22), P(g, -0.21, -0.07)], 6);
  await drag(page, [P(g, 0.21, -0.22), P(g, 0.24, -0.07)], 6);
  const smile = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI * (0.15 + (i / 12) * 0.7);
    smile.push(P(g, -Math.cos(a) * 0.32, 0.06 + Math.sin(a) * 0.20));
  }
  await drag(page, smile, 5);
  await waitState(page, 'DONE_MENU', 8000);
}

// ---- 通しシナリオ ----
async function playthrough(page, dev, ori, opts = {}) {
  await expect.poll(() => state(page)).toBe('RICE_KETCHUP');
  await expectHandleClear(page);
  await shot(page, dev, ori, 1, 'RICE_KETCHUP');

  await doKetchup(page);
  expect((await prog(page)).strokes).toBeGreaterThan(0);
  await shot(page, dev, ori, 2, 'RICE_MIX');

  await doMix(page);
  expect((await prog(page)).cover).toBeGreaterThan(0.79);
  await shot(page, dev, ori, 3, 'EGG_POUR');

  await doPour(page);
  expect((await prog(page)).spread).toBeGreaterThan(0.99);
  await shot(page, dev, ori, 4, 'EGG_GATHER');

  await doGather(page);
  expect((await prog(page)).gather).toBeGreaterThan(0.99);
  await shot(page, dev, ori, 5, 'EGG_SLIDE');

  // --- 画面回転しても状態は保持される ---
  if (opts.rotate) {
    const before = await prog(page);
    const beforeState = await state(page);
    const size = page.viewportSize();
    await page.setViewportSize({ width: size.height, height: size.width });
    await page.waitForTimeout(400);
    expect(await state(page)).toBe(beforeState);
    const after = await prog(page);
    expect(after.cover).toBeCloseTo(before.cover, 5);
    expect(after.strokes).toBe(before.strokes);
    expect(after.gather).toBeCloseTo(before.gather, 5);
    const g = await geom(page);
    expect(g.portrait).toBe(size.height > size.width ? false : true);
    await expectHandleClear(page);
    await shot(page, dev, ori, 6, 'EGG_SLIDE-rotated');
  }

  await doSlide(page);
  // オムレツはライスの山に乗っている（山より一回り小さい）
  {
    const g = await geom(page);
    expect(g.omelet.rx).toBeGreaterThan(g.mound.rx * 0.7);
    expect(g.omelet.rx).toBeLessThan(g.mound.rx * 0.95);
    expect(g.omelet.ry).toBeLessThan(g.mound.ry * 0.9);
  }
  await shot(page, dev, ori, 7, 'CUT');

  await doCut(page);
  await shot(page, dev, ori, 8, 'OPEN');

  await waitState(page, 'DRAW', 10000);
  await shot(page, dev, ori, 9, 'DRAW');

  await doDraw(page);
  expect((await prog(page)).drawPoints).toBeGreaterThan(5);
  await shot(page, dev, ori, 10, 'DONE_MENU');

  // 🔁 もう一回
  const again = await page.evaluate(() => window.__game.hit('again'));
  await page.mouse.move(again.x, again.y);
  await page.mouse.down();
  await page.mouse.up();
  await waitState(page, 'RICE_KETCHUP', 8000);
  expect((await prog(page)).drawStrokes).toBe(0);
  await shot(page, dev, ori, 11, 'RICE_KETCHUP-again');
}

const CASES = [
  { dev: 'iphone', ori: 'portrait', w: 390, h: 844 },
  { dev: 'iphone', ori: 'landscape', w: 844, h: 390 },
  { dev: 'ipad', ori: 'portrait', w: 820, h: 1180 },
  { dev: 'ipad', ori: 'landscape', w: 1180, h: 820 },
];

for (const c of CASES) {
  test(`${c.dev} ${c.ori} 一周`, async ({ page }) => {
    const errors = await boot(page, c.w, c.h);
    await playthrough(page, c.dev, c.ori);
    expect(errors, 'JS エラーが出ていないこと').toEqual([]);
  });
}

test('iphone 途中で回転しても状態が保持される', async ({ page }) => {
  const errors = await boot(page, 390, 844);
  await playthrough(page, 'iphone', 'rotate', { rotate: true });
  expect(errors, 'JS エラーが出ていないこと').toEqual([]);
});

test('✨ 別バージョンで見た目が変わる', async ({ page }) => {
  await boot(page, 390, 844);
  await doKetchup(page);
  await doMix(page);
  await doPour(page);
  await doGather(page);
  await doSlide(page);
  await doCut(page);
  await waitState(page, 'DRAW', 10000);
  const gv = await geom(page);
  await drag(page, [P(gv, -0.2, 0), P(gv, 0.2, 0)], 6);
  await waitState(page, 'DONE_MENU', 8000);
  const v0 = await page.evaluate(() => window.__game.variant);
  const b = await page.evaluate(() => window.__game.hit('variant'));
  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  await page.mouse.up();
  await waitState(page, 'RICE_KETCHUP', 8000);
  const v1 = await page.evaluate(() => window.__game.variant);
  expect(v1).not.toBe(v0);
  await shot(page, 'iphone', 'portrait', 12, 'VARIANT');
});
