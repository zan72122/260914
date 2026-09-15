// Procedural audio: everything is synthesized with WebAudio. No files, no network.

let ctx = null;
let master = null;
let musicGain = null;
let ambientGain = null;
let sfxGain = null;
let started = false;
let musicTimer = 0;
let musicStep = 0;

/** the level the master gain settles at once the first tap has unlocked audio */
const MASTER_LEVEL = 0.85;

export function isReady() { return started && ctx && ctx.state === 'running'; }

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return false; }
    master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);

    ambientGain = ctx.createGain(); ambientGain.gain.value = 0.55; ambientGain.connect(master);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.32; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  if (!started) {
    started = true;
    // tiny silent buffer kick for iOS
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
    buildAmbient();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(MASTER_LEVEL, ctx.currentTime + 2.5);
  }
  return true;
}

/**
 * iOS suspends the AudioContext whenever Safari goes to the background or the
 * screen locks, and it stays suspended on the way back. Call this on every
 * pointer event and every time the page becomes visible again; it never
 * creates a context and never re-runs the one-time unlock ramp.
 */
export function resumeIfSuspended() {
  if (!ctx) return false;
  if (ctx.state === 'suspended') {
    try { ctx.resume(); } catch (e) { return false; }
  }
  return true;
}

/**
 * Quick master fade for page hide / show. Fading out before the tab goes away
 * and back in on return means the return never lands as a burst of whatever
 * was mid-envelope when we left.
 */
export function setMuted(muted) {
  if (!ctx || !master || !started) return;
  const t = ctx.currentTime;
  const g = master.gain;
  try {
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.exponentialRampToValueAtTime(muted ? 0.0001 : MASTER_LEVEL, t + (muted ? 0.08 : 0.5));
  } catch (e) { /* a context that is going away is not worth reporting */ }
}

function noiseBuffer(seconds = 3) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

let cricketTimer = 0, owlTimer = 0;

function buildAmbient() {
  // Wind: filtered brown noise with a slowly sweeping bandpass.
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(6);
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.7;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 900;
  const g = ctx.createGain(); g.gain.value = 0.16;
  src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(ambientGain);
  src.start();

  // slow LFO on wind
  const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.07;
  const lfoG = ctx.createGain(); lfoG.gain.value = 0.09;
  lfo.connect(lfoG); lfoG.connect(g.gain); lfo.start();

  const lfo2 = ctx.createOscillator(); lfo2.type = 'sine'; lfo2.frequency.value = 0.043;
  const lfo2G = ctx.createGain(); lfo2G.gain.value = 220;
  lfo2.connect(lfo2G); lfo2G.connect(bp.frequency); lfo2.start();

  cricketTimer = 0.5; owlTimer = 7;
}

export function tick(dt) {
  if (!isReady()) return;
  cricketTimer -= dt;
  if (cricketTimer <= 0) { cricketTimer = 1.4 + Math.random() * 1.6; cricket(); }
  owlTimer -= dt;
  if (owlTimer <= 0) { owlTimer = 16 + Math.random() * 20; owl(); }
  musicTimer -= dt;
  if (musicTimer <= 0) { musicTimer = 0.42; musicBoxStep(); }
}

function cricket() {
  const t = ctx.currentTime;
  const g = ctx.createGain(); g.gain.value = 0; g.connect(ambientGain);
  const o = ctx.createOscillator(); o.type = 'square';
  o.frequency.value = 4200 + Math.random() * 500;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4600; bp.Q.value = 8;
  o.connect(bp); bp.connect(g);
  const n = 3 + ((Math.random() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const s = t + i * 0.055;
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(0.035, s + 0.006);
    g.gain.linearRampToValueAtTime(0, s + 0.03);
  }
  o.start(t); o.stop(t + n * 0.055 + 0.1);
}

function owl() {
  const t = ctx.currentTime;
  for (let i = 0; i < 2; i++) {
    const s = t + i * 0.42;
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = ctx.createGain();
    o.frequency.setValueAtTime(330, s);
    o.frequency.exponentialRampToValueAtTime(285, s + 0.3);
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.05, s + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.38);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
    o.connect(lp); lp.connect(g); g.connect(ambientGain);
    o.start(s); o.stop(s + 0.45);
  }
}

// ---- music box -------------------------------------------------------------
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const MOTIF = [0, 2, 4, 3, 2, 4, 5, 4, 2, 0, 2, 1, 0, -1, 0, 2];
function musicBoxStep() {
  const i = musicStep % MOTIF.length;
  musicStep++;
  if (i % 2 === 1 && Math.random() < 0.35) return;
  const deg = MOTIF[i];
  const semi = SCALE[((deg % SCALE.length) + SCALE.length) % SCALE.length] + (deg < 0 ? -12 : 0);
  const f = 523.25 * Math.pow(2, semi / 12);
  bell(f, 0.055, 1.3);
  if (i === 0) bell(f / 2, 0.03, 2.0);
}

function bell(freq, amp, dur, dest) {
  const t = ctx.currentTime;
  const out = dest || musicGain;
  const partials = [1, 2.01, 3.02, 4.6];
  const amps = [1, 0.4, 0.18, 0.08];
  for (let p = 0; p < partials.length; p++) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.value = freq * partials[p];
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp * amps[p], t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (1 - p * 0.15));
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }
}

function env(o, g, t, a, d, peak) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  o.start(t); o.stop(t + a + d + 0.05);
}

// ---- SFX -------------------------------------------------------------------
export function sfxDoorbell() {
  if (!isReady()) return;
  const t = ctx.currentTime;
  chime(659.25, t, 0.10);        // ding
  chime(523.25, t + 0.42, 0.10); // dong
}
function chime(f, when, amp) {
  const partials = [1, 2.0, 2.98, 5.4];
  const as = [1, 0.5, 0.25, 0.1];
  for (let p = 0; p < partials.length; p++) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.value = f * partials[p];
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(amp * as[p], when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.6);
    o.connect(g); g.connect(sfxGain);
    o.start(when); o.stop(when + 1.7);
  }
}

export function sfxDoorCreak() {
  if (!isReady()) return;
  const t = ctx.currentTime;
  const g = ctx.createGain(); g.gain.value = 0; g.connect(sfxGain);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(400, t);
  lp.frequency.linearRampToValueAtTime(1500, t + 0.9);
  lp.Q.value = 6;
  lp.connect(g);
  for (let i = 0; i < 2; i++) {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(96 + i * 3, t);
    o.frequency.linearRampToValueAtTime(150 + i * 5, t + 0.9);
    o.detune.value = i === 0 ? -14 : 12;
    o.connect(lp);
    o.start(t); o.stop(t + 1.0);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.06, t + 0.15);
  g.gain.setValueAtTime(0.06, t + 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
}

export function sfxDoorClose() {
  if (!isReady()) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.4);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  src.connect(lp); lp.connect(g); g.connect(sfxGain);
  src.start(t); src.stop(t + 0.3);
}

export function sfxCandy(i = 0) {
  if (!isReady()) return;
  const t = ctx.currentTime;
  const f = [880, 987, 1174, 1318, 1567][i % 5] * (0.98 + Math.random() * 0.05);
  const o = ctx.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.12);
  const g = ctx.createGain(); o.connect(g); g.connect(sfxGain);
  env(o, g, t, 0.004, 0.16, 0.12);
}

export function sfxSparkle() {
  if (!isReady()) return;
  const t = ctx.currentTime;
  const notes = [1046, 1318, 1568, 2093, 2637];
  notes.forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.value = f;
    const g = ctx.createGain(); o.connect(g); g.connect(sfxGain);
    const s = t + i * 0.055;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.09, s + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.5);
    o.start(s); o.stop(s + 0.55);
  });
}

export function sfxMeow() {
  if (!isReady()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(520, t);
  o.frequency.exponentialRampToValueAtTime(760, t + 0.12);
  o.frequency.exponentialRampToValueAtTime(430, t + 0.5);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 3;
  const g = ctx.createGain();
  o.connect(bp); bp.connect(g); g.connect(sfxGain);
  env(o, g, t, 0.05, 0.5, 0.07);
}

export function sfxHum(base = 220) {
  if (!isReady()) return;
  const t = ctx.currentTime;
  [0, 0.28].forEach((off, i) => {
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(base * (i ? 1.25 : 1), t + off);
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    o.connect(lp); lp.connect(g); g.connect(sfxGain);
    const s = t + off;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.07, s + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.26);
    o.start(s); o.stop(s + 0.3);
  });
}

export function sfxLaugh() {
  if (!isReady()) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 4; i++) {
    const s = t + i * 0.13;
    const o = ctx.createOscillator(); o.type = 'triangle';
    const f = 300 - i * 18;
    o.frequency.setValueAtTime(f * 1.3, s);
    o.frequency.exponentialRampToValueAtTime(f, s + 0.1);
    const g = ctx.createGain(); o.connect(g); g.connect(sfxGain);
    env(o, g, s, 0.015, 0.11, 0.06);
  }
}

export function sfxFootstep() {
  if (!isReady()) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.2);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
  bp.frequency.value = 240 + Math.random() * 120; bp.Q.value = 1.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.06, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  src.connect(bp); bp.connect(g); g.connect(sfxGain);
  src.start(t); src.stop(t + 0.15);
}

export function sfxLeaves() {
  if (!isReady()) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(1.0);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t + 0.07);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  src.connect(hp); hp.connect(g); g.connect(sfxGain);
  src.start(t); src.stop(t + 0.8);
}

export function sfxBats() {
  if (!isReady()) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 10; i++) {
    const s = t + i * 0.045 + Math.random() * 0.03;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.1);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 700; bp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, s);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.09);
    src.connect(bp); bp.connect(g); g.connect(sfxGain);
    src.start(s); src.stop(s + 0.1);
  }
  // squeaks
  for (let i = 0; i < 3; i++) {
    const s = t + 0.1 + i * 0.12;
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(2400 + i * 200, s);
    o.frequency.exponentialRampToValueAtTime(3400, s + 0.06);
    const g = ctx.createGain(); o.connect(g); g.connect(sfxGain);
    env(o, g, s, 0.006, 0.07, 0.02);
  }
}

export function sfxWhoosh() {
  if (!isReady()) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(1);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
  bp.frequency.setValueAtTime(400, t);
  bp.frequency.exponentialRampToValueAtTime(2600, t + 0.35);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.08, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  src.connect(bp); bp.connect(g); g.connect(sfxGain);
  src.start(t); src.stop(t + 0.55);
}

export function sfxPop() {
  if (!isReady()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(900, t + 0.07);
  const g = ctx.createGain(); o.connect(g); g.connect(sfxGain);
  env(o, g, t, 0.006, 0.1, 0.1);
}

export function sfxFirework() {
  if (!isReady()) return;
  const t = ctx.currentTime;
  // launch
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(200, t);
  o.frequency.exponentialRampToValueAtTime(900, t + 0.7);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.03, t + 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.72);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + 0.75);
  // burst
  const b = t + 0.75;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(1.4);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2600, b);
  lp.frequency.exponentialRampToValueAtTime(300, b + 1.0);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.0001, b);
  g2.gain.exponentialRampToValueAtTime(0.14, b + 0.02);
  g2.gain.exponentialRampToValueAtTime(0.0001, b + 1.1);
  src.connect(lp); lp.connect(g2); g2.connect(sfxGain);
  src.start(b); src.stop(b + 1.2);
  setTimeout(() => { if (isReady()) sfxSparkle(); }, 800);
}

export function sfxChimeSoft() {
  if (!isReady()) return;
  const t = ctx.currentTime;
  const ns = [1318, 1760, 2093];
  ns.forEach((f, i) => bellAt(f, t + i * 0.09, 0.035));
}
function bellAt(freq, when, amp) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(amp, when + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 1.2);
  o.connect(g); g.connect(sfxGain);
  o.start(when); o.stop(when + 1.25);
}

export function sfxTwinkleUp() {
  if (!isReady()) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 6; i++) {
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.value = 523 * Math.pow(2, i / 6);
    const g = ctx.createGain(); o.connect(g); g.connect(sfxGain);
    const s = t + i * 0.06;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.06, s + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.4);
    o.start(s); o.stop(s + 0.45);
  }
}
