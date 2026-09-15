/**
 * Scene 4 「ボールプール」 — the ball pit.
 *
 * The world's invitation (§2.1 affordance, §2.5 perceptual incompleteness): a
 * big round pit full of bouncing pastel balls, with kids standing all around
 * the rim looking in. It is obviously enter-able, and obviously not full yet.
 *
 * State machine
 *   rim      : kids stand around the pit. A tap on (or near) a kid, a tap in
 *              the pit next to kids, or dragging a kid over the rim sends the
 *              nearest ones flying in: jump pose, arc, then a splash — balls
 *              scatter, "pochan" + rattle. Kids inside bob among the balls and
 *              laugh.
 *              -> when every kid is in the pit
 *   overflow : the pit spills. Balls roll out, kids climb out and run right.
 *              -> after OVERFLOW_SEC
 *   running  : everyone runs off the right edge; the director pans after them.
 *              -> last kid past exitX (or RUN_TIMEOUT)
 *   done
 *
 * Idle hint (8-12s): one kid at the rim bounces on their toes and a ball hops
 * out of the pit and back in. Auto-advance (30s): the kids go in by themselves,
 * one at a time.
 */
import { Sprite } from 'pixi.js';
import { CrowdScene } from './crowdScene';
import type { SceneContext } from '../core/scene';
import type { Hand, HandEvent } from '../core/input';
import { Crowd } from '../crowd/crowd';
import { SAFE } from '../core/viewport';
import { SCENE_TINTS } from '../art/palette';
import { BALL_SIZE, PIT_SIZE } from '../art/props';
import { BGM_BALLPIT } from '../core/audio';
import { BallPool, insidePit } from './balls';
import type { PitShape } from './balls';
import { allExited } from './gatherLogic';

const KID_COUNT = 26;
const BALL_COUNT = 46;
/** Pit mouth half-width in world units. */
const PIT_RX = 380;
/** The pit texture's own ellipse proportions (see drawPit). */
const PIT_TEX_RX = 0.46 * PIT_SIZE;
const PIT_TEX_RY = 0.33 * PIT_SIZE;
const PIT_RY = (PIT_RX * PIT_TEX_RY) / PIT_TEX_RX;
/** Radius of the ball texture's drawn circle, in texture pixels. */
const BALL_TEX_R = 0.42 * BALL_SIZE;

const FLIGHT_SEC = 0.55;
export const OVERFLOW_SEC = 1.6;
const RUN_TIMEOUT = 4;
/** Seconds between kids when the scene finishes itself. */
const AUTO_INTERVAL = 0.55;

type Phase = 'rim' | 'overflow' | 'running' | 'done';
/** Per-kid role. Kept as small ints so the update loop stays branch-cheap. */
const ROLE_RIM = 0;
const ROLE_FLYING = 1;
const ROLE_IN = 2;
const ROLE_OUT = 3;

export class BallpitScene extends CrowdScene {
  override readonly name = 'ballpit';
  override readonly tint = SCENE_TINTS[2];

  private pit: PitShape = { cx: 0, cy: 40, rx: PIT_RX, ry: PIT_RY };
  private pool!: BallPool;
  private ballSprites: Sprite[] = [];
  private pitSprite!: Sprite;

  private phase: Phase = 'rim';
  private phaseTime = 0;
  private roles: number[] = [];
  private flightT: number[] = [];
  private flightFromX: number[] = [];
  private flightFromY: number[] = [];
  private flightToX: number[] = [];
  private flightToY: number[] = [];
  private bobPhase: number[] = [];
  private autoPilot = false;
  private autoTimer = 0;
  private hintKid = -1;
  private hintTime = 0;

  override enter(ctx: SceneContext): void {
    super.enter(ctx);
    const crowd = new Crowd({
      bounds: { left: -SAFE * 0.8, top: -SAFE * 0.62, right: SAFE * 0.8, bottom: SAFE * 0.62 },
    });
    crowd.spawn(KID_COUNT);
    this.setupCrowd(ctx, crowd);

    this.pitSprite = new Sprite(ctx.props.pit);
    this.pitSprite.anchor.set(0.5);
    this.pitSprite.scale.set(this.pit.rx / PIT_TEX_RX);
    this.pitSprite.position.set(this.pit.cx, this.pit.cy);
    this.propLayer.addChild(this.pitSprite);

    this.pool = new BallPool(this.pit, BALL_COUNT, 22, 5);
    for (let i = 0; i < this.pool.balls.length; i++) {
      const b = this.pool.balls[i];
      const s = new Sprite(ctx.props.balls[b.color]);
      s.anchor.set(0.5);
      s.scale.set(b.r / BALL_TEX_R);
      // Balls live in the same sortable layer as the kids, so a kid standing
      // in the pit is genuinely *among* the balls rather than in front of them.
      this.layer.addChild(s);
      this.ballSprites.push(s);
    }

    for (let i = 0; i < crowd.kids.length; i++) {
      this.roles.push(ROLE_RIM);
      this.flightT.push(0);
      this.flightFromX.push(0);
      this.flightFromY.push(0);
      this.flightToX.push(0);
      this.flightToY.push(0);
      this.bobPhase.push((i * 1.7) % 6.283);
    }
    this.placeOnRim();
    this.fitToViewport();
    ctx.viewport.onChange(() => this.fitToViewport());
    ctx.audio.bgm.play(BGM_BALLPIT);
  }

  /** Everyone stands around the rim, evenly spaced, looking at the pit. */
  private placeOnRim(): void {
    const kids = this.crowd.kids;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      const a = (i / kids.length) * Math.PI * 2 + 0.3;
      k.x = this.pit.cx + Math.cos(a) * this.pit.rx * 1.32;
      k.y = this.pit.cy + Math.sin(a) * this.pit.ry * 1.5;
      k.vx = 0;
      k.vy = 0;
      k.hasTarget = false;
      k.facing = k.x > this.pit.cx ? -1 : 1;
    }
  }

  private fitToViewport(): void {
    const l = this.ctx.viewport.layout;
    const halfW = Math.min(l.worldWidth, SAFE * 1.7) / 2;
    const halfH = Math.min(l.worldHeight, SAFE * 1.7) / 2;
    this.crowd.bounds.left = -halfW - 200;
    this.crowd.bounds.right = halfW + 900;
    this.crowd.bounds.top = -halfH;
    this.crowd.bounds.bottom = halfH;
    this.exitX = halfW + 400;
  }

  // ---- interaction -------------------------------------------------------

  override onHand(ev: HandEvent): void {
    super.onHand(ev);
    if (this.phase !== 'rim') return;
    if (ev.phase === 'up' && ev.isTap) {
      this.spawnRipple(ev.hand.x, ev.hand.y);
      const sent = this.sendNearest(ev.hand.x, ev.hand.y, ev.hand.radius * 1.4, 3);
      if (sent === 0 && insidePit(this.pit, ev.hand.x, ev.hand.y, 120)) {
        // A tap in the pit with nobody close by still invites the nearest kid.
        this.sendNearest(ev.hand.x, ev.hand.y, Number.POSITIVE_INFINITY, 1);
      }
    }
  }

  override applyHands(hands: Iterable<Hand>, dt: number): void {
    super.applyHands(hands, dt);
    if (this.phase !== 'rim') return;
    for (const hand of hands) {
      // Dragging a finger through the pit takes whoever is held along with it.
      if (!insidePit(this.pit, hand.x, hand.y, 40)) continue;
      this.sendNearest(hand.x, hand.y, hand.radius * 0.8, 2);
    }
  }

  /** Sends up to `max` rim kids within `radius` of (x, y) into the pit. */
  private sendNearest(x: number, y: number, radius: number, max: number): number {
    const kids = this.crowd.kids;
    let sent = 0;
    // Repeated nearest-scan: `max` is tiny, so this stays cheaper than sorting.
    for (let pick = 0; pick < max; pick++) {
      let best = -1;
      let bestD2 = radius === Number.POSITIVE_INFINITY ? Infinity : radius * radius;
      for (let i = 0; i < kids.length; i++) {
        if (this.roles[i] !== ROLE_RIM) continue;
        const dx = kids[i].x - x;
        const dy = kids[i].y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= bestD2) {
          bestD2 = d2;
          best = i;
        }
      }
      if (best < 0) break;
      this.jumpIn(best);
      sent++;
    }
    return sent;
  }

  /** One kid launches into the pit. */
  private jumpIn(i: number): void {
    const k = this.crowd.kids[i];
    this.roles[i] = ROLE_FLYING;
    k.frozen = true;
    k.locked = true;
    k.hasTarget = false;
    k.vx = 0;
    k.vy = 0;
    k.setState('jump', true);
    this.flightT[i] = 0;
    this.flightFromX[i] = k.x;
    this.flightFromY[i] = k.y;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.72;
    this.flightToX[i] = this.pit.cx + Math.cos(a) * this.pit.rx * r;
    this.flightToY[i] = this.pit.cy + Math.sin(a) * this.pit.ry * r;
    k.facing = this.flightToX[i] > k.x ? 1 : -1;
    this.ctx.audio.sfx.play('whee', { gain: 0.5, detune: (Math.random() - 0.5) * 400 });
  }

  /** The kid lands: balls fly apart, "pochan" + a rattle of plastic. */
  private land(i: number): void {
    const k = this.crowd.kids[i];
    this.roles[i] = ROLE_IN;
    k.x = this.flightToX[i];
    k.y = this.flightToY[i];
    k.setState('laugh', true);
    this.pool.splash(k.x, k.y);
    this.ctx.audio.sfx.play('pochan', { gain: 0.8, detune: (Math.random() - 0.5) * 300 });
    this.ctx.audio.sfx.play('rattle', { gain: 0.6 });
  }

  private countIn(): number {
    let n = 0;
    for (let i = 0; i < this.roles.length; i++) if (this.roles[i] >= ROLE_IN) n++;
    return n;
  }

  // ---- update ------------------------------------------------------------

  override update(dt: number): void {
    super.update(dt);
    this.time += dt;
    this.phaseTime += dt;

    if (this.phase === 'rim' && this.autoPilot) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0) {
        this.autoTimer = AUTO_INTERVAL;
        this.sendNearest(this.pit.cx, this.pit.cy, Number.POSITIVE_INFINITY, 1);
      }
    }

    const kids = this.crowd.kids;

    // A rim kid dragged over the rim falls in on their own — pure physics,
    // exactly the causality a 4-year-old expects (§2.3).
    if (this.phase === 'rim') {
      for (let i = 0; i < kids.length; i++) {
        if (this.roles[i] !== ROLE_RIM) continue;
        if (insidePit(this.pit, kids[i].x, kids[i].y, -30)) this.jumpIn(i);
      }
    }

    // Flights.
    for (let i = 0; i < kids.length; i++) {
      if (this.roles[i] !== ROLE_FLYING) continue;
      this.flightT[i] += dt / FLIGHT_SEC;
      const t = Math.min(1, this.flightT[i]);
      const k = kids[i];
      k.x = this.flightFromX[i] + (this.flightToX[i] - this.flightFromX[i]) * t;
      k.y = this.flightFromY[i] + (this.flightToY[i] - this.flightFromY[i]) * t - Math.sin(t * Math.PI) * 130;
      if (t >= 1) this.land(i);
    }

    // Bobbing among the balls, laughing on and off.
    for (let i = 0; i < kids.length; i++) {
      if (this.roles[i] !== ROLE_IN) continue;
      const k = kids[i];
      this.bobPhase[i] += dt * 2.6;
      k.y = this.flightToY[i] + Math.sin(this.bobPhase[i]) * 14;
      if (k.state !== 'laugh' && Math.random() < dt * 1.2) k.setState('laugh', true);
    }

    // The idle-hint kid bounces on their toes for a couple of seconds.
    if (this.hintTime > 0) {
      this.hintTime -= dt;
      const k = kids[this.hintKid];
      if (k && this.roles[this.hintKid] === ROLE_RIM && k.state !== 'jump') k.setState('jump', true);
      if (this.hintTime <= 0) this.hintKid = -1;
    }

    this.pool.step(dt);
    this.crowd.update(dt);

    if (this.phase === 'rim' && this.countIn() === kids.length) this.beginOverflow();
    else if (this.phase === 'overflow' && this.phaseTime >= OVERFLOW_SEC) this.beginRun();
    else if (this.phase === 'running') {
      if (allExited(kids, this.exitX) || this.phaseTime >= RUN_TIMEOUT) this.phase = 'done';
    }

    // Ball sprites: position + depth only, no allocation, no redraw.
    for (let i = 0; i < this.ballSprites.length; i++) {
      const b = this.pool.balls[i];
      const s = this.ballSprites[i];
      s.position.set(b.x, b.y);
      s.zIndex = b.y;
    }

    this.syncSprites(dt);
  }

  private beginOverflow(): void {
    this.phase = 'overflow';
    this.phaseTime = 0;
    this.pool.spill();
    this.confetti.burst(this.pit.cx, this.pit.cy - 60, 30, 380);
    this.ctx.audio.sfx.play('rattle', { gain: 1 });
    this.ctx.audio.sfx.play('laugh', { gain: 0.8 });
    const kids = this.crowd.kids;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      k.frozen = false;
      k.locked = false;
      this.roles[i] = ROLE_OUT;
      k.setState('laugh', true);
    }
  }

  private beginRun(): void {
    this.phase = 'running';
    this.phaseTime = 0;
    this.runOff();
    this.ctx.audio.sfx.play('whee', { gain: 0.6 });
  }

  /** 8-12s with no touch: a kid bounces, and a ball hops out and back in. */
  override onIdleHint(): void {
    if (this.phase !== 'rim') return;
    const kids = this.crowd.kids;
    for (let i = 0; i < kids.length; i++) {
      if (this.roles[i] !== ROLE_RIM) continue;
      this.hintKid = i;
      this.hintTime = 2.4;
      break;
    }
    this.pool.hop(Math.random() < 0.5 ? -1 : 1);
    this.ctx.audio.sfx.play('rattle', { gain: 0.5 });
  }

  /** 30s with no touch: the kids go in by themselves, one at a time. */
  override onAutoAdvance(): void {
    if (this.phase !== 'rim') return;
    this.autoPilot = true;
    this.autoTimer = 0;
  }

  override finishNow(): void {
    if (this.phase === 'rim') {
      for (let i = 0; i < this.roles.length; i++) {
        if (this.roles[i] !== ROLE_IN) {
          this.roles[i] = ROLE_IN;
          this.flightToX[i] = this.crowd.kids[i].x;
          this.flightToY[i] = this.crowd.kids[i].y;
        }
      }
      this.beginOverflow();
    }
    if (this.phase === 'overflow') this.beginRun();
    this.phase = 'done';
  }

  override progress(): number {
    if (this.phase === 'rim') return 0.8 * (this.countIn() / Math.max(1, this.roles.length));
    if (this.phase === 'overflow') return 0.8 + 0.1 * Math.min(1, this.phaseTime / OVERFLOW_SEC);
    if (this.phase === 'running') return 0.9 + 0.1 * Math.min(1, this.phaseTime / RUN_TIMEOUT);
    return 1;
  }

  /** Debug/e2e only. */
  debugPhase(): string {
    return this.phase;
  }

  /** Debug/e2e only: how many kids are in the pit. */
  debugInPit(): number {
    return this.countIn();
  }

  override isDone(): boolean {
    return this.phase === 'done';
  }

  override exit(): void {
    super.exit();
    this.ballSprites.length = 0;
  }
}

export default function createBallpit(): BallpitScene {
  return new BallpitScene();
}
