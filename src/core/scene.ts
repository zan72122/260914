/** Scene base class: enter -> update/onHand -> exit, and "am I done yet". */
import type { Container } from 'pixi.js';
import type { Hand, HandEvent } from './input';
import type { Audio } from './audio';
import type { KidSheet } from '../art/kidSheet';
import type { PropTextures } from '../art/props';
import type { Viewport } from './viewport';
import { PAPER } from '../art/palette';

export interface SceneContext {
  /** Layer the scene should add its display objects to. */
  stage: Container;
  viewport: Viewport;
  audio: Audio;
  sheet: KidSheet;
  props: PropTextures;
  /**
   * Asks the director to crossfade the paper to another colour. Scene 10 uses
   * it to turn night into morning; every other scene just declares `tint`.
   */
  setTint: (tint: number, seconds?: number) => void;
}

export abstract class Scene {
  protected ctx!: SceneContext;
  /** Seconds since `enter`. */
  protected age = 0;

  /** Stable identifier, used by the e2e debug hooks. Never rendered. */
  readonly name: string = 'scene';

  /** Paper tint for this scene; the director crossfades the backdrop to it. */
  readonly tint: number = PAPER;

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
  onHand(_ev: HandEvent): void {}

  /** Continuous per-frame forces from every finger currently held down. */
  applyHands(_hands: Iterable<Hand>, _dt: number): void {}

  /** The world should nudge the player after a while of no input. */
  onIdleHint(): void {}

  /** No input at all for a long time: move on by ourselves (never stuck). */
  onAutoAdvance(): void {}

  /** True when the director should move to the next scene. */
  isDone(): boolean {
    return false;
  }

  /** 0..1 progress through the scene's own goal. Debug/e2e only. */
  progress(): number {
    return 0;
  }

  /** Test hook: how many kids this scene simulates. */
  debugKidCount(): number {
    return 0;
  }

  /**
   * Debug/perf hook: bring the scene up to `n` kids and return the new total.
   * Never used by the game, and there is no UI for it anywhere — it exists so
   * the performance harness can load a real scene up to 150 bodies.
   */
  debugStress(_n: number): number {
    return 0;
  }

  /** Skips straight to the run-off ending (debug hook + auto-advance). */
  finishNow(): void {}

  /** Called once when the scene is retired; must release everything. */
  exit(): void {}
}
