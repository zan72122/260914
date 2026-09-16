// items/index.js -- the registry. Order is the spec order; the position along
// the washing line is set by `slot` and is free to differ.
//
// Slot budget (phase 2): the sheet is the signature object and has to *look*
// like the biggest thing out there, so it takes the inner 40% of the pole
// (0.59 .. 0.99) and the other four share the outer 55%. They are narrower
// than before but every one of them still carries a hit pad of >= 64 css px
// on each side, which is what actually decides whether a four year old can
// grab it.

import { Towel } from './towel.js';
import { Shirt } from './shirt.js';
import { Pinch } from './pinch.js';
import { Pants } from './pants.js';
import { Sheet } from './sheet.js';

export const SPECS = [
  {
    id: 'towel', cls: Towel, slot: 0.075,
    cols: 6, rows: 7, wFrac: 0.14, hFrac: 0.30,
    rgb: [255, 206, 92], clipRGB: [238, 96, 90],
    clipCount: 2, pullPx: 42, gravityK: 1, damping: 0.984,
    windScale: 1.05, clothSize: 0.8, clipPitch: 1.15, clipLen: 0.05,
  },
  {
    id: 'shirt', cls: Shirt, slot: 0.225,
    cols: 6, rows: 7, wFrac: 0.15, hFrac: 0.30,
    rgb: [124, 202, 231], clipRGB: [201, 211, 220],
    clipCount: 2, pullPx: 46, gravityK: 0.9, damping: 0.986,
    windScale: 1.2, clothSize: 0.9, clipPitch: 1.0, clipLen: 0.055,
  },
  {
    id: 'pinch', cls: Pinch, slot: 0.375,
    cols: 7, rows: 5, wFrac: 0.15, hFrac: 0.20,
    rgb: [255, 150, 196], clipRGB: [120, 200, 160],
    clipCount: 3, pullPx: 34, gravityK: 0.8, damping: 0.982,
    windScale: 1.3, clothSize: 0.55, clipPitch: 1.3, clipLen: 0.035,
  },
  {
    id: 'pants', cls: Pants, slot: 0.51,
    cols: 6, rows: 9, wFrac: 0.12, hFrac: 0.42,
    rgb: [92, 124, 196], clipRGB: [70, 90, 130],
    clipCount: 2, pullPx: 64, gravityK: 1.5, damping: 0.99,
    windScale: 0.6, clothSize: 1.1, clipPitch: 0.7, clipLen: 0.075,
    heavy: true,
  },
  {
    // The set piece. 40% of the pole, four pegs at cols 0/3/6/9, a light
    // mesh that takes a lot of wind, and a short pull threshold because each
    // peg is released on its own rather than by hauling the whole thing in.
    id: 'sheet', cls: Sheet, slot: 0.79,
    cols: 10, rows: 7, wFrac: 0.40, hFrac: 0.46,
    rgb: [252, 244, 228], clipRGB: [244, 160, 92],
    clipCount: 4, pullPx: 34, gravityK: 0.80, damping: 0.988,
    windScale: 1.7, clothSize: 1.6, clipPitch: 0.7, clipLen: 0.10,
  },
];

export const ORDER = SPECS.map((s) => s.id);

export function createItems(world, hooks) {
  return SPECS.map((spec) => new spec.cls(world, Object.assign({}, spec), hooks));
}
