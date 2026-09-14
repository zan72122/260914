/* ---------- tiny synthesized sound set (no assets) ---------- */
'use strict';
const SFX = (() => {
  let ac = null, master = null, unlocked = false;
  function unlock() {
    if (unlocked) return;
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
      if (ac.state === 'suspended') ac.resume();
      unlocked = true;
    } catch (e) { ac = null; }
  }
  function now() { return ac ? ac.currentTime : 0; }
  function tone(freq, dur, { type = 'sine', vol = .3, attack = .005, decay, slide, delay = 0 } = {}) {
    if (!ac) return;
    const t0 = now() + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (decay || dur));
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + (decay || dur) + .05);
  }
  function noise(dur, { vol = .2, lp = 1200, hp = 100, delay = 0, slide } = {}) {
    if (!ac) return;
    const t0 = now() + delay;
    const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(lp, t0);
    if (slide) f.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    const f2 = ac.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = hp;
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(f2); f2.connect(g); g.connect(master); src.start(t0); src.stop(t0 + dur + .05);
  }
  let lastHiss = 0;
  return {
    unlock,
    tap() { tone(700, .08, { type: 'triangle', vol: .15, slide: 500 }); },
    pop() { tone(500, .12, { type: 'sine', vol: .25, slide: 900 }); noise(.05, { vol: .1, lp: 3000 }); },
    thud() { tone(80, .5, { type: 'sine', vol: .6, slide: 40 }); noise(.25, { vol: .35, lp: 500, hp: 40 }); },
    kotón() { tone(180, .3, { type: 'triangle', vol: .35, slide: 90 }); noise(.12, { vol: .2, lp: 900 }); tone(90, .5, { vol: .4, slide: 45, delay: .02 }); },
    hiss(force) { const t = performance.now(); if (t - lastHiss < 90) return; lastHiss = t; noise(.16, { vol: .05 + .12 * Math.min(1, force), lp: 1600, hp: 300 }); },
    creak() { tone(220, .35, { type: 'sawtooth', vol: .04, slide: 180 }); },
    chime(n = 0) { const f = [880, 1108, 1318, 1760][n % 4]; tone(f, .6, { type: 'sine', vol: .18 }); tone(f * 2, .4, { type: 'sine', vol: .06 }); },
    ding() { tone(1568, .8, { type: 'sine', vol: .18 }); tone(2349, .5, { vol: .06, delay: .02 }); },
    glass() { tone(2093, .9, { vol: .15 }); tone(3136, .6, { vol: .08, delay: .01 }); tone(2637, .5, { vol: .05, delay: .05 }); },
    swish() { noise(.35, { vol: .25, lp: 4000, slide: 500, hp: 200 }); },
    fasa() { noise(.55, { vol: .3, lp: 2500, slide: 300, hp: 120 }); },
    rub(force) { const t = performance.now(); if (t - lastHiss < 60) return; lastHiss = t; noise(.09, { vol: .03 + .06 * Math.min(1, force), lp: 900, hp: 200 }); },
    click() { tone(1200, .05, { type: 'square', vol: .08, slide: 700 }); },
    clank() { tone(1400, .25, { type: 'triangle', vol: .15, slide: 900 }); tone(3000, .15, { type: 'sine', vol: .08 }); noise(.05, { vol: .1, lp: 6000 }); },
    metalHit() { tone(320, .4, { type: 'triangle', vol: .3, slide: 200 }); tone(2400, .2, { type: 'sine', vol: .08 }); noise(.08, { vol: .15, lp: 2000 }); },
    squelch() { tone(300, .18, { type: 'sine', vol: .12, slide: 120 }); noise(.12, { vol: .08, lp: 700 }); },
    pearl(i) { tone(1200 + (i % 5) * 120, .18, { type: 'sine', vol: .12, slide: 1600 }); },
    bloom() { tone(520, .5, { type: 'sine', vol: .12, slide: 1040 }); tone(780, .5, { type: 'sine', vol: .06, slide: 1560, delay: .08 }); },
    gold() { tone(3000, .12, { type: 'sine', vol: .04, slide: 4200 }); },
    sparkle() { tone(rnd(2000, 4000), .3, { type: 'sine', vol: .05 }); },
    grind(v) { const t = performance.now(); if (t - lastHiss < 120) return; lastHiss = t; noise(.14, { vol: .05 + .1 * v, lp: 700, hp: 80 }); },
    fanfare() {
      const seq = [523, 659, 784, 1046, 784, 1046, 1318];
      seq.forEach((f, i) => { tone(f, .35, { type: 'triangle', vol: .18, delay: i * .14 }); tone(f / 2, .5, { type: 'sine', vol: .1, delay: i * .14 }); });
      tone(1568, 1.6, { type: 'triangle', vol: .2, delay: 1.0 }); tone(1318, 1.6, { type: 'sine', vol: .12, delay: 1.0 }); tone(1046, 1.6, { vol: .12, delay: 1.0 });
      for (let i = 0; i < 8; i++) noise(.2, { vol: .1, lp: 5000, delay: 1.2 + i * .25 });
    },
    tick() { tone(2200, .03, { type: 'square', vol: .04 }); },
  };
})();
