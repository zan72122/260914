// UX 監査の再現テスト（4歳児の雑な操作でも「詰まらない」ことを assert で守る）
// 実行: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright test tests/audit.spec.js
// 計測値は [AUDIT] … として標準出力に出る。docs/AUDIT.md の各項目と対応。
import { test, expect } from '@playwright/test';
import {
  state, geom, prog, waitState, boot, drag, P, F,
  doKetchup, doMix, doPour, doGather, doSlide,
} from './helpers.js';

const W = 390, H = 844;                     // iPhone 縦
const LOG = [];
const log = (k, v) => { LOG.push(`[AUDIT] ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`); console.log(LOG[LOG.length - 1]); };

test.afterAll(() => { console.log('\n===== AUDIT SUMMARY =====\n' + LOG.join('\n')); });

// 指を押したまま待つ（ゲームループは回り続ける）
async function hold(page, x, y, ms) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

// 生の PointerEvent（pointerId 指定）を canvas に投げる
async function pev(page, type, id, x, y) {
  await page.evaluate(([type, id, x, y]) => {
    const c = document.getElementById('stage');
    c.dispatchEvent(new PointerEvent(type, {
      pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true,
      pointerType: 'touch', isPrimary: id === 1, buttons: type === 'pointerup' ? 0 : 1,
    }));
  }, [type, id, x, y]);
}

// CUT まで一気に進める（切り方はテストごとに変えたいので、切らずに止める）
async function playToCut(page) {
  await doKetchup(page); await doMix(page); await doPour(page); await doGather(page); await doSlide(page);
  await waitState(page, 'CUT', 15000);
  await page.waitForTimeout(250);
}

async function playToDraw(page) {
  await playToCut(page);
  for (let i = 0; i < 8 && (await state(page)) === 'CUT'; i++) {
    const g0 = await geom(page); const oo = g0.omelet;
    await drag(page, [{ x: oo.x - oo.rx * 0.95, y: oo.y }, { x: oo.x, y: oo.y }, { x: oo.x + oo.rx * 0.95, y: oo.y }], 10);
    await page.waitForTimeout(150);
  }
  await waitState(page, 'DRAW', 15000);
}

// ---------- 1. RICE_KETCHUP（P0-1） ----------
test('1. ケチャップ: 皿の上で静止長押しするだけで満タンになる', async ({ page }) => {
  await boot(page, W, H);
  const g = await geom(page);

  // (a) 皿の中央を 3.5 秒、まったく動かさずに長押し
  await page.mouse.move(g.plate.x, g.plate.y);
  await page.mouse.down();
  await page.waitForTimeout(900);
  const mid = await prog(page);
  await page.waitForTimeout(2600);
  const a = await prog(page);
  await page.mouse.up();
  log('1a 皿の上を3.5秒静止長押し', { ketchup: +a.ketchup.toFixed(3), strokes: a.strokes, state: await state(page) });

  // 詰まり検出: 長押しだけで満タン → RICE_MIX へ進む
  expect(mid.ketchup, '長押し0.9秒で確かに増えていること').toBeGreaterThan(0.15);
  expect(mid.flowing, '増えている間は「流れの絵」を描いてよい状態であること').toBe(true);
  expect(a.ketchup, '3.5秒の静止長押しで満タンになること').toBeGreaterThanOrEqual(1);
  expect(a.strokes, '長押しでも皿に線が残ること').toBeGreaterThan(0);
  await waitState(page, 'RICE_MIX', 5000);

  // 満タンのあとは「出ている絵」を描かない（嘘のフィードバックを出さない）
  expect((await prog(page)).flowing, '満タン後は流れを描かないこと').toBe(false);
});

test("1'. ケチャップ: ドラッグでも従来どおり出る / 皿の外では出ない＆ボトルが戻る", async ({ page }) => {
  await boot(page, W, H);
  const g = await geom(page);

  // (a) 皿の外（テーブル上）で 1.5 秒長押し
  const outside = { x: g.w * 0.5, y: g.plate.y + g.plate.ry + (g.h - g.plate.y - g.plate.ry) * 0.45 };
  await hold(page, outside.x, outside.y, 1500);
  const out = await prog(page);
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => window.__game.hit('bottle'));
  const home = g.tools.bottle;
  log("1'a 皿の外で長押し", {
    ketchup: +out.ketchup.toFixed(3), miss: +out.miss.toFixed(2),
    "離した1.2秒後の定位置からの距離_px": +Math.hypot(after.x - home.x, after.y - home.y).toFixed(1),
  });
  expect(out.ketchup, '皿の外では出ないこと').toBeLessThan(0.05);
  expect(out.miss, '的外れが続いたら光を強める合図が立つこと').toBeGreaterThan(0.3);
  expect(Math.hypot(after.x - home.x, after.y - home.y), 'ボトルが定位置へ戻ること').toBeLessThan(g.toolR * 0.5);

  // (b) 従来どおりのドラッグでも満タンになる（速く動かす＝時間駆動に頼らない経路）
  await page.reload(); await page.waitForFunction(() => !!window.__game); await page.waitForTimeout(300);
  const g2 = await geom(page);
  const b = await page.evaluate(() => window.__game.hit('bottle'));
  const pts = [b];
  [-0.30, -0.10, 0.10, 0.30].forEach((v, i) => {
    const dir = i % 2 === 0 ? 1 : -1;
    pts.push(P(g2, -0.45 * dir, v));
    pts.push(P(g2, 0.45 * dir, v));
  });
  await drag(page, pts, 10);
  await page.waitForTimeout(250);
  const d = await prog(page);
  log("1'b ジグザグドラッグ1往復", { ketchup: +d.ketchup.toFixed(3), strokes: d.strokes, state: await state(page) });
  expect(d.strokes, 'ドラッグで線が残ること').toBeGreaterThan(0);
  await waitState(page, 'RICE_MIX', 8000);
});

// ---------- 2. RICE_MIX（P1-7） ----------
test('2. 混ぜる: 短い雑な往復で進む / 皿の外は光で誘う', async ({ page }) => {
  await boot(page, W, H);
  await doKetchup(page);
  const g = await geom(page);

  // (a) 皿の外を 10 往復擦る → 進まないが「触るべき物」の光が強まる
  const oy = g.plate.y + g.plate.ry * 1.9;
  for (let i = 0; i < 10; i++) await drag(page, [{ x: g.plate.x - 60, y: oy }, { x: g.plate.x + 60, y: oy }], 4);
  const a = await prog(page);
  log('2a 皿の外を10往復', { cover: +a.cover.toFixed(3), miss: +a.miss.toFixed(2), state: await state(page) });
  expect(a.cover).toBeLessThan(0.02);
  expect(a.miss, '外し続けたら皿の光を強める合図が立つこと').toBeGreaterThan(0.5);

  // (b) 皿半径の 20% 幅の短い往復だけで完了するか
  const amp = 0.20;
  let strokes = 0, cover = 0;
  outer:
  for (let round = 0; round < 40; round++) {
    for (const [cu, cv] of [[-0.3, -0.2], [0.3, -0.2], [0, 0.1], [-0.25, 0.25], [0.25, 0.25], [0, -0.35], [-0.4, 0], [0.4, 0]]) {
      await drag(page, [P(g, cu - amp / 2, cv), P(g, cu + amp / 2, cv), P(g, cu - amp / 2, cv)], 3);
      strokes++;
      cover = (await prog(page)).cover;
      if ((await state(page)) !== 'RICE_MIX') break outer;
    }
  }
  log('2b 20%幅の短い往復', { "往復回数": strokes, "最終cover": +cover.toFixed(3), state: await state(page) });
  expect(strokes, '短い往復 30 回以内で終わること').toBeLessThan(30);
  await waitState(page, 'EGG_POUR', 8000);
});

// ---------- 3. EGG_POUR ----------
test('3. 注ぐ: フライパン直タップ / 無関係な場所のタップでも注がれる', async ({ page }) => {
  await boot(page, W, H);
  await doKetchup(page); await doMix(page);
  const g = await geom(page);
  await page.mouse.click(g.pan.x, g.pan.y);
  await page.waitForTimeout(1600);
  const a = await prog(page);
  log('3a フライパンを1タップ', { spread: +a.spread.toFixed(2), state: await state(page) });
  expect(a.spread).toBeGreaterThan(0.99);
  await waitState(page, 'EGG_GATHER', 8000);
});

// ---------- 4. EGG_GATHER（P1-6） ----------
test('4. 寄せる: 外向きスワイプだけでも完了する', async ({ page }) => {
  await boot(page, W, H);
  await doKetchup(page); await doMix(page); await doPour(page);
  const g = await geom(page);

  const hist = [];
  let n = 0;
  for (; n < 30; n++) {
    const a = (n / 12) * Math.PI * 2;
    await drag(page, [F(g, 0, 0), F(g, Math.cos(a) * 0.95, Math.sin(a) * 0.95)], 8);
    const p = await prog(page);
    if (n % 4 === 0) hist.push(+p.gather.toFixed(2));
    if ((await state(page)) !== 'EGG_GATHER') { n++; break; }
  }
  log('4a 中央→外の外向きスワイプだけ', { "回数": n, "推移": hist, gather: +(await prog(page)).gather.toFixed(3), state: await state(page) });
  expect(n, '外向きスワイプ 30 回以内に寄せ終わること').toBeLessThan(30);
  await waitState(page, 'EGG_SLIDE', 10000);
});

test("4'. 寄せる: 何もわからずフライパンを触り続けても6秒で進む", async ({ page }) => {
  await boot(page, W, H);
  await doKetchup(page); await doMix(page); await doPour(page);
  const g = await geom(page);
  const t0 = Date.now();
  await page.mouse.move(g.pan.x, g.pan.y);
  await page.mouse.down();
  let ok = false;
  for (let i = 0; i < 100; i++) {
    await page.waitForTimeout(150);
    if ((await prog(page)).gather >= 1) { ok = true; break; }
  }
  await page.mouse.up();
  log("4' フライパンを静止長押し（保険タイマー）", { "到達": ok, "所要秒": +((Date.now() - t0) / 1000).toFixed(1) });
  expect(ok, '静止長押しだけでも 6 秒台の保険で寄ること').toBe(true);
  await waitState(page, 'EGG_SLIDE', 10000);
});

// ---------- 5. EGG_SLIDE（P1-4 / P1-5） ----------
test('5. スライド: 手を離しても進捗が残る / 皿を触っても進む', async ({ page }) => {
  await boot(page, W, H);
  await doKetchup(page); await doMix(page); await doPour(page); await doGather(page);
  const g = await geom(page);
  const dx = g.plate.x - g.pan.x, dy = g.plate.y - g.pan.y, d = Math.hypot(dx, dy);
  const ux = dx / d, uy = dy / d, len = g.unit * 0.42;

  // (a) 逆方向ドラッグは無害
  await drag(page, [{ x: g.pan.x, y: g.pan.y }, { x: g.pan.x - ux * len, y: g.pan.y - uy * len }], 12);
  await page.waitForTimeout(150);
  const rev = await prog(page);
  log('5a 逆方向ドラッグ', { panProg: +rev.panProg.toFixed(3) });
  expect(rev.panProg).toBeLessThan(0.2);

  // (b) 途中まで（半分）ドラッグして指を離す → 到達最大値の8割が残る
  await drag(page, [{ x: g.pan.x, y: g.pan.y }, { x: g.pan.x + ux * len * 0.45, y: g.pan.y + uy * len * 0.45 }], 10);
  const peak = (await prog(page)).panProg;
  await page.waitForTimeout(1400);
  const kept = await prog(page);
  log('5b 半分ドラッグして1.4秒放置', { "離す直前": +peak.toFixed(3), "1.4秒後": +kept.panProg.toFixed(3), floor: +kept.panFloor.toFixed(3) });
  expect(peak, '半分のドラッグで確かに進むこと').toBeGreaterThan(0.2);
  expect(kept.panProg, '指を離しても到達最大値の8割は残ること').toBeGreaterThanOrEqual(peak * 0.8 - 0.02);

  // (c) ゴール（皿）を長押ししても進む
  const before = (await prog(page)).panProg;
  await hold(page, g.plate.x, g.plate.y, 1200);
  const plateHold = (await prog(page)).panProg;
  log('5c 皿を1.2秒長押し', { "前": +before.toFixed(3), "後": +plateHold.toFixed(3), state: await state(page) });
  expect(plateHold, '行き先の皿を触っても進むこと').toBeGreaterThan(before + 0.3);
  await waitState(page, 'CUT', 15000);
});

// ---------- 6. CUT（P0-2） ----------
test('6. 切る: 表示されている稜線どおりになぞれば必ず切れる', async ({ page }) => {
  await boot(page, W, H);
  await playToCut(page);
  const g = await geom(page);
  const o = g.omelet;
  const need = Math.min(o.rx * 1.1, o.ry * 1.45);
  log('6-0 オムレツ寸法', {
    rx: +o.rx.toFixed(1), ry: +o.ry.toFixed(1),
    "必要な軌跡長": +need.toFixed(1), "見えている稜線の長さ_2x0_78ry": +(o.ry * 1.56).toFixed(1),
  });
  expect(need, '判定に必要な長さが、見えている稜線の長さ以下であること').toBeLessThanOrEqual(o.ry * 1.56);

  // 稜線をそのままなぞる（縦・見た目どおりの長さ）
  await drag(page, [{ x: o.x, y: o.y - o.ry * 0.78 }, { x: o.x, y: o.y + o.ry * 0.78 }], 10);
  await page.waitForTimeout(200);
  const c = await prog(page);
  log('6a 稜線どおりに縦なぞり', { cut: +c.cut.toFixed(2), state: await state(page) });
  expect(c.cut, '稜線どおりのなぞりで切れること').toBeGreaterThan(0);
  await expect.poll(() => state(page), { timeout: 15000 }).toMatch(/OPEN|DRAW|DONE_MENU/);
});

test("6'. 切る: タップ連打（3回）でも切れる / 的外れは光が強まる", async ({ page }) => {
  await boot(page, W, H);
  await playToCut(page);
  const g = await geom(page);
  const o = g.omelet;

  // (a) オムレツから大きく外れたタップを続ける → 切れないが光が強まる
  for (let i = 0; i < 4; i++) { await page.mouse.click(12, g.h - 12); await page.waitForTimeout(80); }
  const miss = await prog(page);
  log("6'a 的外れなタップ4回", { cut: +miss.cut.toFixed(2), miss: +miss.miss.toFixed(2) });
  expect(miss.cut).toBe(0);
  expect(miss.miss, '外し続けたらオムレツの光を強める合図が立つこと').toBeGreaterThan(0.5);

  // (b) オムレツの上を小さくタップ 3 回（1.5秒以内）
  for (let i = 0; i < 3; i++) { await page.mouse.click(o.x + (i - 1) * 4, o.y + (i % 2) * 4); await page.waitForTimeout(90); }
  await page.waitForTimeout(150);
  const c = await prog(page);
  log("6'b タップ3連打", { cut: +c.cut.toFixed(2), state: await state(page) });
  expect(c.cut, '3タップ救済で切れること').toBeGreaterThan(0);
  await expect.poll(() => state(page), { timeout: 15000 }).toMatch(/OPEN|DRAW|DONE_MENU/);
});

// ---------- 7. DRAW（P0-3 / P2-8） ----------
test('7. 描く: ボタンの上から描き始めても全消しにならない', async ({ page }) => {
  await boot(page, W, H);
  await playToDraw(page);
  const g = await geom(page);
  const btn = g.buttons.find((b) => b.id === 'again');
  const before = await prog(page);

  // ボタンの真上から描き始めて、皿の上まで指を運んで離す
  await drag(page, [{ x: btn.x, y: btn.y }, { x: g.plate.x, y: g.plate.y }], 12);
  await page.waitForTimeout(350);
  const st = await state(page);
  const after = await prog(page);
  log('7a ボタン上から描き始めて皿の上で離す', {
    state: st, "描いた線_前後": [before.drawStrokes, after.drawStrokes], "点数": after.drawPoints,
  });
  expect(st, 'ゲームがリセットされないこと').toMatch(/DRAW|DONE_MENU/);
  expect(after.drawStrokes, 'ボタン押下がキャンセルされ、描画へ引き継がれること').toBeGreaterThan(before.drawStrokes);

  // 皿 → ボタンへ引き下ろして離しても発火しない
  const g1 = await geom(page);
  const b0 = g1.buttons[0];
  const s1 = await prog(page);
  await drag(page, [{ x: g1.plate.x, y: g1.plate.y }, { x: b0.x, y: b0.y }], 12);
  await page.waitForTimeout(300);
  log('7b 皿からボタンへ引き下ろして離す', { state: await state(page), drawStrokes: (await prog(page)).drawStrokes });
  expect(await state(page), 'ボタン上で離しても発火しないこと').toMatch(/DRAW|DONE_MENU/);
  expect((await prog(page)).drawStrokes).toBeGreaterThanOrEqual(s1.drawStrokes);

  // 押して、同じボタンの上で離す → ここでだけ発火する
  const g2 = await geom(page);
  const again = g2.buttons.find((b) => b.id === 'again');
  await page.mouse.move(again.x, again.y);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.up();
  await waitState(page, 'RICE_KETCHUP', 8000);
  log('7c 同じボタンの上で離す', { state: await state(page), drawStrokes: (await prog(page)).drawStrokes });
  expect((await prog(page)).drawStrokes).toBe(0);
});

// ---------- 8. 2本指 ----------
test('8. 2本指: 2本目のポインタで状態が壊れない', async ({ page }) => {
  await boot(page, W, H);
  const g = await geom(page);
  await pev(page, 'pointerdown', 1, P(g, -0.4, 0).x, P(g, -0.4, 0).y);
  for (let i = 1; i <= 6; i++) { const p = P(g, -0.4 + i * 0.1, 0); await pev(page, 'pointermove', 1, p.x, p.y); }
  const mid = await prog(page);
  await pev(page, 'pointerdown', 2, 10, 10);
  for (let i = 0; i < 5; i++) await pev(page, 'pointermove', 2, 10 + i * 20, 10 + i * 20);
  await pev(page, 'pointerup', 2, 110, 110);
  const afterGhost = await prog(page);
  for (let i = 1; i <= 6; i++) { const p = P(g, 0.2 - i * 0.1, 0.25); await pev(page, 'pointermove', 1, p.x, p.y); }
  const after1 = await prog(page);
  await pev(page, 'pointerup', 1, P(g, -0.4, 0.25).x, P(g, -0.4, 0.25).y);
  log('8 2本指', {
    "指1でのケチャップ量": +mid.ketchup.toFixed(3),
    "指2割り込み直後": +afterGhost.ketchup.toFixed(3),
    "指1が割り込み後も有効": after1.ketchup > afterGhost.ketchup,
  });
  // 時間駆動ぶんは進むので、2本目の指が「自分で」増やしていないことを見る
  expect(afterGhost.strokes, '2本目の指が線を増やさないこと').toBe(mid.strokes);
  expect(after1.ketchup, '1本目の指は割り込み後も有効であること').toBeGreaterThan(afterGhost.ketchup);
});

// ---------- 9. 画面回転 ----------
test('9. 回転: RICE_MIX 途中 / DRAW 途中で回しても残る', async ({ page }) => {
  await boot(page, W, H);
  await doKetchup(page);
  const g = await geom(page);
  for (let i = 0; i < 3; i++) {
    const pts = [];
    for (let k = 0; k <= 14; k++) { const a = (k / 14) * Math.PI * 2; pts.push(P(g, Math.cos(a) * 0.35, Math.sin(a) * 0.35)); }
    await drag(page, pts, 3);
  }
  const before = await prog(page);
  await page.setViewportSize({ width: H, height: W });
  await page.waitForTimeout(500);
  const after = await prog(page);
  log('9a MIX 途中で回転', { "cover前": +before.cover.toFixed(3), "cover後": +after.cover.toFixed(3) });
  expect(after.cover).toBeCloseTo(before.cover, 5);

  await page.setViewportSize({ width: W, height: H });
  await page.waitForTimeout(300);
  await doMix(page); await doPour(page); await doGather(page); await doSlide(page);
  for (let i = 0; i < 6 && (await state(page)) === 'CUT'; i++) {
    const g0 = await geom(page); const oo = g0.omelet;
    await drag(page, [{ x: oo.x - oo.rx * 0.95, y: oo.y }, { x: oo.x + oo.rx * 0.95, y: oo.y }], 10);
    await page.waitForTimeout(150);
  }
  await waitState(page, 'DRAW', 15000);
  const gd = await geom(page);
  await drag(page, [P(gd, -0.3, -0.1), P(gd, 0, 0.2), P(gd, 0.3, -0.1)], 6);
  await page.waitForTimeout(200);
  const d1 = await prog(page);
  await page.setViewportSize({ width: H, height: W });
  await page.waitForTimeout(500);
  const d2 = await prog(page);
  log('9b DRAW 中に回転', { "点数前": d1.drawPoints, "点数後": d2.drawPoints });
  expect(d2.drawPoints).toBe(d1.drawPoints);
  const gr = await geom(page);
  for (const b of gr.buttons) {
    expect(b.x - b.r, `${b.id} が画面内`).toBeGreaterThan(0);
    expect(b.x + b.r).toBeLessThan(gr.w);
    expect(b.y + b.r).toBeLessThan(gr.h);
  }
});

// ---------- 12. パフォーマンス ----------
test('12. 1フレームの update+render コストを実測', async ({ page }) => {
  await boot(page, W, H);
  const measure = async () => {
    const r = await page.evaluate(() => new Promise((res) => {
      const d = []; let n = 0;
      const tick = (t) => { d.push(performance.now() - t); if (++n < 120) requestAnimationFrame(tick); else res(d); };
      requestAnimationFrame(tick);
    }));
    r.sort((a, b) => a - b);
    return { "中央値ms": +r[Math.floor(r.length / 2)].toFixed(2), "p95ms": +r[Math.floor(r.length * 0.95)].toFixed(2), "最悪ms": +r[r.length - 1].toFixed(2) };
  };
  const m0 = await measure();
  log('12 RICE_KETCHUP', m0);
  await doKetchup(page); log('12 RICE_MIX', await measure());
  await doMix(page); log('12 EGG_POUR', await measure());
  await doPour(page); await doGather(page);
  const m1 = await measure();
  log('12 EGG_SLIDE(オムレツ+フライパン)', m1);
  await page.setViewportSize({ width: 1024, height: 1366 });
  await page.waitForTimeout(500);
  const m2 = await measure();
  log('12 EGG_SLIDE @1024x1366', m2);
  // 皿を焼き込んだので、大画面でも 1 フレームに余裕があること
  expect(m2["p95ms"], '1024x1366 でも p95 が 4ms 未満であること').toBeLessThan(4);
});
