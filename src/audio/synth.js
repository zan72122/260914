// Web Audio による効果音。音声ファイルは使わない。
let ctx = null;
let master = null;

export function audioContext() {
  return ctx;
}

export function ensureAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state !== 'running') ctx.resume();
  return ctx;
}

export function out() {
  return master;
}

function env(node, t, a, d, s, r, peak = 1) {
  const g = node.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(peak, t + a);
  g.exponentialRampToValueAtTime(Math.max(0.0001, peak * s), t + a + d);
  g.exponentialRampToValueAtTime(0.0001, t + a + d + r);
}

export function tone({ freq = 440, type = 'sine', a = 0.005, d = 0.1, s = 0.3, r = 0.2, vol = 0.3, at = 0, detune = 0, dest = null, glide = null }) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + a + d);
  o.detune.value = detune;
  const g = ctx.createGain();
  env(g, t, a, d, s, r, vol);
  o.connect(g).connect(dest || master);
  o.start(t);
  o.stop(t + a + d + r + 0.05);
}

function noise({ dur = 0.3, vol = 0.2, filter = 1200, q = 1, at = 0, type = 'lowpass', sweepTo = null }) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(filter, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, 0.01, dur * 0.5, 0.4, dur * 0.5, vol);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
}

const pent = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];
const pick = (i) => pent[((i % pent.length) + pent.length) % pent.length];

export const sfx = {
  tap() { tone({ freq: 520, type: 'triangle', d: 0.08, r: 0.12, vol: 0.25, glide: 640 }); },
  boop() {
    tone({ freq: 330, type: 'sine', d: 0.12, r: 0.2, vol: 0.3, glide: 420 });
    tone({ freq: 660, type: 'sine', d: 0.08, r: 0.15, vol: 0.12, at: 0.05 });
  },
  wobble() { tone({ freq: 220, type: 'triangle', d: 0.1, r: 0.25, vol: 0.2, glide: 180 }); },
  open() {
    noise({ dur: 0.25, vol: 0.15, filter: 800, sweepTo: 3000 });
    [0, 2, 4, 7].forEach((n, i) => tone({ freq: pick(n), type: 'triangle', d: 0.2, r: 0.5, vol: 0.2, at: i * 0.08 }));
  },
  rattle() {
    for (let i = 0; i < 4; i++) noise({ dur: 0.06, vol: 0.12, filter: 2500, q: 2, at: i * 0.09, type: 'bandpass' });
  },
  water(intensity = 1) {
    noise({ dur: 0.18, vol: 0.09 * intensity, filter: 1800, q: 1.5, type: 'bandpass', sweepTo: 900 });
    tone({ freq: 1200 + Math.random() * 800, type: 'sine', d: 0.04, r: 0.08, vol: 0.05 * intensity, glide: 600 });
  },
  sprout(i = 0) {
    [0, 2, 4].forEach((n, k) => tone({ freq: pick(n + i * 2 + 3), type: 'triangle', d: 0.15, r: 0.4, vol: 0.22, at: k * 0.07 }));
  },
  pull(amount = 0.5) { tone({ freq: 300 + amount * 400, type: 'sawtooth', d: 0.03, r: 0.06, vol: 0.06 }); },
  chime() {
    [0, 4, 7, 9].forEach((n, k) => tone({ freq: pick(n) * 2, type: 'sine', a: 0.01, d: 0.3, s: 0.2, r: 0.8, vol: 0.18, at: k * 0.05 }));
  },
  sunrise() {
    [0, 2, 4, 5, 7, 9].forEach((n, k) => tone({ freq: pick(n), type: 'triangle', a: 0.05, d: 0.4, s: 0.3, r: 1.2, vol: 0.16, at: k * 0.12 }));
    noise({ dur: 1.4, vol: 0.05, filter: 400, sweepTo: 4000 });
  },
  night() {
    [7, 5, 4, 2, 0].forEach((n, k) => tone({ freq: pick(n), type: 'sine', a: 0.05, d: 0.4, s: 0.3, r: 1.2, vol: 0.14, at: k * 0.14 }));
  },
  bloom(i = 0) {
    tone({ freq: pick(i * 2) * 2, type: 'sine', a: 0.01, d: 0.25, s: 0.2, r: 0.8, vol: 0.25 });
    tone({ freq: pick(i * 2 + 4) * 2, type: 'sine', a: 0.01, d: 0.25, s: 0.2, r: 0.9, vol: 0.18, at: 0.08 });
    noise({ dur: 0.2, vol: 0.05, filter: 3000, sweepTo: 6000, type: 'highpass' });
  },
  crack() {
    noise({ dur: 0.08, vol: 0.2, filter: 1500, q: 3, type: 'bandpass' });
    noise({ dur: 0.12, vol: 0.12, filter: 900, q: 2, type: 'bandpass', at: 0.06 });
  },
  flutter() {
    for (let i = 0; i < 6; i++) noise({ dur: 0.05, vol: 0.05, filter: 3500, q: 2, type: 'bandpass', at: i * 0.07 });
    [7, 9, 8, 9].forEach((n, k) => tone({ freq: pick(n) * 2, type: 'sine', d: 0.06, r: 0.1, vol: 0.12, at: k * 0.06 }));
  },
  fanfare() {
    [0, 2, 4, 7, 9, 12, 14].forEach((n, k) => {
      tone({ freq: pick(n), type: 'triangle', a: 0.01, d: 0.3, s: 0.3, r: 1.0, vol: 0.2, at: k * 0.1 });
      tone({ freq: pick(n) * 2, type: 'sine', a: 0.01, d: 0.3, s: 0.3, r: 1.2, vol: 0.1, at: k * 0.1 + 0.03 });
    });
  },
};
