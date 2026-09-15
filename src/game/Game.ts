import { Application, Container } from 'pixi.js';
import { GameClock, type ClockMode } from '../core/GameClock';
import { EventLog, type LogEntry } from '../core/EventLog';
import { Rng } from '../core/Rng';
import { Speech } from '../audio/Speech';
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
  readonly eventLog = new EventLog(200);

  private stage = new Container();
  private world!: World;
  private view!: WorldView;
  private layout!: Layout;
  private rng!: Rng;
  private seedOverride: number | null = null;
  private readiness: Readiness = 'loading';
  private currentScenario: ScenarioName;
  private pointerId: number | null = null;

  private constructor(app: Application, opts: GameOptions) {
    this.app = app;
    this.clock = new GameClock(opts.clockMode);
    this.speech.captureOnly = opts.captureSpeech;
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
    window.addEventListener('resize', () => game.handleResize());
    window.addEventListener('orientationchange', () => game.handleResize());
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
    this.view.update(this.world, timeMs);
    this.app.renderer.render(this.app.stage);
  }

  /** 時間を進めずに一度だけ描き直す（大きさが変わったときなど）。 */
  private render(): void {
    this.view.update(this.world, this.clock.timeMs);
    this.app.renderer.render(this.app.stage);
  }

  private handleResize(): void {
    this.app.resize();
    this.layout = computeLayout(this.app.screen.width, this.app.screen.height);
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
      // iOS の制約: 最初のタッチの中で無音発話をして解錠する
      this.speech.unlock();
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

  dump(section: 'materials' | 'jobs' | 'flame'): unknown {
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
          timeMs: this.clock.timeMs,
        };
      default:
        return null;
    }
  }

  /** 検証が触る座標（世界の中の場所）。入力は必ず本来の経路（実ポインタ）を通す。 */
  points(): Record<string, { x: number; y: number }> {
    return {
      copper_scrap: { x: this.world.material('copper_scrap').x, y: this.world.material('copper_scrap').y },
      strontium_grains: { x: this.world.material('strontium_grains').x, y: this.world.material('strontium_grains').y },
      lithium_powder: { x: this.world.material('lithium_powder').x, y: this.world.material('lithium_powder').y },
      flame: { x: this.layout.flame.x, y: this.layout.flame.y - this.layout.flame.h * 0.5 },
      wireGap: { x: this.layout.wireGap.x, y: this.layout.wireGap.y },
      workLamp: { x: this.layout.workLamp.x, y: this.layout.workLamp.y },
    };
  }

  /** 炎領域（画面座標, CSS px）。スクリーンショットの色判定に使う。 */
  flameRect(): { x: number; y: number; width: number; height: number } {
    const f = this.layout.flame;
    return {
      x: f.x - f.w * 0.3,
      y: f.y - f.h * 0.8,
      width: f.w * 0.6,
      height: f.h * 0.55,
    };
  }
}
