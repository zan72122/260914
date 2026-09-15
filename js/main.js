// エントリポイント: キャンバス設定・レイアウト・メインループ。

import { clamp, smoothstep, approach } from './util.js';
import { state } from './state.js';
import { computeLayout } from './layout.js';
import { initSand, resizeSand, updateSand, sand } from './sand.js';
import { rebuildField, modeFromKnob, MODE_COUNT } from './field.js';
import { render } from './render.js';
import { installInput, tickPour } from './input.js';
import { updateFlight } from './flight.js';
import { setDrone, chime } from './audio.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });

let L = null;
let dpr = 1;

function readInsets() {
  const el = document.getElementById('safe-probe');
  const out = { top: 0, right: 0, bottom: 0, left: 0 };
  if (!el || !window.getComputedStyle) return out;
  try {
    const cs = window.getComputedStyle(el);
    out.top = parseFloat(cs.paddingTop) || 0;
    out.right = parseFloat(cs.paddingRight) || 0;
    out.bottom = parseFloat(cs.paddingBottom) || 0;
    out.left = parseFloat(cs.paddingLeft) || 0;
  } catch (e) { /* noop */ }
  return out;
}

function particleBudget(w, h) {
  const m = Math.min(w, h);
  return Math.round(clamp(1500 + (m - 320) * 5.5, 1500, 3500));
}

function resize() {
  const w = Math.max(200, window.innerWidth || document.documentElement.clientWidth || 360);
  const h = Math.max(200, window.innerHeight || document.documentElement.clientHeight || 640);
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  L = computeLayout(w, h, readInsets());
  // 砂は板ローカル座標なので、容量だけ合わせれば模様はそのまま残る
  if (!sand.u) initSand(particleBudget(w, h));
  else resizeSand(particleBudget(w, h));
}

function getLayout() { return L; }

// ---- 状態更新 ----
function update(dt) {
  state.time += dt;
  const on = state.knob >= 0.045;
  const m = modeFromKnob(state.knob);
  const pitch = MODE_COUNT > 1 ? (m.index + m.blend) / (MODE_COUNT - 1) : 0;
  state.pitch = pitch;
  const target = on ? 0.35 + 0.65 * ((state.knob - 0.045) / 0.955) : 0;
  state.vib = approach(state.vib, target, 0.14, dt);
  if (state.vib < 0.004 && !on) state.vib = 0;

  // 板の微振動（1〜2px）
  if (state.vib > 0.01) {
    const amp = state.vib * (1 + pitch) * 0.9;
    state.shakeX = (Math.random() - 0.5) * amp * 2;
    state.shakeY = (Math.random() - 0.5) * amp * 2;
  } else {
    state.shakeX = approach(state.shakeX, 0, 0.3, dt);
    state.shakeY = approach(state.shakeY, 0, 0.3, dt);
  }

  // リップル
  if (state.vib > 0.02) {
    state.rippleTimer -= dt;
    if (state.rippleTimer <= 0) {
      if (state.ripples.length < 6) state.ripples.push({ t: 0 });
      state.rippleTimer = 22 / (0.6 + pitch * 1.4);
    }
  }
  for (let i = state.ripples.length - 1; i >= 0; i--) {
    state.ripples[i].t += 0.016 * dt * (0.7 + pitch);
    if (state.ripples[i].t >= 1) state.ripples.splice(i, 1);
  }

  // アニメーション
  state.plugAnim.t = Math.min(1, state.plugAnim.t + dt * 0.055);
  state.plateAnim.t = Math.min(1, state.plateAnim.t + dt * 0.045);
  state.bowlTilt = approach(state.bowlTilt, state.bowlTiltTarget, 0.22, dt);
  state.knobPulse = Math.max(0, state.knobPulse - dt * 0.05);
  for (let i = 0; i < 3; i++) {
    state.rackPulse[i] = Math.max(0, state.rackPulse[i] - dt * 0.04);
    state.socketPulse[i] = Math.max(0, state.socketPulse[i] - dt * 0.03);
  }
  state.rubEnergy = Math.max(0, state.rubEnergy - dt * 0.05);

  // 場の再構築（モード／板／ソケットが変わったときだけ）
  rebuildField(state.plate, state.knob, state.socket);
  // モード・板・ソケットが変わったら模様を崩す（崩壊→再構成が見える）
  const bigKey = state.plate + '|' + state.socket + '|' + m.index;
  if (bigKey !== state.lastBigKey) {
    if (state.lastBigKey !== undefined && state.vib > 0.05) state.shock = 1;
    state.lastBigKey = bigKey;
  }
  state.shock = Math.max(0, state.shock - dt * 0.017);

  // 砂
  tickPour(L, dt);
  updateFlight(L, dt, state.plate);
  updateSand(dt, state.vib, state.plate, state.shock);

  // 収束判定
  if (state.vib > 0.2 && sand.onPlate > 120) {
    if (!state.converged && sand.meanAmp < 0.15 && state.shock < 0.08) {
      state.converged = true;
      state.glow = 1;
      state.sparkle = 1;
      chime();
    } else if (state.converged && sand.meanAmp > 0.24) {
      state.converged = false;
    }
  } else if (state.converged && (state.vib <= 0.2 || sand.onPlate <= 100)) {
    state.converged = false;
  }
  const glowTarget = state.converged ? 0.32 : 0;
  state.glow = approach(state.glow, glowTarget, 0.05, dt);

  // 次に触ってほしいものを決める（文字は出さない）
  let hint = null;
  if (sand.onPlate < 60) hint = 'bowl';
  else if (state.knob < 0.045) hint = 'knob';
  else if (!state.everRack) hint = 'rack';
  else if (!state.everSocket) hint = 'socket';
  state.hint = hint;
  state.hintPhase += dt * 0.045;
  const idleSec = (performance.now() - state.lastInteract) / 1000;
  state.idle = idleSec;
  state.idleBoost = 0.45 + 0.55 * smoothstep((idleSec - 10) / 2.5);

  // 音
  setDrone(state.vib, pitch);
}

let last = 0;
let running = true;

function frame(ts) {
  if (!running) return;
  if (!last) last = ts;
  let dt = (ts - last) / (1000 / 60);
  last = ts;
  if (!isFinite(dt) || dt < 0) dt = 1;
  dt = clamp(dt, 0.2, 3);
  update(dt);
  render(ctx, L, dpr);
  requestAnimationFrame(frame);
}

function boot() {
  resize();
  state.lastInteract = performance.now();
  state.idleBoost = 0.5;
  rebuildField(state.plate, state.knob, state.socket);
  installInput(canvas, getLayout);

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => { setTimeout(resize, 120); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { last = 0; });

  requestAnimationFrame(frame);
}

// テスト・デバッグ用の最小フック（ゲームの挙動には影響しない）
window.__lab = { state, sand, getLayout };

boot();
