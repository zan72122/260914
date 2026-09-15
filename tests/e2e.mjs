// tests/e2e.mjs — F3/F4 verification. No npm dependencies: uses node's http server
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

/** Do two client rectangles overlap at all? (R2) */
function intersects(a, b) {
  if (!a || !b) return true;
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Everything about the board that must come back exactly as it started (R3). */
const frameStyle = (page) => page.evaluate(() => {
  const b = getComputedStyle(document.getElementById('board'));
  const c = getComputedStyle(document.querySelector('.cell'));
  return {
    gap: b.columnGap, rowGap: b.rowGap,
    borderWidth: c.borderTopWidth, borderStyle: c.borderTopStyle,
    borderColor: c.borderTopColor, radius: c.borderTopLeftRadius,
    background: c.backgroundColor
  };
});

/* -------------------------------- suite -------------------------------- */

const SIZES = [
  { name: 'iphone-portrait-390x844', width: 390, height: 844 },
  { name: 'iphone-landscape-844x390', width: 844, height: 390 },
  { name: 'ipad-1024x1366', width: 1024, height: 1366 }
];

const INITIAL = JSON.stringify([[[], ['T4']], [['T1'], ['T2']]]);

const runner = (page) => page.evaluate(() => ({
  index: window.__game.runner.index,
  solved: [...window.__game.runner.solved],
  current: window.__game.runner.current() ? window.__game.runner.current().id : null,
  busy: window.__game.board.busy
}));

/** Wait for the staged sequence of a puzzle to finish. */
const settled = (page, index) => page.waitForFunction(
  (i) => window.__game.runner.index >= i && window.__game.board.busy === false,
  index, { timeout: 30000 }
);

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
    await page.waitForTimeout(300);
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
    ok(m.tiles === 3, `${s.name}: 3 tiles rendered (top-left starts empty)`);
    console.log(`        -> ${shot}`);
    await ctx.close();
  }

  /* --- 2. drop rules, ordering, zoom --- */
  console.log('\n[2] drop rules / ordering / zoom');
  const ctx = await browser.newContext({ viewport: { width: 844, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  const page = await ctx.newPage();
  watchConsole(page, errors);
  await ready(page);

  let s0 = await state(page);
  ok(JSON.stringify(s0.cells) === INITIAL, 'initial placement: empty / T4 / T1 / T2 (docs 02 D2)', JSON.stringify(s0.cells));
  ok(!(await page.evaluate(() => window.__game.board.tiles.has('T3'))), 'T3 is not on the board yet');
  ok((await runner(page)).current === 'P1', 'the current puzzle is P1');

  // 2a. wrong place: T4 dropped on T2 (no hole) floats back home
  await drag(page, await cellPoint(page, 0, 1), await cellPoint(page, 1, 1));
  let s1 = await state(page);
  ok(JSON.stringify(s1.cells) === INITIAL, 'drop on a hole-less tile floats back home', JSON.stringify(s1.cells));

  // 2b. wrong place: dragged off the board floats back home
  await drag(page, await cellPoint(page, 0, 1), { x: 6, y: 6 });
  ok(JSON.stringify((await state(page)).cells) === INITIAL, 'drop outside the board floats back home');

  // 2c. P2 cannot be reached before P1: stacking T4 under T1 solves nothing
  await drag(page, await cellPoint(page, 0, 1), await cellPoint(page, 1, 0));
  let s2 = await state(page);
  ok(JSON.stringify(s2.cells[1][0]) === '["T4","T1"]', 'T4 slid under T1 (legal stack, wrong item)', JSON.stringify(s2.cells));
  let r2 = await runner(page);
  ok(r2.index === 0 && r2.solved.length === 0, 'no puzzle is solved out of order (P2 needs P1 first)', JSON.stringify(r2));

  // 2d. zoom in / out on the pot portal
  const pot = await svgPoint(page, 'T1', 270, 520);
  await page.mouse.move(pot.x, pot.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(600);
  ok((await state(page)).zoom.T1 === 1, 'tapping the pot portal zooms T1 in');
  await drag(page, await cellPoint(page, 1, 0), { x: 20, y: 20 });
  let s3 = await state(page);
  ok(s3.zoom.T1 === 0, 'dragging a zoomed tile out of its frame zooms out');
  ok(JSON.stringify(s3.cells[1][0]) === '["T4","T1"]', 'a zoomed tile does not move');

  // 2e. the world invites after 15s of silence (docs/01.md 4.7)
  await page.evaluate(() => window.__game.hints.reset());
  ok(await page.evaluate(() => window.__game.board.tiles.get('T2').el.getAnimations().length === 0),
     'no hint while the hand is moving');
  await page.waitForTimeout(15600);
  const hint1 = await page.evaluate(() => ({
    supply: window.__game.board.tiles.get('T2').el.getAnimations().length,
    target: window.__game.board.tiles.get('T1').layer('soil').getAnimations().length
  }));
  ok(hint1.supply > 0, '15s: the supplying tile floats', JSON.stringify(hint1));
  ok(hint1.target > 0, '15s: the receiving soil brightens', JSON.stringify(hint1));

  // the 45s stage leans the tile toward the receiving cell
  const hint2 = await page.evaluate(() => {
    window.__game.hints.show(2);
    const anims = window.__game.board.tiles.get('T2').el.getAnimations();
    const kf = anims.length ? anims[0].effect.getKeyframes() : [];
    return { n: anims.length, frames: kf.map((f) => f.transform) };
  });
  ok(hint2.n > 0 && /translate\(/.test(hint2.frames.join(' ')), '45s: the supplying tile leans over', JSON.stringify(hint2));
  await page.evaluate(() => window.__game.hints.reset());
  ok(await page.evaluate(() => window.__game.board.tiles.get('T2').el.getAnimations().length === 0),
     'any input cancels the invitation');
  await ctx.close();

  /* --- 3. the full run: P1 -> P2 -> P3 -> ending -> seed -> start over --- */
  console.log('\n[3] P1 -> P2 -> P3 -> ending');
  const ctx2 = await browser.newContext({ viewport: { width: 844, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  const play = await ctx2.newPage();
  watchConsole(play, errors);
  await ready(play);
  const style0 = await frameStyle(play);

  // P1: T2 (bottom-right) onto the empty cell above T1
  await drag(play, await cellPoint(play, 1, 1), await cellPoint(play, 0, 0));
  await settled(play, 1);
  let p1 = await state(play);
  ok(JSON.stringify(p1.cells[0][0]) === '["T2"]', 'P1: T2 sits above T1', JSON.stringify(p1.cells));
  ok(JSON.stringify(p1.cells[1][1]) === '["T3"]', 'P1: the sun rises into the freed cell', JSON.stringify(p1.cells));
  ok((await play.evaluate(() => window.__game.board.tiles.get('T2').el.classList.contains('desaturated'))),
     'P1: T2 has lost its colour');
  ok((await play.evaluate(() => +window.__game.board.tiles.get('T1').layer('sprout').style.opacity)) === 1,
     'P1: the sprout is visible');
  await play.screenshot({ path: path.join(SHOT_DIR, 'p1-rain.png') });
  ok((await runner(play)).current === 'P2', 'P2 is next');

  // P2: T3 slid under T1
  await drag(play, await cellPoint(play, 1, 1), await cellPoint(play, 1, 0));
  await settled(play, 2);
  let p2 = await state(play);
  ok(JSON.stringify(p2.cells[1][0]) === '["T3","T1"]', 'P2: T3 is under T1, sun in the window', JSON.stringify(p2.cells));
  ok((await play.evaluate(() => +window.__game.board.tiles.get('T1').layer('bud').style.opacity)) === 1,
     'P2: the bud is visible');
  ok(!(await play.evaluate(() => window.__game.board.tiles.get('T4').el.classList.contains('desaturated'))),
     'P2: the garden has its colour back');
  await play.waitForTimeout(1000);   // let the saturation transition finish before the shot
  await play.screenshot({ path: path.join(SHOT_DIR, 'p2-light.png') });

  // P3: T4 to the right of T1
  await drag(play, await cellPoint(play, 0, 1), await cellPoint(play, 1, 1));
  await play.waitForFunction(() => document.body.classList.contains('ending'), null, { timeout: 30000 });
  let p3 = await state(play);
  ok(JSON.stringify(p3.cells[1][1]) === '["T4"]', 'P3: T4 sits right of T1', JSON.stringify(p3.cells));
  ok((await play.evaluate(() => +window.__game.board.tiles.get('T1').layer('flower').style.opacity)) === 1,
     'P3: the flower has opened');
  await play.screenshot({ path: path.join(SHOT_DIR, 'p3-bloom.png') });

  // ending: the four cells melt together, then a seed drops
  await play.waitForSelector('#fx .seed-drop', { timeout: 30000 });
  await play.waitForTimeout(1600);
  ok(await play.evaluate(() => document.body.classList.contains('ending')), 'ending: the board has melted into one picture');
  ok(await play.evaluate(() => {
    const el = document.querySelector('#fx .seed-drop');
    return el ? Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height) >= 64 : false;
  }), 'ending: the seed is at least 64px across');
  await play.screenshot({ path: path.join(SHOT_DIR, 'ending.png') });

  // R1: the flower keeps its full colour, the wash is only a rim vignette and the
  // top row has become sky with the risen sun.
  const finale = await play.evaluate(() => {
    const t1 = window.__game.board.tiles.get('T1');
    const flower = t1.layer('flower');
    const fcs = getComputedStyle(flower);
    const tcs = getComputedStyle(t1.el);
    const wing = document.querySelector('#fx .butterfly-flyer [data-layer="butterfly"]');
    const r = (el) => { const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
    return {
      flowerOpacity: fcs.opacity, flowerFilter: fcs.filter,
      tileFilter: tcs.filter, tileOpacity: tcs.opacity,
      bloom: getComputedStyle(document.getElementById('bloom')).backgroundImage,
      sky: +getComputedStyle(document.getElementById('sky')).opacity,
      birds: document.querySelectorAll('#sky .birds').length,
      sun: !!document.querySelector('#fx .sun-rise'),
      flowerRect: r(flower),
      wingRect: wing ? r(wing) : null
    };
  });
  ok(finale.flowerOpacity === '1' && finale.flowerFilter === 'none',
     'R1: the flower layer is fully opaque and unfiltered', JSON.stringify(finale.flowerOpacity));
  ok(finale.tileFilter === 'saturate(1)' && finale.tileOpacity === '1',
     'R1: the room tile keeps full saturation during the ending', finale.tileFilter);
  ok(/rgba\(240, 214, 172, 0\)/.test(finale.bloom),
     'R1: the ending wash is a rim vignette (transparent in the middle)', finale.bloom);
  ok(finale.sky > 0.9 && finale.birds === 2, 'R1: the top row is sky, with birds', JSON.stringify(finale.sky));
  ok(finale.sun, 'R1: the sun has risen out of the window into the top row');
  ok(finale.wingRect && !intersects(finale.wingRect, finale.flowerRect),
     'R2: the resting butterfly does not overlap the flower',
     JSON.stringify({ wing: finale.wingRect, flower: finale.flowerRect }));

  // R4: the seed lies on the floor in front of the table, beside the legs
  const seedPos = await play.evaluate(() => {
    const t1 = window.__game.board.tiles.get('T1');
    const at = window.__game.board.locate('T1');
    const g = window.__game.board.cellGeom(at.r, at.c);
    const bb = window.__game.board.boardEl.getBoundingClientRect();
    const el = document.querySelector('#fx .seed-drop circle');
    const r = el.getBoundingClientRect();
    const toArt = (px, py) => ({ x: ((px - bb.left - g.x) / g.size) * 1000,
                                 y: ((py - bb.top - g.y) / g.size) * 1000 });
    const a = toArt(r.left, r.top);
    const b = toArt(r.right, r.bottom);
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  });
  ok(seedPos.y0 > 800, 'R4: the seed rests on the floor, below the table bar', JSON.stringify(seedPos));
  ok(seedPos.x0 > 140 && seedPos.x1 < 450,
     'R4: the seed is clear of both table legs (x=118 / x=470)', JSON.stringify(seedPos));

  // tapping the seed floats everything back to the start
  const seedBox = await (await play.$('#fx .seed-drop')).boundingBox();
  await play.mouse.move(seedBox.x + seedBox.width / 2, seedBox.y + seedBox.height / 2);
  await play.mouse.down(); await play.mouse.up();
  await play.waitForFunction(() => !document.body.classList.contains('ending') &&
                                   window.__game.runner.index === 0, null, { timeout: 30000 });
  await play.waitForTimeout(900);
  let back = await state(play);
  ok(JSON.stringify(back.cells) === INITIAL, 'restart: the board is back to its first arrangement', JSON.stringify(back.cells));
  ok(!(await play.evaluate(() => window.__game.board.busy)), 'restart: input is released (board.busy === false)');
  ok(await play.evaluate(() => document.querySelectorAll('#fx *').length === 0), 'restart: the overlay is empty');
  const style1 = await frameStyle(play);
  ok(JSON.stringify(style1) === JSON.stringify(style0),
     'R3: after the restart the grid gap and the cell frames are back to their initial values',
     `${JSON.stringify(style0)} vs ${JSON.stringify(style1)}`);
  ok(await play.evaluate(() => +getComputedStyle(document.getElementById('sky')).opacity === 0 &&
                               +getComputedStyle(document.getElementById('bloom')).opacity === 0),
     'R3: the ending sky and vignette are cleared');
  await play.screenshot({ path: path.join(SHOT_DIR, 'restart.png') });

  /* --- 4. wordless --- */
  console.log('\n[4] wordless');
  const text = await play.evaluate(() => document.body.innerText.trim());
  ok(text === '', 'document.body.innerText.trim() === ""', JSON.stringify(text));
  const svgText = await play.evaluate(() => document.querySelectorAll('svg text, svg tspan').length);
  ok(svgText === 0, 'no <text>/<tspan> in any SVG');
  const alts = await play.evaluate(() => [...document.querySelectorAll('[alt],[aria-label],[title]')].length);
  ok(alts === 0, 'no alt/aria-label/title attributes that could render text');
  await ctx2.close();

  /* --- 5. save / restore / hidden reset (docs/03.md F5) --- */
  console.log('\n[5] localStorage save, silent restore, 3s hold on the flower');
  const ctx3 = await browser.newContext({ viewport: { width: 844, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  const sv = await ctx3.newPage();
  watchConsole(sv, errors);
  await ready(sv);
  ok(await sv.evaluate(() => localStorage.getItem('tane:p') === null), 'save: a fresh start stores nothing');

  await drag(sv, await cellPoint(sv, 1, 1), await cellPoint(sv, 0, 0));
  await settled(sv, 1);
  ok(await sv.evaluate(() => localStorage.getItem('tane:p')) === '1', 'save: P1 is written to localStorage');

  await drag(sv, await cellPoint(sv, 1, 1), await cellPoint(sv, 1, 0));
  await settled(sv, 2);
  ok(await sv.evaluate(() => localStorage.getItem('tane:p')) === '2', 'save: P2 is written to localStorage');

  // reload: the world must already be there, with no staging and no leftovers
  await ready(sv);
  const rest = await sv.evaluate(() => {
    const b = window.__game.board;
    const t1 = b.tiles.get('T1');
    const op = (n) => +getComputedStyle(t1.layer(n)).opacity;
    return {
      cells: JSON.stringify(b.snapshot().cells),
      index: window.__game.runner.index,
      current: window.__game.runner.current() ? window.__game.runner.current().id : null,
      busy: b.busy,
      bud: op('bud'), sprout: op('sprout'), wet: op('soil-wet'), seed: op('seed'),
      flower: op('flower'),
      t2grey: b.tiles.get('T2').el.classList.contains('desaturated'),
      t4grey: b.tiles.get('T4').el.classList.contains('desaturated'),
      fx: document.querySelectorAll('#fx *').length,
      anims: document.getAnimations ? document.getAnimations().length : 0
    };
  });
  ok(rest.cells === '[[["T2"],["T4"]],[["T3","T1"],[]]]',
     'restore: the reloaded board is exactly the state after P2', rest.cells);
  ok(rest.index === 2 && rest.current === 'P3' && rest.busy === false,
     'restore: the story continues at P3', JSON.stringify(rest));
  ok(rest.bud === 1 && rest.sprout === 1 && rest.wet === 1 && rest.seed === 0 && rest.flower === 0,
     'restore: bud, sprout and wet soil are already there', JSON.stringify(rest));
  ok(rest.t2grey && !rest.t4grey, 'restore: the spent cloud is grey, the garden has colour');
  ok(rest.fx === 0 && rest.anims === 0, 'restore: nothing is being staged (no animation, no overlay)',
     JSON.stringify(rest));

  // finish the story from the restored state
  await drag(sv, await cellPoint(sv, 0, 1), await cellPoint(sv, 1, 1));
  await sv.waitForFunction(() => document.body.classList.contains('ending'), null, { timeout: 30000 });
  ok(await sv.evaluate(() => localStorage.getItem('tane:p') === null),
     'save: reaching the ending wipes the save');
  await sv.waitForSelector('#fx .seed-drop', { timeout: 30000 });

  // the only hidden gesture: three seconds on the open flower
  const bloomPt = await svgPoint(sv, 'T1', 270, 360);
  await sv.mouse.move(bloomPt.x, bloomPt.y);
  await sv.mouse.down();
  await sv.waitForTimeout(3300);
  await sv.mouse.up();
  await sv.waitForFunction(() => !document.body.classList.contains('ending') &&
                                 window.__game.runner.index === 0, null, { timeout: 30000 });
  await sv.waitForTimeout(700);
  ok(JSON.stringify((await state(sv)).cells) === INITIAL,
     'hold: 3 seconds on the flower returns the world to the seed');
  ok(await sv.evaluate(() => localStorage.getItem('tane:p') === null), 'hold: the save is cleared too');

  // a short tap on the flower must NOT reset anything
  await drag(sv, await cellPoint(sv, 1, 1), await cellPoint(sv, 0, 0));
  await settled(sv, 1);
  await sv.mouse.move(bloomPt.x, bloomPt.y);
  await sv.mouse.down(); await sv.mouse.up();
  await sv.waitForTimeout(400);
  ok((await runner(sv)).index === 1, 'hold: a short press is not a reset');
  await ctx3.close();

  /* --- 6. no AudioContext at all: the game still plays --- */
  console.log('\n[6] silence (AudioContext removed)');
  const ctx4 = await browser.newContext({ viewport: { width: 844, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  const mute = await ctx4.newPage();
  watchConsole(mute, errors);
  await mute.addInitScript(() => {
    try { window.AudioContext = undefined; } catch (_) {}
    try { window.webkitAudioContext = undefined; } catch (_) {}
  });
  await ready(mute);
  ok(await mute.evaluate(() => window.__game.audio.available === false),
     'silence: the audio layer reports itself unavailable');
  ok(await mute.evaluate(() => {
    const a = window.__game.audio;
    a.unlock(); a.lift(); a.drop(); a.snap(); a.rain(200); a.light(); a.bloom(); a.seed();
    a.startAmbience(); a.stopAmbience(); a.resume();
    return true;
  }), 'silence: every sound entry point is a safe no-op');

  await drag(mute, await cellPoint(mute, 1, 1), await cellPoint(mute, 0, 0));
  await settled(mute, 1);
  await drag(mute, await cellPoint(mute, 1, 1), await cellPoint(mute, 1, 0));
  await settled(mute, 2);
  ok(JSON.stringify((await state(mute)).cells) === '[[["T2"],["T4"]],[["T3","T1"],[]]]',
     'silence: P1 and P2 still play through without sound');

  /* --- 7. PWA manifest + icon --- */
  console.log('\n[7] manifest / icon');
  const mf = await mute.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const res = await fetch(link.getAttribute('href'));
    const json = await res.json();
    const icon = await fetch(json.icons[0].src);
    const svg = await icon.text();
    return { status: res.status, json, iconStatus: icon.status, iconType: icon.headers.get('content-type'),
             iconHasText: /<text|<tspan/.test(svg) };
  });
  ok(mf.status === 200 && mf.json.display === 'standalone' && mf.json.orientation === 'any',
     'manifest: standalone, any orientation', JSON.stringify(mf.json));
  ok(mf.json.background_color === '#efe6d2', 'manifest: parchment background colour');
  ok(mf.iconStatus === 200 && /svg/.test(mf.iconType || ''), 'manifest: art/icon.svg is served');
  ok(!mf.iconHasText, 'manifest: the icon carries no text either');
  await ctx4.close();

  /* --- 8. console --- */
  console.log('\n[8] console');
  ok(errors.length === 0, `console errors = ${errors.length}`, errors.join(' | '));
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length) { console.log('FAILED:\n - ' + failures.join('\n - ')); process.exit(1); }
console.log('e2e OK');
