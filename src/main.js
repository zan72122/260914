import { Blob } from './blob.js';
import { buildPolygon } from './terrain.js';
import { LEVELS } from './levels.js';
import { Renderer, makeScenery } from './render.js';
import { setupInput } from './input.js';
import * as audio from './audio.js';
import { loadLevel, saveLevel } from './save.js';

const canvas = document.getElementById('c');
const R = new Renderer(canvas);
const blob = new Blob(96);

const state = {
  levelIndex: 0,
  level: null,
  polys: [],
  scenery: null,
  cam: { x: 0, y: 0, scale: 1 },
  mode: 'fadein',      // play | win | fadeout | fadein | fall | garden
  modeT: 0,
  fade: 1,
  bloom: 0,
  t: 0,
  touched: false,
  hintT: 0,
  fingers: new Map(),   // pointerId -> world point
  gardenGoals: [],
};

function isGarden() { return state.levelIndex >= LEVELS.length; }

function gardenLevel() {
  return {
    seed: 99, start: [300, 300], goal: null, deathY: 1200, bounds: [-300, 1500],
    solids: [
      [[-300, 400], [1500, 400], [1500, 3000], [-300, 3000]],
      [[-300, -800], [-220, -800], [-220, 400], [-300, 400]],
      [[1420, -800], [1500, -800], [1500, 400], [1420, 400]],
    ],
  };
}

function load(i) {
  state.levelIndex = i;
  const lv = i < LEVELS.length ? LEVELS[i] : gardenLevel();
  state.level = lv;
  state.polys = lv.solids.map(buildPolygon);
  state.scenery = makeScenery(lv);
  blob.reset(lv.start[0], lv.start[1]);
  state.bloom = 0;
  state.gardenGoals = isGarden() ? [[560, 400], [680, 400], [800, 400]] : [];
  state.cam.x = blob.cx; state.cam.y = blob.cy - 60;
  R.particles.length = 0;
  if (i < LEVELS.length) saveLevel(i);
  setMode(isGarden() ? 'garden' : 'play');
}

function setMode(m) { state.mode = m; state.modeT = 0; }

function resize() {
  const vv = window.visualViewport;
  const w = vv ? vv.width : window.innerWidth;
  const h = vv ? vv.height : window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  R.resize(w, h, dpr);
  // Keep the blob a comfortable size in either orientation.
  const s = Math.min(w / 760, h / 520);
  state.cam.scale = Math.max(0.55, Math.min(1.6, s));
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 100));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

function eraseRadius() { return Math.max(26, 34 / state.cam.scale); }

setupInput(canvas, {
  onFirst() { audio.unlock(); state.touched = true; },
  onStroke(p0, p1, id) {
    audio.unlock();
    const a = R.toWorld(p0.x, p0.y), b = R.toWorld(p1.x, p1.y);
    state.fingers.set(id, b);
    if (state.mode === 'play' || state.mode === 'garden') {
      blob.erase(a, b, eraseRadius());
      if (state.mode === 'garden') {
        for (const g of state.gardenGoals) {
          if (Math.hypot(b.x - g[0], b.y - (g[1] - 30)) < 50) {
            audio.restart();
            R.spawnParticles(g[0], g[1] - 30, '#fff4b0', 40, 220, 1.4, 4, -60);
            setMode('fadeout');
            state.nextLevel = 0;
          }
        }
      }
    }
  },
  onRelease(id) { state.fingers.delete(id); },
});

function handleEvents() {
  for (const ev of blob.events) {
    if (ev.type === 'pop') { audio.pop(); R.spawnParticles(ev.x, ev.y, '#c8ff88', 3, 140, 0.5, 2.5); }
    else if (ev.type === 'grow') { audio.grow(); R.spawnParticles(ev.x, ev.y, '#e8ffc0', 2, 60, 0.4, 2); }
    else if (ev.type === 'land') { audio.land(); R.spawnParticles(ev.x, ev.y, '#a9e56f', 6, 120, 0.5, 2.5); }
  }
  blob.events.length = 0;
}

let last = performance.now();
let acc = 0;
const DT = 1 / 120;

function frame(now) {
  requestAnimationFrame(frame);
  let dtReal = Math.min(0.05, (now - last) / 1000);
  last = now;
  state.t += dtReal;
  state.modeT += dtReal;
  const lv = state.level;
  const mode = state.mode;

  // Physics
  const simulate = mode === 'play' || mode === 'garden' || mode === 'win';
  if (simulate) {
    acc += dtReal;
    let steps = 0;
    while (acc >= DT && steps < 6) { blob.step(DT, lv, state.polys); acc -= DT; steps++; }
    if (steps === 6) acc = 0;
    handleEvents();
  }
  R.updateParticles(dtReal);

  // Mode logic
  if (mode === 'play') {
    if (blob.cy > lv.deathY) { audio.fall(); setMode('fall'); }
    else if (blob.touches(lv.goal[0], lv.goal[1] - 30, 34)) {
      audio.goal();
      setMode('win');
      R.spawnParticles(lv.goal[0], lv.goal[1] - 30, '#fff4b0', 60, 200, 2.2, 4, -60);
    }
  } else if (mode === 'win') {
    state.bloom = Math.min(1, state.modeT / 1.2);
    if (Math.random() < 0.5) R.spawnParticles(lv.goal[0] + (Math.random() - 0.5) * 80, lv.goal[1] - 40, '#ffe9a0', 1, 60, 2.0, 3, -80);
    if (state.modeT > 2.6) { state.nextLevel = state.levelIndex + 1; setMode('fadeout'); }
  } else if (mode === 'fadeout') {
    state.fade = Math.min(1, state.modeT / 0.7);
    if (state.modeT >= 0.7) { load(state.nextLevel); setMode('fadein'); state.fade = 1; }
  } else if (mode === 'fadein') {
    state.fade = Math.max(0, 1 - state.modeT / 0.8);
    if (state.modeT >= 0.8) setMode(isGarden() ? 'garden' : 'play');
  } else if (mode === 'fall') {
    // quick dip to dark, reappear at the last safe spot
    const half = 0.45;
    state.fade = state.modeT < half ? state.modeT / half : Math.max(0, 1 - (state.modeT - half) / half);
    if (state.modeT >= half && !state.respawned) {
      blob.reset(blob.safe.x, blob.safe.y);
      state.cam.x = blob.cx; state.cam.y = blob.cy - 60;
      state.respawned = true;
    }
    if (state.modeT >= half * 2) { state.respawned = false; state.fade = 0; setMode('play'); }
  } else if (mode === 'garden') {
    if (blob.cy > lv.deathY) { blob.reset(lv.start[0], lv.start[1]); }
    if (Math.random() < 0.15) {
      const g = state.gardenGoals[Math.floor(Math.random() * 3)];
      R.spawnParticles(g[0] + (Math.random() - 0.5) * 60, g[1] - 40, '#ffe9a0', 1, 50, 2.0, 3, -80);
    }
  }

  // Hint streak until the first touch
  if (!state.touched && mode === 'play') {
    state.hintT += dtReal;
  }

  // Camera
  const k = 1 - Math.pow(0.02, dtReal);
  let targetX = mode === 'win' ? lv.goal[0] : blob.cx;
  if (isGarden()) targetX = (blob.cx + 680) / 2;
  const targetY = (mode === 'win' ? lv.goal[1] - 30 : blob.cy) - (R.h * 0.12) / state.cam.scale;
  state.cam.x += (targetX - state.cam.x) * k;
  state.cam.y += (targetY - state.cam.y) * k;

  // Draw
  R.begin(state.cam);
  R.drawBackground(state.t, state.scenery, state.polys, mode === 'win' ? state.bloom : 0);
  R.drawTerrain(state.t, state.polys, state.scenery);
  if (lv.goal) R.drawGoal(state.t, lv.goal, state.bloom);
  for (const g of state.gardenGoals) R.drawGoal(state.t + g[0], g, 1);
  const look = lv.goal ? { x: lv.goal[0], y: lv.goal[1] - 30 } : { x: blob.cx + 40, y: blob.cy - 60 };
  if (state.fingers.size) { const f = state.fingers.values().next().value; look.x = f.x; look.y = f.y; }
  R.drawBlob(state.t, blob, look.x, look.y, mode === 'fall' ? 1 - state.fade : 1);
  R.drawFingerHalo([...state.fingers.values()]);
  R.drawParticles();
  if (!state.touched && mode === 'play') {
    const cyc = 3.2, ph = (state.hintT % cyc) / 1.3;
    R.drawHint(state.t, blob, ph);
  }
  if (lv.goal) R.drawEdgeGlow(state.t, lv.goal);
  R.drawFade(state.fade);
}

window.__mk = { state, blob, load };
load(loadLevel());
setMode('fadein');
state.fade = 1;
requestAnimationFrame(frame);
