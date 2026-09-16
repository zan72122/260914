// items/index.js -- the registry, and the ONE place the line is packed.
//
// `slot`, `wFrac` and `hFrac` live here and nowhere else. No item class may
// override them: a second opinion about where something hangs is how the
// pinch hanger ended up standing inside the jeans. Items may still say how
// many columns of mesh they want, how many clips they carry and which columns
// those clips sit on -- that is construction, not layout.
//
// The packing, as fractions of the pole span (pole.x0 .. pole.x1, which is
// itself 78% of the window opening -- the last fifth is the parked pane of
// glass the first raindrop lands on):
//
//   towel  body [0.0000 .. 0.1320]  centre 0.0660
//   shirt  body [0.1435 .. 0.3165]  centre 0.2300  (0.117 of cloth + sleeves)
//   pinch  body [0.3280 .. 0.4830]  centre 0.4055
//   pants  body [0.4945 .. 0.6095]  centre 0.5520
//   sheet  body [0.6440 .. 0.9990]  centre 0.8215  (35.5%: the biggest, by far)
//
// Every body is disjoint from its neighbours in both orientations, because
// all of it is proportional to the pole. The shirt's body is wider than its
// cloth: its sleeves hang out past the shoulders by SLEEVE_OVERHANG of the
// cloth width on each side, and the packing above counts them.
//
// The gaps are 1.15% of the span except the one before the sheet, which is
// three times that. The sheet's outermost peg sits on the very corner of the
// cloth, so that gap is the whole distance between two pegs belonging to two
// different items -- and a finger reaching for one of them must never be
// given the other.
//
// `hFrac` is a fraction of the window opening's height. Phase 3 roughly
// doubled it: on a phone the hems now reach about two thirds of the way down
// the balcony instead of leaving the laundry in a thin band at the top.
//
// `pullPx` and `popBeat` are the two numbers that make the one gesture feel
// like five different things. `pullPx` is how far toward the room this item
// wants to be pulled before its first peg gives (the jeans multiply it again
// on top, in pants.js); `popBeat` is how long the world takes to answer with
// the next one -- a fifth of a second for the towel's diagonal, a tenth for
// the pinch hanger's pachi-pachi-pachi, four tenths for the sheet, because
// each of the sheet's corners has to be seen filling with air before the next
// one goes.

import { Towel } from './towel.js';
import { Shirt } from './shirt.js';
import { Pinch } from './pinch.js';
import { Pants } from './pants.js';
import { Sheet } from './sheet.js';

/** Per side, as a fraction of the shirt's cloth width. Drawn by shirt.js. */
export const SLEEVE_OVERHANG = 0.24;

export const SPECS = [
  {
    id: 'towel', cls: Towel, slot: 0.0660,
    cols: 6, rows: 7, wFrac: 0.132, hFrac: 0.50,
    rgb: [255, 206, 92], clipRGB: [238, 96, 90],
    clipCount: 2, pullPx: 42, popBeat: 0.20, gravityK: 1, damping: 0.984,
    windScale: 1.05, clothSize: 0.8, clipPitch: 1.15, clipLen: 0.05,
  },
  {
    id: 'shirt', cls: Shirt, slot: 0.2300,
    cols: 6, rows: 7, wFrac: 0.117, hFrac: 0.50,
    rgb: [124, 202, 231], clipRGB: [201, 211, 220],
    clipCount: 2, pullPx: 46, popBeat: 0.18, gravityK: 0.9, damping: 0.986,
    windScale: 1.2, clothSize: 0.9, clipPitch: 1.0, clipLen: 0.055,
  },
  {
    // Thirteen mesh columns so the six clips sit on odd columns and the row a
    // finger traces never reaches into the neighbouring washing.
    id: 'pinch', cls: Pinch, slot: 0.4055,
    cols: 13, rows: 4, wFrac: 0.155, hFrac: 0.34,
    rgb: [255, 150, 196], clipRGB: [120, 200, 160],
    clipCount: 6, clipCols: [1, 3, 5, 7, 9, 11],
    pullPx: 58, popBeat: 0.09, gravityK: 0.8, damping: 0.982,
    windScale: 1.3, clothSize: 0.55, clipPitch: 1.3, clipLen: 0.035,
  },
  {
    id: 'pants', cls: Pants, slot: 0.5520,
    cols: 6, rows: 9, wFrac: 0.115, hFrac: 0.58,
    rgb: [92, 124, 196], clipRGB: [70, 90, 130],
    clipCount: 2, pullPx: 64, popBeat: 0.20, gravityK: 1.5, damping: 0.99,
    windScale: 0.6, clothSize: 1.1, clipPitch: 0.7, clipLen: 0.075,
    heavy: true,
  },
  {
    // The set piece. Over a third of the pole, four pegs at cols 0/3/6/9, a
    // light mesh that takes a lot of wind, and a short pull threshold because
    // each peg is released on its own rather than by hauling the whole thing.
    id: 'sheet', cls: Sheet, slot: 0.8215,
    cols: 10, rows: 7, wFrac: 0.355, hFrac: 0.62,
    rgb: [252, 244, 228], clipRGB: [244, 160, 92],
    clipCount: 4, pullPx: 34, popBeat: 0.42, gravityK: 0.80, damping: 0.988,
    windScale: 1.7, clothSize: 1.6, clipPitch: 0.7, clipLen: 0.10,
  },
];

export const ORDER = SPECS.map((s) => s.id);

export function createItems(world, hooks) {
  return SPECS.map((spec) => new spec.cls(world, Object.assign({}, spec), hooks));
}
