/**
 * In-browser unit tests for the core services the Phase B rooms are built on.
 *
 *   node dev/core-tests.mjs
 *   node dev/core-tests.mjs --only=powder
 *
 * They run in the real page, against the real `Vacuum`, because every one of
 * these modules is defined by what `vac.field()` does to it — a mock would only
 * be testing the mock. Each test drives the machine the way a scene would and
 * asserts the behaviour a room depends on, not the implementation.
 *
 * Exit code is non-zero if anything fails, so it belongs in the same pass as
 * `dev/playthrough.mjs`.
 */
import { startServer } from './serve.mjs';
import { launch } from './shot.mjs';

function args() {
  const a = {};
  for (const s of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(s);
    if (m) a[m[1]] = m[2] === undefined ? true : m[2];
  }
  return a;
}
const A = args();

/**
 * Everything below this line runs INSIDE the page. It returns a flat list of
 * {name, ok, detail} so the node side stays dumb.
 */
async function SUITE(only) {
  const out = [];
  const T = [];
  const test = (name, fn) => T.push({ name, fn });
  const near = (a, b, eps) => Math.abs(a - b) <= eps;

  const g = window.game._g;
  const vac = g.vacuum;
  window.game.pause();

  /** Park the machine at a world point, facing +y (down the screen). */
  function park(x, y, dirX, dirY) {
    vac.nozzle.x = x; vac.nozzle.y = y; vac.nozzle.vx = 0; vac.nozzle.vy = 0;
    vac.body.x = x - (dirX || 0) * 120; vac.body.y = y - (dirY === undefined ? -1 : dirY) * 120;
    vac.dirX = dirX === undefined ? 0 : dirX;
    vac.dirY = dirY === undefined ? -1 : dirY;
    vac.power = 2.2; vac.powerN = 1; vac.clog = 0;
    vac.transits.length = 0;
  }
  function emptyCup() { vac.clearCup(); vac.cupVol = 0; vac.cupFill = 0; }

  const { Airborne } = await import('/src/core/airborne.js');
  const { Powder } = await import('/src/core/powder.js');
  const { Cloth } = await import('/src/core/cloth.js');
  const { Bin } = await import('/src/props/bin.js');
  const { CUP_CAPACITY } = await import('/src/vacuum/vacuum.js');
  const { Camera } = await import('/src/core/camera.js');

  // ------------------------------------------------------------- airborne
  test('airborne: low specks are swallowed, high ones sail over', () => {
    emptyCup();
    park(0, 0, 0, 1);                        // facing down the screen
    const air = new Airborne(120);
    for (let i = 0; i < 30; i++) air.spawn(-20 + i, 70, 6, 0, 0, 0, 'flour');
    for (let i = 0; i < 30; i++) air.spawn(-20 + i, 70, 190, 0, 0, 0, 'flour');
    for (let k = 0; k < 180; k++) air.update(1 / 60, vac);
    if (air.captured < 10) throw new Error('only ' + air.captured + ' of 30 low specks went in');
    if (air.captured > 46) throw new Error('the high ones were swallowed too: ' + air.captured);
    return air.captured + ' captured of 60 (30 low, 30 high)';
  });

  test('airborne: gravity brings a speck back to the floor', () => {
    park(0, -4000);                         // the machine is far away
    const air = new Airborne(8);
    const p = air.spawn(0, 0, 120, 0, 0, 0, 'leaf');
    for (let k = 0; k < 120; k++) air.update(1 / 60, vac);
    if (p.z > 1) throw new Error('still at z=' + p.z.toFixed(1) + ' after 2s');
    return 'settled from z=120 in under 2s';
  });

  // --------------------------------------------------------------- powder
  test('powder: suck returns the mass it removed, and only where there is any', () => {
    const pw = new Powder({ x0: -200, y0: -200, x1: 200, y1: 200 }, 48, 48);
    pw.blob(0, 0, 90, 1);
    const before = pw.total();
    const got = pw.suck(0, 0, 30, 0.5);
    if (got <= 0) throw new Error('took nothing from the middle of the spill');
    if (!near(pw.total(), before - got, 1e-3)) throw new Error('mass is not conserved');
    const none = pw.suck(190, 190, 10, 0.5);
    if (none > 1e-6) throw new Error('took ' + none + ' from bare floor');
    return 'took ' + got.toFixed(2) + ' from the spill, 0 from bare floor';
  });

  test('powder: cleanFrac goes 0 -> 1 as the film is taken away', () => {
    const pw = new Powder({ x0: -200, y0: -200, x1: 200, y1: 200 }, 40, 40);
    pw.blob(0, 0, 120, 1);
    pw.markDirty();
    if (pw.cleanFrac() > 0.02) throw new Error('starts clean: ' + pw.cleanFrac());
    for (let k = 0; k < 400; k++) pw.suck(0, 0, 140, 0.4);
    if (pw.cleanFrac() < 0.98) throw new Error('never got clean: ' + pw.cleanFrac().toFixed(3));
    return 'dirty ' + pw.dirtyCells + ' cells -> clean';
  });

  test('powder: advect drags the film toward the mouth', () => {
    const pw = new Powder({ x0: -200, y0: -200, x1: 200, y1: 200 }, 48, 48);
    pw.blob(0, 60, 70, 1);
    park(0, -20);                            // mouth above the spill, facing it
    vac.dirX = 0; vac.dirY = 1;
    const centroid = () => {
      let sx = 0, sy = 0, m = 0;
      for (let cy = 0; cy < pw.rows; cy++) {
        for (let cx = 0; cx < pw.cols; cx++) {
          const v = pw.d[cy * pw.cols + cx];
          if (v <= 0) continue;
          sx += pw.worldX(cx) * v; sy += pw.worldY(cy) * v; m += v;
        }
      }
      return { x: sx / m, y: sy / m };
    };
    const c0 = centroid();
    const d0 = Math.hypot(c0.x - vac.mouthX, c0.y - vac.mouthY);
    for (let k = 0; k < 120; k++) pw.advect(vac, 1 / 60);
    const c1 = centroid();
    const d1 = Math.hypot(c1.x - vac.mouthX, c1.y - vac.mouthY);
    if (!(d1 < d0 - 2)) throw new Error('centroid did not move in: ' + d0.toFixed(1) + ' -> ' + d1.toFixed(1));
    return 'centroid ' + d0.toFixed(1) + 'px -> ' + d1.toFixed(1) + 'px from the mouth';
  });

  test('powder: puff lifts mass off the floor for the airborne layer', () => {
    const pw = new Powder({ x0: -200, y0: -200, x1: 200, y1: 200 }, 40, 40);
    pw.blob(0, 0, 80, 1);
    const before = pw.total();
    const lifted = pw.puff(0, 0, 60, 0.6);
    if (lifted <= 0) throw new Error('nothing lifted');
    if (!near(pw.total(), before - lifted, 1e-3)) throw new Error('mass is not conserved');
    return 'lifted ' + lifted.toFixed(2) + ' of ' + before.toFixed(2);
  });

  // ---------------------------------------------------------------- cloth
  test('cloth: the weave bulges toward the mouth and relaxes again', () => {
    const cl = new Cloth({ x0: -80, y0: -60, x1: 80, y1: 60 }, 9, 7);
    park(0, -110);
    vac.dirX = 0; vac.dirY = 1;
    for (let k = 0; k < 90; k++) cl.update(1 / 60, vac);
    const peak = cl.bulge;
    if (peak < 0.12) throw new Error('barely moved: bulge=' + peak.toFixed(3));
    const mid = cl.rows >> 1, midc = cl.cols >> 1;
    const i = mid * cl.cols + midc;
    if (!(cl.y[i] < cl.hy[i])) throw new Error('the middle did not lift toward the mouth');
    park(0, -4000);
    for (let k = 0; k < 240; k++) cl.update(1 / 60, vac);
    if (cl.bulge > 0.06) throw new Error('never relaxed: bulge=' + cl.bulge.toFixed(3));
    return 'bulge ' + peak.toFixed(2) + ' under the mouth, ' + cl.bulge.toFixed(3) + ' when it leaves';
  });

  test('cloth: the pinned seam never moves', () => {
    const cl = new Cloth({ x0: -80, y0: -60, x1: 80, y1: 60 }, 9, 7);
    park(-80, -60);
    for (let k = 0; k < 120; k++) cl.update(1 / 60, vac);
    if (!near(cl.x[0], cl.hx[0], 1e-6) || !near(cl.y[0], cl.hy[0], 1e-6)) {
      throw new Error('corner node drifted');
    }
    return 'corner stayed sewn down';
  });

  // ------------------------------------------------------------ tool morph
  test('nozzle morph: the crevice tool is narrower and reaches further on axis', () => {
    park(0, 0, 0, 1);                        // facing +y
    const F = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };
    vac.setTool('wide', 0);
    const onWide = vac.field(0, 150, F).strength;
    const offWide = vac.field(110, 60, F).strength;
    vac.setTool('crevice', 1);
    const onCrev = vac.field(0, 150, F).strength;
    const offCrev = vac.field(110, 60, F).strength;
    if (!(onCrev > onWide * 1.25)) throw new Error('no extra reach on axis: ' + onWide.toFixed(3) + ' -> ' + onCrev.toFixed(3));
    if (!(offCrev < offWide * 0.8)) throw new Error('not narrower off axis: ' + offWide.toFixed(3) + ' -> ' + offCrev.toFixed(3));
    vac.setTool('wide', 0);
    return 'on-axis ' + onWide.toFixed(2) + '->' + onCrev.toFixed(2)
      + ', off-axis ' + offWide.toFixed(2) + '->' + offCrev.toFixed(2);
  });

  // ------------------------------------------------------- cup capacity
  test('cup: the airflow fades above 80% and stops taking anything at 100%', () => {
    emptyCup();
    park(0, 0, 0, 1);
    const F = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };
    const s0 = vac.field(0, 120, F).strength;
    vac.cupVol = CUP_CAPACITY * 0.8; vac.cupFill = 0.8;
    const s80 = vac.field(0, 120, F).strength;
    vac.cupVol = CUP_CAPACITY * 0.9; vac.cupFill = 0.9;
    const s90 = vac.field(0, 120, F).strength;
    vac.cupVol = CUP_CAPACITY; vac.cupFill = 1;
    const s100 = vac.field(0, 120, F).strength;
    const inMouth = vac.field(0, 22, F).inCapture;
    if (!near(s80, s0, 1e-6)) throw new Error('weakened before 80%');
    if (!(s90 < s0 * 0.85)) throw new Error('no visible weakening at 90%: ' + (s90 / s0).toFixed(3));
    if (!near(s100 / s0, 0.45, 0.02)) throw new Error('full power should be 45%, got ' + (s100 / s0).toFixed(3));
    if (inMouth) throw new Error('a full cup still swallowed something');
    emptyCup();
    return 'x' + (s90 / s0).toFixed(2) + ' at 0.9, x' + (s100 / s0).toFixed(2) + ' at 1.0, mouth shut';
  });

  test('cup: a full mouth blows things back out instead of pulling them in', () => {
    emptyCup();
    park(0, 0, 0, 1);
    const F = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };
    // the mouth is at y=+22 facing +y, so a speck at y=60 is pulled UP (-y)
    vac.field(0, 60, F);
    if (!(F.fy < 0)) throw new Error('an empty cup should pull toward the mouth, fy=' + F.fy.toFixed(4));
    vac.cupVol = CUP_CAPACITY; vac.cupFill = 1;
    vac.field(0, 60, F);
    if (!(F.fy > 0)) throw new Error('a full cup should push it back out, fy=' + F.fy.toFixed(4));
    emptyCup();
    return 'the pull reverses into a push within 46px of a full mouth';
  });

  // ------------------------------------------------------------------ bin
  test('bin: the mouth in reach empties the cup into it and restores the power', () => {
    emptyCup();
    park(0, 0, 0, 1);
    for (let i = 0; i < 40; i++) vac.addToCup({ kind: 'fluff', color: '#ccc', size: 20 });
    const filled = vac.cupFill;
    if (filled < 0.5) throw new Error('could not fill the cup enough to test: ' + filled.toFixed(2));
    const bin = new Bin({ x: vac.mouthX + 40, y: vac.mouthY, rng: g.rng });
    const ctx = { vacuum: vac, camera: g.camera, audio: null, rng: g.rng };
    for (let k = 0; k < 300; k++) bin.update(1 / 60, ctx);
    if (vac.cup.length) throw new Error('the cup still has ' + vac.cup.length + ' in it');
    if (vac.cupFill > 0.001) throw new Error('fill did not reset');
    if (bin.heap.length < 30) throw new Error('only ' + bin.heap.length + ' landed in the bin');
    return 'poured ' + bin.heap.length + ' items, fill ' + filled.toFixed(2) + ' -> 0';
  });

  test('bin: a nearly empty cup is left alone when you walk past', () => {
    emptyCup();
    park(0, 0, 0, 1);
    for (let i = 0; i < 3; i++) vac.addToCup({ kind: 'crumb', color: '#ccc', size: 8 });
    const bin = new Bin({ x: vac.mouthX + 30, y: vac.mouthY, rng: g.rng });
    const ctx = { vacuum: vac, camera: g.camera, audio: null, rng: g.rng };
    for (let k = 0; k < 120; k++) bin.update(1 / 60, ctx);
    if (!vac.cup.length) throw new Error('it emptied a cup with three crumbs in it');
    emptyCup();
    return 'cup kept (fill below the bin arm threshold)';
  });

  // --------------------------------------------------------------- camera
  test('camera: stepTo settles on whole steps instead of gliding', () => {
    const cam = new Camera();
    cam.setViewport(390, 844);
    const anchor = { x: 0, y: 0, zoom: 1, tilt: 0 };
    const subj = { x: 0, y: 0 };
    const seen = [];
    for (let k = 0; k < 600; k++) {
      subj.y = -(k / 600) * 400;             // climb four 100px steps, smoothly
      cam.stepTo(1 / 60, anchor, subj, { axis: 'y', step: 100, rate: 12 });
      seen.push(cam.y);
    }
    // every settled value must be near a multiple of the step
    let settled = 0;
    for (let i = 10; i < seen.length; i++) {
      if (Math.abs(seen[i] - seen[i - 10]) < 0.4) {
        const q = seen[i] / 100;
        if (Math.abs(q - Math.round(q)) > 0.08) throw new Error('settled off-step at y=' + seen[i].toFixed(1));
        settled++;
      }
    }
    if (settled < 200) throw new Error('never settled: only ' + settled + ' still frames');
    if (!(cam.y < -300)) throw new Error('did not climb: y=' + cam.y.toFixed(1));
    return settled + ' settled frames, all on whole steps, climbed to ' + cam.y.toFixed(0);
  });

  for (const t of T) {
    if (only && t.name.indexOf(only) < 0) continue;
    try { out.push({ name: t.name, ok: true, detail: t.fn() || '' }); }
    catch (e) { out.push({ name: t.name, ok: false, detail: String(e.message || e) }); }
  }
  return out;
}

// ------------------------------------------------------------------- runner

const { server, url } = await startServer(Number(process.env.PORT || 0) || 8166);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message || e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(`${url}/index.html?scene=intro&seed=1337&mute=1`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.game);

const results = await page.evaluate(SUITE, A.only ? String(A.only) : null);
await browser.close();
server.close();

let bad = 0;
for (const r of results) {
  if (!r.ok) bad++;
  console.log((r.ok ? '  ok   ' : '  FAIL ') + r.name + (r.detail ? '\n         ' + r.detail : ''));
}
for (const e of errors) { bad++; console.log('  FAIL page error: ' + e); }
console.log('\n' + (results.length - (bad)) + '/' + results.length + ' core tests passed');
if (bad) process.exit(1);
