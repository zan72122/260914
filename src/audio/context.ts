/** AudioContext のアンロックとマスターチェーン(コンプレッサ + 軽いリバーブ)。 */

export interface AudioEngine {
  ctx: AudioContext;
  master: GainNode;          // 楽器はここへつなぐ
  now(): number;
  resume(): Promise<void>;
}

let engine: AudioEngine | null = null;

export function getEngine(): AudioEngine | null { return engine; }

/** ユーザー操作の中で呼ぶ(iOS の自動再生制限のため)。 */
export async function unlockAudio(): Promise<AudioEngine> {
  if (engine) { await engine.resume(); return engine; }
  const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
  const ctx = new AC({ latencyHint: 'interactive' });

  const master = ctx.createGain();
  master.gain.value = 0.7;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;

  const dry = ctx.createGain(); dry.gain.value = 0.85;
  const wet = ctx.createGain(); wet.gain.value = 0.18;
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 1.4, 2.2);

  master.connect(comp);
  comp.connect(dry); dry.connect(ctx.destination);
  comp.connect(reverb); reverb.connect(wet); wet.connect(ctx.destination);

  // iOS: 無音バッファを一度鳴らして確実にアンロック
  const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf; src.connect(ctx.destination); src.start(0);

  engine = {
    ctx, master,
    now: () => ctx.currentTime,
    resume: async () => { if (ctx.state !== 'running') { try { await ctx.resume(); } catch { /* noop */ } } },
  };
  await engine.resume();
  return engine;
}

/** ノイズから作る簡単なインパルス応答 */
function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}
