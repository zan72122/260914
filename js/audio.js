// 合成効果音 (Web Audio)。音声ファイルは使わない。
(function () {
  let ctx = null;
  let master = null;
  let drone = null; // 膨らむ/縮む用の持続音

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 220;
    g.gain.value = 0;
    osc.connect(g).connect(master);
    osc.start();
    drone = { osc, g };
    return true;
  }

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, dur, opts) {
    if (!ensure() || ctx.state !== 'running') return;
    opts = opts || {};
    const t0 = ctx.currentTime + (opts.delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.glide) osc.frequency.exponentialRampToValueAtTime(opts.glide, t0 + dur);
    const v = opts.vol == null ? 0.5 : opts.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  const Audio = {
    unlock,
    // 指を置いた
    touch() { tone(520, 0.12, { vol: 0.25 }); },
    // 何かに当たった(強さ 0..1)
    bump(v) { tone(180 + 120 * v, 0.09, { type: 'triangle', vol: 0.15 + 0.25 * v, glide: 120 }); },
    // 壁に当たった (ぷに)
    wall() { tone(110, 0.14, { type: 'sine', vol: 0.3, glide: 70 }); },
    // くっついた
    stick() { tone(330, 0.15, { vol: 0.3, glide: 660 }); },
    // 合体した
    merge() { tone(392, 0.3, { vol: 0.3, glide: 523 }); tone(494, 0.3, { vol: 0.2, glide: 523 }); },
    // 分裂した
    split() { [880, 740, 620].forEach((f, i) => tone(f, 0.12, { delay: i * 0.05, vol: 0.3, glide: f * 0.7 })); },
    // 星に触れた
    star() { tone(784, 0.25, { vol: 0.3, glide: 1568 }); },
    // 輪に入った
    enter() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { delay: i * 0.07, vol: 0.35 }));
    },
    // 輪が一つ満たされた (複数の輪がある面)
    fillOne() { tone(659, 0.2, { vol: 0.3 }); tone(988, 0.25, { delay: 0.06, vol: 0.25 }); },
    // 場面転換
    swell() { tone(262, 1.2, { vol: 0.2, glide: 523 }); tone(392, 1.2, { vol: 0.12, glide: 784 }); },
    // 祝福
    celebrate() {
      [523, 587, 659, 784, 880, 1047, 1319].forEach((f, i) => tone(f, 0.5, { delay: i * 0.1, vol: 0.3 }));
    },
    // 膨らむ/縮む持続音: amount -1..1 (0で無音), scale = 現在の倍率
    drone(amount, scale) {
      if (!ensure() || ctx.state !== 'running' || !drone) return;
      const a = Math.min(1, Math.abs(amount));
      const t = ctx.currentTime;
      const target = a * 0.18;
      drone.g.gain.setTargetAtTime(target, t, 0.05);
      const f = amount >= 0 ? 160 + 200 * (scale - 1) : 420 - 300 * (1 - scale);
      drone.osc.frequency.setTargetAtTime(Math.max(60, f), t, 0.05);
    },
  };
  window.GameAudio = Audio;
})();
