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

/**
 * Small warm accent tiles scattered over the rest of the pantry floor.
 *
 * The medallion under the spill is the prize; these are the reason the floor
 * AROUND it is worth clearing too. They are painted on the base under the thin
 * haze of flour that covers the whole room, so they come up one at a time as
 * the child works outward — and when the room is finished it is a patterned
 * floor rather than a black one.
 */
export function paintPantryAccents(floor, rect, rng, keepOut, n, hidden) {
  const g = floor.bctx;
  const N = n || 14;
  const x0 = rect.x0 - floor.baseRect.x0, y0 = rect.y0 - floor.baseRect.y0;
  const w = rect.x1 - rect.x0, h = rect.y1 - rect.y0;
  for (let i = 0; i < N; i++) {
    const px = x0 + rng.range(w * 0.06, w * 0.94);
    const py = y0 + rng.range(h * 0.06, h * 0.94);
    if (keepOut) {
      const dx = (px + floor.baseRect.x0 - keepOut.x) / (keepOut.rx + 26);
      const dy = (py + floor.baseRect.y0 - keepOut.y) / (keepOut.ry + 26);
      if (dx * dx + dy * dy < 1) continue;
    }
    if (hidden && !hidden(px + floor.baseRect.x0, py + floor.baseRect.y0)) continue;
    const r = rng.range(11, 17);
    g.save();
    g.translate(px, py);
    g.rotate(rng.range(0, TAU));
    // a warm diamond with a teal pip: the medallion's family, a quarter its size
    g.fillStyle = '#e8b968';
    g.beginPath();
    g.moveTo(0, -r); g.lineTo(r, 0); g.lineTo(0, r); g.lineTo(-r, 0);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(96,64,30,0.40)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#4fb9a6';
    g.beginPath(); g.arc(0, 0, r * 0.34, 0, TAU); g.fill();
    g.restore();
  }
}
