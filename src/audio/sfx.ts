/**
 * 効果音(7.5)。すべて Web Audio API の合成で作る。
 * 外部音源ファイルは使わない。人の声・言葉は一切使わない。
 */
import { getAudioContext, getMaster, getNoiseBuffer } from './context';

interface Env {
  readonly ctx: AudioContext;
  readonly out: GainNode;
  readonly now: number;
}

function env(): Env | undefined {
  const ctx = getAudioContext();
  const out = getMaster();
  if (!ctx || !out) return undefined;
  return { ctx, out, now: ctx.currentTime };
}

/** 単音。減衰つきの 1 発 */
function tone(
  e: Env,
  opts: {
    type: OscillatorType;
    freq: number;
    at?: number;
    dur: number;
    gain: number;
    /** 終端の周波数(スイープ) */
    to?: number;
  },
): void {
  const t0 = e.now + (opts.at ?? 0);
  const osc = e.ctx.createOscillator();
  const g = e.ctx.createGain();
  osc.type = opts.type;
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + opts.dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t0 + Math.min(0.02, opts.dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  osc.connect(g);
  g.connect(e.out);
  osc.start(t0);
  osc.stop(t0 + opts.dur + 0.02);
}

/** ノイズバースト。帯域を絞ると «ポン» に、絞らないと «ザッ» になる */
function noise(
  e: Env,
  opts: { at?: number; dur: number; gain: number; freq: number; q?: number; type?: BiquadFilterType; to?: number },
): void {
  const buf = getNoiseBuffer();
  if (!buf) return;
  const t0 = e.now + (opts.at ?? 0);
  const src = e.ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filt = e.ctx.createBiquadFilter();
  filt.type = opts.type ?? 'bandpass';
  filt.frequency.setValueAtTime(opts.freq, t0);
  if (opts.to !== undefined) filt.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + opts.dur);
  filt.Q.value = opts.q ?? 1;
  const g = e.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(e.out);
  src.start(t0);
  src.stop(t0 + opts.dur + 0.02);
}

/** 回転: 短い矩形波 + 急減衰(カチッ) */
export function playRotate(): void {
  const e = env();
  if (!e) return;
  tone(e, { type: 'square', freq: 880, to: 620, dur: 0.07, gain: 0.16 });
  noise(e, { dur: 0.05, gain: 0.09, freq: 2600, q: 2 });
}

/** 上下: ノイズ + ローパスのスイープ(ズズッ)+ 低音の «トン» */
export function playLift(up: boolean): void {
  const e = env();
  if (!e) return;
  noise(e, {
    dur: 0.26,
    gain: 0.12,
    freq: up ? 320 : 900,
    to: up ? 900 : 320,
    q: 0.8,
    type: 'lowpass',
  });
  tone(e, { type: 'sine', at: 0.24, freq: 150, to: 90, dur: 0.16, gain: 0.22 });
}

/** 破壊: ノイズバースト + 帯域ノイズ(ポン!)。低音は控えめ = 怖くない */
export function playDestroy(): void {
  const e = env();
  if (!e) return;
  noise(e, { dur: 0.22, gain: 0.2, freq: 1400, to: 400, q: 1.2 });
  tone(e, { type: 'sine', freq: 300, to: 140, dur: 0.18, gain: 0.16 });
}

/** タップ失敗: 短い低め正弦波 1 発(責めない) */
export function playMiss(): void {
  const e = env();
  if (!e) return;
  tone(e, { type: 'sine', freq: 220, to: 180, dur: 0.14, gain: 0.12 });
}

/** クラクション: 三角波 2 音の和音、0.3 秒、1 回だけ */
export function playHorn(): void {
  const e = env();
  if (!e) return;
  tone(e, { type: 'triangle', freq: 392, dur: 0.3, gain: 0.14 });
  tone(e, { type: 'triangle', freq: 494, dur: 0.3, gain: 0.11 });
}

/** ファンファーレ: 三角波でペンタトニック上昇(4〜5 音) */
export function playFanfare(): void {
  const e = env();
  if (!e) return;
  const notes = [523.25, 587.33, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => {
    tone(e, { type: 'triangle', freq: f, at: i * 0.11, dur: i === notes.length - 1 ? 0.6 : 0.2, gain: 0.18 });
  });
}

/** 紙吹雪: 高音のキラキラ(短い正弦波を乱数ピッチで複数) */
export function playSparkle(): void {
  const e = env();
  if (!e) return;
  for (let i = 0; i < 10; i++) {
    tone(e, {
      type: 'sine',
      freq: 1400 + Math.random() * 1600,
      at: Math.random() * 0.5,
      dur: 0.12,
      gain: 0.07,
    });
  }
}

/** 島に入る(上昇する 2 音) */
export function playEnterIsland(): void {
  const e = env();
  if (!e) return;
  tone(e, { type: 'triangle', freq: 440, dur: 0.14, gain: 0.14 });
  tone(e, { type: 'triangle', freq: 660, at: 0.1, dur: 0.22, gain: 0.14 });
}

/** 島から出る(下降する 2 音) */
export function playExitIsland(): void {
  const e = env();
  if (!e) return;
  tone(e, { type: 'triangle', freq: 660, dur: 0.14, gain: 0.12 });
  tone(e, { type: 'triangle', freq: 440, at: 0.1, dur: 0.22, gain: 0.12 });
}

/** 花火(祝祭状態)。ヒュッと上がってポン */
export function playFirework(): void {
  const e = env();
  if (!e) return;
  tone(e, { type: 'sine', freq: 500, to: 1400, dur: 0.35, gain: 0.05 });
  noise(e, { at: 0.35, dur: 0.3, gain: 0.14, freq: 1800, to: 500, q: 0.9 });
}

/** 走行音(4.4)。車は低い正弦波のゆらぎ、列車は «シュッシュッ» のノイズ周期 */
export interface EngineLoop {
  stop(): void;
}

let engine: EngineLoop | undefined;

export function startEngine(kind: 'car' | 'train'): void {
  stopEngine();
  const e = env();
  if (!e) return;
  const g = e.ctx.createGain();
  g.gain.value = 0.0001;
  g.connect(e.out);
  const nodes: { stop?: (t?: number) => void; disconnect?: () => void }[] = [];

  if (kind === 'car') {
    const osc = e.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 90;
    const lfo = e.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 5.5;
    const lfoGain = e.ctx.createGain();
    lfoGain.gain.value = 9;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(g);
    osc.start(e.now);
    lfo.start(e.now);
    nodes.push(osc, lfo);
    g.gain.exponentialRampToValueAtTime(0.09, e.now + 0.1);
  } else {
    const buf = getNoiseBuffer();
    if (buf) {
      const src = e.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filt = e.ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = 1200;
      filt.Q.value = 1.4;
      const puff = e.ctx.createOscillator();
      puff.type = 'sine';
      puff.frequency.value = 3.2; // シュッシュッの周期
      const puffGain = e.ctx.createGain();
      puffGain.gain.value = 0.05;
      puff.connect(puffGain);
      puffGain.connect(g.gain);
      src.connect(filt);
      filt.connect(g);
      src.start(e.now);
      puff.start(e.now);
      nodes.push(src, puff);
    }
    g.gain.exponentialRampToValueAtTime(0.06, e.now + 0.1);
  }

  engine = {
    stop() {
      const t = e.ctx.currentTime;
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(Math.max(0.0002, g.gain.value), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      } catch {
        /* noop */
      }
      for (const n of nodes) {
        try {
          n.stop?.(t + 0.2);
        } catch {
          /* noop */
        }
      }
    },
  };
}

export function stopEngine(): void {
  engine?.stop();
  engine = undefined;
}
