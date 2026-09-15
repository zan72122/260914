/**
 * Scene 10 「おやすみ」 — goodnight.
 *
 * The world's invitation (§2.2 signifier, §2.6 feedback): the paper has turned
 * a deep lavender — night, never black, because nothing in this game is ever
 * frightening — a couple of kids are already curled up asleep on the grass,
 * and there is exactly one star in the sky.
 *
 * State machine
 *   night   : every touch puts a new star in the sky where the finger was, and
 *             the kids nearest to it lie down and fall asleep with a soft
 *             breath. The sky fills up with stars as the field empties.
 *             -> when everybody is asleep
 *   morning : the paper brightens from night to morning and the kids brighten
 *             with it, still asleep.
 *             -> after DAWN_SEC + MORNING_SEC
 *   done    : the director wraps round to scene 1, which is built from scratch
 *             — a complete reset, as decided in §10.3 of the plan.
 *
 * Idle hint (8-12s): a star of its own appears and one more kid lies down.
 * Auto-advance (30s): the field goes to sleep by itself, one kid at a time.
 */
import { Sprite } from 'pixi.js';
import { CrowdScene } from './crowdScene';
import type { SceneContext } from '../core/scene';
import type { Hand, HandEvent } from '../core/input';
import { Crowd } from '../crowd/crowd';
import { wander } from '../crowd/behaviors';
import { SAFE } from '../core/viewport';
import { MORNING, NIGHT, NIGHT_KID_TINT, SCENE_TINTS } from '../art/palette';
import { BGM_SLEEP } from '../core/audio';
import {
  ASLEEP,
  AWAKE,
  DAWN_SEC,
  MAX_STARS,
  MORNING_SEC,
  SLEEPERS_PER_TAP,
  allAsleep,
  asleepFraction,
  mixColor,
  twinkle,
} from './sleepLogic';

const KID_COUNT = 28;
/** How many kids are already asleep when the scene opens. */
const ALREADY_ASLEEP = 2;
/** Seconds between kids when the field puts itself to bed. */
const AUTO_INTERVAL = 0.55;
/** Minimum gap between two stars placed by one continuous drag. */
const STAR_COOLDOWN = 0.18;

type Phase = 'night' | 'morning' | 'done';

export class SleepScene extends CrowdScene {
  override readonly name = 'sleep';
  override readonly tint = SCENE_TINTS[9];

  private phase: Phase = 'night';
  private phaseTime = 0;
  private states: number[] = [];
  private stars: Sprite[] = [];
  private starPhase: number[] = [];
  private starAge: number[] = [];
  private starCount = 0;
  private starCooldown = 0;
  private breathTimer = 0;
  private autoPilot = false;
  private autoTimer = 0;
  private laidOut = false;

  override enter(ctx: SceneContext): void {
    super.enter(ctx);
    const crowd = new Crowd({
      separationRadius: 70,
      maxSpeed: 120,
      bounds: { left: -SAFE * 0.7, top: -SAFE * 0.6, right: SAFE * 0.7, bottom: SAFE * 0.6 },
    });
    crowd.spawn(KID_COUNT);
    this.setupCrowd(ctx, crowd);
    this.kidTint = NIGHT_KID_TINT;

    for (let i = 0; i < MAX_STARS; i++) {
      const s = new Sprite(ctx.props.star);
      s.anchor.set(0.5);
      s.visible = false;
      this.propLayer.addChild(s);
      this.stars.push(s);
      this.starPhase.push((i * 1.7) % 6.283);
      this.starAge.push(0);
    }

    for (let i = 0; i < crowd.kids.length; i++) this.states.push(AWAKE);
    this.fitToViewport();
    ctx.viewport.onChange(() => this.fitToViewport());

    // One star is already out...
    this.addStar(-260, -330);
    // ...and a couple of kids have already given up and gone to sleep.
    for (let i = 0; i < ALREADY_ASLEEP; i++) this.sleep(i, false);

    ctx.audio.bgm.play(BGM_SLEEP);
  }

  private fitToViewport(): void {
    const l = this.ctx.viewport.layout;
    const halfW = Math.min(l.worldWidth, SAFE * 1.7) / 2;
    const halfH = Math.min(l.worldHeight, SAFE * 1.7) / 2;
    this.crowd.bounds.left = -halfW;
    this.crowd.bounds.right = halfW;
    this.crowd.bounds.top = -halfH;
    this.crowd.bounds.bottom = halfH;
    this.exitX = halfW + 300;
    if (!this.laidOut) {
      this.laidOut = true;
      // Lying down takes room sideways, so the field is laid out wide.
      this.crowd.scatter(Math.min(halfW * 0.8, 400), Math.min(halfH * 0.5, 270));
      for (const k of this.crowd.kids) k.y += 130;
    }
  }

  // ---- stars and sleepers ------------------------------------------------

  /** Lights a star at (x, y), recycling the oldest one when the sky is full. */
  private addStar(x: number, y: number): void {
    const slot = this.starCount < MAX_STARS ? this.starCount++ : this.oldestStar();
    const s = this.stars[slot];
    s.position.set(x, y);
    s.visible = true;
    s.scale.set(0.5);
    this.starAge[slot] = 0;
    this.ctx.audio.sfx.play('twinkle', { gain: 0.5, detune: (Math.random() - 0.5) * 900 });
  }

  private oldestStar(): number {
    let best = 0;
    for (let i = 1; i < this.starCount; i++) if (this.starAge[i] > this.starAge[best]) best = i;
    return best;
  }

  /** One kid lies down and goes to sleep. */
  private sleep(i: number, sound = true): boolean {
    if (this.states[i] !== AWAKE) return false;
    const k = this.crowd.kids[i];
    this.states[i] = ASLEEP;
    k.hasTarget = false;
    k.vx = 0;
    k.vy = 0;
    k.locked = true;
    k.setState('sleep', true);
    if (sound) this.ctx.audio.sfx.play('breath', { gain: 0.7, detune: (Math.random() - 0.5) * 300 });
    return true;
  }

  /** The `max` kids nearest to (x, y) who are still awake go to sleep. */
  private sleepNearest(x: number, y: number, max: number): number {
    const kids = this.crowd.kids;
    let sent = 0;
    for (let pick = 0; pick < max; pick++) {
      let best = -1;
      let bestD2 = Infinity;
      for (let i = 0; i < kids.length; i++) {
        if (this.states[i] !== AWAKE) continue;
        const dx = kids[i].x - x;
        const dy = kids[i].y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = i;
        }
      }
      if (best < 0) break;
      if (this.sleep(best, sent === 0)) sent++;
    }
    return sent;
  }

  // ---- interaction -------------------------------------------------------

  override onHand(ev: HandEvent): void {
    super.onHand(ev);
    if (this.phase !== 'night') return;
    if (ev.phase === 'down') {
      this.addStar(ev.hand.x, ev.hand.y);
      this.starCooldown = STAR_COOLDOWN;
    }
    if (ev.phase === 'up' && ev.isTap) {
      this.sleepNearest(ev.hand.x, ev.hand.y, SLEEPERS_PER_TAP);
    }
  }

  override applyHands(hands: Iterable<Hand>, dt: number): void {
    super.applyHands(hands, dt);
    if (this.phase !== 'night') return;
    if (this.starCooldown > 0) {
      this.starCooldown -= dt;
      return;
    }
    for (const hand of hands) {
      if (!hand.active) continue;
      // A finger trailed across the sky leaves a trail of stars behind it.
      this.addStar(hand.x, hand.y);
      this.starCooldown = STAR_COOLDOWN;
      this.sleepNearest(hand.x, hand.y, 1);
      return;
    }
  }

  // ---- update ------------------------------------------------------------

  override update(dt: number): void {
    super.update(dt);
    this.time += dt;
    this.phaseTime += dt;

    if (this.phase === 'night') {
      if (this.autoPilot) {
        this.autoTimer -= dt;
        if (this.autoTimer <= 0) {
          this.autoTimer = AUTO_INTERVAL;
          const kids = this.crowd.kids;
          for (let i = 0; i < kids.length; i++) {
            if (this.sleep(i)) {
              this.addStar(kids[i].x + 40, kids[i].y - 420);
              break;
            }
          }
        }
      }
      // The awake ones potter about sleepily; nobody stands to attention.
      wander(this.crowd, this.time, dt, 12);
      // A soft breath from the sleeping ones, every few seconds.
      this.breathTimer -= dt;
      if (this.breathTimer <= 0) {
        this.breathTimer = 2.6;
        if (asleepFraction(this.states) > 0) {
          this.ctx.audio.sfx.play('breath', { gain: 0.35, detune: -200 });
        }
      }
      if (allAsleep(this.states)) {
        this.phase = 'morning';
        this.phaseTime = 0;
        // The sky brightens: this is the only "ending" in the game.
        this.ctx.setTint(MORNING, DAWN_SEC);
      }
    } else if (this.phase === 'morning') {
      const t = Math.min(1, this.phaseTime / DAWN_SEC);
      this.kidTint = mixColor(NIGHT_KID_TINT, 0xffffff, t);
      // The stars fade out as the sun comes up.
      for (let i = 0; i < this.starCount; i++) this.stars[i].alpha = 1 - t;
      if (this.phaseTime >= DAWN_SEC + MORNING_SEC) this.phase = 'done';
    }

    for (let i = 0; i < this.starCount; i++) {
      const s = this.stars[i];
      this.starAge[i] += dt;
      // A star pops into being and then breathes.
      const grow = Math.min(1, this.starAge[i] * 4);
      s.scale.set(grow * twinkle(this.time, this.starPhase[i]));
    }

    this.crowd.update(dt);
    this.syncSprites(dt);
  }

  /** 8-12s with no touch: a star lights itself and one more kid lies down. */
  override onIdleHint(): void {
    if (this.phase !== 'night') return;
    const kids = this.crowd.kids;
    for (let i = 0; i < kids.length; i++) {
      if (this.states[i] !== AWAKE) continue;
      this.addStar(kids[i].x + 30, kids[i].y - 430);
      this.sleep(i);
      break;
    }
  }

  /** 30s with no touch: the whole field puts itself to bed. */
  override onAutoAdvance(): void {
    if (this.phase !== 'night') return;
    this.autoPilot = true;
    this.autoTimer = 0;
  }

  override finishNow(): void {
    if (this.phase === 'night') {
      for (let i = 0; i < this.states.length; i++) this.sleep(i, false);
      this.phase = 'morning';
      this.phaseTime = 0;
      this.ctx.setTint(MORNING, DAWN_SEC);
    }
    this.phase = 'done';
    this.kidTint = 0xffffff;
  }

  override progress(): number {
    if (this.phase === 'night') return 0.85 * asleepFraction(this.states);
    if (this.phase === 'morning') {
      return 0.85 + 0.15 * Math.min(1, this.phaseTime / (DAWN_SEC + MORNING_SEC));
    }
    return 1;
  }

  /** Debug/e2e only. */
  debugPhase(): string {
    return this.phase;
  }

  /** Debug/e2e only: how many stars are in the sky. */
  debugStars(): number {
    return this.starCount;
  }

  /** Debug/e2e only: the paper colour this scene starts on. */
  debugNight(): number {
    return NIGHT;
  }

  override isDone(): boolean {
    return this.phase === 'done';
  }

  override exit(): void {
    super.exit();
    this.stars.length = 0;
    this.states.length = 0;
  }
}

export default function createSleep(): SleepScene {
  return new SleepScene();
}
