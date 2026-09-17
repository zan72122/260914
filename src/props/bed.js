import { TAU, clamp, smoothstep } from '../core/math.js';
import { Prop } from './prop.js';
import { makeCanvas } from '../floors/floor.js';

/**
 * Drawing for the bedroom: the bed, the skirt (valance) that hides the cavity
 * under it, the dark slot the skirt leaves at the floor, and the two props that
 * live down there (the legs, and a lost slipper).
 *
 * A bed is `{x0, x1, yEdge, yBack, gap}` in world units, exactly like the
 * sofa's footprint: the frame spans x0..x1 and yBack..yEdge, the viewer is at
 * +y, and the strip (yEdge-gap .. yEdge) is the gap under the skirt that you
 * can see into from outside.
 *
 * Nothing in here is live-rendered if it can be helped: the bed is painted once
 * into its own canvas and composited with an alpha (it fades to a ghost frame
 * when the camera is underneath it), and the only per-frame path is the skirt
 * hem, which is ~14 points and has to move because the airflow moves it.
 */

function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, Math.min(w, h) * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

// --------------------------------------------------------------------- bed

/** Paint the bed once; `head` is which end the headboard and pillows are at. */
export function makeBedImage(b, opts = {}) {
  const pad = 16;
  const w = Math.round(b.x1 - b.x0) + pad * 2;
  const h = Math.round(b.yEdge - b.gap - b.yBack) + pad * 2 + 14;
  const canvas = makeCanvas(w, h);
  const g = canvas.getContext('2d');
  g.translate(pad - b.x0, pad - (b.yBack - 10));
  paintBed(g, b, opts.head || 'far');
  return { canvas, x: b.x0 - pad, y: b.yBack - 10 - pad, w, h };
}

function paintBed(ctx, b, head) {
  const x0 = b.x0, x1 = b.x1, W = x1 - x0;
  const yb = b.yBack, ye = b.yEdge - b.gap, D = ye - yb;
  ctx.save();

  // the wooden frame, a little proud of the mattress all round
  ctx.fillStyle = '#9d6f46';
  rr(ctx, x0 - 6, yb - 10, W + 12, D + 16, 20); ctx.fill();
  ctx.fillStyle = 'rgba(255,238,210,0.18)';
  rr(ctx, x0 - 2, yb - 6, W + 4, 14, 8); ctx.fill();

  // mattress + duvet
  ctx.fillStyle = '#efe6f2';
  rr(ctx, x0, yb, W, D, 16); ctx.fill();
  const duv = ctx.createLinearGradient(0, yb, 0, ye);
  duv.addColorStop(0, '#cfe3e0');
  duv.addColorStop(0.55, '#bcd9d6');
  duv.addColorStop(1, '#a9cbc8');
  ctx.fillStyle = duv;
  if (head === 'far') rr(ctx, x0 + 4, yb + D * 0.30, W - 8, D * 0.70 - 4, 16);
  else rr(ctx, x0 + W * 0.30, yb + 4, W * 0.70 - 4, D - 8, 16);
  ctx.fill();

  // quilting: a few soft seams across the duvet, warm side-light on each
  ctx.strokeStyle = 'rgba(120,160,158,0.45)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (head === 'far') {
    for (let i = 1; i < 4; i++) {
      const y = yb + D * (0.30 + 0.70 * (i / 4));
      ctx.moveTo(x0 + 16, y); ctx.lineTo(x1 - 16, y);
    }
    for (let i = 1; i < 3; i++) {
      const x = x0 + (W * i) / 3;
      ctx.moveTo(x, yb + D * 0.34); ctx.lineTo(x, ye - 10);
    }
  } else {
    for (let i = 1; i < 5; i++) {
      const x = x0 + W * (0.30 + 0.70 * (i / 5));
      ctx.moveTo(x, yb + 16); ctx.lineTo(x, ye - 16);
    }
    for (let i = 1; i < 3; i++) {
      const y = yb + (D * i) / 3;
      ctx.moveTo(x0 + W * 0.34, y); ctx.lineTo(x1 - 10, y);
    }
  }
  ctx.stroke();

  // pillows at the head end
  ctx.fillStyle = '#fbf6f2';
  if (head === 'far') {
    const ph = Math.max(46, D * 0.20);
    rr(ctx, x0 + 18, yb + 10, W * 0.44, ph, 22); ctx.fill();
    rr(ctx, x0 + W * 0.52, yb + 10, W * 0.44 - 18 + 18, ph, 22); ctx.fill();
    ctx.strokeStyle = 'rgba(190,175,170,0.5)'; ctx.lineWidth = 2.4;
    rr(ctx, x0 + 18, yb + 10, W * 0.44, ph, 22); ctx.stroke();
  } else {
    const pw = Math.max(46, W * 0.17);
    rr(ctx, x0 + 12, yb + 16, pw, D * 0.40, 22); ctx.fill();
    rr(ctx, x0 + 12, yb + D * 0.54, pw, D * 0.40, 22); ctx.fill();
    ctx.strokeStyle = 'rgba(190,175,170,0.5)'; ctx.lineWidth = 2.4;
    rr(ctx, x0 + 12, yb + 16, pw, D * 0.40, 22); ctx.stroke();
  }

  // a folded blanket across the foot, so the bed is not one flat slab
  ctx.fillStyle = '#e6b9c6';
  if (head === 'far') rr(ctx, x0 + 6, ye - D * 0.19, W - 12, D * 0.14, 12);
  else rr(ctx, x1 - W * 0.19, yb + 6, W * 0.13, D - 12, 12);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  if (head === 'far') rr(ctx, x0 + 16, ye - D * 0.185, W - 32, D * 0.045, 8);
  else rr(ctx, x1 - W * 0.185, yb + 16, W * 0.04, D - 32, 8);
  ctx.fill();

  ctx.restore();
}

/**
 * alpha 1 = solid (from out in the room you see the bed and nothing under it);
 * 0 = the camera is underneath and the bed is only a frame overhead.
 * `floor` is the alpha below which the solid image is not composited at all —
 * a full-screen drawImage costs the same at alpha 0.05 as at 1.
 */
export function drawBed(ctx, b, alpha, img, floor) {
  if (alpha > (floor === undefined ? 0.02 : floor)) {
    ctx.save();
    ctx.globalAlpha = alpha;
    if (img) ctx.drawImage(img.canvas, img.x, img.y, img.w, img.h);
    else paintBed(ctx, b, 'far');
    ctx.restore();
  }
  if (alpha < 0.85) {
    ctx.save();
    ctx.globalAlpha = (1 - alpha) * 0.40;
    ctx.strokeStyle = 'rgba(160,190,205,0.6)';
    ctx.lineWidth = 3;
    rr(ctx, b.x0, b.yBack - 8, b.x1 - b.x0, (b.yEdge - b.gap) - b.yBack + 8, 22);
    ctx.stroke();
    // the near edge stays readable: it is the line you crossed to get under here
    ctx.strokeStyle = 'rgba(130,160,190,0.75)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(b.x0 + 8, b.yEdge - b.gap - 4); ctx.lineTo(b.x1 - 8, b.yEdge - b.gap - 4);
    ctx.stroke();
    ctx.restore();
  }
}

// ------------------------------------------------------------------- skirt

/**
 * The bed skirt: a valance hanging from the frame down over the gap.
 *
 * It is the thing that HIDES the cavity, so it has to be a real surface that
 * the airflow lifts — the hem rises where the mouth is, which is both the
 * invitation (something is under there) and the door. `hem` is a Float32Array
 * of lifts (0..1) the scene keeps, one per segment, so this function does no
 * field sampling of its own.
 */
export function drawSkirt(ctx, b, hem, opts = {}) {
  const n = hem.length;
  const x0 = b.x0, x1 = b.x1, W = x1 - x0;
  const top = b.yEdge - b.gap;
  const alpha = opts.alpha === undefined ? 1 : opts.alpha;
  if (alpha <= 0.02) return;
  const t = opts.t || 0;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(x0 - 6, top - 10);
  ctx.lineTo(x1 + 6, top - 10);
  for (let i = n - 1; i >= 0; i--) {
    const u = i / (n - 1);
    const x = x0 + u * W;
    // a slow idle breath plus whatever the airflow is lifting right now
    const idle = Math.sin(t * 1.5 + u * 5.6) * 2.6 + Math.sin(t * 2.7 + u * 3.1) * 1.4;
    const y = b.yEdge + idle - hem[i] * b.gap * 0.86;
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = opts.color || '#d9c3d6';
  ctx.fill();
  // the hem band, and a shadow where the skirt meets the floor
  ctx.strokeStyle = 'rgba(150,118,146,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const x = x0 + u * W;
    const idle = Math.sin(t * 1.5 + u * 5.6) * 2.6 + Math.sin(t * 2.7 + u * 3.1) * 1.4;
    const y = b.yEdge + idle - hem[i] * b.gap * 0.86;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  // vertical pleats
  ctx.strokeStyle = 'rgba(158,126,154,0.34)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 1; i < n - 1; i += 2) {
    const u = i / (n - 1);
    const x = x0 + u * W;
    const y = b.yEdge - hem[i] * b.gap * 0.86;
    ctx.moveTo(x, top - 6); ctx.lineTo(x, y - 3);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * The dark gap under the lifted skirt — what you actually see from the lit
 * room. Drawn after the debris, so the fluff sticking out of it is
 * half-swallowed by the shadow.
 */
export function drawUnderSlot(ctx, b, hem, u) {
  const a = 1 - u * 0.88;
  if (a <= 0.02) return;
  const n = hem.length, W = b.x1 - b.x0;
  const top = b.yEdge - b.gap - 4;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.beginPath();
  ctx.moveTo(b.x0, top);
  ctx.lineTo(b.x1, top);
  for (let i = n - 1; i >= 0; i--) {
    const uu = i / (n - 1);
    ctx.lineTo(b.x0 + uu * W, b.yEdge - hem[i] * b.gap * 0.86 + 2);
  }
  ctx.closePath();
  let g = b._slotG;
  if (!g) {
    g = ctx.createLinearGradient(0, top, 0, b.yEdge + 6);
    g.addColorStop(0, 'rgba(8,6,12,0.82)');
    g.addColorStop(0.55, 'rgba(10,8,16,0.62)');
    g.addColorStop(1, 'rgba(12,10,18,0.18)');
    b._slotG = g;
  }
  ctx.fillStyle = g;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** The wall and skirting board at the far end of the cavity, painted once. */
export function makeUnderWallImage(b) {
  const H = 340;
  const w = Math.max(1, Math.round(b.x1 - b.x0) + 320);
  const h = H + 14;
  const canvas = makeCanvas(w, h);
  const g = canvas.getContext('2d');
  g.translate(-(b.x0 - 160), -(b.yBack - H));
  const W = b.x1 - b.x0;
  const grad = g.createLinearGradient(0, b.yBack - H, 0, b.yBack);
  grad.addColorStop(0, '#1d1a22');
  grad.addColorStop(0.7, '#453a44');
  grad.addColorStop(1, '#75636a');
  g.fillStyle = grad;
  g.fillRect(b.x0 - 160, b.yBack - H, W + 320, H);
  g.fillStyle = '#9a8590';
  g.fillRect(b.x0 - 160, b.yBack - 24, W + 320, 24);
  g.fillStyle = 'rgba(255,255,255,0.20)';
  g.fillRect(b.x0 - 160, b.yBack - 24, W + 320, 5);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(b.x0 - 160, b.yBack, W + 320, 12);
  return { canvas, x: b.x0 - 160, y: b.yBack - H, w, h };
}

export function drawUnderWallImage(ctx, img) {
  if (img) ctx.drawImage(img.canvas, img.x, img.y);
}

// ------------------------------------------------------------------- props

/** A bed leg: solid, the head slides around it. */
export function makeBedLeg(x, y, r) {
  return new Prop({
    x, y, shape: 'circle', r, pushable: false, shadow: false,
    data: { leg: true },
    draw(ctx) {
      ctx.save();
      ctx.fillStyle = 'rgba(10,8,14,0.45)';
      ctx.beginPath(); ctx.ellipse(this.x + 5, this.y + r * 0.7, r * 1.5, r * 0.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8a5f3a';
      ctx.beginPath();
      ctx.moveTo(this.x - r * 0.8, this.y - r * 2.4);
      ctx.lineTo(this.x + r * 0.8, this.y - r * 2.4);
      ctx.lineTo(this.x + r * 0.62, this.y + r * 0.5);
      ctx.lineTo(this.x - r * 0.62, this.y + r * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#a97b4d';
      ctx.fillRect(this.x - r * 0.8, this.y - r * 2.4, r * 0.5, r * 2.9);
      ctx.fillStyle = '#5b3d24';
      ctx.beginPath(); ctx.ellipse(this.x, this.y + r * 0.5, r * 0.72, r * 0.3, 0, 0, TAU); ctx.fill();
      ctx.restore();
    },
  });
}

/**
 * A lost slipper under the bed. Far too big and too heavy to be swallowed: the
 * flow TUGS it — the toe end lifts and the whole thing rocks and creeps toward
 * the mouth — and the head can shove it aside. `data.tug` (0..1) is set by the
 * scene from the field, exactly like the sofa's toy.
 */
export function makeSlipper(x, y, angle, rng) {
  return new Prop({
    x, y, shape: 'rect', w: 86, h: 44, angle,
    pushable: true, mass: 1.8, friction: 7, shadow: false,
    data: { slipper: true, tug: 0, seed: rng ? rng.range(0, 100) : 0 },
    draw(ctx) {
      const d = this.data;
      const tug = d.tug || 0;
      ctx.save();
      ctx.fillStyle = 'rgba(10,8,14,0.34)';
      ctx.beginPath();
      ctx.ellipse(this.x + 5, this.y + 16, 46, 15, this.angle, 0, TAU);
      ctx.fill();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      // the toe lifts and the heel stays put: a tug, not a slide
      const lift = tug * 7 + this.nudge * 3;
      ctx.rotate(-tug * 0.10);
      ctx.fillStyle = '#c86f86';
      ctx.beginPath();
      ctx.ellipse(0, 0, 43, 21, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b25f76';
      ctx.beginPath(); ctx.ellipse(18, -lift * 0.3, 24, 19, 0, 0, TAU); ctx.fill();
      // the fluffy cuff, which the airflow ruffles
      ctx.fillStyle = '#f3dfe6';
      ctx.beginPath(); ctx.ellipse(6, -2 - lift * 0.2, 17, 13, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU;
        const L = 5 + tug * 5;
        ctx.moveTo(6 + Math.cos(a) * 15, -2 + Math.sin(a) * 11);
        ctx.lineTo(6 + Math.cos(a) * (15 + L), -2 + Math.sin(a) * (11 + L * 0.8));
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.ellipse(-14, -7, 18, 8, -0.2, 0, TAU); ctx.fill();
      ctx.restore();
    },
  });
}

/** The completion sparkle: a few four-point stars on the clean boards. */
export function drawSparkle(ctx, x, y, r, a) {
  if (a <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = clamp(a, 0, 1) * 0.30;
  ctx.fillStyle = '#fff3d4';
  ctx.beginPath(); ctx.arc(x, y, r * 0.75, 0, TAU); ctx.fill();
  ctx.globalAlpha = clamp(a, 0, 1);
  ctx.fillStyle = '#fffdf6';
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + r * 0.16, y - r * 0.16, x + r, y);
  ctx.quadraticCurveTo(x + r * 0.16, y + r * 0.16, x, y + r);
  ctx.quadraticCurveTo(x - r * 0.16, y + r * 0.16, x - r, y);
  ctx.quadraticCurveTo(x - r * 0.16, y - r * 0.16, x, y - r);
  ctx.fill();
  ctx.restore();
}

/** How far under the bed a world point is (0 = out in the room, 1 = under). */
export function underness(b, x, y) {
  const inX = smoothstep(b.x0 - 8, b.x0 + 54, x) * (1 - smoothstep(b.x1 - 54, b.x1 + 8, x));
  const depth = smoothstep(b.yEdge + 8, b.yEdge - 70, y);
  return inX * depth;
}
