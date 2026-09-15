/** Shared plumbing: a static server for dist-test/ and a SwiftShader chromium. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DIST = path.join(ROOT, 'dist-test');
export const SHOTS = path.join(ROOT, 'shots');

export async function loadChromium() {
  try { return (await import('playwright')).chromium; }
  catch { return (await import('/opt/node22/lib/node_modules/playwright/index.mjs')).chromium; }
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon'
};

export function serve(dir, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0]);
      let file = path.join(dir, url === '/' ? 'index.html' : url.replace(/^\/+/, ''));
      if (!file.startsWith(dir)) { res.statusCode = 403; return res.end(); }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, 'index.html');
      if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
      res.setHeader('content-type', MIME[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

export function requireBuild() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('dist-test/ missing - run `npm run build:test` first');
    process.exit(1);
  }
}

export async function launch(chromium) {
  const opts = {
    args: ['--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  };
  const local = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (fs.existsSync(local)) opts.executablePath = local;
  return chromium.launch(opts);
}

/** open the page, optionally straight into a named scenario */
export async function openGame(browser, { scenario, seed = 1, viewport, debug = true } = {}) {
  const page = await browser.newPage({
    viewport: viewport || { width: 390, height: 844 }, deviceScaleFactor: 1
  });
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  const q = new URLSearchParams();
  if (debug) q.set('debug', '1');
  q.set('seed', String(seed));
  if (scenario) q.set('scenario', scenario);
  await page.goto(`${page.__base || globalThis.__BASE__}/?${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 45000 });
  // a scenario starts paused so every check below runs on fixed steps
  await page.evaluate(() => window.__game.pause());
  return page;
}

/** run the real update loop n fixed steps */
export const step = (page, n = 1, dt = 1 / 60) =>
  page.evaluate(([n, dt]) => window.__game.step(dt, n), [n, dt]);

export const snapshot = (page) => page.evaluate(() => window.__game.snapshot());
export const gameLog = (page, n) => page.evaluate((n) => window.__game.log(n), n);

/** step until a predicate over the snapshot holds */
export async function stepUntil(page, predSrc, maxSteps = 900) {
  return page.evaluate(([src, max]) => window.__game.stepUntil(src, max), [predSrc, maxSteps]);
}

/** tap the screen position of the thing the world is currently inviting */
export async function tapInvited(page) {
  return page.evaluate(() => {
    const g = window.__game;
    const s = g.targetScreen();
    if (!s) return { error: 'no-target' };
    if (!s.onScreen) return { error: 'offscreen', s };
    return { hit: g.tapScreen(s.x, s.y), s };
  });
}
