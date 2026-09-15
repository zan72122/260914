import { Loop, STEP } from './core/loop.js';
import { RNG } from './core/rng.js';
import { Input } from './core/input.js';
import { Camera } from './core/camera.js';
import { Audio } from './core/audio.js';
import { Vacuum } from './vacuum/vacuum.js';
import { State } from './debris/base.js';
import { makeScene, sceneIds, findScene } from './scenes/index.js';
import { clamp, lerp, smoothstep } from './core/math.js';

const params = new URLSearchParams(location.search);
const P = {
  scene: params.get('scene') || 'intro',
  seed: parseInt(params.get('seed') || '1337', 10) || 1337,
  dev: params.get('dev') === '1',
  speed: parseFloat(params.get('speed') || '1') || 1,
  pose: params.get('pose') || null,
  mute: params.get('mute') === '1',
};

class Game {
  constructor() {
    this.canvas = document.getElementById('c');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.rng = new RNG(P.seed);
    this.input = new Input();
    this.camera = new Camera();
    this.audio = new Audio();
    if (P.mute) this.audio.enabled = false;
    this.vacuum = new Vacuum(this.rng);
    this.vacuum.audio = this.audio;
    this.dpr = 1;
    this.w = 1; this.h = 1;
    this.pose = 'portrait';
    this.time = 0;
    this.transition = null;
    this.completeHold = 0;
    this.scene = null;
    this.dev = P.dev;
    this.worldCtx = {
      vacuum: this.vacuum, camera: this.camera, input: this.input,
      rng: this.rng, audio: this.audio,
      world: { rng: this.rng, audio: this.audio, onCaptured: (d) => this._onCaptured(d) },
    };

    this.input.onFirstGesture(() => this.audio.start());
    this.input.attach(this.canvas);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));

    this.loop = new Loop((dt) => this.sim(dt), (a) => this.render(a));
    this.loop.speed = P.speed;

    this.resize(true);
    this.setScene(findScene(P.scene) ? P.scene : 'intro');
    this.loop.start();
  }

  // -------------------------------------------------------------- lifecycle

  resize(initial) {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.setViewport(w, h);
    this.input.setViewport(w, h);
    const pose = w >= h ? 'landscape' : 'portrait';
    const poseChanged = pose !== this.pose;
    this.pose = pose;
    this.vacuum.setPose(pose);
    if (!initial && this.scene) this.relayout(poseChanged);
  }

  relayout() {
    const prev = this.scene;
    let cleared = 0;
    for (let i = 0; i < prev.debris.length; i++) {
      const d = prev.debris[i];
      if (!d.decor && d.state === State.DONE) cleared++;
    }
    this.rng.reset(P.seed);
    prev.layout(this.pose, this.w, this.h);
    // keep the player's progress across an orientation change
    for (let i = 0; i < prev.debris.length && cleared > 0; i++) {
      const d = prev.debris[i];
      if (d.decor || d.dormant) continue;
      d.state = State.DONE; cleared--;
    }
    this._placeStart(prev, false);
  }

  setScene(id, keepCup) {
    this.rng.reset(P.seed);
    const sc = makeScene(id, this.rng);
    sc.layout(this.pose, this.w, this.h);
    this.scene = sc;
    this.worldCtx.world.scene = sc;
    this.worldCtx.world.onCaptured = (d) => this._onCaptured(d);
    if (!keepCup) this.vacuum.clearCup();
    this.completeHold = 0;
    this._placeStart(sc, true);
    return sc;
  }

  _placeStart(sc, resetVacuum) {
    const sp = sc.startPointer;
    if (!this.input.everDown) this.input.pointer(sp.x, sp.y, false);
    this.camera.set(sc.rest.x, sc.rest.y, sc.rest.zoom, sc.rest.tilt);
    if (resetVacuum) {
      const p = { x: 0, y: 0 };
      this.camera.toWorld(sp.x * this.w, sp.y * this.h - 70, p);
      this.vacuum.reset(p.x, p.y);
    }
  }

  _onCaptured(d) {
    if (this.scene && this.scene.onCaptured) this.scene.onCaptured(d, this.worldCtx);
    this.camera.kick(2.2);
  }

  // -------------------------------------------------------------- simulate

  sim(dt) {
    this.time += dt;
    this.input.update(dt);
    this.vacuum.update(dt, this.input, this.camera);
    this.scene.update(dt, this.worldCtx);
    this.camera.update(dt);

    if (this.transition) {
      this._updateTransition(dt);
    } else if (this.scene.isComplete()) {
      this.completeHold += dt;
      if (this.completeHold > 0.75) this._startTransition();
    } else {
      this.completeHold = 0;
    }
  }

  _startTransition() {
    const ex = this.scene.exit();
    this.transition = {
      phase: 'out', t: 0, dur: ex.dur || 1.3, next: ex.next,
      from: this.camera.snapshot(), to: ex.to, veil: !!ex.next,
    };
  }

  _updateTransition(dt) {
    const tr = this.transition;
    tr.t += dt;
    const u = clamp(tr.t / tr.dur, 0, 1);
    const e = u * u * (3 - 2 * u);
    const f = tr.from, t = tr.to;
    this.camera.set(lerp(f.x, t.x, e), lerp(f.y, t.y, e), lerp(f.zoom, t.zoom, e), lerp(f.tilt, t.tilt, e));
    if (u < 1) return;
    if (tr.phase === 'out') {
      if (!tr.next) { this.transition = null; return; }   // no next scene yet: stay
      const sc = this.setScene(tr.next, true);
      const en = sc.entry();
      this.camera.set(en.x, en.y, en.zoom, en.tilt);
      this.transition = {
        phase: 'in', t: 0, dur: 1.1, next: null,
        from: this.camera.snapshot(), to: { x: sc.rest.x, y: sc.rest.y, zoom: sc.rest.zoom, tilt: sc.rest.tilt },
        veil: true,
      };
    } else {
      this.transition = null;
    }
  }

  // ---------------------------------------------------------------- render

  render(alpha) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#1d1712';
    ctx.fillRect(0, 0, this.w, this.h);
    this.scene.draw(ctx, this.camera);
    this.vacuum.draw(ctx, this.camera);
    this._drawVeil(ctx);
    if (this.dev) this._drawDev(ctx);
  }

  /** Walking through the lit doorway: light, not UI. */
  _drawVeil(ctx) {
    const tr = this.transition;
    if (!tr || !tr.veil) return;
    const u = clamp(tr.t / tr.dur, 0, 1);
    const a = tr.phase === 'out' ? smoothstep(0.72, 1, u) : 1 - smoothstep(0, 0.32, u);
    if (a <= 0.001) return;
    ctx.fillStyle = 'rgba(250,233,192,' + (a * 0.96).toFixed(3) + ')';
    ctx.fillRect(0, 0, this.w, this.h);
  }

  _drawDev(ctx) {
    const cam = this.camera;
    const p = { x: 0, y: 0 };
    ctx.save();
    ctx.font = '10px monospace';
    ctx.textBaseline = 'top';
    const list = this.scene.debris;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.state === State.DONE) continue;
      cam.toScreen(d.x, d.y, p);
      ctx.fillStyle = 'rgba(0,255,190,0.9)';
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      const label = d.id + ' ' + d.state + ' ' + d.strength.toFixed(2);
      ctx.fillRect(p.x + 4, p.y - 6, ctx.measureText(label).width + 4, 12);
      ctx.fillStyle = '#6effd2';
      ctx.fillText(label, p.x + 6, p.y - 5);
    }
    const v = this.vacuum;
    cam.toScreen(v.mouthX, v.mouthY, p);
    ctx.strokeStyle = '#ff5abf'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x - 7, p.y); ctx.lineTo(p.x + 7, p.y);
    ctx.moveTo(p.x, p.y - 7); ctx.lineTo(p.x, p.y + 7); ctx.stroke();
    const lines = [
      'fps ' + this.loop.fps.toFixed(0) + (this.loop.paused ? ' PAUSED' : '') + ' x' + this.loop.speed,
      'scene ' + this.scene.id + ' ' + this.pose + ' left=' + this.scene.remaining(),
      'noz ' + v.nozzle.x.toFixed(0) + ',' + v.nozzle.y.toFixed(0) + ' pow ' + v.power.toFixed(2) + ' r ' + v.radius.toFixed(0),
      'ptr ' + this.input.x.toFixed(0) + ',' + this.input.y.toFixed(0) + (this.input.down ? ' DOWN' : '') +
        ' held ' + this.input.heldDuration.toFixed(2) + ' rub ' + this.input.rub.toFixed(2) + ' cir ' + this.input.circle.toFixed(2),
      'cup ' + v.cup.length + ' transit ' + v.transits.length + (this.transition ? ' TRANS:' + this.transition.phase : ''),
    ];
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(4, 4, 260, 12 * lines.length + 8);
    ctx.fillStyle = '#9ff';
    for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 8, 8 + i * 12);
    ctx.restore();
  }

  // ------------------------------------------------------------- dev hooks

  /** Scene snapshot with normalized screen coords added, so the harness can aim. */
  _sceneSnapshot() {
    const sn = this.scene.snapshot();
    const p = { x: 0, y: 0 };
    for (let i = 0; i < sn.debris.length; i++) {
      const d = sn.debris[i];
      this.camera.toScreen(d.x, d.y, p);
      d.nx = +(p.x / this.w).toFixed(4);
      d.ny = +(p.y / this.h).toFixed(4);
    }
    return sn;
  }

  state() {
    return {
      t: +this.time.toFixed(3),
      pose: this.pose, poseParam: P.pose, seed: P.seed, speed: this.loop.speed,
      paused: this.loop.paused, fps: +this.loop.fps.toFixed(1),
      viewport: { w: this.w, h: this.h, dpr: this.dpr },
      camera: this.camera.snapshot(),
      input: this.input.snapshot(),
      vacuum: this.vacuum.snapshot(),
      scene: this._sceneSnapshot(),
      transition: this.transition ? { phase: this.transition.phase, t: +this.transition.t.toFixed(2) } : null,
      scenes: sceneIds(),
    };
  }
}

const game = new Game();

window.game = {
  _g: game,
  state: () => game.state(),
  input: {
    pointer: (x, y, down) => game.input.pointer(x, y, down),
    replay: (frames) => game.input.replay(frames),
    get replaying() { return game.input.replaying; },
  },
  pause: () => { game.loop.paused = true; },
  resume: () => { game.loop.paused = false; },
  step: (dt) => game.loop.step(dt === undefined ? STEP : dt),
  goto: (id) => { game.transition = null; game.setScene(id); },
  setSpeed: (s) => { game.loop.speed = s; },
  dev: (on) => { game.dev = !!on; },
};
