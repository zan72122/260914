/**
 * light.ts — 光をひとまとめに置く層
 *
 * 光は「やわらかい光の点」を一枚の絵（円形に薄れてゆく模様）として持ち、
 * 置く場所・大きさ・色・強さだけを毎フレーム変える。形を毎フレーム作り直さない。
 *
 * これは見た目のためだけでなく、描き替えの重さを一定に保つためでもある。
 * 一枚の絵を共有していれば、光がいくつあっても描画は一度で済む。
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { GLOW_STOPS } from './paint';

let glowTexture: Texture | null = null;

/** 中心から縁へ連続して薄くなる、白い光の点。色は置くときに掛ける。 */
function glowTex(): Texture {
  if (glowTexture) return glowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [offset, a] of GLOW_STOPS) grd.addColorStop(offset, `rgba(255,255,255,${a})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
  }
  glowTexture = Texture.from(canvas);
  return glowTexture;
}

/**
 * 同じ絵を使い回す光の置き場。`begin()` → `add()` を並べ → `end()`。
 * 使わなかったぶんは隠すだけで、作り直さない。
 */
export class LightPool {
  readonly view = new Container();
  private readonly pool: Sprite[] = [];
  private used = 0;

  constructor(blend: 'add' | 'normal' = 'add') {
    this.view.blendMode = blend;
  }

  begin(): void {
    this.used = 0;
  }

  /** (x, y) に半径 radius の光を置く。squash で縦につぶすと面に落ちた溜まりになる。 */
  add(x: number, y: number, radius: number, color: number, alpha: number, squash = 1): void {
    if (!(alpha > 0.004) || !(radius > 0)) return;
    let s = this.pool[this.used];
    if (!s) {
      s = new Sprite(glowTex());
      s.anchor.set(0.5);
      s.blendMode = this.view.blendMode;
      this.pool.push(s);
      this.view.addChild(s);
    }
    s.visible = true;
    s.position.set(x, y);
    s.width = radius * 2;
    s.height = radius * 2 * squash;
    s.tint = color;
    s.alpha = Math.min(1, alpha);
    this.used++;
  }

  end(): void {
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false;
  }
}
