import type { LogEntry } from '../core/EventLog';
import type { ElementId } from '../flame/elements';
import { JOB_RUN_MS } from '../game/world';
import type { JobId } from '../game/layout';
import { SPARK_INTERVAL_MS, type AudioRecord, type CueAction, type CueId } from './cues';
import { Synth, audioAvailable } from './synth';

/** 毎フレーム、世界から音に渡す最小限。 */
export interface AmbienceInput {
  flameElement: ElementId | null;
  flameIntensityPct: number;
  /** 切れた線が火花を出している（銅の仕事が呼ばれている） */
  sparking: boolean;
}

/** 仕事が動いた瞬間に鳴る物理音。三つとも別の現象なので別の音（PLAN §3.4）。 */
const JOB_CUE: Record<JobId, CueId> = {
  wiring: 'current',
  flare: 'flare_launch',
  battery: 'battery_machine',
};

/**
 * 出来事（EventLog の kind）に反応して音を鳴らす。
 *
 * 検証では実再生せず「鳴らす予定の音の列」を記録するだけにする（captureOnly）。
 * 時刻はすべて GameClock 由来で、壁時計は使わない。
 */
export class GameAudio {
  private records: AudioRecord[] = [];
  private synth: Synth | null = null;
  private unlocked = false;
  private ambienceOn = false;
  private lastElement: ElementId | null = null;
  private sparking = false;
  private nextSparkAt = 0;
  private timeMs = 0;

  /** 検証では実再生せず、鳴らす予定の音のみ記録する */
  captureOnly = false;

  constructor(private readonly capacity = 200) {}

  get available(): boolean {
    return audioAvailable();
  }

  /**
   * iOS の AudioContext は利用者の操作の中でしか動かない。
   * 最初のタッチで、合成音声の解錠と同じ手で resume する。
   */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.captureOnly || !this.available) return;
    this.synth = Synth.create();
    this.synth?.unlock();
  }

  private record(cue: CueId, action: CueAction, data?: Record<string, unknown>): void {
    this.records.push({ t: Math.round(this.timeMs), cue, action, ...(data ? { data } : {}) });
    if (this.records.length > this.capacity) this.records.shift();
  }

  /** 世界の出来事に反応する。EventLog に積まれたものがそのまま渡ってくる。 */
  onEvent(e: LogEntry): void {
    this.timeMs = e.t;
    if (e.kind === 'flame' && e.msg === 'enter') {
      this.record('material_enter', 'play', { element: e.data?.element });
      this.synth?.materialEnter();
      return;
    }
    if (e.kind === 'deliver' && e.msg === 'success') {
      const job = e.data?.job as JobId | undefined;
      if (!job || !(job in JOB_CUE)) return;
      const cue = JOB_CUE[job];
      const runMs = JOB_RUN_MS[job];
      this.record(cue, 'play', { job, runMs });
      if (!this.synth) return;
      if (cue === 'current') this.synth.current(runMs);
      else if (cue === 'flare_launch') this.synth.flareLaunch(runMs);
      else this.synth.batteryMachine(runMs);
    }
  }

  /** 毎フレーム。持続音（バーナー・波・火花）の面倒を見る。 */
  update(input: AmbienceInput, timeMs: number): void {
    this.timeMs = timeMs;
    if (!this.ambienceOn && (this.captureOnly || this.unlocked)) {
      this.ambienceOn = true;
      this.record('burner', 'start');
      this.record('waves', 'start');
      this.synth?.startBurner();
      this.synth?.startWaves();
      this.lastElement = null;
      this.synth?.setBurner(null, input.flameIntensityPct);
    }
    if (!this.ambienceOn) return;

    if (input.flameElement !== this.lastElement) {
      this.lastElement = input.flameElement;
      this.record('burner', 'change', { element: input.flameElement });
    }
    this.synth?.setBurner(input.flameElement, input.flameIntensityPct);

    if (input.sparking !== this.sparking) {
      this.sparking = input.sparking;
      this.record('sparks', input.sparking ? 'start' : 'stop');
      this.nextSparkAt = timeMs;
    }
    if (this.sparking && this.synth && timeMs >= this.nextSparkAt) {
      this.synth.spark();
      this.nextSparkAt = timeMs + SPARK_INTERVAL_MS;
    }
  }

  /** 鳴らす予定の音の列（`__fire.dump('audio')`）。 */
  captured(): AudioRecord[] {
    return this.records.slice();
  }

  /** シナリオの全破棄と同時に呼ぶ。解錠（利用者の操作）は残す。 */
  clear(): void {
    this.records = [];
    this.timeMs = 0;
    this.ambienceOn = false;
    this.lastElement = null;
    this.sparking = false;
    this.nextSparkAt = 0;
    this.synth?.stopBurner();
    this.synth?.stopWaves();
  }
}
