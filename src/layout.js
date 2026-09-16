// layout.js -- portrait / landscape world layout.
//
// Everything in the game is positioned from normalized fractions of the
// viewport, so a resize or an orientation change is a pure recomputation:
// no game state lives in pixel coordinates except the physics points, which
// are remapped by the owners on relayout.
//
// The single most important thing this module exports is `inDir`: the unit
// vector that points from "wet outside" to "dry inside". Wind, the drag
// threshold, the character, the basket and the sash all read it, so the
// natural mapping stays consistent in both orientations.
//   portrait  -> (0, 1)  : indoors is *below*  the balcony, pull down.
//   landscape -> (1, 0)  : indoors is *right*  of the balcony, pull right.

export const PORTRAIT_OUTDOOR = 0.55; // top 55% is the balcony
export const LANDSCAPE_OUTDOOR = 0.58; // left 58% is the balcony

// Fraction of the window opening still covered by the parked (open) sash pane.
// A real 引き違い窓 always keeps one pane in view; we need that glass anyway so
// the first raindrop has somewhere beautiful to land.
export const PARKED_GLASS = 0.2;

function rect(x, y, w, h) {
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2, right: x + w, bottom: y + h };
}

/**
 * @param {number} w  css pixel width of the viewport
 * @param {number} h  css pixel height of the viewport
 * @param {{top:number,right:number,bottom:number,left:number}} safe iOS safe-area insets
 */
export function computeWorld(w, h, safe) {
  const s = safe || { top: 0, right: 0, bottom: 0, left: 0 };
  const portrait = h >= w;
  const min = Math.min(w, h);
  const world = {
    w, h, min, portrait,
    safe: s,
    orientation: portrait ? 'portrait' : 'landscape',
    unit: min / 390, // scale factor: 1 === iPhone portrait width
  };

  // --- frame insets: keep the opening clear of notches / home indicator ---
  const fl = Math.max(s.left, min * 0.035);
  const fr = Math.max(s.right, min * 0.035);
  const ft = Math.max(s.top, min * 0.035);
  const fb = Math.max(s.bottom, min * 0.035);

  if (portrait) {
    const split = h * PORTRAIT_OUTDOOR;
    world.outdoor = rect(0, 0, w, split);
    world.indoor = rect(0, split, w, h - split);
    world.opening = rect(fl, ft, w - fl - fr, split - ft - min * 0.02);
    world.inDir = { x: 0, y: 1 };
    // Finger occlusion: in portrait the cloth must read *above* the finger.
    world.fingerOffset = { x: 0, y: -Math.max(52, min * 0.14) };
    world.trackAxis = 'x';
  } else {
    const split = w * LANDSCAPE_OUTDOOR;
    world.outdoor = rect(0, 0, split, h);
    world.indoor = rect(split, 0, w - split, h);
    world.opening = rect(fl, ft, split - fl - min * 0.02, h - ft - fb);
    world.inDir = { x: 1, y: 0 };
    // Landscape: the cloth reads *inward* (toward the room) of the finger.
    world.fingerOffset = { x: Math.max(52, min * 0.14), y: 0 };
    world.trackAxis = 'y';
  }

  const op = world.opening;

  // --- sash -------------------------------------------------------------
  // The sliding pane is as wide as the opening. At progress 0 it is parked to
  // the right, only PARKED_GLASS of the opening still covered; at progress 1
  // its left edge reaches the left edge of the opening (closed).
  world.sash = {
    opening: op,
    parked: PARKED_GLASS,
    frame: Math.max(8, min * 0.028),
    travel: op.w * (1 - PARKED_GLASS),
    // Closing always drags toward -x. In landscape that is toward the outdoor
    // side, exactly as specified; in portrait we keep the same horizontal
    // gesture because a sliding window slides sideways in the real world and
    // because vertical would collide with "pull down = bring in".
    dir: { x: -1, y: 0 },
  };

  // --- washing line -----------------------------------------------------
  const lineRight = op.x + op.w * (1 - PARKED_GLASS) - op.w * 0.02;
  world.pole = {
    y: op.y + op.h * (portrait ? 0.17 : 0.15),
    x0: op.x + op.w * 0.035,
    x1: lineRight,
    thickness: Math.max(5, min * 0.016),
  };
  world.pole.width = world.pole.x1 - world.pole.x0;

  // --- balcony floor ----------------------------------------------------
  world.floorY = op.y + op.h * (portrait ? 0.86 : 0.84);

  // --- indoor furniture -------------------------------------------------
  const ind = world.indoor;
  if (portrait) {
    world.basket = rect(ind.x + ind.w * 0.60, ind.y + ind.h * 0.36, ind.w * 0.30, ind.h * 0.40);
    world.character = rect(ind.x + ind.w * 0.08, ind.y + ind.h * 0.16, ind.w * 0.26, ind.h * 0.62);
    world.catchLine = ind.y + ind.h * 0.72; // feet line
    world.trackMin = ind.x + ind.w * 0.10;
    world.trackMax = ind.x + ind.w * 0.74;
  } else {
    world.basket = rect(ind.x + ind.w * 0.50, ind.y + ind.h * 0.52, ind.w * 0.42, ind.h * 0.34);
    world.character = rect(ind.x + ind.w * 0.06, ind.y + ind.h * 0.30, ind.w * 0.34, ind.h * 0.44);
    world.catchLine = ind.x + ind.w * 0.22; // standing column
    // Keep the child on the floor: the indoor floor line is at 0.62h.
    world.trackMin = ind.y + ind.h * 0.66;
    world.trackMax = ind.y + ind.h * 0.90;
  }
  world.charH = Math.max(76, min * 0.24);

  return world;
}

/** Scalar projection of a delta onto the "bring it in" direction. */
export function alongIn(world, dx, dy) {
  return dx * world.inDir.x + dy * world.inDir.y;
}

/** Perpendicular (track) coordinate of a point, matching world.trackAxis. */
export function trackOf(world, x, y) {
  return world.trackAxis === 'x' ? x : y;
}

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
