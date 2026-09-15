/**
 * The paper behind everything.
 *
 * Each scene has its own pastel tint (§3 of the plan). On a scene change the
 * two tints crossfade instead of cutting, so the world never blinks — there is
 * no blackout anywhere in the game. Two full-screen tinted sprites are reused
 * forever; nothing is redrawn per frame.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { PAPER } from '../art/palette';

export const CROSSFADE_SEC = 1.2;

export class Backdrop {
  readonly view = new Container();
  private base = new Sprite(Texture.WHITE);
  private next = new Sprite(Texture.WHITE);
  private t = 1;
  private fade = CROSSFADE_SEC;

  constructor(tint: number = PAPER) {
    this.base.tint = tint;
    this.next.tint = tint;
    this.base.alpha = 1;
    this.next.alpha = 0;
    this.view.addChild(this.base, this.next);
  }

  /** Current fully-settled tint (the tint of the layer that is showing). */
  get tint(): number {
    return this.t >= 1 ? this.next.tint : this.base.tint;
  }

  /** Screen-space resize; the backdrop is not affected by the camera. */
  resize(width: number, height: number): void {
    for (const s of [this.base, this.next]) {
      s.width = width;
      s.height = height;
    }
  }

  /** Starts a crossfade to `tint`. Calling it with the current tint is a no-op. */
  fadeTo(tint: number, seconds = CROSSFADE_SEC): void {
    if (tint === this.tint) return;
    // Collapse any in-flight fade into the base layer first.
    this.base.tint = this.tint;
    this.base.alpha = 1;
    this.next.tint = tint;
    this.next.alpha = 0;
    this.t = 0;
    this.fade = Math.max(0.0001, seconds);
  }

  update(dt: number): void {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / this.fade);
    // Smoothstep: no visible start/stop edge on the fade.
    const e = this.t * this.t * (3 - 2 * this.t);
    this.next.alpha = e;
    if (this.t >= 1) {
      this.base.tint = this.next.tint;
      this.base.alpha = 1;
    }
  }
}
