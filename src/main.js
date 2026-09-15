/**
 * main.js — bootstrap: iOS hardening, engine creation, scene registration, __game debug hook.
 *
 * Scene registration contract: `(engine, handoff, finish) => Scene`.
 * Worlds never navigate themselves — they call finish(result) and this file routes:
 *   result.goto            -> go to that scene (hearth uses this to enter a world / spectroscope)
 *   result.completed===true -> markWorldDone(worldId), then continuously return to the hearth
 */

import { Engine } from './core/engine.js';
import { makeHandoff } from './core/scene.js';
import { ELEMENT_BY_ID, ELEMENTS } from './core/palette.js';
import {
  loadProgress, patchProgress, resetProgress as storeReset, markWorldDone, markSpectrumSeen
} from './core/storage.js';
import { createHearth } from './scenes/hearth.js';
import { createSpectroscope } from './scenes/spectroscope.js';

import lithium from './worlds/lithium.js';
import copper from './worlds/copper.js';
import sodium from './worlds/sodium.js';
import strontium from './worlds/strontium.js';
import barium from './worlds/barium.js';

const WORLDS = [lithium, copper, sodium, strontium, barium];

// ----------------------------------------------------------------- iOS hardening (§5.2)

function hardenIOS() {
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();   // double-tap zoom
    lastTouchEnd = now;
  }, { passive: false });
  window.addEventListener('scroll', () => window.scrollTo(0, 0), { passive: true });
}

// ----------------------------------------------------------------- boot

function boot() {
  hardenIOS();

  const canvas = document.getElementById('game');
  const engine = new Engine(canvas);

  engine.scenes.register('hearth', (eng, handoff, finish) => createHearth(eng, handoff, finish));
  engine.scenes.register('spectroscope', (eng, handoff, finish) => createSpectroscope(eng, handoff, finish));
  for (const w of WORLDS) {
    engine.scenes.register(w.id, (eng, handoff, finish) => w.createWorld(eng, handoff, finish));
  }

  engine.scenes.onFinish = (result, sceneId) => {
    if (!result) return;

    // hearth -> world / spectroscope
    if (result.goto) {
      engine.scenes.go(result.goto, { handoff: result.handoff || null, transition: 'continuous' });
      return;
    }

    // spectroscope -> hearth
    if (sceneId === 'spectroscope') {
      const id = result.elementId;
      if (id && ELEMENT_BY_ID[id]) engine.progress = markSpectrumSeen(id);
      const def = ELEMENT_BY_ID[id] || ELEMENTS[0];
      const back = makeHandoff({
        elementId: id || null,
        flameColor: def.flameColor,
        glowColor: def.glowColor,
        origin: { x: engine.width / 2, y: engine.height / 2 },
        particles: engine.particles.snapshot(),
        fromSpectroscope: true,
        returning: true
      });
      engine.scenes.go('hearth', { handoff: back, transition: 'continuous' });
      return;
    }

    // world -> hearth
    const worldId = result.worldId || sceneId;
    if (result.completed === true && ELEMENT_BY_ID[worldId]) {
      engine.progress = markWorldDone(worldId);
    }
    const def = ELEMENT_BY_ID[worldId] || ELEMENTS[0];
    const back = result.returnHandoff && result.returnHandoff.__handoff
      ? result.returnHandoff
      : makeHandoff(Object.assign({
        elementId: worldId,
        flameColor: def.flameColor,
        glowColor: def.glowColor,
        origin: { x: engine.width / 2, y: engine.height / 2 },
        particles: engine.particles.snapshot()
      }, result.returnHandoff || {}));
    back.elementId = back.elementId || worldId;
    back.returning = true;
    back.shelfAnchorHint = result.shelfAnchorHint || null;
    engine.scenes.go('hearth', { handoff: back, transition: 'continuous', overlap: 1.5 });
  };

  engine.scenes.go('hearth', { transition: 'none' });
  engine.start();

  installDebugHook(engine);
  return engine;
}

// ----------------------------------------------------------------- __game (§5.10)

function installDebugHook(engine) {
  const prev = window.__game || {};
  const api = {
    version: '1.0.0',
    engine,
    get sceneId() { return engine.scenes.currentId; },
    get state() { return engine.scenes.debugState(); },
    get progress() { return engine.progress; },
    get ready() { return !!engine.ready; },
    get busy() { return engine.scenes.busy; },
    get frameCount() { return engine.frameCount; },

    /** Jump to any scene. For worlds a handoff is synthesised. */
    goto(sceneId, opts = {}) {
      const def = ELEMENT_BY_ID[sceneId];
      let handoff = opts.handoff || null;
      if (!handoff && (def || sceneId === 'spectroscope')) {
        const d = def || ELEMENT_BY_ID[opts.elementId] || ELEMENTS[0];
        handoff = makeHandoff({
          elementId: d.id,
          flameColor: d.flameColor,
          glowColor: d.glowColor,
          origin: { x: engine.width / 2, y: engine.height * 0.4 },
          particles: [],
          cameraZoom: 1
        });
      }
      return engine.scenes.go(sceneId, {
        handoff,
        transition: opts.transition || 'none',
        overlap: opts.overlap
      });
    },

    setProgress(partial) {
      engine.progress = patchProgress(partial || {});
      engine.audio.setMuted(engine.progress.muted);
      return engine.progress;
    },

    resetProgress() {
      engine.progress = storeReset();
      return engine.progress;
    },

    /** Complete the current world / ignite the suggested dish immediately. */
    complete() {
      const s = engine.scenes.current;
      if (!s) return false;
      if (typeof s.complete === 'function') { s.complete(); return true; }
      if (typeof s.hit === 'function') { s.hit(); return true; }
      return false;
    },

    setMuted(b) {
      engine.audio.setMuted(!!b);
      engine.progress = patchProgress({ muted: !!b });
      return engine.audio.muted;
    },

    hitPoints() { return engine.scenes.hitPoints(); },

    seed(n) { engine.rng.seed(n >>> 0); return n; },

    /** convenience for QA: force a relayout right now */
    relayout() { engine.relayout(); }
  };
  Object.defineProperty(api, 'lastVoice', {
    value: prev.lastVoice == null ? null : prev.lastVoice,
    writable: true, enumerable: true, configurable: true
  });
  window.__game = api;
  // keep whatever audio.js recorded before the hook existed
  if (engine.audio.lastVoice) api.lastVoice = engine.audio.lastVoice;
}

// ----------------------------------------------------------------- go

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

// keep the progress object fresh if another tab wrote it
window.addEventListener('storage', () => {
  if (window.__game && window.__game.engine) window.__game.engine.progress = loadProgress();
});
