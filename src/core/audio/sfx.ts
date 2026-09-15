/**
 * Synthesized sound effects. No sample assets: everything is oscillators and
 * short noise bursts, so the whole game boots with zero audio downloads.
 * Silent (and harmless) before the AudioContext is unlocked.
 */
import type { AudioEngine } from './context';

export type SfxName =
  | 'pon'
  | 'pote'
  | 'laugh'
  | 'clap'
  | 'pochan'
  | 'rattle'
  | 'whee'
  /** Scene 3: one link of the giggle chain, a little bubblier than `laugh`. */
  | 'giggle'
  /** Scene 7: the "ba!" of a kid popping out of a bush. */
  | 'ba'
  /** Scene 8: the soft "fuwa" of a balloon lifting someone off the grass. */
  | 'fuwa'
  /** Scene 9: the "poro-poro" of a tower of children coming apart. */
  | 'poro'
  /** Scene 10: a slow, soft breath. */
  | 'breath'
  /** Scene 10: a star lighting up. */
  | 'twinkle';

/** Hard cap on simultaneous voices; a crowd must not turn into a wall of noise. */
export const MAX_VOICES = 12;

export class Sfx {
  private voices = 0;
  /** Per-name throttle so 120 kids stepping at once collapse into a chorus. */
  private lastAt: Record<string, number> = Object.create(null);

  constructor(private engine: AudioEngine) {}

  get activeVoices(): number {
    return this.voices;
  }

  /** True if a voice was actually started. */
  play(name: SfxName, opts: { gain?: number; detune?: number } = {}): boolean {
    const ctx = this.engine.ctx;
    const bus = this.engine.sfxBus;
    if (!ctx || !bus) return false; // still locked: silent, no error
    if (this.voices >= MAX_VOICES) return false;
    const t = ctx.currentTime;
    // Per-sound minimum gap: the sounds a whole crowd can make at once are
    // throttled hardest, so 40 laughing children stay a chorus, not a wall.
    const minGap =
      name === 'pote' ? 0.045 : name === 'rattle' || name === 'giggle' ? 0.06 : name === 'breath' ? 0.4 : 0.02;
    if (t - (this.lastAt[name] ?? -1) < minGap) return false;
    this.lastAt[name] = t;
    const gain = opts.gain ?? 1;
    const detune = opts.detune ?? 0;
    switch (name) {
      case 'pon':
        this.pon(ctx, bus, t, gain, detune);
        break;
      case 'pote':
        this.pote(ctx, bus, t, gain, detune);
        break;
      case 'laugh':
        this.laugh(ctx, bus, t, gain, detune);
        break;
      case 'clap':
        this.clap(ctx, bus, t, gain, detune);
        break;
      case 'pochan':
        this.pochan(ctx, bus, t, gain, detune);
        break;
      case 'rattle':
        this.rattle(ctx, bus, t, gain, detune);
        break;
      case 'whee':
        this.whee(ctx, bus, t, gain, detune);
        break;
      case 'giggle':
        this.giggle(ctx, bus, t, gain, detune);
        break;
      case 'ba':
        this.ba(ctx, bus, t, gain, detune);
        break;
      case 'fuwa':
        this.fuwa(ctx, bus, t, gain, detune);
        break;
      case 'poro':
        this.poro(ctx, bus, t, gain, detune);
        break;
      case 'breath':
        this.breath(ctx, bus, t, gain, detune);
        break;
      case 'twinkle':
        this.twinkle(ctx, bus, t, gain, detune);
        break;
    }
    return true;
  }

  private hold(node: AudioScheduledSourceNode, stopAt: number): void {
    this.voices++;
    node.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
    };
    node.stop(stopAt);
  }

  /** Tap: a soft round "pon". */
  private pon(ctx: BaseAudioContext, bus: AudioNode, t: number, g: number, detune: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const f = 540 * Math.pow(2, detune / 1200);
    osc.frequency.setValueAtTime(f * 1.5, t);
    osc.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.13);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.5 * g, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(env);
    env.connect(bus);
    osc.start(t);
    this.hold(osc, t + 0.24);
  }

  /** Footstep: a dull "pote", low sine plus a tiny filtered click. */
  private pote(ctx: BaseAudioContext, bus: AudioNode, t: number, g: number, detune: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const f = 150 * Math.pow(2, detune / 1200);
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.09);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.22 * g, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(env);
    env.connect(bus);
    osc.start(t);
    this.hold(osc, t + 0.14);
  }

  /** Laugh-like rising blip pair. */
  private laugh(ctx: BaseAudioContext, bus: AudioNode, t: number, g: number, detune: number): void {
    const base = 620 * Math.pow(2, detune / 1200);
    for (let i = 0; i < 2; i++) {
      const at = t + i * 0.1;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(base * (1 + i * 0.12), at);
      osc.frequency.exponentialRampToValueAtTime(base * (1.5 + i * 0.2), at + 0.07);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(0.3 * g, at + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
      osc.connect(env);
      env.connect(bus);
      osc.start(at);
      this.hold(osc, at + 0.12);
    }
  }

  /**
   * Short noise burst through a band-pass — the building block for claps,
   * splashes and the plastic rattle of ball-pit balls.
   */
  private noise(
    ctx: BaseAudioContext,
    bus: AudioNode,
    t: number,
    dur: number,
    freq: number,
    q: number,
    peak: number,
  ): void {
    const frames = Math.max(1, Math.ceil(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, t);
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(env);
    env.connect(bus);
    src.start(t);
    this.hold(src, t + dur + 0.02);
  }

  /** Clapping: three quick soft noise pats, never a sharp slap. */
  private clap(ctx: BaseAudioContext, bus: AudioNode, t: number, g: number, detune: number): void {
    const f = 1500 * Math.pow(2, detune / 1200);
    for (let i = 0; i < 3; i++) {
      this.noise(ctx, bus, t + i * 0.075, 0.09, f * (1 + i * 0.08), 1.1, 0.24 * g);
    }
  }

  /** Jumping into the ball pit: a round "pochan" with a falling pitch. */
  private pochan(ctx: BaseAudioContext, bus: AudioNode, t: number, g: number, detune: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const f = 420 * Math.pow(2, detune / 1200);
    osc.frequency.setValueAtTime(f * 1.9, t);
    osc.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.22);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.42 * g, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(env);
    env.connect(bus);
    osc.start(t);
    this.hold(osc, t + 0.32);
    // ...plus the soft splash of the balls being displaced.
    this.noise(ctx, bus, t + 0.02, 0.16, 900, 0.8, 0.16 * g);
  }

  /** Plastic balls knocking together: a few tight high noise ticks. */
  private rattle(ctx: BaseAudioContext, bus: AudioNode, t: number, g: number, detune: number): void {
    const f = 2600 * Math.pow(2, detune / 1200);
    for (let i = 0; i < 4; i++) {
      const at = t + i * 0.045 + Math.random() * 0.02;
      this.noise(ctx, bus, at, 0.05, f * (0.8 + Math.random() * 0.6), 6, 0.13 * g);
    }
  }

  /** A little "whee" as a kid launches: a quick rising glide. */
  private whee(ctx: BaseAudioContext, bus: AudioNode, t: number, g: number, detune: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const f = 480 * Math.pow(2, detune / 1200);
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 2.1, t + 0.18);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.26 * g, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    osc.connect(env);
    env.connect(bus);
    osc.start(t);
    this.hold(osc, t + 0.28);
  }

  /** One giggle: three quick bubbling blips, a bit higher than `laugh`. */
  private giggle(ctx: BaseAudioContext, bus: AudioNode, t: number, g: number, detune: number): void {
    const base = 760 * Math.pow(2, detune / 1200);
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.075;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * (1 + i * 0.16), at);
      osc.frequency.exponentialRampToValueAtTime(base * (1.28 + i * 0.16), at + 0.05);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(0.2 * g, at + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
      osc.connect(env);
      env.connect(bus);
      osc.start(at);
      this.hold(osc, at + 0.09);
    }
  }

  /** "Ba!" — a kid springing out of a bush: a short rising pop plus leaves. */
  private ba(ctx: BaseAudioContext, bus: AudioNode, t: number, g: number, detune: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const f = 300 * Math.pow(2, detune / 1200);
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 3.1, t + 0.09);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.42 * g, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(env);
    env.connect(bus);
    osc.start(t);
    this.hold(osc, t + 0.2);
    // The rustle of the bush it came out of.
    this.noise(ctx, bus, t, 0.14, 3400, 1.4, 0.12 * g);
  }

  /** "Fuwa" — a balloon taking someone up: a soft breathy upward swell. */
  private fuwa(ctx: BaseAudioContext, bus: AudioNode, t: number, g: number, detune: number): void {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const f = 380 * Math.pow(2, detune / 1200);
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.linearRampToValueAtTime(f * 1.7, t + 0.45);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.2 * g, t + 0.12);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(env);
    env.connect(bus);
    osc.start(t);
    this.hold(osc, t + 0.52);
  }

  /** "Poro-poro" — a tower coming apart: a run of soft wooden taps. */
  private poro(ctx: BaseAudioContext, bus: AudioNode, t: number, g: number, detune: number): void {
    const base = 420 * Math.pow(2, detune / 1200);
    for (let i = 0; i < 5; i++) {
      const at = t + i * 0.085;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const f = base * (1 - i * 0.12);
      osc.frequency.setValueAtTime(f * 1.4, at);
      osc.frequency.exponentialRampToValueAtTime(f * 0.7, at + 0.1);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(0.3 * g, at + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
      osc.connect(env);
      env.connect(bus);
      osc.start(at);
      this.hold(osc, at + 0.15);
    }
  }

  /** A sleeping breath: a long soft in-and-out of filtered noise. */
  private breath(ctx: BaseAudioContext, bus: AudioNode, t: number, g: number, detune: number): void {
    const f = 520 * Math.pow(2, detune / 1200);
    this.noise(ctx, bus, t, 0.55, f, 0.7, 0.07 * g);
    this.noise(ctx, bus, t + 0.7, 0.45, f * 0.72, 0.7, 0.05 * g);
  }

  /** A star lighting up: two tiny bell-like sines, a fifth apart. */
  private twinkle(ctx: BaseAudioContext, bus: AudioNode, t: number, g: number, detune: number): void {
    const base = 1650 * Math.pow(2, detune / 1200);
    for (let i = 0; i < 2; i++) {
      const at = t + i * 0.06;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * (i === 0 ? 1 : 1.5), at);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(0.16 * g, at + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
      osc.connect(env);
      env.connect(bus);
      osc.start(at);
      this.hold(osc, at + 0.44);
    }
  }
}
