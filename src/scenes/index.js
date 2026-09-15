import { IntroScene } from './intro.js';
import { KitchenScene } from './kitchen.js';

/**
 * Ordered scene registry. Later agents append one line per scene here and add
 * their file under src/scenes/ — nothing in src/core or src/vacuum changes.
 */
export const SCENES = [
  { id: 'intro', make: (rng) => new IntroScene(rng) },
  { id: 'kitchen', make: (rng) => new KitchenScene(rng) },
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
