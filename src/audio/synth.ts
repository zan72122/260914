import { BURNER_BASE_TONE, BURNER_ELEMENT_TONE } from './cues';
import type { ElementId } from '../flame/elements';

/**
 * Web Audio だけで環境音と物理音を作る。音声ファイルは一つも持たない（PLAN §3.6）。
 * ここは「音の作り方」だけを持ち、いつ鳴らすかは GameAudio が決める。
 */

type Ctx = AudioContext;

function AudioCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function audioAvailable(): boolean {
  return AudioCtor() !== null;
}

/** ループ再生用の白色雑音。炎・波・火花の素になる。 */
function noiseBuffer(ctx: Ctx, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    // 少しだけ低域に寄せた雑音（純粋な白より炎らしい）
    last = (last + 0.02 * white) / 1.02;
    d[i] = white * 0.75 + last * 3.5;
  }
  return buf;
}

export class Synth {
  private ctx: Ctx;
  private master: GainNode;
  private noise: AudioBuffer;

  /** 持続音: バーナー */
  private burnerSrc: AudioBufferSourceNode | null = null;
  private burnerBand: BiquadFilterNode | null = null;
  private burnerGain: GainNode | null = null;
  /** 持続音: 波 */
  private waveSrc: AudioBufferSourceNode | null = null;
  private waveGain: GainNode | null = null;
  private waveLfo: OscillatorNode | null = null;

  private constructor(ctx: Ctx) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);
    this.noise = noiseBuffer(ctx);
  }

  static create(): Synth | null {
    const C = AudioCtor();
    if (!C) return null;
    try {
      return new Synth(new C());
    } catch {
      return null;
    }
  }

  /**
   * iOS は利用者の操作の中でしか鳴らせない。
   * 最初のタッチで resume し、無音の音源を一つ鳴らして道を開ける。
   */
  unlock(): void {
    try {
      void this.ctx.resume();
      const s = this.ctx.createBufferSource();
      s.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      s.connect(this.master);
      s.start(0);
    } catch {
      /* 鳴らせない端末では無音のまま続ける */
    }
  }

  private get now(): number {
    return this.ctx.currentTime;
  }

  private loopNoise(): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  // ---- バーナーの持続音（シュー） ----

  startBurner(): void {
    if (this.burnerSrc) return;
    const src = this.loopNoise();
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = BURNER_BASE_TONE.bandHz;
    band.Q.value = 0.7;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 320;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(band).connect(hp).connect(gain).connect(this.master);
    src.start(0);
    gain.gain.linearRampToValueAtTime(0.09, this.now + 0.4);
    this.burnerSrc = src;
    this.burnerBand = band;
    this.burnerGain = gain;
  }

  /** 炎の強さと、入っている元素で音の色をわずかに変える。 */
  setBurner(element: ElementId | null, intensityPct: number): void {
    if (!this.burnerGain || !this.burnerBand) return;
    const tone = element ? BURNER_ELEMENT_TONE[element] : BURNER_BASE_TONE;
    const t = this.now;
    const level = 0.05 + 0.07 * Math.max(0, Math.min(1, intensityPct / 100));
    this.burnerGain.gain.setTargetAtTime(level, t, 0.15);
    this.burnerBand.frequency.setTargetAtTime(tone.bandHz, t, 0.12);
    this.burnerBand.Q.setTargetAtTime(0.7 + tone.crackle, t, 0.12);
  }

  stopBurner(): void {
    if (!this.burnerSrc || !this.burnerGain) return;
    const t = this.now;
    this.burnerGain.gain.setTargetAtTime(0, t, 0.1);
    this.burnerSrc.stop(t + 0.5);
    this.burnerSrc = null;
    this.burnerBand = null;
    this.burnerGain = null;
  }

  // ---- 波（窓の外の港） ----

  startWaves(): void {
    if (this.waveSrc) return;
    const src = this.loopNoise();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 480;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.02;
    // ゆっくりした寄せ波
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain).connect(gain.gain);
    src.connect(lp).connect(gain).connect(this.master);
    src.start(0);
    lfo.start(0);
    this.waveSrc = src;
    this.waveGain = gain;
    this.waveLfo = lfo;
  }

  stopWaves(): void {
    if (!this.waveSrc) return;
    const t = this.now;
    this.waveGain?.gain.setTargetAtTime(0, t, 0.1);
    this.waveSrc.stop(t + 0.5);
    this.waveLfo?.stop(t + 0.5);
    this.waveSrc = null;
    this.waveGain = null;
    this.waveLfo = null;
  }

  // ---- 一度きりの音 ----

  /** 材料が炎に入る「ジュッ」。高い方から低い方へ落ちる雑音。 */
  materialEnter(): void {
    const t = this.now;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.1;
    band.frequency.setValueAtTime(3600, t);
    band.frequency.exponentialRampToValueAtTime(700, t + 0.32);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.42, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    src.connect(band).connect(gain).connect(this.master);
    src.start(t, Math.random() * 1.5, 0.4);
  }

  /** 切れた線の火花。短く硬い「パチッ」。 */
  spark(): void {
    const t = this.now;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2 + Math.random() * 0.12, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(hp).connect(gain).connect(this.master);
    src.start(t, Math.random() * 1.5, 0.09);
  }

  /** 銅: つながった線を電流が走る。低い唸りが駆け上がって作業灯が点く。 */
  current(durationMs: number): void {
    const t = this.now;
    const d = durationMs / 1000;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(58, t);
    osc.frequency.exponentialRampToValueAtTime(240, t + d * 0.7);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(2600, t + d * 0.7);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.05);
    gain.gain.setValueAtTime(0.3, t + d * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(lp).connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + d + 0.05);
    // 灯が点く瞬間の小さな「カチッ」
    const click = this.ctx.createBufferSource();
    click.buffer = this.noise;
    const clickHp = this.ctx.createBiquadFilter();
    clickHp.type = 'highpass';
    clickHp.frequency.value = 1800;
    const clickGain = this.ctx.createGain();
    const ct = t + d * 0.72;
    clickGain.gain.setValueAtTime(0.0001, ct);
    clickGain.gain.exponentialRampToValueAtTime(0.25, ct + 0.006);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, ct + 0.12);
    click.connect(clickHp).connect(clickGain).connect(this.master);
    click.start(ct, Math.random() * 1.5, 0.14);
  }

  /** ストロンチウム: 発射台が赤い信号炎を打ち上げる。噴出 → 上空でポン。 */
  flareLaunch(durationMs: number): void {
    const t = this.now;
    const d = durationMs / 1000;
    const rise = Math.min(0.9, d * 0.45);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.4;
    band.frequency.setValueAtTime(500, t);
    band.frequency.exponentialRampToValueAtTime(2800, t + rise);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.02, t + rise);
    src.connect(band).connect(gain).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + rise + 0.05);
    // 上空で開く音
    const pop = this.ctx.createOscillator();
    pop.type = 'sine';
    const pt = t + rise;
    pop.frequency.setValueAtTime(320, pt);
    pop.frequency.exponentialRampToValueAtTime(60, pt + 0.25);
    const popGain = this.ctx.createGain();
    popGain.gain.setValueAtTime(0.0001, pt);
    popGain.gain.exponentialRampToValueAtTime(0.4, pt + 0.01);
    popGain.gain.exponentialRampToValueAtTime(0.0001, pt + 0.4);
    pop.connect(popGain).connect(this.master);
    pop.start(pt);
    pop.stop(pt + 0.45);
  }

  /** リチウム: 電池工場の装置が動いて電池が出る。機械の唸りと、落ちる電池のコトン。 */
  batteryMachine(durationMs: number): void {
    const t = this.now;
    const d = durationMs / 1000;
    const motor = this.ctx.createOscillator();
    motor.type = 'square';
    motor.frequency.setValueAtTime(52, t);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 7;
    const vibGain = this.ctx.createGain();
    vibGain.gain.value = 4;
    vib.connect(vibGain).connect(motor.frequency);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.12);
    gain.gain.setValueAtTime(0.16, t + d * 0.72);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + d * 0.9);
    motor.connect(lp).connect(gain).connect(this.master);
    motor.start(t);
    motor.stop(t + d);
    vib.start(t);
    vib.stop(t + d);
    // 出てきた電池が受け皿に当たる
    const clack = this.ctx.createOscillator();
    clack.type = 'triangle';
    const kt = t + d * 0.78;
    clack.frequency.setValueAtTime(420, kt);
    clack.frequency.exponentialRampToValueAtTime(150, kt + 0.09);
    const clackGain = this.ctx.createGain();
    clackGain.gain.setValueAtTime(0.0001, kt);
    clackGain.gain.exponentialRampToValueAtTime(0.3, kt + 0.006);
    clackGain.gain.exponentialRampToValueAtTime(0.0001, kt + 0.18);
    clack.connect(clackGain).connect(this.master);
    clack.start(kt);
    clack.stop(kt + 0.2);
  }

  destroy(): void {
    this.stopBurner();
    this.stopWaves();
    try {
      void this.ctx.close();
    } catch {
      /* 閉じられなくても続ける */
    }
  }
}
