// tests/naive.spec.js -- the one gesture, and the child who only knows it.
//
// The phase-3 playtest (docs/PLAYTEST.md) failed at the first hurdle: an adult
// pretending to be a four year old touched the brightest towel, dragged it at
// the basket, and nothing happened -- because each item wanted a different
// gesture and none of them wanted *that* one. Spec §10.1 is the most important
// line in the whole document and it was failing.
//
// So this file is the first-hurdle test, written as the child would play it.
// Touch the cloth. Pull it toward the room. Keep pulling. That has to work, on
// every item, in both orientations, with nothing else known and nothing else
// tried -- and then, only doing that, the whole game has to reach AFTER.

import { test, expect } from '@playwright/test';
import {
  IPHONE_PORTRAIT, IPAD_LANDSCAPE, collectErrors, openGame, snapshot, waitFor,
  naiveStroke, drag, setTimeScale, settledSnapshot,
} from './helpers.js';

const CASES = [
  ['iPhone portrait', IPHONE_PORTRAIT],
  ['iPad landscape', IPAD_LANDSCAPE],
];
const IDS = ['towel', 'shirt', 'pinch', 'pants', 'sheet'];

async function rain(page, vp, timeScale = 3) {
  await openGame(page, vp, { timeScale });
  await waitFor(page, (s) => s.state === 'WIND' || s.state === 'RAIN_RAMP', 20000, 'the rain');
  return snapshot(page);
}

// ---- 1. the gesture, on all five, in both orientations -------------------

for (const [name, vp] of CASES) {
  for (let i = 0; i < IDS.length; i++) {
    test(`${name}: one naive pull brings the ${IDS[i]} in`, async ({ page }) => {
      const errors = collectErrors(page);
      const s = await rain(page, vp);
      expect(s.items[i].id).toBe(IDS[i]);
      await naiveStroke(page, s, s.items[i]);

      // Free of the line inside the one stroke -- not "a bit further along".
      const off = await snapshot(page);
      expect(off.items[i].clips, `${IDS[i]} still pegged`).toBe(0);
      expect(off.items[i].state).not.toBe('HANGING');

      // ...and nothing else on the line was disturbed by it.
      for (let j = 0; j < IDS.length; j++) {
        if (j !== i) expect(off.items[j].state, IDS[j]).toBe('HANGING');
      }

      const done = await waitFor(page, (st) => st.items[i].state === 'IN_BASKET',
        25000, `${IDS[i]} in the basket`);
      expect(done.basket).toBe(1);
      expect(errors, errors.join('\n')).toEqual([]);
    });
  }
}

// ---- 2. the whole game, knowing only that ---------------------------------

test('a child who only knows "pull it toward the room" finishes the game', async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page, IPHONE_PORTRAIT, { timeScale: 3 });

  // She waits for the world to say something. It says it with a drop, a spot
  // on the washing, a grey sky and an arm pointing at the wettest thing.
  await waitFor(page, (s) => s.state === 'SPOT', 15000, 'SPOT');
  expect(await page.evaluate(() => window.__game.pointing || window.__game.state === 'SPOT')).toBe(true);

  // Then five strokes. No taps on pegs, no lifts, no waiting for a beat.
  for (let n = 0; n < 5; n++) {
    const s = await waitFor(page, (st) => st.items.some((i) => i.state === 'HANGING'),
      20000, 'something still on the line');
    const idx = s.items.findIndex((i) => i.state === 'HANGING');
    await naiveStroke(page, s, s.items[idx]);
    await waitFor(page, (st) => st.items[idx].state !== 'HANGING', 15000,
      `${s.items[idx].id} off the line`);
  }

  const empty = await waitFor(page, (s) => s.state === 'EMPTY_LINE', 45000, 'EMPTY_LINE');
  expect(empty.basket).toBe(5);

  // And the last thing in the room that moves: the handle, dragged outward.
  const h = empty.handle;
  await drag(page, h.x, h.y, 4, h.y, 22);
  const done = await waitFor(page, (s) => s.state === 'AFTER', 20000, 'AFTER');
  expect(done.sash).toBe(1);
  expect((await page.evaluate(() => (document.body.innerText || '').trim()))).toBe('');
  expect(errors, errors.join('\n')).toEqual([]);
});

// ---- 3. the answer to the touch itself ------------------------------------

for (const [name, vp] of CASES) {
  test(`${name}: a finger landing on cloth is answered inside 100ms`, async ({ page }) => {
    const errors = collectErrors(page);
    await openGame(page, vp, { timeScale: 1 });
    await waitFor(page, (s) => s.state === 'WIND' || s.state === 'RAIN_RAMP', 30000, 'the rain');
    for (let i = 0; i < IDS.length; i++) {
      const s = await snapshot(page);
      const it = s.items[i];
      await page.mouse.move(it.x, it.y);
      await page.mouse.down();
      await page.waitForTimeout(90);
      const now = (await snapshot(page)).items[i];
      // It has come off its rest shape, toward the room...
      const moved = (now.x - it.x) * s.inDir.x + (now.y - it.y) * s.inDir.y;
      expect(moved, `${IDS[i]} did not move toward the hand`).toBeGreaterThan(2.5);
      // ...and it is visibly lit while the finger is on it.
      expect(now.grabbed, IDS[i]).toBe(true);
      expect(now.lit, IDS[i]).toBeGreaterThan(0.5);
      await page.mouse.up();
      await page.waitForTimeout(800);
      const back = (await snapshot(page)).items[i];
      expect(back.lit, `${IDS[i]} stayed lit after release`).toBeLessThan(0.5);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

// ---- 4. nothing is ever left broken ---------------------------------------

for (const [name, vp] of CASES) {
  test(`${name}: twenty random drags leave every item its own shape`, async ({ page }) => {
    const errors = collectErrors(page);
    await rain(page, vp);
    // The rest size of each item, measured before anything is touched -- and
    // between gusts, because a gust is supposed to change it.
    const start = await settledSnapshot(page);
    const rest = start.items.map((i) => ({
      w: i.bounds.x1 - i.bounds.x0, h: i.bounds.y1 - i.bounds.y0,
    }));

    // Twenty strokes a child would actually make: short, in every direction,
    // too short to release anything, on whatever happens to be under the hand.
    const dirs = [[0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [-1, -1]];
    for (let n = 0; n < 20; n++) {
      const s = await snapshot(page);
      const it = s.items[n % 5];
      if (it.state !== 'HANGING') continue;
      const d = dirs[n % dirs.length];
      const len = 24 + (n % 3) * 9;
      await drag(page, it.x, it.y, it.x + d[0] * len, it.y + d[1] * len, 6);
      await page.waitForTimeout(60);
    }

    // 0.6s is what the cloth is given to forget it was ever pulled on.
    await setTimeScale(page, 1);
    await page.waitForTimeout(900);
    const after = await settledSnapshot(page);
    for (let i = 0; i < IDS.length; i++) {
      const it = after.items[i];
      expect(it.state, IDS[i]).toBe('HANGING');
      const w = it.bounds.x1 - it.bounds.x0;
      const h = it.bounds.y1 - it.bounds.y0;
      // Still a cloth of roughly its own size: not a rod, not a spike, not a
      // sheet stretched across half the balcony. The window is generous
      // because the wind is still blowing it about.
      expect(w, `${IDS[i]} width ${w} vs rest ${rest[i].w}`).toBeGreaterThan(rest[i].w * 0.45);
      expect(w, `${IDS[i]} width ${w} vs rest ${rest[i].w}`).toBeLessThan(rest[i].w * 1.75);
      expect(h, `${IDS[i]} height ${h} vs rest ${rest[i].h}`).toBeGreaterThan(rest[i].h * 0.45);
      expect(h, `${IDS[i]} height ${h} vs rest ${rest[i].h}`).toBeLessThan(rest[i].h * 1.75);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

// ---- 5. everything else on the screen answers too -------------------------

test('poking the child, the basket, the pole and the puddle all do something', async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page, IPHONE_PORTRAIT, { timeScale: 4 });
  await waitFor(page, (s) => s.rain > 0.35, 30000, 'a wet balcony');
  await setTimeScale(page, 1);

  const probe = () => page.evaluate(() => {
    const g = window.__gameInstance;
    return {
      giggle: g.character.giggleT,
      wob: g.basket.wob,
      rings: g.weather.rings.length,
      wobble: g.items.map((i) => Math.round(i.grabWob * 100) / 100),
      pos: {
        char: (() => { const o = { x: 0, y: 0 }; g.character.foot(o); return o; })(),
        basket: { x: g.world.basket.cx, y: g.world.basket.cy },
        // Just above the bar, where the cloth is not.
        pole: { x: g.world.pole.x0 + g.world.pole.width * 0.5, y: g.world.pole.y - 8 },
        // The puddle, well below every hem.
        floor: {
          x: g.world.opening.x + g.world.opening.w * 0.42,
          y: g.world.floorY + (g.world.opening.bottom - g.world.floorY) * 0.55,
        },
      },
    };
  });

  const p0 = await probe();

  // the child
  await page.mouse.click(p0.pos.char.x, p0.pos.char.y - 30);
  expect((await probe()).giggle, 'poking the child did nothing').toBeGreaterThan(0);
  await page.waitForTimeout(700);

  // the basket
  await page.mouse.click(p0.pos.basket.x, p0.pos.basket.y);
  expect((await probe()).wob, 'poking the basket did nothing').toBeGreaterThan(0);
  await page.waitForTimeout(700);

  // the pole: every peg hanging off it swings, and no cloth is picked up
  await page.mouse.click(p0.pos.pole.x, p0.pos.pole.y);
  const rung = await probe();
  expect(Math.max(...rung.wobble), 'ringing the pole did not move the pegs').toBeGreaterThan(0);
  await page.waitForTimeout(700);

  // the wet floor
  await page.mouse.click(p0.pos.floor.x, p0.pos.floor.y);
  expect((await probe()).rings, 'the puddle did not ring').toBeGreaterThan(0);

  // Nothing here has taken anything off the line or moved the game on.
  const s = await snapshot(page);
  expect(s.items.every((i) => i.state === 'HANGING')).toBe(true);
  expect(s.basket).toBe(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

// ---- 6. the pad really is the whole cloth ---------------------------------

for (const [name, vp] of CASES) {
  test(`${name}: every part of every item is grabbable`, async ({ page }) => {
    await rain(page, vp);
    const hits = await page.evaluate(() => {
      const g = window.__gameInstance;
      const out = [];
      for (const it of g.items) {
        const b = it.hitBox();
        let ok = 0, n = 0;
        for (let u = 0; u <= 1.0001; u += 0.25) {
          for (let v = 0; v <= 1.0001; v += 0.25) {
            const x = b.x0 + (b.x1 - b.x0) * u;
            const y = b.y0 + (b.y1 - b.y0) * v;
            n++;
            if (it.hitTest(x, y)) ok++;
          }
        }
        out.push({ id: it.id, ok, n, pad: it.hitPad });
      }
      return out;
    });
    for (const h of hits) {
      expect(h.ok, `${h.id} hit coverage`).toBe(h.n);
      expect(h.pad, `${h.id} pad`).toBeGreaterThanOrEqual(64);
    }
  });
}

// ---- 7. a rotation, and a pull the wrong way, leave a cloth --------------
//
// Both of these were the same picture in the second playtest: a piece of
// washing drawn as a thin diagonal streak across the screen, which a four year
// old reads as something she has broken. A rotation now lets go of the cloth
// before the world is rebuilt under it, and every release settles the mesh, so
// what is left in both cases is a cloth the size of a cloth.
//
// Two different questions, measured two different ways. `strain` is the worst
// stretched edge of the mesh: it says whether this is still a shape a cloth
// can have, and it has to be back to about 1 within half a second. The
// bounding box says where the cloth *is*, and it is allowed to take longer,
// because a cloth that has been hauled sideways and let go swings home -- that
// is the spring-back the spec asks for, not damage.

/** Hold the weather still, so this measures the cloth and not the wind. */
async function holdTheWind(page) {
  await page.evaluate(() => {
    const w = window.__gameInstance.weather;
    w.windEnabled = false;
    w.gust = 0;
    w.gustPulse = 0;
    w.gustBoost = 1;
    w.setStill(true);
  });
  await page.waitForTimeout(1500);   // and let what it was doing die away
}

/**
 * No item is stretched further than it was before any of this happened.
 *
 * The baseline is not 1: heavy cloth hanging on two pegs pulls its own cells
 * a third longer than their rest length, and that is what a pair of jeans on
 * a line looks like. What must not survive half a second is the *extra*
 * stretch a finger (or a relayout) put into it.
 */
function expectUndeformed(s, calm) {
  for (let i = 0; i < IDS.length; i++) {
    const it = s.items[i];
    if (it.state !== 'HANGING') continue;
    expect(it.strain, `${IDS[i]} is stretched out of shape`)
      .toBeLessThan(Math.max(1.15, calm.items[i].strain + 0.12));
  }
}

function expectRestShaped(s) {
  for (let i = 0; i < IDS.length; i++) {
    const it = s.items[i];
    if (it.state !== 'HANGING') continue;
    const w = it.bounds.x1 - it.bounds.x0;
    const h = it.bounds.y1 - it.bounds.y0;
    expect(w / it.anchor.w, `${IDS[i]} width vs rest`).toBeGreaterThan(0.8);
    expect(w / it.anchor.w, `${IDS[i]} width vs rest`).toBeLessThan(1.3);
    expect(h / it.anchor.h, `${IDS[i]} height vs rest`).toBeGreaterThan(0.8);
    expect(h / it.anchor.h, `${IDS[i]} height vs rest`).toBeLessThan(1.3);
  }
}

/** Poll until everything is back to its rest shape, or give up loudly. */
async function waitRestShaped(page, ms = 3000) {
  const start = Date.now();
  let last = null;
  for (;;) {
    last = await snapshot(page);
    const ok = last.items.every((it, i) => {
      if (it.state !== 'HANGING') return true;
      const w = (it.bounds.x1 - it.bounds.x0) / it.anchor.w;
      const h = (it.bounds.y1 - it.bounds.y0) / it.anchor.h;
      return w > 0.8 && w < 1.3 && h > 0.8 && h < 1.3 && IDS[i];
    });
    if (ok || Date.now() - start > ms) break;
    await page.waitForTimeout(100);
  }
  return last;
}

test('rotating mid-drag leaves a cloth, not a diagonal streak', async ({ page }) => {
  const errors = collectErrors(page);
  await rain(page, IPHONE_PORTRAIT);
  await holdTheWind(page);
  const s = await snapshot(page);
  const it = s.items[0];

  // A finger hauling it off its pins, and then the screen turns.
  await page.mouse.move(it.x, it.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(it.x - i * 10, it.y + i * 10);
    await page.waitForTimeout(16);
  }
  await page.setViewportSize(IPAD_LANDSCAPE);
  await page.evaluate(() => {
    const w = window.__gameInstance.weather;
    w.windEnabled = false; w.gust = 0; w.gustPulse = 0; w.setStill(true);
  });
  await page.waitForTimeout(600);

  // Six tenths of a second later, with the finger still down, the drag has
  // been let go of and every item is its own shape in the new layout.
  const after = await snapshot(page);
  expectUndeformed(after, s);
  expectRestShaped(after);
  expect(after.items[0].grabbed, 'the rotation kept hold of the cloth').toBe(false);

  await page.mouse.up();
  await page.waitForTimeout(300);
  expectUndeformed(await snapshot(page), s);
  expect(errors, errors.join('\n')).toEqual([]);
});

for (const [name, vp] of CASES) {
  test(`${name}: a pull the wrong way leaves a cloth`, async ({ page }) => {
    const errors = collectErrors(page);
    await rain(page, vp);
    await holdTheWind(page);
    const s = await snapshot(page);
    const it = s.items[1];
    // Straight against the room direction, and sideways with it.
    const d = 140;
    await page.mouse.move(it.x, it.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      await page.mouse.move(it.x - s.inDir.x * d * t - 30 * t, it.y - s.inDir.y * d * t - 30 * t);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Half a second: the mesh is a cloth again, whatever it was doing.
    const half = await snapshot(page);
    expect(half.items[1].state, 'the wrong way took it off the line').toBe('HANGING');
    expect(half.items[1].clips).toBe(s.items[1].clips);
    expectUndeformed(half, s);

    // ...and it swings back to where it hangs.
    expectRestShaped(await waitRestShaped(page));
    expect(errors, errors.join('\n')).toEqual([]);
  });
}
