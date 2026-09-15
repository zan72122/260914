// 演出のフレームキャプチャ（監督レビュー用・iPhone 縦）
//   screenshots/frames/slide-NN.png  EGG_SLIDE の傾き開始〜着地〜揺れ収束（60ms 間隔 20 枚）
//   screenshots/frames/open-NN.png   CUT 完了〜パカッ〜トロッ〜DRAW 開始（60ms 間隔 25 枚）
// ゲーム側を一時停止し `window.__game.step(ms)` で正確に 60ms ずつ進めるので、
// スクリーンショットの所要時間に影響されない。
import { test, expect } from '@playwright/test';
import fs from 'fs';
import {
  state, geom, prog, waitState, boot, drag,
  doKetchup, doMix, doPour, doGather,
} from './helpers.js';

const DIR = 'screenshots/frames';
const STEP = 60; // ms

async function pause(page, on = true) {
  await page.evaluate((v) => window.__game.pause(v), on);
}

// 一時停止したまま STEP ms ぶん進めて、描画されたところを撮る
async function stepShot(page, name, i) {
  await page.evaluate((ms) => new Promise((done) => {
    window.__game.step(ms);
    requestAnimationFrame(() => requestAnimationFrame(() => done()));
  }), STEP);
  await page.screenshot({ path: `${DIR}/${name}-${String(i).padStart(2, '0')}.png` });
}

test('パカッ！の演出フレームを書き出す', async ({ page }) => {
  fs.mkdirSync(DIR, { recursive: true });
  const errors = await boot(page, 390, 844);

  await doKetchup(page);
  await doMix(page);
  await doPour(page);
  await doGather(page);
  await waitState(page, 'EGG_SLIDE');

  // ---- 1) スライド：傾き → 着地 → ぷるん ----
  await pause(page, true);
  const g = await geom(page);
  const dx = g.plate.x - g.pan.x, dy = g.plate.y - g.pan.y;
  const d = Math.hypot(dx, dy) || 1;
  const len = g.unit * 0.5;
  await drag(page, [
    { x: g.pan.x, y: g.pan.y },
    { x: g.pan.x + (dx / d) * len, y: g.pan.y + (dy / d) * len },
  ], 16);
  expect((await prog(page)).panProg, 'フライパンが傾ききっていること').toBeGreaterThan(0.99);
  for (let i = 1; i <= 20; i++) await stepShot(page, 'slide', i);
  expect(await state(page)).toBe('EGG_SLIDE');
  expect((await geom(page)).omelet.place, 'オムレツが皿へ移っていること').toBe('plate');

  // ---- 2) 切る → 間 → パカッ → トロッ → 描く ----
  await pause(page, false);
  await waitState(page, 'CUT', 10000);
  await pause(page, true);
  const g2 = await geom(page);
  const o = g2.omelet;
  await drag(page, [
    { x: o.x - o.rx * 0.95, y: o.y },
    { x: o.x, y: o.y },
    { x: o.x + o.rx * 0.95, y: o.y },
  ], 10);
  expect((await prog(page)).cut, '切れ目が入っていること').toBeGreaterThan(0);
  for (let i = 1; i <= 25; i++) await stepShot(page, 'open', i);

  const p = await prog(page);
  expect(p.open, 'パカッが開ききっていること').toBeGreaterThan(0.99);
  expect(p.tororo, 'トロッが広がりきっていること').toBeGreaterThan(0.99);
  expect(await state(page), '最後は描ける状態になっていること').toMatch(/DRAW|DONE_MENU/);

  await pause(page, false);
  expect(errors, 'JS エラーが出ていないこと').toEqual([]);
});
