import { Container, Graphics } from 'pixi.js';
import type { ElementId } from './elements';
import { flameColorOf } from './elementColors';
import { GlslFlameRenderer } from './GlslFlameRenderer';

/** 炎の描画に必要な情報。時間は必ず GameClock 由来（壁時計を使わない）。 */
export interface FlameState {
  /** 炎に触れている材料の元素。無ければ null（＝ガス炎の青） */
  element: ElementId | null;
  /** 炎の勢い（100 = 平常） */
  intensityPct: number;
  /** ゲーム内時刻（ms）。描画のノイズ時間 */
  timeMs: number;
}

/**
 * 炎の描画境界。M1 の物理ベース GLSL 炎は、この interface を実装した
 * 別クラスを `createFlameRenderer` から返すだけで差し替わる。
 * 世界側（WorldView / World）はこの型しか知らない。
 */
/**
 * 検証・性能観察のための覗き窓。画面には何も出さない。
 * __fire.dump('flame') からのみ読める（PLAN §5.1）。
 */
export interface FlameStats {
  /** 元素色がどこまで支配しているか 0..1 */
  mix: number;
  element: ElementId | null;
  /** FBO の解像度倍率（1 未満なら落として描いて拡大している。PLAN §7） */
  fboScale: number;
  fboWidth: number;
  fboHeight: number;
  /** 1 フレームの炎描画時間 [ms] */
  frameMs: number;
  /** その値が GPU のタイマクエリ由来か、命令を積む CPU 時間か */
  frameMsSource: 'gpu' | 'sync' | 'cpu';
  cpuMs: number;
  gpuMs: number | null;
  /** gl.finish() まで待って測った値 [ms]。タイマクエリが無いときの実測 */
  syncMs?: number | null;
}

export interface FlameRenderer {
  /** 世界のシーンに足すための表示オブジェクト */
  readonly view: Container;
  /** 炎の置き場所と大きさ（縦横の再配置で呼び直される） */
  layout(x: number, y: number, width: number, height: number): void;
  /** 毎 update 呼ばれる。状態から見た目を決める */
  update(state: FlameState): void;
  /** 実装が持っていれば、検証用の覗き窓を返す。 */
  stats?(): FlameStats;
  destroy(): void;
}

/** 決定的な擬似ノイズ（時刻のみに依存する）。 */
function noise(t: number, phase: number): number {
  return (
    Math.sin(t * 0.0113 + phase) * 0.5 +
    Math.sin(t * 0.0071 + phase * 2.3) * 0.32 +
    Math.sin(t * 0.0231 + phase * 5.1) * 0.18
  );
}

/**
 * M0 の仮の炎。単色の層を重ねて揺らすだけ。色は elementColors 一箇所から取る。
 * GLSL が使えない場面のための控えとして残す。
 */
export class PlaceholderFlameRenderer implements FlameRenderer {
  readonly view = new Container();
  private readonly layers: Graphics[] = [];
  private w = 0;
  private h = 0;

  constructor(private readonly layerCount = 4) {
    for (let i = 0; i < this.layerCount; i++) {
      const g = new Graphics();
      this.layers.push(g);
      this.view.addChild(g);
    }
  }

  layout(x: number, y: number, width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.view.position.set(x, y);
    for (let i = 0; i < this.layers.length; i++) {
      const g = this.layers[i];
      const k = 1 - i / this.layers.length;
      g.clear();
      // 根本が広く先が細い、涙滴形を近似した多角形
      const hw = (this.w * 0.5) * (0.35 + 0.65 * k);
      const hh = this.h * (0.3 + 0.7 * k);
      g.moveTo(0, 0);
      g.bezierCurveTo(hw, -hh * 0.25, hw * 0.7, -hh * 0.62, 0, -hh);
      g.bezierCurveTo(-hw * 0.7, -hh * 0.62, -hw, -hh * 0.25, 0, 0);
      g.fill({ color: 0xffffff });
    }
  }

  update(state: FlameState): void {
    const color = flameColorOf(state.element);
    const intensity = state.intensityPct / 100;
    for (let i = 0; i < this.layers.length; i++) {
      const g = this.layers[i];
      const n = noise(state.timeMs, i * 1.7);
      g.tint = color.hex;
      // 内側ほど不透明・小さい。合成で中心が明るくなる。
      g.alpha = Math.min(1, (0.42 + 0.16 * i) * (0.85 + 0.25 * intensity));
      g.scale.set(1 + n * 0.06 * (1 + i * 0.25), intensity * (1 + n * 0.09 * (1 + i * 0.3)));
      g.skew.x = n * 0.05;
    }
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}

/**
 * 炎の実装を選ぶ唯一の場所。M1 の物理ベース GLSL 炎を返す。
 * 世界側（WorldView / World）はこの関数と FlameState しか知らない。
 */
export function createFlameRenderer(): FlameRenderer {
  return new GlslFlameRenderer();
}
