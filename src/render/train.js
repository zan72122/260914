// Locomotive, wagons and the dogs riding in them. Top-down cartoon style, drawn with paths only.
import { roundRect } from './board.js';

export const CAR_COLORS = {
  1: { main: '#e8503a', dark: '#b23524', tag: 'circle' },
  2: { main: '#3a7be8', dark: '#255bb5', tag: 'square' },
  3: { main: '#f2c230', dark: '#c4961a', tag: 'triangle' },
};
const OUTLINE = '#3a2e2a';

// Small coloured shape tag: colour + shape double-code the coupling order.
export function drawTag(ctx, x, y, r, color, alpha = 1) {
  const col = CAR_COLORS[color];
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.fillStyle = col.main; ctx.strokeStyle = OUTLINE; ctx.lineWidth = Math.max(1, r * 0.22);
  ctx.beginPath();
  if (col.tag === 'circle') ctx.arc(0, 0, r, 0, Math.PI * 2);
  else if (col.tag === 'square') ctx.rect(-r * 0.9, -r * 0.9, r * 1.8, r * 1.8);
  else { ctx.moveTo(0, -r * 1.05); ctx.lineTo(r * 1.0, r * 0.8); ctx.lineTo(-r * 1.0, r * 0.8); ctx.closePath(); }
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

// opts: { bob (0..1 scale), press (0..1), tags: [{color, done}], nextColor, time }
export function drawLoco(ctx, x, y, ang, cs, opts = {}) {
  const t = opts.time || 0;
  const s = 1 + (opts.bob || 0) * 0.06 * Math.sin(t * 6) - (opts.press || 0) * 0.12;
  ctx.save();
  ctx.translate(x, y);
  // shadow (not rotated)
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(cs * 0.03, cs * 0.12, cs * 0.42, cs * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(ang);
  ctx.scale(s, s);
  const L = cs * 0.84, W = cs * 0.5;
  ctx.lineWidth = Math.max(1.5, cs * 0.045); ctx.strokeStyle = OUTLINE; ctx.lineJoin = 'round';
  // wheels
  ctx.fillStyle = '#2e2e33';
  for (const side of [-1, 1]) for (const k of [-0.28, -0.02, 0.24]) {
    roundRect(ctx, L * k - cs * 0.07, side * W * 0.5 - cs * 0.04, cs * 0.14, cs * 0.08, cs * 0.02); ctx.fill();
  }
  // chassis
  ctx.fillStyle = '#5a4a44';
  roundRect(ctx, -L / 2, -W / 2, L, W, cs * 0.06); ctx.fill(); ctx.stroke();
  // boiler (front 60%)
  ctx.fillStyle = '#4f8bd6';
  roundRect(ctx, -L * 0.18, -W * 0.36, L * 0.66, W * 0.72, W * 0.36); ctx.fill(); ctx.stroke();
  // cab (rear)
  ctx.fillStyle = '#e9534a';
  roundRect(ctx, -L / 2 + cs * 0.02, -W * 0.46, L * 0.34, W * 0.92, cs * 0.05); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffd86b';
  roundRect(ctx, -L / 2 + cs * 0.08, -W * 0.3, L * 0.22, W * 0.6, cs * 0.03); ctx.fill();
  // chimney
  ctx.fillStyle = '#2e2e33';
  ctx.beginPath(); ctx.arc(L * 0.3, 0, cs * 0.1, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1a1a1e';
  ctx.beginPath(); ctx.arc(L * 0.3, 0, cs * 0.05, 0, Math.PI * 2); ctx.fill();
  // headlight
  ctx.fillStyle = '#fff3b0';
  ctx.beginPath(); ctx.arc(L * 0.47, 0, cs * 0.06, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // coupling hook at the back
  ctx.fillStyle = '#2e2e33';
  roundRect(ctx, -L / 2 - cs * 0.08, -cs * 0.04, cs * 0.1, cs * 0.08, cs * 0.02); ctx.fill();
  ctx.restore();
  // order tags: hanging off the back of the loco, in the direction wagons will come from
  if (opts.tags && opts.tags.length) {
    const bx = -Math.cos(ang), by = -Math.sin(ang);
    const px = -by, py = bx;
    const n = opts.tags.length;
    opts.tags.forEach((tag, i) => {
      if (tag.done) return;
      const off = (i - (n - 1) / 2) * cs * 0.2;
      const isNext = tag.color === opts.nextColor;
      const hop = isNext ? Math.abs(Math.sin(t * 5)) * cs * 0.05 : 0;
      const tx = x + bx * (cs * 0.36) + px * off, ty = y + by * (cs * 0.36) + py * off - hop;
      drawTag(ctx, tx, ty, cs * 0.075 * (isNext ? 1.25 : 1), tag.color, isNext ? 1 : 0.6);
    });
  }
}

// mood: 'normal' | 'surprised' | 'joy'
export function drawCar(ctx, x, y, ang, cs, color, mood = 'normal', time = 0) {
  const col = CAR_COLORS[color];
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath(); ctx.ellipse(cs * 0.03, cs * 0.12, cs * 0.38, cs * 0.28, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(ang);
  const L = cs * 0.74, W = cs * 0.5;
  ctx.lineWidth = Math.max(1.5, cs * 0.045); ctx.strokeStyle = OUTLINE; ctx.lineJoin = 'round';
  ctx.fillStyle = '#2e2e33';
  for (const side of [-1, 1]) for (const k of [-0.26, 0.26]) {
    roundRect(ctx, L * k - cs * 0.07, side * W * 0.5 - cs * 0.04, cs * 0.14, cs * 0.08, cs * 0.02); ctx.fill();
  }
  // hooks both ends
  roundRect(ctx, -L / 2 - cs * 0.07, -cs * 0.035, cs * 0.09, cs * 0.07, cs * 0.02); ctx.fill();
  roundRect(ctx, L / 2 - cs * 0.02, -cs * 0.035, cs * 0.09, cs * 0.07, cs * 0.02); ctx.fill();
  // body
  ctx.fillStyle = col.main;
  roundRect(ctx, -L / 2, -W / 2, L, W, cs * 0.08); ctx.fill(); ctx.stroke();
  ctx.fillStyle = col.dark;
  roundRect(ctx, -L / 2 + cs * 0.05, -W / 2 + cs * 0.05, L - cs * 0.1, W - cs * 0.1, cs * 0.06); ctx.fill();
  // dog (seen from above, looking up at the player)
  ctx.rotate(-ang); // keep the face upright regardless of travel direction
  drawDog(ctx, 0, 0, cs * 0.2, mood, time);
  ctx.restore();
  // roof tag (rotated back to screen space)
  drawTag(ctx, x + Math.cos(ang) * cs * 0.24, y + Math.sin(ang) * cs * 0.24, cs * 0.06, color);
}

export function drawDog(ctx, x, y, r, mood = 'normal', time = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1.2, r * 0.18); ctx.strokeStyle = OUTLINE;
  const earUp = mood === 'surprised' ? -r * 0.5 : 0;
  const wag = mood === 'joy' ? Math.sin(time * 14) * 0.5 : 0;
  // ears
  ctx.fillStyle = '#8b5a2b';
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * r * 0.85, -r * 0.15 + earUp);
    ctx.rotate(side * (0.4 + wag * 0.2));
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.32, r * 0.62, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // head
  ctx.fillStyle = '#f5d9a8';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // eyes
  ctx.fillStyle = OUTLINE;
  if (mood === 'joy') {
    ctx.beginPath(); ctx.arc(-r * 0.38, -r * 0.1, r * 0.2, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(r * 0.38, -r * 0.1, r * 0.2, Math.PI, 0); ctx.stroke();
  } else {
    const er = mood === 'surprised' ? r * 0.2 : r * 0.13;
    ctx.beginPath(); ctx.arc(-r * 0.38, -r * 0.12, er, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.38, -r * 0.12, er, 0, Math.PI * 2); ctx.fill();
    if (mood === 'surprised') {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.18, r * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.44, -r * 0.18, r * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = OUTLINE;
    }
  }
  // nose + mouth
  ctx.beginPath(); ctx.ellipse(0, r * 0.32, r * 0.22, r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  if (mood === 'surprised') {
    ctx.beginPath(); ctx.arc(0, r * 0.62, r * 0.14, 0, Math.PI * 2); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(-r * 0.16, r * 0.5, r * 0.16, 0, Math.PI * 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(r * 0.16, r * 0.5, r * 0.16, Math.PI * 0.1, Math.PI); ctx.stroke();
  }
  ctx.restore();
}
