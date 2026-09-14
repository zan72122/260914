// Web Audio による効果音の合成。音声ファイルは使わない。
let ctx = null;
let noiseBuf = null;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function now() {
  return ctx ? ctx.currentTime : 0;
}

function noise(dur, filterType, freq, q, gain, t0 = now(), freqEnd = null) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.setValueAtTime(freq, t0);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

function tone(freq, dur, type, gain, t0 = now(), freqEnd = null) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

// 紙をつまんで持ち上げる: さらっという擦れ
export function rustle(intensity = 1) {
  noise(0.18, 'bandpass', 2500 + Math.random() * 1500, 0.8, 0.12 * intensity);
}
// パタンと折れる
export function snap() {
  noise(0.06, 'highpass', 3000, 1, 0.25);
  tone(160, 0.12, 'sine', 0.25, now(), 60);
}
// 折り戻し
export function unsnap() {
  noise(0.12, 'bandpass', 1800, 0.8, 0.15);
  tone(120, 0.1, 'sine', 0.15, now(), 80);
}
// 足音(左右交互)
export function step(i) {
  noise(0.07, 'lowpass', i % 2 ? 900 : 700, 1, 0.14);
}
// ハナにぶつかって跳ね返る
export function boing() {
  tone(220, 0.35, 'triangle', 0.22, now(), 110);
  tone(440, 0.2, 'sine', 0.08, now() + 0.05, 330);
}
// ゴール
export function chime() {
  const t = now();
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, 'sine', 0.18, t + i * 0.12));
  [523, 659, 784, 1047].forEach((f, i) => tone(f * 2, 0.3, 'triangle', 0.04, t + i * 0.12));
}
// 抱きつき
export function hug() {
  tone(330, 0.4, 'sine', 0.12, now(), 392);
}
// ページがめくれて飛んでいく
export function whoosh() {
  noise(0.6, 'bandpass', 600, 0.7, 0.2, now(), 2400);
}
// 風でめくれるヒント
export function breeze() {
  noise(0.5, 'bandpass', 1200, 0.5, 0.06, now(), 2200);
}
// 途中で離して戻る
export function flutter() {
  noise(0.15, 'bandpass', 2000, 0.8, 0.08);
}
export function pop() {
  tone(880, 0.08, 'sine', 0.1, now(), 1320);
}
