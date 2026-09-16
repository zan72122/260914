// items/index.js -- the registry. Order is the spec order; the position along
// the washing line is set by `slot` and is free to differ.

import { Towel } from './towel.js';
import { Shirt } from './shirt.js';
import { Pinch } from './pinch.js';
import { Pants } from './pants.js';
import { Sheet } from './sheet.js';

export const SPECS = [
  {
    id: 'towel', cls: Towel, slot: 0.09,
    cols: 6, rows: 7, wFrac: 0.17, hFrac: 0.30,
    rgb: [255, 206, 92], clipRGB: [238, 96, 90],
    clipCount: 2, pullPx: 42, gravityK: 1, damping: 0.984,
    windScale: 1.05, clothSize: 0.8, clipPitch: 1.15, clipLen: 0.05,
  },
  {
    id: 'shirt', cls: Shirt, slot: 0.28,
    cols: 6, rows: 7, wFrac: 0.19, hFrac: 0.30,
    rgb: [124, 202, 231], clipRGB: [201, 211, 220],
    clipCount: 2, pullPx: 46, gravityK: 0.9, damping: 0.986,
    windScale: 1.2, clothSize: 0.9, clipPitch: 1.0, clipLen: 0.055,
  },
  {
    id: 'pinch', cls: Pinch, slot: 0.47,
    cols: 7, rows: 5, wFrac: 0.20, hFrac: 0.20,
    rgb: [255, 150, 196], clipRGB: [120, 200, 160],
    clipCount: 3, pullPx: 34, gravityK: 0.8, damping: 0.982,
    windScale: 1.3, clothSize: 0.55, clipPitch: 1.3, clipLen: 0.035,
  },
  {
    id: 'pants', cls: Pants, slot: 0.66,
    cols: 6, rows: 9, wFrac: 0.16, hFrac: 0.42,
    rgb: [92, 124, 196], clipRGB: [70, 90, 130],
    clipCount: 2, pullPx: 64, gravityK: 1.5, damping: 0.99,
    windScale: 0.6, clothSize: 1.1, clipPitch: 0.7, clipLen: 0.075,
    heavy: true,
  },
  {
    id: 'sheet', cls: Sheet, slot: 0.85,
    cols: 9, rows: 7, wFrac: 0.26, hFrac: 0.38,
    rgb: [252, 244, 228], clipRGB: [244, 160, 92],
    clipCount: 4, pullPx: 40, gravityK: 0.85, damping: 0.988,
    windScale: 1.5, clothSize: 1.5, clipPitch: 0.85, clipLen: 0.09,
  },
];

export const ORDER = SPECS.map((s) => s.id);

export function createItems(world, hooks) {
  return SPECS.map((spec) => new spec.cls(world, Object.assign({}, spec), hooks));
}
