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
import { Container, Sprite } from 'pixi.js';
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
  CROWD_LAG,
  DRIFT_RATE,
  FOLLOW_RATE,
  approach,
  driftTarget,
  leadProgress,
  leftThePicture,
} from './butterflyLogic';

/**
 * A deliberately small crowd. This scene is the one that asks a child to find
 * a single object among the kids, so the kids have to be sparse enough for it
 * to be found: 28 leaves real paper between the heads.
 */
const KID_COUNT = 28;
const RUN_TIMEOUT = 4;
/** Butterfly flap rate, frames per second. */
const FLAP_FPS = 9;
/** How far above the kids' heads the butterfly likes to fly. */
const HOVER_LIFT = 40;
/**
 * World scale of the butterfly sprite. The drawing is about 108px wide inside
 * its 128px cell, so at 1.0 the wingspan is ~108 world units: about twice the
 * width of a kid's head (~45 units) and two thirds of a whole kid.
 */
const BUTTERFLY_SCALE = 1;
/** How far the butterfly flies between two dots of its trail, in world units. */
const TRAIL_SPACING = 22;
/** How long one dot of the trail takes to fade away, in seconds. */
const TRAIL_LIFE = 1.1;
/** Size of the trail pool. Enough for the whole visible trail at any speed. */
const TRAIL_MAX = 40;
/** Peak opacity of a trail dot: a hint of a path, never a drawn line. */
const TRAIL_ALPHA = 0.62;
/** How far a kid leans towards the butterfly, at most, in radians. */
const MAX_TILT = 0.2;


type Phase = 'chase' | 'running' | 'done';

export class ButterflyScene extends CrowdScene {
  override readonly name = 'butterfly';
  override readonly tint = SCENE_TINTS[4];

  private phase: Phase = 'chase';
  private phaseTime = 0;
  private sprite!: Sprite;
  /** Its own layer, added last: nothing in the game is ever drawn over it. */
  private skyLayer = new Container();
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
  /** Pooled dots of the crayon trail; nothing here is allocated per frame. */
  private trail: Sprite[] = [];
  private trailAge: number[] = [];
  private trailNext = 0;
  private lastDropX = 0;
  private lastDropY = 0;
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

    // The trail goes into the same layer, before the butterfly, so the dots
    // are over the crowd but under the butterfly itself.
    for (let i = 0; i < TRAIL_MAX; i++) {
      const dot = new Sprite(ctx.props.trailDot);
      dot.anchor.set(0.5);
      dot.visible = false;
      this.fxLayer.addChild(dot);
      this.trail.push(dot);
      this.trailAge.push(TRAIL_LIFE);
    }

    this.sprite = new Sprite(ctx.props.butterfly[0]);
    this.sprite.anchor.set(0.5);
    this.sprite.scale.set(BUTTERFLY_SCALE);
    // Above everything, and never depth-sorted with the crowd: its own layer
    // is added after the kids and after the finger rings, and sorts nothing,
    // so the butterfly is in front of every kid on the screen, always.
    ctx.stage.addChild(this.skyLayer);
    this.skyLayer.addChild(this.sprite);
    this.lastDropX = this.bx;
    this.lastDropY = this.by;

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
        // A roomy fan, not a huddle: with 28 kids the outermost ring lands
        // about 300 units out, which is wide enough that there is paper
        // between the heads and the butterfly above them has somewhere to be.
        const spread = 95 + 40 * Math.sqrt(i);
        k.targetX = this.bx + Math.cos(a) * spread;
        k.targetY = this.by + CROWD_LAG + Math.sin(a) * spread * 0.55;
        k.hasTarget = true;
        // Every face is turned up at it. This is the ordinary attention
        // mechanism (the same one a finger triggers) held on permanently by
        // the world itself: the crowd is the arrow pointing at the butterfly.
        if (k.attention < 0.6) k.attention = 0.6;
        const dx = this.bx - k.x;
        if (Math.abs(dx) > 8) k.facing = dx > 0 ? 1 : -1;
        // ...and the bodies lean after it, which is what reads as "looking up"
        // at 58px on a phone. Leaning is proportional to how far away it is,
        // and capped, so nobody ever looks like they are falling over.
        const lean = Math.max(-MAX_TILT, Math.min(MAX_TILT, dx / 900)) * k.attention;
        this.tilt[i] = lean;
      }

      if (leftThePicture(this.bx, this.edgeX)) this.beginRun();
    } else {
      // On the way out the butterfly leads from the front and everybody
      // straightens up to run after it.
      this.bx += 460 * dt;
      for (let i = 0; i < this.tilt.length; i++) this.tilt[i] *= Math.exp(-4 * dt);
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
    const drawY = this.by + Math.sin(this.time * 5) * 9;
    this.sprite.position.set(this.bx, drawY);
    this.updateTrail(dt, drawY);

    this.syncSprites(dt);
  }

  private anyHandDown = false;

  /**
   * The dotted crayon trail: one soft dot every TRAIL_SPACING units of flight,
   * fading out over a second. It is what makes the butterfly's path readable
   * at a glance, and it is the visible proof that the finger is moving it.
   *
   * Pooled and ring-buffered: no allocation, and never more than TRAIL_MAX
   * sprites in the scene.
   */
  private updateTrail(dt: number, drawY: number): void {
    const dx = this.bx - this.lastDropX;
    const dy = drawY - this.lastDropY;
    if (dx * dx + dy * dy >= TRAIL_SPACING * TRAIL_SPACING) {
      const dot = this.trail[this.trailNext];
      dot.position.set(this.lastDropX, this.lastDropY);
      dot.visible = true;
      this.trailAge[this.trailNext] = 0;
      this.trailNext = (this.trailNext + 1) % this.trail.length;
      this.lastDropX = this.bx;
      this.lastDropY = drawY;
    }
    for (let i = 0; i < this.trail.length; i++) {
      const age = this.trailAge[i];
      if (age >= TRAIL_LIFE) continue;
      const next = age + dt;
      this.trailAge[i] = next;
      const dot = this.trail[i];
      if (next >= TRAIL_LIFE) {
        dot.visible = false;
        continue;
      }
      const t = next / TRAIL_LIFE;
      dot.alpha = (1 - t) * (1 - t) * TRAIL_ALPHA;
      dot.scale.set(1 - t * 0.45);
    }
  }

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

  override exit(): void {
    super.exit();
    this.skyLayer.destroy({ children: true });
    this.trail.length = 0;
    this.trailAge.length = 0;
  }
}

export default function createButterfly(): ButterflyScene {
  return new ButterflyScene();
}
