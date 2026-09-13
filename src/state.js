// 進行状態。純粋なデータ + イベント発火。
const listeners = new Map();

export const state = {
  phase: 'closed', // closed -> opened -> ... -> complete
  opened: false,
  sprouted: [false, false, false],
  sunny: false,
  bloomed: [false, false, false],
  butterflies: [false, false, false],
  complete: false,
  daytime: 'day', // day | sunset | night
};

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, []);
  listeners.get(event).push(fn);
}

export function emit(event, payload) {
  (listeners.get(event) || []).forEach((fn) => fn(payload));
  (listeners.get('*') || []).forEach((fn) => fn(event, payload));
}

export const count = (arr) => arr.filter(Boolean).length;

export function setOpened() {
  if (state.opened) return;
  state.opened = true;
  state.phase = 'opened';
  emit('opened');
}

export function setSprouted(i) {
  if (state.sprouted[i]) return;
  state.sprouted[i] = true;
  emit('sprout', i);
  if (count(state.sprouted) === 3) {
    state.phase = 'sprouted';
    emit('sproutedAll');
  }
}

export function setSunny() {
  if (state.sunny) return;
  state.sunny = true;
  state.phase = 'sunny';
  emit('sunny');
}

export function setBloomed(i) {
  if (state.bloomed[i]) return;
  state.bloomed[i] = true;
  emit('bloom', i);
  if (count(state.bloomed) === 3) {
    state.phase = 'bloomed';
    emit('bloomedAll');
  }
}

export function setButterfly(i) {
  if (state.butterflies[i]) return;
  state.butterflies[i] = true;
  emit('butterfly', i);
}

export function setComplete() {
  if (state.complete) return;
  state.complete = true;
  state.phase = 'complete';
  emit('complete');
}

export function setDaytime(d) {
  state.daytime = d;
  emit('daytime', d);
}

// 「今、世界が次に招いている行動」。ヒント演出はこれを見る。
export function nextTarget() {
  if (!state.opened) return 'lid';
  if (count(state.sprouted) < 3) return 'can';
  if (!state.sunny) return 'string';
  if (count(state.bloomed) < 3) return 'bud';
  if (count(state.butterflies) < 3) return 'cocoon';
  return null;
}
