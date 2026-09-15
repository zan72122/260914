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

/** Paint the grime/stain layer that hides the motif. */
export function paintStain(floor, cx, cy, r, rng) {
  const g = floor.gctx || floor.enableGrime();
  const x = cx - floor.rect.x0, y = cy - floor.rect.y0;
  g.save();
  g.translate(x, y);
  const grad = g.createRadialGradient(0, 0, r * 0.15, 0, 0, r);
  grad.addColorStop(0, 'rgba(132,112,88,0.98)');
  grad.addColorStop(0.62, 'rgba(140,120,96,0.95)');
  grad.addColorStop(0.86, 'rgba(150,132,108,0.72)');
  grad.addColorStop(1, 'rgba(158,142,118,0.0)');
  g.fillStyle = grad;
  const N = 64;
  const rad = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    rad[i] = r * (0.80 + 0.13 * Math.sin(a * 2.0 + 1.1) + 0.07 * Math.sin(a * 3.7 + 2.3) + 0.05 * Math.sin(a * 6.1));
  }
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const a0 = ((i - 1 + N) % N), a1 = (i % N);
    const ang0 = ((i - 1) / N) * TAU, ang1 = (i / N) * TAU;
    const x0 = Math.cos(ang0) * rad[a0], y0 = Math.sin(ang0) * rad[a0] * 0.86;
    const x1 = Math.cos(ang1) * rad[a1], y1 = Math.sin(ang1) * rad[a1] * 0.86;
    if (i === 0) g.moveTo(x1, y1);
    else g.quadraticCurveTo((x0 + x1) * 0.5, (y0 + y1) * 0.5, x1, y1);
  }
  g.closePath(); g.fill();
  // speckles
  g.fillStyle = 'rgba(96,76,52,0.45)';
  for (let i = 0; i < 90; i++) {
    const a = rng.range(0, TAU), rr = Math.sqrt(rng.next()) * r * 0.95;
    g.beginPath(); g.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.86, rng.range(0.8, 2.6), 0, TAU); g.fill();
  }
  g.restore();
}
