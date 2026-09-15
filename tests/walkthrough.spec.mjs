/**
 * Full-chain walkthrough: drives the game through all five houses, the ending
 * and a restart, in three viewports, capturing a screenshot at every stage.
 *
 * Run with:  npm test
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SHOTS = path.join(ROOT, 'shots');

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs'));
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon'
};

function serve(dir, port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = path.join(dir, url === '/' ? 'index.html' : url.replace(/^\/+/, ''));
      if (!file.startsWith(dir)) { res.statusCode = 403; return res.end(); }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, 'index.html');
      if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
      res.setHeader('content-type', MIME[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

// ---------------------------------------------------------------- assertions
let failures = 0, checks = 0, fallbacks = 0;
function check(name, ok, extra = '') {
  checks++;
  if (ok) console.log(`  ok   ${name}${extra ? ' ' + extra : ''}`);
  else { failures++; console.log(`  FAIL ${name}${extra ? ' ' + extra : ''}`); }
}

const VIEWPORTS = [
  { name: 'iphone-portrait', width: 390, height: 844 },
  { name: 'iphone-landscape', width: 844, height: 390 },
  { name: 'ipad-portrait', width: 820, height: 1180 }
];

async function state(page) { return page.evaluate(() => window.__game.state); }
async function houseIndex(page) { return page.evaluate(() => window.__game.houseIndex); }

async function waitState(page, want, timeout = 90000) {
  await page.waitForFunction(
    (w) => (Array.isArray(w) ? w : [w]).includes(window.__game.state),
    want, { timeout, polling: 100 }
  );
}

/** tap the projected screen position of a world point; fall back to advance() */
async function tapWorld(page, getPoint, label) {
  const res = await page.evaluate((fnBody) => {
    const g = window.__game;
    const p = new Function('g', 'return (' + fnBody + ')(g);')(g);
    if (!p) return { ok: false, why: 'no-point' };
    const s = g.project(p.x, p.y, p.z);
    if (!s.onScreen) return { ok: false, why: 'offscreen', s };
    const hit = g.tapScreen(s.x, s.y);
    return { ok: true, hit, s };
  }, getPoint.toString());
  if (!res.ok) {
    fallbacks++;
    console.log(`  note ${label}: ${res.why} -> advance()`);
    await page.evaluate(() => window.__game.advance());
    return null;
  }
  return res.hit;
}

async function shot(page, dir, name) {
  await page.screenshot({ path: path.join(SHOTS, dir, name + '.png') });
}

async function runViewport(browser, vp, base) {
  const dir = vp.name;
  fs.mkdirSync(path.join(SHOTS, dir), { recursive: true });
  console.log(`\n== ${vp.name} (${vp.width}x${vp.height}) ==`);

  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1
  });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(base + '/?debug=1&speed=3', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game, null, { timeout: 30000 });
  await page.waitForTimeout(2200);

  // --- no text anywhere on screen ---
  const text = await page.evaluate(() => document.body.innerText.trim());
  check('no on-screen text', text === '', JSON.stringify(text));

  // --- exactly one lit house at the start ---
  const litCount = await page.evaluate(() =>
    window.__game.houses.filter(h => h.litTarget > 0.5).length);
  check('exactly one house lit at start', litCount === 1, `(${litCount})`);
  const startOnScreen = await page.evaluate(() => {
    const g = window.__game;
    const h = g.houses[g.houseIndex];
    const s = g.project(h.doorWorld.x, h.doorWorld.y, h.doorWorld.z);
    return s.onScreen;
  });
  check('lit house is in frame at start', startOnScreen);
  await shot(page, dir, '00-start');

  // --- five houses ---
  for (let visit = 1; visit <= 5; visit++) {
    const tag = `h${visit}`;
    check(`${tag} state is FIND`, await state(page) === 'FIND');
    check(`${tag} target house index`, await houseIndex(page) === visit);
    await shot(page, dir, `${tag}-1-find`);

    // 1. tap the glowing house -> she walks there
    await tapWorld(page, (g) => {
      const h = g.houses[g.houseIndex];
      return { x: h.doorWorld.x, y: h.doorWorld.y, z: h.doorWorld.z };
    }, `${tag} tap house`);
    await waitState(page, ['WALK', 'BELL']);
    await shot(page, dir, `${tag}-2-walk`);

    // 2. arrives at the porch -> doorbell lights up
    await waitState(page, 'BELL');
    await page.waitForTimeout(700);
    await shot(page, dir, `${tag}-3-bell`);

    // 3. tap the doorbell
    await tapWorld(page, (g) => {
      const h = g.houses[g.houseIndex];
      const v = new g.THREE.Vector3();
      h.doorbell.getWorldPosition(v);
      return { x: v.x, y: v.y, z: v.z };
    }, `${tag} tap doorbell`);
    await waitState(page, ['OPEN', 'REVEAL']);
    await page.waitForTimeout(900);
    await shot(page, dir, `${tag}-4-open`);

    // 4. door opens, resident appears -> tap the girl for the costume reveal
    await waitState(page, 'REVEAL');
    await page.waitForTimeout(500);
    await shot(page, dir, `${tag}-5-reveal`);
    await tapWorld(page, (g) => {
      const v = new g.THREE.Vector3();
      g.girl.headMesh.getWorldPosition(v);
      return { x: v.x, y: v.y, z: v.z };
    }, `${tag} tap girl`);
    await waitState(page, ['BUCKET', 'CANDY']);

    // 5. tap the bucket
    await waitState(page, 'BUCKET');
    await page.waitForTimeout(400);
    await shot(page, dir, `${tag}-6-bucket`);
    await tapWorld(page, (g) => {
      const v = new g.THREE.Vector3();
      g.girl.bucket.getWorldPosition(v);
      return { x: v.x, y: v.y, z: v.z };
    }, `${tag} tap bucket`);
    await waitState(page, ['CANDY', 'NEXT']);
    await page.waitForTimeout(1600);
    await shot(page, dir, `${tag}-7-candy`);

    // 6. next house lights up
    await waitState(page, ['NEXT', 'FIND', 'ENDING'], 90000);
    if (await state(page) === 'NEXT') await page.waitForTimeout(1200);
    await shot(page, dir, `${tag}-8-next`);

    if (visit < 5) {
      await waitState(page, 'FIND', 90000);
    } else {
      await waitState(page, 'ENDING', 90000);
    }
  }

  const candy = await page.evaluate(() => window.__game.candyCount);
  check('bucket collected candy', candy > 0, `(${candy})`);

  // --- ending ---
  check('reached the ending', await state(page) === 'ENDING');
  await page.waitForTimeout(3000);
  await shot(page, dir, '90-ending');
  const allLit = await page.evaluate(() =>
    window.__game.houses.every(h => h.litTarget > 0.5));
  check('every house lit at the ending', allLit);

  // tap for fireworks
  await page.evaluate(() => window.__game.tapNdc(0.1, 0.75));
  await page.waitForTimeout(2200);
  await shot(page, dir, '91-fireworks');

  // wait until restart is offered, then restart with a tap
  await page.waitForFunction(() => window.__game.restartReady, null, { timeout: 40000 });
  await shot(page, dir, '92-restart-invite');
  await page.evaluate(() => {
    const g = window.__game;
    const h = g.houses[0];
    const s = g.project(h.doorWorld.x, h.doorWorld.y, h.doorWorld.z);
    if (s.onScreen) g.tapScreen(s.x, s.y); else g.advance();
  });
  await page.waitForTimeout(1200);
  check('restarted at house 1', await state(page) === 'FIND' && await houseIndex(page) === 1,
    `(${await state(page)}/${await houseIndex(page)})`);
  await shot(page, dir, '93-restarted');

  // --- robustness: hammer taps during an animation ---
  await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 40; i++) {
      g.tapNdc((Math.random() * 2 - 1), (Math.random() * 2 - 1));
    }
  });
  await page.waitForTimeout(1500);
  const sane = await page.evaluate(() =>
    ['FIND', 'WALK', 'BELL', 'OPEN', 'REVEAL', 'BUCKET', 'CANDY', 'NEXT', 'ENDING']
      .includes(window.__game.state));
  check('random tap storm keeps the state machine sane', sane);
  await shot(page, dir, '94-tap-storm');

  // --- side toys respond ---
  const toyKinds = await page.evaluate(() => {
    const g = window.__game;
    return [...new Set(g.toys.map(t => t.kind))];
  });
  check('at least six kinds of side toys', toyKinds.length >= 6, JSON.stringify(toyKinds));
  const costumeChanged = await page.evaluate(() => {
    const g = window.__game;
    const m = g.toys.find(t => t.kind === 'mannequin' && t.costume !== g.costume);
    if (!m) return true;
    m.tap({ girl: g.girl, sparkles: g.chain.ctx.sparkles, world: g.world });
    return g.costume === m.costume;
  });
  check('costume mannequin changes the costume', costumeChanged);
  await page.waitForTimeout(400);
  await shot(page, dir, '95-costume');

  // --- attractor fires when idle ---
  await page.evaluate(() => window.__game.setIdle(7.9));
  await page.waitForTimeout(900);
  check('idle attractor runs without breaking state', await state(page) !== undefined);

  const text2 = await page.evaluate(() => document.body.innerText.trim());
  check('still no on-screen text after play', text2 === '');

  const info = await page.evaluate(() => window.__game.info);
  const fps = await page.evaluate(() => window.__game.fps);
  console.log(`  perf ${vp.name}: ${info.calls} draw calls/frame, ${info.triangles} tris, ` +
    `${info.geometries} geometries, ${info.textures} textures, ~${fps.toFixed(0)} fps (swiftshader)`);
  check('draw calls within budget', info.calls < 260, `(${info.calls})`);

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
  return info;
}

// ------------------------------------------------------------------- driver
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ missing - run `npm run build` first');
  process.exit(1);
}
fs.mkdirSync(SHOTS, { recursive: true });

const PORT = 4178 + (process.pid % 200);
const server = await serve(DIST, PORT);
const base = `http://127.0.0.1:${PORT}`;

const launchOpts = {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
};
if (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')) {
  launchOpts.executablePath = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
}
const browser = await chromium.launch(launchOpts);

try {
  for (const vp of VIEWPORTS) await runViewport(browser, vp, base);
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${checks - failures}/${checks} checks passed` +
  (fallbacks ? `, ${fallbacks} advance() fallbacks used` : ', no advance() fallbacks used'));
process.exit(failures ? 1 : 0);
