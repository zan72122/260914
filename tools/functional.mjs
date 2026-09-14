// 動作テスト: 折りの阻止・2段階の折り・ヒント・ページめくり を headless で検証する。
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';

const srv = spawn('npx', ['http-server', '.', '-p', '8124', '-s'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:8124/index.html');
await page.waitForTimeout(500);
const tile = (u, v) => page.evaluate(([u, v]) => { const G = window.__game.G; return [G.px + G.M + u * G.T, G.py + G.M + v * G.T]; }, [u, v]);
const state = () => page.evaluate(() => { const G = window.__game.G; return { level: G.levelIndex, fold: G.fold, phase: G.phase, hana: { r: G.hana.r, c: G.hana.c }, theta: { ...G.theta }, hint: G.hint && G.hint.side, thumbs: G.thumbs.length }; });
async function drag(a, b) {
  await page.mouse.move(a[0], a[1]);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(800);
}
async function tap(u, v, wait = 2500) { const p = await tile(u, v); await page.mouse.click(p[0], p[1]); await page.waitForTimeout(wait); }
let fails = 0;
const check = (name, cond, info) => { console.log((cond ? 'ok  ' : 'NG  ') + name, cond ? '' : JSON.stringify(info)); if (!cond) fails++; };

// 8面: ハナが右端に立っていると折れない
await page.evaluate(() => window.__game.loadLevel(7));
await page.waitForTimeout(200);
await drag(await tile(3.5, 1.5), await tile(1.5, 1.5));
let s = await state();
check('L8 fold blocked while Hana on flap', s.fold === null, s);
await tap(1, 1);
await drag(await tile(3.5, 2.5), await tile(1.5, 2.5));
s = await state();
check('L8 fold succeeds after Hana moved', s.fold === 'R', s);
await tap(0, 3, 7500);
s = await state();
check('L8 reaches goal and turns page', s.level === 8 && (s.phase === 'play' || s.phase === 'turn'), s);

// 7面: 右→歩く→戻す→下
await page.evaluate(() => window.__game.loadLevel(6));
await page.waitForTimeout(200);
await drag(await tile(3.5, 2.5), await tile(1.5, 2.5));
await tap(1, 1);
s = await state();
check('L7 first leg: fold R and walk to (1,1)', s.fold === 'R' && s.hana.r === 1 && s.hana.c === 1, s);
await drag(await tile(2.5, 0.5), await tile(4.5, 0.5));
s = await state();
check('L7 unfold R', s.fold === null, s);
await drag(await tile(2.5, 3.5), await tile(2.5, 1.5));
s = await state();
check('L7 fold B', s.fold === 'B', s);
await tap(3, 0, 7500);
s = await state();
check('L7 solved -> level 8', s.level === 7, s);

// ヒント: 無操作でめくれる
await page.evaluate(() => { window.__game.loadLevel(0); window.__game.G.nextHintAt = window.__game.G.time + 0.3; });
let maxR = 0; let hintSide = null;
for (let i = 0; i < 20; i++) { await page.waitForTimeout(80); const st = await state(); maxR = Math.max(maxR, st.theta.R); hintSide = hintSide || st.hint; }
check('hint wiggles R on level 1', hintSide === 'R' && maxR > 0.3, { maxR, hintSide });

// 途中で離すと戻る
await page.waitForTimeout(1200);
await page.evaluate(() => { window.__game.G.nextHintAt = 1e9; });
await drag(await tile(3.5, 1.5), await tile(3.0, 1.5));
s = await state();
check('release early -> springs back', s.fold === null && s.theta.R < 0.3, s);

// 紙の束をタップで前の面へ
await page.evaluate(() => window.__game.loadLevel(0));
const before = (await state()).thumbs;
await drag(await tile(3.5, 1.5), await tile(1.5, 1.5));
await tap(0, 3, 7500);
s = await state();
check('L1 cleared -> L2 with one more thumb', s.level === 1 && s.thumbs === before + 1, s);
await page.evaluate(() => { const G = window.__game.G; return [G.stack.x, G.stack.y]; }).then(async ([x, y]) => { await page.mouse.click(x, y); await page.waitForTimeout(1500); });
s = await state();
check('tap stack -> back to L1', s.level === 0 && s.thumbs === before, s);

// 最終面→フィナーレ→再スタート
await page.evaluate(() => window.__game.loadLevel(10));
await page.waitForTimeout(3000);
await tap(2, 2, 1500);
s = await state();
check('finale tap restarts', s.level === 0 && s.phase === 'play', s);

await browser.close();
srv.kill();
if (errors.length) { console.log('page errors:', errors); fails++; }
console.log(fails ? `${fails} check(s) failed` : 'all checks passed');
process.exit(fails ? 1 : 0);
