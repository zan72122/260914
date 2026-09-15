/**
 * ゲーム時間。本番（real）も検証（manual）も、同じ update 経路を通す。
 * 描画のノイズ時間もこの時計から取る（壁時計は使わない）。
 */
export type ClockMode = 'manual' | 'real';

export type UpdateFn = (dtMs: number, timeMs: number) => void;

/** 一回の update に渡す最大の刻み。これを超える前進は分割して全て処理する（飛ばさない）。 */
export const MAX_SLICE_MS = 16;

/** real モードで一度に取り込む壁時計差分の上限（タブ復帰時の暴走を防ぐ）。 */
const REAL_DELTA_CAP_MS = 100;

export class GameClock {
  private _mode: ClockMode;
  private _timeMs = 0;
  private _running = false;
  private _rafId: number | null = null;
  private _lastWall = 0;
  private _update: UpdateFn = () => {};

  constructor(mode: ClockMode = 'real') {
    this._mode = mode;
  }

  get mode(): ClockMode {
    return this._mode;
  }

  /** ゲーム内経過時間（ms）。描画のノイズ時間もここから取る。 */
  get timeMs(): number {
    return this._timeMs;
  }

  setUpdate(fn: UpdateFn): void {
    this._update = fn;
  }

  setMode(mode: ClockMode): void {
    if (mode === this._mode) return;
    this._mode = mode;
    if (mode === 'manual') {
      this.stopRaf();
    } else if (this._running) {
      this.startRaf();
    }
  }

  /** real モードの自動前進を開始する。manual では何もしない。 */
  start(): void {
    this._running = true;
    if (this._mode === 'real') this.startRaf();
  }

  stop(): void {
    this._running = false;
    this.stopRaf();
  }

  /** 時刻を 0 に戻す（シナリオの全破棄と同時に呼ぶ）。 */
  reset(): void {
    this._timeMs = 0;
    this._lastWall = typeof performance !== 'undefined' ? performance.now() : 0;
  }

  /** 指定 ms だけ前進させる。MAX_SLICE_MS ごとに分割し、全ての刻みを update に通す。 */
  step(ms: number): void {
    this.advance(ms);
  }

  private advance(ms: number): void {
    let remaining = Math.max(0, ms);
    if (remaining === 0) {
      // 0 進行でも一度も update を呼ばない（状態を変えない）
      return;
    }
    while (remaining > 0) {
      const slice = Math.min(MAX_SLICE_MS, remaining);
      this._timeMs += slice;
      this._update(slice, this._timeMs);
      remaining -= slice;
    }
  }

  private startRaf(): void {
    if (this._rafId !== null) return;
    if (typeof requestAnimationFrame !== 'function') return;
    this._lastWall = performance.now();
    const loop = (): void => {
      this._rafId = requestAnimationFrame(loop);
      const now = performance.now();
      const delta = Math.min(REAL_DELTA_CAP_MS, now - this._lastWall);
      this._lastWall = now;
      this.advance(delta);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  private stopRaf(): void {
    if (this._rafId === null) return;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }
}
