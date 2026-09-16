// items/shirt.js -- item #2, T-shirt on a hanger.
//
// PLACEHOLDER (phase 1). It currently inherits the towel's pull-to-pop
// behaviour so the game is playable end to end, but it already looks and
// sounds like itself: cooler colour, a hanger drawn over the pole, "karan"
// instead of the second "pachin".
//
// TODO (phase 2): replace the pull threshold with the specified arc gesture --
// lift the shirt *up* off the pole first, then move it inward. The release
// condition must be "hook cleared the pole", not "distance dragged", and the
// sleeves should flutter freely once the hanger is off.

import { Item } from './base.js';

export class Shirt extends Item {
  popClip(p) {
    const last = this.popped.filter((v) => !v).length === 1;
    super.popClip(p);
    if (last && this.audio) this.audio.hanger();
  }

  draw(ctx, world) {
    if (this.state === 'IN_BASKET') return;
    super.draw(ctx, world);
    if (this.state !== 'HANGING') return;
    // Hanger hook: a signifier that this one is *hooked*, not pegged.
    const cl = this.cloth;
    const mid = cl.idx((cl.cols / 2) | 0, 0);
    const s = Math.max(8, world.min * 0.028);
    ctx.save();
    ctx.translate(cl.x[mid], cl.y[mid]);
    ctx.strokeStyle = '#c9d3dc';
    ctx.lineWidth = Math.max(2.5, s * 0.26);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -s * 0.9, s * 0.42, Math.PI * 0.9, Math.PI * 2.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.5);
    ctx.lineTo(0, 0);
    ctx.stroke();
    ctx.restore();
  }
}
