// items/pinch.js -- item #3, the round pinch-hanger of socks and hankies.
//
// PLACEHOLDER (phase 1). Inherits the pull-to-pop behaviour with three pegs
// instead of two, so it already feels a little different (three strokes,
// rising pitch) and the game is completable.
//
// TODO (phase 2): the real gesture is a *swipe across the pegs* -- every peg
// the finger passes over snaps open in turn ("pachi-pachi-pachi", randomised
// pitch) and its little sock drops individually for the child to catch. The
// frame itself then slides inward on its own.

import { Item } from './base.js';

export class Pinch extends Item {
  popClip(p) {
    const n = this.popped.filter((v) => v).length;
    // Rising pitch as the pegs go, which is what the real item will do too.
    this.spec.clipPitch = 1.0 + n * 0.16;
    super.popClip(p);
  }

  draw(ctx, world) {
    if (this.state === 'IN_BASKET') return;
    if (this.state === 'HANGING') {
      // The round frame the pegs hang from.
      const cl = this.cloth;
      const a = cl.idx(0, 0);
      const b = cl.idx(cl.cols - 1, 0);
      ctx.strokeStyle = '#eef2f5';
      ctx.lineWidth = Math.max(3, world.min * 0.012);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cl.x[a], cl.y[a] - world.min * 0.012);
      ctx.lineTo(cl.x[b], cl.y[b] - world.min * 0.012);
      ctx.stroke();
    }
    super.draw(ctx, world);
  }
}
