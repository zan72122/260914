/**
 * AudioContext の雛形(R1 / R2)。実際の効果音・BGM は M4 で実装する。
 * ここでは「最初のタップで resume する」契機だけを用意しておく。
 */

let ctx: AudioContext | undefined;
let installed = false;

type Ctor = typeof AudioContext;

function ctor(): Ctor | undefined {
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
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

/** 最初のユーザー操作で呼ぶ。iOS の自動再生制限対策(R1) */
export function resumeAudio(): void {
  const c = getAudioContext();
  if (!c) return;
  void c.resume().catch(() => undefined);
  if (installed) return;
  installed = true;
  // R2: タブ復帰時にも resume を試みる
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void c.resume().catch(() => undefined);
  });
}
