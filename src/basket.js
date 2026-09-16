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
    this.wob = 0;
    this.t = 0;
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

  /** Poked: the whole basket rocks on its base. */
  knock() { this.wob = 1; this.pop = Math.max(this.pop, 0.6); }

  update(dt) {
    this.pop = Math.max(0, this.pop - dt * 2.2);
    this.wob = Math.max(0, (this.wob || 0) - dt * 1.6);
    this.t = (this.t || 0) + dt;
    for (let i = 0; i < this.layers.length; i++) {
      this.layers[i].grow = Math.min(1, this.layers[i].grow + dt * 3.2);
    }
  }

  /**
   * Where layer `i` sits, in screen y. The first ones are down *inside* the
   * basket -- the front wall and the rim are drawn over them, so they read as
   * being in it rather than stacked behind it, which is exactly what the
   * playtest saw. By the fourth or fifth the heap is over the rim and spills
   * out the top, which is what a full laundry basket looks like.
   */
  layerY(i, r, rimY) {
    // The first thing in sits *on* the rim line: the front lip crosses it, so
    // it is unmistakably down in the basket rather than parked behind it. Each
    // one after that stacks a little higher, and by the fifth the heap is
    // standing well clear of the rim, which is what a full basket looks like.
    return rimY + r.h * 0.05 - i * r.h * 0.115;
  }

  /** One soft mound of cloth. */
  drawLayer(ctx, L, i, r, rimY) {
    const sc = L.scale || 1;
    const hh = r.h * 0.24 * sc;
    const cy = this.layerY(i, r, rimY);
    const ww = r.w * (0.90 - i * 0.045) * (0.86 + 0.14 * L.grow) * (1 + 0.14 * (sc - 1));
    const cx = r.cx + (L.seed - 0.5) * r.w * 0.10 + (i % 2 ? 1 : -1) * r.w * 0.05;
    ctx.fillStyle = darken(L.rgb[0], L.rgb[1], L.rgb[2], L.wetness, 1);
    ctx.beginPath();
    ctx.ellipse(cx, cy, ww * 0.5, hh * 0.5 * L.grow + 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = darken(L.rgb[0], L.rgb[1], L.rgb[2], L.wetness, 1.18);
    ctx.beginPath();
    ctx.ellipse(cx - ww * 0.14, cy - hh * 0.20, ww * 0.24, hh * 0.22 * L.grow + 1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  draw(ctx, world) {
    const r = this.r;
    const squash = 1 + this.pop * 0.06;
    const bodyH = r.h * 0.72;
    const bodyY = r.bottom - bodyH;
    const rimH = Math.max(6, r.h * 0.11);
    const rimY = bodyY - rimH * 0.5;
    const wob = (this.wob || 0) * Math.sin((this.t || 0) * 22) * 0.055;

    ctx.save();
    // shadow -- on the floor, so it does not rock with the basket
    ctx.fillStyle = 'rgba(70,52,40,0.16)';
    ctx.beginPath();
    ctx.ellipse(r.cx, r.bottom + r.h * 0.02, r.w * 0.52, r.h * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    // Knocked: the whole thing rocks about the point it stands on.
    if (wob) {
      ctx.translate(r.cx, r.bottom);
      ctx.rotate(wob);
      ctx.translate(-r.cx, -r.bottom);
    }

    // --- the inside of the basket, seen over the rim ----------------------
    ctx.fillStyle = '#6f4f30';
    roundRect(ctx, r.x + r.w * 0.03, rimY - rimH * 0.2, r.w * 0.94, bodyH * 0.5, r.w * 0.08);
    ctx.fill();

    // --- what is down in it, clipped to the walls -------------------------
    // Everything goes in behind the front wall; the ones low enough to be
    // crossed by the rim are clipped to the basket so they cannot spill out
    // of its sides, and the rim is painted over them afterwards.
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x - r.w * 0.06, rimY - r.h * 1.2, r.w * 1.12, r.h * 1.2 + bodyH);
    ctx.clip();
    for (let i = 0; i < this.layers.length; i++) {
      this.drawLayer(ctx, this.layers[i], i, r, rimY);
    }
    ctx.restore();

    // --- basket front: drawn OVER the lower layers ------------------------
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
    // rim, last of the basket: the front lip the washing sits behind
    ctx.fillStyle = '#e0b478';
    roundRect(ctx, r.x - r.w * 0.03, rimY, r.w * 1.06, rimH * squash, rimH * 0.5);
    ctx.fill();

    ctx.restore();
  }

  /** Normalised fullness, for anything that wants to react to progress. */
  get fullness() { return clamp(this.layers.length / 5, 0, 1); }
}
