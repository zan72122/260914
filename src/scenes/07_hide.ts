/**
 * Scene 7 「かくれんぼ」 — hide and seek.
 *
 * The world's invitation (§2.5 perceptual incompleteness, §2.6 feedback): a
 * field of round green bushes with pairs of feet sticking out underneath them,
 * and here and there the top of a head. Something is obviously in there.
 *
 * State machine
 *   seek    : tapping (or dragging across) a bush makes everybody inside it
 *             spring out with a "ba!", laughing, and go and play in the open.
 *             -> when every bush is empty
 *   running : the whole crowd runs off the right edge.
 *             -> last kid past exitX (or RUN_TIMEOUT)
 *   done
 *
 * Idle hint (8-12s): one bush that still has somebody in it shakes, and the
 * feet underneath it shuffle. Auto-advance (30s): the bushes give their
 * occupants up one at a time.
 */
import { Container, Sprite } from 'pixi.js';
import { CrowdScene } from './crowdScene';
import type { SceneContext } from '../core/scene';
import type { Hand, HandEvent } from '../core/input';
import { Crowd } from '../crowd/crowd';
import { wander } from '../crowd/behaviors';
import { SAFE } from '../core/viewport';
import { SCENE_TINTS } from '../art/palette';
import { BGM_HIDE } from '../core/audio';
import { allExited } from './gatherLogic';
import {
  BUSH_SPOTS,
  FOUND,
  HIDDEN,
  POPPING,
  POP_LIFT,
  POP_SEC,
  allFound,
  firstHidingBush,
  foundFraction,
  insideBush,
} from './hideLogic';

/** How many kids hide behind each bush. */
const PER_BUSH = 4;
const RUN_TIMEOUT = 4;
/** Seconds between bushes when the scene finds them itself. */
const AUTO_INTERVAL = 0.8;

type Phase = 'seek' | 'running' | 'done';

export class HideScene extends CrowdScene {
  override readonly name = 'hide';
  override readonly tint = SCENE_TINTS[6];

  private phase: Phase = 'seek';
  private phaseTime = 0;
  /** Bushes are drawn OVER the kids, which is what makes them hiding places. */
  private bushLayer = new Container();
  private bushes: Sprite[] = [];
  private bushShake: number[] = [];
  private states: number[] = [];
  private bushOf: number[] = [];
  private popT: number[] = [];
  private fromX: number[] = [];
  private fromY: number[] = [];
  private toX: number[] = [];
  private toY: number[] = [];
  private autoPilot = false;
  private autoTimer = 0;

  override enter(ctx: SceneContext): void {
    super.enter(ctx);
    const crowd = new Crowd({
      bounds: { left: -SAFE * 0.7, top: -SAFE * 0.6, right: SAFE * 0.7, bottom: SAFE * 0.6 },
    });
    crowd.spawn(BUSH_SPOTS.length * PER_BUSH);
    this.setupCrowd(ctx, crowd);

    for (let b = 0; b < BUSH_SPOTS.length; b++) {
      const s = new Sprite(ctx.props.bush);
      s.anchor.set(0.5);
      s.position.set(BUSH_SPOTS[b][0], BUSH_SPOTS[b][1]);
      this.bushLayer.addChild(s);
      this.bushes.push(s);
      this.bushShake.push(0);
    }
    this.bushLayer.sortableChildren = false;
    ctx.stage.addChild(this.bushLayer);
    // ...and the finger rings stay on top of the bushes.
    ctx.stage.addChild(this.fxLayer);

    for (let i = 0; i < crowd.kids.length; i++) {
      const b = Math.floor(i / PER_BUSH);
      const j = i % PER_BUSH;
      this.states.push(HIDDEN);
      this.bushOf.push(b);
      this.popT.push(0);
      this.fromX.push(0);
      this.fromY.push(0);
      this.toX.push(0);
      this.toY.push(0);
      const k = crowd.kids[i];
      k.tag = b;
      k.frozen = true;
      k.locked = true;
      k.hasTarget = false;
      k.setState('idle', true);
      k.x = BUSH_SPOTS[b][0] + (j - (PER_BUSH - 1) / 2) * 44;
      // Feet below the bush, head safely behind it — except for one kid per
      // bush who is a bit too tall and gives the game away.
      k.y = BUSH_SPOTS[b][1] + (j === 1 ? 28 : 78) + (j % 2) * 6;
    }

    this.fitToViewport();
    ctx.viewport.onChange(() => this.fitToViewport());
    ctx.audio.bgm.play(BGM_HIDE);
  }

  private fitToViewport(): void {
    const l = this.ctx.viewport.layout;
    const halfW = Math.min(l.worldWidth, SAFE * 1.7) / 2;
    const halfH = Math.min(l.worldHeight, SAFE * 1.7) / 2;
    this.crowd.bounds.left = -halfW;
    this.crowd.bounds.right = halfW + 900;
    this.crowd.bounds.top = -halfH;
    this.crowd.bounds.bottom = halfH;
    this.exitX = halfW + 300;
  }

  // ---- interaction -------------------------------------------------------

  /** Empties bush `b`. Returns how many kids came out. */
  private reveal(b: number): number {
    let n = 0;
    for (let i = 0; i < this.states.length; i++) {
      if (this.states[i] !== HIDDEN || this.bushOf[i] !== b) continue;
      const k = this.crowd.kids[i];
      this.states[i] = POPPING;
      this.popT[i] = 0;
      this.fromX[i] = k.x;
      this.fromY[i] = k.y;
      // Out in a fan, away from the bush.
      const a = -Math.PI * 0.75 + n * (Math.PI * 0.5) / Math.max(1, PER_BUSH - 1);
      this.toX[i] = BUSH_SPOTS[b][0] + Math.cos(a) * 170;
      this.toY[i] = BUSH_SPOTS[b][1] + 110 + Math.sin(a) * 60;
      k.setState('jump', true);
      k.facing = this.toX[i] > k.x ? 1 : -1;
      n++;
    }
    if (n > 0) {
      this.bushShake[b] = 0.45;
      this.confetti.burst(BUSH_SPOTS[b][0], BUSH_SPOTS[b][1] - 40, 12, 280);
      this.ctx.audio.sfx.play('ba', { gain: 0.85, detune: (Math.random() - 0.5) * 400 });
      this.ctx.audio.sfx.play('giggle', { gain: 0.6, detune: (Math.random() - 0.5) * 300 });
    }
    return n;
  }

  /** Finds the bush under a point and empties it. */
  private revealAt(x: number, y: number, slack: number): number {
    for (let b = 0; b < BUSH_SPOTS.length; b++) {
      if (!insideBush(BUSH_SPOTS[b][0], BUSH_SPOTS[b][1], x, y, slack)) continue;
      return this.reveal(b);
    }
    return 0;
  }

  override onHand(ev: HandEvent): void {
    super.onHand(ev);
    if (this.phase !== 'seek') return;
    if (ev.phase !== 'up' || !ev.isTap) return;
    if (this.revealAt(ev.hand.x, ev.hand.y, 30) > 0) return;
    // A tap on open grass still shakes the nearest bush that has somebody in
    // it, so a wild tap is a clue rather than nothing at all.
    let best = -1;
    let bestD2 = Infinity;
    for (let b = 0; b < BUSH_SPOTS.length; b++) {
      if (!this.bushHasSomebody(b)) continue;
      const dx = BUSH_SPOTS[b][0] - ev.hand.x;
      const dy = BUSH_SPOTS[b][1] - ev.hand.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = b;
      }
    }
    if (best >= 0) this.bushShake[best] = 0.5;
  }

  override applyHands(hands: Iterable<Hand>, dt: number): void {
    super.applyHands(hands, dt);
    if (this.phase !== 'seek') return;
    for (const hand of hands) {
      if (!hand.active) continue;
      // Sweeping a finger through the bushes finds them all: the easiest
      // possible gesture works, which is the point.
      this.revealAt(hand.x, hand.y, 10);
    }
  }

  private bushHasSomebody(b: number): boolean {
    for (let i = 0; i < this.states.length; i++) {
      if (this.bushOf[i] === b && this.states[i] === HIDDEN) return true;
    }
    return false;
  }

  // ---- update ------------------------------------------------------------

  override update(dt: number): void {
    super.update(dt);
    this.time += dt;
    this.phaseTime += dt;

    const kids = this.crowd.kids;

    if (this.phase === 'seek') {
      if (this.autoPilot) {
        this.autoTimer -= dt;
        if (this.autoTimer <= 0) {
          this.autoTimer = AUTO_INTERVAL;
          const b = firstHidingBush(this.states, this.bushOf);
          if (b >= 0) this.reveal(b);
        }
      }

      for (let i = 0; i < kids.length; i++) {
        if (this.states[i] !== POPPING) continue;
        this.popT[i] += dt / POP_SEC;
        const t = Math.min(1, this.popT[i]);
        const k = kids[i];
        k.x = this.fromX[i] + (this.toX[i] - this.fromX[i]) * t;
        k.y = this.fromY[i] + (this.toY[i] - this.fromY[i]) * t - Math.sin(t * Math.PI) * POP_LIFT;
        if (t >= 1) {
          this.states[i] = FOUND;
          k.frozen = false;
          k.locked = false;
          k.setState('laugh', true);
          k.hasTarget = false;
        }
      }

      wander(this.crowd, this.time, dt, 26);
      if (allFound(this.states)) this.beginRun();
    }

    // Bushes wobble when something happens inside them.
    for (let b = 0; b < this.bushes.length; b++) {
      const s = this.bushes[b];
      if (this.bushShake[b] > 0) {
        this.bushShake[b] = Math.max(0, this.bushShake[b] - dt);
        const w = this.bushShake[b];
        s.rotation = Math.sin(this.time * 26) * 0.07 * w;
        s.scale.set(1 + w * 0.06, 1 - w * 0.04);
      } else if (s.rotation !== 0) {
        s.rotation = 0;
        s.scale.set(1);
      }
      // An emptied bush settles a little, so "found" is visible at a glance.
      s.alpha = this.bushHasSomebody(b) ? 1 : 0.82;
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

  /** 8-12s with no touch: a bush with somebody in it gives itself a shake. */
  override onIdleHint(): void {
    if (this.phase !== 'seek') return;
    const b = firstHidingBush(this.states, this.bushOf);
    if (b < 0) return;
    this.bushShake[b] = 2.2;
    this.ctx.audio.sfx.play('giggle', { gain: 0.45 });
  }

  /** 30s with no touch: the bushes give everybody up, one at a time. */
  override onAutoAdvance(): void {
    if (this.phase !== 'seek') return;
    this.autoPilot = true;
    this.autoTimer = 0;
  }

  override finishNow(): void {
    if (this.phase === 'seek') {
      for (let b = 0; b < BUSH_SPOTS.length; b++) this.reveal(b);
      for (let i = 0; i < this.states.length; i++) {
        if (this.states[i] === FOUND) continue;
        this.states[i] = FOUND;
        const k = this.crowd.kids[i];
        k.frozen = false;
        k.locked = false;
      }
      this.beginRun();
    }
    this.phase = 'done';
  }

  override progress(): number {
    if (this.phase === 'seek') return 0.9 * foundFraction(this.states);
    if (this.phase === 'running') return 0.9 + 0.1 * Math.min(1, this.phaseTime / RUN_TIMEOUT);
    return 1;
  }

  /** Debug/e2e only. */
  debugPhase(): string {
    return this.phase;
  }

  /** Debug/e2e only: how many kids have been found. */
  debugFound(): number {
    let n = 0;
    for (let i = 0; i < this.states.length; i++) if (this.states[i] === FOUND) n++;
    return n;
  }

  override isDone(): boolean {
    return this.phase === 'done';
  }

  override exit(): void {
    super.exit();
    this.bushLayer.destroy({ children: true });
    this.bushes.length = 0;
    this.states.length = 0;
    this.bushOf.length = 0;
  }
}

export default function createHide(): HideScene {
  return new HideScene();
}
