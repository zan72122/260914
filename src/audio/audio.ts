// All sounds are synthesised with Web Audio so there are no assets to load.
// Everything is short, soft and toy-like.

type Ctx = AudioContext;

export class Audio {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private chuffGain: GainNode | null = null;
  private chuffTimer = 0;
  private noiseBuf: AudioBuffer | null = null;

  /** Must be called from a user gesture (iOS). Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.chuffGain = this.ctx.createGain();
      this.chuffGain.gain.value = 0;
      this.chuffGain.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, t0 = 0, glideTo?: number): void {
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime + t0;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, now + dur);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g).connect(this.master);
    o.start(now);
    o.stop(now + dur + 0.05);
  }

  private noise(dur: number, vol: number, freq: number, q = 1, t0 = 0): void {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const now = this.ctx.currentTime + t0;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  /** Two-note steam whistle. */
  whistle(): void {
    this.tone(880, 0.55, 'triangle', 0.25);
    this.tone(1108, 0.55, 'triangle', 0.18);
    this.tone(880 * 1.5, 0.5, 'sine', 0.06, 0.05);
    this.noise(0.5, 0.12, 2400, 0.7);
  }

  /** Rail ends snapping together. */
  click(): void {
    this.noise(0.05, 0.5, 3000, 2);
    this.tone(1200, 0.08, 'square', 0.05);
  }

  /** A piece landing on the felt. */
  thud(): void {
    this.noise(0.12, 0.6, 250, 1.2);
    this.tone(110, 0.15, 'sine', 0.3, 0, 60);
  }

  /** Something lifted from the ground. */
  lift(): void {
    this.tone(300, 0.18, 'sine', 0.12, 0, 600);
  }

  /** Piece put back into the toy box. */
  putAway(): void {
    this.noise(0.25, 0.4, 700, 0.8);
    this.tone(500, 0.2, 'triangle', 0.1, 0, 250);
  }

  brake(): void {
    this.noise(0.5, 0.25, 1500, 3);
    this.tone(500, 0.4, 'sine', 0.08, 0, 200);
  }

  /** Little melody when passengers get on or off. */
  passengers(up: boolean): void {
    const notes = up ? [523, 659, 784] : [784, 659, 523];
    notes.forEach((n, i) => this.tone(n, 0.18, 'triangle', 0.14, i * 0.09));
  }

  sparkle(): void {
    [1047, 1319, 1568, 2093].forEach((n, i) => this.tone(n, 0.25, 'sine', 0.09, i * 0.06));
  }

  bell(): void {
    this.tone(1760, 0.6, 'sine', 0.12);
    this.tone(2637, 0.4, 'sine', 0.05);
  }

  moo(): void {
    this.tone(180, 0.6, 'sawtooth', 0.09, 0, 140);
  }

  baa(): void {
    this.tone(520, 0.35, 'square', 0.05, 0, 470);
    this.tone(523, 0.3, 'sine', 0.08, 0.05, 500);
  }

  woof(): void {
    this.noise(0.08, 0.5, 600, 1);
    this.tone(320, 0.1, 'sawtooth', 0.08, 0, 220);
  }

  /** Engine running loop: call every frame with normalised speed 0..1. */
  chuff(speed: number, dt: number): void {
    if (!this.ctx || !this.chuffGain || !this.master) return;
    if (speed < 0.02) return;
    this.chuffTimer -= dt;
    if (this.chuffTimer <= 0) {
      this.chuffTimer = 0.55 - speed * 0.4;
      this.noise(0.1, 0.12 + speed * 0.15, 400 + speed * 300, 0.8);
    }
  }
}
