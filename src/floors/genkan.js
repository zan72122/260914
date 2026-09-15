import { Floor } from './floor.js';
import { TAU } from '../core/math.js';

/**
 * The entrance hall (genkan): a grey aggregate "tataki" floor at door level and
 * a raised wooden hall behind a step. Everything here is static and baked into
 * the floor's base canvas once — the sand height field is what hides it, so
 * there is no grime layer: clearing the sand IS the reveal.
 *
 *   makeGenkanFloor(rect, rng, {
 *     hall: {x0,y0,x1,y1},        // raised wooden part (world coords)
 *     stepAxis: 'y' | 'x',        // which edge of `hall` is the step riser
 *     door: {x, y, w, h},         // doorway light spill on the tataki
 *   })
 */
export function makeGenkanFloor(rect, rng, opts = {}) {
  const f = new Floor(rect);
  const g = f.bctx;
  const W = f.w, H = f.h;
  const ox = -rect.x0, oy = -rect.y0;

  // ---- tataki: dark grey aggregate slab, big joints -----------------------
  g.fillStyle = '#8a8377';
  g.fillRect(0, 0, W, H);
  const T = 132;
  for (let y = 0; y < H; y += T) {
    for (let x = 0; x < W; x += T) {
      g.fillStyle = ['#8f887c', '#877f73', '#948c80', '#847d71'][rng.int(0, 3)];
      g.fillRect(x + 2.5, y + 2.5, T - 5, T - 5);
    }
  }
  // aggregate speckle
  for (let i = 0; i < Math.round(W * H / 420); i++) {
    const x = rng.range(0, W), y = rng.range(0, H);
    const bright = rng.next();
    g.fillStyle = bright < 0.45 ? 'rgba(255,255,255,0.13)'
      : bright < 0.8 ? 'rgba(60,54,46,0.16)' : 'rgba(150,132,104,0.18)';
    g.beginPath(); g.arc(x, y, rng.range(0.7, 2.3), 0, TAU); g.fill();
  }

  // ---- raised wooden hall -------------------------------------------------
  const hall = opts.hall;
  if (hall) {
    const hx = hall.x0 + ox, hy = hall.y0 + oy;
    const hw = hall.x1 - hall.x0, hh = hall.y1 - hall.y0;
    g.save();
    g.beginPath(); g.rect(hx, hy, hw, hh); g.clip();
    g.fillStyle = '#c69a66';
    g.fillRect(hx, hy, hw, hh);
    const along = opts.stepAxis === 'x';       // planks run away from the step
    const plank = 74;
    const n = Math.ceil((along ? hh : hw) / plank) + 1;
    for (let i = 0; i < n; i++) {
      const a0 = (along ? hy : hx) + i * plank;
      g.fillStyle = ['#c69a66', '#bd9059', '#cfa672', '#b98b55'][rng.int(0, 3)];
      if (along) g.fillRect(hx, a0, hw, plank - 2); else g.fillRect(a0, hy, plank - 2, hh);
      g.strokeStyle = 'rgba(110,74,38,0.22)';
      g.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        const off = a0 + ((k + 0.5) / 6) * plank;
        g.beginPath();
        if (along) { g.moveTo(hx, off); g.lineTo(hx + hw, off); }
        else { g.moveTo(off, hy); g.lineTo(off, hy + hh); }
        g.stroke();
      }
    }
    g.restore();

    // step riser + the shadow it casts down onto the tataki
    const R = 15;
    g.save();
    if (opts.stepAxis === 'x') {
      // hall is to the +x side: riser runs vertically at hall.x0
      const sx = hall.x0 + ox;
      const grad = g.createLinearGradient(sx - 34, 0, sx, 0);
      grad.addColorStop(0, 'rgba(30,22,14,0)');
      grad.addColorStop(1, 'rgba(30,22,14,0.38)');
      g.fillStyle = grad; g.fillRect(sx - 34, hy, 34, hh);
      g.fillStyle = '#6d4a2b'; g.fillRect(sx, hy, R, hh);
      g.fillStyle = 'rgba(255,230,190,0.30)'; g.fillRect(sx + R - 4, hy, 4, hh);
      g.fillStyle = 'rgba(40,26,14,0.45)'; g.fillRect(sx, hy, 3, hh);
    } else {
      // hall is to the +y side (toward the viewer): riser runs horizontally
      const sy = hall.y0 + oy;
      const grad = g.createLinearGradient(0, sy - 30, 0, sy);
      grad.addColorStop(0, 'rgba(30,22,14,0)');
      grad.addColorStop(1, 'rgba(30,22,14,0.38)');
      g.fillStyle = grad; g.fillRect(hx, sy - 30, hw, 30);
      g.fillStyle = '#6d4a2b'; g.fillRect(hx, sy, hw, R);
      g.fillStyle = 'rgba(255,230,190,0.30)'; g.fillRect(hx, sy + R - 4, hw, 4);
      g.fillStyle = 'rgba(40,26,14,0.45)'; g.fillRect(hx, sy, hw, 3);
    }
    g.restore();
  }

  // ---- the doorway: a dark threshold with warm daylight spilling in -------
  const d = opts.door;
  if (d) {
    const dx = d.x + ox, dy = d.y + oy;
    g.save();
    g.fillStyle = '#5b544a';
    if (d.axis === 'x') {
      // doorway on the left: the threshold runs down the screen
      g.fillRect(dx - d.h, dy - d.w / 2, d.h, d.w);
      g.fillStyle = '#7a6a53';
      g.fillRect(dx - 14, dy - d.w / 2, 14, d.w);
      g.fillStyle = 'rgba(255,240,205,0.5)';
      g.fillRect(dx - 14, dy - d.w / 2, 4, d.w);
    } else {
      g.fillRect(dx - d.w / 2, dy - d.h, d.w, d.h);
      // sill
      g.fillStyle = '#7a6a53';
      g.fillRect(dx - d.w / 2, dy - 14, d.w, 14);
      g.fillStyle = 'rgba(255,240,205,0.5)';
      g.fillRect(dx - d.w / 2, dy - 14, d.w, 4);
    }
    // the light that comes in with the sand
    const spill = g.createRadialGradient(dx + (d.axis === 'x' ? 40 : 0), dy + (d.axis === 'x' ? 0 : 40), 10,
      dx + (d.axis === 'x' ? 40 : 0), dy + (d.axis === 'x' ? 0 : 40), d.spill || 320);
    spill.addColorStop(0, 'rgba(255,236,186,0.42)');
    spill.addColorStop(0.5, 'rgba(255,233,180,0.17)');
    spill.addColorStop(1, 'rgba(255,230,180,0)');
    g.fillStyle = spill;
    const sp = d.spill || 320;
    if (d.axis === 'x') { g.beginPath(); g.ellipse(dx + 40, dy, sp * 0.8, sp * 0.95, 0, 0, TAU); g.fill(); }
    else { g.beginPath(); g.ellipse(dx, dy + 40, sp * 0.95, sp * 0.8, 0, 0, TAU); g.fill(); }
    g.restore();
  }
  return f;
}

/**
 * The doormat hidden under the pile: this is the reward. Bold, high contrast
 * (indigo + cream + coral) so the moment the crater floor shows through is
 * unmistakable even at the size of a fingertip.
 */
export function paintMat(floor, cx, cy, w, h, rng) {
  const g = floor.bctx;
  const x = cx - floor.rect.x0, y = cy - floor.rect.y0;
  g.save();
  g.translate(x, y);
  // soft ground shadow so the mat sits on the tataki
  g.fillStyle = 'rgba(30,24,16,0.22)';
  rr(g, -w / 2 + 3, -h / 2 + 5, w, h, 16); g.fill();

  rr(g, -w / 2, -h / 2, w, h, 14);
  g.save(); g.clip();
  g.fillStyle = '#2d4f7d';
  g.fillRect(-w / 2, -h / 2, w, h);
  // seigaiha: overlapping cream arcs
  g.strokeStyle = 'rgba(240,233,214,0.85)';
  g.lineWidth = 3;
  const step = 34;
  for (let ry = -h / 2 - step; ry < h / 2 + step; ry += step * 0.56) {
    const shift = (Math.round((ry + h) / (step * 0.56)) % 2) ? step / 2 : 0;
    for (let rx = -w / 2 - step; rx < w / 2 + step; rx += step) {
      for (let k = 1; k <= 3; k++) {
        g.beginPath();
        g.arc(rx + shift, ry, (step / 2) * (k / 3), Math.PI, 0);
        g.stroke();
      }
    }
  }
  // coral sun in the middle
  const R = Math.min(w, h) * 0.30;
  g.fillStyle = '#e8734d';
  g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
  g.fillStyle = '#f6d9a8';
  g.beginPath(); g.arc(0, 0, R * 0.58, 0, TAU); g.fill();
  g.fillStyle = '#e8734d';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    g.beginPath();
    g.ellipse(Math.cos(a) * R * 1.32, Math.sin(a) * R * 1.32, R * 0.16, R * 0.30, a, 0, TAU);
    g.fill();
  }
  g.restore();
  // cream border + fringe
  g.strokeStyle = '#efe6cf'; g.lineWidth = 9;
  rr(g, -w / 2 + 4.5, -h / 2 + 4.5, w - 9, h - 9, 11); g.stroke();
  g.strokeStyle = 'rgba(25,38,60,0.75)'; g.lineWidth = 2.5;
  rr(g, -w / 2, -h / 2, w, h, 14); g.stroke();
  g.strokeStyle = '#dfd3b6'; g.lineWidth = 3;
  for (let i = -w / 2 + 12; i < w / 2 - 6; i += 13) {
    g.beginPath(); g.moveTo(i, -h / 2); g.lineTo(i, -h / 2 - 7); g.stroke();
    g.beginPath(); g.moveTo(i, h / 2); g.lineTo(i, h / 2 + 7); g.stroke();
  }
  g.restore();
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
