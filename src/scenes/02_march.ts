/**
 * Scene 2 「ぞろぞろ」 — the march.
 *
 * The world's invitation (§2.5 perceptual incompleteness, §2.2 signifier): a
 * wide crayon path curves across the picture and runs straight off the right
 * edge, with a loose line of kids strung along it. A path that leaves the
 * screen is a question a 4-year-old answers without being asked.
 *
 * State machine
 *   line     : the line stands on the path. A finger dragged ALONG the path
 *              makes the whole line flow that way (§2.4 natural mapping); kids
 *              the finger passes over hop. Kids whose distance passes the exit
 *              keep going by themselves.
 *              -> when every kid's path distance is past exitX
 *   running  : everyone runs off the right edge; the director pans after them.
 *              -> last kid past exitX (or RUN_TIMEOUT)
 *   done
 *
 * Idle hint (8-12s): the two kids at the front set off along the path on their
 * own, hopping. Auto-advance (30s): a steady flow carries the line out.
 */
import { Sprite } from 'pixi.js';
import { CrowdScene } from './crowdScene';
import type { SceneContext } from '../core/scene';
import type { Hand, HandEvent } from '../core/input';
import { Crowd } from '../crowd/crowd';
import { SAFE } from '../core/viewport';
import { SCENE_TINTS } from '../art/palette';
import { PATH_PERIOD, pathY } from '../art/geometry';
import { BGM_MARCH } from '../core/audio';
import { allExited } from './gatherLogic';
import {
  FLOW_MAX,
  advance,
  allPassed,
  alongPath,
  decayFlow,
  laneOffset,
  mergeFlow,
  passedFraction,
} from './marchLogic';

const KID_COUNT = 24;
/** Spacing between kids along the path when the scene opens. */
const SPACING = 55;
/** Path distance of the kid at the back of the line when the scene opens. */
const LINE_START = -620;
const RUN_TIMEOUT = 4;
/** Flow the scene drives itself with once nobody has touched it for 30s. */
const AUTO_FLOW = 260;
/** How many tiles of path are laid down; enough to run off both edges. */
const PATH_TILES = 3;

type Phase = 'line' | 'running' | 'done';

export class MarchScene extends CrowdScene {
  override readonly name = 'march';
  override readonly tint = SCENE_TINTS[1];

  private phase: Phase = 'line';
  private phaseTime = 0;
  private pathX: number[] = [];
  private gone: boolean[] = [];
  private flow = 0;
  private autoFlow = 0;
  private tiles: Sprite[] = [];

  override enter(ctx: SceneContext): void {
    super.enter(ctx);
    const crowd = new Crowd({
      separationRadius: 50,
      // The line has to be able to keep up with the flow the finger creates,
      // so this crowd steers harder and runs faster than the default one.
      followForce: 1100,
      maxSpeed: 220,
      bounds: { left: -SAFE, top: -SAFE * 0.62, right: SAFE, bottom: SAFE * 0.62 },
    });
    crowd.spawn(KID_COUNT);
    this.setupCrowd(ctx, crowd);

    // The path: whole repeats laid end to end. The texture's curve completes
    // exactly one period across its width, so the joins are invisible.
    for (let i = 0; i < PATH_TILES; i++) {
      const s = new Sprite(ctx.props.path);
      s.anchor.set(0, 0.5);
      s.position.set(-PATH_PERIOD * 2 + i * PATH_PERIOD, 40);
      this.propLayer.addChild(s);
      this.tiles.push(s);
    }

    for (let i = 0; i < crowd.kids.length; i++) {
      // The line trails back off the left edge: the head of it is already on
      // its way out, which is what makes the rest read as a queue rather than
      // a scatter, and what makes the path's far end matter.
      this.pathX.push(LINE_START + i * SPACING);
      this.gone.push(false);
      const k = crowd.kids[i];
      k.x = this.pathX[i];
      k.y = pathY(k.x) + laneOffset(i) + 40;
      k.facing = 1;
      k.locked = false;
    }
    this.fitToViewport();
    ctx.viewport.onChange(() => this.fitToViewport());
    ctx.audio.bgm.play(BGM_MARCH);
  }

  private fitToViewport(): void {
    const l = this.ctx.viewport.layout;
    const halfW = Math.min(l.worldWidth, SAFE * 1.7) / 2;
    const halfH = Math.min(l.worldHeight, SAFE * 1.7) / 2;
    this.crowd.bounds.left = -SAFE * 1.4;
    this.crowd.bounds.right = halfW + 900;
    this.crowd.bounds.top = -halfH;
    this.crowd.bounds.bottom = halfH;
    this.exitX = halfW + 300;
  }

  // ---- interaction -------------------------------------------------------

  override onHand(ev: HandEvent): void {
    super.onHand(ev);
    if (this.phase !== 'line') return;
    if (ev.phase === 'up' && ev.isTap) {
      // A tap has no direction, so it makes the kids under it hop instead —
      // every touch does something, always (§2.6).
      this.hopNear(ev.hand.x, ev.hand.y, ev.hand.radius);
      this.flow = mergeFlow(this.flow, 150);
    }
  }

  override applyHands(hands: Iterable<Hand>, dt: number): void {
    super.applyHands(hands, dt);
    if (this.phase !== 'line') return;
    for (const hand of hands) {
      if (!hand.active) continue;
      this.flow = mergeFlow(this.flow, alongPath(hand.vx, hand.vy, hand.x));
      if (Math.abs(hand.vx) + Math.abs(hand.vy) > 40) this.hopNear(hand.x, hand.y, hand.radius);
    }
  }

  /** Kids under the finger bounce. Cheap, cosmetic, and always available. */
  private hopNear(x: number, y: number, radius: number): void {
    const kids = this.crowd.kids;
    const r2 = radius * radius;
    let hopped = 0;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      const dx = k.x - x;
      const dy = k.y - y;
      if (dx * dx + dy * dy > r2) continue;
      if (k.state === 'jump') continue;
      k.setState('jump', true);
      k.locked = true;
      hopped++;
    }
    if (hopped > 0) {
      this.ctx.audio.sfx.play('giggle', { gain: 0.45, detune: (Math.random() - 0.5) * 400 });
    }
  }

  // ---- update ------------------------------------------------------------

  override update(dt: number): void {
    super.update(dt);
    this.time += dt;
    this.phaseTime += dt;

    if (this.phase === 'line') {
      if (this.autoFlow !== 0) this.flow = mergeFlow(this.flow, this.autoFlow);
      const kids = this.crowd.kids;
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i];
        this.pathX[i] = advance(this.pathX[i], this.flow, dt);
        if (!this.gone[i] && this.pathX[i] >= this.exitX) this.gone[i] = true;
        // Kids past the exit keep going under their own steam.
        const target = this.gone[i] ? this.pathX[i] + 500 : this.pathX[i];
        k.targetX = target;
        k.targetY = pathY(target) + laneOffset(i) + 40;
        k.hasTarget = true;
        // A hop finishes by itself; after that the crowd's own speed->pose
        // sync takes over again.
        if (k.locked && k.state !== 'jump') k.locked = false;
      }
      this.flow = decayFlow(this.flow, dt);
      if (allPassed(this.pathX, this.exitX)) this.beginRun();
    }

    this.crowd.update(dt);

    if (this.phase === 'running') {
      if (allExited(this.crowd.kids, this.exitX) || this.phaseTime >= RUN_TIMEOUT) {
        this.phase = 'done';
      }
    }

    this.syncSprites(dt);
  }

  private beginRun(): void {
    this.phase = 'running';
    this.phaseTime = 0;
    this.runOff();
    this.ctx.audio.sfx.play('whee', { gain: 0.5 });
  }

  /** 8-12s with no touch: the front of the line sets off, hopping. */
  override onIdleHint(): void {
    if (this.phase !== 'line') return;
    let lead = 0;
    for (let i = 1; i < this.pathX.length; i++) if (this.pathX[i] > this.pathX[lead]) lead = i;
    for (let n = 0; n < 2; n++) {
      const i = (lead - n + this.pathX.length) % this.pathX.length;
      this.pathX[i] += 190;
      const k = this.crowd.kids[i];
      k.setState('jump', true);
      k.locked = true;
    }
    this.ctx.audio.sfx.play('giggle', { gain: 0.5 });
  }

  /** 30s with no touch: a gentle current carries the whole line out. */
  override onAutoAdvance(): void {
    if (this.phase !== 'line') return;
    this.autoFlow = AUTO_FLOW;
  }

  override finishNow(): void {
    if (this.phase === 'line') {
      for (let i = 0; i < this.pathX.length; i++) {
        this.pathX[i] = this.exitX + 50;
        this.gone[i] = true;
      }
      this.beginRun();
    }
    this.phase = 'done';
  }

  override progress(): number {
    if (this.phase === 'line') return 0.9 * passedFraction(this.pathX, this.exitX);
    if (this.phase === 'running') return 0.9 + 0.1 * Math.min(1, this.phaseTime / RUN_TIMEOUT);
    return 1;
  }

  /** Debug/e2e only. */
  debugPhase(): string {
    return this.phase;
  }

  /** Debug/e2e only: how hard the line is flowing right now, 0..1. */
  debugFlow(): number {
    return this.flow / FLOW_MAX;
  }

  override isDone(): boolean {
    return this.phase === 'done';
  }

  override exit(): void {
    super.exit();
    this.tiles.length = 0;
    this.pathX.length = 0;
    this.gone.length = 0;
  }
}

export default function createMarch(): MarchScene {
  return new MarchScene();
}
