'use strict';
// Tiny synthesized sound set. Everything is optional: the game must be readable with sound off.
const Audio2 = {
  ctx: null, master: null, muted: false, cheerNode: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination);
      // noise buffer
      const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.startAmbient();
    } catch (e) { this.ctx = null; }
  },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.5; },
  now() { return this.ctx ? this.ctx.currentTime : 0; },
  startAmbient() {
    // faint crowd murmur
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = 0.02;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    this.ambient = g;
  },
  whistle(long) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.setValueAtTime(2400, t);
    const m = c.createOscillator(), mg = c.createGain(); m.frequency.value = 38; mg.gain.value = 300; m.connect(mg); mg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    const dur = long ? 0.9 : 0.25; g.gain.setValueAtTime(0.18, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); m.start(t); o.stop(t + dur + 0.05); m.stop(t + dur + 0.05);
  },
  cheer(strength = 1, dur = 2.5) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(700, t); f.frequency.linearRampToValueAtTime(1100, t + dur * 0.4); f.Q.value = 0.8;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 * strength, t + 0.3);
    g.gain.setValueAtTime(0.25 * strength, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + dur + 0.1);
    // a few "waaa" voices
    for (let i = 0; i < 5; i++) {
      const o = c.createOscillator(), og = c.createGain(); o.type = 'sawtooth';
      const base = rand(300, 520); o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 1.2, t + dur * 0.6);
      const lf = c.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 900;
      og.gain.setValueAtTime(0.0001, t + i * 0.05); og.gain.exponentialRampToValueAtTime(0.025 * strength, t + 0.4 + i * 0.05);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.9);
      o.connect(lf); lf.connect(og); og.connect(this.master); o.start(t); o.stop(t + dur);
    }
  },
  drum(pitch = 90, vol = 0.5) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(pitch * 2, t); o.frequency.exponentialRampToValueAtTime(pitch, t + 0.08);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.4);
  },
  pop(pitch = 600) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle';
    o.frequency.setValueAtTime(pitch, t); o.frequency.exponentialRampToValueAtTime(pitch * 0.5, t + 0.12);
    g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.16);
  },
  ding(pitch = 1200) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = pitch;
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.55);
  },
  thud() { this.drum(60, 0.6); },
  swish() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(4000, t + 0.15); f.Q.value = 1.5;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + 0.3);
  },
  steps(vol = 0.05) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + 0.1);
  }
};
