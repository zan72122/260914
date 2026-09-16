/**
 * Tiny procedural sound kit. No assets: everything is a few oscillators and
 * a noise buffer. Sound is used as a causality signifier (first raindrop,
 * wind rising, cloth landing), never as decoration.
 */
export class Audio {
  muted = false;
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  /** continuous beds, e.g. rain wash / wind */
  private beds = new Map<string, { gain: GainNode; filter: BiquadFilterNode; src: AudioBufferSourceNode }>();

  private ensure(): AudioContext | null {
    if (this.ac) return this.ac;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ac = new Ctor();
      this.master = this.ac.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(this.ac.destination);
      const len = Math.floor(this.ac.sampleRate * 1.5);
      const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = buf.getChannelData(0);
      let v = 0;
      for (let i = 0; i < len; i++) {
        v = v * 0.5 + (Math.random() * 2 - 1) * 0.5;
        d[i] = v;
      }
      this.noiseBuf = buf;
    } catch {
      this.ac = null;
    }
    return this.ac;
  }

  /** call from the first pointerdown */
  resume(): void {
    const ac = this.ensure();
    if (ac && ac.state === 'suspended') void ac.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ac) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ac.currentTime, 0.05);
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private now(): number {
    return this.ac ? this.ac.currentTime : 0;
  }

  private noise(dur: number, gain: number, type: BiquadFilterType, freq: number, q = 1): void {
    const ac = this.ensure();
    if (!ac || !this.master || !this.noiseBuf) return;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    const t = this.now();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private tone(
    freq: number,
    dur: number,
    gain: number,
    type: OscillatorType = 'sine',
    glideTo?: number,
    delay = 0,
  ): void {
    const ac = this.ensure();
    if (!ac || !this.master) return;
    const o = ac.createOscillator();
    o.type = type;
    const t = this.now() + delay;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---- one-shots -------------------------------------------------------

  /** a single raindrop landing on cloth: short filtered noise + a tiny pitch blip */
  drop(pitch = 1): void {
    this.noise(0.09, 0.35, 'bandpass', 1500 * pitch, 3);
    this.tone(900 * pitch, 0.07, 0.06, 'sine', 420 * pitch);
  }

  /** drop into water */
  plip(pitch = 1): void {
    this.tone(700 * pitch, 0.12, 0.09, 'sine', 1600 * pitch);
  }

  /** wind / cloth whoosh */
  whoosh(strength = 1, dur = 0.7): void {
    const ac = this.ensure();
    if (!ac || !this.master || !this.noiseBuf) return;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.9;
    const t = this.now();
    f.frequency.setValueAtTime(320, t);
    f.frequency.linearRampToValueAtTime(1100 * strength, t + dur * 0.45);
    f.frequency.linearRampToValueAtTime(260, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.14 * strength, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** soft body landing */
  thump(pitch = 1): void {
    this.tone(150 * pitch, 0.18, 0.16, 'sine', 62 * pitch);
    this.noise(0.13, 0.12, 'lowpass', 520 * pitch, 0.7);
  }

  /** wet cloth flop */
  flump(wet = 0): void {
    this.tone(120, 0.22, 0.14, 'sine', 55);
    this.noise(0.18 + wet * 0.2, 0.1 + wet * 0.16, 'lowpass', 900 - wet * 400, 0.8);
  }

  /** water pouring out of a soaked garment */
  gush(dur = 1.1): void {
    const ac = this.ensure();
    if (!ac || !this.master || !this.noiseBuf) return;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.6;
    const t = this.now();
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(380, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
    for (let i = 0; i < 5; i++) this.tone(500 + Math.random() * 700, 0.1, 0.03, 'sine', 1400, 0.08 * i);
  }

  /** cat-ish chirp (kept here so other episodes can use it) */
  mew(): void {
    this.tone(620, 0.16, 0.09, 'triangle', 940);
    this.tone(880, 0.2, 0.05, 'sine', 700, 0.1);
  }

  /** the sun coming back out */
  bloom(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(f, 0.9 - i * 0.1, 0.055, 'sine', undefined, i * 0.085));
  }

  /** hub tile tap */
  blip(): void {
    this.tone(660, 0.1, 0.07, 'triangle', 990);
  }

  // ---- continuous beds -------------------------------------------------

  /** rain wash / wind bed. level 0 stops it. */
  bed(name: string, level: number, freq = 1400): void {
    const ac = this.ensure();
    if (!ac || !this.master || !this.noiseBuf) return;
    let b = this.beds.get(name);
    if (!b) {
      if (level <= 0) return;
      const src = ac.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filter = ac.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 0.5;
      filter.frequency.value = freq;
      const gain = ac.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.master);
      src.start();
      b = { gain, filter, src };
      this.beds.set(name, b);
    }
    b.filter.frequency.setTargetAtTime(freq, ac.currentTime, 0.2);
    b.gain.gain.setTargetAtTime(level, ac.currentTime, 0.18);
  }

  stopAllBeds(): void {
    for (const [, b] of this.beds) {
      try {
        b.gain.gain.value = 0;
        b.src.stop();
      } catch {
        /* ignore */
      }
    }
    this.beds.clear();
  }
}
