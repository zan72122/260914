// Playwright 自動試遊: iPhone 縦横の 2 パターンで、実際の指操作だけで Stage 0 → 5 を一周し
// 各ステージ到達時にスクリーンショットを保存する。
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* NODE_PATH 未設定 */ }
  return require('/opt/node22/lib/node_modules/playwright');
}
const { chromium } = loadPlaywright();

const PORT = 4173;
const URL = `http://127.0.0.1:${PORT}/`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- preview サーバ ----------------
function startServer() {
  const proc = spawn(process.execPath, [
    path.join(ROOT, 'node_modules/vite/bin/vite.js'),
    'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'
  ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.on('data', () => {});
  proc.stderr.on('data', (d) => process.stderr.write('[preview] ' + d));
  return proc;
}

async function waitServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(URL);
      if (r.ok) return true;
    } catch (e) {}
    await sleep(200);
  }
  throw new Error('preview server did not start');
}

// ---------------- 指（CDP の本物のタッチイベント） ----------------
function makeFinger(cdp) {
  const pt = (x, y) => [{ x: Math.round(x), y: Math.round(y), id: 1, radiusX: 12, radiusY: 12, force: 1 }];
  return {
    async down(x, y) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x, y) }); },
    async move(x, y) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x, y) }); },
    async up() { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
  };
}

// タップは Playwright の公開 API（page.touchscreen）で。
// ドラッグ／こすり／長押しは touchscreen に相当する API が無いため CDP の本物のタッチイベントを使う。
async function tap(page, x, y) { await page.touchscreen.tap(Math.round(x), Math.round(y)); await sleep(90); }

async function longPress(f, x, y, ms = 1400) {
  // 指は動かさずに押さえたまま待つ（長押しは rAF で判定される）
  await f.down(x, y);
  await sleep(ms);
  await f.up();
  await sleep(200);
}

async function stroke(f, pts, stepMs = 16, probe = null) {
  await f.down(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    await f.move(pts[i][0], pts[i][1]);
    if (probe && i % 2 === 0) await probe();   // ステージ遷移を見逃さないよう途中でも確認
    await sleep(stepMs);
  }
  await f.up();
  await sleep(40);
}

/** 小さな往復 = こする */
function rubPath(cx, cy, len, angle, cycles) {
  const pts = [];
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const steps = 3;
  pts.push([cx - dx * len / 2, cy - dy * len / 2]);
  for (let c = 0; c < cycles; c++) {
    for (let s = 1; s <= steps; s++) {
      const u = -0.5 + s / steps;
      pts.push([cx + dx * len * u, cy + dy * len * u]);
    }
    for (let s = 1; s <= steps; s++) {
      const u = 0.5 - s / steps;
      pts.push([cx + dx * len * u, cy + dy * len * u]);
    }
  }
  return pts;
}

/** 石の上をまんべんなく撫でるストローク群（削る・丸める・磨く用） */
function sweepPaths(cx, cy, r) {
  const paths = [];
  for (let i = 0; i < 7; i++) {
    const y = cy - r * 0.82 + (i / 6) * r * 1.64;
    const half = Math.sqrt(Math.max(0.02, r * r - (y - cy) * (y - cy))) * 0.98;
    const pts = [];
    const n = 6;
    for (let s = 0; s <= n; s++) {
      const u = -1 + (2 * s) / n;
      pts.push([cx + u * half, y + Math.sin(s * 1.4) * r * 0.06]);
    }
    paths.push(i % 2 ? pts.reverse() : pts);
  }
  // 円を描く（Stage 3 の「ぐるぐる」）
  for (const rr of [0.35, 0.62, 0.85]) {
    const pts = [];
    for (let s = 0; s <= 12; s++) {
      const a = (s / 12) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * r * rr, cy + Math.sin(a) * r * rr]);
    }
    paths.push(pts);
  }
  return paths;
}

// ---------------- 1 方向ぶんの試遊 ----------------
async function runOrientation(browser, label, viewport, outDir, log) {
  fs.mkdirSync(outDir, { recursive: true });
  const ctx = await browser.newContext({
    viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`  [pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) log(`  [console.error] ${m.text()}`); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.getStats, null, { timeout: 20000 });
  await sleep(900);

  const cdp = await ctx.newCDPSession(page);
  const f = makeFinger(cdp);

  const stats = () => page.evaluate(() => window.__game.getStats());
  const screen = () => page.evaluate(() => window.__game.stoneScreen());

  const seen = {};
  const results = [];
  async function shot(stage, extraWait = 350) {
    if (seen[stage]) return;
    seen[stage] = true;
    await sleep(extraWait);
    const s = await stats();
    const p = path.join(outDir, `stage${stage}.png`);
    await page.screenshot({ path: p });
    results.push({ stage, stats: s, file: p });
    log(`  > stage ${stage} 到達  ${JSON.stringify(s)}`);
    log(`    screenshot: ${path.relative(ROOT, p)}`);
  }
  /** 今のステージを見て、初到達ならスクリーンショットを撮る */
  async function sync() {
    const s = await stats();
    if (!seen[s.stage]) await shot(s.stage, 300);
    return s;
  }

  await shot(0, 600);

  // ---- Stage 0: 触る（音の unlock）→ こすって窓を開ける ----
  let sc = await screen();
  await tap(page, sc.x, sc.y);
  for (let i = 0; i < 4 && (await sync()).stage === 0; i++) {
    sc = await screen();
    const a = (i / 4) * Math.PI;
    await stroke(f, rubPath(sc.x + (i - 1.5) * sc.r * 0.26, sc.y - sc.r * 0.12, sc.r * 0.5, a, 4), 4);
  }
  log(`  窓を開けた: ${JSON.stringify(await stats())}`);

  // ---- Stage 0: 転がして良い向きを探す（align を見ながら転がす） ----
  const t0 = Date.now();
  while ((await sync()).stage === 0 && Date.now() - t0 < 180000) {
    sc = await screen();
    const ang = Math.random() * Math.PI * 2;
    const L = sc.r * (0.8 + Math.random() * 1.3);
    const ux = Math.cos(ang), uy = Math.sin(ang);
    await f.down(sc.x - ux * L / 2, sc.y - uy * L / 2);
    let near = false;
    for (let k = 1; k <= 5; k++) {
      await f.move(sc.x - ux * L / 2 + ux * L * (k / 5), sc.y - uy * L / 2 + uy * L * (k / 5));
      if ((await stats()).align > 0.42) { near = true; break; }
    }
    await f.up();
    await sleep(60);
    if (near) {
      // 吸い寄せが効く圏内。軽く触り続けて石が向きを合わせるのを待つ
      for (let k = 0; k < 30 && (await sync()).stage === 0; k++) {
        sc = await screen();
        await tap(page, sc.x, sc.y);
        await sleep(90);
      }
    }
  }

  // ---- Stage 1: 長押しで固定 ----
  for (let k = 0; k < 10 && (await sync()).stage === 1; k++) {
    sc = await screen();
    await longPress(f, sc.x, sc.y, 1500);
    await sleep(350);
  }

  // ---- 途中で縦→横→縦に切り替えて、Stone の状態が保たれることを確認する ----
  if (label === 'portrait') {
    const before = await stats();
    await page.setViewportSize({ width: 844, height: 390 });
    await sleep(1100);
    const mid = await stats();
    await page.screenshot({ path: path.join(outDir, 'rotate-check-landscape.png') });
    await page.setViewportSize(viewport);
    await sleep(1100);
    const after = await stats();
    const kept = before.seed === mid.seed && mid.seed === after.seed &&
      mid.stage === before.stage && after.stage === before.stage &&
      Math.abs(mid.grindAvg - before.grindAvg) < 0.03 &&
      Math.abs(after.windowAvg - before.windowAvg) < 0.03;
    log(`  [縦→横→縦 切替] 状態保持: ${kept ? 'OK' : 'NG'}`);
    log(`    before=${JSON.stringify(before)}`);
    log(`    land  =${JSON.stringify(mid)}`);
    log(`    after =${JSON.stringify(after)}`);
  }

  // ---- Stage 2〜4: こすり続ける ----
  for (const target of [3, 4, 5]) {
    const tStart = Date.now();
    let guard = 0;
    while ((await sync()).stage < target && Date.now() - tStart < 400000) {
      sc = await screen();
      for (const pts of sweepPaths(sc.x, sc.y, sc.r * 0.95)) {
        await stroke(f, pts, 4, sync);
        if ((await sync()).stage >= target) break;
      }
      guard++;
      if (guard % 3 === 0) log(`  ...${JSON.stringify(await stats())}`);

    }
    await sync();
  }

  // ---- Stage 5: 傾けて星を滑らせる / タップで煌めき ----
  sc = await screen();
  await stroke(f, [[sc.x - 120, sc.y + 40], [sc.x - 60, sc.y + 20], [sc.x + 40, sc.y - 10], [sc.x + 120, sc.y - 30]], 40);
  await tap(page, sc.x, sc.y);
  await sleep(700);
  await page.screenshot({ path: path.join(outDir, 'stage5-play.png') });
  log(`  完成後: ${JSON.stringify(await stats())}`);

  await ctx.close();
  return results;
}

// ---------------- main ----------------
(async () => {
  if (!fs.existsSync(CHROME)) throw new Error(`chromium not found: ${CHROME}`);
  const lines = [];
  const LOG = path.join(ROOT, 'docs/screens/playtest.log');
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.writeFileSync(LOG, '');
  const log = (s) => { console.log(s); lines.push(s); try { fs.appendFileSync(LOG, s + '\n'); } catch (e) {} };

  const server = startServer();
  let browser;
  try {
    await waitServer();
    browser = await chromium.launch({
      executablePath: CHROME,
      headless: true,
      args: [
        '--no-sandbox', '--disable-gpu-sandbox',
        '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--enable-webgl', '--ignore-gpu-blocklist',
        '--disable-dev-shm-usage'
      ]
    });

    log('=== 縦 (390x844) ===');
    const p = await runOrientation(browser, 'portrait',
      { width: 390, height: 844 }, path.join(ROOT, 'docs/screens/portrait'), log);
    log('=== 横 (844x390) ===');
    const l = await runOrientation(browser, 'landscape',
      { width: 844, height: 390 }, path.join(ROOT, 'docs/screens/landscape'), log);

    log('');
    log('=== まとめ ===');
    for (const [name, res] of [['portrait', p], ['landscape', l]]) {
      log(`[${name}] 到達ステージ: ${res.map((r) => r.stage).join(' → ')}`);
      for (const r of res) log(`  stage${r.stage}: ${JSON.stringify(r.stats)}`);
    }
    const ok = p.length === 6 && l.length === 6;
    log(ok ? 'RESULT: OK (縦横とも Stage 0〜5 を一周)' : 'RESULT: 未達あり');
    if (!ok) process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill('SIGTERM');
  }
})().catch((e) => { console.error(e); process.exit(1); });
