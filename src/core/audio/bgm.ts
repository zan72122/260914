/**
 * BGM: a short generated pentatonic loop (music-box-ish triangle waves) per
 * scene, with a crossfade API for scene transitions.
 *
 * Notes are placed on the AudioContext's own clock by a look-ahead scheduler
 * (see `scheduleDue`), so the music keeps time whatever the frame rate is
 * doing. A JS timer that played each note when it happened to fire would drag
 * the tempo around every time the game got busy.
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
  /** Timbre of the little music box. */
  wave?: OscillatorType;
  /** Loop volume, 0..1. The night scene is deliberately the quietest. */
  level?: number;
}

/**
 * One short loop per scene, each in its own key, tempo and timbre, so that the
 * crossfade at a scene change is heard as "somewhere new" rather than as the
 * same tune going on. They are all major pentatonic — there is no sad or tense
 * music anywhere in this game. The night loop is the slowest and the quietest.
 */
export const BGM_GATHER: BgmVoiceOptions = { root: 67, tempo: 92, steps: 16, seed: 11 };
export const BGM_MARCH: BgmVoiceOptions = { root: 65, tempo: 108, steps: 16, seed: 17, wave: 'square', level: 0.55 };
export const BGM_TICKLE: BgmVoiceOptions = { root: 69, tempo: 124, steps: 16, seed: 23, wave: 'sine' };
export const BGM_BALLPIT: BgmVoiceOptions = { root: 62, tempo: 132, steps: 16, seed: 29 };
export const BGM_BUTTERFLY: BgmVoiceOptions = { root: 72, tempo: 84, steps: 16, seed: 37, wave: 'sine' };
export const BGM_SLIDE: BgmVoiceOptions = { root: 64, tempo: 116, steps: 16, seed: 41 };
export const BGM_HIDE: BgmVoiceOptions = { root: 60, tempo: 100, steps: 16, seed: 43, wave: 'square', level: 0.5 };
export const BGM_BALLOON: BgmVoiceOptions = { root: 74, tempo: 76, steps: 16, seed: 47, wave: 'sine' };
export const BGM_TOWER: BgmVoiceOptions = { root: 63, tempo: 128, steps: 16, seed: 53 };
export const BGM_SLEEP: BgmVoiceOptions = { root: 55, tempo: 54, steps: 12, seed: 59, wave: 'sine', level: 0.45 };

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

/**
 * How often the scheduler wakes up, in milliseconds.
 *
 * The timer is only a pump: it never decides WHEN a note sounds, it only asks
 * "has anything come due?" often enough that the answer is always in time.
 */
export const SCHEDULER_TICK_MS = 25;
/** How far ahead of the audio clock notes are handed to Web Audio, seconds. */
export const LOOK_AHEAD_SEC = 0.1;
/** The most notes one wake-up may schedule, however late it was. */
export const MAX_NOTES_PER_TICK = 32;
/** A note is queued this far ahead of the very first beat, seconds. */
export const START_DELAY_SEC = 0.06;

/** Where a loop has got to: the audio-clock time and index of the next note. */
export interface LoopCursor {
  nextTime: number;
  index: number;
}

/**
 * Look-ahead scheduling (the standard Web Audio pattern).
 *
 * `setInterval` drifts: it fires late under load, and a loop whose notes are
 * played at the moment the timer happens to fire inherits every one of those
 * delays, so the music slows down whenever the game is busy — which in this
 * game is exactly when forty children are laughing at once.
 *
 * Instead, the cursor advances by exactly `stepSec` per note on the
 * AudioContext's own clock, and each note is handed to Web Audio with its
 * precise start time up to `lookAhead` seconds early. The timer may fire late,
 * early or twice in a row; the music does not care, because nothing about the
 * schedule is derived from when the timer fired.
 *
 * Returns how many notes were scheduled.
 */
export function scheduleDue(
  cursor: LoopCursor,
  now: number,
  stepSec: number,
  emit: (time: number, index: number) => void,
  lookAhead: number = LOOK_AHEAD_SEC,
  maxNotes: number = MAX_NOTES_PER_TICK,
): number {
  if (!(stepSec > 0)) return 0;
  const behind = now - cursor.nextTime;
  if (behind > stepSec * maxNotes) {
    // The page was asleep (a backgrounded tab, a locked iPad). Skip the
    // silence in whole steps, so the loop resumes on its own grid instead of
    // dumping a minute of missed notes all at once.
    const skip = Math.floor(behind / stepSec);
    cursor.nextTime += skip * stepSec;
    cursor.index += skip;
  }
  let scheduled = 0;
  while (cursor.nextTime < now + lookAhead && scheduled < maxNotes) {
    emit(cursor.nextTime, cursor.index);
    cursor.nextTime += stepSec;
    cursor.index++;
    scheduled++;
  }
  return scheduled;
}

class BgmVoice {
  gain: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private notes: number[];
  private cursor: LoopCursor = { nextTime: 0, index: 0 };
  private stepSec: number;
  private wave: OscillatorType;
  private level: number;

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
    this.wave = opts.wave ?? 'triangle';
    this.level = opts.level ?? 1;
  }

  start(): void {
    if (this.timer) return;
    this.cursor.nextTime = this.ctx.currentTime + START_DELAY_SEC;
    this.cursor.index = 0;
    this.pump();
    this.timer = setInterval(this.pump, SCHEDULER_TICK_MS);
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

  /** The pump: ask what has come due, schedule it, go back to sleep. */
  private pump = (): void => {
    scheduleDue(this.cursor, this.ctx.currentTime, this.stepSec, this.emit);
  };

  /** Plays one note at an exact time on the audio clock. */
  private emit = (t: number, index: number): void => {
    const midi = this.notes[index % this.notes.length];
    const osc = this.ctx.createOscillator();
    osc.type = this.wave;
    osc.frequency.setValueAtTime(midiToHz(midi), t);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    // A square wave at the same gain is far louder than a triangle, so it is
    // scaled down: the BGM must always sit under the sound effects.
    const peak = 0.25 * this.level * (this.wave === 'square' ? 0.45 : 1);
    env.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + this.stepSec * 1.8);
    osc.connect(env);
    env.connect(this.gain);
    osc.start(t);
    osc.stop(t + this.stepSec * 2);
  };
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
