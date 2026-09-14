/**
 * Scene sequencing + camera + the two no-text safety nets from the plan:
 *   - after 8-12s of no input, the world gives a hint (never a message);
 *   - after 30s of no input, the crowd moves on by itself, so a 4-year-old
 *     can never get stuck.
 */
import { Container } from 'pixi.js';
import type { Scene, SceneContext } from './scene';
import type { HandEvent } from './input';
import type { Viewport } from './viewport';
import type { Audio } from './audio';
import type { KidSheet } from '../art/kidSheet';

export const IDLE_HINT_MIN = 8;
export const IDLE_HINT_MAX = 12;
export const AUTO_ADVANCE_AFTER = 30;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export type SceneFactory = () => Scene;

export class Director {
  /** Container the active scene draws into; the camera transforms this. */
  readonly world = new Container();
  readonly camera: Camera = { x: 0, y: 0, zoom: 1 };
  current: Scene | null = null;
  private index = -1;
  private idleTime = 0;
  private hintAt = IDLE_HINT_MIN;
  private hintFired = false;
  private autoFired = false;

  constructor(
    private scenes: SceneFactory[],
    private deps: { viewport: Viewport; audio: Audio; sheet: KidSheet },
  ) {}

  /** Starts (or restarts) at the first scene. */
  start(): void {
    this.index = -1;
    this.next();
  }

  /** Retires the current scene and enters the next one (wrapping around). */
  next(): void {
    if (this.current) {
      this.current.exit();
      this.world.removeChildren();
      this.current = null;
    }
    if (this.scenes.length === 0) return;
    this.index = (this.index + 1) % this.scenes.length;
    const scene = this.scenes[this.index]();
    const ctx: SceneContext = {
      stage: this.world,
      viewport: this.deps.viewport,
      audio: this.deps.audio,
      sheet: this.deps.sheet,
    };
    scene.enter(ctx);
    this.current = scene;
    this.resetIdle();
  }

  private resetIdle(): void {
    this.idleTime = 0;
    this.hintFired = false;
    this.autoFired = false;
    // Randomised inside the 8-12s window so the hint never feels mechanical.
    this.hintAt = IDLE_HINT_MIN + Math.random() * (IDLE_HINT_MAX - IDLE_HINT_MIN);
  }

  onHand(ev: HandEvent): void {
    this.resetIdle();
    this.current?.onHand(ev);
  }

  update(dt: number): void {
    const scene = this.current;
    if (!scene) return;
    scene.update(dt);

    this.idleTime += dt;
    if (!this.hintFired && this.idleTime >= this.hintAt) {
      this.hintFired = true;
      scene.onIdleHint();
    }
    if (!this.autoFired && this.idleTime >= AUTO_ADVANCE_AFTER) {
      this.autoFired = true;
      scene.onAutoAdvance();
    }

    if (scene.isDone()) this.next();

    // Camera: world container is centred by the viewport, so the camera is a
    // simple offset + zoom on top of it.
    this.world.scale.set(this.camera.zoom);
    this.world.position.set(-this.camera.x * this.camera.zoom, -this.camera.y * this.camera.zoom);
  }
}
