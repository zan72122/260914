import { describe, expect, it } from 'vitest';
import {
  ATLAS_H,
  ATLAS_W,
  BOIL_FPS,
  FRAME_H,
  FRAME_W,
  BOIL_VARIANTS,
  FRAMES_PER_VARIANT,
  POSE_ORDER,
  VARIANTS,
  boilFrame,
  drawKidFrame,
  frameIndex,
} from '../src/art/kidSheet';
import type { Ctx2D } from '../src/art/crayon';

/**
 * A Canvas2D stand-in that records every point the drawing code puts down.
 * The transforms are no-ops, which is fine: the question here is only whether
 * two bakes of the same frame differ, and by how much.
 */
function recorder(): { ctx: Ctx2D; points: number[] } {
  const points: number[] = [];
  const noop = (): void => {};
  const push = (...xs: number[]): void => {
    for (const x of xs) points.push(x);
  };
  const ctx = {
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    beginPath: noop,
    closePath: noop,
    stroke: noop,
    fill: noop,
    clearRect: noop,
    fillRect: noop,
    moveTo: push,
    lineTo: push,
    arc: push,
    ellipse: push,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineJoin: '',
    lineCap: '',
    globalAlpha: 1,
  };
  return { ctx: ctx as unknown as Ctx2D, points };
}

function draw(variant: number, pose: (typeof POSE_ORDER)[number], frame: number, boil: number): number[] {
  const r = recorder();
  drawKidFrame(r.ctx, 0, 0, variant, pose, frame, boil);
  return r.points;
}

describe('line boil: the crayon line is never quite still', () => {
  it('draws the same frame identically when the bake is the same', () => {
    expect(draw(2, 'walk', 1, 1)).toEqual(draw(2, 'walk', 1, 1));
  });

  it('draws every pose differently in each of the three bakes', () => {
    for (const pose of POSE_ORDER) {
      const a = draw(0, pose, 0, 0);
      const b = draw(0, pose, 0, 1);
      const c = draw(0, pose, 0, 2);
      expect(a).toHaveLength(b.length);
      expect(a).toHaveLength(c.length);
      expect(a).not.toEqual(b);
      expect(b).not.toEqual(c);
    }
  });

  it('keeps the wobble to a pixel or two, so it reads as life and not motion', () => {
    for (const pose of POSE_ORDER) {
      for (let boil = 1; boil < BOIL_VARIANTS; boil++) {
        const a = draw(3, pose, 0, 0);
        const b = draw(3, pose, 0, boil);
        let worst = 0;
        let total = 0;
        for (let i = 0; i < a.length; i++) {
          const d = Math.abs(a[i] - b[i]);
          if (d > worst) worst = d;
          total += d;
        }
        expect(worst).toBeLessThanOrEqual(4);
        expect(total / a.length).toBeLessThan(1.5);
      }
    }
  });

  it('cycles the whole crowd through the bakes at a steady 8 per second', () => {
    expect(BOIL_FPS).toBe(8);
    expect(boilFrame(0)).toBe(0);
    expect(boilFrame(1 / 8 + 0.001)).toBe(1);
    expect(boilFrame(2 / 8 + 0.001)).toBe(2);
    // ...and wraps, for as long as anybody is playing.
    expect(boilFrame(3 / 8 + 0.001)).toBe(0);
    for (let t = 0; t < 120; t += 0.017) {
      const f = boilFrame(t);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(BOIL_VARIANTS);
    }
  });
});

describe('line boil: it costs one atlas, not three', () => {
  it('stacks the bakes into the same sheet, inside the 4096 texture limit', () => {
    expect(ATLAS_W).toBeLessThanOrEqual(4096);
    expect(ATLAS_H).toBeLessThanOrEqual(4096);
    // Three stacked blocks of the six shirt colours, and nothing else.
    expect(ATLAS_H).toBe(FRAME_H * VARIANTS * BOIL_VARIANTS);
    expect(ATLAS_W).toBe(FRAME_W * FRAMES_PER_VARIANT);
  });

  it('gives every (variant, pose, frame, bake) its own cell, and no two the same', () => {
    const seen = new Set<number>();
    for (let b = 0; b < BOIL_VARIANTS; b++) {
      for (let v = 0; v < VARIANTS; v++) {
        for (const pose of POSE_ORDER) {
          const i = frameIndex(v, pose, 0, b);
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(VARIANTS * BOIL_VARIANTS * FRAMES_PER_VARIANT);
          expect(seen.has(i)).toBe(false);
          seen.add(i);
        }
      }
    }
  });

  it('wraps an out-of-range bake instead of falling off the end of the atlas', () => {
    expect(frameIndex(0, 'idle', 0, BOIL_VARIANTS)).toBe(frameIndex(0, 'idle', 0, 0));
    expect(frameIndex(0, 'idle', 0, -1)).toBe(frameIndex(0, 'idle', 0, BOIL_VARIANTS - 1));
  });
});
