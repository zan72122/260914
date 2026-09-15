/**
 * Scene 5 「ちょうちょ」 — the butterfly.
 *
 * The world's invitation (§2.2 signifier, §2.4 natural mapping): one crayon
 * butterfly flutters over the crowd and every kid is looking up at it. Put a
 * finger anywhere and it comes to the finger; the crowd follows it. There is
 * nothing to understand — the butterfly does what a butterfly does.
 *
 * State machine
 *   chase   : the butterfly follows whichever fingers are down (the average of
 *             them, so two hands share it instead of tearing it in half) and
 *             drifts on a slow figure-of-eight when nobody is playing. The
 *             crowd walks after it, looking up.
 *             -> when the butterfly is led past the right edge of the picture
 *   running : the butterfly carries on out and everyone runs after it.
 *             -> last kid past exitX (or RUN_TIMEOUT)
 *   done
 *
 * Idle hint (8-12s): the butterfly flies a small loop towards the exit side
 * and comes back, which is exactly the gesture the player has to copy.
 * Auto-advance (30s): it simply flies out and the crowd follows.
 */
import { Sprite } from 'pixi.js';
import { CrowdScene } from './crowdScene';
import type { SceneContext } from '../core/scene';
import type { Hand, HandEvent } from '../core/input';
import { Crowd } from '../crowd/crowd';
import { SAFE } from '../core/viewport';
import { SCENE_TINTS } from '../art/palette';
import { KID_WORLD_H } from '../art/kidSheet';
import { BGM_BUTTERFLY } from '../core/audio';
import { allExited } from './gatherLogic';
import {
  DRIFT_RATE,
  FOLLOW_RATE,
  approach,
  driftTarget,
  leadProgress,
  leftThePicture,
} from './butterflyLogic';

const KID_COUNT = 34;
const RUN_TIMEOUT = 4;
/** Butterfly flap rate, frames per second. */
const FLAP_FPS = 9;
/** How far above the kids' heads the butterfly likes to fly. */
const HOVER_LIFT = 40;
/** World size of the butterfly sprite. */
const BUTTERFLY_SCALE = 1.1;

type Phase = 'chase' | 'running' | 'done';

export class ButterflyScene extends CrowdScene {
  override readonly name = 'butterfly';
  override readonly tint = SCENE_TINTS[4];

  private phase: Phase = 'chase';
  private phaseTime = 0;
  private sprite!: Sprite;
  private bx = 0;
  private by = -220;
  private startX = 0;
  private edgeX = 700;
  private flapTime = 0;
  /** Scripted flight (the idle hint / the auto-advance), or -1 for none. */
  private scriptT = -1;
  private scriptFromX = 0;
  private scriptFromY = 0;
  private autoOut = false;
  private drift = 0;
  private laidOut = false;
  /** Reused so the per-frame maths allocates nothing. */
  private tmp = { x: 0, y: 0 };

  override enter(ctx: SceneContext): void {
    super.enter(ctx);
    const crowd = new Crowd({
      followForce: 520,
      maxSpeed: 210,
      bounds: { left: -SAFE * 0.7, top: -SAFE * 0.6, right: SAFE * 0.7, bottom: SAFE * 0.6 },
    });
    crowd.spawn(KID_COUNT);
    this.setupCrowd(ctx, crowd);

    this.sprite = new Sprite(ctx.props.butterfly[0]);
    this.sprite.anchor.set(0.5);
    this.sprite.scale.set(BUTTERFLY_SCALE);
    // Above everything: a butterfly is the only thing in this game that flies.
    this.fxLayer.addChild(this.sprite);

    this.startX = this.bx;
    this.fitToViewport();
    ctx.viewport.onChange(() => this.fitToViewport());
    ctx.audio.bgm.play(BGM_BUTTERFLY);
  }

  private fitToViewport(): void {
    const l = this.ctx.viewport.layout;
    const halfW = Math.min(l.worldWidth, SAFE * 1.7) / 2;
    const halfH = Math.min(l.worldHeight, SAFE * 1.7) / 2;
    this.crowd.bounds.left = -halfW;
    this.crowd.bounds.right = halfW + 900;
    this.crowd.bounds.top = -(halfH - KID_WORLD_H);
    this.crowd.bounds.bottom = halfH;
    this.exitX = halfW + 300;
    // "The edge of the picture": far enough out that the player really did
    // lead the butterfly across, but inside what a finger can actually reach.
    //
    // A finger cannot touch the very edge of the glass, and the butterfly
    // trails behind it besides, so a target at halfW - 40 was unreachable by
    // hand on a phone: the scene could only ever be ended by its own 30s
    // rescue. A body's width further in, one firm sweep to the right-hand side
    // of the screen carries the butterfly (and the crowd) out.
    this.edgeX = halfW - 170;
    if (!this.laidOut) {
      this.laidOut = true;
      this.crowd.scatter(Math.min(halfW * 0.8, 420), Math.min(halfH * 0.6, 300));
      for (const k of this.crowd.kids) k.y += 90;
    }
  }

  // ---- interaction -------------------------------------------------------

  override onHand(ev: HandEvent): void {
    super.onHand(ev);
    if (this.phase !== 'chase') return;
    if (ev.phase === 'down') {
      // Touching anywhere calls the butterfly over; a scripted flight yields
      // to a real finger at once.
      this.scriptT = -1;
    }
  }

  override applyHands(hands: Iterable<Hand>, dt: number): void {
    super.applyHands(hands, dt);
    if (this.phase !== 'chase') return;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const hand of hands) {
      if (!hand.active) continue;
      sx += hand.x;
      sy += hand.y;
      n++;
    }
    if (n === 0) return;
    // Two fingers share the butterfly rather than fighting over it (§2 rule:
    // effects add up and never conflict).
    this.anyHandDown = true;
    this.scriptT = -1;
    this.bx = approach(this.bx, sx / n, FOLLOW_RATE, dt);
    this.by = approach(this.by, sy / n - HOVER_LIFT, FOLLOW_RATE, dt);
  }

  // ---- update ------------------------------------------------------------

  override update(dt: number): void {
    super.update(dt);
    this.time += dt;
    this.phaseTime += dt;

    if (this.phase === 'chase') {
      if (this.autoOut) {
        this.bx = approach(this.bx, this.edgeX + 200, 1.1, dt);
        this.by = approach(this.by, -180, 1.1, dt);
      } else if (this.scriptT >= 0) {
        this.flyScript(dt);
      } else if (!this.anyHandDown) {
        this.drift += dt;
        driftTarget(this.drift, this.tmp);
        this.bx = approach(this.bx, this.tmp.x, DRIFT_RATE, dt);
        this.by = approach(this.by, this.tmp.y, DRIFT_RATE, dt);
      }
      this.anyHandDown = false;

      // Every kid walks after the butterfly, fanning out below it so the
      // crowd gathers under it instead of piling onto one point.
      const kids = this.crowd.kids;
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i];
        const a = i * 2.399963;
        const spread = 60 + 22 * Math.sqrt(i);
        k.targetX = this.bx + Math.cos(a) * spread;
        k.targetY = this.by + 110 + Math.sin(a) * spread * 0.55;
        k.hasTarget = true;
        // Looking up at it: the head-turn feedback, driven by the world.
        if (k.attention < 0.35) k.attention = 0.35;
        if (Math.abs(this.bx - k.x) > 8) k.facing = this.bx > k.x ? 1 : -1;
      }

      if (leftThePicture(this.bx, this.edgeX)) this.beginRun();
    } else {
      // On the way out the butterfly leads from the front.
      this.bx += 460 * dt;
    }

    this.crowd.update(dt);

    if (this.phase === 'running') {
      if (allExited(this.crowd.kids, this.exitX) || this.phaseTime >= RUN_TIMEOUT) {
        this.phase = 'done';
      }
    }

    // Flap + a little bobbing, so it never looks pinned to the finger.
    this.flapTime += dt * FLAP_FPS;
    const frame = Math.floor(this.flapTime) % 2;
    this.sprite.texture = this.ctx.props.butterfly[frame];
    this.sprite.position.set(this.bx, this.by + Math.sin(this.time * 5) * 9);

    this.syncSprites(dt);
  }

  private anyHandDown = false;

  /** The scripted loop used by the idle hint. */
  private flyScript(dt: number): void {
    this.scriptT += dt / 2.6;
    if (this.scriptT >= 1) {
      this.scriptT = -1;
      return;
    }
    const a = this.scriptT * Math.PI * 2;
    // A loop that leans towards the exit side: the hint is the gesture.
    this.bx = this.scriptFromX + (1 - Math.cos(a)) * 150 + this.scriptT * 90;
    this.by = this.scriptFromY - Math.sin(a) * 90;
  }

  private beginRun(): void {
    this.phase = 'running';
    this.phaseTime = 0;
    this.runOff();
    this.ctx.audio.sfx.play('whee', { gain: 0.5 });
  }

  /** 8-12s with no touch: the butterfly loops towards the way out. */
  override onIdleHint(): void {
    if (this.phase !== 'chase') return;
    this.scriptT = 0;
    this.scriptFromX = this.bx;
    this.scriptFromY = this.by;
    this.ctx.audio.sfx.play('fuwa', { gain: 0.4 });
  }

  /** 30s with no touch: the butterfly flies out and the crowd goes with it. */
  override onAutoAdvance(): void {
    if (this.phase !== 'chase') return;
    this.autoOut = true;
    this.scriptT = -1;
  }

  override finishNow(): void {
    if (this.phase === 'chase') {
      this.bx = this.edgeX + 100;
      this.beginRun();
    }
    this.phase = 'done';
  }

  override progress(): number {
    if (this.phase === 'chase') return 0.9 * leadProgress(this.bx, this.startX, this.edgeX);
    if (this.phase === 'running') return 0.9 + 0.1 * Math.min(1, this.phaseTime / RUN_TIMEOUT);
    return 1;
  }

  /** Debug/e2e only. */
  debugPhase(): string {
    return this.phase;
  }

  override isDone(): boolean {
    return this.phase === 'done';
  }
}

export default function createButterfly(): ButterflyScene {
  return new ButterflyScene();
}
