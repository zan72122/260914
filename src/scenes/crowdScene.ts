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
import { FRAME_H, KID_WORLD_H } from '../art/kidSheet';
import { buildRingTexture } from '../art/ring';
import { Confetti } from './confetti';
import { PAN_STEP } from '../core/director';

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
  /** Per-kid extra sprite scale, used for the "waves bigger" hint. */
  protected extraScale: number[] = [];

  /** Right-hand world x every crowd runs past on the way out. */
  protected exitX = 1400;

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
    let steps = 0;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      const s = this.sprites[i];
      s.texture = sheet.get(k.variant, k.pose, k.frame);
      s.position.set(k.x, k.y);
      const e = this.extraScale[i] * (1 + k.attention * 0.04);
      s.scale.x = this.spriteScale * k.facing * e;
      s.scale.y = this.spriteScale * e;
      // Painter's algorithm: lower on screen = in front.
      s.zIndex = k.y;
      if (k.stepped) steps++;
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
   * Sends the whole crowd running off the right edge, laughing. The target is
   * far past the edge on purpose: nobody must ever stop and stand around in
   * view while the camera is still panning to the next scene.
   */
  protected runOff(): void {
    const kids = this.crowd.kids;
    this.crowd.bounds.right = this.exitX + PAN_STEP * 2;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      k.locked = false;
      k.hasTarget = true;
      k.targetX = this.exitX + PAN_STEP + (i % 5) * 80;
      k.targetY = k.y + ((i % 7) - 3) * 18;
      k.setState('run', true);
      k.locked = true;
    }
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
  }
}
