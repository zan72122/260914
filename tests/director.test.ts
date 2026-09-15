import { describe, expect, it } from 'vitest';
import { AUTO_ADVANCE_AFTER, Director, IDLE_HINT_MAX, PAN_SEC, PAN_STEP } from '../src/core/director';
import { Scene } from '../src/core/scene';
import type { SceneContext } from '../src/core/scene';
import { Viewport } from '../src/core/viewport';
import { Audio } from '../src/core/audio';
import type { KidSheet } from '../src/art/kidSheet';
import type { PropTextures } from '../src/art/props';
import type { HandEvent } from '../src/core/input';
import { SCENE_ORDER } from '../src/scenes/order';
import { SCENE_TINTS } from '../src/art/palette';

/** A scene that is done when told to be, and records what happened to it. */
class StubScene extends Scene {
  done = false;
  entered = 0;
  exited = 0;
  updates = 0;
  hints = 0;
  autos = 0;
  hands = 0;
  handX = 0;

  constructor(
    override readonly name: string,
    override readonly tint: number,
  ) {
    super();
  }

  override enter(ctx: SceneContext): void {
    super.enter(ctx);
    this.entered++;
  }
  override update(dt: number): void {
    super.update(dt);
    this.updates++;
  }
  override onHand(ev: HandEvent): void {
    this.hands++;
    this.handX = ev.hand.x;
  }
  override onIdleHint(): void {
    this.hints++;
  }
  override onAutoAdvance(): void {
    this.autos++;
  }
  override finishNow(): void {
    this.done = true;
  }
  override isDone(): boolean {
    return this.done;
  }
  override exit(): void {
    this.exited++;
  }
}

function makeDirector(names: string[]) {
  const made: StubScene[] = [];
  const factories = names.map((n, i) => () => {
    const s = new StubScene(n, 0x100000 + i);
    made.push(s);
    return s;
  });
  const tints: number[] = [];
  const director = new Director(factories, {
    viewport: new Viewport(1000, 1000),
    audio: new Audio(),
    sheet: {} as KidSheet,
    props: {} as PropTextures,
  });
  director.onSceneTint = (t) => tints.push(t);
  return { director, made, tints };
}

/** Runs `seconds` of frames at 60fps. */
function run(director: Director, seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) director.update(1 / 60);
}

describe('director sequencing', () => {
  it('starts on the first scene', () => {
    const { director, made } = makeDirector(['a', 'b']);
    director.start();
    expect(director.current?.name).toBe('a');
    expect(made[0].entered).toBe(1);
    expect(director.sceneIndex).toBe(0);
  });

  it('advances to the next scene when the current one is done', () => {
    const { director, made } = makeDirector(['a', 'b']);
    director.start();
    made[0].done = true;
    director.update(1 / 60);
    expect(director.current?.name).toBe('b');
    expect(director.panning).toBe(true);
    // The outgoing scene stays alive and visible for the whole pan: seamless.
    expect(made[0].exited).toBe(0);
    expect(director.outgoing?.name).toBe('a');
  });

  it('pans the camera one scene-width and then retires the old scene', () => {
    const { director, made } = makeDirector(['a', 'b']);
    director.start();
    const from = director.camera.x;
    made[0].done = true;
    director.update(1 / 60);
    run(director, PAN_SEC + 0.2);
    expect(director.panning).toBe(false);
    expect(director.camera.x).toBeCloseTo(from + PAN_STEP, 3);
    expect(made[0].exited).toBe(1);
    expect(director.outgoing).toBe(null);
  });

  it('wraps around from the last scene back to the first', () => {
    const { director, made } = makeDirector(['a', 'b']);
    director.start();
    for (let s = 0; s < 3; s++) {
      (director.current as StubScene).done = true;
      director.update(1 / 60);
      run(director, PAN_SEC + 0.2);
    }
    expect(director.current?.name).toBe('b'); // a -> b -> a -> b
    expect(director.sceneIndex).toBe(1);
    // Four scene instances were created in total, three of them retired.
    expect(made.length).toBe(4);
    expect(made.filter((s) => s.exited === 1).length).toBe(3);
  });

  it('keeps moving the camera right forever, so scenes never overlap', () => {
    const { director } = makeDirector(['a', 'b']);
    director.start();
    const seen: number[] = [director.camera.x];
    for (let s = 0; s < 4; s++) {
      (director.current as StubScene).done = true;
      director.update(1 / 60);
      run(director, PAN_SEC + 0.2);
      seen.push(director.camera.x);
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i] - seen[i - 1]).toBeCloseTo(PAN_STEP, 3);
    }
  });

  it('announces each scene tint so the paper can crossfade', () => {
    const { director, tints } = makeDirector(['a', 'b']);
    director.start();
    expect(tints).toEqual([0x100000]);
    (director.current as StubScene).done = true;
    director.update(1 / 60);
    expect(tints).toEqual([0x100000, 0x100001]);
  });

  it('exposes an explicit advance hook for the e2e tests', () => {
    const { director } = makeDirector(['a', 'b']);
    director.start();
    director.advanceScene();
    expect(director.current?.name).toBe('b');
  });
});

describe('director safety nets', () => {
  it('hints once after the idle window and then auto-advances', () => {
    const { director, made } = makeDirector(['a', 'b']);
    director.start();
    run(director, IDLE_HINT_MAX + 0.5);
    expect(made[0].hints).toBe(1);
    expect(made[0].autos).toBe(0);
    run(director, AUTO_ADVANCE_AFTER);
    expect(made[0].hints).toBe(1);
    expect(made[0].autos).toBe(1);
  });

  it('resets the idle timers on every touch', () => {
    const { director, made } = makeDirector(['a', 'b']);
    director.start();
    for (let i = 0; i < 20; i++) {
      run(director, 1);
      director.onHand({
        phase: 'move',
        isTap: false,
        hand: { x: 0, y: 0 } as never,
      });
    }
    expect(made[0].hints).toBe(0);
  });

  it('routes a touch into scene-local coordinates while panning', () => {
    const { director, made } = makeDirector(['a', 'b']);
    director.start();
    made[0].done = true;
    director.update(1 / 60);
    // Half way through the pan the camera sits between the two scene origins.
    run(director, PAN_SEC / 2);
    const worldX = director.camera.x + 100;
    director.onHand({
      phase: 'down',
      isTap: false,
      hand: { x: worldX, y: 0, radius: 160 } as never,
    });
    // Both scenes heard about it, each in its own local space; the incoming
    // scene sits one PAN_STEP further right, so its local x is that much less
    // and both map back to the very same point on screen.
    expect(made[0].hands).toBe(1);
    expect(made[1].hands).toBe(1);
    expect(made[1].handX + PAN_STEP).toBeCloseTo(made[0].handX, 6);
  });
});

describe('the whole loop', () => {
  it('runs the ten scenes of §4 in order and wraps back to the first', () => {
    const { director, made } = makeDirector([...SCENE_ORDER]);
    director.start();
    const visited: string[] = [director.current!.name];
    // Ten scenes finished in a row: the tenth wraps round to the first.
    for (let i = 0; i < SCENE_ORDER.length; i++) {
      (director.current as StubScene).done = true;
      director.update(1 / 60);
      run(director, PAN_SEC + 0.2);
      visited.push(director.current!.name);
    }
    expect(visited).toEqual([...SCENE_ORDER, SCENE_ORDER[0]]);
    expect(director.sceneIndex).toBe(0);
    // Eleven scene objects were built; the ten that were left behind are gone.
    expect(made.length).toBe(SCENE_ORDER.length + 1);
    expect(made.filter((s) => s.exited === 1).length).toBe(SCENE_ORDER.length);
    // The wrapped-to scene 1 is a brand new object: a complete reset (§10.3).
    expect(made[SCENE_ORDER.length]).not.toBe(made[0]);
    expect(made[SCENE_ORDER.length].entered).toBe(1);
  });

  it('is the order the plan asks for, and every scene has its own paper', () => {
    expect(SCENE_ORDER).toEqual([
      'gather',
      'march',
      'tickle',
      'ballpit',
      'butterfly',
      'slide',
      'hide',
      'balloon',
      'tower',
      'sleep',
    ]);
    expect(SCENE_TINTS.length).toBe(SCENE_ORDER.length);
    expect(new Set(SCENE_TINTS).size).toBeGreaterThan(SCENE_ORDER.length - 2);
  });

  it('gives every one of the ten its idle hint and its rescue', () => {
    const { director, made } = makeDirector([...SCENE_ORDER]);
    director.start();
    for (let i = 0; i < SCENE_ORDER.length; i++) {
      // Nobody touches anything for a full minute.
      run(director, AUTO_ADVANCE_AFTER + 1);
      expect(made[i].hints).toBe(1);
      expect(made[i].autos).toBe(1);
      (director.current as StubScene).done = true;
      director.update(1 / 60);
      run(director, PAN_SEC + 0.2);
    }
  });

  it('never shows an empty screen: the camera step matches the pan', () => {
    const { director } = makeDirector([...SCENE_ORDER]);
    director.start();
    let x = director.camera.x;
    for (let i = 0; i < SCENE_ORDER.length; i++) {
      (director.current as StubScene).done = true;
      director.update(1 / 60);
      // Mid-pan, both scenes are alive and the camera is between them.
      run(director, PAN_SEC / 2);
      expect(director.outgoing).not.toBe(null);
      expect(director.camera.x).toBeGreaterThan(x);
      expect(director.camera.x).toBeLessThan(x + PAN_STEP);
      run(director, PAN_SEC / 2 + 0.2);
      x = director.camera.x;
    }
  });
});
