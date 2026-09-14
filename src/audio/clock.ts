/**
 * 汽車の位置とステップ時刻を決める唯一の時計。
 * 時刻源は AudioContext.currentTime(秒)。描画も音もここから位置を求める。
 */
import { STEPS, TEMPOS_BPM } from '../app/state';

export class Clock {
  /** ループ開始時刻(秒)。テンポ変更時は位相を保つように付け替える。 */
  loopStart = 0;
  tempoIdx = 1;

  constructor(tempoIdx = 1, loopStart = 0) {
    this.tempoIdx = tempoIdx;
    this.loopStart = loopStart;
  }

  get bpm(): number { return TEMPOS_BPM[this.tempoIdx]; }
  /** 1 ステップ = 8 分音符 */
  get stepDur(): number { return 60 / this.bpm / 2; }
  get loopDur(): number { return this.stepDur * STEPS; }

  /** 0..1 の位相(汽車の線路上の位置) */
  phase(now: number): number {
    const p = ((now - this.loopStart) / this.loopDur) % 1;
    return p < 0 ? p + 1 : p;
  }

  /** ステップ i の発音時刻。スロットは枕木の中央(i + 0.5)にある。 */
  stepTime(loopIndex: number, step: number): number {
    return this.loopStart + (loopIndex * STEPS + step + 0.5) * this.stepDur;
  }

  /** 位相を保ったままテンポを変える。 */
  setTempo(tempoIdx: number, now: number): void {
    const p = this.phase(now);
    this.tempoIdx = tempoIdx;
    this.loopStart = now - p * this.loopDur;
  }

  /** 位相を指定して時計を合わせる(再開時など)。 */
  setPhase(phase: number, now: number): void {
    this.loopStart = now - phase * this.loopDur;
  }
}

/** `now` 以降で最初に来る (loopIndex, step) を返す。 */
export function nextStepAfter(clock: Clock, now: number): { loopIndex: number; step: number } {
  const stepsElapsed = (now - clock.loopStart) / clock.stepDur - 0.5;
  const n = Math.max(0, Math.ceil(stepsElapsed));
  return { loopIndex: Math.floor(n / STEPS), step: n % STEPS };
}
