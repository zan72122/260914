/**
 * Scene 8 「ふうせん」 — balloons.
 *
 * The world's invitation (§2.3 causality, §2.5 incompleteness): everybody on
 * the grass is holding a balloon on a string, and exactly one of them is
 * already off the ground, drifting up. The gap in the row is the question.
 *
 * State machine
 *   grass   : a tap lifts whoever it lands on; a finger dragged UPWARDS lifts
 *             everyone it passes (§2.4: up on the glass is up in the world).
 *             A kid who lifts rises, swaying, and drifts towards the next
 *             place as they go.
 *             -> when every kid is above the top of the picture
 *   away    : a beat with the sky to itself while the last balloons leave.
 *             -> after AWAY_SEC
 *   done
 *
 * Idle hint (8-12s): one more kid lifts off by themselves and the one already
 * up bobs. Auto-advance (30s): they leave one at a time until the field is
 * empty.
 */
import { Sprite } from 'pixi.js';
import { CrowdScene } from './crowdScene';
import type { SceneContext } from '../core/scene';
import type { Hand, HandEvent } from '../core/input';
import { Crowd } from '../crowd/crowd';
import { SAFE } from '../core/viewport';
import { SCENE_TINTS } from '../art/palette';
import { BALLOON_HAND_X, BALLOON_HAND_Y } from '../art/geometry';
import { BGM_BALLOON } from '../core/audio';
import {
  DRIFT_SPEED,
  GONE,
  GROUNDED,
  RISING,
  allFloated,
  floatedFraction,
  offTheTop,
  riseSpeed,
  swayOffset,
} from './balloonLogic';

const KID_COUNT = 26;
/** Seconds of empty sky before the camera moves on. */
const AWAY_SEC = 1;
/** Seconds between kids when the scene finishes itself. */
const AUTO_INTERVAL = 0.5;
/** A drag has to be going up at least this fast to lift anybody. */
const LIFT_SPEED = 70;

type Phase = 'grass' | 'away' | 'done';

export class BalloonScene extends CrowdScene {
  override readonly name = 'balloon';
  override readonly tint = SCENE_TINTS[7];

  private phase: Phase = 'grass';
  private phaseTime = 0;
  private balloons: Sprite[] = [];
  private states: number[] = [];
  private riseT: number[] = [];
  private baseX: number[] = [];
  private topY = -900;
  private autoPilot = false;
  private autoTimer = 0;
  private laidOut = false;

  override enter(ctx: SceneContext): void {
    super.enter(ctx);
    const crowd = new Crowd({
      separationRadius: 64,
      bounds: { left: -SAFE * 0.7, top: -SAFE * 2, right: SAFE * 0.7, bottom: SAFE * 0.6 },
    });
    crowd.spawn(KID_COUNT);
    this.setupCrowd(ctx, crowd);

    for (let i = 0; i < crowd.kids.length; i++) {
      const k = crowd.kids[i];
      k.setState('hold', true);
      k.locked = true;
      this.states.push(GROUNDED);
      this.riseT.push(0);
      this.baseX.push(0);
      const s = new Sprite(ctx.props.balloons[i % ctx.props.balloons.length]);
      // The string's bottom end is the anchor, so it hangs from the hand.
      s.anchor.set(0.5, 1);
      this.layer.addChild(s);
      this.balloons.push(s);
    }

    this.fitToViewport();
    ctx.viewport.onChange(() => this.fitToViewport());

    // One kid has already let their feet leave the ground.
    this.lift(0);

    ctx.audio.bgm.play(BGM_BALLOON);
  }

  private fitToViewport(): void {
    const l = this.ctx.viewport.layout;
    const halfW = Math.min(l.worldWidth, SAFE * 1.7) / 2;
    const halfH = Math.min(l.worldHeight, SAFE * 1.7) / 2;
    this.crowd.bounds.left = -halfW;
    this.crowd.bounds.right = halfW + 900;
    this.crowd.bounds.top = -halfH * 4;
    this.crowd.bounds.bottom = halfH;
    this.exitX = halfW + 300;
    // Gone means gone: a whole balloon's length above the top of the screen.
    this.topY = -halfH - 260;
    if (!this.laidOut) {
      this.laidOut = true;
      this.crowd.scatter(Math.min(halfW * 0.78, 400), Math.min(halfH * 0.5, 260));
      const kids = this.crowd.kids;
      for (let i = 0; i < kids.length; i++) {
        kids[i].y += 120;
        this.baseX[i] = kids[i].x;
      }
    }
  }

  /** One kid's feet leave the grass. */
  private lift(i: number): boolean {
    if (this.states[i] !== GROUNDED) return false;
    const k = this.crowd.kids[i];
    this.states[i] = RISING;
    this.riseT[i] = 0;
    this.baseX[i] = k.x;
    k.frozen = true;
    k.locked = true;
    k.setState('hold', true);
    this.ctx.audio.sfx.play('fuwa', { gain: 0.6, detune: (Math.random() - 0.5) * 400 });
    return true;
  }

  private liftNear(x: number, y: number, radius: number, max: number): number {
    const kids = this.crowd.kids;
    const r2 = radius * radius;
    let n = 0;
    for (let i = 0; i < kids.length && n < max; i++) {
      if (this.states[i] !== GROUNDED) continue;
      const dx = kids[i].x - x;
      const dy = kids[i].y - y;
      if (dx * dx + dy * dy > r2) continue;
      if (this.lift(i)) n++;
    }
    return n;
  }

  private liftNearest(x: number, y: number): void {
    const kids = this.crowd.kids;
    let best = -1;
    let bestD2 = Infinity;
    for (let i = 0; i < kids.length; i++) {
      if (this.states[i] !== GROUNDED) continue;
      const dx = kids[i].x - x;
      const dy = kids[i].y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    if (best >= 0) this.lift(best);
  }

  // ---- interaction -------------------------------------------------------

  override onHand(ev: HandEvent): void {
    super.onHand(ev);
    if (this.phase !== 'grass') return;
    if (ev.phase !== 'up' || !ev.isTap) return;
    if (this.liftNear(ev.hand.x, ev.hand.y, ev.hand.radius * 0.8, 2) === 0) {
      this.liftNearest(ev.hand.x, ev.hand.y);
    }
  }

  override applyHands(hands: Iterable<Hand>, dt: number): void {
    super.applyHands(hands, dt);
    if (this.phase !== 'grass') return;
    for (const hand of hands) {
      if (!hand.active) continue;
      // Upwards only: sweeping up the screen is lifting.
      if (hand.vy > -LIFT_SPEED) continue;
      this.liftNear(hand.x, hand.y, hand.radius * 0.9, 3);
    }
  }

  // ---- update ------------------------------------------------------------

  override update(dt: number): void {
    super.update(dt);
    this.time += dt;
    this.phaseTime += dt;

    const kids = this.crowd.kids;

    if (this.phase === 'grass' && this.autoPilot) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0) {
        this.autoTimer = AUTO_INTERVAL;
        for (let i = 0; i < kids.length; i++) {
          if (this.lift(i)) break;
        }
      }
    }

    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      if (this.states[i] === RISING) {
        this.riseT[i] += dt;
        k.y -= riseSpeed(this.riseT[i]) * dt;
        k.x = this.baseX[i] + this.riseT[i] * DRIFT_SPEED + swayOffset(this.riseT[i], k.wanderPhase);
        if (offTheTop(k.y, this.topY)) this.states[i] = GONE;
      } else if (this.states[i] === GROUNDED) {
        // Standing about holding a balloon: a tiny bob, nothing more.
        k.y += Math.sin(this.time * 1.4 + k.wanderPhase) * 3 * dt;
      }
      // The balloon hangs from the raised hand, wherever that hand is.
      const b = this.balloons[i];
      b.position.set(k.x + BALLOON_HAND_X * k.facing, k.y + BALLOON_HAND_Y);
      b.rotation = Math.sin(this.time * 1.1 + k.wanderPhase) * 0.09;
      b.zIndex = k.y - 1;
      b.visible = this.states[i] !== GONE;
    }

    this.crowd.update(dt);

    if (this.phase === 'grass' && allFloated(this.states)) {
      this.phase = 'away';
      this.phaseTime = 0;
      this.ctx.audio.sfx.play('fuwa', { gain: 0.8, detune: 300 });
    } else if (this.phase === 'away' && this.phaseTime >= AWAY_SEC) {
      this.phase = 'done';
    }

    this.syncSprites(dt);
  }

  /** 8-12s with no touch: one more kid lifts off on their own. */
  override onIdleHint(): void {
    if (this.phase !== 'grass') return;
    for (let i = 0; i < this.states.length; i++) {
      if (this.lift(i)) break;
    }
  }

  /** 30s with no touch: the field empties itself, one kid at a time. */
  override onAutoAdvance(): void {
    if (this.phase !== 'grass') return;
    this.autoPilot = true;
    this.autoTimer = 0;
  }

  override finishNow(): void {
    if (this.phase === 'grass') {
      for (let i = 0; i < this.states.length; i++) {
        this.states[i] = GONE;
        const k = this.crowd.kids[i];
        k.frozen = true;
        k.y = this.topY - 40;
      }
      this.phase = 'away';
      this.phaseTime = AWAY_SEC;
    }
    this.phase = 'done';
  }

  override progress(): number {
    if (this.phase === 'grass') return 0.9 * floatedFraction(this.states);
    if (this.phase === 'away') return 0.9 + 0.1 * Math.min(1, this.phaseTime / AWAY_SEC);
    return 1;
  }

  /** Debug/e2e only. */
  debugPhase(): string {
    return this.phase;
  }

  /** Debug/e2e only: how many kids are already in the sky. */
  debugFloated(): number {
    let n = 0;
    for (let i = 0; i < this.states.length; i++) if (this.states[i] === GONE) n++;
    return n;
  }

  override isDone(): boolean {
    return this.phase === 'done';
  }

  override exit(): void {
    super.exit();
    this.balloons.length = 0;
    this.states.length = 0;
    this.riseT.length = 0;
    this.baseX.length = 0;
  }
}

export default function createBalloon(): BalloonScene {
  return new BalloonScene();
}
