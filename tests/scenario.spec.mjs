/**
 * Local scenario checks.
 *
 *   npm test                      # the default set
 *   npm test -- bell:2            # one scenario
 *   npm test -- bell:2 reveal:3   # a few
 *   npm test -- --shots bell:2    # also write shots/scenario-bell-2.png
 *
 * Each check loads the state right before one stage, drives it with a real
 * screen tap at the projected position of the invited object, then advances
 * the real update loop in fixed steps and asserts the result from snapshot().
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, DIST, SHOTS, serve, launch, loadChromium, requireBuild,
  openGame, step, snapshot, gameLog, stepUntil, tapInvited
} from './harness.mjs';

const args = process.argv.slice(2);
const wantShots = args.includes('--shots');
const names = args.filter(a => !a.startsWith('--'));

const DEFAULT_SET = [
  'find:1', 'walk:1', 'bell:2', 'open:2', 'reveal:3',
  'bucket:3', 'candy:4', 'next:4', 'ending:5'
];

let failures = 0, checks = 0;
function check(name, ok, extra = '') {
  checks++;
  if (ok) console.log(`    ok   ${name}${extra ? ' ' + extra : ''}`);
  else { failures++; console.log(`    FAIL ${name}${extra ? ' ' + extra : ''}`); }
  return ok;
}

// --------------------------------------------------------------- the checks
const CHECKS = {
  async find(page, n) {
    const s = await snapshot(page);
    check('stage is FIND', s.stage === 'FIND', s.stage);
    check('house index', s.houseIndex === n, String(s.houseIndex));
    check('exactly the target house is lit', JSON.stringify(s.litHouses) === JSON.stringify([n]),
      JSON.stringify(s.litHouses));
    check('invited house is on screen', !!s.target && s.target.screen.onScreen);
    check('input is accepted', s.input.accepted === true, s.wait || '');
    const t = await tapInvited(page);
    check('tap resolves to the house', t.hit && t.hit.type === 'house' && t.hit.house === n,
      JSON.stringify(t.hit || t.error));
    const after = await snapshot(page);
    check('tapping the glowing house starts the walk', after.stage === 'WALK', after.stage);
    check('she is actually walking', after.girl.walking === true);
  },

  async walk(page, n) {
    const s = await snapshot(page);
    check('stage is WALK', s.stage === 'WALK', s.stage);
    check('wait reason is walking', s.wait === 'walking', String(s.wait));
    const r = await stepUntil(page, "(s) => s.stage === 'BELL'", 1200);
    check('she reaches the porch', r.ok, `${r.steps} steps`);
    const a = await snapshot(page);
    check('doorbell starts glowing', a.house.bellTarget === 1);
    check('house index unchanged', a.houseIndex === n, String(a.houseIndex));
  },

  async bell(page, n) {
    const s = await snapshot(page);
    check('stage is BELL', s.stage === 'BELL', s.stage);
    check('doorbell is lit and invited', s.target && s.target.kind === 'doorbell',
      JSON.stringify(s.target && s.target.kind));
    check('doorbell is on screen', !!s.target && s.target.screen.onScreen,
      JSON.stringify(s.target && s.target.screen));
    check('door is still closed', s.house.doorTarget === 0);
    const t = await tapInvited(page);
    check('tap resolves to the doorbell', t.hit && t.hit.type === 'doorbell' && t.hit.house === n,
      JSON.stringify(t.hit || t.error));
    const a = await snapshot(page);
    check('ringing opens the chain', a.stage === 'OPEN', a.stage);
    const r = await stepUntil(page, "(s) => s.stage === 'REVEAL'", 900);
    check('the door opens and a resident appears', r.ok, `${r.steps} steps`);
    const b = await snapshot(page);
    check('door is open', b.house.doorOpen > 0.5, String(b.house.doorOpen));
    check('resident is out', b.house.residentOut > 0.5, String(b.house.residentOut));
  },

  async open(page) {
    const s = await snapshot(page);
    check('stage is OPEN', s.stage === 'OPEN', s.stage);
    check('wait reason names the door', s.wait === 'animating:doorOpen', String(s.wait));
    check('input is not accepted mid-animation', s.input.accepted === false);
    // a stray tap during the animation must not move the chain
    await page.evaluate(() => window.__game.tapNdc(0, -0.2));
    const mid = await snapshot(page);
    check('stray tap is rejected, not applied', mid.stage === 'OPEN' &&
      mid.input.lastRejection && mid.input.lastRejection.reason === 'busy',
      JSON.stringify(mid.input.lastRejection));
    const r = await stepUntil(page, "(s) => s.stage === 'REVEAL'", 900);
    check('reaches REVEAL on its own', r.ok, `${r.steps} steps`);
  },

  async reveal(page) {
    const s = await snapshot(page);
    check('stage is REVEAL', s.stage === 'REVEAL', s.stage);
    check('the girl is what is invited', s.target && s.target.kind === 'girl');
    check('the girl is on screen', !!s.target && s.target.screen.onScreen);
    const t = await tapInvited(page);
    check('tap resolves to the girl', t.hit && t.hit.type === 'girl', JSON.stringify(t.hit || t.error));
    const a = await snapshot(page);
    check('she spins for the costume reveal', a.girl.anim === 'reveal', String(a.girl.anim));
    const r = await stepUntil(page, "(s) => s.stage === 'BUCKET'", 900);
    check('reveal hands over to the bucket', r.ok, `${r.steps} steps`);
  },

  async bucket(page) {
    const s = await snapshot(page);
    check('stage is BUCKET', s.stage === 'BUCKET', s.stage);
    check('the bucket is what is invited', s.target && s.target.kind === 'bucket');
    check('the bucket is on screen', !!s.target && s.target.screen.onScreen);
    const before = s.bucket.fill;
    const t = await tapInvited(page);
    check('tap resolves to the bucket', t.hit && t.hit.type === 'bucket', JSON.stringify(t.hit || t.error));
    const a = await snapshot(page);
    check('offering the bucket starts the sweets', a.stage === 'CANDY', a.stage);
    const r = await stepUntil(page, `(s) => s.bucket.fill > ${before}`, 900);
    check('sweets actually land in the bucket', r.ok, `${r.steps} steps`);
  },

  async candy(page, n) {
    const s = await snapshot(page);
    check('stage is CANDY', s.stage === 'CANDY', s.stage);
    const before = s.bucket.fill;
    const r1 = await stepUntil(page, `(s) => s.bucket.fill >= ${before + 5}`, 1200);
    check('the whole handful arrives', r1.ok, `${r1.steps} steps`);
    const r2 = await stepUntil(page, "(s) => s.stage === 'NEXT' || s.stage === 'ENDING'", 1200);
    check('the door closes and the chain moves on', r2.ok, `${r2.steps} steps`);
    const a = await snapshot(page);
    check('door closed behind her', a.house.doorTarget === 0);
    check('house index still the visited one', a.houseIndex === n, String(a.houseIndex));
  },

  async next(page, n) {
    const s = await snapshot(page);
    check('stage is NEXT', s.stage === 'NEXT', s.stage);
    const r = await stepUntil(page, "(s) => s.stage === 'FIND' || s.stage === 'ENDING'", 1200);
    check('hands over to the next house', r.ok, `${r.steps} steps`);
    const a = await snapshot(page);
    if (a.stage === 'FIND') {
      check('the next house is the one that is lit',
        JSON.stringify(a.litHouses) === JSON.stringify([n + 1]), JSON.stringify(a.litHouses));
      check('house index advanced by one', a.houseIndex === n + 1, String(a.houseIndex));
    } else {
      check('after the last house it is the ending', a.stage === 'ENDING');
    }
  },

  async ending(page) {
    const s = await snapshot(page);
    check('stage is ENDING', s.stage === 'ENDING', s.stage);
    const lit = await page.evaluate(() => window.__game.houses.every(h => h.litTarget > 0.5));
    check('every house is lit', lit);
    const r = await stepUntil(page, '(s) => s.restartReady === true', 3000);
    check('the ending offers another go', r.ok, `${r.steps} steps`);
    const full = await snapshot(page);
    check('the bucket is full', full.bucket.fill >= full.bucket.capacity,
      `${full.bucket.fill}/${full.bucket.capacity}`);
    check('the blinking home lantern is on screen', !!full.target && full.target.screen.onScreen);
    const t = await tapInvited(page);
    check('tap resolves to her own house', t.hit && t.hit.type === 'house' && t.hit.house === 0,
      JSON.stringify(t.hit || t.error));
    await step(page, 2);
    const a = await snapshot(page);
    check('it starts over at the first house', a.stage === 'FIND' && a.houseIndex === 1,
      `${a.stage}/${a.houseIndex}`);
    check('the bucket is empty again', a.bucket.fill === 0, String(a.bucket.fill));
  }
};

// ------------------------------------------------------------------ driver
requireBuild();
fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 4300 + (process.pid % 300);
const server = await serve(DIST, PORT);
globalThis.__BASE__ = `http://127.0.0.1:${PORT}`;

const chromium = await loadChromium();
const browser = await launch(chromium);
const started = Date.now();

try {
  for (const name of (names.length ? names : DEFAULT_SET)) {
    const [stage, idxRaw] = name.split(':');
    const idx = parseInt(idxRaw, 10) || 1;
    if (!CHECKS[stage]) { console.log(`  ?? unknown scenario ${name}`); failures++; continue; }
    console.log(`\n  -- ${name}`);
    const page = await openGame(browser, { scenario: name, seed: 1 });
    const loaded = await snapshot(page);
    check('scenario reports ready', loaded.ready === true);
    check('scenario landed on the right stage', loaded.stage === stage.toUpperCase(),
      `${loaded.stage} vs ${stage.toUpperCase()}`);
    const text = await page.evaluate(() => document.body.innerText.trim());
    check('no on-screen text', text === '', JSON.stringify(text));

    await CHECKS[stage](page, idx);

    const log = await gameLog(page, 8);
    check('the log records the input and the transition',
      log.some(e => e.type === 'input') || log.some(e => e.type === 'state'),
      log.map(e => e.type).join(','));
    check('no page errors', page.errors.length === 0, page.errors.slice(0, 2).join(' | '));
    if (wantShots) {
      await page.screenshot({ path: path.join(SHOTS, `scenario-${stage}-${idx}.png`) });
    }
    await page.close();
  }

  // ---- a reload must not carry anything over -----------------------------
  console.log('\n  -- reload isolation');
  {
    const page = await openGame(browser, { scenario: 'bell:2', seed: 1 });
    const first = await snapshot(page);
    await tapInvited(page);
    await stepUntil(page, "(s) => s.stage === 'REVEAL'", 900);
    const dirty = await snapshot(page);
    check('state moved on before the reload', dirty.stage === 'REVEAL', dirty.stage);
    const fresh = await page.evaluate(() => {
      window.__game.loadScenario('bell:2');
      return window.__game.snapshot();
    });
    check('reloaded scenario is clean', fresh.stage === 'BELL' && fresh.house.doorOpen === 0 &&
      fresh.house.residentOut === 0 && fresh.girl.anim === null,
      JSON.stringify({ s: fresh.stage, door: fresh.house.doorOpen,
        res: fresh.house.residentOut, anim: fresh.girl.anim }));
    const same = (a, b) => JSON.stringify({
      stage: a.stage, house: a.houseIndex, girl: a.girl, bucket: a.bucket,
      lit: a.litHouses, h: a.house
    }) === JSON.stringify({
      stage: b.stage, house: b.houseIndex, girl: b.girl, bucket: b.bucket,
      lit: b.litHouses, h: b.house
    });
    check('a reload reproduces the first load exactly', same(first, fresh),
      JSON.stringify({ a: first.bucket, b: fresh.bucket, ga: first.girl.x, gb: fresh.girl.x }));
    check('ready again', fresh.ready === true);
    await page.close();
  }

  // ---- same seed + same steps => same state ------------------------------
  console.log('\n  -- determinism');
  {
    const run = async () => {
      const page = await openGame(browser, { scenario: 'find:1', seed: 7 });
      await tapInvited(page);
      await step(page, 240);
      const s = await snapshot(page);
      await page.close();
      return s;
    };
    const a = await run();
    const b = await run();
    const strip = (s) => JSON.stringify({
      stage: s.stage, house: s.houseIndex, girl: s.girl, bucket: s.bucket,
      lit: s.litHouses, frame: s.frame
    });
    check('two runs with the same seed match', strip(a) === strip(b), strip(a) + ' vs ' + strip(b));
  }
} finally {
  await browser.close();
  server.close();
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\n${checks - failures}/${checks} checks passed in ${secs}s`);
process.exit(failures ? 1 : 0);
