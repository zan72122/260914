/**
 * Scene 6 「すべり台」 — the slide.
 *
 * The world's invitation (§2.1 affordance, §2.5 incompleteness): one big
 * crayon slide, and one kid already sitting at the top of it with nobody
 * behind them. The ladder is a ladder, the slope is a slope, and the queue has
 * an obvious gap in it. Nothing has to be explained.
 *
 * State machine
 *   play    : tap the kid at the top and they let go, "whee", down the slope,
 *             land laughing and run off to the side. Tap or drag anybody in
 *             the crowd towards the ladder and they climb it and slide too.
 *             -> when everyone has been down
 *   running : the whole crowd runs off the right edge.
 *             -> last kid past exitX (or RUN_TIMEOUT)
 *   done
 *
 * Idle hint (8-12s): the kid at the top shuffles forward and bounces; one kid
 * in the crowd starts walking to the ladder. Auto-advance (30s): the queue
 * feeds itself, one kid at a time.
 */
import { Sprite } from 'pixi.js';
import { CrowdScene } from './crowdScene';
import type { SceneContext } from '../core/scene';
import type { Hand, HandEvent } from '../core/input';
import { Crowd } from '../crowd/crowd';
import { SAFE } from '../core/viewport';
import { SCENE_TINTS } from '../art/palette';
import {
  SLIDE_H,
  SLIDE_W,
  SLIDE_X,
  SLIDE_Y,
  ladderPoint,
  slideTop,
  slopePoint,
} from '../art/geometry';
import { SLIDE_TEX_SCALE } from '../art/props';
import { BGM_SLIDE } from '../core/audio';
import { allExited } from './gatherLogic';
import {
  CLIMB_SEC,
  MAX_CLIMBERS,
  ROLE_CLIMB,
  ROLE_LANDED,
  ROLE_QUEUE,
  ROLE_SLIDE,
  ROLE_TOP,
  SLIDE_SEC,
  TOP_PAUSE,
  allSlid,
  climberCount,
  slidFraction,
  slideEase,
} from './slideLogic';

const KID_COUNT = 20;
const RUN_TIMEOUT = 4;
/** Seconds between kids when the scene feeds itself. */
const AUTO_INTERVAL = 0.9;
/** Minimum gap between two kids being sent up by one continuous drag. */
const SEND_COOLDOWN = 0.32;

type Phase = 'play' | 'running' | 'done';

export class SlideScene extends CrowdScene {
  override readonly name = 'slide';
  override readonly tint = SCENE_TINTS[5];

  private phase: Phase = 'play';
  private phaseTime = 0;
  private slideSprite!: Sprite;
  private roles: number[] = [];
  private t: number[] = [];
  private fromX: number[] = [];
  private fromY: number[] = [];
  /** True for a kid at the top who is waiting to be told to go. */
  private waiting: boolean[] = [];
  private queueX: number[] = [];
  private queueY: number[] = [];
  private autoPilot = false;
  private autoTimer = 0;
  private sendCooldown = 0;
  private topBounce = 0;
  /** Reused so the per-frame maths allocates nothing. */
  private tmp = { x: 0, y: 0 };

  override enter(ctx: SceneContext): void {
    super.enter(ctx);
    const crowd = new Crowd({
      followForce: 620,
      bounds: { left: -SAFE * 0.7, top: -SAFE * 0.6, right: SAFE * 0.7, bottom: SAFE * 0.6 },
    });
    crowd.spawn(KID_COUNT);
    this.setupCrowd(ctx, crowd);

    this.slideSprite = new Sprite(ctx.props.slide);
    this.slideSprite.anchor.set(0, 0);
    this.slideSprite.scale.set(1 / SLIDE_TEX_SCALE);
    this.slideSprite.position.set(SLIDE_X, SLIDE_Y);
    this.propLayer.addChild(this.slideSprite);

    const ladderFoot = ladderPoint(0, this.tmp);
    const footX = ladderFoot.x;
    const footY = ladderFoot.y;
    for (let i = 0; i < crowd.kids.length; i++) {
      this.roles.push(ROLE_QUEUE);
      this.t.push(0);
      this.fromX.push(0);
      this.fromY.push(0);
      this.waiting.push(false);
      // The queue: two loose rows trailing away from the foot of the ladder,
      // with a visible gap right at the bottom rung.
      const row = i % 2;
      const along = Math.floor(i / 2);
      this.queueX.push(footX - 150 - along * 66 - row * 26);
      this.queueY.push(footY + 40 + row * 62);
      const k = crowd.kids[i];
      k.x = this.queueX[i];
      k.y = this.queueY[i];
      k.facing = 1;
    }

    // ...and one kid is already up there, waiting for a nudge.
    this.sit(0);
    this.waiting[0] = true;

    this.fitToViewport();
    ctx.viewport.onChange(() => this.fitToViewport());
    ctx.audio.bgm.play(BGM_SLIDE);
  }

  private fitToViewport(): void {
    const l = this.ctx.viewport.layout;
    const halfW = Math.min(l.worldWidth, SAFE * 1.7) / 2;
    const halfH = Math.min(l.worldHeight, SAFE * 1.7) / 2;
    this.crowd.bounds.left = -halfW - 120;
    this.crowd.bounds.right = halfW + 900;
    this.crowd.bounds.top = -halfH;
    this.crowd.bounds.bottom = halfH;
    this.exitX = halfW + 300;
  }

  // ---- roles -------------------------------------------------------------

  private sit(i: number): void {
    const k = this.crowd.kids[i];
    this.roles[i] = ROLE_TOP;
    this.t[i] = 0;
    k.frozen = true;
    k.locked = true;
    k.hasTarget = false;
    k.setState('sit', true);
    slideTop(this.tmp);
    k.x = this.tmp.x;
    k.y = this.tmp.y;
    k.facing = 1;
  }

  /** Sends one queueing kid up the ladder. */
  private climb(i: number): void {
    const k = this.crowd.kids[i];
    this.roles[i] = ROLE_CLIMB;
    this.t[i] = 0;
    this.fromX[i] = k.x;
    this.fromY[i] = k.y;
    k.frozen = true;
    k.locked = true;
    k.hasTarget = false;
    k.setState('climb', true);
    k.facing = 1;
    this.ctx.audio.sfx.play('pote', { gain: 0.5, detune: 200 });
  }

  /** The kid at the top lets go. */
  private letGo(i: number): void {
    if (this.roles[i] !== ROLE_TOP) return;
    const k = this.crowd.kids[i];
    this.roles[i] = ROLE_SLIDE;
    this.waiting[i] = false;
    this.t[i] = 0;
    k.setState('sit', true);
    this.ctx.audio.sfx.play('whee', { gain: 0.75, detune: (Math.random() - 0.5) * 300 });
  }

  /** Off the end of the slope, laughing. */
  private land(i: number): void {
    const k = this.crowd.kids[i];
    this.roles[i] = ROLE_LANDED;
    k.frozen = false;
    k.locked = false;
    k.setState('laugh', true);
    k.vx = 180;
    k.vy = -20;
    // Off to the right of the slide, out of the way of the next one down.
    k.targetX = SLIDE_X + SLIDE_W + 60 + (i % 4) * 54;
    k.targetY = SLIDE_Y + SLIDE_H - 40 + (i % 3) * 46;
    k.hasTarget = true;
    this.confetti.burst(k.x, k.y - 60, 8, 220);
    this.ctx.audio.sfx.play('giggle', { gain: 0.6, detune: (Math.random() - 0.5) * 400 });
  }

  /** The nearest queueing kid starts climbing, if the ladder has room. */
  private sendNearest(x: number, y: number, radius: number): boolean {
    if (climberCount(this.roles) >= MAX_CLIMBERS) return false;
    const kids = this.crowd.kids;
    let best = -1;
    let bestD2 = radius === Number.POSITIVE_INFINITY ? Infinity : radius * radius;
    for (let i = 0; i < kids.length; i++) {
      if (this.roles[i] !== ROLE_QUEUE) continue;
      const dx = kids[i].x - x;
      const dy = kids[i].y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    if (best < 0) return false;
    this.climb(best);
    return true;
  }

  /** True when (x, y) is near the top of the slide. */
  private nearTop(x: number, y: number, radius: number): boolean {
    slideTop(this.tmp);
    const dx = x - this.tmp.x;
    const dy = y - this.tmp.y;
    return dx * dx + dy * dy <= radius * radius;
  }

  // ---- interaction -------------------------------------------------------

  override onHand(ev: HandEvent): void {
    super.onHand(ev);
    if (this.phase !== 'play') return;
    if (ev.phase !== 'up' || !ev.isTap) return;
    const { x, y, radius } = ev.hand;
    if (this.nearTop(x, y, radius * 1.3)) {
      for (let i = 0; i < this.roles.length; i++) {
        if (this.roles[i] === ROLE_TOP) {
          this.letGo(i);
          return;
        }
      }
    }
    // Anywhere else: whoever is nearest joins the ladder. A tap always does
    // something, wherever it lands.
    if (this.sendNearest(x, y, Number.POSITIVE_INFINITY)) return;
    // Nobody left to send up (or the ladder is full): a tap anywhere now
    // nudges whoever is sitting at the top instead. Without this, the one kid
    // who starts the scene sitting up there can only be released by a tap that
    // lands on him, and a child who taps everywhere else waits for nothing.
    for (let i = 0; i < this.roles.length; i++) {
      if (this.roles[i] === ROLE_TOP) {
        this.letGo(i);
        return;
      }
    }
  }

  override applyHands(hands: Iterable<Hand>, dt: number): void {
    super.applyHands(hands, dt);
    if (this.phase !== 'play') return;
    if (this.sendCooldown > 0) return;
    const foot = ladderPoint(0, this.tmp);
    for (const hand of hands) {
      if (!hand.active) continue;
      // Dragging towards the ladder sends kids up it: the finger's own
      // direction decides, which is the natural mapping the plan asks for.
      const towards = (foot.x - hand.x) * hand.vx + (foot.y - hand.y) * hand.vy;
      if (towards <= 0) continue;
      if (this.sendNearest(hand.x, hand.y, hand.radius * 1.2)) {
        this.sendCooldown = SEND_COOLDOWN;
        return;
      }
    }
  }

  // ---- update ------------------------------------------------------------

  override update(dt: number): void {
    super.update(dt);
    this.time += dt;
    this.phaseTime += dt;
    if (this.sendCooldown > 0) this.sendCooldown -= dt;
    if (this.topBounce > 0) this.topBounce = Math.max(0, this.topBounce - dt);

    const kids = this.crowd.kids;

    if (this.phase === 'play') {
      if (this.autoPilot) {
        this.autoTimer -= dt;
        if (this.autoTimer <= 0) {
          this.autoTimer = AUTO_INTERVAL;
          for (let i = 0; i < this.roles.length; i++) {
            if (this.roles[i] === ROLE_TOP && this.waiting[i]) this.letGo(i);
          }
          this.sendNearest(0, 0, Number.POSITIVE_INFINITY);
        }
      }

      for (let i = 0; i < kids.length; i++) {
        const k = kids[i];
        const role = this.roles[i];
        if (role === ROLE_QUEUE) {
          k.targetX = this.queueX[i];
          k.targetY = this.queueY[i];
          k.hasTarget = true;
        } else if (role === ROLE_CLIMB) {
          this.t[i] += dt / CLIMB_SEC;
          const u = Math.min(1, this.t[i]);
          ladderPoint(u, this.tmp);
          // Walk across to the ladder first, then up it.
          const blend = Math.min(1, u * 2.2);
          k.x = this.fromX[i] + (this.tmp.x - this.fromX[i]) * blend;
          k.y = this.fromY[i] + (this.tmp.y - this.fromY[i]) * blend;
          if (u >= 1) this.sit(i);
        } else if (role === ROLE_TOP) {
          this.t[i] += dt;
          slideTop(this.tmp);
          k.x = this.tmp.x + (this.topBounce > 0 ? 8 : 0);
          k.y = this.tmp.y - (this.topBounce > 0 ? Math.abs(Math.sin(this.time * 9)) * 12 : 0);
          if (!this.waiting[i] && this.t[i] >= TOP_PAUSE) this.letGo(i);
        } else if (role === ROLE_SLIDE) {
          this.t[i] += dt / SLIDE_SEC;
          const u = Math.min(1, this.t[i]);
          slopePoint(slideEase(u), this.tmp);
          k.x = this.tmp.x;
          // Sit on top of the slope, not inside it.
          k.y = this.tmp.y + 6;
          k.frame = u > 0.25 ? 1 : 0;
          if (u >= 1) this.land(i);
        }
      }

      if (allSlid(this.roles)) this.beginRun();
    }

    this.crowd.update(dt);

    if (this.phase === 'running') {
      if (allExited(kids, this.exitX) || this.phaseTime >= RUN_TIMEOUT) this.phase = 'done';
    }

    this.syncSprites(dt);
  }

  private beginRun(): void {
    this.phase = 'running';
    this.phaseTime = 0;
    this.runOff();
    this.ctx.audio.sfx.play('whee', { gain: 0.6 });
  }

  /** 8-12s with no touch: the kid at the top shuffles, and one sets off. */
  override onIdleHint(): void {
    if (this.phase !== 'play') return;
    this.topBounce = 2.2;
    this.ctx.audio.sfx.play('giggle', { gain: 0.5 });
    const foot = ladderPoint(0, this.tmp);
    for (let i = 0; i < this.roles.length; i++) {
      if (this.roles[i] !== ROLE_QUEUE) continue;
      const k = this.crowd.kids[i];
      k.targetX = foot.x - 70;
      k.targetY = foot.y + 20;
      k.hasTarget = true;
      this.queueX[i] = k.targetX;
      this.queueY[i] = k.targetY;
      break;
    }
  }

  /** 30s with no touch: the slide runs itself, one kid at a time. */
  override onAutoAdvance(): void {
    if (this.phase !== 'play') return;
    this.autoPilot = true;
    this.autoTimer = 0;
  }

  override finishNow(): void {
    if (this.phase === 'play') {
      for (let i = 0; i < this.roles.length; i++) {
        if (this.roles[i] === ROLE_LANDED) continue;
        const k = this.crowd.kids[i];
        slopePoint(1, this.tmp);
        k.x = this.tmp.x;
        k.y = this.tmp.y;
        this.land(i);
      }
      this.beginRun();
    }
    this.phase = 'done';
  }

  override progress(): number {
    if (this.phase === 'play') return 0.9 * slidFraction(this.roles);
    if (this.phase === 'running') return 0.9 + 0.1 * Math.min(1, this.phaseTime / RUN_TIMEOUT);
    return 1;
  }

  /** Debug/e2e only. */
  debugPhase(): string {
    return this.phase;
  }

  /** Debug/e2e only: how many kids have been down the slide. */
  debugSlid(): number {
    let n = 0;
    for (let i = 0; i < this.roles.length; i++) if (this.roles[i] === ROLE_LANDED) n++;
    return n;
  }

  override isDone(): boolean {
    return this.phase === 'done';
  }

  override exit(): void {
    super.exit();
    this.roles.length = 0;
    this.t.length = 0;
    this.queueX.length = 0;
    this.queueY.length = 0;
  }
}

export default function createSlide(): SlideScene {
  return new SlideScene();
}
