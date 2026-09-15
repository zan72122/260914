/**
 * Scene sequencing + camera + the two no-text safety nets from the plan:
 *   - after 8-12s of no input, the world gives a hint (never a message);
 *   - after 30s of no input, the crowd moves on by itself, so a 4-year-old
 *     can never get stuck.
 *
 * Transitions are seamless. There is no blackout anywhere: each scene lives in
 * its own container placed one `PAN_STEP` further right in world space, so when
 * a crowd runs off the right edge the camera simply pans after it and the next
 * scene is already there, alive and waiting.
 */
import { Container } from 'pixi.js';
import type { Scene, SceneContext } from './scene';
import type { Hand, HandEvent } from './input';
import type { Viewport } from './viewport';
import type { Audio } from './audio';
import type { KidSheet } from '../art/kidSheet';
import type { PropTextures } from '../art/props';

export const IDLE_HINT_MIN = 8;
export const IDLE_HINT_MAX = 12;
export const AUTO_ADVANCE_AFTER = 30;

/**
 * World distance between consecutive scene origins. Wide enough that two
 * scenes' contents never overlap (the widest scene is under +-600 units), but
 * close enough that the incoming scene slides into view while the outgoing
 * crowd is still leaving on the other side: the camera never travels over an
 * empty screen.
 */
export const PAN_STEP = 1800;
/** Seconds the camera takes to travel that distance. */
export const PAN_SEC = 1.3;

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export type SceneFactory = () => Scene;

interface LiveScene {
  scene: Scene;
  layer: Container;
  originX: number;
}

function blankHand(): Hand {
  return {
    id: -1,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    startX: 0,
    startY: 0,
    downTime: 0,
    lastSample: 0,
    travel: 0,
    radius: 0,
    active: false,
    wasTap: false,
  };
}

export class Director {
  /** Container the active scenes draw into; the camera transforms this. */
  readonly world = new Container();
  readonly camera: Camera = { x: 0, y: 0, zoom: 1 };
  current: Scene | null = null;
  /** The outgoing scene while the camera is panning, else null. */
  outgoing: Scene | null = null;

  /** Fired when the active scene changes; wire this to the paper backdrop. */
  onSceneTint: ((tint: number) => void) | null = null;

  private live: LiveScene | null = null;
  private old: LiveScene | null = null;
  private index = -1;
  private nextOriginX = 0;
  private idleTime = 0;
  private hintAt = IDLE_HINT_MIN;
  private hintFired = false;
  private autoFired = false;
  private panT = 1;
  private panFrom = 0;
  private panTo = 0;
  /** Reused hand copies so localisation during a pan allocates nothing. */
  private scratchA = blankHand();
  private scratchB = blankHand();
  private scratchEvent: HandEvent = { phase: 'down', hand: this.scratchA, isTap: false };

  constructor(
    private scenes: SceneFactory[],
    private deps: { viewport: Viewport; audio: Audio; sheet: KidSheet; props: PropTextures },
  ) {}

  /** True while the camera is travelling between two scenes. */
  get panning(): boolean {
    return this.panT < 1;
  }

  /**
   * True when the current scene's 30-second "nobody is touching anything"
   * rescue has already fired. Exposed so the e2e suite can prove that a scene
   * was completed by real gestures rather than by the safety net.
   */
  get autoAdvanceFired(): boolean {
    return this.autoFired;
  }

  /** Index of the active scene in the sequence. */
  get sceneIndex(): number {
    return this.index;
  }

  /** Starts (or restarts) at the first scene. */
  start(): void {
    this.index = -1;
    this.nextOriginX = 0;
    this.spawnNext();
    if (this.live) {
      this.camera.x = this.live.originX;
      this.panT = 1;
    }
  }

  private spawnNext(): LiveScene | null {
    if (this.scenes.length === 0) return null;
    this.index = (this.index + 1) % this.scenes.length;
    const scene = this.scenes[this.index]();
    const layer = new Container();
    const originX = this.nextOriginX;
    layer.position.set(originX, 0);
    this.world.addChild(layer);
    const ctx: SceneContext = {
      stage: layer,
      viewport: this.deps.viewport,
      audio: this.deps.audio,
      sheet: this.deps.sheet,
      props: this.deps.props,
    };
    scene.enter(ctx);
    this.nextOriginX = originX + PAN_STEP;
    this.live = { scene, layer, originX };
    this.current = scene;
    this.onSceneTint?.(scene.tint);
    this.resetIdle();
    return this.live;
  }

  /**
   * Retires the current scene and pans to the next one (wrapping around).
   * Both scenes stay alive and visible for the whole pan.
   */
  next(): void {
    if (!this.live) {
      this.spawnNext();
      return;
    }
    // A pan already in flight finishes first, so scenes cannot stack up.
    this.finishPan();
    const previous = this.live;
    this.old = previous;
    this.outgoing = previous.scene;
    this.spawnNext();
    this.panFrom = this.camera.x;
    this.panTo = this.live ? this.live.originX : this.camera.x;
    this.panT = 0;
  }

  private finishPan(): void {
    if (this.old) {
      this.old.scene.exit();
      this.world.removeChild(this.old.layer);
      this.old.layer.destroy({ children: true });
      this.old = null;
      this.outgoing = null;
    }
    this.panT = 1;
    if (this.live) this.camera.x = this.live.originX;
  }

  private resetIdle(): void {
    this.idleTime = 0;
    this.hintFired = false;
    this.autoFired = false;
    // Randomised inside the 8-12s window so the hint never feels mechanical.
    this.hintAt = IDLE_HINT_MIN + Math.random() * (IDLE_HINT_MAX - IDLE_HINT_MIN);
  }

  /** Copies a hand into scene-local coordinates without allocating. */
  private localize(hand: Hand, originX: number, into: Hand): Hand {
    into.id = hand.id;
    into.x = hand.x - originX + this.camera.x;
    into.y = hand.y;
    into.px = hand.px - originX + this.camera.x;
    into.py = hand.py;
    into.vx = hand.vx;
    into.vy = hand.vy;
    into.startX = hand.startX - originX + this.camera.x;
    into.startY = hand.startY;
    into.downTime = hand.downTime;
    into.lastSample = hand.lastSample;
    into.travel = hand.travel;
    into.radius = hand.radius;
    into.active = hand.active;
    into.wasTap = hand.wasTap;
    return into;
  }

  onHand(ev: HandEvent): void {
    this.resetIdle();
    if (this.live) {
      this.scratchEvent.phase = ev.phase;
      this.scratchEvent.isTap = ev.isTap;
      this.scratchEvent.hand = this.localize(ev.hand, this.live.originX, this.scratchA);
      this.live.scene.onHand(this.scratchEvent);
    }
    // During a pan the outgoing scene reacts too, so a finger placed on the
    // half of the screen it still occupies is never ignored.
    if (this.old) {
      this.scratchEvent.phase = ev.phase;
      this.scratchEvent.isTap = ev.isTap;
      this.scratchEvent.hand = this.localize(ev.hand, this.old.originX, this.scratchB);
      this.old.scene.onHand(this.scratchEvent);
    }
  }

  /** Per-frame continuous forces from held fingers. */
  applyHands(hands: Iterable<Hand>, dt: number): void {
    for (const hand of hands) {
      if (this.live) {
        this.oneHand[0] = this.localize(hand, this.live.originX, this.scratchA);
        this.live.scene.applyHands(this.oneHand, dt);
      }
      if (this.old) {
        this.oneHand[0] = this.localize(hand, this.old.originX, this.scratchB);
        this.old.scene.applyHands(this.oneHand, dt);
      }
    }
  }

  /** Reused single-element array so `applyHands` allocates nothing. */
  private oneHand: Hand[] = [blankHand()];

  /** Debug hook: jump to the next scene immediately. */
  advanceScene(): void {
    this.next();
  }

  update(dt: number): void {
    if (this.old) this.old.scene.update(dt);
    const scene = this.live?.scene ?? null;
    if (!scene) return;
    scene.update(dt);

    if (this.panning) {
      this.panT = Math.min(1, this.panT + dt / PAN_SEC);
      // Smoothstep: the camera eases away and eases in, never snaps.
      const e = this.panT * this.panT * (3 - 2 * this.panT);
      this.camera.x = this.panFrom + (this.panTo - this.panFrom) * e;
      if (this.panT >= 1) this.finishPan();
    } else {
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
    }

    // The world container is centred by the viewport, so the camera is a
    // simple offset + zoom on top of it.
    this.world.scale.set(this.camera.zoom);
    this.world.position.set(-this.camera.x * this.camera.zoom, -this.camera.y * this.camera.zoom);
  }
}
