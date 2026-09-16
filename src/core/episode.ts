import type { Audio } from './audio';
import type { PointerEvt } from './input';
import type { Orientation } from './layout';
import type { PhaseMachine, PhaseName } from './phase';
import type { Rng } from './rng';

export interface EpisodeCtx {
  rng: Rng;
  audio: Audio;
  phase: PhaseMachine;
  /** leave the episode and go back to the hub */
  exit(): void;
}

export interface DevAction {
  name: string;
  run(): void;
}

export interface Episode {
  readonly id: string;
  /** developer-only label; never shown in play */
  readonly title: string;

  /** (re)start the episode from scratch */
  init(ctx: EpisodeCtx): void;
  /** recompose for this orientation and size — not a scale of the other one */
  layout(orientation: Orientation, w: number, h: number): void;
  update(dt: number): void;
  render(g: CanvasRenderingContext2D): void;
  pointer(evt: PointerEvt): void;
  /** put the world in a state consistent with `name`, so Dev Mode can start anywhere */
  enterPhase(name: PhaseName): void;

  /** dev buttons; must include a `fail:*` for every failure ending */
  readonly devActions: DevAction[];
  devState(): Record<string, unknown>;

  /** a tiny living diorama for the hub tile. t = seconds, free-running. */
  thumbnail(g: CanvasRenderingContext2D, w: number, h: number, t: number): void;
}

export interface EpisodeModule {
  episode: Episode;
}
