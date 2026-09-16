/**
 * GlslFlameRenderer.ts — flame.frag.glsl を PixiJS v8 の Filter として貼る実装
 *
 * このファイルと FlameRenderer.ts だけが PixiJS に依存する。
 * spectra.ts / color.ts / afterglow.ts / elementColors.ts は依存ゼロのままなので、
 * PixiJS を import できない環境（Node 上の Vitest など）でも単体検査できる。
 *
 * 方式: 炎の矩形を持つ Sprite に Filter を掛ける。
 *   - Filter.resolution を落とすと Pixi が低解像度 FBO に描いて拡大合成する。
 *     PLAN §7「炎は一箇所、解像度を落とした FBO に描いて拡大する」に対応。
 *   - 色は一切ここで作らない。elementColors（= color.ts の算出）から引いて渡すだけ。
 *
 * 時間は必ず GameClock 由来（FlameState.timeMs）。
 * このクラスは Ticker にも Date にも触らない（PLAN §4 / §5.5）。
 * 例外は描画時間の計測だけで、これは絵に一切影響しない（下の「計測」を見よ）。
 */

import { Container, Filter, GlProgram, Sprite, Texture, type BLEND_MODES } from 'pixi.js';

import fragmentSource from './flame.frag.glsl?raw';
import vertexSource from './flame.vert.glsl?raw';

import { innerConeColor, sootColor, flameColorToUniform } from './color';
import { BASE_FLAME_COLOR, flameColorOf } from './elementColors';
import type { ElementId } from './elements';
import type { FlameRenderer, FlameState, FlameStats } from './FlameRenderer';

export interface GlslFlameOptions {
  /**
   * 炎を描く FBO の横幅の上限 [px]。炎の矩形がこれより広ければ解像度を落として
   * 描き、拡大して合成する（PLAN §7 の性能対策）。
   */
  readonly maxFboWidth?: number;
  /** FBO 解像度倍率の下限。落としすぎて形が崩れないようにする。 */
  readonly minResolution?: number;
  /**
   * uMix の追従の速さ [1/s]。20 で約 0.15 秒。
   * 本物の炎色反応は材料が炎に触れた瞬間に色が出る。ここも即応にする
   * （色が出るのは子どもが入れた瞬間、という因果を鈍らせない。PLAN §2-5 / §3.3）。
   * 0 ではなく指数追従にしているのは、飛び込む一瞬のにじみを残すため。
   */
  readonly mixRate?: number;
  /** シナリオ既定 seed 由来の定数（PLAN §5.5）。 */
  readonly seed?: number;
  /**
   * 合成の仕方。既定は 'normal'。
   * 炎の芯は光学的に厚く、後ろを隠す。加算にすると芯の色に背景の色が混ざり、
   * 2 軸（色相 × 明度）の判定が「炎の色」ではなく「炎＋背景」を見ることになる。
   * 縁は alpha が小さいので背景へなめらかに溶ける。
   */
  readonly blendMode?: BLEND_MODES;
}

const DEFAULTS = {
  maxFboWidth: 48,
  minResolution: 0.2,
  mixRate: 20,
  seed: 0,
  blendMode: 'normal' as BLEND_MODES,
};

/** 元素が入っているときの uMix の目標。炎全体がその色になる（PLAN §3.3）。 */
const MIX_TARGET = 1;

/** dt の上限 [s]。時計が大きく飛んでも追従が破綻しないようにする。 */
const MAX_DT_SECONDS = 0.1;

/** CPU 時間を均す窓（performance.now() の丸めを埋めるため）。 */
const CPU_WINDOW_FRAMES = 60;

/** タイマクエリが無いとき、何フレームに 1 度 gl.finish() まで待って測るか。 */
const SYNC_EVERY = 6;

/** その実測を何回均してから出すか（performance.now() の丸めを埋めるため）。 */
const SYNC_WINDOW = 8;

/**
 * 計測（描画時間）について。
 *
 * ここでだけ performance.now() と WebGL のタイマクエリを使う。これは
 * 「1 フレームの炎描画にどれだけ掛かったか」を __fire.dump('flame') から
 * 読めるようにするためで、絵にも状態にも一切影響しない。
 * 絵の時間は必ず FlameState.timeMs（GameClock）だけから来る。
 */
interface TimerQueryExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

export class GlslFlameRenderer implements FlameRenderer {
  readonly view = new Container();

  private readonly sprite: Sprite;
  private readonly filter: Filter;
  private readonly mixRate: number;
  private readonly maxFboWidth: number;
  private readonly minResolution: number;

  private readonly uElementColor: Float32Array;
  private readonly uResolution: Float32Array;

  private element: ElementId | null = null;
  private mixTarget = 0;
  private mixCurrent = 0;
  private lastTimeMs: number | null = null;

  private cssWidth = 0;
  private cssHeight = 0;

  // --- 計測 -----------------------------------------------------------------
  private cpuSum = 0;
  private cpuCount = 0;
  private cpuMs = 0;
  private syncSum = 0;
  private syncCount = 0;
  private syncMs: number | null = null;
  private drawCount = 0;
  private gpuMs: number | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private timerExt: TimerQueryExt | null = null;
  private timerUnavailable = false;
  private pendingQuery: WebGLQuery | null = null;

  constructor(options: GlslFlameOptions = {}) {
    this.mixRate = options.mixRate ?? DEFAULTS.mixRate;
    this.maxFboWidth = options.maxFboWidth ?? DEFAULTS.maxFboWidth;
    this.minResolution = options.minResolution ?? DEFAULTS.minResolution;

    // 色は全て算出済みのものを引いてくる。ここで作らない。
    const base = BASE_FLAME_COLOR.linear;
    this.uElementColor = new Float32Array(base);
    this.uResolution = new Float32Array([1, 1]);

    this.filter = new Filter({
      glProgram: GlProgram.from({ vertex: vertexSource, fragment: fragmentSource }),
      resources: {
        flameUniforms: {
          uTime: { value: 0, type: 'f32' },
          uElementColor: { value: this.uElementColor, type: 'vec3<f32>' },
          uBaseColor: { value: new Float32Array(base), type: 'vec3<f32>' },
          uInnerColor: {
            value: new Float32Array(flameColorToUniform(innerConeColor())),
            type: 'vec3<f32>',
          },
          uSootColor: {
            value: new Float32Array(flameColorToUniform(sootColor())),
            type: 'vec3<f32>',
          },
          uMix: { value: 0, type: 'f32' },
          uIntensity: { value: 1, type: 'f32' },
          uResolution: { value: this.uResolution, type: 'vec2<f32>' },
          uSeed: { value: options.seed ?? DEFAULTS.seed, type: 'f32' },
        },
      },
      resolution: 1,
      blendMode: options.blendMode ?? DEFAULTS.blendMode,
    });

    this.instrument();

    this.sprite = new Sprite(Texture.WHITE);
    this.sprite.anchor.set(0.5, 1); // 底辺中央 = バーナーの口
    this.sprite.filters = [this.filter];

    this.view.label = 'flame';
    this.view.addChild(this.sprite);
  }

  layout(x: number, y: number, width: number, height: number): void {
    this.cssWidth = width;
    this.cssHeight = height;
    this.view.position.set(x, y);
    this.sprite.width = width;
    this.sprite.height = height;
    this.uResolution.set([width, height]);
    // 炎は一箇所だけなので、FBO の横幅に上限を置いて拡大合成する（PLAN §7）。
    const scale = width > 0 ? Math.min(1, this.maxFboWidth / width) : 1;
    this.filter.resolution = Math.max(this.minResolution, scale);
    this.writeUniforms();
  }

  update(state: FlameState): void {
    const timeMs = state.timeMs;
    const dt =
      this.lastTimeMs === null
        ? 0
        : Math.min(MAX_DT_SECONDS, Math.max(0, (timeMs - this.lastTimeMs) / 1000));
    this.lastTimeMs = timeMs;

    if (state.element !== this.element) {
      this.element = state.element;
      this.uElementColor.set(flameColorOf(state.element).linear);
      this.mixTarget = state.element === null ? 0 : MIX_TARGET;
    }

    // 目標へ指数的に追従。刻み幅に依らない形。
    const k = 1 - Math.exp(-this.mixRate * dt);
    this.mixCurrent += (this.mixTarget - this.mixCurrent) * k;
    if (Math.abs(this.mixTarget - this.mixCurrent) < 1e-4) this.mixCurrent = this.mixTarget;

    const u = this.uniforms();
    if (u) {
      u.uTime = timeMs / 1000;
      u.uMix = this.mixCurrent;
      u.uIntensity = Math.max(0, state.intensityPct / 100);
      u.uElementColor = this.uElementColor;
      u.uResolution = this.uResolution;
    }
  }

  stats(): FlameStats {
    const r = this.filter.resolution;
    const res = typeof r === 'number' ? r : 1;
    return {
      mix: Number(this.mixCurrent.toFixed(4)),
      element: this.element,
      fboScale: Number(res.toFixed(4)),
      fboWidth: Math.round(this.cssWidth * res),
      fboHeight: Math.round(this.cssHeight * res),
      frameMs: Number((this.gpuMs ?? this.syncMs ?? this.cpuMs).toFixed(4)),
      frameMsSource: this.gpuMs !== null ? 'gpu' : this.syncMs !== null ? 'sync' : 'cpu',
      cpuMs: Number(this.cpuMs.toFixed(4)),
      gpuMs: this.gpuMs === null ? null : Number(this.gpuMs.toFixed(3)),
      syncMs: this.syncMs === null ? null : Number(this.syncMs.toFixed(4)),
    };
  }

  destroy(): void {
    this.releaseQuery();
    this.view.destroy({ children: true });
    this.filter.destroy();
  }

  private uniforms(): Record<string, unknown> | null {
    const group = this.filter.resources.flameUniforms as
      | { uniforms: Record<string, unknown> }
      | undefined;
    return group ? group.uniforms : null;
  }

  private writeUniforms(): void {
    const u = this.uniforms();
    if (!u) return;
    u.uResolution = this.uResolution;
    u.uElementColor = this.uElementColor;
  }

  /**
   * 炎ひとつ分の描画に掛かる時間を測る。GPU のタイマクエリが使えればそれを、
   * 使えなければ描画命令を積むまでの CPU 時間を記録する。常設の表示は作らず、
   * __fire.dump('flame') からのみ読める（画面に文字は出さない）。
   */
  private instrument(): void {
    const filter = this.filter as unknown as {
      apply: (...args: unknown[]) => unknown;
    };
    const original = filter.apply.bind(this.filter);
    filter.apply = (...args: unknown[]): unknown => {
      const manager = args[0] as { renderer?: { gl?: WebGL2RenderingContext } } | undefined;
      this.beginGpuTimer(manager?.renderer?.gl ?? null);
      const t0 = performance.now();
      const out = original(...args);
      const t1 = performance.now();
      this.endGpuTimer();

      // performance.now() は 0.1ms 刻みに丸められるので、窓で均して分解能を稼ぐ。
      this.cpuSum += t1 - t0;
      this.cpuCount++;
      if (this.cpuCount >= CPU_WINDOW_FRAMES) {
        this.cpuMs = this.cpuSum / this.cpuCount;
        this.cpuSum = 0;
        this.cpuCount = 0;
      }

      // タイマクエリが無い環境（ソフトウェアラスタライザなど）では、
      // たまに gl.finish() まで待って「積んでから描き終わるまで」を測る。
      // 毎フレームやると同期で遅くなるので SYNC_EVERY 回に 1 度だけ。
      this.drawCount++;
      const gl = this.gl;
      if (this.timerUnavailable && gl && this.drawCount % SYNC_EVERY === 0) {
        gl.finish();
        // 1 回分は 0.1ms 刻みに丸められるので、何回か均してから出す。
        this.syncSum += performance.now() - t0;
        this.syncCount++;
        if (this.syncCount >= SYNC_WINDOW) {
          this.syncMs = this.syncSum / this.syncCount;
          this.syncSum = 0;
          this.syncCount = 0;
        }
      }
      return out;
    };
  }

  private beginGpuTimer(gl: WebGL2RenderingContext | null): void {
    if (!gl) return;
    if (this.gl !== gl) {
      this.gl = gl;
      this.timerUnavailable = false;
      this.timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerQueryExt | null;
      if (!this.timerExt) this.timerUnavailable = true;
    }
    if (this.timerUnavailable) return;
    const ext = this.timerExt;
    if (!ext) return;
    // 前回の結果が出ていれば取り込む（クエリは数フレーム遅れて返る）。
    if (this.pendingQuery) {
      const done = gl.getQueryParameter(this.pendingQuery, gl.QUERY_RESULT_AVAILABLE) as boolean;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
      if (done) {
        if (!disjoint) {
          const ns = gl.getQueryParameter(this.pendingQuery, gl.QUERY_RESULT) as number;
          this.gpuMs = ns / 1e6;
        }
        gl.deleteQuery(this.pendingQuery);
        this.pendingQuery = null;
      } else {
        return; // 前のクエリが未完了の間は重ねない
      }
    }
    const q = gl.createQuery();
    if (!q) return;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    this.pendingQuery = q;
  }

  private endGpuTimer(): void {
    const gl = this.gl;
    const ext = this.timerExt;
    if (!gl || !ext || !this.pendingQuery) return;
    gl.endQuery(ext.TIME_ELAPSED_EXT);
  }

  private releaseQuery(): void {
    if (this.gl && this.pendingQuery) {
      this.gl.deleteQuery(this.pendingQuery);
    }
    this.pendingQuery = null;
    this.gl = null;
    this.timerExt = null;
  }
}

export default GlslFlameRenderer;
