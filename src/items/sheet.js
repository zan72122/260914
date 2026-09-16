// items/sheet.js -- item #5, the big sheet. The finale.
//
// PLACEHOLDER (phase 1). Four pegs on a wider, denser mesh with a stronger
// wind response, so it already billows more than anything else and takes four
// strokes to free. Playable end to end.
//
// TODO (phase 2): the real one is the set piece -- each peg released makes the
// freed edge balloon further across the screen, the last one throws the whole
// sheet across the view for a beat, and the character *hugs* it rather than
// catching it. Needs its own camera-near scale and a big low "basa".

import { Item } from './base.js';

export class Sheet extends Item {
  release() {
    super.release();
    if (this.audio) this.audio.cloth(1.6);
  }

  draw(ctx, world) {
    if (this.state === 'IN_BASKET') return;
    super.draw(ctx, world);
  }
}
