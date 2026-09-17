import { Floor } from './floor.js';
import { TAU } from '../core/math.js';

/**
 * Pantry floor: small DARK slate tiles.
 *
 * The room exists so that white flour can be seen moving on it, so the floor is
 * the darkest in the house — every streak the airflow draws in the powder reads
 * at a glance, and a cleaned track is not a subtle change of tone but black tile
 * appearing out of white.
 *
 * Under the spill there is a bright painted motif. It is on the BASE layer, so
 * no grime layer and no mask is needed: where the powder is gone the motif is
 * simply there, which is exactly the causal story ("the vacuum took the flour
 * away and THAT was underneath").
 */
export function makePantryFloor(rect, rng, opts = {}) {
  const f = new Floor(rect);
  const g = f.bctx;
  const W = f.w, H = f.h;
  const t = opts.tile || 62;

  g.fillStyle = '#17161b';                 // grout
  g.fillRect(0, 0, W, H);

  const cols = ['#302f38', '#2a2932', '#363541', '#272630', '#33323d'];
  for (let y = 0; y < H; y += t) {
    for (let x = 0; x < W; x += t) {
      g.fillStyle = cols[rng.int(0, cols.length - 1)];
      g.fillRect(x + 2, y + 2, t - 4, t - 4);
      // dry speckle in the stone, so the tile is not a flat swatch
      for (let k = 0; k < 5; k++) {
        g.fillStyle = rng.next() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.16)';
        g.beginPath();
        g.arc(x + rng.range(5, t - 5), y + rng.range(5, t - 5), rng.range(1, 3.2), 0, TAU);
        g.fill();
      }
      // a short highlight along the top-left of each tile: it reads as relief
      g.strokeStyle = 'rgba(255,255,255,0.07)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x + 3, y + t - 5); g.lineTo(x + 3, y + 3); g.lineTo(x + t - 5, y + 3);
      g.stroke();
    }
  }
  return f;
}

/**
 * The motif hiding under the flour: a checkerboard diamond with a star in it.
 *
 * Painted straight onto the base, in the warm colours the rest of the floor
 * does not have, so the first clean track through the powder is a colour the
 * child has not seen in this room yet.
 */
export function paintPantryMotif(floor, cx, cy, rx, ry, rng) {
  const g = floor.bctx;
  const x = cx - floor.baseRect.x0, y = cy - floor.baseRect.y0;
  g.save();
  g.translate(x, y);
  g.scale(1, ry / rx);
  const r = rx;

  // a warm ring of tile, brighter than anything else in the room
  g.fillStyle = '#f0e3c4';
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();

  // checkerboard inside it, clipped to the ring
  g.save();
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.clip();
  const c = r / 4.5;
  for (let iy = -6; iy <= 6; iy++) {
    for (let ix = -6; ix <= 6; ix++) {
      if ((ix + iy) & 1) continue;
      g.fillStyle = '#e0a24d';
      g.fillRect(ix * c - c * 0.5, iy * c - c * 0.5, c, c);
    }
  }
  g.restore();

  // an eight-point star in the middle: the thing the child is uncovering
  g.fillStyle = '#4fb9a6';
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU - Math.PI / 2;
    const rr = i & 1 ? r * 0.24 : r * 0.58;
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath(); g.fill();
  g.fillStyle = '#fff6e2';
  g.beginPath(); g.arc(0, 0, r * 0.17, 0, TAU); g.fill();

  g.strokeStyle = 'rgba(90,60,30,0.45)'; g.lineWidth = 3;
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
  g.restore();
}
