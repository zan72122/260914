/** Phase names from DESIGN.md §2. `intervene` is concurrent with `trouble`
 *  and is therefore a flag on the machine, not a phase. */
export const PHASES = [
  'establish',
  'action',
  'foreshadow',
  'trouble',
  'resolve',
  'comic',
  'settle',
] as const;

export type PhaseName = (typeof PHASES)[number];

export class PhaseMachine {
  name: PhaseName = 'establish';
  /** seconds spent inside the current phase */
  t = 0;
  /** total seconds since the episode started */
  total = 0;
  /** concurrent with `trouble`: the player may intervene right now */
  intervening = false;

  private onEnter: ((name: PhaseName, prev: PhaseName) => void) | null = null;

  bind(fn: (name: PhaseName, prev: PhaseName) => void): void {
    this.onEnter = fn;
  }

  /** Jump to any phase. The episode's enterPhase() must make the world consistent. */
  goto(name: PhaseName): void {
    const prev = this.name;
    this.name = name;
    this.t = 0;
    this.onEnter?.(name, prev);
  }

  /** Same as goto but without re-running the episode hook (for internal restores). */
  set(name: PhaseName): void {
    this.name = name;
    this.t = 0;
  }

  update(dt: number): void {
    this.t += dt;
    this.total += dt;
  }

  is(...names: PhaseName[]): boolean {
    return names.includes(this.name);
  }

  /** phase index, handy for "have we passed X yet" checks */
  get index(): number {
    return PHASES.indexOf(this.name);
  }

  at(name: PhaseName): boolean {
    return this.index >= PHASES.indexOf(name);
  }
}
