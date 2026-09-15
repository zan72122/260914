/**
 * AudioContext の管理(R1 / R2)。
 * 音はすべて合成で作る(7.5)。外部音源ファイルは使わない。人の声・言葉も使わない。
 */

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let installed = false;
let started = false;

type Ctor = typeof AudioContext;

function ctor(): Ctor | undefined {
  const w = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext;
}

export function getAudioContext(): AudioContext | undefined {
  if (ctx) return ctx;
  const C = ctor();
  if (!C) return undefined;
  try {
    ctx = new C();
  } catch {
    return undefined;
  }
  return ctx;
}

/** 全体の出力。効果音も BGM もここへ繋ぐ */
export function getMaster(): GainNode | undefined {
  const c = getAudioContext();
  if (!c) return undefined;
  if (master) return master;
  try {
    master = c.createGain();
    master.gain.value = 0.9;
    master.connect(c.destination);
  } catch {
    return undefined;
  }
  return master;
}

/** 最初のユーザー操作より前かどうか。BGM の開始判定に使う(R1) */
export function audioStarted(): boolean {
  return started;
}

/** 最初のユーザー操作で呼ぶ。iOS の自動再生制限対策(R1) */
export function resumeAudio(): void {
  const c = getAudioContext();
  if (!c) return;
  started = true;
  try {
    void c.resume()?.catch?.(() => undefined);
  } catch {
    // resume できなくても遊べる
  }
  if (installed) return;
  installed = true;
  // R2: タブ復帰時にも resume を試みる
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        try {
          void c.resume()?.catch?.(() => undefined);
        } catch {
          /* noop */
        }
      }
    });
  } catch {
    /* noop */
  }
}

/** テスト用。モックの AudioContext を差し替えられるようにする */
export function resetAudio(): void {
  ctx = undefined;
  master = undefined;
  installed = false;
  started = false;
  noiseBuffer = undefined;
}

/** ホワイトノイズのバッファ(破壊音・走行音で使い回す) */
let noiseBuffer: AudioBuffer | undefined;
export function getNoiseBuffer(): AudioBuffer | undefined {
  const c = getAudioContext();
  if (!c) return undefined;
  if (noiseBuffer) return noiseBuffer;
  try {
    const rate = c.sampleRate || 44100;
    const buf = c.createBuffer(1, Math.floor(rate * 0.5), rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffer = buf;
  } catch {
    return undefined;
  }
  return noiseBuffer;
}
