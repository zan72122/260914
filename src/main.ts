import { Audio } from './core/audio';
import { DevPanel, type GameApi } from './core/dev';
import type { Episode, EpisodeCtx } from './core/episode';
import { Input, type PointerEvt } from './core/input';
import { episodes, findEpisode, Hub } from './core/hub';
import { Layout, type Orientation } from './core/layout';
import { Loop } from './core/loop';
import { PhaseMachine, PHASES, type PhaseName } from './core/phase';
import { Rng } from './core/rng';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const layout = new Layout(canvas);
const audio = new Audio();
const input = new Input(layout);
const phase = new PhaseMachine();

const url = new URLSearchParams(location.search);
let seed = Number(url.get('seed')) || ((Math.random() * 1e9) | 0);
let rng = new Rng(seed);

let mode: 'hub' | 'episode' = 'hub';
let current: Episode | null = null;

const hub = new Hub((id) => enterEpisode(id));

const ctx: EpisodeCtx = {
  rng,
  audio,
  phase,
  safe: layout.safe,
  exit: () => leaveEpisode(),
};

function enterEpisode(id: string): void {
  const ep = findEpisode(id);
  if (!ep) return;
  current = ep;
  mode = 'episode';
  rng = new Rng(seed);
  ctx.rng = rng;
  phase.bind((name) => ep.enterPhase(name));
  phase.set('establish');
  phase.total = 0;
  ep.layout(layout.orientation, layout.w, layout.h);
  ep.init(ctx);
  ep.layout(layout.orientation, layout.w, layout.h);
}

function leaveEpisode(): void {
  mode = 'hub';
  current = null;
  phase.bind(() => {});
  audio.stopAllBeds();
  hub.reset();
  hub.layout(layout.orientation, layout.w, layout.h, layout.safe);
}

layout.onResize((o: Orientation, w: number, h: number) => {
  ctx.safe = layout.safe;
  hub.layout(o, w, h, layout.safe);
  current?.layout(o, w, h);
});
hub.layout(layout.orientation, layout.w, layout.h, layout.safe);

// iOS hardening: no pinch/double-tap zoom, no long-press callout or selection.
for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener(
  'selectstart',
  (e) => {
    if (!inDevPanel(e.target)) e.preventDefault();
  },
  { passive: false },
);
/** the dev panel is real DOM and must stay scrollable/tappable */
const inDevPanel = (t: EventTarget | null): boolean =>
  t instanceof Node && !!(t instanceof Element ? t : t.parentElement)?.closest('.dvp, .tgl');
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    if (inDevPanel(e.target)) return;
    const now = performance.now();
    if (now - lastTouchEnd < 320) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);
document.addEventListener(
  'touchmove',
  (e) => {
    if (!inDevPanel(e.target)) e.preventDefault();
  },
  { passive: false },
);

// iOS only unlocks WebAudio inside a user gesture: try on the very first
// pointerdown, again on the touchend that follows it, and whenever the page
// comes back to the foreground (iOS suspends the context on background).
input.onFirstDown(() => audio.resume());
const unlockAudio = (): void => audio.resume();
window.addEventListener('pointerdown', unlockAudio, { passive: true });
window.addEventListener('touchend', unlockAudio, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) audio.resume();
});
input.bind((e: PointerEvt) => {
  if (mode === 'hub') hub.pointer(e);
  else current?.pointer(e);
});

const loop = new Loop(
  (dt) => {
    if (mode === 'hub') hub.update(dt);
    else current?.update(dt);
  },
  () => {
    const g = layout.begin();
    if (mode === 'hub') hub.render(g);
    else if (current) current.render(g);
    layout.end();
  },
);
loop.start();

// ------------------------------------------------------------------ dev API

const api: GameApi = {
  episodes: () => episodes.map((e) => ({ id: e.id, title: e.title })),
  phases: () => [...PHASES],
  gotoEpisode(id: string | null) {
    if (id === null) leaveEpisode();
    else enterEpisode(id);
  },
  gotoPhase(name: string) {
    if (!current) return;
    phase.goto(name as PhaseName);
  },
  runAction(name: string) {
    current?.devActions.find((a) => a.name === name)?.run();
  },
  actions(id?: string) {
    const ep = id ? findEpisode(id) : current;
    return ep?.devActions.map((a) => a.name) ?? [];
  },
  getState() {
    return {
      mode,
      episode: current?.id ?? null,
      phase: phase.name,
      seed,
      timeScale: loop.timeScale,
      paused: loop.paused,
      orientation: layout.orientation,
      viewport: { w: Math.round(layout.w), h: Math.round(layout.h) },
      muted: audio.muted,
      ...(current ? current.devState() : {}),
    };
  },
  setOrientation(o: string | null) {
    layout.setOrientation(o as Orientation | null);
  },
  setSeed(s: number) {
    seed = s >>> 0;
    const id = current?.id ?? null;
    if (id) enterEpisode(id);
  },
  restart() {
    const id = current?.id ?? null;
    if (id) enterEpisode(id);
    else hub.reset();
  },
  setTimeScale(s: number) {
    loop.timeScale = s;
  },
  setPaused(p: boolean) {
    loop.paused = p;
  },
  step(n = 1) {
    loop.stepOnce(n);
  },
  setMuted(m: boolean) {
    audio.setMuted(m);
  },
  /** run n simulation steps immediately — used by the screenshot script */
  settle(seconds: number) {
    const dt = 1 / 120;
    const steps = Math.min(4000, Math.round(seconds / dt));
    for (let i = 0; i < steps; i++) {
      if (mode === 'hub') hub.update(dt);
      else current?.update(dt);
    }
  },
};

declare global {
  interface Window {
    __game: GameApi;
  }
}
window.__game = api;

new DevPanel(api, url.get('dev') === '1', canvas);
