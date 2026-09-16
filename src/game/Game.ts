import { Application, Container } from 'pixi.js';
import { GameClock, type ClockMode } from '../core/GameClock';
import type { LogEntry } from '../core/EventLog';
import { EventTap } from '../core/EventTap';
import { watchViewport } from '../core/viewportWatch';
import { Rng } from '../core/Rng';
import { Speech } from '../audio/Speech';
import { GameAudio } from '../audio/GameAudio';
import { WorldView } from '../view/WorldView';
import { computeLayout, type Layout } from './layout';
import { World, type WorldStateView } from './world';
import { SCENARIOS, type ScenarioName } from '../scenarios/scenarios';

export type Readiness = 'loading' | 'ready' | 'busy';

export interface GameOptions {
  container: HTMLElement;
  /** 検証では実発話せず記録のみ */
  captureSpeech: boolean;
  clockMode: ClockMode;
  scenario: ScenarioName;
}

/**
 * 世界・時計・入力・描画をつなぐ。本番も検証も、ここに集まる同じ update 経路を通る。
 */
export class Game {
  readonly app: Application;
  readonly clock: GameClock;
  readonly speech = new Speech();
  readonly audio = new GameAudio();
  readonly eventLog = new EventTap(200);

  private stage = new Container();
  private world!: World;
  private view!: WorldView;
  private layout!: Layout;
  private rng!: Rng;
  private seedOverride: number | null = null;
  private readiness: Readiness = 'loading';
  private currentScenario: ScenarioName;
  private pointerId: number | null = null;
  private stopWatchingViewport: (() => void) | null = null;

  private constructor(app: Application, opts: GameOptions) {
    this.app = app;
    this.clock = new GameClock(opts.clockMode);
    this.speech.captureOnly = opts.captureSpeech;
    // 検証では実再生せず、鳴らす予定の音の列だけを残す
    this.audio.captureOnly = opts.captureSpeech;
    this.eventLog.onEvent((e) => this.audio.onEvent(e));
    this.currentScenario = opts.scenario;
    this.app.stage.addChild(this.stage);
    this.clock.setUpdate((dt, t) => this.tick(dt, t));
  }

  static async create(opts: GameOptions): Promise<Game> {
    const app = new Application();
    await app.init({
      background: 0x05070d,
      resizeTo: opts.container,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      preference: 'webgl',
    });
    // 時間は GameClock だけが進める（Pixi の ticker は使わない）
    app.ticker.stop();
    opts.container.appendChild(app.canvas);
    const game = new Game(app, opts);
    game.attachInput();
    // 回転・リサイズ（visualViewport の変化を含む）で置き直す。保持中の材料は失わない。
    game.stopWatchingViewport = watchViewport(() => game.handleResize());
    await game.loadScenario(opts.scenario);
    game.clock.start();
    return game;
  }

  get scenario(): ScenarioName {
    return this.currentScenario;
  }

  /** 名前付きシナリオを通常の初期化経路で読み込む。必ず全破棄から始める。 */
  async loadScenario(name: ScenarioName): Promise<void> {
    const scenario = SCENARIOS[name];
    if (!scenario) throw new Error(`unknown scenario: ${name}`);
    this.readiness = 'loading';
    this.currentScenario = name;

    // 全破棄
    if (this.view) {
      this.stage.removeChild(this.view.root);
      this.view.destroy();
    }
    this.eventLog.clear();
    this.speech.clear();
    this.audio.clear();
    this.clock.reset();

    // 通常の初期化 → 世界生成
    const seed = this.seedOverride ?? scenario.seed;
    this.rng = new Rng(seed);
    const visualRng = new Rng((seed ^ 0x9e3779b9) >>> 0);
    this.layout = computeLayout(this.app.screen.width, this.app.screen.height);
    this.world = new World({
      layout: this.layout,
      rng: this.rng,
      log: this.eventLog,
      speak: (req) => this.speech.speak(req, this.world.timeMs),
    });
    this.view = new WorldView(visualRng);
    this.view.layout(this.layout);
    this.stage.addChild(this.view.root);

    // 指定状態へ進める
    scenario.apply(this.world);

    this.eventLog.push({ t: 0, kind: 'scenario', msg: 'loaded', data: { name, seed } });
    this.render();
    this.readiness = 'ready';
    await Promise.resolve();
  }

  private tick(dtMs: number, timeMs: number): void {
    this.world.update(dtMs, timeMs);
    this.audio.update(
      {
        flameElement: this.world.flameElement,
        flameIntensityPct: this.world.flameIntensityPct,
        // 切れた線は、直るまで火花を出し続ける
        sparking: this.world.jobs.some((j) => j.id === 'wiring' && j.status === 'called'),
      },
      timeMs,
    );
    this.view.update(this.world, timeMs);
    this.app.renderer.render(this.app.stage);
  }

  /** 時間を進めずに一度だけ描き直す（大きさが変わったときなど）。 */
  private render(): void {
    this.view.update(this.world, this.clock.timeMs);
    this.app.renderer.render(this.app.stage);
  }

  /** 画面から取り外す。回転の見張りも解く。 */
  destroy(): void {
    this.stopWatchingViewport?.();
    this.stopWatchingViewport = null;
    this.clock.stop();
  }

  /**
   * 回転・リサイズ。置き場所を計算し直すだけで、世界の状態は作り直さない。
   * 保持中の材料も進行中の仕事も、そのまま続く（World.setLayout が置き直す）。
   */
  private handleResize(): void {
    if (!this.world) return; // まだ世界が無い（起動直後）
    this.app.resize();
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    if (w === this.layout.width && h === this.layout.height) return;
    this.layout = computeLayout(w, h);
    this.world.setLayout(this.layout);
    this.view.layout(this.layout);
    this.render();
  }

  // ---- 一本指のドラッグ一筆書き ----

  private toWorld(e: PointerEvent): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private attachInput(): void {
    const c = this.app.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => {
      if (this.pointerId !== null) return; // 一本指だけ受ける
      this.pointerId = e.pointerId;
      e.preventDefault();
      // iOS の制約: 最初のタッチの中で解錠する（合成音声と AudioContext を同じ手で）
      this.speech.unlock();
      this.audio.unlock();
      const p = this.toWorld(e);
      this.world.pointerDown(p.x, p.y);
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* 取れなくても続ける */
      }
    });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointerId) return;
      e.preventDefault();
      const p = this.toWorld(e);
      this.world.pointerMove(p.x, p.y);
    });
    const end = (e: PointerEvent, cancel: boolean): void => {
      if (e.pointerId !== this.pointerId) return;
      e.preventDefault();
      this.pointerId = null;
      if (cancel) this.world.pointerCancel();
      else {
        const p = this.toWorld(e);
        this.world.pointerUp(p.x, p.y);
      }
    };
    c.addEventListener('pointerup', (e) => end(e, false));
    c.addEventListener('pointercancel', (e) => end(e, true));
  }

  // ---- 観測 ----

  ready(): Readiness {
    if (this.readiness === 'loading') return 'loading';
    return this.world.acceptingInput ? 'ready' : 'busy';
  }

  state(): WorldStateView {
    return this.world.stateView();
  }

  logTail(n?: number): LogEntry[] {
    return this.eventLog.tail(n);
  }

  setSeed(n: number): void {
    this.seedOverride = n >>> 0;
  }

  dump(section: 'materials' | 'jobs' | 'flame' | 'prism' | 'layout' | 'audio'): unknown {
    switch (section) {
      case 'materials':
        return this.world.materials.map((m) => ({ ...m, x: Math.round(m.x), y: Math.round(m.y) }));
      case 'jobs':
        return this.world.jobs.map((j) => ({ ...j }));
      case 'flame':
        return {
          element: this.world.flameElement,
          intensityPct: this.world.flameIntensityPct,
          rect: this.layout.flame,
          core: this.flameRect(),
          timeMs: this.clock.timeMs,
          // 炎ひとつ分の描画の覗き窓（FBO 解像度と 1 フレームの描画時間）。
          // 常設の表示は作らない。ここからだけ読める。
          render: this.view.flameStats(),
        };
      case 'prism':
        return {
          at: this.world.prismAt,
          pos: { x: Math.round(this.world.prismPos.x), y: Math.round(this.world.prismPos.y) },
          inFront: this.world.prismInFrontOfFlame(),
          projecting: this.world.prismProjecting(),
          wall: this.layout.spectrumWall,
          ring: this.layout.ring,
          ringMaterial: this.world.ringMaterial()?.id ?? null,
        };
      case 'audio':
        return this.audio.captured();
      case 'layout':
        return {
          orientation: this.layout.orientation,
          unit: this.layout.unit,
          touchRadius: this.layout.touchRadius,
          width: this.layout.width,
          height: this.layout.height,
          bench: this.layout.bench,
          workshop: this.layout.workshop,
          ring: this.layout.ring,
          spectrumWall: this.layout.spectrumWall,
        };
      default:
        return null;
    }
  }

  /** 検証が実ポインタを当てるための世界座標。状態の代入はできない。 */
  points(): Record<string, { x: number; y: number }> {
    const m = (id: 'copper_scrap' | 'strontium_grains' | 'lithium_powder'): { x: number; y: number } => ({
      x: this.world.material(id).x,
      y: this.world.material(id).y,
    });
    const l = this.layout;
    return {
      copper_scrap: m('copper_scrap'),
      strontium_grains: m('strontium_grains'),
      lithium_powder: m('lithium_powder'),
      // 材料を炎に差し入れる位置（炎の下寄り。ここで持つと炎の芯の色が見える）
      flame: { x: l.flame.x, y: l.flame.y - l.flame.h * 0.5 },
      wireGap: { x: l.wireGap.x, y: l.wireGap.y },
      flareLauncher: { x: l.flareLauncher.x, y: l.flareLauncher.y },
      batteryFactory: { x: l.batteryFactory.x, y: l.batteryFactory.y },
      batteryOutlet: { x: l.batteryOutlet.x, y: l.batteryOutlet.y },
      workLamp: { x: l.workLamp.x, y: l.workLamp.y },
      remote: { x: l.remote.x, y: l.remote.y },
      remoteLamp: { x: l.remoteLamp.x, y: l.remoteLamp.y },
      rescueLight: { x: l.rescueTo.x, y: l.rescueTo.y },
      ship: { x: l.ship.x, y: l.ship.y },
      prism: { x: this.world.prismPos.x, y: this.world.prismPos.y },
      // 材料を置いたままにできる金属の輪（炎の中に張り出している）
      ring: { x: l.ring.x, y: l.ring.y },
      benchFree: { x: l.bench.x + l.bench.w * 0.7, y: l.bench.y + l.bench.h * 0.75 },
    };
  }

  /**
   * 炎の芯の領域（画面座標, CSS px）。スクリーンショットの色判定に使う。
   *
   * 取るのは**根元の外炎**（層が重なって不透明になる所）で、軸の真上は外す。
   * 軸の上には内炎（還元炎）の円錐があり、これは外炎とは別の発光をしている
   * （C2 Swan 帯が強く、素のガス炎では外炎より緑寄りの青緑になる。
   * 実際、覗いてみると軸上は 193°、外炎は 212° と別の色が出る）。
   * 「炎の色」として仕様が定めているのは外炎の色なので、そこを見る。
   *
   * 揺らぎは上へ行くほど大きく、根元はバーナーの口に固定されてほとんど動かない。
   * ここが「層が重なって不透明になる」かつ「静かな」場所である。
   * 材料を持つ手は炎の半分の高さに来るので、材料の地の色も混ざらない。
   *
   * 大きさは炎の高さ基準で決める（横幅基準にすると縦横比で意味が変わるため）。
   */
  flameRect(): { x: number; y: number; width: number; height: number } {
    const f = this.layout.flame;
    return {
      x: f.x + f.h * 0.095,
      y: f.y - f.h * 0.24,
      width: f.h * 0.09,
      height: f.h * 0.16,
    };
  }
}
