/**
 * WebAudio: motor hum + pops. Lazily created on the first pointerdown so mobile
 * Safari is happy. Never blocks the game: every call is a no-op until started.
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.enabled = true;
    this._power = 1;
    this._load = 0;
    this._clog = 0;
    /** Room acoustics: 0 = open room, 1 = head buried under the furniture. */
    this.muffle = 0;
    this.pitchBias = 0;
    this._stream = 0;
  }

  /**
   * iOS Safari only lets a context start inside a user gesture, and suspends it
   * again whenever the page goes to the background. Call this from BOTH
   * pointerdown and touchend (Safari has historically honoured one and not the
   * other) and from visibilitychange; it is idempotent and never throws.
   */
  unlock() {
    if (!this.enabled) return;
    if (!this.ctx) { this.start(); return; }
    this.resume();
  }

  /**
   * `resume()`/`suspend()` are asynchronous, and on iOS they do not merely
   * throw when they are unhappy — they hand back a REJECTED promise, which
   * surfaces as an unhandled rejection and, in the harness, as a page error.
   * Both are swallowed: there is nothing useful to do about a context that
   * will not resume except carry on silently without sound.
   */
  resume() {
    if (!this.ctx) return;
    try {
      if (this.ctx.state === 'suspended') quiet(this.ctx.resume());
    } catch (_) {}
  }

  suspend() {
    if (!this.ctx) return;
    try {
      if (this.ctx.state === 'running') quiet(this.ctx.suspend());
    } catch (_) {}
  }

  start() {
    if (this.ctx || !this.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    try {
      const ctx = new AC();
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
      this.master = master;

      // --- motor: two detuned saws + filtered noise ---
      const motor = ctx.createGain();
      motor.gain.value = 0.0;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.8;
      motor.connect(lp); lp.connect(master);

      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 68;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 68 * 1.503;
      const g2 = ctx.createGain(); g2.gain.value = 0.22;
      o1.connect(motor); o2.connect(g2); g2.connect(motor);
      o1.start(); o2.start();

      // air noise
      const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = nb;
      const air = ctx.createBufferSource(); air.buffer = nb; air.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.7;
      const ag = ctx.createGain(); ag.gain.value = 0.0;
      air.connect(bp); bp.connect(ag); ag.connect(master); air.start();

      // --- stream: the wide filtered noise bed of a MASS draining in ("zazaa")
      const st = ctx.createBufferSource(); st.buffer = nb; st.loop = true;
      const sbp = ctx.createBiquadFilter(); sbp.type = 'bandpass';
      sbp.frequency.value = 900; sbp.Q.value = 0.35;
      const slp = ctx.createBiquadFilter(); slp.type = 'lowpass'; slp.frequency.value = 5200;
      const sg = ctx.createGain(); sg.gain.value = 0;
      st.connect(sbp); sbp.connect(slp); slp.connect(sg); sg.connect(master); st.start();

      this.o1 = o1; this.o2 = o2; this.motorGain = motor; this.airGain = ag; this.airBP = bp;
      this.motorLP = lp;
      this.streamGain = sg; this.streamBP = sbp; this.streamLP = slp;
      this.ready = true;
      this.resume();
    } catch (_) { this.enabled = false; }
  }

  /**
   * Where the vacuum is: `muffle` 0..1 closes the room down (under a sofa, in a
   * cupboard) and `pitchBias` in semitone-ish units nudges the motor note.
   * Scenes call this instead of reaching into the audio graph.
   */
  setSpace(opts) {
    if (!opts) { this.muffle = 0; this.pitchBias = 0; return; }
    if (opts.muffle !== undefined) this.muffle = clamp01(opts.muffle);
    if (opts.pitchBias !== undefined) this.pitchBias = opts.pitchBias;
    if (!this.ready) return;
    try {
      const t = this.ctx.currentTime;
      this.motorLP.frequency.setTargetAtTime(900 - 520 * this.muffle, t, 0.12);
    } catch (_) {}
  }

  /**
   * The "zazaa": a wide filtered noise bed for a MASS draining into the nozzle
   * (sand collapsing, a spill skating in, pile being combed out). 0 = silent.
   */
  setStream(intensity) {
    this._stream = clamp01(intensity);
    if (!this.ready) return;
    try {
      const t = this.ctx.currentTime;
      const i = this._stream;
      this.streamGain.gain.setTargetAtTime(0.30 * i * i * (1 - 0.45 * this.muffle), t, 0.09);
      this.streamBP.frequency.setTargetAtTime(700 + 1500 * i, t, 0.12);
      this.streamLP.frequency.setTargetAtTime(2200 + 5000 * i * (1 - 0.6 * this.muffle), t, 0.12);
    } catch (_) {}
  }

  /**
   * power: 1..2.2 suction power. load: 0..1 (debris in the flow).
   * clog: 0..1 blockage at the intake — the motor bogs down and goes boomy.
   */
  setMotor(power, load, clog = 0) {
    this._power = power; this._load = load; this._clog = clog;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const p = (power - 1) / 1.2;                    // 0..1
    const m = this.muffle;
    // load drags the motor down; a clog drags it much further; the room colours it
    let f = 62 + p * 52 - load * 9;
    f *= (1 - 0.10 * m - 0.34 * clog);
    f *= Math.pow(2, this.pitchBias / 12);
    const g = (0.16 + p * 0.2) * (1 - 0.28 * m) * (1 + 0.45 * clog);
    try {
      this.o1.frequency.setTargetAtTime(f, t, 0.08);
      this.o2.frequency.setTargetAtTime(f * 1.503, t, 0.08);
      this.motorGain.gain.setTargetAtTime(g, t, 0.1);
      this.airGain.gain.setTargetAtTime(
        Math.max(0, (0.02 + p * 0.05 + load * 0.05) * (1 - 0.78 * m - 0.6 * clog)), t, 0.08);
      this.airBP.frequency.setTargetAtTime(
        (1100 + p * 900 + load * 500) * (1 - 0.55 * m - 0.2 * clog), t, 0.1);
    } catch (_) {}
  }

  /** Short noise burst: kind 'pop' (dust bunny) | 'tick' (crumb) | 'whoosh'. */
  pop(kind = 'pop', vol = 1) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.connect(f); f.connect(g); g.connect(this.master);
    if (kind === 'tick') {
      f.type = 'bandpass'; f.Q.value = 6;
      f.frequency.setValueAtTime(2600, t);
      f.frequency.exponentialRampToValueAtTime(1500, t + 0.05);
      g.gain.setValueAtTime(0.5 * vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      src.start(t); src.stop(t + 0.08);
    } else if (kind === 'whoosh') {
      f.type = 'bandpass'; f.Q.value = 1.1;
      f.frequency.setValueAtTime(500, t);
      f.frequency.exponentialRampToValueAtTime(2600, t + 0.35);
      g.gain.setValueAtTime(0.0, t);
      g.gain.linearRampToValueAtTime(0.4 * vol, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      src.start(t); src.stop(t + 0.5);
    } else {
      f.type = 'bandpass'; f.Q.value = 3.2;
      f.frequency.setValueAtTime(900, t);
      f.frequency.exponentialRampToValueAtTime(2800, t + 0.09);
      g.gain.setValueAtTime(0.7 * vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      src.start(t); src.stop(t + 0.2);
      // little "spot" body
      const o = ctx.createOscillator(); const og = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(420, t);
      o.frequency.exponentialRampToValueAtTime(880, t + 0.08);
      og.gain.setValueAtTime(0.25 * vol, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.15);
    }
  }
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Swallow a promise that may reject; a silent game is better than a crash. */
function quiet(p) { if (p && typeof p.catch === 'function') p.catch(() => {}); }
