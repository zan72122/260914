import { HallScene } from './hall.js';
import { IntroScene } from './intro.js';
import { KitchenScene } from './kitchen.js';
import { PaperScene } from './paper.js';
import { SandScene } from './sand.js';
import { ToyScene } from './toy.js';
import { SofaScene } from './sofa.js';
import { ThreadScene } from './thread.js';
import { CarpetScene } from './carpet.js';
import { PantryScene } from './pantry.js';
import { VerandaScene } from './veranda.js';
import { StairsScene } from './stairs.js';
import { WindowScene } from './window.js';
import { BedroomScene } from './bedroom.js';

/**
 * Scene registry — the ONLY core file a new scene touches.
 *
 * `hall` is the hub: every room's door lives there, and every room hands back
 * to it. The ROOM order below is the order the doors appear along the hallway
 * (see `DOOR_IDS` in `src/scenes/hall.js`, which is the authority), not a
 * chain — the child plays them in whatever order they like.
 *
 * `?chain=1` still walks the old linear ring for the harness:
 *   intro -> kitchen -> paper -> toy -> thread -> sand -> sofa -> carpet -> intro
 * which is what `CHAIN_NEXT` below is for.
 *
 * All thirteen rooms are written; the placeholder scene that used to stand in
 * for an unwritten one is gone, and with it `isStub()`. Adding a room is still
 * one import and one line here, and nothing else in the core.
 */
export const SCENES = [
  { id: 'hall', make: (rng) => new HallScene(rng) },
  { id: 'intro', make: (rng) => new IntroScene(rng) },
  { id: 'kitchen', make: (rng) => new KitchenScene(rng) },
  { id: 'paper', make: (rng) => new PaperScene(rng) },
  { id: 'toy', make: (rng) => new ToyScene(rng) },
  { id: 'thread', make: (rng) => new ThreadScene(rng) },
  { id: 'sand', make: (rng) => new SandScene(rng) },
  { id: 'sofa', make: (rng) => new SofaScene(rng) },
  { id: 'carpet', make: (rng) => new CarpetScene(rng) },
  { id: 'pantry', make: (rng) => new PantryScene(rng) },
  { id: 'stairs', make: (rng) => new StairsScene(rng) },
  { id: 'window', make: (rng) => new WindowScene(rng) },
  { id: 'veranda', make: (rng) => new VerandaScene(rng) },
  { id: 'bedroom', make: (rng) => new BedroomScene(rng) },
];

/** The historical linear ring, kept for `?chain=1`. */
export const CHAIN = ['intro', 'kitchen', 'paper', 'toy', 'thread', 'sand', 'sofa', 'carpet'];

export function sceneIds() { return SCENES.map((s) => s.id); }
export function roomIds() { return SCENES.filter((s) => s.id !== 'hall').map((s) => s.id); }
export function findScene(id) { return SCENES.find((s) => s.id === id) || null; }
export function nextSceneId(id) {
  const i = CHAIN.indexOf(id);
  return i >= 0 ? CHAIN[(i + 1) % CHAIN.length] : CHAIN[0];
}
export function makeScene(id, rng) {
  const e = findScene(id) || SCENES[0];
  return e.make(rng);
}
