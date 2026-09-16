// tools/playthrough.mjs
// 実機と同じ PointerEvent を合成して、最初から炎まで自動で通しプレイする。
// 依存は playwright のみ（グローバル導入でも可）。静的サーバーは自前で立てる。
//
//   npm test
//   SHOT_DIR=/path/to/shots npm test

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import url, { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_DIR = process.env.SHOT_DIR || path.join(os.tmpdir(), 'hinoko-shots');
const PORT = Number(process.env.PORT || 8123);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

async function loadPlaywright() {
  // ESM の bare import は NODE_PATH を見ないので、グローバル導入も明示的にたどる
  const cands = ['playwright'];
  for (const base of (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)) {
    cands.push(path.join(base, 'playwright', 'index.mjs'));
  }
  cands.push('/opt/node22/lib/node_modules/playwright/index.mjs');
  for (const spec of cands) {
    try { return await import(spec.startsWith('/') ? url.pathToFileURL(spec).href : spec); } catch (_) {}
  }
  throw new Error('playwright が見つかりません');
}

function startServer() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(PORT, '127.0.0.1', () => r(server)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 弓の列を、左右に行ったり来たりドラッグする（＝シュッシュッ）
async function strokes(page, n) {
  const L = await page.evaluate(() => window.__game.layout);
  const y = L.bowY;
  const amp = Math.min(L.travel * 1.05, L.w * 0.34);
  let x = L.bowX;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 0; i < n; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    const target = L.bowX + dir * amp;
    const steps = 8;
    for (let k = 1; k <= steps; k++) {
      const nx = x + (target - x) * (k / steps);
      // ななめ・ふらつきを混ぜて「4歳の指」を模す
      await page.mouse.move(nx, y + Math.sin(i + k) * 14);
      await sleep(8);
    }
    x = target;
    const ph = await page.evaluate(() => window.__game.phase);
    if (ph !== 'drill') break;
  }
  await page.mouse.up();
}

async function shot(page, dir, name) {
  await page.screenshot({ path: path.join(dir, name) });
  return path.join(dir, name);
}

async function playOne(browser, pw, device) {
  const ctx = await browser.newContext({
    viewport: { width: device.w, height: device.h },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  const dir = path.join(SHOT_DIR, device.name);
  fs.mkdirSync(dir, { recursive: true });
  const shots = [];

  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.waitForFunction(() => !!window.__game);
  await sleep(700);
  shots.push(await shot(page, dir, '01-initial.png'));

  // --- きりもみ：木粉 → 黒く → 煙 → 火種 --------------------------------
  let guard = 0;
  let gotDust = false, gotSmoke = false;
  while (guard++ < 12) {
    await strokes(page, 6);
    const st = await page.evaluate(() => ({ p: window.__game.progress, ph: window.__game.phase, s: window.__game.strokeCount }));
    if (!gotDust && st.p > 0.12) { gotDust = true; shots.push(await shot(page, dir, '02-dust.png')); }
    if (!gotSmoke && st.p > 0.55) { gotSmoke = true; shots.push(await shot(page, dir, '03-smoke.png')); }
    if (st.ph !== 'drill') break;
    await sleep(60);
  }
  const afterDrill = await page.evaluate(() => ({ p: window.__game.progress, ph: window.__game.phase, s: window.__game.strokeCount }));
  if (afterDrill.ph !== 'ember') throw new Error(`${device.name}: 火種まで到達しなかった ${JSON.stringify(afterDrill)}`);
  await sleep(500);
  shots.push(await shot(page, dir, '04-ember.png'));

  // --- 火種を火口へ運ぶ -------------------------------------------------
  // 火種が出たあとも弓の列を擦りつづける子を想定：
  // 火種から遠い「弓の列」でドラッグを始めても、火種が浮いてついてくること。
  const L = await page.evaluate(() => window.__game.layout);
  await page.mouse.move(L.bowX - L.travel * 0.8, L.bowY);
  await page.mouse.down();
  await sleep(120);
  const grabbed = await page.evaluate(() => window.__game.phase);
  if (grabbed !== 'carry') {
    throw new Error(`${device.name}: 弓の列のドラッグで火種をつかめなかった（phase=${grabbed}）`);
  }
  // 火口の手前まで運んで、とちゅうで手をはなす（残りは自動で飛ぶ）
  const fromX = L.bowX - L.travel * 0.8, fromY = L.bowY;
  const midX = (fromX + L.nest.x) / 2, midY = (fromY + L.nest.y) / 2;
  for (let k = 1; k <= 12; k++) {
    await page.mouse.move(fromX + (midX - fromX) * (k / 12), fromY + (midY - fromY) * (k / 12));
    await sleep(16);
  }
  await page.mouse.up();
  await page.waitForFunction(() => window.__game.phase === 'blow', null, { timeout: 8000 });
  await sleep(400);
  shots.push(await shot(page, dir, '05-carry-done.png'));

  // --- 息を吹きこむ（タップ3回）----------------------------------------
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(L.nest.x, L.nest.y);
    await page.mouse.down();
    await sleep(80);
    await page.mouse.up();
    if (i === 0) { await sleep(150); shots.push(await shot(page, dir, '06-blow.png')); }
    await sleep(550);
    if (await page.evaluate(() => window.__game.phase) === 'flame') break;
  }
  await page.waitForFunction(() => window.__game.phase === 'flame', null, { timeout: 8000 });
  await sleep(1500);
  shots.push(await shot(page, dir, '07-flame.png'));

  const final = await page.evaluate(() => ({ ph: window.__game.phase, s: window.__game.strokeCount }));

  // 炎のあとは、どこを触ってもふわっと最初にもどる
  await sleep(3000);
  await page.mouse.move(device.w * 0.5, device.h * 0.5);
  await page.mouse.down(); await sleep(60); await page.mouse.up();
  await page.waitForFunction(() => window.__game.phase === 'drill' && window.__game.progress === 0,
                             null, { timeout: 5000 });
  shots.push(await shot(page, dir, '08-restart.png'));

  // 途中で画面を回しても状態は消えない
  await strokes(page, 6);
  const before = await page.evaluate(() => window.__game.progress);
  await page.setViewportSize({ width: device.h, height: device.w });
  await sleep(400);
  const after = await page.evaluate(() => ({ p: window.__game.progress, m: window.__game.layout.mode }));
  if (after.p < before) throw new Error(`${device.name}: 画面回転で進捗が減った ${before} -> ${after.p}`);
  shots.push(await shot(page, dir, '09-rotated.png'));

  await ctx.close();
  return { device: device.name, strokes: final.s, errors, shots };
}

const DEVICES = [
  { name: 'iphone-portrait', w: 390, h: 844 },
  { name: 'iphone-landscape', w: 844, h: 390 },
  { name: 'ipad-landscape', w: 1180, h: 820 },
  { name: 'ipad-portrait', w: 820, h: 1180 },
];

const pw = await loadPlaywright();
const server = await startServer();
const browser = await pw.chromium.launch();
let failed = false;
for (const d of DEVICES) {
  try {
    const r = await playOne(browser, pw, d);
    const bad = r.errors.length;
    console.log(`✔ ${r.device}: 炎まで到達（ストローク ${r.strokes} 回）` + (bad ? ` / console errors: ${r.errors.join(' | ')}` : ''));
    r.shots.forEach((s) => console.log('   ' + s));
    if (bad) failed = true;
  } catch (e) {
    failed = true;
    console.error(`✘ ${d.name}: ${e.message}`);
  }
}
await browser.close();
server.close();
console.log(failed ? 'NG' : 'OK');
process.exit(failed ? 1 : 0);
