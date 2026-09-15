/**
 * audio.js — AudioEngine: fully synthesised SFX (WebAudio), element motifs and
 * Japanese element names via speechSynthesis (DESIGN §4).
 *
 * ── Usage ───────────────────────────────────────────────────────────────────────
 *   engine.audio.play('ignite');                 // one-shot SFX
 *   const h = engine.audio.play('charge');       // CONTINUOUS: returns a handle
 *   h.setLevel(0.6); h.setPitch(880); h.stop();
 *   engine.audio.speakElement('lithium');        // motif + ja-JP speech, once
 *   engine.audio.setMuted(true);                 // persisted in Progress
 *
 * One-shot SFX ids:
 *   pick, drop_back, ignite, snap, power_on, sprinkle, lamp_on, launch, burst,
 *   spread, shelf_place, hop, whoosh
 * Continuous SFX ids (return a handle with setLevel/setPitch/stop):
 *   flame_loop, charge, spin, trace
 *
 * Nothing here ever blocks the visuals. Muted or unsupported audio changes nothing
 * about gameplay (DESIGN §0.3).
 */

import { ELEMENT_BY_ID, ELEMENTS } from './palette.js';

const SPEECH = {};
for (const e of ELEMENTS) SPEECH[e.id] = e.labelJa;

export class AudioEngine {
  constructor(opts = {}) {
    this.ctx = null;
    this.master = null;
    this.unlocked = false;
    this.muted = !!opts.muted;
    this.lastVoice = null;
    this.onMuteChange = opts.onMuteChange || null;
    this._voices = [];
    this._jaVoice = null;
    this._clips = Object.create(null);   // pre-recorded audio/{id}.mp3 if present
    this._handles = new Set();
    this._speechAt = 0;
    this._initSpeech();
  }

  // ---------------------------------------------------------------- lifecycle

  /** Must be called inside a user gesture (first pointerdown). Safe to call repeatedly. */
  unlock() {
    if (this.unlocked) { this._resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.unlocked = true; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      // silent buffer kick (iOS)
      const b = this.ctx.createBuffer(1, 1, 22050);
      const s = this.ctx.createBufferSource();
      s.buffer = b; s.connect(this.master); s.start(0);
      this.ctx.resume && this.ctx.resume();
      this.unlocked = true;
      this._warmSpeech();
      if (typeof window !== 'undefined' && window.FLAMETEST_AUDIO_MANIFEST) {
        this.enableRecordedClips(window.FLAMETEST_AUDIO_MANIFEST);
      }
    } catch (e) {
      this.unlocked = true; // degrade silently
    }
  }

  _resume() { try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); } catch (e) { /* */ } }
  suspend() { try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) { /* */ } }
  resume() { this._resume(); }

  setMuted(m) {
    this.muted = !!m;
    if (this.master) {
      try { this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.02); } catch (e) { /* */ }
    }
    if (this.muted) {
      try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* */ }
      for (const h of Array.from(this._handles)) h.stop();
    }
    if (this.onMuteChange) this.onMuteChange(this.muted);
  }
  toggleMuted() { this.setMuted(!this.muted); return this.muted; }

  get available() { return !!(this.ctx && this.unlocked && !this.muted); }
  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  // ------------------------------------------------------------- primitives

  _osc(type, freq, t0, dur, gain = 0.2, dest = null) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return { o, g };
  }

  _noiseBuffer(sec = 1, brown = false) {
    const c = this.ctx;
    const len = Math.max(1, Math.floor(c.sampleRate * sec));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
      else d[i] = w;
    }
    return buf;
  }

  _noise(t0, dur, { gain = 0.2, type = 'lowpass', f0 = 800, f1 = 800, q = 1, brown = false } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuffer(Math.max(0.2, dur), brown);
    const flt = c.createBiquadFilter();
    flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t0);
    flt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.03, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.05);
    return { src, g, flt };
  }

  // --------------------------------------------------------------- SFX table

  /**
   * @param {string} name
   * @param {Object} [opts]
   * @returns {null|{setLevel:Function,setPitch:Function,stop:Function}} handle for continuous sounds
   */
  play(name, opts = {}) {
    if (!this.available) {
      // continuous sounds must still return a usable no-op handle
      if (CONTINUOUS[name]) return noopHandle();
      return null;
    }
    const t0 = this.t + 0.001;
    try {
      switch (name) {
        case 'pick': this._osc('sine', 880, t0, 0.06, 0.22); return null;
        case 'drop_back': {
          const { o } = this._osc('triangle', 400, t0, 0.14, 0.18);
          o.frequency.exponentialRampToValueAtTime(250, t0 + 0.12);
          return null;
        }
        case 'ignite':
          this._noise(t0, 0.6, { gain: 0.26, f0: 200, f1: 2000, q: 0.8 });
          this._osc('sine', 90, t0, 0.5, 0.18);
          return null;
        case 'snap':
          this._osc('sine', 1200, t0, 0.04, 0.22);
          this._noise(t0, 0.03, { gain: 0.1, type: 'bandpass', f0: 2400, f1: 2400, q: 3 });
          return null;
        case 'power_on': {
          const base = opts.base || 392;
          const ratios = [1, 1.25, 1.5, 1.875, 2];
          ratios.forEach((r, i) => this._osc('sine', base * r, t0 + i * 0.07, 0.35, 0.14));
          return null;
        }
        case 'sprinkle':
          for (let i = 0; i < 5; i++) {
            this._noise(t0 + i * 0.02, 0.06, { gain: 0.07, type: 'bandpass', f0: 3000 + Math.random() * 4000, f1: 3000, q: 6 });
          }
          return null;
        case 'lamp_on': {
          this._osc('sine', 660, t0, 0.35, 0.18);
          this._noise(t0, 0.18, { gain: 0.05, type: 'lowpass', f0: 300, f1: 2400 });
          return null;
        }
        case 'launch':
          this._noise(t0, 0.3, { gain: 0.22, f0: 300, f1: 3200, q: 1.2 });
          return null;
        case 'burst':
          this._noise(t0, 0.9, { gain: 0.3, f0: 4000, f1: 300, q: 0.7 });
          this._osc('sine', 60, t0, 0.5, 0.3);
          return null;
        case 'spread': {
          const { o, g } = this._osc('sine', 110, t0, 1.6, 0.0001);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.8);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
          o.frequency.exponentialRampToValueAtTime(220, t0 + 1.4);
          return null;
        }
        case 'shelf_place':
          this._noise(t0, 0.12, { gain: 0.2, type: 'bandpass', f0: 700, f1: 500, q: 4 });
          return null;
        case 'hop':
          this._osc('triangle', 520, t0, 0.1, 0.13);
          this._osc('triangle', 780, t0 + 0.08, 0.1, 0.1);
          return null;
        case 'whoosh':
          this._noise(t0, 0.35, { gain: 0.12, f0: 900, f1: 220, q: 0.7 });
          return null;
        case 'flame_loop': return this._continuousFlame(opts);
        case 'charge': return this._continuousCharge(opts);
        case 'spin': return this._continuousSpin(opts);
        case 'trace': return this._continuousTrace(opts);
        default: return null;
      }
    } catch (e) {
      return CONTINUOUS[name] ? noopHandle() : null;
    }
  }

  /** convenience aliases */
  sfx(name, opts) { return this.play(name, opts); }

  _track(h) { this._handles.add(h); return h; }

  _continuousFlame(opts) {
    const c = this.ctx, t0 = this.t;
    const src = c.createBufferSource();
    src.buffer = this._noiseBuffer(2, true);
    src.loop = true;
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass'; flt.frequency.value = 500;
    const g = c.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime((opts.level == null ? 0.12 : opts.level), t0, 0.4);
    const lfo = c.createOscillator();
    const lfoG = c.createGain();
    lfo.frequency.value = 0.6; lfoG.gain.value = 0.05;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(t0); lfo.start(t0);
    const h = {
      setLevel: (v) => { try { g.gain.setTargetAtTime(Math.max(0, v) * 0.2, this.t, 0.1); } catch (e) { /* */ } },
      setPitch: (f) => { try { flt.frequency.setTargetAtTime(Math.max(80, f), this.t, 0.1); } catch (e) { /* */ } },
      stop: () => { try { g.gain.setTargetAtTime(0, this.t, 0.15); src.stop(this.t + 0.5); lfo.stop(this.t + 0.5); } catch (e) { /* */ } this._handles.delete(h); }
    };
    return this._track(h);
  }

  _continuousCharge(opts) {
    const c = this.ctx, t0 = this.t;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(opts.f0 || 90, t0);
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass'; flt.frequency.value = 900;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.06, t0 + 0.08);
    o.connect(flt); flt.connect(g); g.connect(this.master);
    o.start(t0);
    const h = {
      /** level 0..1 drives both pitch and loudness */
      setLevel: (v) => {
        const k = Math.max(0, Math.min(1, v));
        try {
          o.frequency.setTargetAtTime((opts.f0 || 90) + k * (opts.f1 || 520), this.t, 0.05);
          g.gain.setTargetAtTime(0.05 + k * 0.14, this.t, 0.05);
          flt.frequency.setTargetAtTime(600 + k * 2600, this.t, 0.08);
        } catch (e) { /* */ }
      },
      setPitch: (f) => { try { o.frequency.setTargetAtTime(f, this.t, 0.05); } catch (e) { /* */ } },
      stop: () => { try { g.gain.setTargetAtTime(0, this.t, 0.05); o.stop(this.t + 0.3); } catch (e) { /* */ } this._handles.delete(h); }
    };
    return this._track(h);
  }

  _continuousSpin(opts) {
    const c = this.ctx, t0 = this.t;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(opts.f0 || 220, t0);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    const lfo = c.createOscillator();
    const lfoG = c.createGain();
    lfo.type = 'sine'; lfo.frequency.value = 5; lfoG.gain.value = 18;
    lfo.connect(lfoG); lfoG.connect(o.frequency);
    o.connect(g); g.connect(this.master);
    o.start(t0); lfo.start(t0);
    const h = {
      setLevel: (v) => {
        const k = Math.max(0, Math.min(1, v));
        try {
          g.gain.setTargetAtTime(k * 0.12, this.t, 0.08);
          o.frequency.setTargetAtTime((opts.f0 || 220) + k * 420, this.t, 0.08);
          lfo.frequency.setTargetAtTime(3 + k * 9, this.t, 0.1);
        } catch (e) { /* */ }
      },
      setPitch: (f) => { try { o.frequency.setTargetAtTime(f, this.t, 0.06); } catch (e) { /* */ } },
      stop: () => { try { g.gain.setTargetAtTime(0, this.t, 0.1); o.stop(this.t + 0.4); lfo.stop(this.t + 0.4); } catch (e) { /* */ } this._handles.delete(h); }
    };
    return this._track(h);
  }

  _continuousTrace(opts) {
    const c = this.ctx, t0 = this.t;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(opts.f0 || 420, t0);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.07, t0 + 0.06);
    o.connect(g); g.connect(this.master);
    o.start(t0);
    const h = {
      /** level doubles as trace progress 0..1 -> pitch rises */
      setLevel: (v) => {
        const k = Math.max(0, Math.min(1, v));
        try {
          o.frequency.setTargetAtTime((opts.f0 || 420) * (1 + k * 1.2), this.t, 0.05);
          g.gain.setTargetAtTime(0.05 + k * 0.05, this.t, 0.06);
        } catch (e) { /* */ }
      },
      setPitch: (f) => { try { o.frequency.setTargetAtTime(f, this.t, 0.05); } catch (e) { /* */ } },
      stop: () => { try { g.gain.setTargetAtTime(0, this.t, 0.06); o.stop(this.t + 0.3); } catch (e) { /* */ } this._handles.delete(h); }
    };
    return this._track(h);
  }

  // ----------------------------------------------------------------- motifs

  /** 3-note naming motif for an element (DESIGN §4.3). */
  motif(id) {
    const def = ELEMENT_BY_ID[id];
    if (!def || !this.available) return;
    const m = def.motif;
    const t0 = this.t + 0.02;
    m.notes.forEach((f, i) => {
      const at = t0 + i * 0.16;
      this._osc(m.wave === 'square' ? 'square' : m.wave, f, at, 0.26 + m.release, m.wave === 'square' ? 0.08 : 0.14);
      if (id === 'sodium') this._osc('sawtooth', f / 2, at, 0.3, 0.035);
    });
  }

  // ------------------------------------------------------------------ speech

  _initSpeech() {
    try {
      const ss = window.speechSynthesis;
      if (!ss) return;
      const load = () => {
        try {
          this._voices = ss.getVoices() || [];
          this._jaVoice = this._voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('ja')) || null;
        } catch (e) { /* */ }
      };
      load();
      ss.addEventListener ? ss.addEventListener('voiceschanged', load) : (ss.onvoiceschanged = load);
    } catch (e) { /* */ }
  }

  _warmSpeech() {
    try {
      const ss = window.speechSynthesis;
      if (!ss || this._warmed) return;
      this._warmed = true;
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0; u.lang = 'ja-JP';
      ss.speak(u);
    } catch (e) { /* */ }
  }

  /**
   * OPTIONAL pre-recorded element names. Not probed by default (a missing file would
   * pollute the console); opt in by dropping files in `audio/` and setting, before boot:
   *   window.FLAMETEST_AUDIO_MANIFEST = ['lithium','copper','sodium','strontium','barium'];
   * or by calling engine.audio.enableRecordedClips([...]) at runtime.
   * If a clip fails to load or play, speechSynthesis takes over silently.
   * @param {string[]} ids
   */
  enableRecordedClips(ids) {
    const list = Array.isArray(ids) ? ELEMENTS.filter((e) => ids.includes(e.id)) : ELEMENTS;
    for (const e of list) {
      try {
        const a = new Audio(`./audio/${e.id}.mp3`);
        a.preload = 'auto';
        a.addEventListener('canplaythrough', () => { this._clips[e.id] = a; }, { once: true });
        a.addEventListener('error', () => { /* absent: fine */ }, { once: true });
        a.load();
      } catch (err) { /* */ }
    }
  }

  /**
   * Say the element's name ONCE, at the climax. Always plays the motif too.
   * Records window.__game.lastVoice SYNCHRONOUSLY regardless of audio availability
   * (QA depends on this — DESIGN §4.2).
   * @param {string} id
   */
  speakElement(id) {
    this.lastVoice = id;
    try {
      if (typeof window !== 'undefined') {
        if (!window.__game) window.__game = {};
        window.__game.lastVoice = id;
      }
    } catch (e) { /* */ }

    this.motif(id);

    if (this.muted) return;
    const clip = this._clips[id];
    if (clip) {
      try { clip.currentTime = 0; const pr = clip.play(); if (pr && pr.catch) pr.catch(() => this._speak(id)); return; } catch (e) { /* fall through */ }
    }
    this._speak(id);
  }

  _speak(id) {
    const text = SPEECH[id];
    if (!text) return;
    try {
      const ss = window.speechSynthesis;
      if (!ss || typeof SpeechSynthesisUtterance === 'undefined') return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.rate = 0.85;
      u.pitch = 1.15;
      u.volume = 1.0;
      if (this._jaVoice) u.voice = this._jaVoice;
      ss.cancel();
      ss.speak(u);
      this._speechAt = performance.now();
    } catch (e) { /* silent */ }
  }
}

const CONTINUOUS = { flame_loop: 1, charge: 1, spin: 1, trace: 1 };

function noopHandle() {
  return { setLevel() {}, setPitch() {}, stop() {} };
}
