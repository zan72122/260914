import { clamp } from './math.js';

export const STEP = 1 / 60;

/**
 * Fixed-timestep simulation with an accumulator; render once per rAF.
 * sim(dt) is always called with STEP. render(alpha) gets the sub-step blend factor.
 */
export class Loop {
  constructor(sim, render) {
    this.sim = sim;
    this.render = render;
    this.acc = 0;
    this.last = 0;
    this.speed = 1;
    this.paused = false;
    this.running = false;
    this.fps = 60;
    this._fpsAcc = 0;
    this._fpsN = 0;
    this._raf = 0;
    this._tick = this._tick.bind(this);
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }
  stop() { this.running = false; cancelAnimationFrame(this._raf); }
  /** Run exactly this much simulated time, ignoring pause. */
  step(dt) {
    let remaining = dt;
    let guard = 0;
    while (remaining > 1e-6 && guard++ < 600) {
      this.sim(STEP);
      remaining -= STEP;
    }
  }
  _tick(now) {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._tick);
    let real = (now - this.last) / 1000;
    this.last = now;
    real = clamp(real, 0, 0.1);
    this._fpsAcc += real; this._fpsN++;
    if (this._fpsAcc > 0.4) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }
    if (!this.paused) {
      this.acc += real * this.speed;
      let guard = 0;
      while (this.acc >= STEP && guard++ < 8) { this.sim(STEP); this.acc -= STEP; }
      if (this.acc > STEP * 8) this.acc = 0;
    }
    this.render(this.acc / STEP);
  }
}
