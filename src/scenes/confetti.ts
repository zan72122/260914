/**
 * A pooled burst of small pastel dots. Used when the crowd claps and when the
 * ball pit overflows. Sprites are created once and recycled forever, so a
 * burst costs no allocation beyond the pool's initial growth.
 */
import { Container, Sprite } from 'pixi.js';
import type { Texture } from 'pixi.js';

interface Speck {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  age: number;
  spin: number;
}

export const CONFETTI_GRAVITY = 520;

export class Confetti {
  readonly view = new Container();
  private live: Speck[] = [];
  private pool: Speck[] = [];

  constructor(private textures: Texture[]) {}

  /** Throws `count` specks outwards from (x, y). */
  burst(x: number, y: number, count: number, spread = 260): void {
    for (let i = 0; i < count; i++) {
      const s = this.pool.pop() ?? this.make();
      const a = Math.random() * Math.PI * 2;
      const speed = spread * (0.4 + Math.random() * 0.9);
      s.sprite.texture = this.textures[i % this.textures.length];
      s.sprite.position.set(x, y);
      s.sprite.scale.set(0.8 + Math.random() * 0.9);
      s.sprite.alpha = 1;
      s.sprite.rotation = Math.random() * Math.PI;
      s.sprite.visible = true;
      s.vx = Math.cos(a) * speed;
      s.vy = Math.sin(a) * speed - 220;
      s.spin = (Math.random() - 0.5) * 8;
      s.age = 0;
      s.life = 1.1 + Math.random() * 0.8;
      this.view.addChild(s.sprite);
      this.live.push(s);
    }
  }

  private make(): Speck {
    const sprite = new Sprite(this.textures[0]);
    sprite.anchor.set(0.5);
    return { sprite, vx: 0, vy: 0, life: 1, age: 0, spin: 0 };
  }

  get activeCount(): number {
    return this.live.length;
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const s = this.live[i];
      s.age += dt;
      if (s.age >= s.life) {
        s.sprite.visible = false;
        this.view.removeChild(s.sprite);
        this.pool.push(s);
        this.live.splice(i, 1);
        continue;
      }
      s.vy += CONFETTI_GRAVITY * dt;
      s.sprite.x += s.vx * dt;
      s.sprite.y += s.vy * dt;
      s.sprite.rotation += s.spin * dt;
      const t = s.age / s.life;
      s.sprite.alpha = 1 - t * t;
    }
  }

  destroy(): void {
    this.view.destroy({ children: true });
    this.live.length = 0;
    this.pool.length = 0;
  }
}
