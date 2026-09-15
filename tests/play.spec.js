// 一本指のポインタ操作だけで全工程を通すテスト（Chromium）
// iPhone / iPad の縦横 4 通り＋回転保持 1 ケース
import { test, expect } from '@playwright/test';
import fs from 'fs';

const SHOTS = 'screenshots';
fs.mkdirSync(SHOTS, { recursive: true });

const state = (page) => page.evaluate(() => window.__game.state);
const geom = (page) => page.evaluate(() => window.__game.geom());
const prog = (page) => page.evaluate(() => window.__game.progress());

async function waitState(page, name, timeout = 20000) {
  await expect.poll(() => state(page), { timeout, message: `state -> ${name}` }).toBe(name);
}

async function boot(page, w, h) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/index.html');
  await page.waitForFunction(() => !!window.__game);
  await page.waitForTimeout(350);
  return errors;
}

async function drag(page, pts, steps = 8) {
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (let i = 1; i < pts.length; i++) {
    await page.mouse.move(pts[i].x, pts[i].y, { steps });
  }
  await page.mouse.up();
}

function shotName(dev, ori, n, label) {
  return `${SHOTS}/${dev}-${ori}-${String(n).padStart(2, '0')}-${label}.png`;
}

async function shot(page, dev, ori, n, label) {
  await page.screenshot({ path: shotName(dev, ori, n, label) });
}

// 皿ローカル正規化座標 → 画面座標
const P = (g, u, v) => ({ x: g.plate.x + u * g.plate.r, y: g.plate.y + v * g.plate.ry });
const F = (g, u, v) => ({ x: g.pan.x + u * g.pan.r, y: g.pan.y + v * g.pan.ry });

// ---- 各工程 ----

// 1. ケチャップ: ボトルを掴んで皿の上をジグザグになぞる
async function doKetchup(page) {
  for (let attempt = 0; attempt < 6; attempt++) {
    if ((await state(page)) !== 'RICE_KETCHUP') break;
    const g = await geom(page);
    const b = await page.evaluate(() => window.__game.hit('bottle'));
    const pts = [b];
    const rows = [-0.42, -0.14, 0.14, 0.42];
    rows.forEach((v, i) => {
      const dir = i % 2 === 0 ? 1 : -1;
      pts.push(P(g, -0.6 * dir, v));
      pts.push(P(g, 0.6 * dir, v));
    });
    await drag(page, pts, 10);
    await page.waitForTimeout(250);
  }
  await waitState(page, 'RICE_MIX');
}

// 2. 混ぜる: 皿の上でざっくり円運動
async function doMix(page) {
  for (let attempt = 0; attempt < 8; attempt++) {
    if ((await state(page)) !== 'RICE_MIX') break;
    const g = await geom(page);
    const pts = [];
    for (const rad of [0.66, 0.46, 0.24, 0.58]) {
      for (let i = 0; i <= 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        pts.push(P(g, Math.cos(a) * rad, Math.sin(a) * rad));
      }
    }
    await drag(page, pts, 4);
    await page.waitForTimeout(200);
  }
  await waitState(page, 'EGG_POUR');
}

// 3. 卵を注ぐ: ボウルをフライパンの上へドラッグ
async function doPour(page) {
  const g = await geom(page);
  const b = await page.evaluate(() => window.__game.hit('bowl'));
  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  await page.mouse.move(g.pan.x, g.pan.y - g.pan.ry * 0.9, { steps: 14 });
  await page.waitForTimeout(700);
  await page.mouse.up();
  await waitState(page, 'EGG_GATHER');
}

// 4. 寄せる: フライパン上で中央へ向かうスワイプを数回
async function doGather(page) {
  for (let attempt = 0; attempt < 8; attempt++) {
    if ((await state(page)) !== 'EGG_GATHER') break;
    const g = await geom(page);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7]];
    for (const [dx, dy] of dirs) {
      await drag(page, [F(g, dx * 0.92, dy * 0.92), F(g, dx * 0.05, dy * 0.05)], 10);
      if ((await state(page)) !== 'EGG_GATHER') break;
    }
    await page.waitForTimeout(150);
  }
  await waitState(page, 'EGG_SLIDE');
}

// 5. スライド: フライパンを皿の方へドラッグ
async function doSlide(page) {
  for (let attempt = 0; attempt < 8; attempt++) {
    if ((await state(page)) !== 'EGG_SLIDE') break;
    const g = await geom(page);
    const dx = g.plate.x - g.pan.x, dy = g.plate.y - g.pan.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const len = g.unit * 0.42;
    await drag(page, [
      { x: g.pan.x, y: g.pan.y },
      { x: g.pan.x + ux * len, y: g.pan.y + uy * len },
    ], 14);
    await page.waitForTimeout(250);
    if ((await prog(page)).panProg >= 1) break;
  }
  await waitState(page, 'CUT');
}

// 6. 切る: 稜線に沿って太い一筋のドラッグ
async function doCut(page) {
  for (let attempt = 0; attempt < 6; attempt++) {
    if ((await state(page)) !== 'CUT') break;
    const g = await geom(page);
    const o = g.omelet;
    await drag(page, [
      { x: o.x - o.rx * 0.95, y: o.y },
      { x: o.x, y: o.y },
      { x: o.x + o.rx * 0.95, y: o.y },
    ], 10);
    await page.waitForTimeout(150);
  }
  await expect.poll(() => state(page), { timeout: 10000 }).toMatch(/OPEN|DRAW|DONE_MENU/);
}

// 8. 描く: 指でなぞって艶のあるケチャップの絵を描く
async function doDraw(page) {
  const g = await geom(page);
  // 目・目・にっこり
  await drag(page, [P(g, -0.34, -0.30), P(g, -0.30, -0.10)], 6);
  await drag(page, [P(g, 0.30, -0.30), P(g, 0.34, -0.10)], 6);
  const smile = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI * (0.15 + (i / 12) * 0.7);
    smile.push(P(g, -Math.cos(a) * 0.46, 0.10 + Math.sin(a) * 0.30));
  }
  await drag(page, smile, 5);
  await waitState(page, 'DONE_MENU', 8000);
}

// ---- 通しシナリオ ----
async function playthrough(page, dev, ori, opts = {}) {
  await expect.poll(() => state(page)).toBe('RICE_KETCHUP');
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
    await shot(page, dev, ori, 6, 'EGG_SLIDE-rotated');
  }

  await doSlide(page);
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
  await drag(page, [P(gv, -0.3, 0), P(gv, 0.3, 0)], 6);
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
