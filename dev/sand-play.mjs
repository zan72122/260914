/**
 * Play the sand scene for real: drive the finger in a slow spiral over the mat
 * until the pile is gone, then report the beats (buried items surfacing,
 * slumps, completion). Used to check the whole chain end to end.
 *   node dev/sand-play.mjs [device] [seconds]
 */
import { startServer } from './serve.mjs';
import { launch, DEVICES } from './shot.mjs';

const device = process.argv[2] || 'iphone-portrait';
const secs = Number(process.argv[3] || 45);
const dim = DEVICES[device];
const { server, url } = await startServer(8132);
const browser = await launch();
const ctx = await browser.newContext({
  viewport: { width: dim.width, height: dim.height },
  deviceScaleFactor: Math.min(2, dim.dpr), isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`${url}/index.html?scene=sand&seed=1337&mute=1`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);
await page.evaluate(() => { window.game.pause(); window.game.step(0.2); });

const log = await page.evaluate(async (secs) => {
  const g = window.game;
  const st0 = g.state();
  const lead = (st0.pose === 'portrait' ? 92 : 78) / st0.viewport.h;
  const pile = st0.scene.debris[0];
  const out = [];
  const STEP = 1 / 60;
  let t = 0;
  while (t < secs) {
    // slow spiral outward from the middle of the pile, re-centred every lap
    const u = t / secs;
    const a = t * 1.3;
    const rad = 0.03 + ((u * 3) % 1) * 0.30;
    g.input.pointer(pile.nx + Math.cos(a) * rad,
                    pile.ny + lead + Math.sin(a) * rad * 0.9, true);
    g.step(STEP);
    t += STEP;
    if (Math.abs(t % 0.5) < STEP) {
      const s = g.state();
      const d = s.scene.debris;
      out.push({
        t: +t.toFixed(1), frac: d[0].frac, sl: d[0].slumps, grains: d[0].grains,
        b: d.filter((x) => ['marble', 'shell', 'button'].includes(x.type))
             .map((x) => x.type[0] + ':' + x.emerge + (x.rolling ? 'R' : '') + ':' + x.state).join(' '),
        grit: (d.find((x) => x.type === 'grit') || {}).left,
        cup: s.vacuum.cup, left: s.scene.remaining, done: s.scene.complete,
        trans: s.transition && s.transition.phase,
      });
      if (s.scene.complete && out.length && out[out.length-1].trans === 'out') break;
    }
  }
  return out;
}, secs);
for (const r of log) console.log(JSON.stringify(r));
await browser.close();
server.close();
