/**
 * Scene 9 「ぐらぐらタワー」 — the wobbly tower.
 *
 * The world's invitation (§2.2 signifier, §2.5 incompleteness): one kid is
 * standing with their arms up, and another is half way onto their shoulders,
 * clearly about to climb. An unfinished tower asks to be finished.
 *
 * State machine
 *   build   : a tap, or a finger dragged upwards, sends the nearest kid up the
 *             tower. The higher it gets the harder it sways (the sway is
 *             proportional to height, exactly like a real pile of children).
 *             -> once TOWER_MAX kids are up
 *   topple  : the tower comes apart into a heap of laughing children. Nobody
 *             is hurt, nobody is sad: falling over IS the joke.
 *             -> after TOPPLE_SEC
 *   running : everyone gets up and runs off the right edge.
 *             -> last kid past exitX (or RUN_TIMEOUT)
 *   done
 *
 * Idle hint (8-12s): the kid who is half way up has another go, and the tower
 * sways wider. Auto-advance (30s): the crowd builds the tower itself.
 */
import { CrowdScene } from './crowdScene';
import type { SceneContext } from '../core/scene';
import type { Hand, HandEvent } from '../core/input';
import { Crowd } from '../crowd/crowd';
import { wander } from '../crowd/behaviors';
import { SAFE } from '../core/viewport';
import { SCENE_TINTS } from '../art/palette';
import { KID_WORLD_H } from '../art/kidSheet';
import { BGM_TOWER } from '../core/audio';
import { allExited } from './gatherLogic';
import {
  CLIMB_SEC,
  CLIMBING,
  ON_GROUND,
  STACKED,
  TUMBLED,
  TOWER_MAX,
  shouldTopple,
  stackY,
  swayAt,
  towerProgress,
  wobbleAmp,
} from './towerLogic';

const KID_COUNT = 22;
/** Seconds the heap spends laughing before everybody gets up. */
const TOPPLE_SEC = 1.6;
const RUN_TIMEOUT = 4;
/** Seconds between kids when the crowd builds the tower itself. */
const AUTO_INTERVAL = 0.7;
/** A drag has to be going up at least this fast to send somebody climbing. */
const CLIMB_SPEED = 70;
/** Minimum gap between two kids sent up by one continuous drag. */
const SEND_COOLDOWN = 0.3;

type Phase = 'build' | 'topple' | 'running' | 'done';

export class TowerScene extends CrowdScene {
  override readonly name = 'tower';
  override readonly tint = SCENE_TINTS[8];

  private phase: Phase = 'build';
  private phaseTime = 0;
  private states: number[] = [];
  private levels: number[] = [];
  private climbT: number[] = [];
  private fromX: number[] = [];
  private fromY: number[] = [];
  private stack: number[] = [];
  private baseX = 0;
  private baseY = 200;
  private autoPilot = false;
  private autoTimer = 0;
  private sendCooldown = 0;
  private hintWobble = 0;
  private laidOut = false;

  override enter(ctx: SceneContext): void {
    super.enter(ctx);
    const crowd = new Crowd({
      followForce: 520,
      bounds: { left: -SAFE * 0.7, top: -SAFE * 0.6, right: SAFE * 0.7, bottom: SAFE * 0.6 },
    });
    crowd.spawn(KID_COUNT);
    this.setupCrowd(ctx, crowd);
    for (let i = 0; i < crowd.kids.length; i++) {
      this.states.push(ON_GROUND);
      this.levels.push(-1);
      this.climbT.push(0);
      this.fromX.push(0);
      this.fromY.push(0);
    }
    this.fitToViewport();
    ctx.viewport.onChange(() => this.fitToViewport());

    // The tower already has a bottom kid, and a second one climbing on.
    this.place(0, 0);
    this.startClimb(1);

    ctx.audio.bgm.play(BGM_TOWER);
  }

  private fitToViewport(): void {
    const l = this.ctx.viewport.layout;
    const halfW = Math.min(l.worldWidth, SAFE * 1.7) / 2;
    const halfH = Math.min(l.worldHeight, SAFE * 1.7) / 2;
    this.crowd.bounds.left = -halfW;
    this.crowd.bounds.right = halfW + 900;
    this.crowd.bounds.top = -halfH * 2;
    this.crowd.bounds.bottom = halfH;
    this.exitX = halfW + 300;
    // The tower stands on the ground with its top comfortably in view.
    this.baseY = Math.min(halfH - KID_WORLD_H * 0.2, 250);
    if (!this.laidOut) {
      this.laidOut = true;
      const kids = this.crowd.kids;
      for (let i = 0; i < kids.length; i++) {
        // A ring of onlookers, well clear of the tower itself.
        const a = (i / kids.length) * Math.PI * 2 + 0.6;
        kids[i].x = this.baseX + Math.cos(a) * 340;
        kids[i].y = this.baseY - 60 + Math.sin(a) * 150;
      }
    }
  }

  // ---- the tower ---------------------------------------------------------

  private place(i: number, level: number): void {
    const k = this.crowd.kids[i];
    this.states[i] = STACKED;
    this.levels[i] = level;
    this.stack[level] = i;
    k.frozen = true;
    k.locked = true;
    k.hasTarget = false;
    k.vx = 0;
    k.vy = 0;
    k.setState(level === 0 ? 'climb' : 'hold', true);
    k.x = this.baseX;
    k.y = stackY(this.baseY, level);
  }

  /**
   * Sends one kid on the ground up onto the top of the tower. Only one kid is
   * ever on the way up at a time, so two of them can never claim the same
   * step — a second tap simply waits its turn rather than doing nothing.
   */
  private startClimb(i: number): boolean {
    if (this.states[i] !== ON_GROUND) return false;
    if (this.climbing() > 0) return false;
    if (this.stack.length >= TOWER_MAX) return false;
    const k = this.crowd.kids[i];
    this.states[i] = CLIMBING;
    this.climbT[i] = 0;
    this.fromX[i] = k.x;
    this.fromY[i] = k.y;
    k.frozen = true;
    k.locked = true;
    k.hasTarget = false;
    k.setState('climb', true);
    k.facing = this.baseX >= k.x ? 1 : -1;
    this.ctx.audio.sfx.play('pote', { gain: 0.5, detune: 300 });
    return true;
  }

  private climbing(): number {
    let n = 0;
    for (let i = 0; i < this.states.length; i++) if (this.states[i] === CLIMBING) n++;
    return n;
  }

  private sendNearest(x: number, y: number, radius: number): boolean {
    if (this.climbing() > 0 || this.stack.length >= TOWER_MAX) return false;
    const kids = this.crowd.kids;
    let best = -1;
    let bestD2 = radius === Number.POSITIVE_INFINITY ? Infinity : radius * radius;
    for (let i = 0; i < kids.length; i++) {
      if (this.states[i] !== ON_GROUND) continue;
      const dx = kids[i].x - x;
      const dy = kids[i].y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    if (best < 0) return false;
    return this.startClimb(best);
  }

  // ---- interaction -------------------------------------------------------

  override onHand(ev: HandEvent): void {
    super.onHand(ev);
    if (this.phase !== 'build') return;
    if (ev.phase !== 'up' || !ev.isTap) return;
    this.sendNearest(ev.hand.x, ev.hand.y, Number.POSITIVE_INFINITY);
  }

  override applyHands(hands: Iterable<Hand>, dt: number): void {
    super.applyHands(hands, dt);
    if (this.phase !== 'build') return;
    if (this.sendCooldown > 0) return;
    for (const hand of hands) {
      if (!hand.active) continue;
      if (hand.vy > -CLIMB_SPEED) continue;
      // Up on the glass is up in the world (§2.4).
      if (this.sendNearest(hand.x, hand.y, hand.radius * 1.4)) {
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
    if (this.hintWobble > 0) this.hintWobble = Math.max(0, this.hintWobble - dt * 0.5);

    const kids = this.crowd.kids;

    if (this.phase === 'build') {
      if (this.autoPilot) {
        this.autoTimer -= dt;
        if (this.autoTimer <= 0) {
          this.autoTimer = AUTO_INTERVAL;
          this.sendNearest(this.baseX, this.baseY, Number.POSITIVE_INFINITY);
        }
      }

      const height = this.stack.length;
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i];
        if (this.states[i] === CLIMBING) {
          this.climbT[i] += dt / CLIMB_SEC;
          const t = Math.min(1, this.climbT[i]);
          const level = this.stack.length;
          const tx = this.baseX + swayAt(this.time, level, level + 1);
          const ty = stackY(this.baseY, level);
          // Up the side of the tower: across first, then straight up.
          k.x = this.fromX[i] + (tx - this.fromX[i]) * Math.min(1, t * 1.6);
          k.y = this.fromY[i] + (ty - this.fromY[i]) * t;
          if (t >= 1) {
            this.place(i, level);
            this.ctx.audio.sfx.play('giggle', { gain: 0.5, detune: (Math.random() - 0.5) * 400 });
          }
        } else if (this.states[i] === STACKED) {
          const level = this.levels[i];
          const sway = swayAt(this.time, level, height) * (1 + this.hintWobble);
          k.x = this.baseX + sway;
          k.y = stackY(this.baseY, level);
          if (level > 0) k.facing = sway > 0 ? 1 : -1;
        }
      }

      wander(this.crowd, this.time, dt, 18);
      if (shouldTopple(this.stack.length)) this.topple();
    }

    this.crowd.update(dt);

    if (this.phase === 'topple' && this.phaseTime >= TOPPLE_SEC) {
      this.beginRun();
    } else if (this.phase === 'running') {
      if (allExited(kids, this.exitX) || this.phaseTime >= RUN_TIMEOUT) this.phase = 'done';
    }

    this.syncSprites(dt);
  }

  /** The big moment: the tower comes apart into a heap of laughter. */
  private topple(): void {
    this.phase = 'topple';
    this.phaseTime = 0;
    const kids = this.crowd.kids;
    for (let level = 0; level < this.stack.length; level++) {
      const i = this.stack[level];
      const k = kids[i];
      this.states[i] = TUMBLED;
      k.frozen = false;
      k.locked = true;
      // They all spill the same way, so it reads as one soft topple rather
      // than an explosion.
      k.x = this.baseX + (level + 1) * 26;
      k.y = this.baseY - level * 6;
      k.vx = 120 + level * 55;
      k.vy = -30 + level * 12;
      k.setState('roll', true);
    }
    this.confetti.burst(this.baseX + 60, this.baseY - 200, 26, 400);
    this.ctx.audio.sfx.play('poro', { gain: 0.9 });
    this.ctx.audio.sfx.play('laugh', { gain: 0.8 });
  }

  private beginRun(): void {
    this.phase = 'running';
    this.phaseTime = 0;
    // Everyone gets up — a tumble always ends standing and laughing.
    for (const k of this.crowd.kids) k.setState('laugh', true);
    this.runOff();
    this.ctx.audio.sfx.play('whee', { gain: 0.6 });
  }

  /** 8-12s with no touch: the tower sways wider and one kid tries again. */
  override onIdleHint(): void {
    if (this.phase !== 'build') return;
    this.hintWobble = 1.2;
    this.sendNearest(this.baseX, this.baseY, Number.POSITIVE_INFINITY);
    this.ctx.audio.sfx.play('giggle', { gain: 0.5 });
  }

  /** 30s with no touch: the crowd builds the tower by itself. */
  override onAutoAdvance(): void {
    if (this.phase !== 'build') return;
    this.autoPilot = true;
    this.autoTimer = 0;
  }

  override finishNow(): void {
    if (this.phase === 'build') this.topple();
    if (this.phase === 'topple') this.beginRun();
    this.phase = 'done';
  }

  override progress(): number {
    if (this.phase === 'build') return 0.8 * towerProgress(this.stack.length);
    if (this.phase === 'topple') return 0.8 + 0.1 * Math.min(1, this.phaseTime / TOPPLE_SEC);
    if (this.phase === 'running') return 0.9 + 0.1 * Math.min(1, this.phaseTime / RUN_TIMEOUT);
    return 1;
  }

  /** Debug/e2e only. */
  debugPhase(): string {
    return this.phase;
  }

  /** Debug/e2e only: how many kids are in the tower. */
  debugHeight(): number {
    return this.stack.length;
  }

  /** Debug/e2e only: how far the top of the tower is swinging. */
  debugWobble(): number {
    return wobbleAmp(this.stack.length);
  }

  override isDone(): boolean {
    return this.phase === 'done';
  }

  override exit(): void {
    super.exit();
    this.states.length = 0;
    this.levels.length = 0;
    this.stack.length = 0;
  }
}

export default function createTower(): TowerScene {
  return new TowerScene();
}
