/**
 * lookahead スケジューラ。25ms ごとに 120ms 先まで発音を予約する。
 * 何を鳴らすかは onStep コールバックで外から決める(状態との結合を避ける)。
 */
import { Clock, nextStepAfter } from './clock';
import { STEPS } from '../app/state';

export type StepHandler = (step: number, time: number) => void;

export class Scheduler {
  private timer: number | null = null;
  private loopIndex = 0;
  private step = 0;
  readonly lookahead = 0.12;
  readonly interval = 25;

  constructor(
    readonly clock: Clock,
    private readonly now: () => number,
    private readonly onStep: StepHandler,
  ) {}

  start(): void {
    if (this.timer !== null) return;
    this.resync();
    this.timer = window.setInterval(() => this.tick(), this.interval);
  }

  stop(): void {
    if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
  }

  /** 時計を動かした後(テンポ変更など)に呼び、次のステップを取り直す。 */
  resync(): void {
    const n = nextStepAfter(this.clock, this.now());
    this.loopIndex = n.loopIndex;
    this.step = n.step;
  }

  private tick(): void {
    const horizon = this.now() + this.lookahead;
    let guard = 0;
    while (this.clock.stepTime(this.loopIndex, this.step) < horizon && guard++ < 64) {
      this.onStep(this.step, this.clock.stepTime(this.loopIndex, this.step));
      this.step++;
      if (this.step >= STEPS) { this.step = 0; this.loopIndex++; }
    }
  }
}
