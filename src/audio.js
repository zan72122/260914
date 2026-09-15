// WebAudio 合成のみ。素材ファイルなし。最初の pointerdown で unlock。

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.nodes = {};
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(ctx.destination);

    // --- ノイズ源（削る・磨く・水） ---
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.grind = this._noiseChannel(900, 1.1);
    this.polish = this._noiseChannel(2600, 3.0);
    this.water = this._noiseChannel(420, 0.7);

    // --- 良い向きに近づく持続音 ---
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 70;
    const og = ctx.createGain();
    og.gain.value = 0;
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 140;
    const og2 = ctx.createGain();
    og2.gain.value = 0;
    osc.connect(og).connect(this.master);
    osc2.connect(og2).connect(this.master);
    osc.start(); osc2.start();
    this.drone = { osc, og, osc2, og2 };

    // 機械の回転音
    const m = ctx.createOscillator();
    m.type = 'sawtooth'; m.frequency.value = 58;
    const mf = ctx.createBiquadFilter();
    mf.type = 'lowpass'; mf.frequency.value = 220;
    const mg = ctx.createGain(); mg.gain.value = 0;
    m.connect(mf).connect(mg).connect(this.master);
    m.start();
    this.motor = { osc: m, g: mg, f: mf };

    this.ready = true;
    if (ctx.state === 'suspended') ctx.resume();
  }

  _noiseChannel(freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return { src, f, g };
  }

  _set(g, v, t = 0.08) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setTargetAtTime(v, now, Math.max(0.01, t));
  }

  setDrone(align) {
    if (!this.ready) return;
    const a = Math.max(0, Math.min(1, align));
    const on = a > 0.25 ? (a - 0.25) / 0.75 : 0;
    this.drone.osc.frequency.setTargetAtTime(66 + 90 * on, this.ctx.currentTime, 0.15);
    this.drone.osc2.frequency.setTargetAtTime(132 + 180 * on, this.ctx.currentTime, 0.15);
    this._set(this.drone.og, 0.16 * on, 0.2);
    this._set(this.drone.og2, 0.05 * on * on, 0.2);
  }

  setGrind(amount) { if (!this.ready) return; this._set(this.grind.g, Math.min(0.28, amount * 0.28), 0.05); }
  setPolish(amount) { if (!this.ready) return; this._set(this.polish.g, Math.min(0.14, amount * 0.14), 0.06); }
  setWater(amount) { if (!this.ready) return; this._set(this.water.g, Math.min(0.12, amount * 0.12), 0.08); }
  setMotor(amount, pitch = 58) {
    if (!this.ready) return;
    this.motor.osc.frequency.setTargetAtTime(pitch, this.ctx.currentTime, 0.2);
    this.motor.f.frequency.setTargetAtTime(160 + pitch * 4, this.ctx.currentTime, 0.2);
    this._set(this.motor.g, 0.10 * amount, 0.2);
  }

  blip(freq = 880, dur = 0.09, type = 'sine', vol = 0.18) {
    if (!this.ready) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(this.master);
    o.start(now); o.stop(now + dur + 0.02);
  }

  click() {
    if (!this.ready) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.10);
    s.connect(f).connect(g).connect(this.master);
    s.start(now); s.stop(now + 0.12);
    this.blip(240, 0.12, 'square', 0.12);
    if (navigator.vibrate) { try { navigator.vibrate(28); } catch (e) {} }
  }

  spark() { this.blip(2400 + Math.random() * 1800, 0.035, 'square', 0.05); }
  sparkle() { this.blip(1600 + Math.random() * 1400, 0.16, 'sine', 0.09); }

  chime() {
    if (!this.ready) return;
    const base = 523.25;
    const ratios = [1, 1.25, 1.5, 2, 2.5, 3];
    ratios.forEach((r, i) => {
      setTimeout(() => this.blip(base * r, 1.5 - i * 0.12, 'sine', 0.13), i * 55);
    });
  }

  silence() {
    this.setGrind(0); this.setPolish(0); this.setWater(0);
    this.setMotor(0); this.setDrone(0);
  }
}
