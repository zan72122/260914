/**
 * Frame grabber for the `toy` scene.
 *
 * dev/gestures.mjs has no PUSH gesture (nothing before this scene needed one),
 * so this script builds its own finger paths from the live positions of the
 * toys and their nests and drives window.game.input.replay directly.
 *
 *   node dev/toy-shots.mjs --device=iphone-portrait --seq=story \
 *        --frames=18 --every=150 --skip=0 --contact
 *
 * Sequences:
 *   story   creep up (air tugs the loose parts) -> shove the toy -> sliver of
 *           dust -> back off -> slow approach onto the uncovered nest
 *   bead    straight slow approach onto an already uncovered nest
 *   slide   landscape: run the head along the solid toy chest and into a toy,
 *           then rub between two toys (the "can the head get stuck" test)
 *   sweep   push all three toys off their nests in one long drag
 *   idle    park and do nothing (use with --complete)
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { launch, DEVICES } from './shot.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'dev', 'out');
const SAMPLE = 25;

function args() {
  const a = {};
  for (const s of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(s);
    if (m) a[m[1]] = m[2] === undefined ? true : m[2];
  }
  return a;
}

const ease = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => a + (b - a) * t;

/** Waypoints [{t(ms), x, y}] -> replay frames, eased between waypoints. */
function path(way) {
  const out = [{ t: 0, x: way[0].x, y: way[0].y, down: false }];
  const end = way[way.length - 1].t;
  for (let t = 0; t <= end; t += SAMPLE) {
    let i = 0;
    while (i < way.length - 2 && way[i + 1].t < t) i++;
    const a = way[i], b = way[i + 1] || a;
    const u = b.t === a.t ? 1 : ease(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))));
    out.push({ t: 40 + t, x: round(mix(a.x, b.x, u)), y: round(mix(a.y, b.y, u)), down: true });
  }
  return out;
}
const round = (v) => Math.round(v * 10000) / 10000;

function seqStory(info, lead) {
  const toy = info.nests[0];                 // the bear / first toy
  const park = info.park;
  let dx = toy.nx - park.x, dy = toy.ny - park.y;
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  const f = (nx, ny) => ({ x: nx, y: ny + lead });
  const at = (k) => f(toy.nx + dx * k, toy.ny + dy * k);
  return path([
    { t: 0, ...park },
    { t: 1400, ...at(-0.15) },               // creep up: the air finds the toy
    { t: 2400, ...at(-0.13) },               // hold: the loose parts lean harder
    { t: 3100, ...at(0.03) },                // shove: half the nest is bare
    { t: 3900, ...at(0.20) },                // shove through: all of it is bare
    { t: 4700, ...at(-0.13) },               // back off and look at what is there
    { t: 7600, ...f(toy.nx, toy.ny) },       // slow approach onto the nest
    { t: 9600, ...f(toy.nx, toy.ny) },
  ]);
}

function seqSweep(info, lead) {
  const f = (n, k) => ({ x: n.nx, y: n.ny + lead + k });
  const w = [{ t: 0, ...info.park }];
  let t = 0;
  for (let i = 0; i < info.nests.length; i++) {
    const n = info.nests[i];
    t += 900; w.push({ t, ...f(n, 0.13) });
    t += 700; w.push({ t, ...f(n, -0.16) });
    t += 500; w.push({ t, ...f(n, 0.05) });
  }
  // then a slow cleaning pass over each uncovered nest
  for (let i = 0; i < info.nests.length; i++) {
    const n = info.nests[i];
    t += 1100; w.push({ t, ...f(n, 0.11) });
    t += 1400; w.push({ t, ...f(n, -0.01) });
    t += 900; w.push({ t, ...f(n, 0.07) });
    t += 900; w.push({ t, ...f(n, -0.05) });
  }
  t += 800; w.push({ t, ...f(info.nests[0], 0) });
  return path(w);
}

function seqBead(info, lead) {
  const n = info.nests[0];
  return path([
    { t: 0, x: n.nx, y: n.ny + lead + 0.30 },
    { t: 3400, x: n.nx, y: n.ny + lead },
    { t: 5200, x: n.nx, y: n.ny + lead },
  ]);
}

function seqSlide(info, lead) {
  const chest = info.chest;
  const car = info.nests[1];
  const bear = info.nests[0];
  const w = [{ t: 0, ...info.park }];
  w.push({ t: 1100, x: chest.nx - 0.22, y: chest.ny + lead + 0.10 });
  w.push({ t: 2400, x: chest.nx + 0.22, y: chest.ny + lead + 0.02 });   // slide along it
  w.push({ t: 3400, x: car.nx, y: car.ny + lead + 0.14 });
  w.push({ t: 4200, x: car.nx, y: car.ny + lead - 0.10 });              // shove the car
  w.push({ t: 5000, x: bear.nx, y: bear.ny + lead + 0.10 });
  w.push({ t: 5600, x: car.nx, y: car.ny + lead + 0.05 });              // rub between toys
  w.push({ t: 6200, x: bear.nx, y: bear.ny + lead + 0.05 });
  w.push({ t: 6800, x: car.nx, y: car.ny + lead + 0.05 });
  return path(w);
}

const SEQS = { story: seqStory, sweep: seqSweep, bead: seqBead, slide: seqSlide, idle: () => [] };

async function main() {
  const a = args();
  const deviceName = a.device || 'iphone-portrait';
  const seq = a.seq || 'story';
  const frames = parseInt(a.frames || '18', 10);
  const every = parseInt(a.every || '150', 10);
  const skip = parseInt(a.skip || '0', 10);
  const seed = a.seed || '1337';
  const dim = DEVICES[deviceName];
  if (!dim) throw new Error('unknown device ' + deviceName);

  const dirName = a.out || `toy-${deviceName}-${seq}`;
  const dir = join(OUT, dirName);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const { server } = await startServer(Number(process.env.PORT || 0));   // 0 = any free port
  const url = 'http://127.0.0.1:' + server.address().port;
  const browser = await launch();
  const ctx = await browser.newContext({
    viewport: { width: dim.width, height: dim.height },
    deviceScaleFactor: Math.min(2, dim.dpr), isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.error('PAGE ERROR:', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) { errors.push(m.text()); console.error('CONSOLE:', m.text()); } });

  await page.goto(`${url}/index.html?scene=toy&seed=${seed}&dev=${a.devoverlay ? 1 : 0}&mute=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.game);
  await page.evaluate(() => { window.game.pause(); window.game.step(0.25); });

  if (a.complete) {
    await page.evaluate(() => {
      const sc = window.game._g.scene;
      sc.debris.forEach((d) => { d.dormant = false; d.state = 'in-cup'; });
    });
  }
  if (a.uncover) {
    await page.evaluate(() => {
      const sc = window.game._g.scene;
      const n = sc.nests[0];
      n.prop.x += 150; n.prop.y -= 40;
    });
    await page.evaluate(() => window.game.step(0.2));
  }

  const info = await page.evaluate(() => {
    const g = window.game._g;
    const p = { x: 0, y: 0 };
    const map = (wx, wy) => { g.camera.toScreen(wx, wy, p); return { nx: +(p.x / g.w).toFixed(4), ny: +(p.y / g.h).toFixed(4) }; };
    const st = window.game.state();
    return {
      pose: g.pose,
      park: { x: st.input.x / g.w, y: st.input.y / g.h },
      nests: g.scene.nests.map((n) => map(n.patch.x, n.patch.y)),
      chest: g.scene.chest ? map(g.scene.chest.x, g.scene.chest.y) : null,
      viewport: { w: g.w, h: g.h },
    };
  });
  const lead = (info.pose === 'portrait' ? 70 : 60) / info.viewport.h;
  const frs = SEQS[seq](info, lead);
  if (frs.length) await page.evaluate((f) => window.game.input.replay(f), frs);

  if (skip > 0) await page.evaluate((dt) => window.game.step(dt), skip / 1000);

  const states = [];
  for (let i = 0; i < frames; i++) {
    await page.evaluate((dt) => window.game.step(dt), every / 1000);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: join(dir, String(i).padStart(3, '0') + '.png') });
    states.push(await page.evaluate(() => window.game.state()));
  }
  await writeFile(join(dir, 'state.json'), JSON.stringify({
    scene: 'toy', device: deviceName, seq, every, skip, info, errors, states,
  }, null, 1));

  if (a.contact) {
    const cols = frames <= 12 ? 4 : 6;
    const imgs = [];
    for (let i = 0; i < frames; i++) imgs.push(`dev/out/${dirName}/${String(i).padStart(3, '0')}.png`);
    const html = `<!doctype html><meta charset=utf-8><style>
      body{margin:0;background:#101013;font:11px/1.4 monospace;color:#8fa}
      #sheet{display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:6px;width:${cols * 220 + 40}px}
      figure{margin:0;position:relative} img{width:100%;display:block;border:1px solid #2a2a30}
      figcaption{position:absolute;left:3px;top:3px;background:#000a;padding:1px 4px;color:#7fe}
      h1{font:12px monospace;color:#cde;margin:8px 10px 0}
    </style><h1>toy / ${deviceName} / ${seq} — ${every}ms per frame, skip ${skip}ms</h1>
    <div id=sheet>${imgs.map((s, i) => `<figure><img src="/${s}"><figcaption>${i}</figcaption></figure>`).join('')}</div>`;
    await writeFile(join(dir, 'contact.html'), html);
    await page.setViewportSize({ width: cols * 220 + 40, height: 900 });
    await page.goto(`${url}/dev/out/${dirName}/contact.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
    await page.locator('#sheet').screenshot({ path: join(dir, 'contact.png') });
  }

  await browser.close();
  server.close();
  const last = states[states.length - 1];
  console.log('wrote ' + frames + ' frames to ' + dir + ' | fps ' + (last ? last.fps : '?') + ' | errors ' + errors.length);
}

main().catch((e) => { console.error(e); process.exit(1); });
