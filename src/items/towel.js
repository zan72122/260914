// items/towel.js -- item #1, the fully implemented reference item.
//
// Two pegs, a soft terry towel. One gentle pull toward the room pops the peg
// nearest the finger; the towel swings loose and hangs on the diagonal, which
// is the whole point: a half-hung towel *looks* unfinished, so the child pulls
// again without anybody telling them to. The second pull pops the last peg,
// the towel drops, the child catches it.

import { Item } from './base.js';
import { clamp } from '../layout.js';

export class Towel extends Item {
  constructor(world, spec, hooks) {
    super(world, spec, hooks);
    // Woven stripe positions, in rows of the grid.
    this.stripes = [0.22, 0.30, 0.70, 0.78];
  }

  popClip(p) {
    const before = this.popped.filter((v) => v).length;
    super.popClip(p);
    const after = this.popped.filter((v) => v).length;
    if (after === 1 && before === 0) {
      // First peg: a light flutter, not the big release sound.
      if (this.audio) this.audio.clip(1.18, 0.045);
    }
  }

  draw(ctx, world) {
    if (this.state === 'IN_BASKET') return;
    super.draw(ctx, world);
    this.drawStripes(ctx);
  }

  /** Two pairs of darker bands read instantly as "towel". */
  drawStripes(ctx) {
    const cl = this.cloth;
    const cols = cl.cols, rows = cl.rows;
    const k = 1 - 0.46 * this.wetness;
    ctx.strokeStyle = 'rgba(' + Math.round(this.rgb[0] * 0.72 * k) + ',' +
      Math.round(this.rgb[1] * 0.72 * k) + ',' +
      Math.round(this.rgb[2] * 0.8 * k) + ',0.85)';
    ctx.lineWidth = Math.max(2, this.anchor.h * 0.035);
    ctx.lineCap = 'butt';
    for (let s = 0; s < this.stripes.length; s++) {
      const r = clamp(Math.round(this.stripes[s] * (rows - 1)), 0, rows - 1);
      ctx.beginPath();
      for (let c = 0; c < cols; c++) {
        const i = cl.idx(c, r);
        if (c === 0) ctx.moveTo(cl.x[i], cl.y[i]);
        else ctx.lineTo(cl.x[i], cl.y[i]);
      }
      ctx.stroke();
    }
  }
}
