// Web Audio による合成効果音。音声ファイル不要（file:// の fetch 制限を回避）。
let ctx = null;
let master = null;

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch (e) { ctx = null; }
}
const ok = () => ctx && ctx.state === 'running';

function tone({ freq = 440, type = 'sine', dur = 0.2, gain = 0.3, slide = 0, attack = 0.004, delay = 0 }) {
  if (!ok()) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise({ dur = 0.2, gain = 0.3, hp = 400, lp = 6000, delay = 0 }) {
  if (!ok()) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
  const l = ctx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  s.connect(h).connect(l).connect(g).connect(master);
  s.start(t0);
}
const rnd = (a, b) => a + Math.random() * (b - a);

export const sfx = {
  grab() { tone({ freq: 520, dur: 0.08, gain: 0.12, slide: 200 }); },
  stretch(k) { tone({ freq: 180 + 300 * k, type: 'triangle', dur: 0.05, gain: 0.05 }); },
  launch(k) { tone({ freq: 220, type: 'triangle', dur: 0.18, gain: 0.25, slide: 600 * k }); noise({ dur: 0.08, gain: 0.08, hp: 2000 }); },
  cancel() { tone({ freq: 300, type: 'triangle', dur: 0.12, gain: 0.1, slide: -120 }); },
  shatter(pitch = 1) { noise({ dur: 0.22, gain: 0.35, hp: 900 * pitch, lp: 9000 }); tone({ freq: rnd(700, 1100) * pitch, type: 'triangle', dur: 0.12, gain: 0.12, slide: -300 }); },
  glass() { noise({ dur: 0.3, gain: 0.25, hp: 3000, lp: 12000 }); for (let i = 0; i < 3; i++) tone({ freq: rnd(1800, 3200), dur: 0.25, gain: 0.08, delay: i * 0.03 }); },
  ting() { tone({ freq: 1560, dur: 0.35, gain: 0.22 }); tone({ freq: 2340, dur: 0.25, gain: 0.08 }); },
  thud() { tone({ freq: 110, dur: 0.25, gain: 0.4, slide: -60 }); noise({ dur: 0.1, gain: 0.15, hp: 80, lp: 700 }); },
  pop() { tone({ freq: 500, dur: 0.16, gain: 0.3, slide: 500 }); noise({ dur: 0.12, gain: 0.1, hp: 500, lp: 3000 }); },
  boom() { tone({ freq: 70, dur: 0.6, gain: 0.6, slide: -40 }); noise({ dur: 0.5, gain: 0.5, hp: 60, lp: 2500 }); },
  vanish() { tone({ freq: rnd(1400, 2200), dur: 0.14, gain: 0.05, slide: 900 }); },
  wake() { tone({ freq: rnd(200, 260), type: 'triangle', dur: 0.1, gain: 0.05 }); },
  hop() { tone({ freq: 700, type: 'triangle', dur: 0.1, gain: 0.08, slide: 300 }); },
  swap() { tone({ freq: 400, type: 'triangle', dur: 0.12, gain: 0.12, slide: 250 }); },
  clear() {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => tone({ freq: f, dur: 0.5, gain: 0.18, delay: i * 0.09 }));
    tone({ freq: 1568, dur: 0.9, gain: 0.12, delay: 0.5 });
  },
  rewind() { tone({ freq: 900, type: 'triangle', dur: 0.9, gain: 0.14, slide: -600 }); noise({ dur: 0.9, gain: 0.05, hp: 300, lp: 2000 }); },
  descend() { tone({ freq: 260, type: 'sine', dur: 0.8, gain: 0.1, slide: 180 }); },
};
