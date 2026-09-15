/**
 * The gestures a 4-year-old actually makes, and what one round of playing
 * looks like in each of the ten scenes.
 *
 * Nothing in here touches a debug hook: it is all taps and drags through the
 * browser's own pointer events, which is the only way the game is meant to be
 * driven. Both the per-scene screenshot suite and the hands-only playthrough
 * of the whole loop use these, so "the screenshots were taken by playing it"
 * and "the loop can be played" are the same claim.
 */
import type { Page } from '@playwright/test';
import type { Geom } from './helpers';
import { drag } from './helpers';
import { BUSH_SPOTS } from '../../src/scenes/hideLogic';
import { slideTop } from '../../src/art/geometry';

/** Taps in a ring of `n` points of screen radius `r` around the centre. */
export async function tapRing(page: Page, g: Geom, r: number, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.4;
    await page.mouse.click(g.cx + Math.cos(a) * r, g.cy + Math.sin(a) * r);
    await page.waitForTimeout(40);
  }
}

/** A grid of taps over the whole picture: the "poke everything" gesture. */
export async function tapGrid(page: Page, g: Geom, cols: number, rows: number): Promise<void> {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      await page.mouse.click(((c + 0.5) / cols) * g.width, ((r + 0.5) / rows) * g.height);
      await page.waitForTimeout(30);
    }
  }
}

/** Sweeps a finger up the screen `n` times, spread across the width. */
export async function sweepUp(page: Page, g: Geom, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n) * g.width;
    await drag(page, x, g.height * 0.82, x, g.height * 0.15, 12);
  }
}

/** Sweeps a finger left to right across `n` horizontal bands. */
export async function sweepAcross(page: Page, g: Geom, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const y = ((i + 0.5) / n) * g.height;
    await drag(page, g.width * 0.06, y, g.width * 0.94, y, 16);
  }
}

/** Drags from the four corners into the middle. */
export async function sweepInwards(page: Page, g: Geom): Promise<void> {
  for (const [x, y] of [
    [g.width * 0.1, g.height * 0.12],
    [g.width * 0.9, g.height * 0.12],
    [g.width * 0.1, g.height * 0.88],
    [g.width * 0.9, g.height * 0.88],
  ]) {
    await drag(page, x, y, g.cx, g.cy, 14);
  }
}

export type Round = (page: Page, g: Geom) => Promise<void>;

/** One round of playing, per scene. Repeat it until the scene gives way. */
export const PLAY_ROUND: Record<string, Round> = {
  // Sweep the scattered kids towards the one who is waving, then tap around him.
  gather: async (page, g) => {
    await sweepInwards(page, g);
    await tapRing(page, g, Math.min(g.width, g.height) * 0.28, 8);
  },
  // Stroking along the path is the whole interaction: the line flows with it.
  march: async (page, g) => {
    await sweepAcross(page, g, 3);
  },
  // Tickle whoever is under the finger; the laugh spreads by itself from there.
  tickle: async (page, g) => {
    await tapGrid(page, g, 3, 4);
  },
  // Tap the kids on the rim, and drag one in from the edge.
  ballpit: async (page, g) => {
    await tapRing(page, g, Math.min(g.width, g.height) * 0.22, 8);
    await drag(page, g.width * 0.08, g.cy, g.cx, g.cy, 14);
  },
  // The butterfly comes to the finger; leading it off the edge is the game.
  // The finger holds still at the edge for a moment at the end of the sweep,
  // because the butterfly follows with a lag and a child waits for it.
  butterfly: async (page, g) => {
    const toX = g.width * 0.95;
    const toY = g.cy - g.height * 0.08;
    await page.mouse.move(g.cx, g.cy);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(g.cx + ((toX - g.cx) * i) / 20, g.cy + ((toY - g.cy) * i) / 20);
      await page.waitForTimeout(18);
    }
    // Held at the edge, wobbling slightly, the way a finger really rests.
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(toX, toY + (i % 2 === 0 ? 1 : -1));
      await page.waitForTimeout(40);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);
  },
  // A tap puts a kid on the ladder; climbing and sliding takes a couple of
  // seconds, so the taps are spaced out to let the queue move.
  slide: async (page, g) => {
    await tapGrid(page, g, 3, 3);
    // ...and a tap on the kid sitting at the top, who is what the scene is
    // pointing at in the first place.
    const top = slideTop({ x: 0, y: 0 });
    await page.mouse.click(g.cx + top.x * g.scale, g.cy + top.y * g.scale);
    await page.waitForTimeout(2200);
  },
  // Tap the bushes themselves, exactly where the scene drew them.
  hide: async (page, g) => {
    for (const [wx, wy] of BUSH_SPOTS) {
      await page.mouse.click(g.cx + wx * g.scale, g.cy + wy * g.scale);
      await page.waitForTimeout(90);
    }
  },
  // Sweep upwards: up on the glass is up in the world.
  balloon: async (page, g) => {
    await sweepUp(page, g, 4);
    await tapGrid(page, g, 3, 3);
  },
  // Tap a kid on the ground and they climb the tower; one at a time.
  tower: async (page, g) => {
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(g.cx - g.width * 0.28, g.cy + g.height * 0.1);
      await page.waitForTimeout(800);
    }
  },
  // Tap the sky for stars, and the kids under the finger yawn and curl up.
  sleep: async (page, g) => {
    await tapGrid(page, g, 3, 3);
  },
};

/**
 * Overrides used only when a screenshot has to catch a scene in the MIDDLE of
 * being played. `PLAY_ROUND` is written to finish a scene, which is right for
 * the playthrough but wrong for a photograph: the butterfly round led the
 * butterfly all the way off the edge, so by the time the shutter went the
 * director had already panned and the "butterfly" photo was of the slide.
 *
 * This round leads the butterfly two thirds of the way across and stops short
 * of the edge, so the picture is of the chase itself.
 */
export const PHOTO_ROUND: Record<string, Round> = {
  butterfly: async (page, g) => {
    const toX = g.width * 0.68;
    const toY = g.cy - g.height * 0.1;
    await page.mouse.move(g.cx * 0.6, g.cy + g.height * 0.08);
    await page.mouse.down();
    for (let i = 1; i <= 16; i++) {
      const t = i / 16;
      await page.mouse.move(g.cx * 0.6 + (toX - g.cx * 0.6) * t, g.cy + g.height * 0.08 + (toY - g.cy - g.height * 0.08) * t);
      await page.waitForTimeout(18);
    }
    await page.mouse.up();
    await page.waitForTimeout(250);
  },
};
