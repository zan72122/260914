/**
 * Boot: Pixi application, viewport, input, audio, spritesheet, director.
 * Nothing on screen is ever text — see scripts/no-text-check.mjs and the e2e
 * suite, which both enforce that.
 */
import { Application, Container } from 'pixi.js';
import { Viewport } from './core/viewport';
import { InputManager } from './core/input';
import { Audio } from './core/audio';
import { buildKidSheet } from './art/kidSheet';
import { Director } from './core/director';
import { PAPER } from './art/palette';
import createPlayground, { PlaygroundScene } from './scenes/00_playground';

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

  // The root is centred on the safe zone; scenes work in world coordinates.
  const root = new Container();
  app.stage.addChild(root);
  const applyLayout = () => {
    const l = viewport.layout;
    root.scale.set(l.scale);
    root.position.set(l.offsetX, l.offsetY);
  };
  viewport.onChange(applyLayout);
  applyLayout();
  app.renderer.on('resize', (w: number, h: number) => {
    viewport.set(w, h);
  });

  const audio = new Audio();
  const sheet = buildKidSheet();

  const director = new Director([createPlayground], { viewport, audio, sheet });
  root.addChild(director.world);
  director.start();

  const input = new InputManager(viewport);
  input.onFirstDown(() => audio.unlock());
  input.onHand((ev) => director.onHand(ev));
  input.attach(app.canvas);

  app.ticker.add((ticker) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    input.update(dt);
    const scene = director.current;
    if (scene instanceof PlaygroundScene) scene.applyHands(input.hands.values(), dt);
    director.update(dt);
  });

  // Debug hooks for the e2e "zero text" checks. Not visible, not interactive.
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
    kidCount: () =>
      director.current instanceof PlaygroundScene ? director.current.debugKidCount() : 0,
    fps: () => app.ticker.FPS,
  };
}

void boot();
