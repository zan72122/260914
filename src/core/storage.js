/**
 * storage.js — progress persistence (DESIGN §5.5.6).
 * Never throws: falls back to an in-memory store in private mode.
 *
 * @typedef {Object} Progress
 * @property {Object<string, number>} plays          elementId -> completed count
 * @property {boolean} spectroscopeUnlocked
 * @property {Object<string, boolean>} spectraSeen   elementId -> seen in spectroscope
 * @property {boolean} muted
 * @property {number} version
 */

import { ELEMENT_IDS } from './palette.js';

export const STORAGE_KEY = 'flametest.progress.v1';
const VERSION = 1;

let memory = null; // in-memory fallback value (string)
let useMemory = false;

function rawGet() {
  if (useMemory) return memory;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v;
  } catch (e) {
    useMemory = true;
    return memory;
  }
}

function rawSet(str) {
  memory = str;
  if (useMemory) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, str);
  } catch (e) {
    useMemory = true;
  }
}

/** @returns {Progress} */
export function defaultProgress() {
  const plays = {};
  const spectraSeen = {};
  for (const id of ELEMENT_IDS) { plays[id] = 0; spectraSeen[id] = false; }
  return { plays, spectraSeen, spectroscopeUnlocked: false, muted: false, version: VERSION };
}

/** @returns {Progress} */
export function loadProgress() {
  const base = defaultProgress();
  const raw = rawGet();
  if (!raw) return base;
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
  if (!parsed || typeof parsed !== 'object') return base;
  if (parsed.plays && typeof parsed.plays === 'object') {
    for (const id of ELEMENT_IDS) {
      const n = Number(parsed.plays[id]);
      base.plays[id] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    }
  }
  if (parsed.spectraSeen && typeof parsed.spectraSeen === 'object') {
    for (const id of ELEMENT_IDS) base.spectraSeen[id] = !!parsed.spectraSeen[id];
  }
  base.muted = !!parsed.muted;
  base.spectroscopeUnlocked = !!parsed.spectroscopeUnlocked || unlockCheck(base);
  return base;
}

function unlockCheck(p) {
  return (p.plays.lithium || 0) > 0 && (p.plays.strontium || 0) > 0;
}

/** @param {Progress} p */
export function saveProgress(p) {
  if (!p) return;
  p.version = VERSION;
  p.spectroscopeUnlocked = p.spectroscopeUnlocked || unlockCheck(p);
  try { rawSet(JSON.stringify(p)); } catch (e) { /* ignore */ }
}

/**
 * plays++ and spectroscope unlock check, atomically.
 * @param {string} elementId
 * @returns {Progress}
 */
export function markWorldDone(elementId) {
  const p = loadProgress();
  if (elementId && Object.prototype.hasOwnProperty.call(p.plays, elementId)) {
    p.plays[elementId] = (p.plays[elementId] || 0) + 1;
  }
  p.spectroscopeUnlocked = p.spectroscopeUnlocked || unlockCheck(p);
  saveProgress(p);
  return p;
}

/** @param {string} elementId */
export function markSpectrumSeen(elementId) {
  const p = loadProgress();
  if (elementId && Object.prototype.hasOwnProperty.call(p.spectraSeen, elementId)) {
    p.spectraSeen[elementId] = true;
  }
  saveProgress(p);
  return p;
}

export function resetProgress() {
  const p = defaultProgress();
  saveProgress(p);
  return p;
}

/**
 * Shallow-merge a partial Progress (used by window.__game.setProgress for tests).
 * @param {Partial<Progress>} partial
 */
export function patchProgress(partial) {
  const p = loadProgress();
  if (partial && typeof partial === 'object') {
    if (partial.plays) Object.assign(p.plays, partial.plays);
    if (partial.spectraSeen) Object.assign(p.spectraSeen, partial.spectraSeen);
    if ('muted' in partial) p.muted = !!partial.muted;
    if ('spectroscopeUnlocked' in partial) p.spectroscopeUnlocked = !!partial.spectroscopeUnlocked;
  }
  saveProgress(p);
  return p;
}
