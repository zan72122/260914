import { Floor } from './floor.js';
import { TAU } from '../core/math.js';

/**
 * Playroom foam mat: big soft interlocking squares in pastel colours with
 * jigsaw nubs along the seams. Flat and pale on purpose — grey fluff, brown
 * crumbs and bright plastic beads all have to read against it at a glance.
 */
export function makePlayroomFloor(rect, rng, opts = {}) {
  const f = new Floor(rect);
  const g = f.bctx;
  const W = f.w, H = f.h;
  const t = opts.tile || 158;

  const cols = ['#eceedd', '#dcebe2', '#f7e7d8', '#e3e6f2', '#f1e6ef'];
  g.fillStyle = '#e8eade';
  g.fillRect(0, 0, W, H);

  const nx = Math.ceil(W / t) + 1;
  const ny = Math.ceil(H / t) + 1;
  const grid = [];
  for (let j = 0; j < ny; j++) {
    grid.push([]);
    for (let i = 0; i < nx; i++) {
      const c = cols[rng.int(0, cols.length - 1)];
      grid[j].push(c);
      g.fillStyle = c;
      g.fillRect(i * t, j * t, t, t);
    }
  }

  // jigsaw nubs: each seam carries a little tab from one tile into the other
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = i * t, y = j * t;
      const r = t * 0.085;
      if (i + 1 < nx) {
        const into = rng.next() < 0.5;
        g.fillStyle = into ? grid[j][i] : grid[j][i + 1];
        g.beginPath();
        g.arc(x + t, y + t * 0.5, r, 0, TAU);
        g.fill();
      }
      if (j + 1 < ny) {
        const into = rng.next() < 0.5;
        g.fillStyle = into ? grid[j][i] : grid[j + 1][i];
        g.beginPath();
        g.arc(x + t * 0.5, y + t, r, 0, TAU);
        g.fill();
      }
    }
  }

  // seams
  g.strokeStyle = 'rgba(112,112,100,0.38)';
  g.lineWidth = 2.5;
  for (let i = 0; i <= nx; i++) { g.beginPath(); g.moveTo(i * t, 0); g.lineTo(i * t, H); g.stroke(); }
  for (let j = 0; j <= ny; j++) { g.beginPath(); g.moveTo(0, j * t); g.lineTo(W, j * t); g.stroke(); }
  // re-draw the nubs' outlines so the seam wraps around them
  g.strokeStyle = 'rgba(112,112,100,0.38)';
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = i * t, y = j * t, r = t * 0.085;
      if (i + 1 < nx) { g.beginPath(); g.arc(x + t, y + t * 0.5, r, 0, TAU); g.stroke(); }
      if (j + 1 < ny) { g.beginPath(); g.arc(x + t * 0.5, y + t, r, 0, TAU); g.stroke(); }
    }
  }

  // foam speckle so the flat colour is not dead
  for (let i = 0; i < W * H / 2600; i++) {
    const x = rng.range(0, W), y = rng.range(0, H);
    g.fillStyle = rng.next() < 0.5 ? 'rgba(255,255,255,0.45)' : 'rgba(120,115,105,0.10)';
    g.beginPath(); g.arc(x, y, rng.range(0.7, 1.9), 0, TAU); g.fill();
  }

  const vg = g.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.28, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
  vg.addColorStop(0, 'rgba(255,255,240,0.10)');
  vg.addColorStop(1, 'rgba(70,60,45,0.20)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  return f;
}

/**
 * A big peel-and-stick star sticker printed on the mat. Painted on the BASE
 * layer and then buried under a dust patch, so clearing the dust uncovers it.
 */
export function paintSticker(f, wx, wy, r, rng) {
  const g = f.bctx;
  const x = wx - f.rect.x0, y = wy - f.rect.y0;
  g.save();
  g.translate(x, y);

  // rainbow halo
  const rings = ['#ffd3e0', '#ffe9b8', '#cfeccd', '#c6e0f6'];
  for (let i = rings.length - 1; i >= 0; i--) {
    g.fillStyle = rings[i];
    g.beginPath();
    g.ellipse(0, 0, r * (0.62 + i * 0.13), r * (0.58 + i * 0.12), 0, 0, TAU);
    g.fill();
  }
  // white sticker die-cut edge
  g.fillStyle = '#ffffff';
  star(g, 0, 0, r * 0.66, r * 0.29, 5, -Math.PI / 2);
  g.fill();
  g.fillStyle = '#ffc93c';
  star(g, 0, 0, r * 0.56, r * 0.24, 5, -Math.PI / 2);
  g.fill();
  g.fillStyle = '#f2a91f';
  star(g, 0, 0, r * 0.30, r * 0.13, 5, -Math.PI / 2);
  g.fill();
  // a smiling face, because a 4-year-old found it
  g.fillStyle = '#7a5410';
  g.beginPath(); g.ellipse(-r * 0.12, -r * 0.05, r * 0.035, r * 0.05, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(r * 0.12, -r * 0.05, r * 0.035, r * 0.05, 0, 0, TAU); g.fill();
  g.strokeStyle = '#7a5410'; g.lineWidth = Math.max(1.5, r * 0.035); g.lineCap = 'round';
  g.beginPath(); g.arc(0, r * 0.02, r * 0.16, 0.35, Math.PI - 0.35); g.stroke();
  // a few scattered confetti dots around it
  for (let i = 0; i < 14; i++) {
    const a = rng.range(0, TAU), d = rng.range(r * 0.50, r * 0.80);
    g.fillStyle = ['#f78fa7', '#8ccfa0', '#8fb6e8', '#f6c95c'][rng.int(0, 3)];
    g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d * 0.9, rng.range(3, 6), rng.range(2, 4), a, 0, TAU); g.fill();
  }
  g.restore();
}

function star(g, cx, cy, ro, ri, n, rot) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * TAU;
    const r = i % 2 ? ri : ro;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

/**
 * A patch of settled grey dust on the GRIME layer — what has been sitting
 * under a toy for a year. Holes punched in it by Floor.reveal() show whatever
 * was printed on the mat underneath.
 */
export function paintDustPatch(f, wx, wy, rx, ry, rng) {
  const g = f.gctx;
  if (!g) return;
  const x = wx - f.rect.x0, y = wy - f.rect.y0;
  g.save();
  g.translate(x, y);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, Math.max(rx, ry));
  grad.addColorStop(0, 'rgba(146,139,126,1)');
  grad.addColorStop(0.55, 'rgba(152,145,132,0.99)');
  grad.addColorStop(0.82, 'rgba(158,151,138,0.86)');
  grad.addColorStop(1, 'rgba(165,158,145,0)');
  g.fillStyle = grad;
  g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.fill();
  // lint hairs and specks so it is dust, not a shadow
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const a = rng.range(0, TAU), d = rng.range(0, 0.85);
    const px = Math.cos(a) * rx * d, py = Math.sin(a) * ry * d;
    const al = rng.range(0, TAU), L = rng.range(5, 15);
    g.strokeStyle = 'rgba(120,113,102,' + rng.range(0.22, 0.5).toFixed(2) + ')';
    g.lineWidth = rng.range(0.9, 1.9);
    g.beginPath();
    g.moveTo(px, py);
    g.quadraticCurveTo(px + Math.cos(al) * L * 0.5 - 3, py + Math.sin(al) * L * 0.5 + 3,
      px + Math.cos(al) * L, py + Math.sin(al) * L);
    g.stroke();
  }
  for (let i = 0; i < 22; i++) {
    const a = rng.range(0, TAU), d = rng.range(0, 0.95);
    g.fillStyle = 'rgba(108,101,90,' + rng.range(0.15, 0.4).toFixed(2) + ')';
    g.beginPath();
    g.arc(Math.cos(a) * rx * d, Math.sin(a) * ry * d, rng.range(1, 2.6), 0, TAU);
    g.fill();
  }
  g.restore();
}
