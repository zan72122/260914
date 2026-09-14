/**
 * Phase 0 test scene — a playground with no goal.
 *
 * 120 kids wander. Any touch: a soft crayon ring blooms at the finger, the tap
 * sound plays, and every kid within the hand's radius turns to look. Dragging
 * slowly gathers them; dragging fast shoves them along. Nothing can go wrong,
 * there is nothing to read, and there is no way to lose.
 */
import { Container, Sprite } from 'pixi.js';
import { Scene } from '../core/scene';
import type { SceneContext } from '../core/scene';
import type { Hand, HandEvent } from '../core/input';
import { Crowd } from '../crowd/crowd';
import { applyAttention, applyDragForce, gatherTowards, wander } from '../crowd/behaviors';
import { FRAME_H, FRAME_W, KID_WORLD_H } from '../art/kidSheet';
import { buildRingTexture } from '../art/ring';
import { SAFE } from '../core/viewport';

const KID_COUNT = 120;

interface Ripple {
  sprite: Sprite;
  age: number;
  life: number;
}

export class PlaygroundScene extends Scene {
  private crowd = new Crowd({
    bounds: { left: -SAFE * 0.62, top: -SAFE * 0.62, right: SAFE * 0.62, bottom: SAFE * 0.62 },
  });
  private layer = new Container();
  private fxLayer = new Container();
  private sprites: Sprite[] = [];
  private ripples: Ripple[] = [];
  private ripplePool: Sprite[] = [];
  private ringTexture = buildRingTexture();
  private time = 0;
  private spriteScale = 1;
  private laidOut = false;

  override enter(ctx: SceneContext): void {
    super.enter(ctx);
    this.spriteScale = KID_WORLD_H / FRAME_H;
    this.crowd.spawn(KID_COUNT);
    for (const kid of this.crowd.kids) {
      const s = new Sprite(ctx.sheet.get(kid.variant, kid.pose, kid.frame));
      s.anchor.set(0.5, 1);
      s.scale.set(this.spriteScale);
      this.layer.addChild(s);
      this.sprites.push(s);
    }
    this.layer.sortableChildren = true;
    this.fitToViewport();
    ctx.viewport.onChange(() => this.fitToViewport());
    ctx.stage.addChild(this.layer);
    ctx.stage.addChild(this.fxLayer);
    // A quiet pentatonic loop; stays queued and silent until first touch.
    ctx.audio.bgm.play({ root: 67, tempo: 84, seed: 4 });
  }

  /** Crowd fills whatever the device actually shows, portrait or landscape. */
  private fitToViewport(): void {
    const l = this.ctx.viewport.layout;
    const halfW = Math.min(l.worldWidth, SAFE * 1.7) / 2;
    const halfH = Math.min(l.worldHeight, SAFE * 1.7) / 2;
    this.crowd.bounds.left = -halfW;
    this.crowd.bounds.right = halfW;
    this.crowd.bounds.top = -halfH;
    this.crowd.bounds.bottom = halfH;
    if (!this.laidOut) {
      this.laidOut = true;
      this.crowd.scatter(halfW * 0.86, halfH * 0.86);
    }
  }

  override onHand(ev: HandEvent): void {
    const hand = ev.hand;
    // Rule: EVERY touch does something. Look-at happens no matter what.
    applyAttention(this.crowd, hand);
    if (ev.phase === 'down') {
      this.spawnRipple(hand.x, hand.y);
      this.ctx.audio.sfx.play('pon');
    }
    if (ev.phase === 'up' && ev.isTap) {
      // A tap is an invitation: nearby kids come over, a few hop.
      gatherTowards(this.crowd, hand.x, hand.y, hand.radius * 1.6);
      this.spawnRipple(hand.x, hand.y);
      this.ctx.audio.sfx.play('laugh', { gain: 0.5, detune: (Math.random() - 0.5) * 300 });
      let hops = 0;
      for (const kid of this.crowd.kids) {
        const dx = hand.x - kid.x;
        const dy = hand.y - kid.y;
        if (dx * dx + dy * dy > hand.radius * hand.radius) continue;
        if (hops++ > 6) break;
        kid.setState('jump');
      }
    }
  }

  private spawnRipple(x: number, y: number): void {
    const sprite = this.ripplePool.pop() ?? new Sprite(this.ringTexture);
    sprite.anchor.set(0.5);
    sprite.alpha = 0.9;
    sprite.scale.set(0.3);
    sprite.position.set(x, y);
    sprite.visible = true;
    this.fxLayer.addChild(sprite);
    this.ripples.push({ sprite, age: 0, life: 0.65 });
  }

  override update(dt: number): void {
    super.update(dt);
    this.time += dt;

    wander(this.crowd, this.time, dt);
    this.crowd.update(dt);

    // Clear stale targets once a kid has arrived, so the crowd keeps drifting.
    for (const kid of this.crowd.kids) {
      if (!kid.hasTarget) continue;
      const dx = kid.targetX - kid.x;
      const dy = kid.targetY - kid.y;
      if (dx * dx + dy * dy < 30 * 30) kid.hasTarget = false;
    }

    // Sprite sync. No allocations here.
    const kids = this.crowd.kids;
    const sheet = this.ctx.sheet;
    let steps = 0;
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      const s = this.sprites[i];
      s.texture = sheet.get(k.variant, k.pose, k.frame);
      s.position.set(k.x, k.y);
      // A kid looking at a finger leans very slightly towards it.
      s.scale.x = this.spriteScale * k.facing * (1 + k.attention * 0.04);
      s.scale.y = this.spriteScale * (1 + k.attention * 0.04);
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

    // Ripples fade and grow.
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
      const scale = (0.3 + t * 1.5) * (FRAME_W / 96);
      r.sprite.scale.set(scale);
      r.sprite.alpha = 0.9 * (1 - t) * (1 - t);
    }
  }

  /** Drag forces need the live hands, so the scene gets them each frame. */
  applyHands(hands: Iterable<Hand>, dt: number): void {
    for (const hand of hands) {
      applyAttention(this.crowd, hand);
      applyDragForce(this.crowd, hand, dt);
    }
  }

  /** No input for a while: one kid wanders off on their own, as a nudge. */
  override onIdleHint(): void {
    const kids = this.crowd.kids;
    if (kids.length === 0) return;
    const k = kids[Math.floor(Math.random() * kids.length)];
    k.targetX = (Math.random() - 0.5) * SAFE * 0.8;
    k.targetY = (Math.random() - 0.5) * SAFE * 0.8;
    k.hasTarget = true;
    k.setState('clap');
  }

  /** Test hook: how many kids are actually simulated. */
  debugKidCount(): number {
    return this.crowd.kids.length;
  }

  /** The playground never ends — it is the Phase 0 sandbox. */
  override isDone(): boolean {
    return false;
  }

  override exit(): void {
    this.layer.destroy({ children: true });
    this.fxLayer.destroy({ children: true });
    this.sprites.length = 0;
    this.ripples.length = 0;
    this.ripplePool.length = 0;
  }
}

export default function createPlayground(): PlaygroundScene {
  return new PlaygroundScene();
}
