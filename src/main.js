import { Loop, STEP } from './core/loop.js';
import { RNG } from './core/rng.js';
import { Input } from './core/input.js';
import { Camera } from './core/camera.js';
import { Audio } from './core/audio.js';
import { Vacuum } from './vacuum/vacuum.js';
import { State } from './debris/base.js';
import { makeScene, sceneIds, roomIds, findScene } from './scenes/index.js';
import { clamp, lerp, smoothstep } from './core/math.js';

const params = new URLSearchParams(location.search);
const P = {
  scene: params.get('scene') || '',
  seed: parseInt(params.get('seed') || '1337', 10) || 1337,
  dev: params.get('dev') === '1',
  speed: parseFloat(params.get('speed') || '1') || 1,
  pose: params.get('pose') || null,
  mute: params.get('mute') === '1',
  /** `?chain=1` plays the old linear ring instead of the hub. */
  chain: params.get('chain') === '1',
  /** `?clean=intro,kitchen` — door states for reproducing a hall moment. */
  clean: params.get('clean') || '',
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
    this.house = this._makeHouse();
    this.worldCtx = {
      vacuum: this.vacuum, camera: this.camera, input: this.input,
      rng: this.rng, audio: this.audio,
      world: {
        rng: this.rng, audio: this.audio, camera: this.camera,
        onCaptured: (d) => this._onCaptured(d),
      },
    };

    this.input.onFirstGesture(() => this.audio.unlock());
    this.input.attach(this.canvas);
    this._installViewportHandlers();
    this._installLifecycleHandlers();

    this.loop = new Loop((dt) => this.sim(dt), (a) => this.render(a));
    this.loop.speed = P.speed;

    this.resize(true);
    const first = findScene(P.scene) ? P.scene : (P.chain ? 'intro' : 'hall');
    this.setScene(first);
    this.loop.start();
  }

  /**
   * The house, in memory only.
   *
   * Which rooms are clean, whether the hall has already thrown its other doors
   * open, and each room's own `persist` bag. The owner chose "fresh every
   * time", so none of it is stored between page loads — when the last room is
   * done the hall resets it itself.
   *
   * `?clean=intro,kitchen` sets the door states up front, which is how you
   * reproduce one hall moment without playing the eight rooms in front of it.
   */
  _makeHouse() {
    const h = { rooms: {}, opened: false, returnedFrom: null };
    for (const id of roomIds()) h.rooms[id] = { clean: false, persist: {} };
    const pre = P.clean.split(',').map((s) => s.trim()).filter(Boolean);
    for (const id of pre) if (h.rooms[id]) h.rooms[id].clean = true;
    if (pre.length) h.opened = true;
    return h;
  }

  // -------------------------------------------------------------- lifecycle

  /**
   * iOS Safari changes the viewport for reasons that are not a rotation (the
   * URL bar sliding away, the keyboard, entering/leaving standalone), reports
   * the OLD size for a moment after `orientationchange`, and fires `resize` in
   * bursts. So: debounce, and trust `visualViewport` over `innerWidth/Height`
   * when it exists, because that is the box actually being painted.
   */
  _installViewportHandlers() {
    let timer = 0;
    const kick = (delay) => {
      clearTimeout(timer);
      timer = setTimeout(() => { timer = 0; this.resize(); }, delay);
    };
    window.addEventListener('resize', () => kick(90));
    window.addEventListener('orientationchange', () => kick(220));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => kick(90));
      window.visualViewport.addEventListener('scroll', () => kick(140));
    }
    // the URL bar finishes animating well after the last resize event
    window.addEventListener('pageshow', () => kick(60));
  }

  /**
   * Nothing runs while the page is hidden: a backgrounded rAF loop on iOS is
   * either throttled to a crawl or replayed in one lump when you come back,
   * and neither is a game. The audio context is suspended with it.
   */
  _installLifecycleHandlers() {
    const unlock = () => this.audio.unlock();
    // BOTH: Safari has honoured one and not the other across versions
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._wasPaused = this.loop.paused;
        this.loop.paused = true;
        this.audio.suspend();
      } else {
        this.loop.paused = !!this._wasPaused;
        this.loop.last = performance.now();
        this.loop.acc = 0;
        this.audio.resume();
      }
    });
    window.addEventListener('blur', () => this.audio.suspend());
    window.addEventListener('focus', () => this.audio.resume());
  }

  /** The painted viewport, in CSS px. `visualViewport` is the truth on iOS. */
  _viewportSize() {
    const vv = window.visualViewport;
    if (vv && vv.width > 0 && vv.height > 0) {
      return { w: Math.round(vv.width), h: Math.round(vv.height) };
    }
    return {
      w: window.innerWidth || document.documentElement.clientWidth || 1,
      h: window.innerHeight || document.documentElement.clientHeight || 1,
    };
  }

  resize(initial) {
    const v = this._viewportSize();
    const w = Math.max(1, v.w);
    const h = Math.max(1, v.h);
    // DPR capped at 2: a 3x iPhone would be pushing 2.25x the pixels for no
    // visible gain on shapes this soft
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!initial && w === this.w && h === this.h && this.canvas.width === Math.round(w * this.dpr)) return;
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

  /**
   * Orientation change: the scene rebuilds its whole world for the new pose, so
   * it has to be handed back what the player already achieved. `persist` keeps
   * whatever the scene wants across the rebuild; saveProgress()/restoreProgress()
   * put the cleared debris back (see Scene for the default).
   */
  relayout() {
    const prev = this.scene;
    const persist = prev.persist;
    const progress = prev.saveProgress();
    this.rng.reset(P.seed);
    prev.persist = persist;              // identities/progress the scene wants kept
    prev.layout(this.pose, this.w, this.h);
    prev.persist = persist;
    prev.restoreProgress(progress);
    this._placeStart(prev, false);
  }

  setScene(id, keepCup) {
    this.rng.reset(P.seed);
    const sc = makeScene(id, this.rng);
    // the hub and the rooms both need to know where they stand in the house;
    // `persist` is handed back so a room looks the way the child left it
    sc.house = this.house;
    if (id === 'hall') {
      sc.returnFrom = this.house.returnedFrom;
      this.house.returnedFrom = null;
    } else if (this.house.rooms[id]) {
      sc.persist = this.house.rooms[id].persist || {};
    }
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
    this.camera.set(sc.rest.x, sc.rest.y, sc.rest.zoom, sc.rest.tilt);
    /**
     * A scene may ask for the machine to start at a specific WORLD point — the
     * hall does, so that coming back out of a room puts the head in the
     * doorway it came out of. The finger has to be moved with it, or the head
     * springs straight back across the room to wherever it was left.
     */
    if (sc.startWorld) {
      const q = { x: 0, y: 0 };
      this.camera.toScreen(sc.startWorld.x, sc.startWorld.y, q);
      this.input.pointer(
        clamp(q.x / this.w, 0.06, 0.94),
        clamp((q.y + this.vacuum.leadUp) / this.h, 0.1, 0.94),
        this.input.down);
      if (resetVacuum) this.vacuum.reset(sc.startWorld.x, sc.startWorld.y);
      return;
    }
    if (!this.input.everDown) this.input.pointer(sp.x, sp.y, false);
    if (resetVacuum) {
      const p = { x: 0, y: 0 };
      this.camera.toWorld(sp.x * this.w, sp.y * this.h - this.vacuum.leadUp, p);
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
    // Every room has a bin by its door, and the scene only has to PLACE it:
    // `scene.bin` is ticked and drawn here so the pour, the cup flap and the
    // lid behave identically in all thirteen rooms and in the hall.
    if (this.scene.bin && !this.scene.ownsBin) this.scene.bin.update(dt, this.worldCtx);
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

  /**
   * A finished room always hands back to the hall — the scenes themselves do
   * not have to know that, because a room's job is its own floor and the hub
   * is the thing that knows about the house. `?chain=1` restores the old
   * linear ring by simply honouring whatever `exit().next` says.
   */
  _startTransition() {
    const ex = this.scene.exit();
    let next = ex.next;
    if (!P.chain && this.scene.id !== 'hall') {
      const room = this.house.rooms[this.scene.id];
      if (room) {
        room.clean = true;
        room.persist = this.scene.persist || {};
      }
      this.house.returnedFrom = this.scene.id;
      next = 'hall';
    }
    this.transition = {
      phase: 'out', t: 0, dur: ex.dur || 1.3, next,
      from: this.camera.snapshot(), to: ex.to, veil: !!next,
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
    const bin = this.scene.ownsBin ? null : this.scene.bin;
    if (bin) { ctx.save(); this.camera.apply(ctx); bin.draw(ctx); ctx.restore(); }
    this.vacuum.draw(ctx, this.camera);
    if (bin) { ctx.save(); this.camera.apply(ctx); bin.drawOver(ctx); ctx.restore(); }
    this.scene.drawOver(ctx, this.camera);
    const L = this.scene.light;
    if (L) {
      L.setViewport(this.w, this.h);
      L.begin();
      L.addHeadlight(this.vacuum, this.camera);
      this.scene.lights(L, this.camera, this.vacuum);
      L.composite(ctx);
    }
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
      'cup ' + v.cup.length + ' fill ' + v.cupFill.toFixed(2) + ' vol ' + Math.round(v.cupVol)
        + ' transit ' + v.transits.length + (this.transition ? ' TRANS:' + this.transition.phase : ''),
      'house ' + roomIds().map((id) => (this.house.rooms[id].clean ? '+' : '-')).join('')
        + (this.house.opened ? ' opened' : ''),
    ];
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(4, 4, 300, 12 * lines.length + 8);
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
      // nx/ny are the AIM point, not the centre: that is where the harness has
      // to put the mouth (a strand is taken by its tip, a trail by one grain)
      this.camera.toScreen(d.ax === undefined ? d.x : d.ax, d.ay === undefined ? d.y : d.ay, p);
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
      house: { opened: this.house.opened, clean: roomIds().filter((id) => this.house.rooms[id].clean) },
      chain: P.chain,
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
  goto: (id, keepCup) => { game.transition = null; game.setScene(id, keepCup); },
  house: () => game.house,
  setClean: (ids) => {
    for (const id of Object.keys(game.house.rooms)) game.house.rooms[id].clean = ids.indexOf(id) >= 0;
    game.house.opened = true;
  },
  setSpeed: (s) => { game.loop.speed = s; },
  dev: (on) => { game.dev = !!on; },
};
