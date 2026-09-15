/**
 * diorama.js — the mini-world "snow globes" (DESIGN §1.7 shelf, §3 spectroscope world icon).
 *
 * Shared by the hearth shelf and by the spectroscope scene, so the picture a child sees under
 * a spectrum is EXACTLY the picture on the shelf. Self-contained and stateless: pass the element
 * definition, a position, a radius and your own clock.
 *
 *   import { drawDiorama } from '../core/diorama.js';
 *   drawDiorama(g, ELEMENT_BY_ID.lithium, x, y, r, alpha, seconds);
 *
 * Stroke widths are clamped in SCREEN pixels so the art survives being drawn at any radius
 * (the hearth's return animation scales it up over the whole screen).
 */

import { fillRoundRect, glowCircle, withAlpha, shade } from './draw.js';

/**
 * Mini-diorama for a returned world — drawn on the hearth shelf and reused by the
 * spectroscope scene (§3 "world icon" hook). Self-contained: pass your own clock.
 * @param {CanvasRenderingContext2D} g
 * @param {Object} def   an ELEMENTS entry
 * @param {number} x @param {number} y @param {number} r
 * @param {number} [alpha=1] @param {number} [time=0] seconds, drives the animation
 */
export function drawDiorama(g, def, x, y, r, alpha = 1, time = 0) {
  // §新-1: at shelf size r is ~35px, but the hearth's return animation draws this same art
  // across the whole screen. Widths are therefore clamped in SCREEN px so nothing ever turns
  // into fat bars.
  const lw = (k, max = 4) => Math.max(0.6, Math.min(r * k, max));
  g.save();
  g.globalAlpha = alpha;
  // a filled slot glows in its own element colour — this is the collection hook (§1.7)
  glowCircle(g, x, y, r * 2.0, def.glowColor, 0.5 * alpha);
  glowCircle(g, x, y + r * 0.72, r * 0.9, def.flameColor, 0.3 * alpha);   // light spilling on the ledge
  g.fillStyle = withAlpha('#0b0810', 0.85);
  g.beginPath();
  g.ellipse(x, y, r, r * 0.86, 0, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.beginPath();
  g.ellipse(x, y, r * 0.98, r * 0.84, 0, 0, Math.PI * 2);
  g.clip();
  const k = time;
  switch (def.id) {
    case 'lithium': {
      // a rover keeps driving across the dune, headlight first
      g.fillStyle = withAlpha('#c9a27a', 0.45);
      g.beginPath();
      g.moveTo(x - r, y + r * 0.72);
      g.quadraticCurveTo(x, y + r * 0.26, x + r, y + r * 0.62);
      g.lineTo(x + r, y + r);
      g.lineTo(x - r, y + r);
      g.closePath();
      g.fill();
      const px = x - r * 0.78 + ((k * 0.3) % 1) * r * 1.56;
      const py = y + r * 0.28;
      // headlight beam
      g.fillStyle = withAlpha('#ffd9a0', 0.30);
      g.beginPath();
      g.moveTo(px + r * 0.3, py - r * 0.06);
      g.lineTo(px + r * 1.15, py - r * 0.34);
      g.lineTo(px + r * 1.15, py + r * 0.30);
      g.closePath();
      g.fill();
      // body + sensor mast
      g.fillStyle = shade(def.flameColor, 0.9);
      fillRoundRect(g, px - r * 0.42, py - r * 0.30, r * 0.84, r * 0.34, r * 0.12);
      g.fillStyle = withAlpha('#5d4a52', 0.95);
      fillRoundRect(g, px - r * 0.06, py - r * 0.56, r * 0.12, r * 0.28, r * 0.05);
      g.fillStyle = def.glowColor;
      g.beginPath(); g.arc(px + r * 0.02, py - r * 0.58, r * 0.09, 0, Math.PI * 2); g.fill();
      // three wheels
      g.fillStyle = '#2b2026';
      for (const o of [-0.34, 0, 0.34]) {
        g.beginPath(); g.arc(px + r * o, py + r * 0.10, r * 0.13, 0, Math.PI * 2); g.fill();
      }
      glowCircle(g, px + r * 0.44, py - r * 0.12, r * 0.34, '#ffd9a0', 0.85);
      break;
    }
    case 'copper': {
      // lit windows on a dark town, and a little train running along the line
      g.strokeStyle = withAlpha(def.flameColor, 0.5);
      g.lineWidth = lw(0.05, 3);
      g.beginPath(); g.moveTo(x - r, y + r * 0.52); g.lineTo(x + r, y + r * 0.52); g.stroke();
      for (let i = 0; i < 4; i++) {
        const wx = x - r * 0.66 + i * r * 0.44;
        const hgt = r * (0.42 + (i % 2) * 0.24);
        g.fillStyle = withAlpha('#0e1a20', 0.95);
        fillRoundRect(g, wx - r * 0.16, y + r * 0.5 - hgt, r * 0.32, hgt, r * 0.05);
        for (let j = 0; j < 2; j++) {
          const on = (Math.sin(k * 2.1 + i * 1.7 + j * 2.3) + 1) / 2;
          g.fillStyle = withAlpha(def.flameColor, 0.22 + on * 0.78);
          fillRoundRect(g, wx - r * 0.08, y + r * 0.34 - hgt * 0.55 + j * r * 0.20, r * 0.16, r * 0.12, r * 0.03);
        }
      }
      const tx = x - r * 0.95 + ((k * 0.34) % 1) * r * 1.9;
      g.fillStyle = def.glowColor;
      fillRoundRect(g, tx - r * 0.22, y + r * 0.34, r * 0.44, r * 0.16, r * 0.06);
      g.fillStyle = withAlpha('#0b1416', 0.8);
      fillRoundRect(g, tx - r * 0.10, y + r * 0.37, r * 0.08, r * 0.08, r * 0.02);
      glowCircle(g, tx + r * 0.26, y + r * 0.42, r * 0.26, def.flameColor, 0.9);
      break;
    }
    case 'sodium': {
      // a lamp post throwing a yellow cone onto wet ground
      g.strokeStyle = withAlpha('#4a4030', 0.95);
      g.lineWidth = lw(0.10, 6);
      g.beginPath(); g.moveTo(x + r * 0.05, y + r * 0.72); g.lineTo(x + r * 0.05, y - r * 0.18); g.stroke();
      g.beginPath(); g.moveTo(x + r * 0.05, y - r * 0.18); g.quadraticCurveTo(x - r * 0.1, y - r * 0.34, x - r * 0.28, y - r * 0.30); g.stroke();
      const on = 0.72 + 0.28 * Math.sin(k * 1.6);
      // light cone
      g.fillStyle = withAlpha(def.flameColor, 0.16 + 0.16 * on);
      g.beginPath();
      g.moveTo(x - r * 0.28, y - r * 0.24);
      g.lineTo(x - r * 0.86, y + r * 0.78);
      g.lineTo(x + r * 0.32, y + r * 0.78);
      g.closePath();
      g.fill();
      g.fillStyle = withAlpha(def.flameColor, 0.22 + 0.2 * on);
      g.beginPath(); g.ellipse(x - r * 0.28, y + r * 0.76, r * 0.58, r * 0.12, 0, 0, Math.PI * 2); g.fill();
      glowCircle(g, x - r * 0.28, y - r * 0.24, r * 0.62, def.flameColor, 0.6 + on * 0.5);
      break;
    }
    case 'strontium': {        // two phase-offset shells: drooping arms, the slot is never empty
      for (let b = 0; b < 2; b++) {
        const ph = ((k * 0.5) + b * 0.5) % 1;
        const fade = Math.max(0, 1 - ph);
        const rr = r * 0.16 + ph * r * 0.72;
        g.strokeStyle = withAlpha(def.flameColor, fade * 0.95);
        g.lineWidth = lw(0.075, 5);
        g.lineCap = 'round';
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + b * 0.31;
          const droop = ph * ph * r * 0.42;               // the arms fall as the shell opens
          g.beginPath();
          g.moveTo(x + Math.cos(a) * rr * 0.42, y + Math.sin(a) * rr * 0.42 + droop * 0.25);
          g.quadraticCurveTo(
            x + Math.cos(a) * rr * 0.8, y + Math.sin(a) * rr * 0.8 + droop * 0.5,
            x + Math.cos(a) * rr, y + Math.sin(a) * rr + droop
          );
          g.stroke();
        }
        glowCircle(g, x, y, r * 0.42 * fade, def.glowColor, 0.85 * fade);
      }
      break;
    }
    default: {
      // barium: a wide, low green curtain spreading sideways over the ground
      for (let j = 0; j < 2; j++) {
        const ph = ((k * 0.4) + j * 0.5) % 1;
        g.strokeStyle = withAlpha(def.flameColor, (1 - ph) * 0.8);
        g.lineWidth = lw(0.07, 4.5);
        g.beginPath();
        g.ellipse(x, y + r * 0.42, r * ph, r * 0.34 * ph, 0, 0, Math.PI * 2);
        g.stroke();
      }
      const spread = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(k * 0.9));
      g.fillStyle = withAlpha(def.flameColor, 0.32);
      g.beginPath();
      g.moveTo(x - r * spread, y - r * 0.10);
      g.quadraticCurveTo(x, y - r * 0.62 * spread, x + r * spread, y - r * 0.10);
      g.quadraticCurveTo(x, y + r * 0.10, x - r * spread, y - r * 0.10);
      g.closePath();
      g.fill();
      for (let i = -3; i <= 3; i++) {                     // the curtain's falling strands
        const sx = x + i * r * 0.26 * spread;
        g.strokeStyle = withAlpha(def.glowColor, 0.45);
        g.lineWidth = lw(0.045, 3);
        g.beginPath();
        g.moveTo(sx, y - r * 0.24 * spread);
        g.lineTo(sx, y + r * 0.10 * spread);
        g.stroke();
      }
      glowCircle(g, x, y - r * 0.15, r * 0.7, def.glowColor, 0.45);
      break;
    }
  }
  g.restore();
  // coloured rim + glass highlight
  g.strokeStyle = withAlpha(def.flameColor, 0.75);
  g.lineWidth = lw(0.09, 5);
  g.beginPath();
  g.ellipse(x, y, r, r * 0.86, 0, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = withAlpha('#ffffff', 0.28);
  g.lineWidth = lw(0.06, 3.5);
  g.beginPath();
  g.ellipse(x, y, r * 0.93, r * 0.80, 0, Math.PI * 1.15, Math.PI * 1.75);
  g.stroke();
  g.restore();
}
