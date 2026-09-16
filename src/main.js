// main.js -- loop, state machine, draw order, and the one global the tests use.
//
// Phases:
//   CALM -> FIRST_DROP -> SPOT -> WIND -> RAIN_RAMP -> EMPTY_LINE
//        -> SASH_CLOSE -> AFTER
// The weather advances on its own and never punishes: wet laundry is just
// darker laundry.

import { computeWorld, clamp } from './layout.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Weather } from './weather.js';
import { Character } from './character.js';
import { Basket } from './basket.js';
import { Sash } from './sash.js';
import { createItems } from './items/index.js';

const MAX_DT = 1 / 30;      // spec: never let a tab-switch fast-forward the rain
const SUB_DT = 1 / 50;      // physics substep ceiling
const MAX_DPR = 2;

const PHASE_TIME = {
  CALM: 3.0,
  FIRST_DROP: 2.2,
  SPOT: 1.6,
  WIND: 2.4,
};

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.state = 'CALM';
    this.stateT = 0;
    this.t = 0;
    this.timeScale = 1;
    this.paused = false;
    this.warm = 0;
    this.afterT = 0;
    this.touched = false;   // has a finger taken hold of anything yet?
    this.cueT = 0;

    this.audio = new Audio();
    this.world = this.measure();
    this.weather = new Weather(this.audio);
    this.basket = new Basket(this.world);
    this.character = new Character(this.world, {
      audio: this.audio,
      onStow: (item) => this.basket.add(item),
    });
    this.items = createItems(this.world, {
      audio: this.audio,
      onRelease: (item) => this.character.receive(item),
    });

    this.sash = new Sash(this.world, this.audio);
    this.dragItem = null;
    this.dragSash = false;

    this.input = new Input(canvas, () => this.world);
    this.input.on('firstTouch', () => this.audio.resume());
    this.input.on('down', (p) => this.onDown(p));
    this.input.on('move', (p) => this.onMove(p));
    this.input.on('up', (p) => this.onUp(p, false));
    this.input.on('cancel', (p) => this.onUp(p, true));

    this._onResize = () => this.relayout();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.paused = true; this.audio.suspend(); }
      else { this.paused = false; this.last = 0; this.audio.resume(); }
    });

    this.exposeDebug();
    this.last = 0;
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  // ---- layout -----------------------------------------------------------
  safeInsets() {
    const el = document.getElementById('sa');
    if (!el) return { top: 0, right: 0, bottom: 0, left: 0 };
    const cs = getComputedStyle(el);
    return {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    };
  }

  measure() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const world = computeWorld(w, h, this.safeInsets());
    world.t = this.t || 0;
    return world;
  }

  /** Resize / rotate: geometry is recomputed, game state is untouched. */
  relayout() {
    const world = this.measure();
    this.world = world;
    this.basket.layout(world);
    this.character.layout(world);
    this.sash.layout(world);
    for (let i = 0; i < this.items.length; i++) this.items[i].layout(world);
  }

  // ---- input ------------------------------------------------------------
  onDown(p) {
    if (this.state === 'AFTER' && this.afterT > 3) { this.restart(); return; }
    if (this.sash.hitHandle(p.x, p.y)) {
      this.dragSash = this.sash.onPointerDown(p);
      if (this.dragSash) {
        if (this.state === 'EMPTY_LINE') this.setState('SASH_CLOSE');
        return;
      }
    }
    // Which item is the finger on?
    //
    // Every hit pad is the full 64 css px the spec asks for, which on a phone
    // is wider than the washing itself: two or three pads always contain the
    // same point. Distance to the *cloth* decides first, so a finger that is
    // actually on one item can never be stolen by a neighbour whose pad
    // happens to reach further. Only when the point is genuinely on two
    // pieces of cloth at once -- distance zero for both -- does the centroid
    // break the tie, and then the finger takes the one it is most on.
    let best = null, bestScore = Infinity;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (!it.hitTest(p.x, p.y)) continue;
      const dx = it.cx - p.x, dy = it.cy - p.y;
      const score = it.hitDistance(p.x, p.y) * 1000 + Math.sqrt(dx * dx + dy * dy);
      if (score < bestScore) { bestScore = score; best = it; }
    }
    if (best && best.onPointerDown(p)) {
      this.dragItem = best;
      // She has seen it and taken hold of it: the pointing cue is done.
      this.touched = true;
      this.character.stopPointing();
    }
  }

  onMove(p) {
    if (this.dragSash) this.sash.onPointerMove(p);
    else if (this.dragItem) this.dragItem.onPointerMove(p);
  }

  onUp(p, cancelled) {
    if (this.dragSash) {
      if (cancelled) this.sash.onPointerCancel(); else this.sash.onPointerUp(p);
      this.dragSash = false;
    }
    if (this.dragItem) {
      if (cancelled) this.dragItem.onPointerCancel(); else this.dragItem.onPointerUp(p);
      this.dragItem = null;
    }
  }

  restart() {
    this.state = 'CALM';
    this.stateT = 0;
    this.warm = 0;
    this.afterT = 0;
    this.touched = false;
    this.cueT = 0;
    this.weather = new Weather(this.audio);
    this.basket = new Basket(this.world);
    this.character = new Character(this.world, {
      audio: this.audio,
      onStow: (item) => this.basket.add(item),
    });
    this.items = createItems(this.world, {
      audio: this.audio,
      onRelease: (item) => this.character.receive(item),
    });
    this.sash = new Sash(this.world, this.audio);
    this.audio.setIndoor(false);
    this.exposeDebug();
  }

  // ---- state machine ----------------------------------------------------
  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
    const w = this.world;
    if (s === 'FIRST_DROP') {
      this.weather.startFirstDrop();
      // One drop, on still glass, in a world that stops moving: for the next
      // second there is nothing else on the screen to look at, and she is
      // looking straight at it.
      this.weather.setStill(true);
      this.sash.paneRect(this._pr || (this._pr = {}));
      this.character.startle(this._pr.x + w.min * 0.10,
        w.opening.y + w.opening.h * 0.16);
    } else if (s === 'SPOT') {
      this.weather.setStill(false);
      const target = this.wettestItem();
      if (target) {
        target.addSpot(0.35, 0.28, 0.13);
        target.addSpot(0.62, 0.48, 0.10);
        this.character.lookAt(target.cx, target.cy);
        this.character.pointAt(target.cx, target.cy, 2.6);
        this.cueT = 4.0;
      }
      this.weather.setTargetIntensity(0.05);
    } else if (s === 'WIND') {
      this.weather.startWind();
      this.weather.setTargetIntensity(0.14);
      for (const it of this.items) it.setWeather(0, 0, true);
    } else if (s === 'RAIN_RAMP') {
      this.rainRamp = 0;
    } else if (s === 'EMPTY_LINE') {
      this.sash.enable();
      const h = this.sash.handlePoint(this._hp || (this._hp = {}));
      this.character.lookAt(h.x, h.y);
    } else if (s === 'AFTER') {
      this.character.celebrate();
      this.weather.setTargetIntensity(0.55);
    }
  }

  advance(dt) {
    this.stateT += dt;
    const s = this.state;
    if (s === 'CALM' && this.stateT >= PHASE_TIME.CALM) this.setState('FIRST_DROP');
    else if (s === 'FIRST_DROP' && this.stateT >= PHASE_TIME.FIRST_DROP) this.setState('SPOT');
    else if (s === 'SPOT' && this.stateT >= PHASE_TIME.SPOT) this.setState('WIND');
    else if (s === 'WIND' && this.stateT >= PHASE_TIME.WIND) this.setState('RAIN_RAMP');
    else if (s === 'RAIN_RAMP') {
      this.rainRamp = Math.min(1, (this.rainRamp || 0) + dt / 26);
      this.weather.setTargetIntensity(0.2 + 0.8 * this.rainRamp);
      if (this.allStowed()) this.setState('EMPTY_LINE');
    } else if (s === 'EMPTY_LINE') {
      this.weather.setTargetIntensity(0.85);
      if (this.sash.progress > 0.02) this.setState('SASH_CLOSE');
    } else if (s === 'SASH_CLOSE') {
      const h = this.sash.handlePoint(this._hp || (this._hp = {}));
      this.character.lookAt(h.x, h.y);
      if (this.sash.closed) this.setState('AFTER');
    } else if (s === 'AFTER') {
      this.afterT += dt;
    }
    // Any item finished after EMPTY_LINE cannot happen, but be safe:
    if (s !== 'EMPTY_LINE' && s !== 'SASH_CLOSE' && s !== 'AFTER' &&
      s !== 'CALM' && this.allStowed() && s === 'RAIN_RAMP') this.setState('EMPTY_LINE');
  }

  /**
   * Nothing has been touched yet, so she keeps glancing at the wettest piece
   * of washing and pointing at it -- a look and a gesture, on and off, never
   * an arrow and never a word. The moment a finger takes hold of anything,
   * onDown switches it off for good.
   */
  cue(dt) {
    if (this.touched) return;
    const s = this.state;
    if (s !== 'SPOT' && s !== 'WIND' && s !== 'RAIN_RAMP') return;
    this.cueT = (this.cueT === undefined ? 0 : this.cueT) - dt;
    if (this.cueT > 0) return;
    const target = this.wettestItem();
    if (!target) return;
    this.cueT = 4.2;
    this.character.lookAt(target.cx, target.cy);
    this.character.pointAt(target.cx, target.cy, 2.2);
  }

  /** The one that most needs rescuing: the wettest thing still on the line. */
  wettestItem() {
    let best = null;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.state !== 'HANGING') continue;
      if (!best || it.wetness > best.wetness + 1e-6) best = it;
    }
    return best;
  }

  allStowed() {
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].state !== 'IN_BASKET') return false;
    }
    return true;
  }

  // ---- loop -------------------------------------------------------------
  frame(now) {
    requestAnimationFrame(this.frame);
    if (this.paused) { this.last = now; return; }
    if (!this.last) { this.last = now; return; }
    let raw = (now - this.last) / 1000;
    this.last = now;
    if (!(raw > 0)) raw = 0;
    const dt = Math.min(raw, MAX_DT) * this.timeScale;
    const steps = Math.max(1, Math.min(6, Math.ceil(dt / SUB_DT)));
    const sub = dt / steps;
    for (let i = 0; i < steps; i++) this.update(sub);
    this.draw();
    this.updateDebug();
  }

  update(dt) {
    this.t += dt;
    this.world.t = this.t;
    this.advance(dt);
    this.cue(dt);

    const w = this.weather;
    w.update(dt, this.world);
    const started = this.state !== 'CALM' && this.state !== 'FIRST_DROP';
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      it.setWeather(w.gust, w.gustPulse, started);
      it.update(dt, w.wind, w.intensity);
    }
    this.character.update(dt, this.world);
    this.basket.update(dt);
    this.sash.update(dt, this.world);

    this._audioCd = (this._audioCd || 0) - dt;
    if (this._audioCd <= 0) { this._audioCd = 0.35; this.audio.setRain(w.intensity); }

    const wantWarm = this.sash.closed ? 1 : 0;
    this.warm += (wantWarm - this.warm) * Math.min(1, dt * 1.1);
  }

  // ---- draw -------------------------------------------------------------
  draw() {
    const ctx = this.ctx;
    const world = this.world;
    const op = world.opening;

    // indoor room
    ctx.fillStyle = '#f2e2cc';
    ctx.fillRect(0, 0, world.w, world.h);
    const ind = world.indoor;
    ctx.fillStyle = '#dcbf9c';
    if (world.portrait) ctx.fillRect(0, ind.y + ind.h * 0.44, world.w, ind.h * 0.56);
    else ctx.fillRect(ind.x, ind.y + ind.h * 0.62, ind.w, ind.h * 0.38);

    // outdoors, through the opening
    ctx.save();
    ctx.beginPath();
    ctx.rect(op.x, op.y, op.w, op.h);
    ctx.clip();
    this.weather.drawSky(ctx, world);
    this.weather.drawBalcony(ctx, world);
    this.drawPole(ctx, world);
    ctx.restore();

    // laundry still outside / falling. An item that has set `overlay` is
    // skipped here and drawn after the window frame instead (see below).
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.overlay) continue;
      if (it.state === 'HANGING' || it.state === 'RELEASING') it.draw(ctx, world);
    }

    // rain in front of the cloth, then the glass
    ctx.save();
    ctx.beginPath();
    ctx.rect(op.x, op.y, op.w, op.h);
    ctx.clip();
    this.weather.drawRain(ctx, world);
    this.sash.drawPane(ctx, world, this.weather);
    ctx.restore();

    this.sash.drawFrame(ctx, world);

    // The sheet is the one thing that gets *between the camera and the
    // window*: once enough pegs are off, the loose half is blowing through
    // the opening into the room, so it passes in front of the frame instead
    // of staying behind the glass like everything else. Any item may ask for
    // this by setting `overlay`; only the sheet does, and only once it is
    // half free or already released.
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.overlay && (it.state === 'HANGING' || it.state === 'RELEASING')) it.draw(ctx, world);
    }

    this.basket.draw(ctx, world);
    this.character.draw(ctx, world);
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].state === 'CARRYING') this.items[i].draw(ctx, world);
    }

    if (this.warm > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.warm * 0.22;
      ctx.fillStyle = '#ffb765';
      ctx.fillRect(0, 0, world.w, world.h);
      ctx.restore();
    }
  }

  drawPole(ctx, world) {
    const p = world.pole;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#8f9aa3';
    ctx.lineWidth = p.thickness;
    ctx.beginPath();
    ctx.moveTo(world.opening.x + world.opening.w * 0.005, p.y);
    ctx.lineTo(world.opening.right - world.opening.w * 0.005, p.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = Math.max(1, p.thickness * 0.3);
    ctx.beginPath();
    ctx.moveTo(world.opening.x + world.opening.w * 0.01, p.y - p.thickness * 0.24);
    ctx.lineTo(world.opening.right - world.opening.w * 0.01, p.y - p.thickness * 0.24);
    ctx.stroke();
    ctx.restore();
  }

  // ---- test hook --------------------------------------------------------
  exposeDebug() {
    const snaps = this.items.map(() => ({}));
    this._snaps = snaps;
    const g = window.__game || (window.__game = {});
    g.debug = false;
    if (g.timeScale === undefined) g.timeScale = 1;
    g.state = this.state;
    g.items = snaps;
    g.rain = 0;
    g.sash = 0;
    g.orientation = this.world.orientation;
    g.handle = { x: 0, y: 0 };
    g.inDir = this.world.inDir;
    g.restart = () => this.restart();
    // Fill it in straight away. A restart resets the game between frames, and
    // anything reading the global in that gap must not see the old numbers
    // sitting next to the new state.
    this.updateDebug();
  }

  updateDebug() {
    const g = window.__game;
    if (!g) return;
    if (typeof g.timeScale === 'number' && g.timeScale > 0) {
      this.timeScale = Math.min(8, g.timeScale);
    }
    g.state = this.state;
    g.rain = Math.round(this.weather.intensity * 1000) / 1000;
    g.sash = Math.round(this.sash.progress * 1000) / 1000;
    g.sashEnabled = this.sash.enabled;
    g.orientation = this.world.orientation;
    g.inDir = this.world.inDir;
    g.basket = this.basket.count;
    g.time = Math.round(this.t * 100) / 100;
    g.gust = Math.round(this.weather.gust * 1000) / 1000;
    g.gustBoost = this.weather.gustBoost;
    g.glassDrop = this.weather.glassDrop
      ? Math.round(this.weather.glassDrop.v * 1000) / 1000 : -1;
    g.glint = Math.round(this.sash.glint * 1000) / 1000;
    g.pointing = this.character.pointT > 0;
    const op = this.world.opening;
    if (!g.opening) g.opening = {};
    g.opening.x = Math.round(op.x * 10) / 10;
    g.opening.y = Math.round(op.y * 10) / 10;
    g.opening.w = Math.round(op.w * 10) / 10;
    g.opening.h = Math.round(op.h * 10) / 10;
    if (!g.pole) g.pole = {};
    g.pole.x0 = Math.round(this.world.pole.x0 * 10) / 10;
    g.pole.width = Math.round(this.world.pole.width * 10) / 10;
    g.pole.y = Math.round(this.world.pole.y * 10) / 10;
    for (let i = 0; i < this.items.length; i++) this.items[i].snapshot(this._snaps[i]);
    const h = this.sash.handlePoint(this._hp || (this._hp = {}));
    g.handle.x = Math.round(h.x * 10) / 10;
    g.handle.y = Math.round(h.y * 10) / 10;
    if (g.items !== this._snaps) g.items = this._snaps;
  }
}

function boot() {
  const canvas = document.getElementById('c');
  // eslint-disable-next-line no-new
  window.__gameInstance = new Game(canvas);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
