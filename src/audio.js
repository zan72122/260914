// 任意の効果音（言葉に依存しない短い音のみ）。初回ポインタで解錠。
let ac = null, ok = false;

export function unlock() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    ac = new C();
    ok = true;
    if (ac.state === 'suspended') ac.resume();
  } catch (e) { ac = null; ok = false; }
}

function tone({ f = 440, f2 = null, d = 0.18, type = 'sine', g = 0.14, delay = 0 }) {
  if (!ok || !ac) return;
  try {
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator();
    const gn = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + d);
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(g, t0 + 0.012);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(gn).connect(ac.destination);
    o.start(t0);
    o.stop(t0 + d + 0.05);
  } catch (e) { /* 無音でよい */ }
}

let last = 0;
export const sfx = {
  squirt() { const n = performance.now(); if (n - last < 90) return; last = n; tone({ f: 320 + Math.random() * 90, f2: 180, d: 0.09, type: 'triangle', g: 0.07 }); },
  rub() { const n = performance.now(); if (n - last < 120) return; last = n; tone({ f: 200 + Math.random() * 60, f2: 140, d: 0.10, type: 'sawtooth', g: 0.035 }); },
  pour() { tone({ f: 220, f2: 520, d: 0.55, type: 'sine', g: 0.10 }); tone({ f: 700, f2: 300, d: 0.5, type: 'triangle', g: 0.04, delay: 0.05 }); },
  gather() { tone({ f: 360, f2: 620, d: 0.16, type: 'sine', g: 0.07 }); },
  land() { tone({ f: 180, f2: 90, d: 0.26, type: 'sine', g: 0.16 }); tone({ f: 520, f2: 380, d: 0.20, type: 'triangle', g: 0.06, delay: 0.02 }); },
  cut() { tone({ f: 900, f2: 300, d: 0.12, type: 'triangle', g: 0.08 }); },
  paka() { tone({ f: 500, f2: 900, d: 0.18, type: 'sine', g: 0.12 }); tone({ f: 300, f2: 760, d: 0.5, type: 'sine', g: 0.10, delay: 0.3 }); },
  ding() { tone({ f: 880, f2: 1320, d: 0.3, type: 'sine', g: 0.08 }); },
  draw() { const n = performance.now(); if (n - last < 140) return; last = n; tone({ f: 420 + Math.random() * 120, f2: 300, d: 0.08, type: 'sine', g: 0.04 }); },
};
