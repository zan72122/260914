/**
 * Fixed-ish timestep loop. dt is clamped so a backgrounded tab never
 * teleports the simulation, and the loop pauses entirely while hidden.
 */
export class Loop {
  timeScale = 1;
  paused = false;
  /** seconds of simulated time */
  time = 0;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private readonly step = 1 / 120;
  private stepsQueued = 0;

  constructor(
    private update: (dt: number) => void,
    private render: () => void,
  ) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stop();
      } else {
        this.start();
      }
    });
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (!this.raf) return;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Dev: advance one visible frame while paused. */
  stepOnce(n = 1): void {
    this.stepsQueued += n;
  }

  private tick = (now: number): void => {
    this.raf = requestAnimationFrame(this.tick);
    const real = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;

    let dt = real * this.timeScale;
    if (this.paused) {
      dt = this.stepsQueued > 0 ? (1 / 60) * this.timeScale : 0;
      if (this.stepsQueued > 0) this.stepsQueued--;
    }

    if (dt > 0) {
      this.acc += dt;
      // cap catch-up work
      if (this.acc > 0.25) this.acc = 0.25;
      let guard = 64;
      while (this.acc >= this.step && guard-- > 0) {
        this.update(this.step);
        this.time += this.step;
        this.acc -= this.step;
      }
    }
    this.render();
  };
}
