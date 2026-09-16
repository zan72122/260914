// items/pants.js -- item #4, the heavy jeans.
//
// PLACEHOLDER (phase 1). Inherits the pull-to-pop behaviour, but the weight is
// already real: higher gravity, heavier damping, a longer pull threshold and a
// low "zushi" thud on release, so it does not feel like the towel.
//
// TODO (phase 2): replace the distance threshold with a *press-and-hold* pull
// where time under tension matters more than speed, and make the cloth lag
// visibly behind the finger.

import { Item } from './base.js';

export class Pants extends Item {
  draw(ctx, world) {
    if (this.state === 'IN_BASKET') return;
    super.draw(ctx, world);
    // Seam down the middle so the silhouette reads as trousers.
    const cl = this.cloth;
    const c = (cl.cols / 2) | 0;
    ctx.strokeStyle = 'rgba(20,32,60,0.35)';
    ctx.lineWidth = Math.max(2, this.anchor.w * 0.05);
    ctx.beginPath();
    for (let r = Math.floor(cl.rows * 0.35); r < cl.rows; r++) {
      const i = cl.idx(c, r);
      if (r === Math.floor(cl.rows * 0.35)) ctx.moveTo(cl.x[i], cl.y[i]);
      else ctx.lineTo(cl.x[i], cl.y[i]);
    }
    ctx.stroke();
  }
}
