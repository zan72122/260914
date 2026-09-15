// Web Audio。すべて try/catch で包み、音が出せない環境でもゲームは動く。

let actx = null;
let master = null;
let drone = null;
let ready = false;

function build() {
  master = actx.createGain();
  master.gain.value = 0.0001;
  master.connect(actx.destination);

  const g = actx.createGain();
  g.gain.value = 0.0001;

  const lp = actx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  lp.Q.value = 3;
  lp.connect(g);

  const o1 = actx.createOscillator();
  o1.type = 'triangle';
  o1.frequency.value = 90;
  const o1g = actx.createGain();
  o1g.gain.value = 0.9;
  o1.connect(o1g); o1g.connect(lp);

  const o2 = actx.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = 180;
  const o2g = actx.createGain();
  o2g.gain.value = 0.28;
  o2.connect(o2g); o2g.connect(lp);

  // 軽いノイズ（砂のざらつき感）
  const len = Math.floor(actx.sampleRate * 1.0);
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const noise = actx.createBufferSource();
  noise.buffer = buf; noise.loop = true;
  const ng = actx.createGain();
  ng.gain.value = 0.05;
  const nf = actx.createBiquadFilter();
  nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.8;
  noise.connect(nf); nf.connect(ng); ng.connect(g);

  g.connect(master);
  o1.start(); o2.start(); noise.start();

  drone = { g, o1, o2, lp, ng, nf };
  master.gain.setTargetAtTime(0.9, actx.currentTime, 0.1);
  ready = true;
}

/** pointerdown から呼ぶ。AudioContext の生成と resume。 */
export function ensureAudio() {
  try {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      actx = new AC();
      build();
    }
    if (actx.state === 'suspended') {
      const p = actx.resume();
      if (p && p.catch) p.catch(() => {});
    }
  } catch (e) { /* 音が出せなくても続行 */ }
}

/**
 * 振動音の更新。
 * @param {number} level 0..1（0で無音）
 * @param {number} pitch 0..1（周波数ノブの段階）
 */
export function setDrone(level, pitch) {
  if (!ready || !actx) return;
  try {
    const t = actx.currentTime;
    const f = 62 + pitch * 86;
    drone.o1.frequency.setTargetAtTime(f, t, 0.06);
    drone.o2.frequency.setTargetAtTime(f * 2.01, t, 0.06);
    drone.lp.frequency.setTargetAtTime(300 + pitch * 700, t, 0.08);
    drone.nf.frequency.setTargetAtTime(600 + pitch * 1600, t, 0.08);
    drone.g.gain.setTargetAtTime(Math.max(0.0001, level * 0.16), t, 0.07);
  } catch (e) { /* noop */ }
}

function blip(freq, t0, dur, gain, type) {
  const o = actx.createOscillator();
  o.type = type || 'sine';
  o.frequency.value = freq;
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** 模様が完成したときの短い和音（キラッ） */
export function chime() {
  if (!ready || !actx) return;
  try {
    const t = actx.currentTime;
    const base = 784; // G5
    const notes = [1, 1.25, 1.5, 2];
    for (let i = 0; i < notes.length; i++) {
      blip(base * notes[i], t + i * 0.055, 0.85, 0.055, 'sine');
    }
  } catch (e) { /* noop */ }
}

/** 器具を操作したときの小さな手応え音 */
export function tick(kind) {
  if (!ready || !actx) return;
  try {
    const t = actx.currentTime;
    if (kind === 'plug') { blip(520, t, 0.12, 0.05, 'square'); blip(780, t + 0.05, 0.12, 0.035, 'sine'); }
    else if (kind === 'plate') { blip(320, t, 0.3, 0.05, 'triangle'); blip(480, t + 0.08, 0.25, 0.03, 'sine'); }
    else if (kind === 'knob') { blip(900, t, 0.06, 0.03, 'square'); }
    else blip(660, t, 0.08, 0.03, 'sine');
  } catch (e) { /* noop */ }
}

let lastPour = 0;
/** 砂が落ちるサラサラ音 */
export function pourSound() {
  if (!ready || !actx) return;
  try {
    const now = actx.currentTime;
    if (now - lastPour < 0.07) return;
    lastPour = now;
    const len = Math.floor(actx.sampleRate * 0.12);
    const buf = actx.createBuffer(1, len, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = actx.createBufferSource();
    src.buffer = buf;
    const f = actx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 2200;
    const g = actx.createGain();
    g.gain.value = 0.05;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(now);
  } catch (e) { /* noop */ }
}
