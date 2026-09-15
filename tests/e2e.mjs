// tests/e2e.mjs — F1/F2 verification. No npm dependencies: uses node's http server
// and the globally installed Playwright (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers).
//
//   node tests/e2e.mjs
//   SHOT_DIR=/tmp/shots node tests/e2e.mjs

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_DIR = process.env.SHOT_DIR || path.join(ROOT, '.shots');
const PORT = Number(process.env.PORT || 8080);
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json'
};

/* ------------------------------- harness ------------------------------- */

const failures = [];
let checks = 0;
function ok(cond, label, extra = '') {
  checks++;
  if (cond) console.log(`  PASS  ${label}`);
  else { failures.push(label); console.log(`  FAIL  ${label} ${extra}`); }
}

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end(); return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(PORT, '127.0.0.1', () => r(server)));
}

async function loadPlaywright() {
  const tryLoad = async (spec) => {
    try {
      const m = await import(spec);
      return m.chromium || m.default?.chromium || null;
    } catch (_) { return null; }
  };
  let chromium = await tryLoad('playwright');
  if (!chromium) {
    const globalRoot = execSync('npm root -g').toString().trim();
    for (const rel of ['playwright/index.js', 'playwright/index.mjs', 'playwright-core/index.js']) {
      chromium = await tryLoad(pathToFileURL(path.join(globalRoot, rel)).href);
      if (chromium) break;
    }
  }
  if (!chromium) throw new Error('playwright (chromium) not found');
  return { chromium };
}

/* ------------------------------ utilities ------------------------------ */

const BASE = `http://127.0.0.1:${PORT}/`;

function watchConsole(page, sink) {
  page.on('console', (m) => { if (m.type() === 'error') sink.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => sink.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => sink.push(`requestfailed: ${r.url()}`));
}

async function ready(page) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
}

const state = (page) => page.evaluate(() => ({
  cells: window.__game.board.snapshot().cells,
  zoom: window.__game.board.snapshot().zoom
}));

/** Centre of a cell, in page coordinates. */
const cellPoint = (page, r, c) => page.evaluate(([r, c]) => {
  const b = window.__game.board;
  const g = b.cellGeom(r, c);
  const box = b.boardEl.getBoundingClientRect();
  return { x: box.left + g.x + g.size / 2, y: box.top + g.y + g.size / 2 };
}, [r, c]);

/** A point inside a tile expressed in its own 0..1000 SVG coordinates. */
const svgPoint = (page, tileId, sx, sy) => page.evaluate(([id, sx, sy]) => {
  const b = window.__game.board;
  const t = b.tiles.get(id);
  const at = b.locate(id);
  const g = b.cellGeom(at.r, at.c);
  const box = b.boardEl.getBoundingClientRect();
  const vb = t.svg.getAttribute('viewBox').split(/\s+/).map(Number);
  return {
    x: box.left + g.x + ((sx - vb[0]) / vb[2]) * g.size,
    y: box.top + g.y + ((sy - vb[1]) / vb[3]) * g.size
  };
}, [tileId, sx, sy]);

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 12, from.y + 12, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(420);
}

/* -------------------------------- suite -------------------------------- */

const SIZES = [
  { name: 'iphone-portrait-390x844', width: 390, height: 844 },
  { name: 'iphone-landscape-844x390', width: 844, height: 390 },
  { name: 'ipad-1024x1366', width: 1024, height: 1366 }
];

const server = await serve();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const errors = [];
fs.mkdirSync(SHOT_DIR, { recursive: true });

try {
  /* --- 1. layout across the three required viewports --- */
  console.log('\n[1] layout / screenshots');
  for (const s of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    watchConsole(page, errors);
    await ready(page);
    await page.waitForTimeout(250);
    const shot = path.join(SHOT_DIR, `${s.name}.png`);
    await page.screenshot({ path: shot });

    const m = await page.evaluate(() => {
      const r = document.getElementById('board').getBoundingClientRect();
      return { w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2,
               vw: innerWidth, vh: innerHeight, tiles: document.querySelectorAll('.tile').length };
    });
    ok(Math.abs(m.w - m.h) < 1, `${s.name}: board is square (${m.w.toFixed(1)}x${m.h.toFixed(1)})`);
    ok(Math.abs(m.cx - m.vw / 2) < 1.5 && Math.abs(m.cy - m.vh / 2) < 1.5, `${s.name}: board is centred`);
    ok(m.w <= 900.5, `${s.name}: board <= 900px (${m.w.toFixed(1)})`);
    ok(m.w <= Math.min(m.vw, m.vh) + 0.5, `${s.name}: board fits the short side`);
    ok(m.tiles === 4, `${s.name}: 4 tiles rendered`);
    console.log(`        -> ${shot}`);
    await ctx.close();
  }

  /* --- 2. interaction --- */
  console.log('\n[2] interaction');
  const ctx = await browser.newContext({ viewport: { width: 844, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  const page = await ctx.newPage();
  watchConsole(page, errors);
  await ready(page);

  let s0 = await state(page);
  ok(JSON.stringify(s0.cells) === JSON.stringify([[['T3'], ['T2']], [['T1'], ['T4']]]),
     'initial placement T3/T2/T1/T4', JSON.stringify(s0.cells));

  // 2a. stack: T3 onto T1 (T1 has the window hole) -> T3 slides underneath
  await drag(page, await cellPoint(page, 0, 0), await cellPoint(page, 1, 0));
  let s1 = await state(page);
  ok(JSON.stringify(s1.cells[1][0]) === '["T3","T1"]', 'T3 slid under T1 (stack, hole)', JSON.stringify(s1.cells));
  ok(s1.cells[0][0].length === 0, 'top-left cell is now empty');
  await page.screenshot({ path: path.join(SHOT_DIR, 'step-stacked.png') });

  // 2b. move: T2 into the now empty cell above T1
  await drag(page, await cellPoint(page, 0, 1), await cellPoint(page, 0, 0));
  let s2 = await state(page);
  ok(JSON.stringify(s2.cells[0][0]) === '["T2"]', 'T2 moved into the empty cell', JSON.stringify(s2.cells));
  ok(s2.cells[0][1].length === 0, 'vacated cell is empty');

  // 2c. reject: T4 dropped on T2 (no hole) -> returns home
  await drag(page, await cellPoint(page, 1, 1), await cellPoint(page, 0, 0));
  let s3 = await state(page);
  ok(JSON.stringify(s3.cells[1][1]) === '["T4"]', 'drop on a hole-less tile floats back home', JSON.stringify(s3.cells));

  // 2d. reject: drag outside the board -> returns home
  await drag(page, await cellPoint(page, 1, 1), { x: 5, y: 5 });
  let s4 = await state(page);
  ok(JSON.stringify(s4.cells[1][1]) === '["T4"]', 'drop outside the board floats back home', JSON.stringify(s4.cells));

  // 2e. zoom in: tap the pot portal inside T1
  const pot = await svgPoint(page, 'T1', 700, 600);
  await page.mouse.move(pot.x, pot.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(600);
  let s5 = await state(page);
  ok(s5.zoom.T1 === 1, 'tapping the pot portal zooms T1 in', JSON.stringify(s5.zoom));
  await page.screenshot({ path: path.join(SHOT_DIR, 'step-zoomed.png') });

  // 2f. zoom out: drag the zoomed tile out of its frame (it must not move)
  await drag(page, await cellPoint(page, 1, 0), { x: 20, y: 20 });
  let s6 = await state(page);
  ok(s6.zoom.T1 === 0, 'dragging a zoomed tile out of its frame zooms out', JSON.stringify(s6.zoom));
  ok(JSON.stringify(s6.cells[1][0]) === '["T3","T1"]', 'a zoomed tile does not move', JSON.stringify(s6.cells));

  /* --- 3. wordless --- */
  console.log('\n[3] wordless');
  const text = await page.evaluate(() => document.body.innerText.trim());
  ok(text === '', 'document.body.innerText.trim() === ""', JSON.stringify(text));
  const svgText = await page.evaluate(() => document.querySelectorAll('svg text, svg tspan').length);
  ok(svgText === 0, 'no <text>/<tspan> in any SVG');
  const alts = await page.evaluate(() => [...document.querySelectorAll('[alt],[aria-label],[title]')].length);
  ok(alts === 0, 'no alt/aria-label/title attributes that could render text');

  await page.screenshot({ path: path.join(SHOT_DIR, 'step-final.png') });
  await ctx.close();

  /* --- 4. console --- */
  console.log('\n[4] console');
  ok(errors.length === 0, `console errors = ${errors.length}`, errors.join(' | '));
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length) { console.log('FAILED:\n - ' + failures.join('\n - ')); process.exit(1); }
console.log('e2e OK');
