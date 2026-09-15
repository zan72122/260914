/**
 * scene.js — SceneManager + continuous (cut-free) transitions (DESIGN §5.5.3).
 *
 *   engine.scenes.register('lithium', (engine, handoff, finish) => world.createWorld(engine, handoff, finish));
 *   engine.scenes.go('lithium', { handoff, transition: 'continuous' });
 *   engine.scenes.go('hearth',  { transition: 'none' });   // tests
 *
 * During an overlap BOTH scenes are alive: update(old)+update(new), draw(old) then draw(new).
 * `handoff.progress` runs 0 -> 1 across the overlap and is the ONLY synchronisation signal
 * the two scenes share. The old scene's exit() runs when the overlap ends. No black frame,
 * ever.
 *
 * Scenes are plain objects implementing the Scene contract (§5.5.1). Missing methods are
 * tolerated (no-ops), so stubs stay tiny.
 */

export const DEFAULT_OVERLAP = 1.2;

/**
 * Create a well-formed Handoff (§5.5.4).
 * The object is LIVE: SceneManager writes `progress` (0..1) into this very object during the
 * overlap, so the scene that created it can fade itself out against the same clock.
 */
export function makeHandoff(o = {}) {
  const h = Object.assign({}, o);
  h.elementId = o.elementId || null;
  h.flameColor = o.flameColor || '#ffffff';
  h.glowColor = o.glowColor || h.flameColor;
  h.origin = o.origin || { x: 0, y: 0 };
  h.particles = o.particles || [];
  h.cameraZoom = o.cameraZoom == null ? 1 : o.cameraZoom;
  h.progress = o.progress || 0;
  h.startedAt = o.startedAt || performance.now();
  h.__handoff = true;
  return h;
}

const NOOP = () => {};

function normalizeScene(s, id) {
  if (!s) throw new Error('scene factory returned nothing for ' + id);
  if (!s.id) s.id = id;
  if (!s.enter) s.enter = NOOP;
  if (!s.exit) s.exit = NOOP;
  if (!s.update) s.update = NOOP;
  if (!s.draw) s.draw = NOOP;
  if (!s.layout) s.layout = NOOP;
  if (!s.onPointerDown) s.onPointerDown = NOOP;
  if (!s.onPointerMove) s.onPointerMove = NOOP;
  if (!s.onPointerUp) s.onPointerUp = NOOP;
  return s;
}

export class SceneManager {
  constructor(engine) {
    this.engine = engine;
    this.factories = new Map();
    this.current = null;
    this.outgoing = null;
    this.overlap = null;    // {t, dur, handoff}
    /** set by main.js — receives every finish(result) call */
    this.onFinish = null;
  }

  /** @param {string} id @param {(engine, handoff, finish) => Object} factory */
  register(id, factory) { this.factories.set(id, factory); return this; }
  has(id) { return this.factories.has(id); }
  get currentId() { return this.current ? this.current.id : null; }
  get busy() { return !!this.overlap; }

  /**
   * @param {string} id
   * @param {{handoff?:Object, transition?:'continuous'|'none', overlap?:number}} [opts]
   */
  go(id, opts = {}) {
    const factory = this.factories.get(id);
    if (!factory) { console.warn('[scene] unknown scene:', id); return null; }

    // A transition requested mid-overlap finishes the previous one instantly.
    if (this.overlap) this._endOverlap();

    const engine = this.engine;
    const handoff = opts.handoff
      ? (opts.handoff.__handoff ? opts.handoff : makeHandoff(opts.handoff))
      : null;
    if (handoff) { handoff.progress = 0; handoff.startedAt = performance.now(); }

    const finish = (result) => {
      if (scene !== this.current && scene !== this.outgoing) return;
      if (this.onFinish) this.onFinish(result || {}, id, scene);
    };

    const scene = normalizeScene(factory(engine, handoff, finish), id);

    const ctx = {
      engine,
      handoff,
      progress: engine.progress,
      finish
    };

    const prev = this.current;
    const transition = opts.transition === 'none' || !prev ? 'none' : 'continuous';

    engine.input.release();
    scene.layout(engine.width, engine.height);
    scene.enter(ctx);

    this.current = scene;

    if (transition === 'none') {
      if (prev) { try { prev.exit(); } catch (e) { console.warn(e); } }
      this.outgoing = null;
      this.overlap = null;
    } else {
      this.outgoing = prev;
      this.overlap = { t: 0, dur: opts.overlap || DEFAULT_OVERLAP, handoff: handoff || makeHandoff({}) };
      if (handoff) handoff.progress = 0;
    }
    return scene;
  }

  _endOverlap() {
    if (!this.overlap) return;
    if (this.overlap.handoff) this.overlap.handoff.progress = 1;
    const out = this.outgoing;
    this.outgoing = null;
    this.overlap = null;
    if (out) { try { out.exit(); } catch (e) { console.warn(e); } }
  }

  layout(w, h) {
    if (this.outgoing) { try { this.outgoing.layout(w, h); } catch (e) { console.warn(e); } }
    if (this.current) { try { this.current.layout(w, h); } catch (e) { console.warn(e); } }
  }

  update(dt) {
    if (this.overlap) {
      this.overlap.t += dt;
      const k = Math.min(1, this.overlap.t / this.overlap.dur);
      this.overlap.handoff.progress = k;
      if (this.outgoing) { try { this.outgoing.update(dt); } catch (e) { console.warn(e); } }
      if (k >= 1) this._endOverlap();
    }
    if (this.current) { try { this.current.update(dt); } catch (e) { console.warn(e); } }
  }

  draw(g) {
    if (this.outgoing) { try { this.outgoing.draw(g); } catch (e) { console.warn(e); } }
    if (this.current) { try { this.current.draw(g); } catch (e) { console.warn(e); } }
  }

  // pointer routing: the incoming scene owns the finger during an overlap
  pointerDown(p) { if (this.current) this.current.onPointerDown(p); }
  pointerMove(p) { if (this.current) this.current.onPointerMove(p); }
  pointerUp(p) { if (this.current) this.current.onPointerUp(p); }

  debugState() {
    if (this.current && this.current.debugState) {
      try { return this.current.debugState(); } catch (e) { return {}; }
    }
    return {};
  }

  hitPoints() {
    if (this.current && this.current.hitPoints) {
      try { return this.current.hitPoints() || []; } catch (e) { return []; }
    }
    return [];
  }
}
