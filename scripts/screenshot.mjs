// Drives the game in a mobile-sized Chromium and saves screenshots (dev aid; not shipped).
import { chromium } from 'playwright';
import { createServer } from 'vite';
const OUT = process.env.SHOT_DIR ?? 'shots';
const server = await createServer({ root: process.cwd(), server: { port: 5173, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function run(name, vp, actions) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}-0.png` });
  await actions(page, name, vp);
  if (errors.length) console.log(name, 'ERRORS', errors);
  await ctx.close();
}
async function drag(page, pts, stepMs = 16) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) { await page.mouse.move(x, y); await page.waitForTimeout(stepMs); }
  await page.mouse.up();
}
const screenOf = (page, sel) => page.evaluate((sel) => {
  const g = window.__game; const v = new (g.train.loco.position.constructor)();
  if (sel === 'train') g.train.loco.getWorldPosition(v); else { const n = g.graph.freeNodes()[sel]; v.set(n.pos[0], 0, n.pos[1]); }
  v.project(g.cameras.view);
  return [((v.x + 1) / 2) * g.width, ((1 - v.y) / 2) * g.height];
}, sel);
const toyOf = (page, type) => page.evaluate((type) => {
  const g = window.__game; const it = g.hud.items.find((i) => i.type === type);
  const v = new (g.train.loco.position.constructor)(); it.mesh.getWorldPosition(v); v.y += 0.2; v.project(g.hud.camera);
  return [((v.x + 1) / 2) * g.width, ((1 - v.y) / 2) * g.height];
}, type);
const state = (page) => page.evaluate(() => { const g = window.__game; return { segs: g.graph.segments.size, free: g.graph.freeNodes().length, props: g.props.list.map((p) => p.type), running: g.train.running, speed: +g.train.speed.toFixed(2), mode: g.cameras.mode, onboard: g.props.onboard.length }; });

await run('iphone-portrait', { width: 393, height: 852 }, async (page, name, { width: w, height: h }) => {
  // draw from the right free end up and around
  const [ex, ey] = await screenOf(page, 1);
  const pts = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([ex + Math.sin(t * Math.PI) * 120, ey - t * 300]); }
  await drag(page, pts);
  await page.waitForTimeout(700);
  console.log(name, 'after draw', JSON.stringify(await state(page)));
  await page.screenshot({ path: `${OUT}/${name}-1-drawn.png` });
  // tap train
  const [tx, ty] = await screenOf(page, 'train');
  await page.mouse.click(tx, ty - 6);
  await page.waitForTimeout(1500);
  console.log(name, 'after tap', JSON.stringify(await state(page)));
  await page.screenshot({ path: `${OUT}/${name}-2-running.png` });
  // drag a toy out of the box
  const [cx, cy] = await toyOf(page, 'cow');
  await drag(page, [[cx, cy], [cx, cy - 60], [w * 0.25, h * 0.3]], 30);
  await page.waitForTimeout(600);
  const [sx, sy] = await toyOf(page, 'station');
  await drag(page, [[sx, sy], [sx, sy - 60], [w * 0.7, h * 0.42]], 30);
  await page.waitForTimeout(600);
  console.log(name, 'after props', JSON.stringify(await state(page)));
  await page.screenshot({ path: `${OUT}/${name}-3-prop.png` });
  // stop the train, then long press it -> cab
  const [sx1, sy1] = await screenOf(page, 'train');
  await page.mouse.click(sx1, sy1 - 6);
  await page.waitForTimeout(1500);
  const [tx2, ty2] = await screenOf(page, 'train');
  await page.mouse.move(tx2, ty2 - 6); await page.mouse.down(); await page.waitForTimeout(800); await page.mouse.up();
  await page.waitForTimeout(1500);
  console.log(name, 'cab', JSON.stringify(await state(page)));
  await page.screenshot({ path: `${OUT}/${name}-4-cab.png` });
  // pull lever up
  const lever = await page.evaluate(() => { const g = window.__game; const v = new (g.train.loco.position.constructor)(); g.hud.leverHandle.getWorldPosition(v); v.project(g.hud.camera); return [((v.x + 1) / 2) * g.width, ((1 - v.y) / 2) * g.height]; });
  await drag(page, [[lever[0], lever[1]], [lever[0], lever[1] - 80], [lever[0], lever[1] - 200]], 30);
  await page.waitForTimeout(1200);
  console.log(name, 'lever', JSON.stringify(await state(page)));
  await page.screenshot({ path: `${OUT}/${name}-5-cab-driving.png` });
  // tap pip -> back
  const pip = await page.evaluate(() => { const r = window.__game.hud.pipRect(); return [r.x + r.w / 2, window.__game.height - (r.y + r.h / 2)]; });
  await page.mouse.click(pip[0], pip[1]);
  await page.waitForTimeout(1500);
  console.log(name, 'back', JSON.stringify(await state(page)));
  await page.screenshot({ path: `${OUT}/${name}-6-back.png` });
  // let the train run to the station and pick up passengers
  await page.waitForTimeout(14000);
  console.log(name, 'passengers', JSON.stringify(await state(page)));
  await page.screenshot({ path: `${OUT}/${name}-7-station.png` });
  // put the cow back into the box
  const cowPos = await page.evaluate(() => { const g = window.__game; const p = g.props.list.find((q) => q.type === 'cow'); const v = new (g.train.loco.position.constructor)(p.x, 0.3, p.z); v.project(g.cameras.view); return [((v.x + 1) / 2) * g.width, ((1 - v.y) / 2) * g.height]; });
  await drag(page, [[cowPos[0], cowPos[1]], [cowPos[0], cowPos[1] + 100], [w * 0.5, h * 0.9]], 30);
  await page.waitForTimeout(500);
  // lift the first rail segment (long press on its middle) and drop it into the box
  const railPos = await page.evaluate(() => { const g = window.__game; const seg = [...g.graph.segments.values()][0]; const m = seg.pts[Math.floor(seg.pts.length / 2)]; const v = new (g.train.loco.position.constructor)(m[0], 0.05, m[1]); v.project(g.cameras.view); return [((v.x + 1) / 2) * g.width, ((1 - v.y) / 2) * g.height]; });
  await page.mouse.move(railPos[0], railPos[1]); await page.mouse.down(); await page.waitForTimeout(800);
  await page.mouse.move(railPos[0], railPos[1] + 100); await page.waitForTimeout(100);
  await page.mouse.move(w * 0.5, h * 0.9); await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}-8-liftrail.png` });
  await page.mouse.up();
  await page.waitForTimeout(600);
  console.log(name, 'put away', JSON.stringify(await state(page)));
  await page.screenshot({ path: `${OUT}/${name}-9-putaway.png` });
  // reload: state should persist
  await page.reload(); await page.waitForTimeout(1500);
  console.log(name, 'reloaded', JSON.stringify(await state(page)));
});
await run('ipad-landscape', { width: 1180, height: 820 }, async (page, name, { width: w, height: h }) => {
  const [ex, ey] = await screenOf(page, 1);
  const pts = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([ex + t * 260, ey - Math.sin(t * Math.PI) * 220]); }
  await drag(page, pts);
  await page.waitForTimeout(600);
  // crossing stroke to make a bridge
  const pts2 = [];
  for (let i = 0; i <= 30; i++) { const t = i / 30; pts2.push([ex + 130, ey + 150 - t * 320]); }
  await drag(page, pts2);
  await page.waitForTimeout(600);
  console.log(name, 'after draw', JSON.stringify(await state(page)));
  await page.screenshot({ path: `${OUT}/${name}-1-drawn.png` });
  const [cx, cy] = await toyOf(page, 'tree');
  await drag(page, [[cx, cy], [cx - 80, cy], [w * 0.3, h * 0.3]], 30);
  await page.waitForTimeout(800);
  console.log(name, 'after prop', JSON.stringify(await state(page)));
  await page.screenshot({ path: `${OUT}/${name}-2-prop.png` });
});
await browser.close();
await server.close();
