/**
 * Scene 3 「くすぐり」 — tickling.
 *
 * The world's invitation (§2.2 signifier, §2.3 physical causality): a dense,
 * friendly crowd in which exactly one kid is already shaking with laughter.
 * Everyone near them is watching. Touching anybody does the obvious thing.
 *
 * State machine
 *   crowd    : a tap tickles whoever it lands on; a dragged finger tickles
 *              everything it passes over. Every SPREAD_INTERVAL the laughter
 *              spreads one ring further through the neighbours on its own.
 *              -> when every kid is laughing
 *   tumbling : the whole crowd falls about laughing and rolls off the right
 *              edge; the director pans after them.
 *              -> last kid past exitX (or ROLL_TIMEOUT)
 *   done
 *
 * Idle hint (8-12s): the kid who is already laughing laughs harder and sets
 * off one neighbour. Auto-advance (30s): the chain spreads by itself, fast.
 */
import { CrowdScene } from './crowdScene';
import type { SceneContext } from '../core/scene';
import type { Hand, HandEvent } from '../core/input';
import { Crowd } from '../crowd/crowd';
import { spreadContagion, wander } from '../crowd/behaviors';
import type { Kid } from '../crowd/kid';
import { SAFE } from '../core/viewport';
import { SCENE_TINTS } from '../art/palette';
import { BGM_TICKLE } from '../core/audio';
import { allExited } from './gatherLogic';
import {
  SPREAD_CHANCE,
  SPREAD_INTERVAL,
  SPREAD_RADIUS,
  allLaughing,
  laughingFraction,
} from './tickleLogic';

const KID_COUNT = 46;
const ROLL_TIMEOUT = 4;

type Phase = 'crowd' | 'tumbling' | 'done';

/** `Kid.tag` values used by this scene. */
const CALM = 0;
const LAUGHING = 1;

export class TickleScene extends CrowdScene {
  override readonly name = 'tickle';
  override readonly tint = SCENE_TINTS[2];

  private phase: Phase = 'crowd';
  private phaseTime = 0;
  private spreadTimer = 0;
  private chance = SPREAD_CHANCE;
  /** The one who is already laughing when the scene opens. */
  private firstIndex = 0;
  private flags: number[] = [];

  override enter(ctx: SceneContext): void {
    super.enter(ctx);
    const crowd = new Crowd({
      // Denser than the other scenes (the plan asks for a packed crowd here)
      // but still nowhere near shoulder to shoulder: no crush, ever.
      separationRadius: 52,
      bounds: { left: -SAFE * 0.6, top: -SAFE * 0.55, right: SAFE * 0.6, bottom: SAFE * 0.55 },
    });
    crowd.spawn(KID_COUNT);
    this.setupCrowd(ctx, crowd);
    for (let i = 0; i < crowd.kids.length; i++) {
      crowd.kids[i].tag = CALM;
      this.flags.push(CALM);
    }
    this.fitToViewport();
    ctx.viewport.onChange(() => this.fitToViewport());

    // One kid is already going, right in the middle of the crowd.
    this.firstIndex = Math.floor(crowd.kids.length / 2);
    this.tickle(crowd.kids[this.firstIndex], this.firstIndex, false);

    ctx.audio.bgm.play(BGM_TICKLE);
  }

  private fitToViewport(): void {
    const l = this.ctx.viewport.layout;
    const halfW = Math.min(l.worldWidth, SAFE * 1.7) / 2;
    const halfH = Math.min(l.worldHeight, SAFE * 1.7) / 2;
    this.crowd.bounds.left = -halfW * 0.9;
    this.crowd.bounds.right = halfW + 900;
    this.crowd.bounds.top = -(halfH * 0.86);
    this.crowd.bounds.bottom = halfH * 0.86;
    this.exitX = halfW + 300;
    if (!this.laidOut) {
      this.laidOut = true;
      this.crowd.scatter(Math.min(halfW * 0.72, 380), Math.min(halfH * 0.62, 320));
    }
  }

  private laidOut = false;

  /** One kid starts laughing. Returns false if they already were. */
  private tickle(k: Kid, index: number, sound = true): boolean {
    if (k.tag === LAUGHING) return false;
    k.tag = LAUGHING;
    this.flags[index] = LAUGHING;
    k.setState('laugh', true);
    k.locked = true;
    if (sound) {
      this.ctx.audio.sfx.play('giggle', { gain: 0.5, detune: (Math.random() - 0.5) * 500 });
    }
    return true;
  }

  /** Everyone inside `radius` of (x, y) gets tickled. */
  private tickleAt(x: number, y: number, radius: number): number {
    const kids = this.crowd.kids;
    const r2 = radius * radius;
    let n = 0;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      const dx = k.x - x;
      const dy = k.y - y;
      if (dx * dx + dy * dy > r2) continue;
      if (this.tickle(k, i, n === 0)) n++;
    }
    return n;
  }

  // ---- interaction -------------------------------------------------------

  override onHand(ev: HandEvent): void {
    super.onHand(ev);
    if (this.phase !== 'crowd') return;
    if (ev.phase === 'up' && ev.isTap) {
      // A tap tickles who it landed on; if it landed on nobody it still
      // reaches for the closest kid, so a tap is never wasted.
      if (this.tickleAt(ev.hand.x, ev.hand.y, ev.hand.radius * 0.55) === 0) {
        this.tickleNearest(ev.hand.x, ev.hand.y);
      }
    }
  }

  override applyHands(hands: Iterable<Hand>, dt: number): void {
    super.applyHands(hands, dt);
    if (this.phase !== 'crowd') return;
    for (const hand of hands) {
      if (!hand.active) continue;
      // A dragged finger tickles everything under it, continuously.
      this.tickleAt(hand.x, hand.y, hand.radius * 0.8);
    }
  }

  private tickleNearest(x: number, y: number): void {
    const kids = this.crowd.kids;
    let best = -1;
    let bestD2 = Infinity;
    for (let i = 0; i < kids.length; i++) {
      if (kids[i].tag === LAUGHING) continue;
      const dx = kids[i].x - x;
      const dy = kids[i].y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    if (best >= 0) this.tickle(kids[best], best);
  }

  // ---- update ------------------------------------------------------------

  override update(dt: number): void {
    super.update(dt);
    this.time += dt;
    this.phaseTime += dt;

    const kids = this.crowd.kids;

    if (this.phase === 'crowd') {
      wander(this.crowd, this.time, dt, 16);
      this.spreadTimer -= dt;
      if (this.spreadTimer <= 0) {
        this.spreadTimer = SPREAD_INTERVAL;
        const caught = spreadContagion(
          this.crowd,
          SPREAD_RADIUS,
          (k) => k.tag === LAUGHING,
          (k) => {
            k.tag = LAUGHING;
            k.setState('laugh', true);
            k.locked = true;
          },
          this.chance,
        );
        if (caught > 0) {
          this.ctx.audio.sfx.play('giggle', {
            gain: Math.min(0.9, 0.35 + caught * 0.06),
            detune: (Math.random() - 0.5) * 400,
          });
        }
      }
      // Mirror the kids' own tags back into the flag array the completion
      // test reads, so contagion and touches agree about who is laughing.
      for (let i = 0; i < kids.length; i++) this.flags[i] = kids[i].tag;
      if (allLaughing(this.flags)) this.beginTumble();
    }

    // A laugh is a 1.6s animation; a kid who is laughing keeps re-starting it,
    // and shakes from side to side while they do.
    if (this.phase !== 'done') {
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i];
        if (k.tag !== LAUGHING) continue;
        if (this.phase === 'crowd' && k.state !== 'laugh') k.setState('laugh', true);
        this.extraScale[i] = 1 + Math.sin(this.time * 9 + k.wanderPhase) * 0.05;
      }
    }

    this.crowd.update(dt);

    if (this.phase === 'tumbling') {
      if (allExited(kids, this.exitX) || this.phaseTime >= ROLL_TIMEOUT) this.phase = 'done';
    }

    this.syncSprites(dt);
  }

  private beginTumble(): void {
    this.phase = 'tumbling';
    this.phaseTime = 0;
    this.confetti.burst(0, -80, 28, 360);
    this.ctx.audio.sfx.play('laugh', { gain: 0.9 });
    this.ctx.audio.sfx.play('giggle', { gain: 0.8, detune: 200 });
    this.rollOff();
  }

  /** 8-12s with no touch: the first kid laughs harder and infects a neighbour. */
  override onIdleHint(): void {
    if (this.phase !== 'crowd') return;
    const first = this.crowd.kids[this.firstIndex];
    this.extraScale[this.firstIndex] = 1.25;
    this.ctx.audio.sfx.play('giggle', { gain: 0.6 });
    spreadContagion(
      this.crowd,
      SPREAD_RADIUS,
      (k) => k === first,
      (k) => {
        k.tag = LAUGHING;
        k.setState('laugh', true);
        k.locked = true;
      },
      0.5,
    );
  }

  /** 30s with no touch: the giggle runs away with itself. */
  override onAutoAdvance(): void {
    if (this.phase !== 'crowd') return;
    this.chance = 1;
    this.spreadTimer = 0;
  }

  override finishNow(): void {
    if (this.phase === 'crowd') {
      const kids = this.crowd.kids;
      for (let i = 0; i < kids.length; i++) this.tickle(kids[i], i, false);
      this.beginTumble();
    }
    this.phase = 'done';
  }

  override progress(): number {
    if (this.phase === 'crowd') return 0.9 * laughingFraction(this.flags);
    if (this.phase === 'tumbling') return 0.9 + 0.1 * Math.min(1, this.phaseTime / ROLL_TIMEOUT);
    return 1;
  }

  /** Debug/e2e only. */
  debugPhase(): string {
    return this.phase;
  }

  override isDone(): boolean {
    return this.phase === 'done';
  }

  override exit(): void {
    super.exit();
    this.flags.length = 0;
  }
}

export default function createTickle(): TickleScene {
  return new TickleScene();
}
