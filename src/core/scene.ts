/** Scene base class: enter -> update/onHand -> exit, and "am I done yet". */
import type { Container } from 'pixi.js';
import type { HandEvent } from './input';
import type { Audio } from './audio';
import type { KidSheet } from '../art/kidSheet';
import type { Viewport } from './viewport';

export interface SceneContext {
  /** Layer the scene should add its display objects to. */
  stage: Container;
  viewport: Viewport;
  audio: Audio;
  sheet: KidSheet;
}

export abstract class Scene {
  protected ctx!: SceneContext;
  /** Seconds since `enter`. */
  protected age = 0;

  /** Called once when the scene becomes active. */
  enter(ctx: SceneContext): void {
    this.ctx = ctx;
    this.age = 0;
  }

  /** Per-frame simulation. `dt` is seconds. */
  update(dt: number): void {
    this.age += dt;
  }

  /** Every pointer down/move/up, as a world-space Hand. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onHand(_ev: HandEvent): void {}

  /** The world should nudge the player after a while of no input. */
  onIdleHint(): void {}

  /** No input at all for a long time: move on by ourselves (never stuck). */
  onAutoAdvance(): void {}

  /** True when the director should move to the next scene. */
  isDone(): boolean {
    return false;
  }

  /** Called once when the scene is retired; must release everything. */
  exit(): void {}
}
