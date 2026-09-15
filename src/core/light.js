import { TAU, clamp } from './math.js';
import { makeCanvas } from '../floors/floor.js';

/**
 * Darkness overlay with cut-out lights (one half-resolution offscreen canvas).
 *
 * Usage from a scene:
 *   this.light = new LightLayer();          // in the constructor
 *   this.light.setDark(0.86);               // in layout()
 *   // main.js calls begin()/composite() around the scene's lights() hook
 *   lights(L, cam, vac) { L.addLight(sx, sy, 180, 1); }
 *
 * The vacuum's headlight is added automatically when `vac.headlight.on`.
 * Everything here is in SCREEN coordinates.
 */
export class LightLayer {
  constructor() {
    this.dark = 0.85;
    this.w = 1; this.h = 1; this.sw = 1; this.sh = 1;
    this.canvas = null; this.ctx = null;
    this.scale = 0.5;
  }
  setDark(a) { this.dark = clamp(a, 0, 1); }

  setViewport(w, h) {
    const sw = Math.max(1, Math.round(w * this.scale));
    const sh = Math.max(1, Math.round(h * this.scale));
    if (sw === this.sw && sh === this.sh && this.canvas) { this.w = w; this.h = h; return; }
    this.w = w; this.h = h; this.sw = sw; this.sh = sh;
    this.canvas = makeCanvas(sw, sh);
    this.ctx = this.canvas.getContext('2d');
  }

  begin() {
    if (!this.ctx) return;
    const g = this.ctx;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, this.sw, this.sh);
    g.fillStyle = 'rgba(6,8,16,1)';
    g.globalAlpha = this.dark;
    g.fillRect(0, 0, this.sw, this.sh);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-out';
  }

  /**
   * Cut a light out of the darkness.
   * cone: 1 =全方向, 0.3 = a narrow wedge around (dirX,dirY).
   */
  addLight(sx, sy, r, intensity = 1, dirX = 0, dirY = 0, cone = 1) {
    if (!this.ctx) return;
    const g = this.ctx;
    const s = this.scale;
    const x = sx * s, y = sy * s, rr = Math.max(2, r * s);
    g.save();
    if (cone < 0.999 && (dirX || dirY)) {
      const a = Math.atan2(dirY, dirX);
      const half = Math.PI * clamp(cone, 0.05, 1);
      g.beginPath();
      g.moveTo(x, y);
      g.arc(x, y, rr, a - half, a + half);
      g.closePath();
      g.clip();
    }
    const grad = g.createRadialGradient(x, y, 0, x, y, rr);
    const i = clamp(intensity, 0, 1);
    grad.addColorStop(0, 'rgba(0,0,0,' + i + ')');
    grad.addColorStop(0.55, 'rgba(0,0,0,' + (i * 0.7).toFixed(3) + ')');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
    g.restore();
  }

  /** The vacuum's own cone light, thrown forward from the mouth. */
  addHeadlight(vac, cam) {
    const hl = vac.headlight;
    if (!hl || !hl.on || !this.ctx) return;
    const p = { x: 0, y: 0 };
    cam.toScreen(vac.mouthX, vac.mouthY, p);
    const d = { x: 0, y: 0 }, o = { x: 0, y: 0 };
    cam.toScreen(vac.mouthX + vac.dirX, vac.mouthY + vac.dirY, d);
    cam.toScreen(vac.mouthX, vac.mouthY, o);
    const dx = d.x - o.x, dy = d.y - o.y;
    const l = Math.hypot(dx, dy) || 1;
    const r = hl.r * cam.zoom;
    this.addLight(p.x + (dx / l) * r * 0.32, p.y + (dy / l) * r * 0.32, r,
      hl.intensity * (0.65 + 0.35 * vac.powerN), dx / l, dy / l, hl.cone);
  }

  composite(ctx) {
    if (!this.ctx) return;
    this.ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.canvas, 0, 0, this.w, this.h);
  }
}
