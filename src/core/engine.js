/**
 * engine.js — Engine (DESIGN §5.5.2).
 *
 * Owns: the canvas + dpr transform, the RAF loop with a clamped dt, resize/orientation
 * debouncing, safe-area insets, visibility pause/resume, and the shared services
 * (audio, camera, particles, input, gestures, scenes, rng).
 *
 *   const engine = new Engine(canvas);
 *   engine.scenes.register('hearth', (engine, handoff, finish) => createHearth(...));
 *   engine.start();
 *
 * Everything is drawn in CSS PIXELS (the dpr transform is set once per frame).
 */

import { AudioEngine } from './audio.js';
import { Camera2D } from './camera.js';
import { ParticleSystem, MAX_PARTICLES } from './particles.js';
import { PointerInput } from './input.js';
import { createGestures } from './gestures.js';
import { SceneManager } from './scene.js';
import { createRNG } from './rng.js';
import { clearGradientCache } from './draw.js';
import { loadProgress, saveProgress } from './storage.js';

const MAX_DPR = 3;
const RESIZE_DEBOUNCE_MS = 100;

export class Engine {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d', { alpha: false, desynchronized: false });
    this._w = 0; this._h = 0; this._dpr = 1;
    this._insets = { top: 0, right: 0, bottom: 0, left: 0 };
    this.frameCount = 0;
    this.time = 0;
    this.running = false;
    this.paused = false;
    this.ready = false;
    this._last = 0;
    this._raf = 0;
    this._resizeTimer = 0;
    this._gestureSets = new Set();

    this.rng = createRNG(0x51ed5eed);
    this.progress = loadProgress();

    this.audio = new AudioEngine({
      muted: this.progress.muted,
      onMuteChange: (m) => { this.progress.muted = m; saveProgress(this.progress); }
    });

    this.camera = new Camera2D(this);
    this.particles = new ParticleSystem(MAX_PARTICLES, this.rng);
    this.scenes = new SceneManager(this);

    this.input = new PointerInput(canvas, {
      onFirstDown: () => this.audio.unlock(),
      onDown: (p) => this.scenes.pointerDown(p),
      onMove: (p) => this.scenes.pointerMove(p),
      onUp: (p) => this.scenes.pointerUp(p)
    });

    this._installGlobalListeners();
    this.relayout();
  }

  // ------------------------------------------------------------------ getters

  get width() { return this._w; }
  get height() { return this._h; }
  get S() { return Math.min(this._w, this._h); }
  get L() { return Math.max(this._w, this._h); }
  get isPortrait() { return this._h >= this._w; }
  get insets() { return this._insets; }
  get dpr() { return this._dpr; }

  /** Gesture recognizer factory: `const rec = engine.gestures();` */
  get gestures() {
    if (!this._gestureFactory) this._gestureFactory = (config) => createGestures(this, config);
    return this._gestureFactory;
  }

  /** Comfortable one-finger band (DESIGN §5.3). */
  thumbZone() {
    const h = this._h, w = this._w;
    const ins = this._insets;
    const topRatio = this.isPortrait ? 0.40 : 0.30;   // bottom 15%..60% / 15%..70%
    const y = h * topRatio;
    const bottom = h - Math.max(h * 0.15, ins.bottom + 8);
    return { x: ins.left + 8, y, w: w - ins.left - ins.right - 16, h: Math.max(10, bottom - y) };
  }

  /** anchor helper (DESIGN §5.3): ratios of w/h plus offsets in S units */
  anchor(ax, ay, dx = 0, dy = 0) {
    const S = this.S;
    return { x: ax * this._w + dx * S, y: ay * this._h + dy * S };
  }

  /** clamp a point so it stays inside the safe area (all hit points go through this) */
  clampSafe(x, y, r = 0) {
    const i = this._insets;
    return {
      x: Math.max(i.left + r + 8, Math.min(this._w - i.right - r - 8, x)),
      y: Math.max(i.top + r + 8, Math.min(this._h - i.bottom - r - 8, y))
    };
  }

  // ----------------------------------------------------------------- layout

  _readInsets() {
    const out = { top: 0, right: 0, bottom: 0, left: 0 };
    try {
      const probe = document.getElementById('safe-probe');
      if (probe) {
        const cs = getComputedStyle(probe);
        out.top = parseFloat(cs.paddingTop) || 0;
        out.right = parseFloat(cs.paddingRight) || 0;
        out.bottom = parseFloat(cs.paddingBottom) || 0;
        out.left = parseFloat(cs.paddingLeft) || 0;
      }
      if (!out.top && !out.bottom) {
        const rs = getComputedStyle(document.documentElement);
        const g = (n) => parseFloat(rs.getPropertyValue(n)) || 0;
        out.top = out.top || g('--safe-top');
        out.right = out.right || g('--safe-right');
        out.bottom = out.bottom || g('--safe-bottom');
        out.left = out.left || g('--safe-left');
      }
    } catch (e) { /* */ }
    return out;
  }

  relayout() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || window.innerWidth));
    const h = Math.max(1, Math.round(rect.height || window.innerHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this._w = w; this._h = h; this._dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this._insets = this._readInsets();
    clearGradientCache();
    this.camera.recompute();
    this.scenes.layout(w, h);
  }

  _scheduleRelayout() {
    clearTimeout(this._resizeTimer);
    this._resizeTimer = setTimeout(() => this.relayout(), RESIZE_DEBOUNCE_MS);
  }

  _installGlobalListeners() {
    window.addEventListener('resize', () => this._scheduleRelayout());
    window.addEventListener('orientationchange', () => this._scheduleRelayout());
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this._scheduleRelayout());
      window.visualViewport.addEventListener('scroll', () => this._scheduleRelayout());
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause(); else this.resume();
    });
  }

  // ------------------------------------------------------------------- loop

  start() {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._frame);
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    cancelAnimationFrame(this._raf);
    this.audio.suspend();
    this.input.release();
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this._last = performance.now();
    this.audio.resume();
    this._raf = requestAnimationFrame(this._frame);
  }

  _registerGestures(set) { this._gestureSets.add(set); }
  _unregisterGestures(set) { this._gestureSets.delete(set); }

  _frame = (now) => {
    if (!this.running || this.paused) return;
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    this.frameCount++;

    for (const set of this._gestureSets) set.update(dt, this.frameCount);
    this.camera.update(dt);
    this.scenes.update(dt);
    this.particles.update(dt);

    const g = this.g;
    g.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    g.clearRect(0, 0, this._w, this._h);
    this.scenes.draw(g);
    this.particles.draw(g);
    g.setTransform(1, 0, 0, 1, 0, 0);

    if (!this.ready) this.ready = true;
    this._raf = requestAnimationFrame(this._frame);
  };
}
