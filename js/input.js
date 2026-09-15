// Pointer Events による一本指操作。板外・器具外のタップは黙って無視する。

import { state } from './state.js';
import { sand, pour, scatter, scatterAll, spill, clipToPlate } from './sand.js';
import { MODE_COUNT, modeFromKnob, insideMask } from './field.js';
import { spawnFlight } from './flight.js';
import { KNOB_SWEEP } from './render.js';
import { clamp, angleDelta, dist2, TAU } from './util.js';
import { ensureAudio, tick, pourSound } from './audio.js';

export const input = {
  pouring: false,
  px: 0, py: 0,
};

let active = null;
let layoutRef = null;

function now() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); }

function touched() { state.lastInteract = now(); }

function toLocal(L, x, y) {
  const p = L.plate;
  const r = p.r || 1;
  return { u: (x - p.cx - state.shakeX) / r, v: (y - p.cy - state.shakeY) / r };
}

export function setPlate(kind) {
  if (!kind || kind === state.plate) return;
  state.plateAnim = { from: state.plate, to: kind, t: 0 };
  state.plate = kind;
  spill(0.35);
  clipToPlate(kind);
  state.everRack = true;
  state.converged = false;
  tick('plate');
}

export function setSocket(i) {
  if (i === state.socket) return;
  state.plugAnim = { from: state.socket, to: i, t: 0 };
  state.socket = i;
  state.socketPulse[i] = 1;
  scatterAll(0.004);
  state.everSocket = true;
  state.converged = false;
  tick('plug');
}

function bumpKnob() {
  const m = modeFromKnob(state.knob);
  let next;
  if (state.knob < 0.045) next = 0;
  else next = m.index + 1;
  if (next > MODE_COUNT - 1) {
    state.knob = 0; // 一周したら停止
  } else {
    state.knob = clamp(0.045 + (next / (MODE_COUNT - 1)) * 0.955, 0, 1);
  }
  if (state.knob >= 0.045) state.everKnob = true;
  state.knobPulse = 1;
  tick('knob');
}

function hitTest(L, x, y) {
  if (dist2(x, y, L.knob.cx, L.knob.cy) <= L.knob.hit * L.knob.hit) return { mode: 'knob' };
  if (dist2(x, y, L.bowl.cx, L.bowl.cy) <= L.bowl.hit * L.bowl.hit) return { mode: 'bowl' };
  for (let i = 0; i < L.rack.length; i++) {
    const it = L.rack[i];
    if (dist2(x, y, it.cx, it.cy) <= it.hit * it.hit) return { mode: 'rack', index: i, kind: it.kind };
  }
  for (let i = 0; i < L.sockets.length; i++) {
    const s = L.sockets[i];
    if (dist2(x, y, s.cx, s.cy) <= s.hit * s.hit) return { mode: 'socket', index: i };
  }
  const loc = toLocal(L, x, y);
  if (Math.abs(loc.u) <= 1.12 && Math.abs(loc.v) <= 1.12) return { mode: 'plate' };
  return null;
}

function onDown(e) {
  ensureAudio();
  const L = layoutRef && layoutRef();
  if (!L) return;
  if (active) return;              // 一本指のみ
  const rect = e.target.getBoundingClientRect ? e.target.getBoundingClientRect() : { left: 0, top: 0 };
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const hit = hitTest(L, x, y);
  touched();
  if (!hit) return;                // 台の上など: 何も起きない

  active = {
    id: e.pointerId,
    mode: hit.mode,
    index: hit.index,
    x0: x, y0: y, x: x, y: y,
    t0: now(),
    moved: 0,
  };
  try { if (e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }

  if (hit.mode === 'knob') {
    active.ang = Math.atan2(y - L.knob.cy, x - L.knob.cx);
    active.startKnob = state.knob;
    active.accum = 0;
  } else if (hit.mode === 'bowl') {
    state.bowlTiltTarget = (x < L.bowl.cx ? 0.30 : -0.30);
    input.pouring = true;
    input.px = x; input.py = y;
    state.everPoured = true;
  } else if (hit.mode === 'rack') {
    state.rackPulse[hit.index] = 1;
    setPlate(hit.kind);
  } else if (hit.mode === 'socket') {
    setSocket(hit.index);
    state.socketPulse[hit.index] = 1;
  } else if (hit.mode === 'plate') {
    const loc = toLocal(L, x, y);
    scatter(loc.u, loc.v, 0.16, 0.012);
    state.converged = false;
    state.shock = Math.max(state.shock, 0.35);
  }
}

function onMove(e) {
  if (!active || e.pointerId !== active.id) return;
  const L = layoutRef && layoutRef();
  if (!L) return;
  const rect = e.target.getBoundingClientRect ? e.target.getBoundingClientRect() : { left: 0, top: 0 };
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const dx = x - active.x, dy = y - active.y;
  active.moved += Math.sqrt(dx * dx + dy * dy);
  active.x = x; active.y = y;
  touched();

  if (active.mode === 'knob') {
    const a = Math.atan2(y - L.knob.cy, x - L.knob.cx);
    const d = angleDelta(a, active.ang);
    active.ang = a;
    active.accum += d;
    const nk = clamp(active.startKnob + active.accum / KNOB_SWEEP, 0, 1);
    if (Math.abs(nk - state.knob) > 0.0005) {
      const before = modeFromKnob(state.knob).index;
      state.knob = nk;
      if (modeFromKnob(nk).index !== before) tick('knob');
    }
    if (state.knob >= 0.045) state.everKnob = true;
  } else if (active.mode === 'bowl') {
    input.px = x; input.py = y;
    state.bowlTiltTarget = (x < L.bowl.cx ? 0.32 : -0.32);
  } else if (active.mode === 'plate') {
    const loc = toLocal(L, x, y);
    const mag = Math.sqrt(dx * dx + dy * dy) / (L.plate.r || 1);
    const power = clamp(mag * 0.9, 0.004, 0.05);
    scatter(loc.u, loc.v, 0.20, power);
    if (power > 0.008) { state.converged = false; state.shock = Math.max(state.shock, 0.5); }
    state.rubEnergy += mag;
    if (state.rubEnergy > 6) {
      scatterAll(0.03);
      state.rubEnergy = 0;
      state.converged = false;
    }
  } else if (active.mode === 'rack') {
    // ラックから板へドラッグしても装着済み（pointerdown で適用済み）
  }
}

function onUp(e) {
  if (!active || (e.pointerId !== undefined && e.pointerId !== active.id)) return;
  const dur = now() - active.t0;
  if (active.mode === 'knob' && active.moved < 10 && dur < 600) {
    bumpKnob();
  }
  if (active.mode === 'bowl') {
    input.pouring = false;
    state.bowlTiltTarget = 0;
  }
  state.rubEnergy *= 0.4;
  active = null;
  touched();
}

/**
 * 毎フレーム呼ぶ: 砂を降らせ続ける（毎秒およそ150粒）。
 * 指が板の上にあれば指の位置へ、板の外（ボウルの上など）なら板へ向かって砂が飛ぶ。
 */
export function tickPour(L, dt) {
  if (!input.pouring || !L) return;
  const loc = toLocal(L, input.px, input.py);
  const n = Math.max(1, Math.round(2.5 * dt));
  let added;
  if (insideMask(state.plate, loc.u, loc.v)) {
    added = pour(state.plate, loc.u, loc.v, n, 0.10);
  } else {
    added = spawnFlight(state.plate, input.px, input.py, n);
  }
  if (added > 0) pourSound();
}

/** pointerdown 直後のひとまとまりの砂（板の上に約60粒） */
export function pourBurst(L) {
  const loc = toLocal(L, input.px, input.py);
  if (insideMask(state.plate, loc.u, loc.v)) {
    pour(state.plate, loc.u, loc.v, 60, 0.14);
  } else {
    spawnFlight(state.plate, input.px, input.py, 60);
  }
  pourSound();
}

export function installInput(canvas, getLayout) {
  layoutRef = getLayout;
  canvas.addEventListener('pointerdown', (e) => {
    onDown(e);
    if (active && active.mode === 'bowl') {
      const L = getLayout();
      if (L) pourBurst(L);
    }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('pointermove', (e) => {
    onMove(e);
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('lostpointercapture', onUp);
  window.addEventListener('blur', onUp);

  // iOS Safari のダブルタップズーム・長押しメニュー抑止
  const stop = (e) => { if (e.cancelable) e.preventDefault(); };
  canvas.addEventListener('touchstart', stop, { passive: false });
  canvas.addEventListener('touchmove', stop, { passive: false });
  canvas.addEventListener('touchend', stop, { passive: false });
  canvas.addEventListener('contextmenu', stop);
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('dblclick', stop, { passive: false });
}
