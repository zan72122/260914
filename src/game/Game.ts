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

  dump(section: 'materials' | 'jobs' | 'flame' | 'layout'): unknown {
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
      case 'layout':
        return {
          orientation: this.layout.orientation,
          unit: this.layout.unit,
          touchRadius: this.layout.touchRadius,
          width: this.layout.width,
          height: this.layout.height,
          bench: this.layout.bench,
          workshop: this.layout.workshop,
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
      benchFree: { x: l.bench.x + l.bench.w * 0.7, y: l.bench.y + l.bench.h * 0.75 },
    };
  }

  /**
   * 炎の芯の領域（画面座標, CSS px）。スクリーンショットの色判定に使う。
   * 材料を持つ手より下の、層が重なって不透明になる根元を見るので、
   * 材料の地の色が混ざらない。
   */
  flameRect(): { x: number; y: number; width: number; height: number } {
    const f = this.layout.flame;
    return {
      x: f.x - f.w * 0.12,
      y: f.y - f.h * 0.22,
      width: f.w * 0.24,
      height: f.h * 0.17,
    };
  }
}
