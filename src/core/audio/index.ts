import { AudioEngine } from './context';
import { Sfx } from './sfx';
import { Bgm } from './bgm';

export { AudioEngine } from './context';
export { Sfx, MAX_VOICES } from './sfx';
export type { SfxName } from './sfx';
export {
  Bgm,
  buildLoop,
  midiToHz,
  makeRng,
  PENTATONIC,
  BGM_GATHER,
  BGM_MARCH,
  BGM_TICKLE,
  BGM_BALLPIT,
  BGM_BUTTERFLY,
  BGM_SLIDE,
  BGM_HIDE,
  BGM_BALLOON,
  BGM_TOWER,
  BGM_SLEEP,
} from './bgm';
export type { BgmVoiceOptions } from './bgm';

/** One audio stack for the whole app. */
export class Audio {
  readonly engine = new AudioEngine();
  readonly sfx = new Sfx(this.engine);
  readonly bgm = new Bgm(this.engine);

  /** Wire to the first pointerdown. Everything works silently before this. */
  unlock(): void {
    if (this.engine.unlock()) this.bgm.resumePending();
  }

  get unlocked(): boolean {
    return this.engine.unlocked;
  }
}
