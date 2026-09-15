/**
 * FlameRenderer.ts — flame.frag.glsl を PixiJS v8 の Filter として貼る薄いクラス
 *
 * このファイルだけが PixiJS に依存する。spectra.ts / color.ts / afterglow.ts は
 * 依存ゼロのままなので、PixiJS を import できない環境でも単体テストできる。
 *
 * 方式: 炎の矩形を持つ Sprite に Filter を掛ける。
 *   - Filter.resolution を 1 未満にすると Pixi が自動で低解像度 FBO に描いて
 *     拡大合成する。PLAN §7「炎は一箇所、解像度を落とした FBO に描いて拡大する」に対応。
 *   - blendMode 'add' で背景に光を足す。
 *
 * 時間は必ず GameClock 由来の秒を update(dtSeconds) で渡す。
 * このクラスは Ticker にも performance.now() にも触らない（PLAN §4 / §5.5）。
 */

import {
  Container,
  Filter,
  GlProgram,
  Sprite,
  Texture,
  type BLEND_MODES,
} from 'pixi.js';

import fragmentSource from './flame.frag.glsl?raw';
import vertexSource from './flame.vert.glsl?raw';

import {
  baseFlameColor,
  elementFlameColor,
  flameColorToUniform,
  innerConeColor,
  sootColor,
} from './color.js';
import type { ElementId } from './spectra.js';

export interface FlameRendererOptions {
  /** 炎の矩形の幅 [px]（親コンテナの座標系）。 */
  readonly width?: number;
  /** 炎の矩形の高さ [px]。 */
  readonly height?: number;
  /**
   * 炎を描く FBO の解像度倍率。0.35 なら 1/3 弱の解像度で描いて拡大する。
   * PLAN §7 の性能対策。既定 0.35。
   */
  readonly resolution?: number;
  /** uMix の追従の速さ [1/s]。既定 6（約 0.5 秒で 95% 到達）。 */
  readonly mixRate?: number;
  /** uIntensity。既定 1。 */
  readonly intensity?: number;
  /** シナリオ既定 seed 由来の定数（PLAN §5.5）。既定 0。 */
  readonly seed?: number;
  /** 既定 'add'。 */
  readonly blendMode?: BLEND_MODES;
}

const DEFAULTS = {
  width: 220,
  height: 320,
  resolution: 0.35,
  mixRate: 6,
  intensity: 1,
  seed: 0,
  blendMode: 'add' as BLEND_MODES,
};

interface FlameUniforms extends Record<string, unknown> {
  uTime: number;
  uElementColor: Float32Array;
  uBaseColor: Float32Array;
  uInnerColor: Float32Array;
  uSootColor: Float32Array;
  uMix: number;
  uIntensity: number;
  uResolution: Float32Array;
  uSeed: number;
}

export class FlameRenderer {
  /** 差し込み先に add する DisplayObject。 */
  readonly view: Container;

  private readonly sprite: Sprite;
  private readonly filter: Filter;
  private readonly uniforms: FlameUniforms;
  private readonly mixRate: number;

  /** 現在炎に入っている元素。null なら素の青いガス炎。 */
  private element: ElementId | null = null;
  /** uMix の目標値。 */
  private mixTarget = 0;
  /** uMix の現在値（目標へ指数的に追従する）。 */
  private mixCurrent = 0;
  /** GameClock 由来の累積秒。 */
  private timeSeconds = 0;

  constructor(options: FlameRendererOptions = {}) {
    const width = options.width ?? DEFAULTS.width;
    const height = options.height ?? DEFAULTS.height;
    this.mixRate = options.mixRate ?? DEFAULTS.mixRate;

    const base = baseFlameColor();
    const inner = innerConeColor();
    const soot = sootColor();

    this.uniforms = {
      uTime: 0,
      uElementColor: new Float32Array(flameColorToUniform(base)),
      uBaseColor: new Float32Array(flameColorToUniform(base)),
      uInnerColor: new Float32Array(flameColorToUniform(inner)),
      uSootColor: new Float32Array(flameColorToUniform(soot)),
      uMix: 0,
      uIntensity: options.intensity ?? DEFAULTS.intensity,
      uResolution: new Float32Array([width, height]),
      uSeed: options.seed ?? DEFAULTS.seed,
    };

    this.filter = new Filter({
      glProgram: GlProgram.from({ vertex: vertexSource, fragment: fragmentSource }),
      resources: {
        flameUniforms: {
          uTime: { value: this.uniforms.uTime, type: 'f32' },
          uElementColor: { value: this.uniforms.uElementColor, type: 'vec3<f32>' },
          uBaseColor: { value: this.uniforms.uBaseColor, type: 'vec3<f32>' },
          uInnerColor: { value: this.uniforms.uInnerColor, type: 'vec3<f32>' },
          uSootColor: { value: this.uniforms.uSootColor, type: 'vec3<f32>' },
          uMix: { value: this.uniforms.uMix, type: 'f32' },
          uIntensity: { value: this.uniforms.uIntensity, type: 'f32' },
          uResolution: { value: this.uniforms.uResolution, type: 'vec2<f32>' },
          uSeed: { value: this.uniforms.uSeed, type: 'f32' },
        },
      },
      resolution: options.resolution ?? DEFAULTS.resolution,
      blendMode: options.blendMode ?? DEFAULTS.blendMode,
    });

    this.sprite = new Sprite(Texture.WHITE);
    this.sprite.width = width;
    this.sprite.height = height;
    this.sprite.anchor.set(0.5, 1); // 底辺中央 = バーナーの口
    this.sprite.alpha = 0; // 中身は描かない。フィルタの出力だけを見せる。
    this.sprite.filters = [this.filter];

    this.view = new Container();
    this.view.label = 'flame';
    this.view.addChild(this.sprite);
  }

  /**
   * 炎に入っている元素と、その色がどこまで支配するかを設定する。
   *
   * @param element 元素。null なら素の青いガス炎に戻す。
   * @param mixTarget 0..1。既定は element が null なら 0、そうでなければ 0.92。
   *        1.0 にしないのは、実際の炎でもガス炎自身の発光が残るため。
   */
  setElement(element: ElementId | null, mixTarget?: number): void {
    this.element = element;
    if (element === null) {
      this.mixTarget = mixTarget ?? 0;
      return;
    }
    const color = elementFlameColor(element);
    this.uniforms.uElementColor.set(flameColorToUniform(color));
    this.mixTarget = Math.min(1, Math.max(0, mixTarget ?? 0.92));
  }

  /** 現在の元素。 */
  getElement(): ElementId | null {
    return this.element;
  }

  /** 現在の uMix（0..1）。__fire.dump('flame') 等から読む想定。 */
  getMix(): number {
    return this.mixCurrent;
  }

  /** 炎の強さ。 */
  setIntensity(intensity: number): void {
    this.uniforms.uIntensity = Math.max(0, intensity);
  }

  /** 炎の矩形の大きさを変える（縦横の切り替え時など）。 */
  resize(width: number, height: number): void {
    this.sprite.width = width;
    this.sprite.height = height;
    this.uniforms.uResolution.set([width, height]);
  }

  /**
   * dtSeconds だけ進める。必ず GameClock 由来の秒を渡すこと。
   * 同じ dt 列を与えれば同じ状態になる（再現性。PLAN §5.5）。
   */
  update(dtSeconds: number): void {
    const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0;
    this.timeSeconds += dt;

    // 目標へ指数的に追従。フレームレートに依らない形にする。
    const k = 1 - Math.exp(-this.mixRate * dt);
    this.mixCurrent += (this.mixTarget - this.mixCurrent) * k;
    if (Math.abs(this.mixTarget - this.mixCurrent) < 1e-4) this.mixCurrent = this.mixTarget;

    this.uniforms.uTime = this.timeSeconds;
    this.uniforms.uMix = this.mixCurrent;
    this.syncUniforms();
  }

  /** 保持しているリソースを解放する。 */
  destroy(): void {
    this.view.destroy({ children: true });
    this.filter.destroy();
  }

  private syncUniforms(): void {
    const group = this.filter.resources.flameUniforms as
      | { uniforms: Record<string, unknown> }
      | undefined;
    if (!group) return;
    const u = group.uniforms;
    u.uTime = this.uniforms.uTime;
    u.uMix = this.uniforms.uMix;
    u.uIntensity = this.uniforms.uIntensity;
    u.uSeed = this.uniforms.uSeed;
    u.uElementColor = this.uniforms.uElementColor;
    u.uBaseColor = this.uniforms.uBaseColor;
    u.uInnerColor = this.uniforms.uInnerColor;
    u.uSootColor = this.uniforms.uSootColor;
    u.uResolution = this.uniforms.uResolution;
  }
}

export default FlameRenderer;
