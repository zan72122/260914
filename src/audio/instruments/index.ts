/** 8 楽器の合成。共通 interface: play(ctx, dest, time, freq) */
import type { InstrumentId } from '../../app/state';

export type Play = (ctx: BaseAudioContext, dest: AudioNode, t: number, freq: number) => void;

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: BaseAudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function env(ctx: BaseAudioContext, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function osc(ctx: BaseAudioContext, type: OscillatorType, freq: number, t: number, dur: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

/** たいこ: サイン波のピッチスイープ */
const drum: Play = (ctx, dest, t) => {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
  const g = env(ctx, t, 0.9, 0.003, 0.28);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + 0.4);
};

/** かすたねっと: バンドパスしたノイズの短いバースト */
const clap: Play = (ctx, dest, t) => {
  const s = ctx.createBufferSource(); s.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.2;
  const g = env(ctx, t, 0.55, 0.002, 0.11);
  s.connect(bp).connect(g).connect(dest);
  s.start(t); s.stop(t + 0.2);
};

/** しゃかしゃか: ハイパスしたノイズ */
const shaker: Play = (ctx, dest, t) => {
  const s = ctx.createBufferSource(); s.buffer = noise(ctx);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6500;
  const g = env(ctx, t, 0.35, 0.01, 0.09);
  s.connect(hp).connect(g).connect(dest);
  s.start(t); s.stop(t + 0.2);
};

/** かね: FM 合成(倍音比 3.5)+ 長め減衰 */
const bell: Play = (ctx, dest, t, freq) => {
  const car = osc(ctx, 'sine', freq, t, 1.4);
  const mod = osc(ctx, 'sine', freq * 3.5, t, 1.4);
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(freq * 1.6, t);
  mg.gain.exponentialRampToValueAtTime(freq * 0.05, t + 0.9);
  mod.connect(mg).connect(car.frequency);
  const g = env(ctx, t, 0.45, 0.003, 1.3);
  car.connect(g).connect(dest);
};

/** とり: サイン波 + ビブラート + 短い上向きグリッサンド */
const bird: Play = (ctx, dest, t, freq) => {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq * 0.8, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
  const vib = osc(ctx, 'sine', 9, t, 0.4);
  const vg = ctx.createGain(); vg.gain.value = freq * 0.02;
  vib.connect(vg).connect(o.frequency);
  const g = env(ctx, t, 0.4, 0.01, 0.3);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + 0.45);
};

/** もっきん: サイン波 + 4 倍音、短い減衰 */
const marimba: Play = (ctx, dest, t, freq) => {
  const g = env(ctx, t, 0.55, 0.002, 0.45);
  const o1 = osc(ctx, 'sine', freq, t, 0.5);
  const o2 = osc(ctx, 'sine', freq * 4, t, 0.5);
  const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.25, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o1.connect(g); o2.connect(g2).connect(g);
  g.connect(dest);
};

/** ふえ: 三角波 + ローパス + 緩いアタック */
const flute: Play = (ctx, dest, t, freq) => {
  const o = osc(ctx, 'triangle', freq, t, 0.6);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(freq * 3, 6000);
  const vib = osc(ctx, 'sine', 5.5, t, 0.6);
  const vg = ctx.createGain(); vg.gain.value = freq * 0.008;
  vib.connect(vg).connect(o.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.4, t + 0.06);
  g.gain.setValueAtTime(0.4, t + 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  o.connect(lp).connect(g).connect(dest);
};

/** かえる(ベース): 矩形波 + ローパス */
const frog: Play = (ctx, dest, t, freq) => {
  const o = osc(ctx, 'square', freq, t, 0.4);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(freq * 6, t);
  lp.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.25);
  const g = env(ctx, t, 0.4, 0.01, 0.32);
  o.connect(lp).connect(g).connect(dest);
};

export const INSTRUMENTS: Record<InstrumentId, Play> = {
  drum, clap, shaker, bell, bird, marimba, flute, frog,
};

/** 汽笛(演出用) */
export function whistle(ctx: BaseAudioContext, dest: AudioNode, t: number): void {
  for (const f of [660, 830]) {
    const o = osc(ctx, 'triangle', f, t, 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.05);
    g.gain.setValueAtTime(0.18, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g).connect(dest);
  }
}

/** ぽん、という小さな効果音(着地・扉など) */
export function pop(ctx: BaseAudioContext, dest: AudioNode, t: number, freq = 500): void {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.08);
  const g = env(ctx, t, 0.25, 0.002, 0.1);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + 0.15);
}
