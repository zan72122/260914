import { IntroScene } from './intro.js';
import { KitchenScene } from './kitchen.js';
import { PaperScene } from './paper.js';
import { SandScene } from './sand.js';
import { ToyScene } from './toy.js';
import { SofaScene } from './sofa.js';
import { ThreadScene } from './thread.js';
import { CarpetScene } from './carpet.js';

/**
 * Ordered scene registry. Later agents append one line per scene here and add
 * their file under src/scenes/ — nothing in src/core or src/vacuum changes.
 */
export const SCENES = [
  { id: 'intro', make: (rng) => new IntroScene(rng) },
  { id: 'kitchen', make: (rng) => new KitchenScene(rng) },
  { id: 'paper', make: (rng) => new PaperScene(rng) },
  { id: 'sand', make: (rng) => new SandScene(rng) },
  { id: 'toy', make: (rng) => new ToyScene(rng) },
  { id: 'sofa', make: (rng) => new SofaScene(rng) },
  { id: 'thread', make: (rng) => new ThreadScene(rng) },
  { id: 'carpet', make: (rng) => new CarpetScene(rng) },
];

export function sceneIds() { return SCENES.map((s) => s.id); }
export function findScene(id) { return SCENES.find((s) => s.id === id) || null; }
export function nextSceneId(id) {
  const i = SCENES.findIndex((s) => s.id === id);
  return i >= 0 && i + 1 < SCENES.length ? SCENES[i + 1].id : null;
}
export function makeScene(id, rng) {
  const e = findScene(id) || SCENES[0];
  return e.make(rng);
}
