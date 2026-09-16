// basket.js -- the progress bar, except it is a basket.
//
// Every item that gets carried in adds one visible, coloured layer. Five
// layers and the basket is heaped. No numbers, no bar, no icons: the world is
// the UI.

import { darken } from './cloth.js';
import { roundRect } from './items/base.js';
import { clamp } from './layout.js';

export class Basket {
  constructor(world) {
    this.layers = [];
    this.pop = 0;
    this.layout(world);
  }

  layout(world) { this.world = world; this.r = world.basket; }

  add(item) {
    this.layers.push({
      rgb: item.rgb,
      wetness: item.wetness,
      seed: Math.random(),
      grow: 0,
      // A whole sheet is not one towel's worth of laundry: it heaps.
      scale: item.basketScale || 1,
    });
    this.pop = 1;
  }

  get count() { return this.layers.length; }

  update(dt) {
    this.pop = Math.max(0, this.pop - dt * 2.2);
    for (let i = 0; i < this.layers.length; i++) {
      this.layers[i].grow = Math.min(1, this.layers[i].grow + dt * 3.2);
    }
  }

  draw(ctx, world) {
    const r = this.r;
    const squash = 1 + this.pop * 0.06;
    const bodyH = r.h * 0.72;
    const bodyY = r.bottom - bodyH;
    const rimH = Math.max(6, r.h * 0.11);

    ctx.save();
    // shadow
    ctx.fillStyle = 'rgba(70,52,40,0.16)';
    ctx.beginPath();
    ctx.ellipse(r.cx, r.bottom + r.h * 0.02, r.w * 0.52, r.h * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    // --- laundry heap, drawn before the front wall so it sits *in* the basket
    const maxLayers = 5;
    for (let i = 0; i < this.layers.length; i++) {
      const L = this.layers[i];
      const t = i / maxLayers;
      const sc = L.scale || 1;
      const hh = r.h * 0.21 * sc;
      // The heap rises *above* the rim, otherwise the front wall hides it.
      const cy = bodyY + r.h * 0.05 - t * r.h * 0.40 * squash - r.h * 0.05 * (sc - 1);
      const ww = r.w * (0.96 - t * 0.26) * (0.86 + 0.14 * L.grow) * (1 + 0.16 * (sc - 1));
      ctx.fillStyle = darken(L.rgb[0], L.rgb[1], L.rgb[2], L.wetness, 1);
      ctx.beginPath();
      ctx.ellipse(r.cx + (L.seed - 0.5) * r.w * 0.10 + (i % 2 ? 1 : -1) * r.w * 0.05, cy, ww * 0.5, hh * 0.5 * L.grow + 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = darken(L.rgb[0], L.rgb[1], L.rgb[2], L.wetness, 1.18);
      ctx.beginPath();
      ctx.ellipse(r.cx + (L.seed - 0.5) * r.w * 0.10 + (i % 2 ? 1 : -1) * r.w * 0.05 - ww * 0.14, cy - hh * 0.20,
        ww * 0.24, hh * 0.22 * L.grow + 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- basket front -----------------------------------------------------
    ctx.fillStyle = '#c99b63';
    roundRect(ctx, r.x, bodyY, r.w, bodyH, r.w * 0.12);
    ctx.fill();
    // weave
    ctx.strokeStyle = 'rgba(122,86,49,0.45)';
    ctx.lineWidth = Math.max(2, r.h * 0.022);
    const rows = 4;
    for (let i = 1; i < rows; i++) {
      const y = bodyY + (bodyH * i) / rows;
      ctx.beginPath();
      ctx.moveTo(r.x + r.w * 0.06, y);
      ctx.lineTo(r.right - r.w * 0.06, y);
      ctx.stroke();
    }
    const cols = 5;
    for (let i = 1; i < cols; i++) {
      const x = r.x + (r.w * i) / cols;
      ctx.beginPath();
      ctx.moveTo(x, bodyY + bodyH * 0.10);
      ctx.lineTo(x, r.bottom - bodyH * 0.10);
      ctx.stroke();
    }
    // rim
    ctx.fillStyle = '#e0b478';
    roundRect(ctx, r.x - r.w * 0.03, bodyY - rimH * 0.5, r.w * 1.06, rimH, rimH * 0.5);
    ctx.fill();
    ctx.restore();
  }

  /** Normalised fullness, for anything that wants to react to progress. */
  get fullness() { return clamp(this.layers.length / 5, 0, 1); }
}
