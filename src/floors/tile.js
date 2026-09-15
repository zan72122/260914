import { Floor } from './floor.js';
import { TAU } from '../core/math.js';

/**
 * Glossy kitchen tile. The long soft specular streaks are the signifier for
 * "this floor is slippery" — crumbs skate on it.
 */
export function makeTileFloor(rect, rng, opts = {}) {
  const f = new Floor(rect);
  const g = f.bctx;
  const W = f.w, H = f.h;
  const t = opts.tile || 96;
  const grout = '#c7ccd1';

  g.fillStyle = grout;
  g.fillRect(0, 0, W, H);

  const cols = ['#dfe7ed', '#d8e1e8', '#e6edf2', '#d2dce4'];
  for (let y = 0; y < H; y += t) {
    for (let x = 0; x < W; x += t) {
      const c = cols[rng.int(0, cols.length - 1)];
      g.fillStyle = c;
      g.fillRect(x + 2, y + 2, t - 4, t - 4);
      // subtle marble veining
      g.strokeStyle = 'rgba(150,170,185,0.16)';
      g.lineWidth = 1.2;
      for (let k = 0; k < 2; k++) {
        g.beginPath();
        let vx = x + rng.range(4, t - 4), vy = y + 3;
        g.moveTo(vx, vy);
        while (vy < y + t - 3) { vy += 12; vx += rng.range(-9, 9); g.lineTo(vx, vy); }
        g.stroke();
      }
      // specular corner sheen
      const gr = g.createLinearGradient(x, y, x + t, y + t);
      gr.addColorStop(0, 'rgba(255,255,255,0.28)');
      gr.addColorStop(0.35, 'rgba(255,255,255,0.05)');
      gr.addColorStop(1, 'rgba(255,255,255,0.0)');
      g.fillStyle = gr;
      g.fillRect(x + 2, y + 2, t - 4, t - 4);
    }
  }

  // long window highlights across the whole floor: unmistakably glossy
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const cx = W * (0.2 + i * 0.3);
    const gr = g.createLinearGradient(cx - 70, 0, cx + 70, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.13)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.save();
    g.translate(cx, H * 0.5); g.rotate(-0.22); g.translate(-cx, -H * 0.5);
    g.fillRect(cx - 80, -H, 160, H * 3);
    g.restore();
  }
  g.restore();
  return f;
}

/** Paint a hidden motif on the BASE layer (revealed when grime is cleared). */
export function paintMotif(floor, cx, cy, r, rng) {
  const g = floor.bctx;
  const x = cx - floor.rect.x0, y = cy - floor.rect.y0;
  g.save();
  g.translate(x, y);
  // a cheerful painted flower / sun
  g.fillStyle = '#f7b5b0';
  for (let i = 0; i < 8; i++) {
    g.save(); g.rotate((i / 8) * TAU);
    g.beginPath(); g.ellipse(0, -r * 0.62, r * 0.26, r * 0.44, 0, 0, TAU); g.fill();
    g.restore();
  }
  g.fillStyle = '#6fb7a8';
  g.beginPath(); g.arc(0, 0, r * 0.34, 0, TAU); g.fill();
  g.fillStyle = '#d7efe8';
  g.beginPath(); g.arc(-r * 0.1, -r * 0.1, r * 0.13, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(120,150,170,0.5)'; g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, r * 0.92, 0, TAU); g.stroke();
  g.restore();
}

/**
 * Paint the pale dusting that hides the motif: fine dry crumbs ground into the
 * tile, NOT a puddle. Dense at the source, thinning along the fan direction.
 */
export function paintDust(floor, cx, cy, r, rng, dirX = 0, dirY = 1) {
  const g = floor.gctx || floor.enableGrime();
  const x = cx - floor.rect.x0, y = cy - floor.rect.y0;
  g.save();
  g.translate(x, y);
  const grad = g.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
  grad.addColorStop(0, 'rgba(231,222,205,0.94)');
  grad.addColorStop(0.55, 'rgba(226,216,197,0.86)');
  grad.addColorStop(0.82, 'rgba(222,213,196,0.55)');
  grad.addColorStop(1, 'rgba(220,212,196,0.0)');
  g.fillStyle = grad;
  const N = 64;
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    // stretched along the fan direction, ragged at the far edge
    const along = Math.cos(a) * dirX + Math.sin(a) * dirY;
    const rr = r * (0.74 + 0.22 * along + 0.10 * Math.sin(a * 3.3 + 1.7) + 0.06 * Math.sin(a * 6.1));
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.88;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath(); g.fill();
  // dry speckles, denser near the source
  for (let i = 0; i < 220; i++) {
    const a = rng.range(0, TAU);
    const rr = Math.pow(rng.next(), 0.6) * r * 0.98;
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.88;
    g.fillStyle = rng.next() < 0.5 ? 'rgba(206,192,166,0.75)' : 'rgba(180,164,136,0.5)';
    g.beginPath(); g.arc(px, py, rng.range(0.6, 2.0), 0, TAU); g.fill();
  }
  g.restore();
}
