// audio.js -- everything is synthesised with the Web Audio API. No files, no
// network. Sound is decoration: if AudioContext is missing, blocked, or the
// device is muted, every call here is a silent no-op and the game plays
// exactly the same.

const NOISE_SECONDS = 2;

export class Audio {
  constructor() {
    this.ok = false;
    this.ctx = null;
    this.master = null;
    this.rain = null;
    this.noiseBuf = null;
    this.indoor = false;
    this._sashOsc = null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.ok = true;
    } catch (e) {
      this.ok = false;
      this.ctx = null;
    }
  }

  /** Called from the very first pointerdown (iOS unlock). */
  resume() {
    if (!this.ok) return;
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this._ensureRain();
    } catch (e) { /* ignore */ }
  }

  suspend() { if (this.ok) { try { this.ctx.suspend(); } catch (e) { /* ignore */ } } }

  get now() { return this.ok ? this.ctx.currentTime : 0; }

  _noise() {
    if (this.noiseBuf) return this.noiseBuf;
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sr * NOISE_SECONDS, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    return buf;
  }

  // ---- rain bed -------------------------------------------------------
  _ensureRain() {
    if (!this.ok || this.rain) return;
    try {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this._noise();
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1400;
      band.Q.value = 0.6;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 9000;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(band); band.connect(lp); lp.connect(gain); gain.connect(this.master);
      src.start();
      this.rain = { src, band, lp, gain };
    } catch (e) { this.rain = null; }
  }

  /** intensity 0..1 */
  setRain(intensity) {
    if (!this.ok) return;
    this._ensureRain();
    if (!this.rain) return;
    try {
      const t = this.ctx.currentTime;
      const indoorK = this.indoor ? 0.34 : 1;
      this.rain.gain.gain.setTargetAtTime(0.26 * intensity * indoorK, t, 0.35);
      this.rain.band.frequency.setTargetAtTime(900 + 1500 * intensity, t, 0.5);
      this.rain.lp.frequency.setTargetAtTime(this.indoor ? 600 : 9000, t, 0.4);
    } catch (e) { /* ignore */ }
  }

  /** Sash closed: the rain goes distant and muffled. */
  setIndoor(on) {
    this.indoor = !!on;
    if (!this.ok || !this.rain) return;
    try {
      const t = this.ctx.currentTime;
      this.rain.lp.frequency.setTargetAtTime(on ? 600 : 9000, t, 0.5);
    } catch (e) { /* ignore */ }
  }

  // ---- one-shots ------------------------------------------------------
  _burst(opts) {
    if (!this.ok) return;
    try {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this._noise();
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = opts.type || 'bandpass';
      f.frequency.value = opts.freq;
      f.Q.value = opts.q || 1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack || 0.004));
      g.gain.exponentialRampToValueAtTime(0.0001, t + opts.len);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t);
      src.stop(t + opts.len + 0.05);
      if (opts.sweep) {
        f.frequency.setValueAtTime(opts.freq, t);
        f.frequency.exponentialRampToValueAtTime(Math.max(60, opts.sweep), t + opts.len);
      }
    } catch (e) { /* ignore */ }
  }

  _tone(opts) {
    if (!this.ok) return;
    try {
      const ctx = this.ctx;
      const t = ctx.currentTime + (opts.delay || 0);
      const o = ctx.createOscillator();
      o.type = opts.wave || 'sine';
      o.frequency.setValueAtTime(opts.f0, t);
      if (opts.f1) o.frequency.exponentialRampToValueAtTime(Math.max(30, opts.f1), t + opts.len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack || 0.006));
      g.gain.exponentialRampToValueAtTime(0.0001, t + opts.len);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + opts.len + 0.05);
    } catch (e) { /* ignore */ }
  }

  /** The single first raindrop on the glass: "potsu". */
  drop() {
    this._tone({ f0: 1250, f1: 380, len: 0.26, gain: 0.22, wave: 'sine' });
    this._burst({ freq: 2600, q: 2, len: 0.07, gain: 0.05 });
  }

  /** Clothes peg letting go: "pachin". pitch 0.6..1.6, len 0.03..0.12 */
  clip(pitch, len) {
    const p = pitch === undefined ? 1 : pitch;
    const l = len === undefined ? 0.06 : len;
    this._burst({ freq: 2400 * p, q: 3, len: l, gain: 0.30, sweep: 900 * p });
    this._tone({ f0: 1800 * p, f1: 700 * p, len: l * 1.4, gain: 0.10, wave: 'triangle' });
  }

  /** Cloth catching the air: "basa". size 0.5 (towel) .. 1.6 (sheet) */
  cloth(size) {
    const s = size === undefined ? 1 : size;
    this._burst({
      type: 'bandpass', freq: 900 / s, q: 0.7,
      len: 0.22 * s, gain: 0.16 * Math.min(1.4, s), sweep: 260 / s, attack: 0.02,
    });
  }

  /** Metal hanger on the pole: "karan". */
  hanger() {
    this._tone({ f0: 1900, f1: 1500, len: 0.18, gain: 0.10, wave: 'triangle' });
    this._tone({ f0: 2550, f1: 2300, len: 0.14, gain: 0.07, wave: 'triangle', delay: 0.07 });
    this._tone({ f0: 2100, f1: 1700, len: 0.12, gain: 0.05, wave: 'triangle', delay: 0.14 });
  }

  /** Something heavy landing: "zushi" / "doson". */
  heavy(size) {
    const s = size === undefined ? 1 : size;
    this._tone({ f0: 150 * s, f1: 48, len: 0.34, gain: 0.30, wave: 'sine' });
    this._burst({ type: 'lowpass', freq: 320, len: 0.18, gain: 0.16 });
  }

  /** Sash rail noise, tied to how fast the finger is moving. */
  sashSlide(velocity) {
    if (!this.ok) return;
    try {
      const ctx = this.ctx;
      if (!this._sashOsc) {
        const src = ctx.createBufferSource();
        src.buffer = this._noise();
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 1.2;
        const g = ctx.createGain();
        g.gain.value = 0;
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start();
        this._sashOsc = { src, f, g };
      }
      const v = Math.min(1, velocity);
      const t = ctx.currentTime;
      this._sashOsc.g.gain.setTargetAtTime(0.22 * v, t, 0.05);
      this._sashOsc.f.frequency.setTargetAtTime(420 + 900 * v, t, 0.08);
    } catch (e) { /* ignore */ }
  }

  sashStop() { this.sashSlide(0); }

  /** The latch: "kachi". */
  latch() {
    this._burst({ freq: 3200, q: 4, len: 0.035, gain: 0.34, sweep: 1200 });
    this._tone({ f0: 900, f1: 420, len: 0.07, gain: 0.12, wave: 'square' });
  }

  /** Warm little exhale when everything is safe. */
  relief() {
    this._tone({ f0: 520, f1: 780, len: 0.30, gain: 0.10, wave: 'sine' });
    this._tone({ f0: 780, f1: 1040, len: 0.34, gain: 0.07, wave: 'sine', delay: 0.16 });
  }


  // ---- the sheet (phase 2) ---------------------------------------------
  // New calls only; nothing above changed signature.

  /** The big sheet's peg: a heavy, woody "pachin" with a low body to it. */
  clipHeavy(pitch) {
    const p = pitch === undefined ? 1 : pitch;
    this._burst({ freq: 1550 * p, q: 4, len: 0.085, gain: 0.34, sweep: 420 * p });
    this._tone({ f0: 880 * p, f1: 250 * p, len: 0.15, gain: 0.16, wave: 'triangle' });
    this._tone({ f0: 205 * p, f1: 108, len: 0.13, gain: 0.11, wave: 'sine' });
  }

  /**
   * The freed half of the sheet slapping in the wind: "bata-bata".
   * A noise bed whose gain is chopped by an LFO, so it is a rhythm and not a
   * hiss. level 0..1 is how much cloth is loose, rate follows the gust.
   */
  setFlutter(level, rate) {
    if (!this.ok) return;
    try {
      const ctx = this.ctx;
      if (!this._flutter) {
        const src = ctx.createBufferSource();
        src.buffer = this._noise();
        src.loop = true;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass'; band.frequency.value = 620; band.Q.value = 0.8;
        const chop = ctx.createGain();   // LFO-modulated: the "bata bata"
        chop.gain.value = 0.45;
        const lfo = ctx.createOscillator();
        lfo.type = 'triangle';
        lfo.frequency.value = 7;
        const lfoAmp = ctx.createGain();
        lfoAmp.gain.value = 0.45;
        lfo.connect(lfoAmp); lfoAmp.connect(chop.gain);
        const lvl = ctx.createGain();
        lvl.gain.value = 0;
        src.connect(band); band.connect(chop); chop.connect(lvl);
        lvl.connect(this.master);
        src.start(); lfo.start();
        this._flutter = { src, band, chop, lfo, level: lvl };
      }
      const t = ctx.currentTime;
      const f = this._flutter;
      const lv = Math.min(1, Math.max(0, level));
      f.level.gain.setTargetAtTime(0.20 * lv, t, 0.12);
      f.lfo.frequency.setTargetAtTime(5 + 7 * Math.min(1, rate === undefined ? 0.4 : rate), t, 0.2);
      f.band.frequency.setTargetAtTime(480 + 420 * lv, t, 0.25);
    } catch (e) { /* ignore */ }
  }

  flutterStop() { this.setFlutter(0, 0); }

  /** The whole sheet letting go at once: a long, low "basa". */
  basa() {
    this._burst({
      type: 'bandpass', freq: 520, q: 0.45,
      len: 0.78, gain: 0.32, sweep: 115, attack: 0.03,
    });
    this._burst({ type: 'lowpass', freq: 850, len: 0.52, gain: 0.20, attack: 0.05 });
    this._tone({ f0: 124, f1: 52, len: 0.55, gain: 0.13, wave: 'sine' });
    this._burst({ type: 'bandpass', freq: 1500, q: 0.8, len: 0.30, gain: 0.10, sweep: 380, attack: 0.02 });
  }

  /** Arms closing around the bundle: a soft, warm "gyu". */
  gyu() {
    this._tone({ f0: 300, f1: 520, len: 0.28, gain: 0.14, wave: 'sine' });
    this._tone({ f0: 600, f1: 880, len: 0.22, gain: 0.06, wave: 'sine', delay: 0.10 });
    this._burst({ type: 'lowpass', freq: 460, len: 0.22, gain: 0.08, attack: 0.06 });
  }

  /** Small splash on the balcony floor. */
  splash() {
    this._burst({ freq: 1800, q: 1.4, len: 0.09, gain: 0.05, sweep: 700 });
  }
}
