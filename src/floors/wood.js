import { Floor } from './floor.js';
import { TAU, clamp } from '../core/math.js';

/** Warm wooden planks running along the "away" axis. */
export function makeWoodFloor(rect, rng, opts = {}) {
  const f = new Floor(rect);
  const g = f.bctx;
  const W = f.w, H = f.h;
  const plankW = opts.plankW || 78;
  const horizontal = !!opts.horizontal;

  g.fillStyle = '#c99a63';
  g.fillRect(0, 0, W, H);

  const tones = ['#c89a64', '#c08f59', '#d2a874', '#bb8852', '#cda06b'];
  const along = horizontal ? W : H;
  const across = horizontal ? H : W;
  const nPlanks = Math.ceil(across / plankW) + 1;

  for (let i = 0; i < nPlanks; i++) {
    const a0 = i * plankW;
    let p = 0;
    while (p < along) {
      const segLen = rng.range(160, 420);
      const tone = tones[(Math.random() * 0 + rng.int(0, tones.length - 1))];
      g.save();
      if (horizontal) g.translate(p, a0); else g.translate(a0, p);
      const sw = horizontal ? segLen : plankW;
      const sh = horizontal ? plankW : segLen;
      g.fillStyle = tone;
      g.fillRect(0, 0, sw, sh);
      // grain
      g.strokeStyle = 'rgba(120,80,40,0.16)';
      g.lineWidth = 1;
      const lines = 7;
      for (let k = 0; k < lines; k++) {
        g.beginPath();
        const off = ((k + 0.5) / lines) * plankW + rng.range(-3, 3);
        if (horizontal) {
          g.moveTo(0, off);
          for (let x = 0; x < segLen; x += 26) g.lineTo(x, off + Math.sin((x + i * 30) * 0.03) * 1.8);
        } else {
          g.moveTo(off, 0);
          for (let y = 0; y < segLen; y += 26) g.lineTo(off + Math.sin((y + i * 30) * 0.03) * 1.8, y);
        }
        g.stroke();
      }
      // knot
      if (rng.next() < 0.18) {
        const kx = rng.range(plankW * 0.25, plankW * 0.75);
        const ky = rng.range(segLen * 0.2, segLen * 0.8);
        const cx = horizontal ? ky : kx, cy = horizontal ? kx : ky;
        g.strokeStyle = 'rgba(110,70,32,0.28)';
        for (let k = 1; k <= 3; k++) {
          g.beginPath(); g.ellipse(cx, cy, 3 + k * 2.4, 2 + k * 1.6, 0.5, 0, TAU); g.stroke();
        }
      }
      // seam
      g.fillStyle = 'rgba(90,58,24,0.22)';
      if (horizontal) g.fillRect(0, sh - 2, sw, 2); else g.fillRect(sw - 2, 0, 2, sh);
      g.restore();
      // end seam
      g.fillStyle = 'rgba(90,58,24,0.3)';
      if (horizontal) g.fillRect(p + segLen - 1.5, a0, 1.5, plankW);
      else g.fillRect(a0, p + segLen - 1.5, plankW, 1.5);
      p += segLen;
    }
  }

  // gentle vignette so the eye is led to the middle
  const vg = g.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.25, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
  vg.addColorStop(0, 'rgba(255,240,210,0.10)');
  vg.addColorStop(1, 'rgba(60,35,12,0.22)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  return f;
}
