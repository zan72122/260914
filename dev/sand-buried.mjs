/**
 * Capture the buried-item beat: play the scene until something solid starts to
 * surface out of the sand, then record the emerge -> rock -> rattle -> in.
 *   node dev/sand-buried.mjs [device]
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { launch, DEVICES } from './shot.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const device = process.argv[2] || 'iphone-portrait';
const dim = DEVICES[device];
const dir = join(ROOT, 'dev', 'out', 'sand-' + device + '-buried');
await rm(dir, { recursive: true, force: true });
await mkdir(dir, { recursive: true });

const { server, url } = await startServer(8133);
const browser = await launch();
const ctx = await browser.newContext({
  viewport: { width: dim.width, height: dim.height },
  deviceScaleFactor: Math.min(2, dim.dpr), isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`${url}/index.html?scene=sand&seed=1337&mute=1`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => {
  window.game.pause(); window.game.step(0.2);
  const st = window.game.state();
  window.__s = { lead: (st.pose === 'portrait' ? 92 : 78) / st.viewport.h, p: st.scene.debris[0], t: 0 };
});
// run until something is half out of the sand
const found = await page.evaluate(() => {
  const g = window.game, s = window.__s;
  for (let i = 0; i < 60 * 30; i++) {
    const a = s.t * 1.3, rad = 0.03 + ((s.t / 12) % 1) * 0.26;
    g.input.pointer(s.p.nx + Math.cos(a) * rad, s.p.ny + s.lead + Math.sin(a) * rad * 0.9, true);
    g.step(1 / 60); s.t += 1 / 60;
    const d = g.state().scene.debris.filter((x) => ['marble', 'shell', 'button'].includes(x.type));
    if (d.some((x) => x.emerge > 0.25 && x.state !== 'in-cup')) return { t: +s.t.toFixed(2), d };
  }
  return null;
});
console.log('surfacing at', JSON.stringify(found && found.t), JSON.stringify(found && found.d));
const states = [];
for (let i = 0; i < 18; i++) {
  await page.evaluate(() => {
    const g = window.game, s = window.__s;
    for (let k = 0; k < 9; k++) {
      const a = s.t * 1.3, rad = 0.03 + ((s.t / 12) % 1) * 0.26;
      g.input.pointer(s.p.nx + Math.cos(a) * rad, s.p.ny + s.lead + Math.sin(a) * rad * 0.9, true);
      g.step(1 / 60); s.t += 1 / 60;
    }
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: join(dir, String(i).padStart(3, '0') + '.png') });
  states.push(await page.evaluate(() => window.game.state().scene.debris
    .filter((x) => ['marble', 'shell', 'button'].includes(x.type))
    .map((x) => x.type + ':' + x.emerge + ':' + x.rock + ':' + (x.rolling ? 'ROLL' : '') + ':' + x.state)));
}
await writeFile(join(dir, 'state.json'), JSON.stringify(states, null, 1));
states.forEach((s, i) => console.log(i, s.join(' | ')));
// one contact sheet
const cols = 6;
const html = `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#101013}
 #sheet{display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:6px;width:${cols * 220 + 40}px}
 img{width:100%;display:block;border:1px solid #2a2a30}</style><div id=sheet>` +
  states.map((_, i) => `<img src="/dev/out/sand-${device}-buried/${String(i).padStart(3, '0')}.png">`).join('') + '</div>';
await writeFile(join(dir, 'contact.html'), html);
await page.setViewportSize({ width: cols * 220 + 40, height: 900 });
await page.goto(`${url}/dev/out/sand-${device}-buried/contact.html`, { waitUntil: 'load' });
await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
await page.locator('#sheet').screenshot({ path: join(dir, 'contact.png') });
await browser.close();
server.close();
