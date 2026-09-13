// Synthesised sound effects. No external files. Unlocked on first touch (iOS).
let ctx = null;
let master = null;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function now() { return ctx ? ctx.currentTime : 0; }

function tone(freq, dur, { type = 'sine', gain = 0.3, slideTo = null, delay = 0 } = {}) {
  if (!ctx) return;
  const t0 = now() + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur, { gain = 0.2, hp = 1500 } = {}) {
  if (!ctx) return;
  const t0 = now();
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.value = gain;
  s.connect(f).connect(g).connect(master);
  s.start(t0);
}

let lastPop = 0;
export function pop() {
  // "puchi": erasing a cell. Rate limited so drags don't roar.
  const t = performance.now();
  if (t - lastPop < 40) return;
  lastPop = t;
  noise(0.05, { gain: 0.12, hp: 2500 });
  tone(700 + Math.random() * 300, 0.06, { gain: 0.08, slideTo: 300 });
}

let lastGrow = 0;
export function grow() {
  // "puku": a new cell budding.
  const t = performance.now();
  if (t - lastGrow < 60) return;
  lastGrow = t;
  tone(300 + Math.random() * 100, 0.12, { gain: 0.1, slideTo: 620 });
}

export function land() {
  tone(140, 0.18, { type: 'triangle', gain: 0.18, slideTo: 90 });
}

export function fall() {
  tone(500, 0.5, { gain: 0.15, slideTo: 120 });
}

export function goal() {
  const notes = [523, 659, 784, 1047, 1319];
  notes.forEach((f, i) => tone(f, 0.5, { gain: 0.16, delay: i * 0.11 }));
  for (let i = 0; i < 6; i++) tone(1500 + Math.random() * 1500, 0.3, { gain: 0.05, delay: 0.5 + i * 0.09 });
}

export function restart() {
  [784, 659, 523].forEach((f, i) => tone(f, 0.3, { gain: 0.12, delay: i * 0.1 }));
}
