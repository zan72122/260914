import { Prop } from './prop.js';
import { TAU } from '../core/math.js';

/**
 * The two solid things on the balcony. Both are `pushable: false`, so the head
 * slides along them and the child has to steer round — which is the whole
 * reason they are there: a leaf tucked against the pot can only be reached from
 * one side.
 */

export function makePlantPot(x, y, opts = {}) {
  const r = opts.r || 36;
  const p = new Prop({
    x, y, shape: 'circle', r, pushable: false, shadow: false,
    draw: (ctx) => drawPot(ctx, p, r),
  });
  p.data = { seed: opts.seed || 0 };
  return p;
}

function drawPot(ctx, p, r) {
  const x = p.x, y = p.y;
  ctx.save();
  ctx.fillStyle = 'rgba(42,30,14,0.28)';
  ctx.beginPath(); ctx.ellipse(x + 7, y + r * 0.42, r * 1.12, r * 0.42, 0, 0, TAU); ctx.fill();

  // the plant, seen from slightly above: a few big leaves fanning out
  ctx.strokeStyle = '#4f7a3b';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.3;
    const L = r * (1.15 + 0.35 * Math.sin(i * 2.1));
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.5);
    ctx.quadraticCurveTo(x + Math.cos(a) * L * 0.5, y - r * 0.5 + Math.sin(a) * L * 0.34 - 12,
      x + Math.cos(a) * L, y - r * 0.5 + Math.sin(a) * L * 0.42);
    ctx.stroke();
  }
  ctx.fillStyle = '#5f8f46';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + 0.3;
    const L = r * (1.15 + 0.35 * Math.sin(i * 2.1));
    ctx.save();
    ctx.translate(x + Math.cos(a) * L, y - r * 0.5 + Math.sin(a) * L * 0.42);
    ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.34, r * 0.17, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // the pot itself: a tapering terracotta cylinder with a rim
  ctx.fillStyle = '#b5673f';
  ctx.beginPath();
  ctx.moveTo(x - r, y - r * 0.28);
  ctx.lineTo(x + r, y - r * 0.28);
  ctx.lineTo(x + r * 0.78, y + r * 0.5);
  ctx.quadraticCurveTo(x, y + r * 0.78, x - r * 0.78, y + r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.moveTo(x + r * 0.42, y - r * 0.28);
  ctx.lineTo(x + r, y - r * 0.28);
  ctx.lineTo(x + r * 0.78, y + r * 0.5);
  ctx.quadraticCurveTo(x + r * 0.5, y + r * 0.66, x + r * 0.42, y + r * 0.6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c87a4d';
  ctx.beginPath(); ctx.ellipse(x, y - r * 0.28, r, r * 0.34, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#4a3323';
  ctx.beginPath(); ctx.ellipse(x, y - r * 0.28, r * 0.82, r * 0.25, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.ellipse(x - r * 0.3, y + r * 0.1, r * 0.16, r * 0.3, 0.2, 0, TAU); ctx.fill();
  ctx.restore();
}

export function makeWateringCan(x, y, opts = {}) {
  const w = opts.w || 78, h = opts.h || 54;
  const p = new Prop({
    x, y, shape: 'rect', w, h, pushable: false, shadow: false,
    draw: (ctx) => drawCan(ctx, p, w, h, opts.flip ? -1 : 1),
  });
  return p;
}

function drawCan(ctx, p, w, h, s) {
  const x = p.x, y = p.y;
  ctx.save();
  ctx.fillStyle = 'rgba(42,30,14,0.26)';
  ctx.beginPath(); ctx.ellipse(x + 6, y + h * 0.48, w * 0.62, h * 0.3, 0, 0, TAU); ctx.fill();
  ctx.translate(x, y);
  ctx.scale(s, 1);
  // body
  ctx.fillStyle = '#5c8f86';
  ctx.beginPath();
  ctx.moveTo(-w * 0.34, -h * 0.5);
  ctx.lineTo(w * 0.2, -h * 0.5);
  ctx.lineTo(w * 0.24, h * 0.42);
  ctx.lineTo(-w * 0.38, h * 0.42);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-w * 0.30, -h * 0.46, w * 0.13, h * 0.84);
  // spout
  ctx.strokeStyle = '#4d7d75';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(w * 0.2, h * 0.1);
  ctx.quadraticCurveTo(w * 0.5, h * 0.0, w * 0.56, -h * 0.34);
  ctx.stroke();
  ctx.fillStyle = '#6ea59b';
  ctx.beginPath(); ctx.ellipse(w * 0.57, -h * 0.38, 9, 6, -0.4, 0, TAU); ctx.fill();
  // handle
  ctx.strokeStyle = '#4d7d75';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-w * 0.3, -h * 0.5);
  ctx.quadraticCurveTo(-w * 0.1, -h * 1.0, w * 0.12, -h * 0.5);
  ctx.stroke();
  ctx.fillStyle = '#74aba1';
  ctx.beginPath(); ctx.ellipse(-w * 0.07, -h * 0.5, w * 0.27, h * 0.1, 0, 0, TAU); ctx.fill();
  ctx.restore();
}
