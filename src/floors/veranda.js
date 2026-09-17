import { Floor } from './floor.js';
import { TAU } from '../core/math.js';

/**
 * The balcony deck: pale concrete tiles, a painted pattern in the middle of
 * them, and a drain grate in one corner. All of it is baked once into the
 * offscreen base — the only thing that is ever composited on top is the thin
 * layer of leaf litter (the grime), which is what the child erases.
 */
export function makeVerandaFloor(rect, rng, opts = {}) {
  const f = new Floor(rect);
  const g = f.bctx;
  const W = f.w, H = f.h;
  const t = opts.tile || 92;

  // grout
  g.fillStyle = '#9e978a';
  g.fillRect(0, 0, W, H);

  const cols = ['#cfc7b6', '#c7bfae', '#d5cdbc', '#c2baa9'];
  for (let y = 0; y < H; y += t) {
    for (let x = 0; x < W; x += t) {
      g.fillStyle = cols[rng.int(0, cols.length - 1)];
      g.fillRect(x + 3, y + 3, t - 6, t - 6);
      // concrete speckle: a handful of dots, not a texture pass
      g.fillStyle = 'rgba(120,112,98,0.20)';
      for (let k = 0; k < 7; k++) {
        const sx = x + rng.range(6, t - 6), sy = y + rng.range(6, t - 6);
        g.fillRect(sx, sy, 2, 2);
      }
      g.fillStyle = 'rgba(255,255,255,0.13)';
      g.fillRect(x + 3, y + 3, t - 6, 5);
    }
  }
  return f;
}

/**
 * The painted pattern under the leaves: a grid of hand-painted tiles, the sort
 * a balcony gets when somebody has been cheerful about it. Painted on the BASE,
 * so it only appears as the litter is cleared off it.
 */
export function paintTilePattern(floor, cx, cy, w, h, tile = 92) {
  const g = floor.bctx;
  const x0 = cx - w / 2 - floor.rect.x0, y0 = cy - h / 2 - floor.rect.y0;
  g.save();
  g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  const A = '#6f9bb0', B = '#c98a68';
  const nx = Math.ceil(w / tile), ny = Math.ceil(h / tile);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * tile + tile / 2, y = y0 + j * tile + tile / 2;
      const odd = (i + j) & 1;
      g.fillStyle = odd ? 'rgba(232,223,200,0.75)' : 'rgba(215,205,182,0.7)';
      g.fillRect(x - tile / 2 + 4, y - tile / 2 + 4, tile - 8, tile - 8);
      g.save();
      g.translate(x, y);
      g.rotate(odd ? Math.PI / 4 : 0);
      // four petals around a dot: reads at a glance, costs four ellipses
      g.fillStyle = odd ? A : B;
      for (let k = 0; k < 4; k++) {
        g.save(); g.rotate((k / 4) * TAU);
        g.beginPath(); g.ellipse(0, -tile * 0.21, tile * 0.10, tile * 0.17, 0, 0, TAU); g.fill();
        g.restore();
      }
      g.fillStyle = odd ? B : A;
      g.beginPath(); g.arc(0, 0, tile * 0.09, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(120,110,92,0.35)';
      g.lineWidth = 2;
      g.strokeRect(-tile / 2 + 4, -tile / 2 + 4, tile - 8, tile - 8);
      g.restore();
    }
  }
  g.restore();
}

/** The drain: a sunken metal grate. Also base, also revealed. */
export function paintGrate(floor, cx, cy, w, h, horizontal = false) {
  const g = floor.bctx;
  const x = cx - w / 2 - floor.rect.x0, y = cy - h / 2 - floor.rect.y0;
  g.save();
  // the recess
  g.fillStyle = '#6d675c';
  g.fillRect(x - 6, y - 6, w + 12, h + 12);
  g.fillStyle = '#2b2a26';
  g.fillRect(x, y, w, h);
  // slots
  g.fillStyle = '#8b8578';
  const n = horizontal ? Math.floor(h / 11) : Math.floor(w / 11);
  for (let i = 0; i <= n; i++) {
    if (horizontal) g.fillRect(x, y + i * 11, w, 5);
    else g.fillRect(x + i * 11, y, 5, h);
  }
  g.fillStyle = 'rgba(255,255,255,0.16)';
  if (horizontal) g.fillRect(x, y, w, 3); else g.fillRect(x, y, 3, h);
  g.strokeStyle = '#4c473f';
  g.lineWidth = 3;
  g.strokeRect(x - 3, y - 3, w + 6, h + 6);
  g.restore();
}

/**
 * The litter film: what months of leaves leave behind. Dusty brown blotches
 * with darker flecks in them, thick where the leaves were piled. This is the
 * GRIME layer, so clearing debris erases holes in it and the pattern below
 * comes up.
 */
export function paintLitter(floor, cx, cy, rx, ry, rng, heavy = [], clip = null) {
  const g = floor.gctx || floor.enableGrime();
  floor.smoothGrime = false;          // soft blotches: the filter is wasted here
  const ox = -floor.rect.x0, oy = -floor.rect.y0;
  g.save();
  if (clip) {
    g.beginPath();
    g.rect(clip.x0 + ox, clip.y0 + oy, clip.x1 - clip.x0, clip.y1 - clip.y0);
    g.clip();
  }
  // a bed of trodden-in litter: enough to hide the pattern, thin enough at the
  // edges that the concrete still shows and the deck does not read as mud
  g.fillStyle = 'rgba(138,114,74,0.36)';
  g.beginPath(); g.ellipse(cx + ox, cy + oy, rx * 1.10, ry * 1.10, 0, 0, TAU); g.fill();
  for (let i = 0; i < 150; i++) {
    const a = rng.range(0, TAU), r = Math.sqrt(rng.next()) * 1.22;
    const x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r;
    const rr = rng.range(30, 84);
    g.fillStyle = 'rgba(126,98,58,' + rng.range(0.10, 0.26).toFixed(3) + ')';
    g.beginPath(); g.ellipse(x + ox, y + oy, rr, rr * rng.range(0.55, 0.9), rng.range(0, TAU), 0, TAU); g.fill();
  }
  for (let i = 0; i < heavy.length; i++) {
    const h = heavy[i];
    for (let k = 0; k < 26; k++) {
      const a = rng.range(0, TAU), r = Math.sqrt(rng.next()) * h.r;
      g.fillStyle = 'rgba(94,70,38,' + rng.range(0.10, 0.22).toFixed(3) + ')';
      g.beginPath();
      g.ellipse(h.x + Math.cos(a) * r + ox, h.y + Math.sin(a) * r * 0.8 + oy,
        rng.range(18, 40), rng.range(12, 26), rng.range(0, TAU), 0, TAU);
      g.fill();
    }
  }
  // dry crumbs of old leaf ground into the tile
  for (let i = 0; i < 260; i++) {
    const a = rng.range(0, TAU), r = Math.sqrt(rng.next());
    const x = cx + Math.cos(a) * rx * r + ox, y = cy + Math.sin(a) * ry * r + oy;
    g.fillStyle = 'rgba(74,52,24,' + rng.range(0.22, 0.5).toFixed(3) + ')';
    const w = rng.range(2, 5.5);
    g.fillRect(x, y, w, w * rng.range(0.4, 0.9));
  }
  g.restore();
}
