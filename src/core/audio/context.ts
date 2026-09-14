/**
 * AudioContext lifecycle. iOS Safari refuses to start audio before a user
 * gesture, so everything here must be safe to call while still locked:
 * calls are no-ops until `unlock()` runs on the first pointerdown.
 */

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxBus: GainNode | null = null;
  bgmBus: GainNode | null = null;
  unlocked = false;

  /** Call from a real user gesture (first pointerdown). Idempotent. */
  unlock(): boolean {
    if (this.unlocked) return true;
    const Ctor: typeof AudioContext | undefined =
      typeof window === 'undefined'
        ? undefined
        : window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      const sfx = ctx.createGain();
      sfx.gain.value = 1;
      sfx.connect(master);
      const bgm = ctx.createGain();
      bgm.gain.value = 0.28; // BGM always quieter than SFX.
      bgm.connect(master);
      this.ctx = ctx;
      this.master = master;
      this.sfxBus = sfx;
      this.bgmBus = bgm;
      this.unlocked = true;
      void ctx.resume();
      // A zero-length silent buffer is the classic iOS "really start" nudge.
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(master);
      src.start(0);
      return true;
    } catch {
      this.unlocked = false;
      return false;
    }
  }

  get now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }
}
