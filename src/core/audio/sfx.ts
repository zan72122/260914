/**
 * Synthesized sound effects. No sample assets: everything is oscillators and
 * short noise bursts, so the whole game boots with zero audio downloads.
 * Silent (and harmless) before the AudioContext is unlocked.
 */
import type { AudioEngine } from './context';

export type SfxName = 'pon' | 'pote' | 'laugh';

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
    const minGap = name === 'pote' ? 0.045 : 0.02;
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
}
