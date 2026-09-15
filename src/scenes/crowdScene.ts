/**
 * Shared machinery for the crowd scenes: the sprite pool that mirrors the
 * crowd, the pooled finger rings, and the "every touch does something" rule
 * (ring + sound + every nearby kid turns to look) that §2.6 of the plan makes
 * mandatory in every scene.
 *
 * Nothing here allocates per frame: sprites are created once in `enter`, rings
 * are recycled through a pool, and the sync loop only writes scalars.
 */
import { Container, Sprite } from 'pixi.js';
import { Scene } from '../core/scene';
import type { SceneContext } from '../core/scene';
import type { Hand, HandEvent } from '../core/input';
import { Crowd } from '../crowd/crowd';
import { applyAttention, applyDragForce } from '../crowd/behaviors';
import { FRAME_H, KID_WORLD_H, boilFrame } from '../art/kidSheet';
import { buildRingTexture } from '../art/ring';
import { Confetti } from './confetti';
import { PAN_STEP } from '../core/director';

/**
 * Speed cap and steering force used while a crowd is leaving.
 *
 * A scene only calls `runOff` once every kid is already past `exitX`, which is
 * a full half-screen to the right of the camera. The camera then pans PAN_STEP
 * in PAN_SEC while the kids keep running, so for nobody to reappear (and then
 * blink out when the old scene is retired) the slowest kid has to stay ahead
 * of the camera's right edge for the whole pan. The slowest kid runs at
 * RUN_OFF_SPEED * 0.75 (the lowest speedScale) * 1.8 (the run multiplier) =
 * ~1050 units/s, which keeps a margin of over 100 units at the tightest point
 * of the smoothstep. The force is what actually gets them there: with the
 * crowd's damping of 2.4/s, terminal speed is force / 2.4.
 */
const RUN_OFF_SPEED = 780;
const RUN_OFF_FORCE = 2600;

interface Ripple {
  sprite: Sprite;
  age: number;
  life: number;
}

export abstract class CrowdScene extends Scene {
  protected crowd!: Crowd;
  protected layer = new Container();
  protected propLayer = new Container();
  protected fxLayer = new Container();
  protected sprites: Sprite[] = [];
  protected confetti!: Confetti;
  private ripples: Ripple[] = [];
  private ripplePool: Sprite[] = [];
  private ringTexture = buildRingTexture();
  protected spriteScale = 1;
  protected time = 0;
  /**
   * Clock for the line boil. It is separate from `time` because scenes use
   * `time` for their own animation and some of them stop advancing it; the
   * crayon lines have to keep breathing whatever the scene is doing.
   */
  private boilTime = 0;
  /** Per-kid extra sprite scale, used for the "waves bigger" hint. */
  protected extraScale: number[] = [];
  /**
   * Per-kid body lean, in radians, applied around the feet. Scenes write it to
   * make the crowd look at something in the world (scene 5's whole crowd tilts
   * its faces up towards the butterfly). Zero everywhere else.
   */
  protected tilt: number[] = [];

  /** Right-hand world x every crowd runs past on the way out. */
  protected exitX = 1400;
  /**
   * Multiplier laid over every kid sprite. White everywhere except the night
   * scene, which dims the crowd into the dusk and brightens it again at dawn.
   */
  protected kidTint = 0xffffff;
  private appliedTint = 0xffffff;

  protected setupCrowd(ctx: SceneContext, crowd: Crowd): void {
    this.crowd = crowd;
    this.spriteScale = KID_WORLD_H / FRAME_H;
    for (const kid of crowd.kids) {
      const s = new Sprite(ctx.sheet.get(kid.variant, kid.pose, kid.frame));
      s.anchor.set(0.5, 1);
      s.scale.set(this.spriteScale);
      this.layer.addChild(s);
      this.sprites.push(s);
      this.extraScale.push(1);
      this.tilt.push(0);
    }
    this.layer.sortableChildren = true;
    this.confetti = new Confetti(ctx.props.confetti);
    ctx.stage.addChild(this.propLayer);
    ctx.stage.addChild(this.layer);
    ctx.stage.addChild(this.confetti.view);
    ctx.stage.addChild(this.fxLayer);
  }

  /** The always-on feedback: a ring, a sound, and heads turning. */
  override onHand(ev: HandEvent): void {
    applyAttention(this.crowd, ev.hand);
    if (ev.phase === 'down') {
      this.spawnRipple(ev.hand.x, ev.hand.y);
      this.ctx.audio.sfx.play('pon');
    }
  }

  override applyHands(hands: Iterable<Hand>, dt: number): void {
    for (const hand of hands) {
      applyAttention(this.crowd, hand);
      applyDragForce(this.crowd, hand, dt);
    }
  }

  protected spawnRipple(x: number, y: number): void {
    const sprite = this.ripplePool.pop() ?? new Sprite(this.ringTexture);
    sprite.anchor.set(0.5);
    sprite.alpha = 1;
    sprite.scale.set(0.45);
    sprite.position.set(x, y);
    sprite.visible = true;
    this.fxLayer.addChild(sprite);
    this.ripples.push({ sprite, age: 0, life: 0.75 });
  }

  /** Mirrors crowd state onto sprites + ages the rings. Allocation-free. */
  protected syncSprites(dt: number): void {
    const kids = this.crowd.kids;
    const sheet = this.ctx.sheet;
    // One integer for the whole crowd: which bake of the boil everybody is
    // drawn from this frame. Same atlas, same draw call, living line.
    this.boilTime += dt;
    const boil = boilFrame(this.boilTime);
    let steps = 0;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      const s = this.sprites[i];
      s.texture = sheet.get(k.variant, k.pose, k.frame, boil);
      s.position.set(k.x, k.y);
      const e = this.extraScale[i] * (1 + k.attention * 0.04);
      s.scale.x = this.spriteScale * k.facing * e;
      s.scale.y = this.spriteScale * e;
      s.rotation = this.tilt[i];
      // Painter's algorithm: lower on screen = in front.
      s.zIndex = k.y;
      if (k.stepped) steps++;
    }
    // One comparison per frame instead of one tint write per kid per frame.
    if (this.kidTint !== this.appliedTint) {
      this.appliedTint = this.kidTint;
      for (let i = 0; i < this.sprites.length; i++) this.sprites[i].tint = this.kidTint;
    }
    if (steps > 0) {
      this.ctx.audio.sfx.play('pote', {
        gain: Math.min(1, 0.25 + steps * 0.05),
        detune: (Math.random() - 0.5) * 400,
      });
    }

    this.confetti.update(dt);

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) {
        r.sprite.visible = false;
        this.fxLayer.removeChild(r.sprite);
        this.ripplePool.push(r.sprite);
        this.ripples.splice(i, 1);
        continue;
      }
      r.sprite.scale.set(0.45 + t * 1.6);
      r.sprite.alpha = (1 - t) * (1 - t);
    }
  }

  /**
   * Sends the whole crowd running off the right edge, laughing.
   *
   * The speed is deliberately much higher than ordinary walking. The camera
   * pans a whole PAN_STEP in PAN_SEC, so a crowd that merely jogged would be
   * overtaken by the camera and then vanish mid-screen when the old scene is
   * retired. At RUN_OFF_SPEED the slowest kid still outruns the camera, so the
   * crowd leaves once, cleanly, and nobody ever pops out of existence in view.
   */
  protected runOff(): void {
    const kids = this.crowd.kids;
    this.crowd.bounds.right = this.exitX + PAN_STEP * 3;
    this.crowd.maxSpeed = RUN_OFF_SPEED;
    this.crowd.followForce = RUN_OFF_FORCE;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      k.frozen = false;
      k.locked = false;
      k.hasTarget = true;
      k.targetX = this.exitX + PAN_STEP * 2 + (i % 5) * 80;
      k.targetY = k.y + ((i % 7) - 3) * 18;
      k.setState('run', true);
      k.locked = true;
    }
  }

  /**
   * The same exit, but tumbling: used when a scene ends with the crowd rolling
   * away in fits of laughter instead of running.
   */
  protected rollOff(): void {
    this.runOff();
    const kids = this.crowd.kids;
    for (let i = 0; i < kids.length; i++) kids[i].setState('roll', true);
  }

  override debugKidCount(): number {
    return this.crowd ? this.crowd.kids.length : 0;
  }

  override exit(): void {
    this.layer.destroy({ children: true });
    this.propLayer.destroy({ children: true });
    this.fxLayer.destroy({ children: true });
    this.confetti?.destroy();
    this.sprites.length = 0;
    this.ripples.length = 0;
    this.ripplePool.length = 0;
    this.extraScale.length = 0;
    this.tilt.length = 0;
  }
}
