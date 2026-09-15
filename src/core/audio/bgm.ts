/**
 * Stub BGM: a short generated pentatonic loop (music-box-ish triangle waves)
 * per scene, with a crossfade API for scene transitions. Phase 0 ships the
 * generator and the crossfade; per-scene keys/tempos arrive with the scenes.
 */
import type { AudioEngine } from './context';

/** Semitone offsets of a major pentatonic scale. */
export const PENTATONIC = [0, 2, 4, 7, 9];

export interface BgmVoiceOptions {
  /** MIDI note of the tonic. */
  root: number;
  /** Beats per minute. */
  tempo: number;
  /** Notes per loop. */
  steps?: number;
  /** Deterministic seed so a scene always sounds like itself. */
  seed?: number;
}

/**
 * Two distinct scene loops, in different keys and tempos so the crossfade at a
 * scene change is audible as "somewhere new" rather than as the same tune.
 *   - gather:  G major pentatonic, unhurried.
 *   - ballpit: D major pentatonic, noticeably bouncier.
 */
export const BGM_GATHER: BgmVoiceOptions = { root: 67, tempo: 92, steps: 16, seed: 11 };
export const BGM_BALLPIT: BgmVoiceOptions = { root: 62, tempo: 132, steps: 16, seed: 29 };

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Small deterministic PRNG (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds a loop of MIDI notes in the pentatonic scale over `root`. */
export function buildLoop(opts: BgmVoiceOptions): number[] {
  const steps = opts.steps ?? 16;
  const rng = makeRng(opts.seed ?? 1);
  const out: number[] = [];
  for (let i = 0; i < steps; i++) {
    const degree = Math.floor(rng() * PENTATONIC.length);
    const octave = rng() < 0.25 ? 12 : 0;
    out.push(opts.root + PENTATONIC[degree] + octave);
  }
  return out;
}

class BgmVoice {
  gain: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private notes: number[];
  private index = 0;
  private stepSec: number;

  constructor(
    private ctx: AudioContext,
    dest: AudioNode,
    opts: BgmVoiceOptions,
  ) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(dest);
    this.notes = buildLoop(opts);
    this.stepSec = 60 / opts.tempo / 2;
  }

  start(): void {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), this.stepSec * 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      this.gain.disconnect();
    } catch {
      /* already gone */
    }
  }

  private tick(): void {
    const midi = this.notes[this.index % this.notes.length];
    this.index++;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(midiToHz(midi), t);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + this.stepSec * 1.8);
    osc.connect(env);
    env.connect(this.gain);
    osc.start(t);
    osc.stop(t + this.stepSec * 2);
  }
}

export class Bgm {
  private current: BgmVoice | null = null;
  private pending: BgmVoiceOptions | null = null;

  constructor(private engine: AudioEngine) {}

  /** Crossfades to a new generated loop. Safe (and queued) while locked. */
  play(opts: BgmVoiceOptions, fadeSec = 1.2): void {
    const ctx = this.engine.ctx;
    const bus = this.engine.bgmBus;
    if (!ctx || !bus) {
      this.pending = opts; // start it as soon as we are unlocked
      return;
    }
    const next = new BgmVoice(ctx, bus, opts);
    const t = ctx.currentTime;
    next.gain.gain.setValueAtTime(0.0001, t);
    next.gain.gain.linearRampToValueAtTime(1, t + fadeSec);
    next.start();
    const prev = this.current;
    if (prev) {
      prev.gain.gain.cancelScheduledValues(t);
      prev.gain.gain.setValueAtTime(prev.gain.gain.value, t);
      prev.gain.gain.linearRampToValueAtTime(0.0001, t + fadeSec);
      setTimeout(() => prev.stop(), fadeSec * 1000 + 100);
    }
    this.current = next;
  }

  /** Called right after unlock to start anything requested while silent. */
  resumePending(): void {
    if (this.pending) {
      const opts = this.pending;
      this.pending = null;
      this.play(opts, 0.4);
    }
  }

  stop(fadeSec = 0.8): void {
    const prev = this.current;
    const ctx = this.engine.ctx;
    this.current = null;
    this.pending = null;
    if (!prev || !ctx) return;
    const t = ctx.currentTime;
    prev.gain.gain.cancelScheduledValues(t);
    prev.gain.gain.linearRampToValueAtTime(0.0001, t + fadeSec);
    setTimeout(() => prev.stop(), fadeSec * 1000 + 100);
  }
}
