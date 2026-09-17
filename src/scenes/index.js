import { HallScene } from './hall.js';
import { IntroScene } from './intro.js';
import { KitchenScene } from './kitchen.js';
import { PaperScene } from './paper.js';
import { SandScene } from './sand.js';
import { ToyScene } from './toy.js';
import { SofaScene } from './sofa.js';
import { ThreadScene } from './thread.js';
import { CarpetScene } from './carpet.js';
import { StubScene } from './stub.js';

/**
 * Scene registry.
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
 * A Phase B agent replaces exactly ONE line: their `StubScene` entry becomes
 * `new <Their>Scene(rng)`, plus the import.
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
  { id: 'pantry', make: (rng) => new StubScene('pantry', rng), stub: true },
  { id: 'stairs', make: (rng) => new StubScene('stairs', rng), stub: true },
  { id: 'window', make: (rng) => new StubScene('window', rng), stub: true },
  { id: 'veranda', make: (rng) => new StubScene('veranda', rng), stub: true },
  { id: 'bedroom', make: (rng) => new StubScene('bedroom', rng), stub: true },
];

/** The historical linear ring, kept for `?chain=1`. */
export const CHAIN = ['intro', 'kitchen', 'paper', 'toy', 'thread', 'sand', 'sofa', 'carpet'];

export function sceneIds() { return SCENES.map((s) => s.id); }
export function roomIds() { return SCENES.filter((s) => s.id !== 'hall').map((s) => s.id); }
export function isStub(id) { const e = findScene(id); return !!(e && e.stub); }
export function findScene(id) { return SCENES.find((s) => s.id === id) || null; }
export function nextSceneId(id) {
  const i = CHAIN.indexOf(id);
  return i >= 0 ? CHAIN[(i + 1) % CHAIN.length] : CHAIN[0];
}
export function makeScene(id, rng) {
  const e = findScene(id) || SCENES[0];
  return e.make(rng);
}
