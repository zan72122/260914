/**
 * Web Audio だけで作る効果音・環境音。外部ファイルなし。
 * iOS の制約上、最初のタッチで unlock() を呼ぶ。
 */
type OscType = OscillatorType;

export class Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private toneOsc: OscillatorNode | null = null;
  private toneGain: GainNode | null = null;
  private waveGain: GainNode | null = null;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
    this.master = master;

    // 波の環境音: ピンクノイズ + ローパス + ゆっくりしたうねり
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099;
      b1 = 0.963 * b1 + w * 0.2965;
      b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const wg = ctx.createGain();
    wg.gain.value = 0.12;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.07;
    lfo.connect(lfoG);
    lfoG.connect(wg.gain);
    src.connect(lp);
    lp.connect(wg);
    wg.connect(master);
    src.start();
    lfo.start();
    this.waveGain = wg;

    // 伸縮中の持続音(大きい=低い、小さい=高い)
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 330;
    const tf = ctx.createBiquadFilter();
    tf.type = 'lowpass';
    tf.frequency.value = 1400;
    const tg = ctx.createGain();
    tg.gain.value = 0;
    osc.connect(tf);
    tf.connect(tg);
    tg.connect(master);
    osc.start();
    this.toneOsc = osc;
    this.toneGain = tg;

    if (ctx.state === 'suspended') void ctx.resume();
  }

  /** 潮の高さ(0..1)で波音の大きさを変える */
  setWaveLevel(v: number): void {
    if (!this.ctx || !this.waveGain) return;
    this.waveGain.gain.setTargetAtTime(0.07 + v * 0.12, this.ctx.currentTime, 0.3);
  }

  tone(active: boolean, scale: number): void {
    if (!this.ctx || !this.toneOsc || !this.toneGain) return;
    const t = this.ctx.currentTime;
    this.toneGain.gain.setTargetAtTime(active ? 0.09 : 0, t, 0.04);
    this.toneOsc.frequency.setTargetAtTime(330 / scale, t, 0.03);
  }

  private blip(
    type: OscType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    delay = 0,
    filterFreq?: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = osc;
    if (filterFreq) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filterFreq;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol: number, freq: number, q: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    const t0 = ctx.currentTime + delay;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t0);
  }

  /** 掴んだとき: ぽよん */
  pop(): void {
    this.blip('sine', 320, 640, 0.14, 0.25);
  }
  /** ヤシの実が落ちた */
  thud(): void {
    this.blip('sine', 150, 50, 0.22, 0.35);
  }
  splash(): void {
    this.noise(0.35, 0.25, 1800, 0.8);
  }
  /** 海や地面を触った */
  ripple(): void {
    this.blip('sine', 720, 420, 0.25, 0.12);
  }
  twinkle(): void {
    this.blip('sine', 1800, 2600, 0.15, 0.06);
  }
  meow(): void {
    this.blip('sawtooth', 520, 900, 0.18, 0.07, 0, 1400);
    this.blip('sawtooth', 900, 430, 0.32, 0.07, 0.17, 1400);
  }
  chirp(): void {
    for (let i = 0; i < 3; i++) this.blip('sine', 2200, 3200, 0.08, 0.07, i * 0.11);
  }
  whoosh(): void {
    this.noise(0.5, 0.12, 900, 1.2);
  }
  /** 柱を見つけた: チャイム */
  chime(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
    notes.forEach((f, i) => {
      this.blip('sine', f, f, 1.5, 0.18, i * 0.1);
      this.blip('sine', f * 2, f * 2, 0.8, 0.05, i * 0.1);
    });
  }
  /** 初期状態へ戻る: 下降 */
  rewind(): void {
    const notes = [1046.5, 783.99, 659.25, 523.25];
    notes.forEach((f, i) => this.blip('sine', f, f, 0.6, 0.12, i * 0.09));
  }
}
