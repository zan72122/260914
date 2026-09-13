// Web Audio による合成効果音。外部ファイル不要。
let ctx = null;
let master = null;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone(freq, { type = 'sine', dur = 0.25, vol = 1, attack = 0.005, delay = 0 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur = 0.06, vol = 0.3, delay = 0) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1800;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t0);
}

// タップ: 柔らかい木琴風
export function sfxTap() {
  tone(880, { type: 'sine', dur: 0.3, vol: 0.5 });
  tone(1760, { type: 'triangle', dur: 0.12, vol: 0.15 });
}

// 行けない場所: 低くて丸い音
export function sfxNope() {
  tone(220, { type: 'sine', dur: 0.2, vol: 0.35 });
  tone(196, { type: 'sine', dur: 0.25, vol: 0.3, delay: 0.09 });
}

// 足音
export function sfxStep(i) {
  noise(0.05, 0.12);
  tone(i % 2 ? 520 : 440, { type: 'sine', dur: 0.08, vol: 0.12 });
}

// 回転のカチッ
export function sfxClick() {
  noise(0.04, 0.35);
  tone(1200, { type: 'square', dur: 0.05, vol: 0.08 });
}

// 道がつながった: 上昇アルペジオ
export function sfxConnect() {
  const notes = [523.25, 659.25, 783.99];
  notes.forEach((f, i) => tone(f, { type: 'triangle', dur: 0.5, vol: 0.4, delay: i * 0.11 }));
}

// ゴール: 明るいチャイム
export function sfxGoal() {
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  notes.forEach((f, i) => {
    tone(f, { type: 'sine', dur: 1.2, vol: 0.4, delay: i * 0.14 });
    tone(f * 2, { type: 'triangle', dur: 0.6, vol: 0.1, delay: i * 0.14 });
  });
}

// 回転中の微かな擦れ音(連続では鳴らさず、角度が一定進むごとに呼ぶ)
export function sfxTick() {
  noise(0.02, 0.08);
}
