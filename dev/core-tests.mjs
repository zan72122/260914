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
 *
 * A test may be async: the audio one renders the real graph through an
 * `OfflineAudioContext` in the page, which is the only honest way to check that
 * `setSpace`, `setStream` and a labouring motor actually make a sound and do
 * not clip.
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
  const { Prop, resolveProps, keepInside } = await import('/src/props/prop.js');
  const { Floor } = await import('/src/floors/floor.js');
  const { Scene } = await import('/src/scenes/scene.js');
  const { Debris } = await import('/src/debris/base.js');
  const { Audio } = await import('/src/core/audio.js');

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

  test('airborne: shape, cupKind and cupSize are separate from the drawn size', () => {
    const go = (kind) => {
      emptyCup();
      park(0, 0, 0, 1);
      const air = new Airborne(40, { kinds: { big: kind } });
      for (let i = 0; i < 8; i++) air.spawn(0, 40, 2, 0, 0, 0, 'big');
      for (let k = 0; k < 90 && !vac.transits.length; k++) air.update(1 / 60, vac);
      if (!vac.transits.length) throw new Error('nothing went in');
      const it = vac.transits[0];
      const drawn = air.p.find((q) => q.kind === 'big' && q.r) || { r: 0 };
      return { size: it.size, kind: it.kind, shape: air.kinds.big.shape, drawnR: drawn.r };
    };
    const base = { color: '#fff', drag: 3, gravity: 0, r: 9, life: 4, lift: 1 };
    const plain = go(Object.assign({}, base));
    const priced = go(Object.assign({}, base, { cupSize: 2, cupKind: 'crumb', shape: 'fibre' }));
    emptyCup(); vac.transits.length = 0;
    if (!near(priced.size, 2, 1e-6)) throw new Error('cupSize ignored: ' + priced.size);
    if (priced.kind !== 'crumb') throw new Error('cupKind ignored: ' + priced.kind);
    if (priced.shape !== 'fibre') throw new Error('shape was overwritten: ' + priced.shape);
    if (plain.kind !== 'wisp' || plain.shape !== 'dot') throw new Error('the defaults changed');
    if (!(plain.size > priced.size * 3)) throw new Error('the unpriced speck should cost what it is drawn at');
    return 'unpriced ' + plain.size.toFixed(1) + '/' + plain.kind + '/' + plain.shape
      + ' vs priced ' + priced.size.toFixed(1) + '/' + priced.kind + '/' + priced.shape;
  });

  test('airborne: onSettle fires once, when a speck touches the floor again', () => {
    park(0, -4000);
    let n = 0, lastZ = -1;
    const air = new Airborne(8, { onSettle: (it) => { n++; lastZ = it.z; } });
    air.spawn(0, 0, 120, 0, 0, 0, 'leaf');
    for (let k = 0; k < 300; k++) air.update(1 / 60, vac);
    if (n !== 1) throw new Error('onSettle fired ' + n + ' times');
    if (lastZ > 0.001) throw new Error('settled at z=' + lastZ);
    return 'one callback, at z=0, ' + air.settled + ' settled in all';
  });

  test('airborne: a seeded layer is deterministic', async () => {
    const { RNG } = await import('/src/core/rng.js');
    const run = () => {
      const air = new Airborne(16, { rng: new RNG(99) });
      const p = air.spawn(0, 0, 10, 0, 0, 0, 'flour');
      return [p.r, p.life, p.rot].map((v) => v.toFixed(6)).join(',');
    };
    const a = run(), b = run();
    if (a !== b) throw new Error('two seeded layers differ: ' + a + ' vs ' + b);
    return 'same seed, same speck (' + a + ')';
  });

  // --------------------------------------------------- powder, the new bits
  test('powder: advect conserves mass instead of quietly cleaning the floor', () => {
    const pw = new Powder({ x0: -200, y0: -200, x1: 200, y1: 200 }, 48, 48);
    pw.blob(0, 60, 70, 1);
    park(0, -20);
    vac.dirX = 0; vac.dirY = 1;
    const before = pw.total();
    for (let k = 0; k < 240; k++) pw.advect(vac, 1 / 60);
    const after = pw.total();
    // the film may pile up at the mouth, but it must never simply disappear:
    // anything lost here is flour cleaned without ever going up the tube
    if (after < before * 0.9) {
      throw new Error('lost ' + (100 * (1 - after / before)).toFixed(1) + '% of the film to advection');
    }
    return 'kept ' + (100 * after / before).toFixed(1) + '% of the mass over 4s of hard flow';
  });

  test('powder: swirl curls the film in without losing it', () => {
    const pw = new Powder({ x0: -200, y0: -200, x1: 200, y1: 200 }, 48, 48);
    pw.blob(0, 60, 70, 1);
    park(0, -20);
    vac.dirX = 0; vac.dirY = 1;
    const before = pw.total();
    for (let k = 0; k < 120; k++) pw.advect(vac, 1 / 60, 380, 0.6);
    if (pw.total() < before * 0.9) throw new Error('swirl leaked mass');
    return 'swirled for 2s, kept ' + (100 * pw.total() / before).toFixed(1) + '%';
  });

  test('powder: feather softens the edge and clipTo cuts it to shape', () => {
    const rect = { x0: -200, y0: -200, x1: 200, y1: 200 };
    const pw = new Powder(rect, 48, 48);
    pw.blob(0, 0, 400, 1);                      // deliberately over the edges
    const edge0 = pw.get(-196, 0);
    pw.feather(rect, 60);
    const edge1 = pw.get(-196, 0);
    if (!(edge1 < edge0 * 0.5)) throw new Error('edge not feathered: ' + edge0.toFixed(2) + ' -> ' + edge1.toFixed(2));
    if (pw.get(0, 0) < 0.5) throw new Error('feather ate the middle too');
    pw.clipTo({ x0: -50, y0: -50, x1: 50, y1: 50 });
    if (pw.get(120, 0) > 1e-6) throw new Error('clipTo left powder outside the rect');
    if (pw.get(0, 0) <= 0) throw new Error('clipTo ate the inside');
    return 'edge ' + edge0.toFixed(2) + ' -> ' + edge1.toFixed(2) + ', outside the clip: 0';
  });

  // ----------------------------------------------------- cloth, the new bits
  test('cloth: pinned {top:true} sews the top row and frees the hem', () => {
    const cl = new Cloth({ x0: -80, y0: -60, x1: 80, y1: 60 }, 9, 7, { pinned: { top: true } });
    park(0, 110);                              // below the hem, facing up at it
    vac.dirX = 0; vac.dirY = -1;
    for (let k = 0; k < 120; k++) cl.update(1 / 60, vac);
    const top = cl.rows - 1;
    if (!near(cl.y[0], cl.hy[0], 1e-6)) throw new Error('the top row moved');
    const hem = top * cl.cols + (cl.cols >> 1);
    if (!(Math.abs(cl.y[hem] - cl.hy[hem]) > 1)) throw new Error('the hem did not lift');
    return 'top sewn, hem moved ' + (cl.y[hem] - cl.hy[hem]).toFixed(1) + 'px';
  });

  test('cloth: translate moves the sheet without unfolding it', () => {
    const cl = new Cloth({ x0: -80, y0: -60, x1: 80, y1: 60 }, 9, 7, { pinned: 'none' });
    park(0, -110);
    vac.dirX = 0; vac.dirY = 1;
    for (let k = 0; k < 90; k++) cl.update(1 / 60, vac);
    const i = (cl.rows >> 1) * cl.cols + (cl.cols >> 1);
    const foldX = cl.x[i] - cl.hx[i], foldY = cl.y[i] - cl.hy[i];
    const x0 = cl.x[i];
    cl.translate(120, -40);
    if (!near(cl.x[i], x0 + 120, 1e-4)) throw new Error('the node did not move');
    if (!near(cl.x[i] - cl.hx[i], foldX, 1e-4) || !near(cl.y[i] - cl.hy[i], foldY, 1e-4)) {
      throw new Error('the fold changed shape');
    }
    if (!near(cl.rect.x0, -80 + 120, 1e-4)) throw new Error('the rect did not come along');
    return 'moved 120,-40 with the fold (' + foldX.toFixed(1) + ',' + foldY.toFixed(1) + ') intact';
  });

  test('cloth: lift raises the node the air is under, and only that one', () => {
    const cl = new Cloth({ x0: -80, y0: -60, x1: 80, y1: 60 }, 9, 7, { lift: 20 });
    park(0, -110);
    vac.dirX = 0; vac.dirY = 1;
    for (let k = 0; k < 120; k++) cl.update(1 / 60, vac);
    const mid = (cl.rows >> 1) * cl.cols + (cl.cols >> 1);
    if (!(cl.lz[mid] > 1)) throw new Error('the middle did not rise: lz=' + cl.lz[mid].toFixed(2));
    if (cl.lz[0] > 0.2) throw new Error('a pinned corner rose too: ' + cl.lz[0].toFixed(2));
    const q = { x: 0, y: 0 };
    cl.pointAt(0.5, 0.5, q);
    if (!near(q.y, cl.y[mid] - cl.lz[mid], 1e-4)) throw new Error('pointAt ignored the lift');
    return 'middle rose ' + cl.lz[mid].toFixed(1) + 'px, the seam stayed flat';
  });

  // ----------------------------------------------------------------- props
  test("prop: pushable 'sweep' ignores a crawl and is displaced by a sweep", () => {
    const mk = () => new Prop({ x: 0, y: 0, shape: 'circle', r: 30, pushable: 'sweep', mass: 1 });
    park(0, 0, 0, 1);
    const slow = mk();
    vac.nozzle.vx = 60; vac.nozzle.vy = 0;      // a crawl
    for (let k = 0; k < 30; k++) { vac.nozzle.x = -10 + k; resolveProps(vac, [slow], 1 / 60); }
    if (Math.abs(slow.x) > 0.5) throw new Error('a crawl moved it ' + slow.x.toFixed(2) + 'px');
    park(0, 0, 0, 1);
    const fast = mk();
    vac.nozzle.vx = 900; vac.nozzle.vy = 0;     // a real sweep
    for (let k = 0; k < 30; k++) { vac.nozzle.x = -10 + k; vac.nozzle.vx = 900; resolveProps(vac, [fast], 1 / 60); }
    if (!(fast.x > 4)) throw new Error('a sweep did not displace it: ' + fast.x.toFixed(2));
    return 'crawl 0px, sweep ' + fast.x.toFixed(1) + 'px';
  });

  test("prop: pushable 'sweep' never blocks the head", () => {
    park(0, 0, 0, 1);
    const p = new Prop({ x: 0, y: 0, shape: 'circle', r: 30, pushable: 'sweep' });
    vac.nozzle.x = 2; vac.nozzle.y = 0; vac.nozzle.vx = 0; vac.nozzle.vy = 0;
    resolveProps(vac, [p], 1 / 60);
    if (Math.abs(vac.nozzle.x - 2) > 1e-6) throw new Error('the head was pushed out of a flat thing');
    return 'the head rides straight over it';
  });

  test('prop: oneWay is solid from one side and open from the other', () => {
    const solidSide = () => {
      park(0, 0, 0, 1);
      const p = new Prop({ x: 0, y: 0, shape: 'circle', r: 40, pushable: false, oneWay: { x: 0, y: -1 } });
      vac.nozzle.x = 0; vac.nozzle.y = -50; vac.nozzle.vx = 0; vac.nozzle.vy = 120;
      resolveProps(vac, [p], 1 / 60);
      return vac.nozzle.y;
    };
    const openSide = () => {
      park(0, 0, 0, 1);
      const p = new Prop({ x: 0, y: 0, shape: 'circle', r: 40, pushable: false, oneWay: { x: 0, y: -1 } });
      vac.nozzle.x = 0; vac.nozzle.y = 50; vac.nozzle.vx = 0; vac.nozzle.vy = -120;
      resolveProps(vac, [p], 1 / 60);
      return vac.nozzle.y;
    };
    const a = solidSide(), b = openSide();
    if (!(a < -50)) throw new Error('it did not block from the solid side: y=' + a.toFixed(2));
    if (Math.abs(b - 50) > 1e-6) throw new Error('it blocked from the open side too: y=' + b.toFixed(2));
    return 'blocked from -y (' + a.toFixed(1) + '), open from +y';
  });

  test('prop: keepInside takes a pad in PIXELS and still honours the old inset', () => {
    const a = new Prop({ x: 900, y: 0, shape: 'circle', r: 20, pushable: true });
    keepInside(a, { x0: -100, y0: -100, x1: 100, y1: 100, pad: 12 });
    if (!near(a.x, 88, 1e-6)) throw new Error('pad is not px: x=' + a.x.toFixed(2));
    const b = new Prop({ x: 900, y: 0, shape: 'circle', r: 20, pushable: true });
    keepInside(b, { x0: -100, y0: -100, x1: 100, y1: 100, inset: 0.8 });
    if (!near(b.x, 100 - 16, 1e-6)) throw new Error('the legacy multiplier changed: x=' + b.x.toFixed(2));
    const c = new Prop({ x: 900, y: 0, shape: 'circle', r: 20, pushable: true });
    keepInside(c, { x0: -100, y0: -100, x1: 100, y1: 100, inset: 30 });
    if (!near(c.x, 70, 1e-6)) throw new Error('an inset > 2 should read as px: x=' + c.x.toFixed(2));
    return 'pad 12px -> 88, inset 0.8 -> 84, inset 30 -> 70';
  });

  // ---------------------------------------------------------------- scene
  test('scene: placeBin({within}) keeps the bin on the part of the floor that is floor', () => {
    const sc = new Scene('t', g.rng);
    sc.layout('portrait', 390, 844);
    sc.rest = { x: 0, y: 0, zoom: 1, tilt: 0 };
    sc.startPointer = { x: 0.5, y: 0.82 };
    const within = { x0: -60, y0: -200, x1: 160, y1: 0 };
    sc.placeBin({ within });
    const b = sc.bin;
    if (b.x < within.x0 - 60 || b.x > within.x1 + 60 || b.y < within.y0 - 60 || b.y > within.y1 + 60) {
      throw new Error('the bin landed outside `within`: ' + Math.round(b.x) + ',' + Math.round(b.y));
    }
    const sc2 = new Scene('t2', g.rng);
    sc2.layout('portrait', 390, 844);
    sc2.rest = { x: 0, y: 0, zoom: 1, tilt: 0 };
    sc2.placeBin({ within: { x0: 1e5, y0: 1e5, x1: 1e5 + 1, y1: 1e5 + 1 } });
    const R = sc2.reachRect({ x0: 0, y0: 0, x1: 0, y1: 0 }, 0);
    if (sc2.bin.x < R.x0 || sc2.bin.x > R.x1) throw new Error('an impossible `within` stranded the bin');
    return 'bin at ' + Math.round(b.x) + ',' + Math.round(b.y) + '; an empty `within` falls back to reach';
  });

  // --------------------------------------------------------------- debris
  test('debris: the id is derived from `type` on first read, not in the constructor', () => {
    class Late extends Debris {
      constructor(heavy) { super(0, 0); this.heavy = heavy; }
      get type() { return this.heavy ? 'stone' : 'chip'; }
    }
    const a = new Late(true), b = new Late(false);
    if (a.id.indexOf('stone#') !== 0) throw new Error('got ' + a.id);
    if (b.id.indexOf('chip#') !== 0) throw new Error('got ' + b.id);
    if (a.id === b.id) throw new Error('two pieces share an id');
    a.id = 'mine#1';
    if (a.id !== 'mine#1') throw new Error('a scene can no longer name a piece');
    return a.id + ' / ' + b.id;
  });

  // --------------------------------------------------------------- camera
  test('camera: stepTo takes an explicit tread list and a constant offset', () => {
    const cam = new Camera();
    cam.setViewport(390, 844);
    const steps = [0, -90, -230, -300, -460];       // a flight that is not a ruler
    const anchor = { x: 0, y: 0, zoom: 1, tilt: 0 };
    const subj = { x: 0, y: 0 };
    cam.resetSteps();
    const seen = [];
    for (let k = 0; k < 900; k++) {
      subj.y = -(k / 900) * 460;
      cam.stepTo(1 / 60, anchor, subj, { axis: 'y', steps, offset: -40, rate: 14 });
      seen.push(cam.y);
    }
    let settled = 0;
    for (let i = 12; i < seen.length; i++) {
      if (Math.abs(seen[i] - seen[i - 12]) > 0.4) continue;
      settled++;
      let ok = false;
      for (const st of steps) if (Math.abs(seen[i] - (st - 40)) < 1.2) ok = true;
      if (!ok) throw new Error('settled between treads at y=' + seen[i].toFixed(1));
    }
    if (settled < 150) throw new Error('never settled: ' + settled + ' still frames');
    if (!(cam.y < -460)) throw new Error('the offset was ignored: y=' + cam.y.toFixed(1));
    return settled + ' settled frames, every one on a named tread, offset -40 applied';
  });

  // -------------------------------------------------------------- vacuum
  test('vacuum: squash is honoured, bounded, re-asserted and relaxes', () => {
    park(0, 0, 0, 1);
    vac.squashAmount = 0;
    vac.squash(0.6, 'y');
    vac.squash(0.3, 'x');                     // weaker: must not win
    if (Math.abs(vac.squashAmount - 0.6) > 1e-6) throw new Error('a weaker call overrode a stronger one');
    if (vac.squashAxis !== 'y') throw new Error('the axis was taken from the weaker call');
    vac.squash(4);
    if (vac.squashAmount > 1) throw new Error('squash is not clamped: ' + vac.squashAmount);
    for (let k = 0; k < 60; k++) vac.update(1 / 60, g.input, g.camera);
    if (vac.squashAmount > 0.02) throw new Error('never relaxed: ' + vac.squashAmount.toFixed(3));
    // it must actually reach the head drawing: no exception, and the transform
    // is the only thing that could throw
    vac.squash(1, 'x');
    const c = document.createElement('canvas').getContext('2d');
    vac.draw(c, g.camera);
    vac.squashAmount = 0;
    return 'strongest call wins, clamped to 1, relaxed in 1s, drawn without complaint';
  });

  // --------------------------------------------------------------- floor
  test('floor: enableGrime({scale}) is a smaller layer that still lands on the floor', () => {
    const rect = { x0: -200, y0: -200, x1: 200, y1: 200 };
    const full = new Floor(rect); full.enableGrime();
    const half = new Floor(rect); half.enableGrime({ scale: 0.5 });
    if (half.grime.width !== full.grime.width / 2) {
      throw new Error('not half res: ' + half.grime.width + ' vs ' + full.grime.width);
    }
    for (const f of [full, half]) {
      const gc = f.gctx;
      gc.fillStyle = '#888'; gc.fillRect(0, 0, f.w, f.h);   // world units either way
      f.reveal(0, 0, 40);
    }
    const sample = (f) => {
      const c = document.createElement('canvas'); c.width = 400; c.height = 400;
      const cc = c.getContext('2d');
      cc.translate(200, 200);
      f.draw(cc);
      return cc.getImageData(200, 200, 1, 1).data[3];        // world (0,0)
    };
    const a = sample(full), b = sample(half);
    if (a > 30) throw new Error('the full-res hole is not a hole: alpha ' + a);
    if (b > 30) throw new Error('the half-res hole missed: alpha ' + b);
    return 'half-res layer ' + half.grime.width + 'px, hole lands in the same place';
  });

  // --------------------------------------------------------------- audio
  test('audio: setSpace, setStream and a clogged motor all render, in bounds', async () => {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return 'no OfflineAudioContext in this browser — skipped';
    const AC0 = window.AudioContext, WAC0 = window.webkitAudioContext;
    const render = async (drive) => {
      window.AudioContext = function () { return new OAC(1, 44100 * 1.2, 44100); };
      window.webkitAudioContext = undefined;
      const a = new Audio();
      a.start();
      if (!a.ready) { window.AudioContext = AC0; window.webkitAudioContext = WAC0; throw new Error('the graph never came up'); }
      drive(a);
      const buf = await a.ctx.startRendering();
      window.AudioContext = AC0; window.webkitAudioContext = WAC0;
      const d = buf.getChannelData(0);
      let peak = 0, sum = 0;
      for (let i = 0; i < d.length; i++) {
        const v = d[i];
        if (!isFinite(v)) throw new Error('a non-finite sample at ' + i);
        const av = v < 0 ? -v : v;
        if (av > peak) peak = av;
        sum += av;
      }
      return { peak, mean: sum / d.length };
    };
    const quiet = await render((a) => { a.setMotor(1, 0, 0); a.setStream(0); a.setSpace(null); });
    const loud = await render((a) => {
      a.setSpace({ muffle: 0.8, pitchBias: -3 });
      a.setStream(1);
      a.setMotor(2.2, 1, 1);
      a.pop('pop', 1); a.pop('tick', 1); a.pop('whoosh', 1);
    });
    if (loud.peak > 1) throw new Error('the loud case clips: peak ' + loud.peak.toFixed(3));
    if (quiet.peak > 1) throw new Error('the quiet case clips: peak ' + quiet.peak.toFixed(3));
    if (!(loud.mean > quiet.mean)) {
      throw new Error('everything on is no louder than everything off: ' + loud.mean.toFixed(5) + ' vs ' + quiet.mean.toFixed(5));
    }
    if (!(loud.mean > 1e-5)) throw new Error('nothing came out at all');
    return 'idle peak ' + quiet.peak.toFixed(3) + ', everything-on peak ' + loud.peak.toFixed(3)
      + ' (mean ' + quiet.mean.toFixed(4) + ' -> ' + loud.mean.toFixed(4) + '), no clipping';
  });

  for (const t of T) {
    if (only && t.name.indexOf(only) < 0) continue;
    try { out.push({ name: t.name, ok: true, detail: (await t.fn()) || '' }); }
    catch (e) { out.push({ name: t.name, ok: false, detail: String(e.message || e) }); }
  }
  return out;
}

// ------------------------------------------------------------------- runner

const { server, url } = await startServer(Number(process.env.PORT || 0));   // 0 = any free port
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
