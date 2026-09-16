// tests/beats.spec.js -- the six beats of the opening, in real time.
//
// Spec 11 puts them in order of how much they matter: the first raindrop, the
// peg letting go, the cloth coming free, the sheet, the empty balcony, the
// last sash. The first, the third and the fifth are the ones with no gesture
// in them at all -- they are beats the game plays *at* the child, and if they
// do not land there is nothing to explain them. So they get measured here,
// at timeScale 1, with no speed-ups: how long the calm lasts, that exactly
// one drop arrives and that nothing else moves while it runs, that the gust
// after it is unmistakable, and that the handle is visibly alive in a single
// still frame at the end.

import { test, expect } from '@playwright/test';
import {
  IPHONE_PORTRAIT, IPAD_LANDSCAPE, collectErrors, openGame, snapshot,
  waitFor, playAllItems, setTimeScale,
} from './helpers.js';

test('the first drop: three calm seconds, then one drop, and nothing else', async ({ page }) => {
  const errors = collectErrors(page);
  const t0 = Date.now();
  await openGame(page, IPHONE_PORTRAIT);        // real time throughout

  // --- CALM: about three seconds of nothing but a gentle sway -----------
  await waitFor(page, (s) => s.state === 'FIRST_DROP', 9000, 'FIRST_DROP');
  const calm = (Date.now() - t0) / 1000;
  expect(calm).toBeGreaterThan(2.4);
  expect(calm).toBeLessThan(4.5);

  const dropped = await snapshot(page);
  const w = await page.evaluate(() => ({
    gust: window.__game.gust, drop: window.__game.glassDrop,
  }));
  // One drop on the glass...
  expect(w.drop).toBeGreaterThanOrEqual(0);
  // ...and that is the only thing that has happened. No rain, no wind, and
  // not a mark on any of the washing.
  expect(dropped.rain).toBe(0);
  expect(w.gust).toBe(0);
  expect(dropped.items.every((i) => i.spots === 0)).toBe(true);

  // --- a second later it is still the only thing on the screen ----------
  await page.waitForTimeout(1000);
  const later = await snapshot(page);
  const w2 = await page.evaluate(() => ({
    gust: window.__game.gust, drop: window.__game.glassDrop,
  }));
  expect(later.state).toBe('FIRST_DROP');
  expect(later.rain).toBe(0);
  expect(w2.gust).toBe(0);
  expect(later.items.every((i) => i.spots === 0)).toBe(true);
  // The drop is running down the glass, slowly.
  expect(w2.drop).toBeGreaterThan(w.drop);
  expect(w2.drop - w.drop).toBeLessThan(0.35);

  // --- then the spot, on exactly one piece of washing -------------------
  await waitFor(page, (s) => s.state === 'SPOT', 6000, 'SPOT');
  await page.waitForTimeout(300);
  const spotted = await snapshot(page);
  expect(spotted.items.filter((i) => i.spots > 0).length).toBe(1);

  // --- then the wind, and only then does the rain ramp ------------------
  const windy = await waitFor(page, (s) => s.state === 'WIND', 6000, 'WIND');
  expect(windy.rain).toBeLessThan(0.2);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('portrait: the first gust is a big one, and the cloth answers it', async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page, IPHONE_PORTRAIT);
  const still = await waitFor(page, (s) => s.state === 'FIRST_DROP', 9000, 'FIRST_DROP');
  const calmBox = still.items[0].bounds;

  // Wait for the hero gust: the first one after the drop, and the biggest.
  await page.waitForFunction(() => window.__game.gust > 0.95 && window.__game.gustBoost > 1.5,
    null, { timeout: 12000 });
  await page.waitForTimeout(320);
  const gusty = await snapshot(page);
  const towel = gusty.items[0];

  // 1. It swings sideways -- in portrait, "toward the room" points at the
  //    camera and would be invisible on its own.
  const swing = Math.max(Math.abs(towel.bounds.x0 - calmBox.x0),
    Math.abs(towel.bounds.x1 - calmBox.x1));
  expect(swing).toBeGreaterThan(14);

  // 2. It billows toward the camera: the cloth grows and lights up.
  expect(towel.billow).toBeGreaterThan(0.5);
  const calmW = calmBox.x1 - calmBox.x0;
  expect(towel.bounds.x1 - towel.bounds.x0).toBeGreaterThan(calmW * 1.1);

  // 3. The hem comes up rather than hanging dead straight down.
  expect(towel.bounds.y1).toBeLessThan(calmBox.y1 + 2);

  // ...and then it all subsides again.
  await page.waitForFunction(() => window.__game.gust < 0.2, null, { timeout: 12000 });
  await page.waitForTimeout(900);
  const settled = await snapshot(page);
  expect(settled.items[0].billow).toBeLessThan(towel.billow);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('landscape: a gust swings the washing clearly toward the room', async ({ page }) => {
  await openGame(page, IPAD_LANDSCAPE);
  const still = await waitFor(page, (s) => s.state === 'FIRST_DROP', 9000, 'FIRST_DROP');
  const before = still.items[0].bounds.x1;
  await page.waitForFunction(() => window.__game.gust > 0.95, null, { timeout: 12000 });
  await page.waitForTimeout(320);
  const after = (await snapshot(page)).items[0].bounds.x1;
  // inDir is (1, 0): rightward, toward the open window, and a long way.
  expect(after - before).toBeGreaterThan(20);
});

test('she keeps pointing at the washing until something is touched', async ({ page }) => {
  await openGame(page, IPHONE_PORTRAIT, { timeScale: 2 });
  await waitFor(page, (s) => s.state === 'SPOT' || s.state === 'WIND', 12000, 'the cue');

  // The cue repeats: it is on, off, and on again, without any input at all.
  let seenOn = 0, seenOff = 0;
  for (let i = 0; i < 90; i++) {
    const p = await page.evaluate(() => window.__game.pointing);
    if (p) seenOn++; else seenOff++;
    await page.waitForTimeout(100);
  }
  expect(seenOn, 'she points').toBeGreaterThan(5);
  expect(seenOff, 'and stops between times').toBeGreaterThan(5);

  // One touch and the cue is over for good.
  const s = await snapshot(page);
  const it = s.items.find((i) => i.state === 'HANGING');
  await page.mouse.move(it.x, it.y);
  await page.mouse.down();
  await page.mouse.move(it.x, it.y + 30);
  await page.mouse.up();
  await page.waitForTimeout(1200);
  for (let i = 0; i < 40; i++) {
    expect(await page.evaluate(() => window.__game.pointing)).toBe(false);
    await page.waitForTimeout(100);
  }
});

for (const [label, vp] of [['portrait', IPHONE_PORTRAIT], ['landscape', IPAD_LANDSCAPE]]) {
  test(`${label}: the pointing is unmistakable in a single still frame`, async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page, vp, { timeScale: 1 });
    await waitFor(page, (s) => s.state === 'SPOT' || s.state === 'WIND', 15000, 'the cue');

    // Freeze the moment the arm is out.
    await page.waitForFunction(() => window.__game.pointing, null, { timeout: 12000 });
    await page.waitForTimeout(120);

    // She is pointing at something that is still on the line, and the pegs
    // holding *that* thing are lit up with her.
    const cue = await page.evaluate(() => {
      const g = window.__gameInstance;
      const it = g.cueItem;
      const f = { x: 0, y: 0 };
      g.character.foot(f);
      return {
        id: it && it.id,
        state: it && it.state,
        glint: it ? it.cueGlint : 0,
        point: g.character.point ? { x: g.character.point.x, y: g.character.point.y } : null,
        foot: f,
        h: g.character.h,
      };
    });
    expect(cue.state, 'she points at something still hanging').toBe('HANGING');
    expect(cue.glint, 'the pegs on it are not lit').toBeGreaterThan(0.3);
    expect(cue.point).toBeTruthy();

    // The arm points *out of the room and up at the washing*, not at her feet.
    const dx = cue.point.x - cue.foot.x;
    const dy = cue.point.y - (cue.foot.y - cue.h * 0.6);
    expect(Math.hypot(dx, dy), 'she points at something right next to her')
      .toBeGreaterThan(cue.h * 0.5);
    expect(dy, 'she points downward').toBeLessThan(0);

    // And in the picture: one still with the arm out, one with it down. If the
    // gesture were too small to see, these would be nearly identical.
    const clip = {
      x: Math.max(0, Math.round(cue.foot.x - cue.h * 1.1)),
      y: Math.max(0, Math.round(cue.foot.y - cue.h * 1.5)),
      width: Math.round(cue.h * 2.2),
      height: Math.round(cue.h * 1.7),
    };
    const pointing = await page.screenshot({ clip });
    await page.screenshot({ path: `tests/screenshots/${label}-pointing.png` });
    await page.evaluate(() => {
      window.__gameInstance.character.stopPointing();
      window.__gameInstance.touched = true;   // and keep it down
    });
    await page.waitForTimeout(200);
    const armDown = await page.screenshot({ clip });

    let diff = 0;
    const n = Math.min(pointing.length, armDown.length);
    for (let i = 0; i < n; i++) if (pointing[i] !== armDown[i]) diff++;
    expect(diff / n, 'the pointing arm barely shows').toBeGreaterThan(0.05);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('the empty line: the handle is alive in a single still frame', async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page, IPHONE_PORTRAIT, { timeScale: 4 });
  await waitFor(page, (s) => s.state === 'WIND' || s.state === 'RAIN_RAMP', 20000, 'wind');
  await setTimeScale(page, 3);
  await playAllItems(page);
  const empty = await waitFor(page, (s) => s.state === 'EMPTY_LINE', 45000, 'EMPTY_LINE');

  // The line really is empty and the basket really is full.
  expect(empty.basket).toBe(5);
  expect(empty.items.every((i) => i.state === 'IN_BASKET')).toBe(true);

  await setTimeScale(page, 1);
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.__game.timeScale = 1; });
  expect(await page.evaluate(() => window.__game.glint)).toBeGreaterThan(0.8);

  // Two stills, a third of a second apart, of nothing but the handle. If the
  // glint and the wobble were too subtle to see, these would be identical.
  const h = empty.handle;
  const clip = { x: Math.round(h.x - 34), y: Math.round(h.y - 46), width: 68, height: 92 };
  const a = await page.screenshot({ clip });
  await page.waitForTimeout(340);
  const b = await page.screenshot({ clip });
  expect(a.equals(b), 'the handle does not move or glint').toBe(false);

  let diff = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) diff++;
  expect(diff / n, 'the handle barely changes between frames').toBeGreaterThan(0.02);
  expect(errors, errors.join('\n')).toEqual([]);
});
