// 自動検証: 3ビューポートで起動 → 文字要素が無い → ドラッグで発射しブロックが減る → 巻き戻し/クリアの遷移
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
mkdirSync('test/out', { recursive: true });

const VIEWPORTS = [
  { name: 'iphone-portrait', width: 390, height: 844 },
  { name: 'iphone-landscape', width: 844, height: 390 },
  { name: 'ipad-portrait', width: 820, height: 1180 },
];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failures = 0;
const check = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) failures++; };

for (const vp of VIEWPORTS) {
  console.log(`\n== ${vp.name} ${vp.width}x${vp.height}`);
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + resolve('index.html'));
  await page.waitForFunction(() => window.__game && window.__game.state === 'play', null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const g = () => page.evaluate(() => ({ s: window.__game.state, lv: window.__game.level, n: window.__game.blocks.count(), rack: window.__game.balls.rackCount(), fly: window.__game.balls.flyingCount() }));

  // Wordless: DOM に可視テキストが無い
  const text = await page.evaluate(() => document.body.innerText.trim());
  check(text.length === 0, `no visible text in DOM ("${text}")`);
  check(errors.length === 0, `no page errors ${errors.length ? JSON.stringify(errors) : ''}`);

  const before = await g();
  await page.screenshot({ path: `test/out/${vp.name}-1-start.png` });

  if (vp.name === 'iphone-portrait') {
    // 誘い: 触らずに待つとデモ（指の影）が走り、エラー無く戻る
    await page.waitForTimeout(7600);
    await page.screenshot({ path: `test/out/${vp.name}-0-invite.png` });
    check(errors.length === 0, 'invite demo ran without errors');
    // 台のボールをタップすると入れ替わる（レベル1は全部しろなので型は同じ。エラー無しを確認）
    await page.evaluate(() => window.__game.startLevel(3));
    await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 15000 });
    await page.waitForTimeout(400);
    const curBefore = await page.evaluate(() => window.__game.balls.currentType());
    const pos = await page.evaluate(() => window.__game.balls.rackScreenPositions().find((p) => p.type === 'I'));
    check(!!pos, 'iron ball is on the rack in level 4');
    if (pos) {
      const cdp0 = await page.context().newCDPSession(page);
      await cdp0.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pos.x, y: pos.y, id: 1 }] });
      await cdp0.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(600);
      const curAfter = await page.evaluate(() => window.__game.balls.currentType());
      check(curBefore === 'W' && curAfter === 'I', `tap on rack ball swaps it into the sling (${curBefore} -> ${curAfter})`);
      await page.screenshot({ path: `test/out/${vp.name}-0-swap.png` });
    }
    await page.evaluate(() => window.__game.startLevel(0));
    await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 15000 });
    await page.waitForTimeout(400);
  }

  // 引いて放つ: 画面中央下から下方向へドラッグ
  const drag = async (dx, dy) => {
    const x = vp.width / 2, y = vp.height * 0.78;
    const cdp = await page.context().newCDPSession(page);
    const tp = (type, xx, yy) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: xx, y: yy, id: 1 }] });
    await tp('touchStart', x, y);
    for (let i = 1; i <= 8; i++) { await tp('touchMove', x + dx * i / 8, y + dy * i / 8); await page.waitForTimeout(30); }
    await page.screenshot({ path: `test/out/${vp.name}-2-aim.png` });
    await tp('touchEnd', 0, 0);
  };
  await drag(0, vp.height * 0.16);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `test/out/${vp.name}-3-flight.png` });
  await page.waitForTimeout(2500);
  const after1 = await g();
  await page.screenshot({ path: `test/out/${vp.name}-4-after.png` });
  check(after1.rack === before.rack - 1, `ball consumed (${before.rack} -> ${after1.rack})`);
  check(after1.n < before.n, `blocks decreased (${before.n} -> ${after1.n})`);

  // 残りを撃ち尽くしてクリアか巻き戻しのどちらかへ遷移する
  for (let i = 0; i < 12; i++) {
    const st = await g();
    if (st.s !== 'play') break;
    if (st.rack === 0) { await page.waitForTimeout(800); continue; }
    await drag((Math.random() - 0.5) * vp.width * 0.2, vp.height * (0.1 + Math.random() * 0.1));
    await page.waitForTimeout(1600);
  }
  const t0 = Date.now();
  let st;
  while (Date.now() - t0 < 12000) { st = await g(); if (st.s !== 'play' || st.lv !== before.lv) break; await page.waitForTimeout(300); }
  check(st.s !== 'play' || st.lv !== before.lv, `transition happened (state=${st.s}, lv=${st.lv}, n=${st.n})`);
  await page.screenshot({ path: `test/out/${vp.name}-5-transition.png` });
  await page.waitForFunction(() => window.__game.state === 'play', null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  const fin = await g();
  await page.screenshot({ path: `test/out/${vp.name}-6-next.png` });
  check(fin.s === 'play' && fin.n > 0 && fin.rack > 0, `back to play (lv=${fin.lv}, n=${fin.n}, rack=${fin.rack})`);
  check(errors.length === 0, `still no page errors ${errors.length ? JSON.stringify(errors.slice(0, 3)) : ''}`);
  await page.close();
}
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
