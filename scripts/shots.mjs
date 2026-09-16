/**
 * Screenshot sweep: every episode x {portrait, landscape} x every phase,
 * plus one moment per `fail:*` / `demo:*` dev action the episode exposes.
 *
 *   npm run build && node scripts/shots.mjs            # everything -> shots/all/
 *   node scripts/shots.mjs laundry                     # one episode -> shots/laundry/
 *
 * Concurrent-safe (several agents in one checkout): give each run its own
 * build directory so the builds and preview servers never collide.
 *
 *   npx vite build --outDir dist-foo && node scripts/shots.mjs foo --out dist-foo
 *
 * The build dir can also come from DIST_DIR. Only shots/<id>/ is cleared;
 * other agents' folders are left alone. The preview port is random per run.
 *
 * PNGs land in shots/<id>/. Look at them.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const argv = process.argv.slice(2);
const outIdx = argv.findIndex((a) => a === '--out' || a === '--outDir');
const DIST = (outIdx >= 0 ? argv[outIdx + 1] : process.env.DIST_DIR) || 'dist';
const ONLY = argv.filter((a, i) => !a.startsWith('--') && i !== outIdx + 1)[0] || null;
const OUT = `shots/${ONLY ?? 'all'}`;
const PORT = 4100 + Math.floor(Math.random() * 800);

const VIEWS = {
  portrait: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
};

/** phase -> seconds of simulation to let it breathe before the shot */
const PHASE_SETTLE = {
  establish: 1.2,
  action: 1.0,
  foreshadow: 2.9,
  trouble: 3.2,
  resolve: 1.1,
  comic: 1.3,
  settle: 0.6,
};

/**
 * Non-phase moments are discovered from the episode itself: every dev action
 * named `fail:*` (a failure ending) or `demo:*` (a posed moment) gets a frame.
 */
function momentsFor(actionNames) {
  return actionNames
    .filter((n) => n.startsWith('fail:') || n.startsWith('demo:'))
    .map((n) => {
      const fail = n.startsWith('fail:');
      return {
        name: n.replace(/[:/]/g, '-'),
        phase: fail ? 'trouble' : 'action',
        pre: 0.8,
        actions: [n],
        settle: fail ? 1.5 : 0.25,
      };
    });
}

const server = spawn('npx', ['vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', () => {});
server.stderr.on('data', (d) => process.stderr.write(d));

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/`);
      if (r.ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error(`preview server did not start (outDir=${DIST}, port=${PORT})`);
}

const shot = async (page, file) => {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `${OUT}/${file}.png` });
  process.stdout.write(`  ${file}.png\n`);
};

try {
  await waitForServer();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: VIEWS.portrait });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));

  await page.goto(`http://localhost:${PORT}/?seed=20240914`);
  await page.waitForFunction(() => !!window.__game);
  const eps = (await page.evaluate(() => window.__game.episodes())).filter((e) => !ONLY || e.id === ONLY);
  if (!eps.length) throw new Error(`no episode matched "${ONLY}"`);
  const phases = await page.evaluate(() => window.__game.phases());

  for (const [oname, size] of Object.entries(VIEWS)) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.__game.setPaused(true));

    await page.evaluate(() => {
      window.__game.gotoEpisode(null);
      window.__game.settle(2.5);
    });
    await shot(page, `hub_${oname}`);

    for (const ep of eps) {
      for (const ph of phases) {
        await page.evaluate(
          ([id, phase, secs]) => {
            window.__game.gotoEpisode(id);
            window.__game.gotoPhase(phase);
            window.__game.settle(secs);
          },
          [ep.id, ph, PHASE_SETTLE[ph] ?? 1],
        );
        await shot(page, `${ep.id}_${oname}_${ph}`);
      }

      const actions = await page.evaluate((id) => window.__game.actions(id), ep.id);
      for (const m of momentsFor(actions)) {
        await page.evaluate(
          ([id, mm]) => {
            window.__game.gotoEpisode(id);
            window.__game.gotoPhase(mm.phase);
            window.__game.settle(mm.pre);
            for (const a of mm.actions) window.__game.runAction(a);
            window.__game.settle(mm.settle);
          },
          [ep.id, m],
        );
        await shot(page, `${ep.id}_${oname}_x-${m.name}`);
      }
    }
  }

  const state = await page.evaluate(() => window.__game.getState());
  console.log('final state:', JSON.stringify(state).slice(0, 300));
  await browser.close();
} finally {
  server.kill('SIGTERM');
  // the preview server keeps the event loop alive; we are done either way
  setTimeout(() => process.exit(0), 300);
}
