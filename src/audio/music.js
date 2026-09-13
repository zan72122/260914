// 進行に応じて重なるレイヤー音楽(全てシンセ)。
import { audioContext, out, tone } from './synth.js';

const BPM = 96;
const BEAT = 60 / BPM;
const STEP = BEAT / 2; // 8分
const PATTERN_LEN = 32; // 4小節分の8分

const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
const n = (i, oct = 0) => scale[Math.max(0, Math.min(scale.length - 1, i))] * Math.pow(2, oct);

const layers = {
  pad: { on: false, gain: null, level: 0.5 },
  arp: { on: false, gain: null, level: 0.5 },
  bass: { on: false, gain: null, level: 0.6 },
  bells: { on: false, gain: null, level: 0.5 },
  trill: { on: false, gain: null, level: 0.4 },
};

let started = false;
let nextStepTime = 0;
let step = 0;
let timer = null;
let padNodes = null;
let mood = 'day';

function mkGain(ctx) {
  const g = ctx.createGain();
  g.gain.value = 0;
  g.connect(out());
  return g;
}

function startPad(ctx) {
  const g = layers.pad.gain;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 700;
  f.connect(g);
  const oscs = [];
  const chord = [n(0, -1), n(2, -1), n(4, -1), n(0, 0)];
  chord.forEach((freq, i) => {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = i === 3 ? 'sine' : 'triangle';
      o.frequency.value = freq;
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = 0.08;
      o.connect(og).connect(f);
      o.start();
      oscs.push(o);
    }
  });
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.08;
  const lg = ctx.createGain();
  lg.gain.value = 250;
  lfo.connect(lg).connect(f.frequency);
  lfo.start();
  padNodes = { oscs, f, lfo };
}

const arpPattern = [0, 4, 7, 4, 2, 5, 7, 5, 0, 4, 7, 9, 7, 5, 4, 2];
const bassPattern = [0, -1, -1, -1, 3, -1, -1, -1, 4, -1, -1, -1, 3, -1, 2, -1];
const bellPattern = [7, -1, -1, 9, -1, -1, 8, -1, 7, -1, -1, 5, -1, -1, -1, -1, 4, -1, -1, 5, -1, -1, 7, -1, 9, -1, -1, 8, -1, 7, -1, -1];
const trillPattern = [9, 10, 9, 10, 8, -1, -1, -1, -1, -1, -1, -1, 10, 9, 10, 9, 8, -1, -1, -1, -1, -1, -1, -1, 7, 8, 7, 8, -1, -1, -1, -1];

function schedule(ctx) {
  while (nextStepTime < ctx.currentTime + 0.15) {
    const s = step % PATTERN_LEN;
    const at = nextStepTime - ctx.currentTime;
    const nightShift = mood === 'night' ? -1 : 0;
    if (layers.arp.on && s % 1 === 0) {
      const idx = arpPattern[s % 16];
      tone({ freq: n(idx, 1 + nightShift), type: 'triangle', a: 0.005, d: 0.12, s: 0.1, r: 0.2, vol: 0.5, at, dest: layers.arp.gain });
    }
    if (layers.bass.on) {
      const idx = bassPattern[s % 16];
      if (idx >= 0) tone({ freq: n(idx, -2), type: 'sine', a: 0.01, d: 0.3, s: 0.4, r: 0.4, vol: 0.9, at, dest: layers.bass.gain });
    }
    if (layers.bells.on) {
      const idx = bellPattern[s];
      if (idx >= 0) {
        tone({ freq: n(idx, 1 + nightShift), type: 'sine', a: 0.005, d: 0.4, s: 0.15, r: 1.0, vol: 0.5, at, dest: layers.bells.gain });
        tone({ freq: n(idx, 2 + nightShift), type: 'sine', a: 0.005, d: 0.3, s: 0.1, r: 0.8, vol: 0.2, at, dest: layers.bells.gain });
      }
    }
    if (layers.trill.on) {
      const idx = trillPattern[s];
      if (idx >= 0) tone({ freq: n(idx, 2), type: 'sine', a: 0.005, d: 0.05, s: 0.2, r: 0.1, vol: 0.35, at, dest: layers.trill.gain });
    }
    nextStepTime += STEP;
    step++;
  }
}

export const music = {
  start() {
    const ctx = audioContext();
    if (!ctx || started) return;
    started = true;
    for (const k in layers) layers[k].gain = mkGain(ctx);
    startPad(ctx);
    nextStepTime = ctx.currentTime + 0.1;
    timer = setInterval(() => schedule(ctx), 40);
    // 既に on になっているレイヤーを反映
    for (const k in layers) if (layers[k].on) this.enable(k, true);
  },
  enable(name, on = true, ramp = 2.0) {
    const L = layers[name];
    if (!L) return;
    L.on = on;
    const ctx = audioContext();
    if (!ctx || !L.gain) return;
    const t = ctx.currentTime;
    L.gain.gain.cancelScheduledValues(t);
    L.gain.gain.setValueAtTime(L.gain.gain.value, t);
    L.gain.gain.linearRampToValueAtTime(on ? L.level : 0, t + ramp);
  },
  setMood(m) {
    mood = m;
    const ctx = audioContext();
    if (!ctx || !padNodes) return;
    const t = ctx.currentTime;
    padNodes.f.frequency.cancelScheduledValues(t);
    padNodes.f.frequency.setValueAtTime(padNodes.f.frequency.value, t);
    padNodes.f.frequency.linearRampToValueAtTime(m === 'night' ? 350 : m === 'sunset' ? 550 : 900, t + 2);
    if (m === 'night') { this.enable('arp', false, 2); this.enable('trill', false, 2); }
    else { this.enable('arp', true, 2); if (layers.bells.on) this.enable('trill', true, 3); }
  },
};
