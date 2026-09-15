// 一本指のポインタ操作で工程を進める共通ヘルパー（play.spec.js / frames.spec.js で共有）
import { expect } from '@playwright/test';

export const state = (page) => page.evaluate(() => window.__game.state);
export const geom = (page) => page.evaluate(() => window.__game.geom());
export const prog = (page) => page.evaluate(() => window.__game.progress());

export async function waitState(page, name, timeout = 20000) {
  await expect.poll(() => state(page), { timeout, message: `state -> ${name}` }).toBe(name);
}

export async function boot(page, w, h) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/index.html');
  await page.waitForFunction(() => !!window.__game);
  await page.waitForTimeout(350);
  return errors;
}

export async function drag(page, pts, steps = 8) {
  await page.mouse.move(pts[0].x, pts[0].y);
  await page.mouse.down();
  for (let i = 1; i < pts.length; i++) {
    await page.mouse.move(pts[i].x, pts[i].y, { steps });
  }
  await page.mouse.up();
}

// 皿ローカル正規化座標 → 画面座標
export const P = (g, u, v) => ({ x: g.plate.x + u * g.plate.r, y: g.plate.y + v * g.plate.ry });
export const F = (g, u, v) => ({ x: g.pan.x + u * g.pan.r, y: g.pan.y + v * g.pan.ry });

// 1. ケチャップ: ボトルを掴んでご飯の上をジグザグになぞる
export async function doKetchup(page) {
  for (let attempt = 0; attempt < 6; attempt++) {
    if ((await state(page)) !== 'RICE_KETCHUP') break;
    const g = await geom(page);
    const b = await page.evaluate(() => window.__game.hit('bottle'));
    const pts = [b];
    const rows = [-0.30, -0.10, 0.10, 0.30];
    rows.forEach((v, i) => {
      const dir = i % 2 === 0 ? 1 : -1;
      pts.push(P(g, -0.45 * dir, v));
      pts.push(P(g, 0.45 * dir, v));
    });
    await drag(page, pts, 10);
    await page.waitForTimeout(250);
  }
  await waitState(page, 'RICE_MIX');
}

// 2. 混ぜる: ご飯の山の上でざっくり円運動
export async function doMix(page) {
  for (let attempt = 0; attempt < 8; attempt++) {
    if ((await state(page)) !== 'RICE_MIX') break;
    const g = await geom(page);
    const pts = [];
    for (const rad of [0.62, 0.42, 0.20, 0.54]) {
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
export async function doPour(page) {
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
export async function doGather(page) {
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
export async function doSlide(page) {
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
export async function doCut(page) {
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

// フライパンの取っ手の先が、下の道具や画面外に重なっていないこと
export async function expectHandleClear(page) {
  const g = await geom(page);
  const half = g.handle.w / 2;
  expect(g.handle.x, '取っ手が画面から切れていないこと').toBeGreaterThan(half);
  expect(g.handle.x).toBeLessThan(g.w - half);
  expect(g.handle.y).toBeGreaterThan(half);
  expect(g.handle.y).toBeLessThan(g.h - half);
  for (const [name, t] of Object.entries(g.tools)) {
    const d = Math.hypot(g.handle.x - t.x, g.handle.y - t.y);
    expect(d, `取っ手の先が ${name} に重なっていないこと`).toBeGreaterThan(g.toolR + half);
  }
}
