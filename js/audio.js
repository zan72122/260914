// audio.js — synthesised effects + ambience (docs/01.md 4.6, docs/03.md F5).
//
// Nothing here is essential to the game: every entry point is wrapped so that a
// missing AudioContext, a refused resume() or a blocked autoplay policy is a
// silent no-op. The graph is built lazily on the first pointerdown, because iOS
// only lets a context start inside a user gesture.
//
//   master
//     ├── sfx      lift / drop / snap / rain / light / bloom / seed
//     └── ambient  wind + birds, about -18 dB below the effects (docs/03.md F5)

const AMBIENT_GAIN = 0.125;          // ≈ -18 dB
const SFX_GAIN = 0.5;

function Ctor() {
  try {
    return (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null;
  } catch (_) { return null; }
}

class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.ambBus = null;
    this.noise = null;
    this.broken = false;
    this.ambient = null;
    this.birdTimer = null;
    this._bound = false;
  }

  /** True while sound is at least theoretically possible (used by the harness). */
  get available() { return !this.broken && !!Ctor(); }

  /* ------------------------------ graph ------------------------------ */

  _ctx() {
    if (this.broken) return null;
    if (this.ctx) return this.ctx;
    const C = Ctor();
    if (!C) { this.broken = true; return null; }
    try {
      const ctx = new C();
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);

      const sfxBus = ctx.createGain();
      sfxBus.gain.value = SFX_GAIN;
      sfxBus.connect(master);

      const ambBus = ctx.createGain();
      ambBus.gain.value = 0;               // faded in when the ambience starts
      ambBus.connect(master);

      this.ctx = ctx;
      this.master = master;
      this.sfxBus = sfxBus;
      this.ambBus = ambBus;
      this._bindVisibility();
      return ctx;
    } catch (_) {
      this.broken = true;
      return null;
    }
  }

  _bindVisibility() {
    if (this._bound || typeof document === 'undefined') return;
    this._bound = true;
    document.addEventListener('visibilitychange', () => {
      const ctx = this.ctx;
      if (!ctx) return;
      try {
        if (document.hidden) {
          const p = ctx.suspend();
          if (p && p.catch) p.catch(() => {});
        } else {
          this.resume();
        }
      } catch (_) {}
    });
  }

  _noiseBuffer(ctx) {
    if (this.noise) return this.noise;
    try {
      const len = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      return buf;
    } catch (_) { return null; }
  }

  /* ---------------------------- lifecycle ---------------------------- */

  resume() {
    const ctx = this._ctx();
    if (!ctx) return;
    try {
      const p = ctx.resume();
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}
  }

  /** Called from the first pointerdown (docs/03.md F5). Safe to call again. */
  unlock() {
    this.resume();
    this.startAmbience();
  }

  /* ------------------------------ voices ----------------------------- */

  _tone({ type = 'sine', from, to, t0 = 0, dur = 0.2, peak = 0.3, bus = 'sfxBus' }) {
    const ctx = this._ctx();
    if (!ctx) return;
    try {
      const now = ctx.currentTime + t0;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, now);
      if (to && to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + dur);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(peak, now + Math.min(0.03, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(g);
      g.connect(this[bus] || this.sfxBus);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    } catch (_) {}
  }

  _noiseBurst({ t0 = 0, dur = 0.3, cutoff = 900, peak = 0.2, attack = 0.05 }) {
    const ctx = this._ctx();
    if (!ctx) return null;
    try {
      const buf = this._noiseBuffer(ctx);
      if (!buf) return null;
      const now = ctx.currentTime + t0;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = cutoff;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(peak, now + attack);
      g.gain.setValueAtTime(peak, now + Math.max(attack, dur - 0.3));
      g.gain.linearRampToValueAtTime(0.0001, now + dur);
      src.connect(filt); filt.connect(g); g.connect(this.sfxBus);
      src.start(now);
      src.stop(now + dur + 0.05);
      return src;
    } catch (_) { return null; }
  }

  /* ------------------------------ effects ---------------------------- */

  /** A tile is picked up: a short, dry wooden knock. */
  lift() {
    this._tone({ type: 'triangle', from: 340, to: 190, dur: 0.09, peak: 0.24 });
    this._noiseBurst({ dur: 0.05, cutoff: 2400, peak: 0.07, attack: 0.002 });
  }

  /** A tile is put down: "koton". */
  drop() {
    this._tone({ type: 'sine', from: 180, to: 110, dur: 0.12, peak: 0.3 });
    this._tone({ type: 'triangle', from: 96, to: 70, t0: 0.06, dur: 0.16, peak: 0.2 });
  }

  /** A puzzle clicks into place: two notes upward. */
  snap() {
    this._tone({ type: 'triangle', from: 659, to: 659, dur: 0.16, peak: 0.22 });
    this._tone({ type: 'triangle', from: 988, to: 988, t0: 0.13, dur: 0.3, peak: 0.2 });
  }

  /** Rain: filtered noise for as long as the drops keep falling. */
  rain(ms = 2600) {
    this._noiseBurst({ dur: Math.max(0.4, ms / 1000), cutoff: 780, peak: 0.16, attack: 0.35 });
  }

  /** Sunlight: a soft high pad. */
  light() {
    this._tone({ type: 'sine', from: 1046, to: 1046, dur: 1.4, peak: 0.1 });
    this._tone({ type: 'sine', from: 1568, to: 1568, t0: 0.18, dur: 1.3, peak: 0.07 });
  }

  /** The flower opens: a rising arpeggio. */
  bloom() {
    const notes = [523, 659, 784, 988, 1319];
    notes.forEach((f, i) => this._tone({
      type: 'triangle', from: f, to: f, t0: i * 0.13, dur: 0.5, peak: 0.16
    }));
  }

  /** A single seed falls: a tiny blip. */
  seed() {
    this._tone({ type: 'sine', from: 560, to: 300, dur: 0.14, peak: 0.16 });
  }

  /* ----------------------------- ambience ---------------------------- */

  startAmbience() {
    const ctx = this._ctx();
    if (!ctx || this.ambient) return;
    try {
      const buf = this._noiseBuffer(ctx);
      if (!buf) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 430;
      filt.Q.value = 0.6;

      const body = ctx.createGain();
      body.gain.value = 0.42;

      // two slow LFOs: one opens the filter, one breathes the level
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.07;
      const lfoAmt = ctx.createGain();
      lfoAmt.gain.value = 240;
      lfo.connect(lfoAmt); lfoAmt.connect(filt.frequency);

      const lfo2 = ctx.createOscillator();
      lfo2.type = 'sine';
      lfo2.frequency.value = 0.11;
      const lfo2Amt = ctx.createGain();
      lfo2Amt.gain.value = 0.2;
      lfo2.connect(lfo2Amt); lfo2Amt.connect(body.gain);

      src.connect(filt); filt.connect(body); body.connect(this.ambBus);
      src.start();
      lfo.start();
      lfo2.start();

      const now = ctx.currentTime;
      this.ambBus.gain.setValueAtTime(0.0001, now);
      this.ambBus.gain.linearRampToValueAtTime(AMBIENT_GAIN, now + 3);

      this.ambient = { src, lfo, lfo2 };
      this._scheduleBird();
    } catch (_) {}
  }

  _scheduleBird() {
    if (this.birdTimer || typeof window === 'undefined') return;
    const next = 4000 + Math.random() * 7000;
    this.birdTimer = setTimeout(() => {
      this.birdTimer = null;
      this._bird();
      this._scheduleBird();
    }, next);
  }

  /** One bird: a short sine glissando, sitting inside the ambient bus. */
  _bird() {
    const ctx = this.ctx;
    if (!ctx || (typeof document !== 'undefined' && document.hidden)) return;
    try {
      const base = 1500 + Math.random() * 900;
      const now = ctx.currentTime;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const t = now + i * 0.17;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(base, t);
        osc.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.08);
        osc.frequency.exponentialRampToValueAtTime(base * 1.05, t + 0.22);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
        osc.connect(g); g.connect(this.ambBus);
        osc.start(t);
        osc.stop(t + 0.3);
      }
    } catch (_) {}
  }

  stopAmbience() {
    try {
      if (this.birdTimer) { clearTimeout(this.birdTimer); this.birdTimer = null; }
      if (this.ambient) {
        this.ambient.src.stop();
        this.ambient.lfo.stop();
        this.ambient.lfo2.stop();
        this.ambient = null;
      }
    } catch (_) { this.ambient = null; }
  }
}

export const audio = new GameAudio();
export default audio;
