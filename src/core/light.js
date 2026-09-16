import { TAU, clamp, smoothstep } from './math.js';
import { makeCanvas } from '../floors/floor.js';

/**
 * Darkness overlay with cut-out lights, plus an optional warm GLOW pass.
 *
 * Usage from a scene:
 *   this.light = new LightLayer();          // in the constructor
 *   this.light.setDark(0.86);               // in layout()
 *   // main.js calls begin()/composite() around the scene's lights() hook
 *   lights(L, cam, vac) { L.addLight(sx, sy, 180, 1); }
 *
 * The vacuum's headlight is added automatically when `vac.headlight.on`.
 * Everything here is in SCREEN coordinates.
 *
 * ONE offscreen layer at `scale` resolution, composited with ONE drawImage,
 * built in two passes:
 *
 *  1. darkness — a flat dark fill with the lights punched out of it
 *     (`destination-out`). A cut-out can only ever reveal the scene as it was
 *     painted, so on its own a "beam" is just less dark: grey, never bright.
 *  2. glow — warm paint laid back into the holes (addGlow / addSpark), which
 *     is what makes a torch beam read as a beam: a warm wash along the cone, a
 *     bright pool at the mouth, and a lit speck for every dust mote in it.
 *     Those calls are QUEUED and replayed at composite() time, because a cut
 *     issued after them would erase them.
 *
 * A scene that never calls addGlow()/addSpark() pays nothing for the second
 * pass, and a frame with no darkness AND no warm paint skips the composite
 * altogether.
 *
 * No gradient is created per frame: a radial gradient is built once per radius
 * with its stops at full alpha, cached, and drawn translated to the light's
 * position with `globalAlpha` carrying the intensity. Before, a soft cone was
 * four `createRadialGradient` calls EVERY frame, times every light in the
 * scene.
 */
export class LightLayer {
  constructor() {
    this.dark = 0.85;
    this.w = 1; this.h = 1; this.sw = 1; this.sh = 1;
    this.canvas = null; this.ctx = null;
    this.scale = 0.5;
    /**
     * Upscale the layer with nearest-neighbour instead of bilinear.
     *
     * The layer is one full-screen composite, and on a soft rasteriser the
     * BILINEAR FILTER of that one blit measured 5.8ms a frame on an
     * iPhone-sized canvas — a third of the whole 60fps budget, spent on
     * smoothing an image that is nothing but soft gradients anyway. Nearest
     * costs almost nothing and the difference is a 2px shimmer you have to go
     * looking for. Set `smooth = true` if a layer ever holds a hard edge.
     */
    this.smooth = false;
    this.darkColor = '6,8,16';
    this.glowColor = '255,206,142';
    // queued warm paints, replayed at composite() time (see addGlow)
    this._q = [];
    this._qn = 0;
    this._skip = false;
    this._gradDark = new Map();
    this._gradGlow = new Map();
  }
  setDark(a) { this.dark = clamp(a, 0, 1); }

  setViewport(w, h) {
    const sw = Math.max(1, Math.round(w * this.scale));
    const sh = Math.max(1, Math.round(h * this.scale));
    if (sw === this.sw && sh === this.sh && this.canvas) { this.w = w; this.h = h; return; }
    this.w = w; this.h = h; this.sw = sw; this.sh = sh;
    this.canvas = makeCanvas(sw, sh);
    this.ctx = this.canvas.getContext('2d');
    this._gradDark.clear(); this._gradGlow.clear();
  }

  begin() {
    if (!this.ctx) return;
    const g = this.ctx;
    // 'copy' REPLACES the layer, so the fill is also the clear: one full-layer
    // pass per frame instead of clearRect + fill
    g.globalCompositeOperation = 'copy';
    g.fillStyle = 'rgba(' + this.darkColor + ',' + this.dark.toFixed(3) + ')';
    g.fillRect(0, 0, this.sw, this.sh);
    g.globalCompositeOperation = 'destination-out';
    this._qn = 0;
    // a layer with no darkness in it and nothing warm queued is a full-screen
    // composite of nothing at all, which on a soft rasteriser is one of the
    // most expensive things in the frame
    this._skip = this.dark <= 0.003;
  }

  /**
   * Cut a light out of the darkness.
   *   cone      1 = all round, 0.3 = a narrow wedge around (dirX,dirY)
   *   softness  0 = a hard pie slice (cheap), 1 = a torch beam with spill,
   *             built from overlapping blobs along the axis (see _beam), so it
   *             has no cut edge anywhere.
   */
  addLight(sx, sy, r, intensity = 1, dirX = 0, dirY = 0, cone = 1, softness = 0) {
    this._spread(this.ctx, this._gradDark, '0,0,0', sx, sy, r, intensity, dirX, dirY, cone, softness);
  }

  /**
   * Warm light ADDED on top of everything, in the same cone geometry as
   * addLight. This is the half that makes a beam look lit rather than merely
   * less dark; pass the same numbers as the matching addLight, at a lower
   * intensity.
   */
  addGlow(sx, sy, r, intensity = 1, dirX = 0, dirY = 0, cone = 1, softness = 0, color) {
    this._queue(sx, sy, r, intensity, dirX, dirY, cone, softness, color, false);
  }

  /** A single lit speck (a dust mote in the beam), in screen coords. */
  addSpark(sx, sy, r, intensity = 1, color) {
    this._queue(sx, sy, r, intensity, 0, 0, 1, 0, color, true);
  }

  /**
   * Warm paints cannot go straight onto the layer: a later `destination-out`
   * cut would erase them. They are queued here and replayed onto the SAME
   * canvas once every cut is in, so the darkness and the light it leaves
   * behind still reach the screen as ONE composite. The alternative — a second
   * full-screen layer blended with `lighter` — measured 8ms a frame on an
   * iPhone-sized canvas, which is half the entire 60fps budget.
   */
  _queue(sx, sy, r, i, dirX, dirY, cone, softness, color, spark) {
    if (!this.ctx || i <= 0.004) return;
    const q = this._q[this._qn] || (this._q[this._qn] = {});
    q.x = sx; q.y = sy; q.r = r; q.i = i;
    q.dx = dirX; q.dy = dirY; q.cone = cone; q.soft = softness;
    q.color = color || this.glowColor; q.spark = spark;
    this._qn++;
  }

  _spread(g, cache, color, sx, sy, r, intensity, dirX, dirY, cone, softness) {
    if (!g) return;
    const i = clamp(intensity, 0, 1);
    if (i <= 0.002) return;
    const coned = cone < 0.999 && (dirX || dirY);
    const soft = clamp(softness, 0, 1);
    if (!coned || soft <= 0.01) {
      this._cone(g, cache, color, sx, sy, r, i, dirX, dirY, coned ? cone : 1);
      return;
    }
    this._beam(g, cache, color, sx, sy, r, i, dirX, dirY, cone, soft);
  }

  /**
   * A soft torch beam: blobs threaded along the axis, each wider and weaker
   * than the last, plus a pool at the origin.
   *
   * It used to be three nested CLIPPED wedges. A clipped wedge has a hard edge
   * however faint it is, so three of them gave the beam three visible straight
   * edges — and a clip is one of the most expensive things you can ask a
   * software rasteriser for. Overlapping circles have no edge to cut, and the
   * alpha of the overlaps builds the bright core for free.
   */
  _beam(g, cache, color, sx, sy, r, i, dirX, dirY, cone, soft) {
    const l = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / l, uy = dirY / l;
    const half = Math.PI * clamp(cone, 0.05, 1) * (0.55 + 0.35 * soft);
    const tan = Math.tan(clamp(half, 0.08, 1.2));
    const N = 6;
    for (let k = 0; k < N; k++) {
      const t = (k + 0.55) / N;
      const d = r * t;
      const rad = Math.max(r * 0.15, d * tan * 1.15);
      // ramp in, then fall off: a hot spot right at the origin would flare
      // over the head instead of pooling on the floor in front of it
      const w = (0.42 + 0.58 * smoothstep(0, 0.38, t)) * (1 - t * 0.85);
      this._blob(g, cache, color, sx + ux * d, sy + uy * d, rad, i * w * 0.78);
    }
    this._blob(g, cache, color, sx, sy, r * 0.26, i * 0.7);      // the pool at the mouth
  }

  _blob(g, cache, color, sx, sy, r, i) {
    if (i <= 0.003) return;
    const s = this.scale;
    const rr = Math.max(2, r * s);
    if (this._off(sx * s, sy * s, rr)) return;
    g.globalAlpha = clamp(i, 0, 1);
    g.fillStyle = this._grad(g, cache, color, rr);
    g.save();
    g.translate(sx * s, sy * s);
    g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.fill();
    g.restore();
    g.globalAlpha = 1;
  }

  _cone(g, cache, color, sx, sy, r, i, dirX, dirY, cone) {
    const s = this.scale;
    const rr = Math.max(2, r * s);
    if (this._off(sx * s, sy * s, rr)) return;
    g.save();
    g.translate(sx * s, sy * s);
    if (cone < 0.999 && (dirX || dirY)) {
      const a = Math.atan2(dirY, dirX);
      const half = Math.PI * clamp(cone, 0.05, 1);
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, rr, a - half, a + half);
      g.closePath();
      g.clip();
    }
    g.globalAlpha = i;
    g.fillStyle = this._grad(g, cache, color, rr);
    g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.fill();
    g.globalAlpha = 1;
    g.restore();
  }

  /** Entirely off the layer: a light behind the camera still costs a fill. */
  _off(x, y, rr) { return x + rr < 0 || y + rr < 0 || x - rr > this.sw || y - rr > this.sh; }

  /**
   * A radial gradient at the ORIGIN, full alpha, cached by radius: the caller
   * translates to the light and carries the intensity in globalAlpha, so the
   * same object serves every frame and every brightness.
   */
  _grad(g, cache, color, rr) {
    const key = (rr | 0) + '@' + color;
    let grad = cache.get(key);
    if (!grad) {
      grad = g.createRadialGradient(0, 0, 0, 0, 0, rr | 0 || 1);
      grad.addColorStop(0, 'rgba(' + color + ',1)');
      grad.addColorStop(0.55, 'rgba(' + color + ',0.7)');
      grad.addColorStop(1, 'rgba(' + color + ',0)');
      if (cache.size > 160) cache.clear();
      cache.set(key, grad);
    }
    return grad;
  }

  /**
   * The vacuum's own cone light, thrown forward from the mouth. When
   * `headlight.warm` is set the same cone is also added to the glow layer, so
   * the beam is warm and bright rather than merely a hole in the dark.
   */
  addHeadlight(vac, cam) {
    const hl = vac.headlight;
    if (!hl || !hl.on || !this.ctx) return;
    const p = TMPA, d = TMPB, o = TMPC;
    cam.toScreen(vac.mouthX, vac.mouthY, p);
    cam.toScreen(vac.mouthX + vac.dirX, vac.mouthY + vac.dirY, d);
    cam.toScreen(vac.mouthX, vac.mouthY, o);
    const dx = d.x - o.x, dy = d.y - o.y;
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l, uy = dy / l;
    const inten = hl.intensity * (0.65 + 0.35 * vac.powerN);
    const soft = hl.softness === undefined ? 0 : hl.softness;
    // a soft beam is thrown FROM the mouth; a hard cone is still centred a
    // third of the way along, the way it always was
    const r = hl.r * cam.zoom * (soft > 0.01 ? 1.15 : 1);
    const ox = soft > 0.01 ? p.x : p.x + ux * r * 0.32;
    const oy = soft > 0.01 ? p.y : p.y + uy * r * 0.32;
    this.addLight(ox, oy, r, inten, ux, uy, hl.cone, soft);
    if (hl.warm) {
      // the warm half: the beam itself, then a bright pool right at the mouth,
      // which is where the child is looking
      this.addGlow(ox, oy, r, inten * hl.warm, ux, uy, hl.cone, soft);
      this.addGlow(p.x + ux * r * 0.10, p.y + uy * r * 0.10, r * 0.26,
        inten * hl.warm * 0.52, 0, 0, 1, 0);
    }
  }

  composite(ctx) {
    if (!this.ctx) return;
    const g = this.ctx;
    if (this._skip && !this._qn) return;      // nothing dark, nothing warm
    g.globalCompositeOperation = 'source-over';
    for (let k = 0; k < this._qn; k++) {
      const q = this._q[k];
      if (q.spark) this._blob(g, this._gradGlow, q.color, q.x, q.y, q.r, q.i);
      else this._spread(g, this._gradGlow, q.color, q.x, q.y, q.r, q.i, q.dx, q.dy, q.cone, q.soft);
    }
    if (!this.smooth) ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, 0, 0, this.w, this.h);
    if (!this.smooth) ctx.imageSmoothingEnabled = true;
  }
}

const TMPA = { x: 0, y: 0 };
const TMPB = { x: 0, y: 0 };
const TMPC = { x: 0, y: 0 };
