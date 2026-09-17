/**
 * Pantry: the orientation change.
 *
 * Clean part of the spill in portrait, turn the device, and check that the
 * child's tracks, the chips they collected and the spoon they shoved are all
 * still there — and that nothing has quietly become un-cleanable.
 *
 *   node dev/pantry-rotate.mjs
 */
import { startServer } from './serve.mjs';
import { launch, DEVICES } from './shot.mjs';

const { server, url } = await startServer(Number(process.env.PORT || 0) || 8171);
const browser = await launch();
const a = DEVICES['iphone-portrait'], b = DEVICES['iphone-landscape'];
const ctx = await browser.newContext({ viewport: { width: a.width, height: a.height }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message || e)));
await page.goto(url + '/index.html?scene=pantry&seed=1337&mute=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.game && window.game._g && window.game._g.scene);

const probe = () => page.evaluate(() => {
  const sc = window.game._g.scene;
  return {
    pose: sc.pose,
    clean: +sc.spill.cleanFrac().toFixed(3),
    total: +sc.spill.pw.total().toFixed(1),
    chipsLeft: sc.chips.filter((c) => c.state !== 'in-cup').length,
    spoon: [Math.round(sc.spoon.x), Math.round(sc.spoon.y)],
    remaining: sc.remaining(),
  };
});

// drive the finger onto the spill and hold, the way the autopilot does
await page.evaluate(() => {
  const g = window.game._g;
  const A = { x: 0, y: 0 };
  window.__drive = setInterval(() => {
    const sc = g.scene;
    sc.debris[0].aim(A);
    const P = { x: 0, y: 0 };
    g.camera.toScreen(A.x, A.y, P);
    window.game.input.pointer(P.x / g.w, (P.y + 114) / g.h, true);
  }, 30);
});
await page.waitForTimeout(9000);
const before = await probe();
await page.setViewportSize({ width: b.width, height: b.height });
await page.waitForTimeout(900);
const after = await probe();
await page.waitForTimeout(4000);
const later = await probe();
await page.evaluate(() => clearInterval(window.__drive));

console.log('portrait  ', JSON.stringify(before));
console.log('landscape ', JSON.stringify(after));
console.log('+4s       ', JSON.stringify(later));
console.log('errors', errors.length, errors.join(' | '));
await browser.close();
server.close();
process.exit(errors.length || Math.abs(after.clean - before.clean) > 0.14 ? 1 : 0);
