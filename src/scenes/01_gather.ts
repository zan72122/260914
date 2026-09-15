/**
 * Scene 1 「あつまれ」 — gather.
 *
 * The world's invitation (§2.2 signifier): kids are scattered all over the
 * visible area and exactly ONE of them, in the middle, is waving, over and
 * over. Nothing says "tap here" — the waving does.
 *
 * State machine
 *   scatter  : free play. A tap calls nearby kids to the finger, a drag pulls
 *              them along. Kids who come close to the waver stay with him.
 *              -> when every kid is inside CLUSTER_RADIUS of the waver
 *   clapping : everybody claps, a pastel confetti burst goes off, clap sound.
 *              -> after CLAP_SEC (~1.5s)
 *   running  : everybody runs off the right edge; the director pans after them.
 *              -> when the last kid is past exitX (or after RUN_TIMEOUT)
 *   done
 *
 * Idle hint (8-12s): a few kids set off towards the waver by themselves and he
 * waves bigger. Auto-advance (30s): the whole crowd gathers itself.
 */
import { CrowdScene } from './crowdScene';
import type { SceneContext } from '../core/scene';
import type { HandEvent } from '../core/input';
import { Crowd } from '../crowd/crowd';
import { gatherTowards, wander } from '../crowd/behaviors';
import { SAFE } from '../core/viewport';
import { SCENE_TINTS } from '../art/palette';
import { BGM_GATHER } from '../core/audio';
import { CLUSTER_RADIUS, allExited, allGathered, gatherProgress } from './gatherLogic';

const KID_COUNT = 44;
/** Seconds of clapping before the crowd sets off. */
export const CLAP_SEC = 1.5;
/** Hard stop on the run-off, so a stuck kid can never hold the game up. */
const RUN_TIMEOUT = 4;

type Phase = 'scatter' | 'clapping' | 'running' | 'done';

export class GatherScene extends CrowdScene {
  override readonly name = 'gather';
  override readonly tint = SCENE_TINTS[0];

  private phase: Phase = 'scatter';
  private phaseTime = 0;
  /** Index of the one kid who waves. He stands still in the middle. */
  private waverIndex = 0;
  private waveBig = 0;
  private laidOut = false;

  override enter(ctx: SceneContext): void {
    super.enter(ctx);
    const crowd = new Crowd({
      bounds: { left: -SAFE * 0.7, top: -SAFE * 0.62, right: SAFE * 0.7, bottom: SAFE * 0.62 },
    });
    crowd.spawn(KID_COUNT);
    this.setupCrowd(ctx, crowd);
    this.fitToViewport();
    ctx.viewport.onChange(() => this.fitToViewport());

    // The waver: dead centre, waving, and pinned there.
    const waver = crowd.kids[this.waverIndex];
    waver.x = 0;
    waver.y = 0;
    waver.vx = 0;
    waver.vy = 0;
    waver.hasTarget = true;
    waver.targetX = 0;
    waver.targetY = 0;
    waver.locked = true;
    waver.setState('wave', true);

    ctx.audio.bgm.play(BGM_GATHER);
  }

  /** The scatter and the exit follow whatever the device actually shows. */
  private fitToViewport(): void {
    const l = this.ctx.viewport.layout;
    const halfW = Math.min(l.worldWidth, SAFE * 1.7) / 2;
    const halfH = Math.min(l.worldHeight, SAFE * 1.7) / 2;
    this.crowd.bounds.left = -halfW - 200;
    this.crowd.bounds.right = halfW + 900;
    this.crowd.bounds.top = -halfH;
    this.crowd.bounds.bottom = halfH;
    this.exitX = halfW + 400;
    if (!this.laidOut) {
      this.laidOut = true;
      this.crowd.scatter(halfW * 0.88, halfH * 0.88);
      const w = this.crowd.kids[this.waverIndex];
      w.x = 0;
      w.y = 0;
    }
  }

  private get waver() {
    return this.crowd.kids[this.waverIndex];
  }

  override onHand(ev: HandEvent): void {
    super.onHand(ev);
    if (this.phase !== 'scatter') return;
    if (ev.phase === 'up' && ev.isTap) {
      // A tap is an invitation: nearby kids walk over to the finger.
      gatherTowards(this.crowd, ev.hand.x, ev.hand.y, ev.hand.radius * 1.9);
      this.spawnRipple(ev.hand.x, ev.hand.y);
      this.ctx.audio.sfx.play('laugh', { gain: 0.5, detune: (Math.random() - 0.5) * 300 });
      this.pinWaver();
    }
  }

  /** The waver never gets dragged away by a gather; he is the landmark. */
  private pinWaver(): void {
    const w = this.waver;
    w.hasTarget = true;
    w.targetX = 0;
    w.targetY = 0;
    w.locked = true;
    if (w.state !== 'wave') w.setState('wave', true);
  }

  override update(dt: number): void {
    super.update(dt);
    this.time += dt;
    this.phaseTime += dt;
    if (this.waveBig > 0) this.waveBig = Math.max(0, this.waveBig - dt * 0.28);

    if (this.phase === 'scatter') {
      wander(this.crowd, this.time, dt, 22);
      this.magnetiseToWaver();
    }

    this.crowd.update(dt);
    if (this.phase === 'scatter') this.pinWaver();

    // Arrived kids release their target so the crowd keeps breathing.
    if (this.phase === 'scatter') {
      const kids = this.crowd.kids;
      for (let i = 0; i < kids.length; i++) {
        if (i === this.waverIndex) continue;
        const k = kids[i];
        if (!k.hasTarget) continue;
        const dx = k.targetX - k.x;
        const dy = k.targetY - k.y;
        if (dx * dx + dy * dy < 40 * 40) k.hasTarget = false;
      }
      if (allGathered(kids, this.waver.x, this.waver.y, CLUSTER_RADIUS)) this.beginClap();
    } else if (this.phase === 'clapping') {
      if (this.phaseTime >= CLAP_SEC) this.beginRun();
    } else if (this.phase === 'running') {
      if (allExited(this.crowd.kids, this.exitX) || this.phaseTime >= RUN_TIMEOUT) {
        this.phase = 'done';
      }
    }

    // The waver grows a little while he is waving bigger (the idle hint).
    this.extraScale[this.waverIndex] = 1 + this.waveBig * 0.28;

    this.syncSprites(dt);
  }

  /**
   * Kids that drift near the waver stay with him. This is what turns "drag a
   * few kids over" into "the group forms", with no instruction anywhere.
   */
  private magnetiseToWaver(): void {
    const kids = this.crowd.kids;
    const w = this.waver;
    // Strictly inside the completion radius, so sticking can never flicker.
    const reach = CLUSTER_RADIUS * 0.95;
    for (let i = 0; i < kids.length; i++) {
      if (i === this.waverIndex) continue;
      const k = kids[i];
      if (k.hasTarget) continue;
      const dx = w.x - k.x;
      const dy = w.y - k.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      k.targetX = w.x;
      k.targetY = w.y;
      k.hasTarget = true;
    }
  }

  private beginClap(): void {
    if (this.phase !== 'scatter') return;
    this.phase = 'clapping';
    this.phaseTime = 0;
    const kids = this.crowd.kids;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      k.hasTarget = false;
      k.vx = 0;
      k.vy = 0;
      k.setState('clap', true);
      k.locked = true;
    }
    this.waveBig = 0;
    this.confetti.burst(this.waver.x, this.waver.y - 120, 26, 300);
    this.confetti.burst(this.waver.x, this.waver.y - 40, 18, 420);
    this.ctx.audio.sfx.play('clap', { gain: 0.9 });
    this.ctx.audio.sfx.play('laugh', { gain: 0.7, detune: 180 });
  }

  private beginRun(): void {
    this.phase = 'running';
    this.phaseTime = 0;
    this.runOff();
    this.ctx.audio.sfx.play('whee', { gain: 0.6 });
  }

  /** 8-12s with no touch: a few kids set off on their own, he waves bigger. */
  override onIdleHint(): void {
    if (this.phase !== 'scatter') return;
    this.waveBig = 1;
    const kids = this.crowd.kids;
    let sent = 0;
    for (let i = 0; i < kids.length && sent < 3; i++) {
      if (i === this.waverIndex) continue;
      const k = kids[i];
      const dx = this.waver.x - k.x;
      const dy = this.waver.y - k.y;
      if (dx * dx + dy * dy < CLUSTER_RADIUS * CLUSTER_RADIUS) continue;
      k.targetX = this.waver.x + (Math.random() - 0.5) * 120;
      k.targetY = this.waver.y + (Math.random() - 0.5) * 120;
      k.hasTarget = true;
      sent++;
    }
  }

  /** 30s with no touch: the crowd gathers itself. Nobody is ever stuck. */
  override onAutoAdvance(): void {
    if (this.phase !== 'scatter') return;
    const kids = this.crowd.kids;
    for (let i = 0; i < kids.length; i++) {
      if (i === this.waverIndex) continue;
      const k = kids[i];
      k.targetX = this.waver.x + (Math.random() - 0.5) * CLUSTER_RADIUS;
      k.targetY = this.waver.y + (Math.random() - 0.5) * CLUSTER_RADIUS;
      k.hasTarget = true;
    }
  }

  override finishNow(): void {
    if (this.phase === 'scatter') this.beginClap();
    if (this.phase === 'clapping') this.beginRun();
    this.phase = 'done';
  }

  override progress(): number {
    if (this.phase === 'scatter') {
      return 0.8 * gatherProgress(this.crowd.kids, this.waver.x, this.waver.y, CLUSTER_RADIUS);
    }
    if (this.phase === 'clapping') return 0.8 + 0.1 * Math.min(1, this.phaseTime / CLAP_SEC);
    if (this.phase === 'running') return 0.9 + 0.1 * Math.min(1, this.phaseTime / RUN_TIMEOUT);
    return 1;
  }

  /** Debug/e2e only: which phase the state machine is in. */
  debugPhase(): string {
    return this.phase;
  }

  override isDone(): boolean {
    return this.phase === 'done';
  }
}

export default function createGather(): GatherScene {
  return new GatherScene();
}
