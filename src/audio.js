// All sounds are synthesised with Web Audio; nothing to download. Unlocked on the first touch.
let ctx = null, master = null;

export function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { /* silent play is fine */ }
}

function now() { return ctx ? ctx.currentTime : 0; }

function tone({ type = 'sine', f0 = 440, f1 = null, t = 0.2, a = 0.01, vol = 0.3, delay = 0 }) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  const t0 = now() + delay;
  o.type = type; o.frequency.setValueAtTime(f0, t0);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + t);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + t + 0.05);
}

function noise({ t = 0.1, vol = 0.2, hp = 800, lp = 6000, delay = 0 }) {
  if (!ctx) return;
  const len = Math.floor(ctx.sampleRate * t);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); g.gain.value = vol;
  const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
  const l = ctx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp;
  src.connect(h); h.connect(l); l.connect(g); g.connect(master);
  src.start(now() + delay);
}

export const sfx = {
  tap() { tone({ type: 'square', f0: 520, f1: 380, t: 0.08, vol: 0.12 }); noise({ t: 0.04, vol: 0.08, hp: 2000 }); },
  remove() { noise({ t: 0.18, vol: 0.15, hp: 1500, lp: 8000 }); tone({ type: 'triangle', f0: 300, f1: 150, t: 0.15, vol: 0.08 }); },
  connected() { tone({ type: 'sine', f0: 523, t: 0.18, vol: 0.18 }); tone({ type: 'sine', f0: 784, t: 0.3, vol: 0.18, delay: 0.14 }); },
  whistle() {
    tone({ type: 'triangle', f0: 620, t: 0.55, vol: 0.2 });
    tone({ type: 'triangle', f0: 780, t: 0.55, vol: 0.14 });
    tone({ type: 'sine', f0: 620 * 1.5, t: 0.4, vol: 0.05 });
  },
  chug(i = 0) { noise({ t: 0.07, vol: i % 2 ? 0.12 : 0.18, hp: 300, lp: 2500 }); },
  couple() { tone({ type: 'square', f0: 900, f1: 500, t: 0.07, vol: 0.12 }); noise({ t: 0.05, vol: 0.15, hp: 3000 }); tone({ type: 'sine', f0: 1200, t: 0.25, vol: 0.08, delay: 0.05 }); },
  boing() { tone({ type: 'sine', f0: 420, f1: 180, t: 0.35, vol: 0.2 }); },
  bump() { noise({ t: 0.12, vol: 0.2, hp: 200, lp: 1500 }); tone({ type: 'sine', f0: 200, f1: 120, t: 0.2, vol: 0.15 }); },
  rewind() { tone({ type: 'sine', f0: 300, f1: 900, t: 0.6, vol: 0.06 }); },
  fanfare() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => tone({ type: 'triangle', f0: f, t: i === 3 ? 0.6 : 0.2, vol: 0.18, delay: i * 0.14 }));
    tone({ type: 'triangle', f0: 620, t: 0.5, vol: 0.12, delay: 0.7 });
    tone({ type: 'triangle', f0: 780, t: 0.5, vol: 0.08, delay: 0.7 });
  },
  pop() { tone({ type: 'sine', f0: 700, f1: 1000, t: 0.08, vol: 0.12 }); },
  arrive() { tone({ type: 'sine', f0: 660, t: 0.12, vol: 0.12 }); tone({ type: 'sine', f0: 880, t: 0.25, vol: 0.12, delay: 0.1 }); },
};
