/**
 * Boot: Pixi application, viewport, input, audio, art, director.
 * Nothing on screen is ever text — see scripts/no-text-check.mjs and the e2e
 * suite, which both enforce that.
 */
import { Application, Container } from 'pixi.js';
import { Viewport } from './core/viewport';
import { InputManager } from './core/input';
import { Audio } from './core/audio';
import { buildKidSheet } from './art/kidSheet';
import { buildProps } from './art/props';
import { Director } from './core/director';
import { Backdrop } from './core/backdrop';
import { PAPER } from './art/palette';
import createGather from './scenes/01_gather';
import createMarch from './scenes/02_march';
import createTickle from './scenes/03_tickle';
import createBallpit from './scenes/04_ballpit';
import createButterfly from './scenes/05_butterfly';
import createSlide from './scenes/06_slide';
import createHide from './scenes/07_hide';
import createBalloon from './scenes/08_balloon';
import createTower from './scenes/09_tower';
import createSleep from './scenes/10_sleep';

async function boot(): Promise<void> {
  const host = document.getElementById('app') ?? document.body;

  const app = new Application();
  await app.init({
    background: PAPER,
    antialias: true,
    resizeTo: window,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    preference: 'webgl',
  });
  host.appendChild(app.canvas);

  const viewport = new Viewport(window.innerWidth, window.innerHeight);
  viewport.attach();

  // Paper first, then the world. The paper is in screen space so it never
  // moves with the camera; its tint crossfades between scenes.
  const backdrop = new Backdrop(PAPER);
  app.stage.addChild(backdrop.view);

  // The root is centred on the safe zone; scenes work in world coordinates.
  const root = new Container();
  app.stage.addChild(root);
  const applyLayout = () => {
    const l = viewport.layout;
    root.scale.set(l.scale);
    root.position.set(l.offsetX, l.offsetY);
    backdrop.resize(l.screenWidth, l.screenHeight);
  };
  viewport.onChange(applyLayout);
  applyLayout();
  app.renderer.on('resize', (w: number, h: number) => {
    viewport.set(w, h);
  });

  const audio = new Audio();
  const sheet = buildKidSheet();
  const props = buildProps();

  // The whole loop, in the order §4 of the plan lays out. After scene 10 the
  // director wraps back round to scene 1, building it from scratch: the game
  // resets completely and starts again, for as long as anyone is playing.
  const director = new Director(
    [
      createGather,
      createMarch,
      createTickle,
      createBallpit,
      createButterfly,
      createSlide,
      createHide,
      createBalloon,
      createTower,
      createSleep,
    ],
    { viewport, audio, sheet, props },
  );
  director.onSceneTint = (tint, seconds) => backdrop.fadeTo(tint, seconds);
  root.addChild(director.world);
  director.start();

  const input = new InputManager(viewport);
  input.onFirstDown(() => audio.unlock());
  input.onHand((ev) => director.onHand(ev));
  input.attach(app.canvas);

  app.ticker.add((ticker) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    input.update(dt);
    director.applyHands(input.hands.values(), dt);
    director.update(dt);
    backdrop.update(dt);
  });

  // Debug hooks for the e2e "zero text" checks and the scene tests.
  // Not visible, not interactive, and never used by the game itself.
  const countText = (node: Container): number => {
    let n = 0;
    // Any Pixi object that carries a `text` property is a Text/BitmapText.
    if ('text' in (node as unknown as Record<string, unknown>)) n++;
    for (const child of node.children) n += countText(child as Container);
    return n;
  };
  (window as unknown as { __kids: Record<string, unknown> }).__kids = {
    ready: true,
    app,
    textCount: () => countText(app.stage),
    kidCount: () => director.current?.debugKidCount() ?? 0,
    sceneName: () => director.current?.name ?? '',
    sceneIndex: () => director.sceneIndex,
    sceneProgress: () => director.current?.progress() ?? 0,
    scenePhase: () => {
      const s = director.current as { debugPhase?: () => string } | null;
      return s?.debugPhase?.() ?? '';
    },
    panning: () => director.panning,
    autoFired: () => director.autoAdvanceFired,
    advanceScene: () => director.advanceScene(),
    gotoScene: (index: number) => director.jumpTo(index),
    sceneCount: () => 10,
    finishScene: () => director.current?.finishNow(),
    idleHint: () => director.current?.onIdleHint(),
    autoAdvance: () => director.current?.onAutoAdvance(),
    fps: () => app.ticker.FPS,
    // Debug/e2e only: the procedural kid atlas, for eyeballing new poses.
    atlas: () => sheet.canvas.toDataURL(),
  };
}

void boot();
