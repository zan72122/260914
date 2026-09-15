/**
 * BGM(7.5)。のんびりしたループを合成で作る。
 *  - ペンタトニック音階、72〜84 BPM
 *  - 三角波 + 柔らかいディレイ
 *  - 8 小節ループ。テーマごとに音色とキーを変える
 *  - 音量は効果音の 40% 程度
 *  - オン / オフ UI は設けない(Q4)
 */
import type { ThemeId } from '../levels/schema';
import { getAudioContext, getMaster } from './context';

/** 効果音に対する BGM の音量比(7.5) */
export const BGM_LEVEL = 0.4;

interface Voice {
  /** 主音の周波数(キー) */
  readonly root: number;
  readonly bpm: number;
  readonly type: OscillatorType;
  /** ディレイの長さ(秒) */
  readonly delay: number;
}

/** ペンタトニック(長音階の 1・2・3・5・6 度)の半音オフセット */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

const VOICES: Readonly<Record<ThemeId, Voice>> = {
  'desert-day': { root: 261.63, bpm: 84, type: 'triangle', delay: 0.28 },
  'desert-dusk': { root: 246.94, bpm: 80, type: 'triangle', delay: 0.3 },
  meadow: { root: 293.66, bpm: 84, type: 'triangle', delay: 0.26 },
  'water-day': { root: 329.63, bpm: 80, type: 'sine', delay: 0.3 },
  'water-dusk': { root: 220.0, bpm: 76, type: 'sine', delay: 0.34 },
  'gray-city': { root: 233.08, bpm: 78, type: 'triangle', delay: 0.3 },
  'green-city-night': { root: 196.0, bpm: 74, type: 'triangle', delay: 0.36 },
  'night-rail': { root: 174.61, bpm: 72, type: 'sine', delay: 0.38 },
  'bridge-city': { root: 261.63, bpm: 80, type: 'triangle', delay: 0.3 },
  'night-festival': { root: 196.0, bpm: 76, type: 'triangle', delay: 0.36 },
};

/** 地図画面のキー(どのテーマにも属さない、のんびりした明るさ) */
const MAP_VOICE: Voice = { root: 261.63, bpm: 78, type: 'triangle', delay: 0.32 };

/** 8 小節 × 1 小節 4 拍 = 32 拍ぶんの旋律(ペンタトニックの音度。-1 は休符) */
const MELODY = [
  0, -1, 2, -1, 4, -1, 2, -1,
  3, -1, 2, -1, 0, -1, -1, -1,
  4, -1, 5, -1, 3, -1, 2, -1,
  1, -1, 0, -1, -1, -1, -1, -1,
];
/** 低音。1 小節に 1 音 */
const BASS = [0, 3, 4, 2, 0, 5, 3, 0];

interface Running {
  readonly timer: ReturnType<typeof setInterval>;
  stop(): void;
}

let running: Running | undefined;
let currentKey: string | undefined;

function midiFreq(root: number, degree: number): number {
  const semi = PENTA[((degree % PENTA.length) + PENTA.length) % PENTA.length] ?? 0;
  const octave = Math.floor(degree / PENTA.length);
  return root * Math.pow(2, semi / 12 + octave);
}

/**
 * BGM を開始する(最初のタップ後に呼ぶ、R1)。
 * 同じ曲が既に鳴っていれば何もしない。
 */
export function startBgm(theme: ThemeId | 'map'): void {
  const key = String(theme);
  if (running && currentKey === key) return;
  stopBgm();
  const ctx = getAudioContext();
  const master = getMaster();
  if (!ctx || !master) return;

  const voice = theme === 'map' ? MAP_VOICE : (VOICES[theme] ?? MAP_VOICE);
  currentKey = key;

  let out: GainNode;
  let delay: DelayNode | undefined;
  let feedback: GainNode | undefined;
  try {
    out = ctx.createGain();
    out.gain.value = BGM_LEVEL * 0.22;
    out.connect(master);
    // 柔らかいディレイ
    delay = ctx.createDelay(1.0);
    delay.delayTime.value = voice.delay;
    feedback = ctx.createGain();
    feedback.gain.value = 0.3;
    out.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(master);
  } catch {
    return;
  }

  const beat = 60 / voice.bpm;
  let step = 0;
  let nextTime = ctx.currentTime + 0.12;
  const stopped = { value: false };

  const note = (freq: number, at: number, dur: number, gain: number, type: OscillatorType): void => {
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, at);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(g);
      g.connect(out);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    } catch {
      /* 鳴らせなくても遊べる */
    }
  };

  const schedule = (): void => {
    if (stopped.value) return;
    const horizon = ctx.currentTime + 0.7;
    let guard = 0;
    while (nextTime < horizon && guard++ < 64) {
      const i = step % MELODY.length;
      const deg = MELODY[i] ?? -1;
      if (deg >= 0) note(midiFreq(voice.root, deg + 8), nextTime, beat * 1.4, 0.5, voice.type);
      if (i % 4 === 0) {
        const b = BASS[Math.floor(i / 4) % BASS.length] ?? 0;
        note(midiFreq(voice.root / 2, b), nextTime, beat * 2.6, 0.42, 'sine');
      }
      nextTime += beat * 0.5;
      step++;
    }
  };

  schedule();
  const timer = setInterval(schedule, 200);
  running = {
    timer,
    stop() {
      stopped.value = true;
      clearInterval(timer);
      try {
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(Math.max(0.0002, out.gain.value), t);
        out.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        feedback?.gain.setValueAtTime(0, t);
      } catch {
        /* noop */
      }
    },
  };
}

export function stopBgm(): void {
  running?.stop();
  running = undefined;
  currentKey = undefined;
}

/** 今鳴っている曲の識別子(テストとデバッグ用) */
export function currentBgm(): string | undefined {
  return currentKey;
}
