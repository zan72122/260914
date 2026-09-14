/**
 * 言葉なしの操作だけで、置く → 鳴る → 扉 → 次へ … → 駅 → ミュート → 新しい曲、まで通せることを確認する。
 * 画面座標は ?test で有効になるフック(window.__tt)から取り、状態は localStorage で検証する。
 */
import { test, expect, type Page } from '@playwright/test';
import { STORAGE_KEY } from '../../src/app/storage';
import type { Song, LevelKind } from '../../src/app/state';

type Pt = { x: number; y: number } | null;
declare global { interface Window { __tt: Record<string, (...a: never[]) => unknown> } }

const OUT = process.env.SHOT_DIR ?? 'test-results/shots';

const song = (page: Page) => page.evaluate((k) => { const r = localStorage.getItem(k); return r ? (JSON.parse(r) as Song) : null; }, STORAGE_KEY);
const tt = <T,>(page: Page, expr: string) => page.evaluate((e) => (new Function('return ' + e))() as T, `window.__tt.${expr}`);

async function dragPath(page: Page, pts: { x: number; y: number }[], steps = 8) {
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

/** 置き先の画面位置。指の少し上に楽器が浮くので、その分だけ下を触る */
async function dropPoint(page: Page, slot: number, pitch: number): Promise<{ x: number; y: number }> {
  const p = (await tt<Pt>(page, `target(${slot}, ${pitch})`))!;
  const unit = await tt<number>(page, 'unitPx()');
  return { x: p.x, y: p.y + unit * 0.5 };
}

test('置く・扉・3 形式・駅・ミュート・新しい曲', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = (name: string) => page.screenshot({ path: `${OUT}/${info.project.name}-${name}.png` });

  await page.goto('/?test');
  // 3 形式を必ず通るように固定した曲を用意する
  const kinds: LevelKind[] = ['train', 'grid', 'musicbox', 'train'];
  await page.evaluate(([k, kinds]) => {
    const s = window.__tt.song() as Song;
    s.layers.forEach((l, i) => { l.kind = kinds[i]; l.placements = []; l.muted = false; });
    s.currentLevel = 0; s.phase = 'level';
    localStorage.setItem(k, JSON.stringify(s));
  }, [STORAGE_KEY, kinds] as const);
  await page.reload();
  await page.waitForTimeout(400);
  await shot('0-waiting');

  // 最初のタップで走り出す
  const loco = (await tt<Pt>(page, 'loco()'))!;
  await page.touchscreen.tap(loco.x, loco.y);
  await expect.poll(() => tt<string>(page, 'mode()')).toBe('level');

  for (let level = 0; level < 4; level++) {
    expect(await tt<string>(page, 'kind()')).toBe(kinds[level]);
    // トレイの 1 番目を (列 2, 行 3) へ、2 番目を (列 5, 行 1) へ
    const spots: [number, number][] = kinds[level] === 'train' ? [[2, 0], [5, 0]] : [[2, 3], [5, 1]];
    for (let i = 0; i < 2; i++) {
      const [slot, pitch] = spots[i];
      const from = (await tt<Pt>(page, `tray(${i})`))!;
      // オルゴールは穴が見えるまで待つ
      await expect.poll(() => tt<boolean>(page, `targetVisible(${slot}, ${pitch})`), { timeout: 8000 }).toBe(true);
      const to = await dropPoint(page, slot, pitch);
      await dragPath(page, [from, { x: (from.x + to.x) / 2, y: from.y - 40 }, to]);
      const s = (await song(page))!;
      expect(s.currentLevel).toBe(level);
      expect(s.layers[level].placements.length, `level ${level} 置く ${i}`).toBe(i + 1);
      // オルゴールは穴が回って動くので、列は「離した時に一番近い穴」になる。行(音程)だけ確かめる
      if (kinds[level] === 'musicbox') expect(s.layers[level].placements.map((p) => p.pitch)).toContain(pitch);
      else expect(s.layers[level].placements.map((p) => p.slot)).toContain(slot);
    }
    // 汽車ループ: 上へドラッグで音程が上がる。横へ外して離すと箱へ戻る
    let s = (await song(page))!;
    const melody = s.layers[level].placements.find((p) => ['bell', 'bird', 'marimba', 'flute', 'frog'].includes(p.inst));
    if (kinds[level] === 'train' && melody) {
      const pos = (await tt<Pt>(page, `placement(${melody.slot}, ${melody.pitch})`))!;
      const unit = await tt<number>(page, 'unitPx()');
      await dragPath(page, [pos, { x: pos.x, y: pos.y - unit * 0.9 }], 6);
      s = (await song(page))!;
      expect(s.layers[level].placements.find((p) => p.slot === melody.slot)!.pitch).toBeGreaterThan(melody.pitch);
    }
    // 取り外し: 持ち上げて置き先の外で離すとトレイへ戻る(オルゴールのピンは回って動くので数回試す)
    const first = s.layers[level].placements[0];
    for (let tries = 0; tries < 4; tries++) {
      await expect.poll(() => tt<boolean>(page, `targetVisible(${first.slot}, ${first.pitch})`), { timeout: 8000 }).toBe(true);
      const pos = (await tt<Pt>(page, `placement(${first.slot}, ${first.pitch})`))!;
      await dragPath(page, [pos, { x: pos.x + 120, y: pos.y }, { x: page.viewportSize()!.width / 2, y: 8 }], 6);
      s = (await song(page))!;
      if (s.layers[level].placements.length === 1) break;
    }
    expect(s.layers[level].placements.length, '穴の外で離すと戻る').toBe(1);
    await page.waitForTimeout(700);
    await shot(`1-level${level}-${kinds[level]}`);

    // 扉を叩く → 次へ(または駅)
    // 汽車がちょうど扉の前を通っていると汽車に当たるので、開くまで叩き直す
    for (let tries = 0; tries < 6; tries++) {
      const door = (await tt<Pt>(page, 'door()'))!;
      await page.touchscreen.tap(door.x, door.y);
      await page.waitForTimeout(250);
      if ((await tt<{ opened: boolean }>(page, 'doorState()')).opened) break;
      await page.waitForTimeout(400);
    }
    await expect.poll(async () => { const x = (await song(page))!; return level < 3 ? x.currentLevel : x.phase; }, { timeout: 15_000 })
      .toBe(level < 3 ? level + 1 : 'finale');
    await page.waitForTimeout(500);
    await shot(`2-transition${level}`);
    await expect.poll(() => tt<string>(page, 'mode()'), { timeout: 10_000 }).toMatch(/level|finale|arriving/);
    await page.waitForTimeout(1200);
  }

  // 駅: 停まるのを待って貨車を叩く → ミュート
  await expect.poll(() => tt<string>(page, 'mode()'), { timeout: 10_000 }).toBe('finale');
  await page.waitForTimeout(400);
  await shot('3-finale');
  const w0 = (await tt<Pt>(page, 'wagon(0)'))!;
  await page.touchscreen.tap(w0.x, w0.y);
  await expect.poll(async () => (await song(page))!.layers[0].muted).toBe(true);
  await page.waitForTimeout(400);
  await shot('4-finale-muted');

  // 新しい汽車を叩く → 新しい曲
  const oldSeed = (await song(page))!.seed;
  const nt = (await tt<Pt>(page, 'newTrain()'))!;
  await page.touchscreen.tap(nt.x, nt.y);
  await expect.poll(async () => (await song(page))!.seed, { timeout: 10_000 }).not.toBe(oldSeed);
  await expect.poll(() => tt<string>(page, 'mode()'), { timeout: 10_000 }).toBe('level');
  await page.waitForTimeout(500);
  await shot('5-newsong');
  const fresh = (await song(page))!;
  expect(fresh.currentLevel).toBe(0);
  expect(fresh.phase).toBe('level');
  expect(await tt<string>(page, 'kind()')).toBe('train');

  expect(errors, 'コンソールエラーなし').toEqual([]);
});
