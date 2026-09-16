/**
 * A. 洗濯物 — laundry.
 *
 * Sunny balcony. Hang the washing. A cloud arrives. One drop. Then rain.
 * Carry the washing inside and the sky forgives you immediately — which is
 * the joke. Leave it out and it drinks the whole sky, and pouring it out
 * later is its own small pleasure.
 *
 * Per-episode code is deliberately specific: no generic engines here.
 */
import type { DevAction, Episode, EpisodeCtx } from '../core/episode';
import type { PointerEvt } from '../core/input';
import type { Orientation } from '../core/layout';
import type { PhaseName } from '../core/phase';
import { makeNoise1d, Rng } from '../core/rng';

// ---------------------------------------------------------------- helpers

type RGB = [number, number, number];

const rgb = (c: RGB, a = 1): string =>
  a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** darker, cooler, slightly more saturated: what water does to cloth */
const wetOf = (c: RGB): RGB => [c[0] * 0.4, c[1] * 0.44, c[2] * 0.54 + 12];

// ---------------------------------------------------------------- cloth

interface Node {
  x: number;
  y: number;
  px: number;
  py: number;
}

interface Limb {
  attach: number; // spine node index
  side: number; // -1 left, +1 right
  spread: number; // lateral offset in half-widths
  nodes: Node[];
  rest: number;
  width: number;
}

type GState = 'basket' | 'held' | 'hung' | 'loose' | 'inside';
type Kind = 'shirt' | 'pants' | 'sock' | 'towel';

interface Garment {
  kind: Kind;
  base: RGB;
  accent: RGB;
  /** spine node 0 is the pivot (where it hangs / where the finger holds it) */
  spine: Node[];
  rest: number; // segment rest length
  limbs: Limb[];
  halfW: number;
  state: GState;
  /** parametric spot on the line while hung */
  u: number;
  /** slot in the basket / in the indoor pile */
  slot: number;
  wet: number; // 0..1 global soak
  front: number; // 0..1 how far the wet front has crept down
  spots: Array<{ t: number; u: number; r: number; grow: number }>;
  dripT: number;
  gush: number; // seconds of pouring left
  grabDX: number;
  grabDY: number;
  settle: number; // landing wobble impulse
  restedT: number;
}

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  layer: number;
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  kind: 0 | 1; // 0 splash, 1 heavy water
}

interface Ripple {
  x: number;
  y: number;
  r: number;
  life: number;
}

interface Puddle {
  x: number;
  w: number;
  a: number;
}

interface Geo {
  w: number;
  h: number;
  o: Orientation;
  sun: { x: number; y: number };
  cloudY: number;
  cloudR: number;
  skylineY: number;
  railY: number;
  floorY: number;
  lineA: { x: number; y: number };
  lineB: { x: number; y: number };
  poleX: number;
  poleTop: number;
  poleBase: number;
  door: { x: number; y: number; w: number; h: number };
  basket: { x: number; y: number; rx: number; ry: number };
  slots: number[];
  /** which end of the line the door is on */
  doorSide: -1 | 1;
}

const KINDS: Array<{ kind: Kind; base: RGB; accent: RGB; len: number; halfW: number }> = [
  { kind: 'shirt', base: [246, 248, 252], accent: [122, 170, 214], len: 1.0, halfW: 0.46 },
  { kind: 'pants', base: [86, 116, 170], accent: [58, 84, 130], len: 1.16, halfW: 0.4 },
  { kind: 'towel', base: [246, 168, 96], accent: [255, 214, 150], len: 0.98, halfW: 0.52 },
  { kind: 'sock', base: [236, 96, 112], accent: [255, 236, 240], len: 0.66, halfW: 0.19 },
];

// ---------------------------------------------------------------- episode

class Laundry implements Episode {
  readonly id = 'laundry';
  readonly title = 'A. 洗濯物 / laundry';

  private ctx!: EpisodeCtx;
  private rng = new Rng(1);
  private noise = makeNoise1d(1);
  private geo!: Geo;

  private garments: Garment[] = [];
  private drops: Drop[] = [];
  private bits: Bit[] = [];
  private ripples: Ripple[] = [];
  private puddles: Puddle[] = [];
  private cloudSeeds: Array<{ x: number; y: number; r: number }> = [];

  // environment
  private t = 0;
  private cloud = -0.45; // progress across the sky, -0.45 .. 1.45
  private cloudTarget = -0.45;
  private cloudDark = 0;
  private dim = 0; // 0 sunny, 1 overcast
  private dimTarget = 0;
  private wind = 0.12;
  private windTarget = 0.12;
  private gust = 0;
  private rain = 0;
  private rainTarget = 0;
  private beam = 0;
  private beamTarget = 0;
  private soakClock = 0;

  // beats
  private ending: 'none' | 'saved' | 'soaked' = 'none';
  private quiet = 0;
  private dropBeats: number[] = [];
  private dropBeatI = 0;
  private firstDropDone = false;
  private comicT = 0;
  private fade = 0;
  private fadeOut = false;
  private lastRescueAt = -99;
  private rainStopArmed = false;

  // camera
  private camZ = 1;
  private camZT = 1;
  private camY = 0;
  private camYT = 0;
  private shake = 0;

  // character
  private chBlink = 0;
  private chBlinkT = 2;

  private held: Garment | null = null;
  private pointerX = 0;
  private pointerY = 0;

  // ---------------------------------------------------------------- setup

  init(ctx: EpisodeCtx): void {
    this.ctx = ctx;
    this.rng = ctx.rng;
    this.rng.reset();
    this.noise = makeNoise1d(this.rng.seed ^ 0x9e37);
    this.t = 0;
    this.fade = 1;
    this.fadeOut = false;
    this.drops = [];
    this.bits = [];
    this.ripples = [];
    this.held = null;
    this.cloudSeeds = [];
    for (let i = 0; i < 11; i++) {
      const f = i / 10;
      this.cloudSeeds.push({
        x: -1 + f * 2 + this.rng.range(-0.12, 0.12),
        y: this.rng.range(-0.3, 0.12) * (1 - Math.abs(f - 0.5)) * 1.6,
        r: (0.42 + 0.58 * Math.sin(Math.PI * f) ** 0.7) * this.rng.range(0.82, 1.06),
      });
    }
    this.buildGarments();
    if (this.geo) this.resetPuddles();
    this.enterPhase('establish');
  }

  private buildGarments(): void {
    this.garments = [];
    for (let i = 0; i < KINDS.length; i++) {
      const k = KINDS[i];
      const g: Garment = {
        kind: k.kind,
        base: [...k.base] as RGB,
        accent: [...k.accent] as RGB,
        spine: [],
        rest: 10,
        limbs: [],
        halfW: 10,
        state: 'basket',
        u: 0,
        slot: i,
        wet: 0,
        front: 0,
        spots: [],
        dripT: this.rng.range(0, 0.4),
        gush: 0,
        grabDX: 0,
        grabDY: 0,
        settle: 0,
        restedT: 0,
      };
      this.garments.push(g);
    }
    if (this.geo) this.sizeGarments();
  }

  private sizeGarments(): void {
    const unit = Math.min(this.geo.w, this.geo.h) * 0.215;
    for (let i = 0; i < this.garments.length; i++) {
      const g = this.garments[i];
      const k = KINDS[i];
      const len = unit * k.len;
      g.halfW = unit * k.halfW;
      const n = 4;
      g.rest = len / (n - 1);
      if (g.spine.length !== n) {
        g.spine = [];
        for (let j = 0; j < n; j++) g.spine.push({ x: 0, y: 0, px: 0, py: 0 });
      }
      g.limbs = [];
      if (g.kind === 'shirt') {
        for (const side of [-1, 1] as const) {
          g.limbs.push({
            attach: 0,
            side,
            spread: 0.86,
            rest: len * 0.19,
            width: g.halfW * 0.33,
            nodes: [0, 1, 2].map(() => ({ x: 0, y: 0, px: 0, py: 0 })),
          });
        }
      } else if (g.kind === 'pants') {
        g.limbs.push({
          attach: 0,
          side: 1,
          spread: 1.45,
          rest: g.rest,
          width: g.halfW,
          nodes: [0, 1, 2, 3].map(() => ({ x: 0, y: 0, px: 0, py: 0 })),
        });
      }
    }
  }

  layout(o: Orientation, w: number, h: number): void {
    const prev = this.geo;
    const g: Geo = {
      w,
      h,
      o,
      sun: { x: 0, y: 0 },
      cloudY: 0,
      cloudR: 0,
      skylineY: 0,
      railY: 0,
      floorY: 0,
      lineA: { x: 0, y: 0 },
      lineB: { x: 0, y: 0 },
      poleX: 0,
      poleTop: 0,
      poleBase: 0,
      door: { x: 0, y: 0, w: 0, h: 0 },
      basket: { x: 0, y: 0, rx: 0, ry: 0 },
      slots: [0.3, 0.5, 0.7, 0.9],
      doorSide: -1,
    };

    if (o === 'portrait') {
      // danger above, hero in the middle, shelter below-left, basket below-right
      g.sun = { x: w * 0.78, y: h * 0.115 };
      g.cloudY = h * 0.145;
      g.cloudR = w * 0.235;
      g.skylineY = h * 0.575;
      g.railY = h * 0.625;
      g.floorY = h * 0.7;
      g.lineA = { x: w * 0.03, y: h * 0.455 };
      g.lineB = { x: w * 0.93, y: h * 0.435 };
      g.poleX = w * 0.93;
      g.poleTop = h * 0.415;
      g.poleBase = h * 0.735;
      g.door = { x: w * 0.02, y: h * 0.595, w: w * 0.42, h: h * 0.375 };
      g.basket = { x: w * 0.71, y: h * 0.815, rx: w * 0.17, ry: h * 0.045 };
      g.slots = [0.31, 0.52, 0.72, 0.92];
      g.doorSide = -1;
    } else {
      // danger upper-left, hero across the middle, shelter right
      g.sun = { x: w * 0.13, y: h * 0.15 };
      g.cloudY = h * 0.17;
      g.cloudR = w * 0.125;
      g.skylineY = h * 0.55;
      g.railY = h * 0.6;
      g.floorY = h * 0.665;
      g.lineA = { x: w * 0.045, y: h * 0.295 };
      g.lineB = { x: w * 0.645, y: h * 0.265 };
      g.poleX = w * 0.045;
      g.poleTop = h * 0.255;
      g.poleBase = h * 0.72;
      g.door = { x: w * 0.645, y: h * 0.185, w: w * 0.345, h: h * 0.765 };
      g.basket = { x: w * 0.215, y: h * 0.815, rx: w * 0.1, ry: h * 0.085 };
      g.slots = [0.1, 0.34, 0.58, 0.82];
      g.doorSide = 1;
    }

    this.geo = g;
    this.sizeGarments();
    this.resetPuddles();
    // keep relative placement across a rotation
    for (const gm of this.garments) {
      if (gm.state === 'hung') this.pinToLine(gm, true);
      else if (gm.state === 'basket' || gm.state === 'loose') this.placeInBasket(gm, gm.state === 'loose');
      else if (gm.state === 'inside') this.placeInside(gm);
      else if (gm.state === 'held' && prev) this.resetSpine(gm, this.pointerX, this.pointerY);
    }
  }

  private resetPuddles(): void {
    const w = this.geo.w;
    this.puddles = [];
    const n = 5;
    for (let i = 0; i < n; i++) {
      this.puddles.push({
        x: w * (0.08 + 0.84 * ((i + 0.35) / n)) + this.rng.range(-w * 0.04, w * 0.04),
        w: w * this.rng.range(0.1, 0.2),
        a: 0,
      });
    }
  }

  // ------------------------------------------------------------ placement

  private resetSpine(g: Garment, x: number, y: number): void {
    for (let i = 0; i < g.spine.length; i++) {
      const n = g.spine[i];
      n.x = x;
      n.y = y + i * g.rest;
      n.px = n.x;
      n.py = n.y;
    }
    for (const L of g.limbs) {
      for (let i = 0; i < L.nodes.length; i++) {
        const n = L.nodes[i];
        n.x = x + L.side * L.spread * g.halfW;
        n.y = y + i * L.rest;
        n.px = n.x;
        n.py = n.y;
      }
    }
  }

  /** point on the (sagging) clothesline for parameter u */
  private linePoint(u: number): { x: number; y: number } {
    const { lineA, lineB } = this.geo;
    const x = lerp(lineA.x, lineB.x, u);
    let y = lerp(lineA.y, lineB.y, u);
    const span = lineB.x - lineA.x;
    y += 5 * Math.sin(Math.PI * clamp(u, 0, 1)); // the line's own slack
    for (const g of this.garments) {
      if (g.state !== 'hung') continue;
      const d = Math.abs(u - g.u);
      const k = Math.max(0, 1 - d / 0.4);
      y += (0.016 * span) * (0.5 + g.wet * 0.9) * k * k;
    }
    // the breeze lifts the line a touch
    y -= this.wind * 4 * Math.sin(Math.PI * clamp(u, 0, 1));
    return { x, y };
  }

  private pinToLine(g: Garment, snap: boolean): void {
    const p = this.linePoint(g.u);
    if (snap) this.resetSpine(g, p.x, p.y);
    g.spine[0].x = p.x;
    g.spine[0].y = p.y;
  }

  private basketSlot(i: number): { x: number; y: number; rot: number } {
    const b = this.geo.basket;
    const n = this.garments.length;
    const f = (i + 0.5) / n - 0.5;
    return {
      x: b.x + f * b.rx * 1.12,
      y: b.y - b.ry * 1.35 + Math.abs(f) * b.ry * 0.45,
      rot: f * 0.5 + (i % 2 ? 0.12 : -0.14),
    };
  }

  private placeInBasket(g: Garment, loose = false): void {
    const s = this.basketSlot(g.slot);
    g.state = loose ? 'loose' : 'basket';
    if (loose) {
      this.resetSpine(g, s.x, this.geo.floorY + 18);
      for (const n of g.spine) n.y = this.geo.floorY + 24 + this.rng.range(0, 8);
    } else {
      this.resetSpine(g, s.x, s.y);
    }
  }

  private insideSlot(i: number): { x: number; y: number } {
    const d = this.geo.door;
    const cx = d.x + d.w * (this.geo.doorSide < 0 ? 0.62 : 0.3);
    return {
      x: cx + ((i % 2) - 0.5) * d.w * 0.26,
      y: d.y + d.h * (0.78 - Math.floor(i / 2) * 0.075),
    };
  }

  private placeInside(g: Garment): void {
    const s = this.insideSlot(g.slot);
    g.state = 'inside';
    this.resetSpine(g, s.x, s.y);
  }

  // ------------------------------------------------------------ phases

  enterPhase(name: PhaseName): void {
    const ph = this.ctx.phase;
    if (ph.name !== name) ph.set(name);
    ph.intervening = name === 'trouble';
    this.quiet = 0;
    this.comicT = 0;
    this.dropBeatI = 0;
    this.firstDropDone = false;
    this.rainStopArmed = false;
    this.soakClock = 0;
    this.dropBeats = [1.1, 2.6, 3.4, 4.1, 4.7, 5.2, 5.6, 5.9];
    this.held = null;
    this.bits = [];
    this.drops = [];
    this.ripples = [];

    const dry = (g: Garment) => {
      g.wet = 0;
      g.front = 0;
      g.spots = [];
      g.gush = 0;
    };
    const soak = (g: Garment, v: number) => {
      g.wet = v;
      g.front = 1;
      g.spots = [];
    };

    switch (name) {
      case 'establish':
        this.ending = 'none';
        this.cloud = this.cloudTarget = -0.85;
        this.cloudDark = 0;
        this.dim = this.dimTarget = 0;
        this.wind = this.windTarget = 0.12;
        this.rain = this.rainTarget = 0;
        this.beam = this.beamTarget = 0;
        this.camZ = 1.075;
        this.camZT = 1;
        this.camY = this.geo ? this.geo.h * 0.02 : 0;
        this.camYT = 0;
        for (const g of this.garments) {
          dry(g);
          g.slot = this.garments.indexOf(g);
          this.placeInBasket(g);
        }
        for (const p of this.puddles) p.a = 0;
        break;

      case 'action':
        this.enterPhase('establish');
        this.ctx.phase.set('action');
        this.camZ = this.camZT = 1;
        this.camY = this.camYT = 0;
        break;

      case 'foreshadow':
        this.enterPhase('action');
        this.ctx.phase.set('foreshadow');
        this.hangAll();
        this.cloud = -0.8;
        this.cloudTarget = 0.62;
        this.dimTarget = 0.4;
        this.windTarget = 0.42;
        break;

      case 'trouble':
        this.enterPhase('foreshadow');
        this.ctx.phase.set('trouble');
        this.ctx.phase.intervening = true;
        this.cloud = 0.45;
        this.cloudTarget = 0.72;
        this.cloudDark = 1;
        this.dim = this.dimTarget = 0.78;
        this.wind = this.windTarget = 0.72;
        this.rain = 0.35;
        this.rainTarget = 1;
        for (const g of this.garments) {
          g.spots = [{ t: 0.14, u: -0.2, r: g.halfW * 0.4, grow: 0 }];
          g.wet = 0.12;
          g.front = 0.2;
        }
        for (const p of this.puddles) p.a = 0.25;
        break;

      case 'resolve':
        this.enterPhase('trouble');
        this.ctx.phase.set('resolve');
        this.ctx.phase.intervening = false;
        this.ending = 'saved';
        for (const g of this.garments) {
          dry(g);
          g.wet = 0.18;
          g.front = 0.3;
          this.placeInside(g);
        }
        this.rain = 0.08;
        this.rainTarget = 0;
        this.cloudTarget = 1.35;
        this.dimTarget = 0;
        this.windTarget = 0.16;
        this.beamTarget = 1;
        this.beam = 0.6;
        break;

      case 'comic':
        this.enterPhase('resolve');
        this.ctx.phase.set('comic');
        this.rain = this.rainTarget = 0;
        this.cloud = 1.05;
        this.cloudTarget = 1.35;
        this.dim = this.dimTarget = 0;
        this.beam = this.beamTarget = 1;
        this.comicT = 0;
        break;

      case 'settle':
        this.enterPhase('comic');
        this.ctx.phase.set('settle');
        this.comicT = 3.4;
        break;
    }
    void soak;
  }

  private hangAll(): void {
    for (let i = 0; i < this.garments.length; i++) {
      const g = this.garments[i];
      g.state = 'hung';
      g.u = this.geo.slots[i];
      this.pinToLine(g, true);
      // let them settle immediately so a phase jump looks lived-in
      for (let k = 0; k < 220; k++) this.stepGarment(g, 1 / 120, true);
    }
  }

  private freeSlot(u: number): number {
    const taken = this.garments.filter((g) => g.state === 'hung').map((g) => g.u);
    let best = this.geo.slots[0];
    let bd = 1e9;
    for (const s of this.geo.slots) {
      if (taken.some((tt) => Math.abs(tt - s) < 0.06)) continue;
      const d = Math.abs(s - u);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (bd > 1e8) best = clamp(u, this.geo.slots[0], this.geo.slots[this.geo.slots.length - 1]);
    return best;
  }

  /** forward transition during play — keeps the world, only arms the next beat */
  private advance(name: PhaseName): void {
    const ph = this.ctx.phase;
    ph.set(name);
    ph.intervening = name === 'trouble';
    switch (name) {
      case 'action':
        this.camZT = 1;
        this.camYT = 0;
        break;
      case 'foreshadow':
        this.cloudTarget = 0.62;
        this.dimTarget = 0.4;
        this.windTarget = 0.42;
        this.dropBeatI = 0;
        this.firstDropDone = false;
        this.ctx.audio.whoosh(0.5, 1.4);
        break;
      case 'trouble':
        this.cloudTarget = 0.76;
        this.dimTarget = 0.78;
        this.windTarget = 0.72;
        this.rainTarget = 1;
        break;
      case 'resolve':
        if (this.ending === 'saved') {
          this.rainTarget = 0;
          this.rainStopArmed = true;
          this.cloudTarget = 1.38;
          this.dimTarget = 0;
          this.windTarget = 0.18;
          this.beamTarget = 1;
        } else {
          this.rainTarget = 0;
          this.cloudTarget = 1.25;
          this.dimTarget = 0.18;
          this.windTarget = 0.22;
          this.beamTarget = 0.65;
        }
        break;
      case 'comic':
        this.comicT = 0;
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- update

  update(dt: number): void {
    this.t += dt;
    const ph = this.ctx.phase;
    ph.update(dt);

    this.updateBeats(dt);
    this.updateSky(dt);
    this.updateRain(dt);
    for (const g of this.garments) this.stepGarment(g, dt, false);
    this.updateBits(dt);
    this.updateCamera(dt);
    this.updateSound();

    this.chBlinkT -= dt;
    if (this.chBlinkT <= 0) {
      this.chBlink = 0.16;
      this.chBlinkT = this.rng.range(2.4, 5.5);
    }
    this.chBlink = Math.max(0, this.chBlink - dt);

    if (this.fadeOut) {
      this.fade = Math.min(1, this.fade + dt * 2.2);
      if (this.fade >= 1) {
        this.fadeOut = false;
        this.ctx.exit();
      }
    } else {
      this.fade = Math.max(0, this.fade - dt * 1.8);
    }
  }

  private outdoors(g: Garment): boolean {
    return g.state === 'hung' || g.state === 'loose' || (g.state === 'held' && !this.inDoor(g.spine[0].x, g.spine[0].y));
  }

  private inDoor(x: number, y: number): boolean {
    const d = this.geo.door;
    return x > d.x - 8 && x < d.x + d.w + 8 && y > d.y - 10 && y < d.y + d.h + 24;
  }

  private updateBeats(dt: number): void {
    const ph = this.ctx.phase;
    switch (ph.name) {
      case 'establish':
        if (ph.t > 2.6 && !this.held) this.advance('action');
        break;

      case 'action': {
        const hung = this.garments.filter((g) => g.state === 'hung').length;
        if (hung === this.garments.length && !this.held) {
          this.quiet += dt;
          if (this.quiet > 2.4) this.advance('foreshadow');
        } else {
          this.quiet = 0;
        }
        break;
      }

      case 'foreshadow': {
        while (this.dropBeatI < this.dropBeats.length && ph.t > this.dropBeats[this.dropBeatI]) {
          this.aimDrop(this.dropBeatI === 0);
          this.dropBeatI++;
        }
        if (ph.t > 6.4) this.advance('trouble');
        break;
      }

      case 'trouble': {
        this.soakClock += dt;
        const total = this.garments.length;
        const safe = this.garments.filter((g) => g.state === 'inside').length;
        if (safe === total) {
          this.ending = 'saved';
          this.lastRescueAt = this.t;
          this.advance('resolve');
        } else if (this.soakClock > 17) {
          this.ending = 'soaked';
          this.advance('resolve');
        }
        break;
      }

      case 'resolve': {
        if (this.ending === 'saved') {
          if (this.rainStopArmed && this.rain < 0.02) {
            this.rainStopArmed = false;
            this.ctx.audio.bloom();
          }
          if (ph.t > 2.3) this.advance('comic');
        } else {
          if (ph.t > 3.6) this.advance('comic');
        }
        break;
      }

      case 'comic':
        this.comicT += dt;
        if (this.comicT > 3.6) this.advance('settle');
        break;

      case 'settle':
        if (ph.t > 6 && !this.held) this.leave();
        break;
    }
  }

  private leave(): void {
    if (!this.fadeOut) this.fadeOut = true;
  }

  private updateSky(dt: number): void {
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    this.cloud += (this.cloudTarget - this.cloud) * k(0.34);
    this.cloudDark += ((this.dimTarget > 0.4 ? 1 : 0) - this.cloudDark) * k(0.7);
    this.dim += (this.dimTarget - this.dim) * k(0.75);
    this.beam += (this.beamTarget - this.beam) * k(1.2);
    this.gust *= Math.exp(-dt * 1.1);
    const base = this.windTarget + this.gust;
    this.wind += (base - this.wind) * k(1.6);
    // rain answers the last rescue almost instantly; it builds slowly
    const rainRate = this.rainTarget > this.rain ? 0.42 : this.ending === 'saved' ? 7.5 : 0.85;
    this.rain += (this.rainTarget - this.rain) * k(rainRate);
    if (this.rain < 0.004) this.rain = 0;
  }

  private aimDrop(first: boolean): void {
    const targets = this.garments.filter((g) => g.state === 'hung');
    if (!targets.length) return;
    const g = first ? targets.find((x) => x.kind === 'shirt') ?? targets[0] : this.rng.pick(targets);
    const t = first ? 0.22 : this.rng.range(0.1, 0.55);
    const u = first ? -0.25 : this.rng.range(-0.7, 0.7);
    const p = this.spinePoint(g, t, u);
    this.aimed.push({ g, t, u, x: p.x + this.rng.range(-4, 4), y: this.geo.cloudY + this.geo.cloudR * 0.4, vy: 430 });
  }

  private aimed: Array<{ g: Garment; t: number; u: number; x: number; y: number; vy: number }> = [];

  private updateRain(dt: number): void {
    const { w, h, skylineY, floorY } = this.geo;

    // the first, telegraphed drops
    for (let i = this.aimed.length - 1; i >= 0; i--) {
      const a = this.aimed[i];
      a.vy += 900 * dt;
      a.y += a.vy * dt;
      a.x += this.wind * 26 * dt;
      const p = this.spinePoint(a.g, a.t, a.u);
      if (a.y >= p.y) {
        this.aimed.splice(i, 1);
        a.g.spots.push({ t: a.t, u: a.u, r: a.g.halfW * 0.16, grow: 1 });
        a.g.wet = Math.min(1, a.g.wet + 0.035);
        a.g.settle = Math.max(a.g.settle, 0.4);
        this.ctx.audio.drop(this.rng.range(0.85, 1.2));
        this.firstDropDone = true;
        for (let k = 0; k < 4; k++) {
          this.bits.push({
            x: p.x,
            y: p.y,
            vx: this.rng.range(-40, 40),
            vy: this.rng.range(-70, -10),
            life: 0.32,
            max: 0.32,
            r: 1.5,
            kind: 0,
          });
        }
      }
    }

    // bulk rain
    if (this.rain > 0.01) {
      const want = this.rain * 330 * dt;
      let n = Math.floor(want);
      if (this.rng.next() < want - n) n++;
      for (let i = 0; i < n && this.drops.length < 520; i++) {
        const layer = this.rng.next() < 0.42 ? 0 : this.rng.next() < 0.62 ? 1 : 2;
        const spd = layer === 0 ? 560 : layer === 1 ? 820 : 1120;
        this.drops.push({
          x: this.rng.range(-w * 0.15, w * 1.15),
          y: -this.rng.range(10, 120),
          vx: this.wind * (90 + layer * 60),
          vy: spd * this.rng.range(0.9, 1.1),
          len: (layer === 0 ? 11 : layer === 1 ? 20 : 30) * this.rng.range(0.8, 1.35),
          layer,
        });
      }
    }

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      const gy = d.layer === 0 ? skylineY : d.layer === 1 ? floorY + 14 : h * 0.98;
      if (d.y > gy) {
        this.drops.splice(i, 1);
        if (d.layer > 0) {
          this.ripples.push({ x: d.x, y: gy, r: 1, life: 0.55 });
          const m = d.layer === 2 ? 3 : 2;
          for (let k = 0; k < m; k++) {
            this.bits.push({
              x: d.x,
              y: gy,
              vx: this.rng.range(-60, 60),
              vy: this.rng.range(-130, -40),
              life: 0.26,
              max: 0.26,
              r: d.layer === 2 ? 1.8 : 1.2,
              kind: 0,
            });
          }
        }
      }
    }

    // puddles
    for (const p of this.puddles) {
      p.a = clamp(p.a + (this.rain > 0.05 ? this.rain * 0.16 : -0.05) * dt, 0, 1);
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.life -= dt;
      r.r += 42 * dt;
      if (r.life <= 0) this.ripples.splice(i, 1);
    }
  }

  private updateBits(dt: number): void {
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.life -= dt;
      b.vy += (b.kind === 1 ? 1400 : 900) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const gy = this.geo.floorY + 20;
      if (b.kind === 1 && b.y > gy && b.vy > 0) {
        b.life = Math.min(b.life, 0.12);
        b.vy *= -0.24;
        b.vx *= 0.5;
        if (this.rng.next() < 0.5) this.ripples.push({ x: b.x, y: gy, r: 1, life: 0.5 });
      }
      if (b.life <= 0) this.bits.splice(i, 1);
    }
  }

  private updateCamera(dt: number): void {
    const k = 1 - Math.exp(-dt * 1.7);
    this.camZ += (this.camZT - this.camZ) * k;
    this.camY += (this.camYT - this.camY) * k;
    this.shake = Math.max(0, this.shake - dt * 2);
  }

  private updateSound(): void {
    const a = this.ctx.audio;
    a.bed('rain', this.rain * 0.1, 760 + this.rain * 1200);
    a.bed('wind', Math.max(0, this.wind - 0.15) * 0.05, 340);
  }

  // ---------------------------------------------------------------- cloth

  private stepGarment(g: Garment, dt: number, warm: boolean): void {
    if (g.state === 'basket' || g.state === 'inside') {
      g.settle = Math.max(0, g.settle - dt * 2);
      return;
    }
    const geo = this.geo;
    const gravity = 1750 * (1 + g.wet * 0.75);
    const windAmp = (1 - g.wet * 0.62) * (14 + this.rain * 8);
    const nz = this.noise(this.t * 1.7) * 0.6 + this.noise(this.t * 0.52 + 11) * 0.4;
    const wforce = this.wind * windAmp * (0.55 + nz);
    const damp = 0.986 - g.wet * 0.02;
    const floor = geo.floorY + 26;

    if (g.state === 'hung') {
      this.pinToLine(g, false);
    } else if (g.state === 'held') {
      const tx = this.pointerX + g.grabDX;
      const ty = this.pointerY + g.grabDY;
      const lag = 1 - Math.exp(-dt * (17 - g.wet * 9));
      const n0 = g.spine[0];
      n0.px = n0.x;
      n0.py = n0.y;
      n0.x += (tx - n0.x) * lag;
      n0.y += (ty - n0.y) * lag;
    }

    const pinned = g.state === 'hung' || g.state === 'held';
    const start = pinned ? 1 : 0;

    const integrate = (nodes: Node[], amp: number) => {
      for (let i = start; i < nodes.length; i++) {
        const n = nodes[i];
        const vx = (n.x - n.px) * damp;
        const vy = (n.y - n.py) * damp;
        n.px = n.x;
        n.py = n.y;
        const depth = i / (nodes.length - 1);
        n.x += vx + (wforce * (0.4 + depth) * amp + g.settle * Math.sin(this.t * 19 + i) * 30) * dt * dt * 60;
        n.y += vy + gravity * dt * dt * 60 * 0.017;
      }
    };

    integrate(g.spine, 1);
    for (const L of g.limbs) {
      // limb root rides the spine
      const a = g.spine[L.attach];
      const b = g.spine[Math.min(L.attach + 1, g.spine.length - 1)];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl;
      dy /= dl;
      const nx = -dy;
      const ny = dx;
      const r = L.nodes[0];
      r.px = r.x;
      r.py = r.y;
      r.x = a.x + nx * L.side * L.spread * g.halfW;
      r.y = a.y + ny * L.side * L.spread * g.halfW;
      for (let i = 1; i < L.nodes.length; i++) {
        const n = L.nodes[i];
        const vx = (n.x - n.px) * damp;
        const vy = (n.y - n.py) * damp;
        n.px = n.x;
        n.py = n.y;
        n.x += vx + wforce * (0.5 + i * 0.3) * dt * dt * 60;
        n.y += vy + gravity * dt * dt * 60 * 0.017;
      }
    }

    // distance constraints
    const iter = 4;
    for (let k = 0; k < iter; k++) {
      const stretch = 1 + g.wet * 0.16;
      this.solveChain(g.spine, g.rest * stretch, pinned);
      for (const L of g.limbs) this.solveChain(L.nodes, L.rest * stretch, true);
      if (g.state === 'loose') {
        for (const n of g.spine) if (n.y > floor) n.y = floor - (n.y - floor) * 0.1;
        for (const L of g.limbs) for (const n of L.nodes) if (n.y > floor) n.y = floor - (n.y - floor) * 0.1;
      }
    }
    if (g.state === 'loose') {
      for (const n of g.spine) {
        if (n.y >= floor - 0.6) {
          n.px += (n.x - n.px) * 0.35; // friction
          n.y = floor;
        }
        n.x = clamp(n.x, 6, geo.w - 6);
      }
      g.restedT += dt;
    } else {
      g.restedT = 0;
    }

    g.settle = Math.max(0, g.settle - dt * 1.6);

    // water
    if (!warm) {
      const exposed = this.outdoors(g) && this.rain > 0.02;
      if (exposed) {
        const rate = this.rain * (g.state === 'loose' ? 0.2 : 0.115) * dt;
        g.wet = Math.min(1, g.wet + rate);
        g.front = Math.min(1, g.front + rate * 2.6 + dt * this.rain * 0.06);
        for (const s of g.spots) s.grow = Math.min(3.4, s.grow + dt * 0.5);
      } else {
        for (const s of g.spots) s.grow = Math.min(3.4, s.grow + dt * 0.12);
      }
      if (g.wet > 0.2) {
        g.dripT -= dt;
        if (g.dripT <= 0) {
          g.dripT = this.rng.range(0.25, 1.5) * (1.25 - g.wet);
          const low = this.lowestPoint(g);
          this.bits.push({
            x: low.x + this.rng.range(-g.halfW * 0.5, g.halfW * 0.5),
            y: low.y,
            vx: 0,
            vy: 20,
            life: 1.4,
            max: 1.4,
            r: 2.2 + g.wet * 1.4,
            kind: 1,
          });
        }
      }
      if (g.gush > 0) {
        g.gush -= dt;
        const low = this.lowestPoint(g);
        const n = 3;
        for (let i = 0; i < n; i++) {
          this.bits.push({
            x: low.x + this.rng.range(-g.halfW * 0.7, g.halfW * 0.7),
            y: low.y - this.rng.range(0, g.halfW * 0.5),
            vx: this.rng.range(-50, 50),
            vy: this.rng.range(40, 220),
            life: 1.1,
            max: 1.1,
            r: 2 + this.rng.range(0, 3),
            kind: 1,
          });
        }
        g.wet = Math.max(0.42, g.wet - dt * 0.16);
      }
    }
  }

  private solveChain(nodes: Node[], rest: number, pinFirst: boolean): void {
    // bending resistance: keep i and i+2 apart so the cloth cannot fold flat
    const minSpan = rest * 1.45;
    for (let i = 0; i + 2 < nodes.length; i++) {
      const a = nodes[i];
      const b = nodes[i + 2];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1e-4;
      if (d >= minSpan) continue;
      const diff = ((d - minSpan) / d) * 0.5;
      dx *= diff;
      dy *= diff;
      const wa = i === 0 && pinFirst ? 0 : 0.5;
      a.x += dx * wa;
      a.y += dy * wa;
      b.x -= dx * (1 - wa);
      b.y -= dy * (1 - wa);
    }
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1e-4;
      const diff = (d - rest) / d;
      const wa = i === 0 && pinFirst ? 0 : 0.5;
      const wb = 1 - wa;
      dx *= diff;
      dy *= diff;
      a.x += dx * wa;
      a.y += dy * wa;
      b.x -= dx * wb;
      b.y -= dy * wb;
    }
  }

  private lowestPoint(g: Garment): { x: number; y: number } {
    let best = g.spine[g.spine.length - 1];
    for (const L of g.limbs) {
      const n = L.nodes[L.nodes.length - 1];
      if (n.y > best.y) best = n;
    }
    for (const n of g.spine) if (n.y > best.y) best = n;
    return { x: best.x, y: best.y };
  }

  /** a point on the garment: t along the spine (0..1), u across (-1..1) */
  private spinePoint(g: Garment, t: number, u: number): { x: number; y: number } {
    const n = g.spine.length - 1;
    const f = clamp(t, 0, 1) * n;
    const i = Math.min(n - 1, Math.floor(f));
    const k = f - i;
    const a = g.spine[i];
    const b = g.spine[i + 1];
    const x = lerp(a.x, b.x, k);
    const y = lerp(a.y, b.y, k);
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    return { x: x - dy * u * g.halfW, y: y + dx * u * g.halfW };
  }

  // ---------------------------------------------------------------- render

  private pal(): {
    skyTop: RGB;
    skyMid: RGB;
    haze: RGB;
    hill: RGB;
    far: RGB;
    mid: RGB;
    floor: RGB;
    rail: RGB;
    wall: RGB;
  } {
    const d = this.dim;
    return {
      skyTop: mix([84, 166, 224], [104, 116, 132], d),
      skyMid: mix([166, 212, 238], [146, 154, 166], d),
      haze: mix([252, 234, 202], [180, 186, 192], d),
      hill: mix([142, 176, 148], [96, 108, 110], d),
      far: mix([186, 204, 220], [130, 138, 150], d),
      mid: mix([206, 214, 226], [146, 152, 162], d),
      floor: mix([216, 200, 178], [136, 138, 144], d),
      rail: mix([240, 242, 246], [172, 176, 184], d),
      wall: mix([238, 232, 222], [160, 162, 168], d),
    };
  }

  render(gg: CanvasRenderingContext2D): void {
    const { w, h } = this.geo;
    const P = this.pal();

    gg.save();
    const sx = this.shake ? Math.sin(this.t * 60) * this.shake * 3 : 0;
    gg.translate(w / 2 + sx, h / 2);
    gg.scale(this.camZ, this.camZ);
    gg.translate(-w / 2, -h / 2 + this.camY);

    this.drawSky(gg, P);
    this.drawSkyline(gg, P);
    this.drawRain(gg, 0, 0);
    this.drawParapet(gg, P);
    this.drawFloor(gg, P);
    this.drawBasket(gg, P);
    this.drawDoor(gg, P);
    this.drawLineAndClothes(gg, P);

    gg.save();
    const clip = new Path2D();
    clip.rect(-w, -h, w * 3, h * 3);
    const d = this.geo.door;
    clip.rect(d.x + 6, d.y + 6, d.w - 12, d.h - 6);
    gg.clip(clip, 'evenodd');
    this.drawRain(gg, 1, 2);
    gg.restore();

    this.drawBits(gg);
    if (this.held) this.drawGarment(gg, this.held);
    this.drawLight(gg);
    gg.restore();

    if (this.fade > 0.001) {
      gg.fillStyle = `rgba(6,8,12,${this.fade})`;
      gg.fillRect(0, 0, w, h);
    }
  }

  private drawSky(gg: CanvasRenderingContext2D, P: ReturnType<Laundry['pal']>): void {
    const { w, h, skylineY } = this.geo;
    const grd = gg.createLinearGradient(0, -h * 0.1, 0, skylineY + 10);
    grd.addColorStop(0, rgb(P.skyTop));
    grd.addColorStop(0.58, rgb(P.skyMid));
    grd.addColorStop(1, rgb(P.haze));
    gg.fillStyle = grd;
    gg.fillRect(-w, -h, w * 3, this.geo.floorY + h + 12);

    // sun
    const s = this.geo.sun;
    const sunA = (1 - this.dim) * 0.9 + this.beam * 0.35;
    if (sunA > 0.02) {
      const r = Math.min(w, h) * 0.085;
      const g2 = gg.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 4.4);
      g2.addColorStop(0, `rgba(255,248,214,${0.95 * sunA})`);
      g2.addColorStop(0.16, `rgba(255,238,186,${0.5 * sunA})`);
      g2.addColorStop(1, 'rgba(255,230,170,0)');
      gg.fillStyle = g2;
      gg.beginPath();
      gg.arc(s.x, s.y, r * 4.4, 0, Math.PI * 2);
      gg.fill();
    }
    this.drawCloud(gg);
  }

  private drawCloud(gg: CanvasRenderingContext2D): void {
    const { w, cloudY, cloudR } = this.geo;
    const p = this.cloud;
    if (p < -0.78 || p > 1.7) return;
    const cx = lerp(-cloudR * 1.6, w + cloudR * 1.6, (p + 0.5) / 2);
    const cy = cloudY + Math.sin(this.t * 0.25) * 4;
    const dark = this.cloudDark;
    const body = mix([255, 255, 255], [158, 163, 178], dark);
    const under = mix([218, 228, 240], [126, 132, 150], dark);
    gg.save();
    gg.globalAlpha = clamp(1 - Math.abs(p - 0.5) * 0.25, 0.55, 1);
    for (let pass = 0; pass < 2; pass++) {
      gg.fillStyle = pass === 0 ? rgb(under) : rgb(body);
      gg.beginPath();
      for (const s of this.cloudSeeds) {
        const r = cloudR * s.r * 0.9;
        const x = cx + s.x * cloudR * 1.35;
        const y = cy + s.y * cloudR * 0.5 + (pass === 0 ? cloudR * 0.14 : 0);
        gg.moveTo(x + r, y);
        gg.arc(x, y, r, 0, Math.PI * 2);
      }
      gg.fill();
    }
    gg.restore();
  }

  private drawSkyline(gg: CanvasRenderingContext2D, P: ReturnType<Laundry['pal']>): void {
    const { w, skylineY } = this.geo;
    const par = (this.camZ - 1) * 60;
    // far hills
    gg.fillStyle = rgb(P.hill, 0.75);
    gg.beginPath();
    gg.moveTo(-w * 0.1, skylineY + 6);
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const x = -w * 0.1 + (w * 1.2 * i) / n;
      const y = skylineY - 14 - Math.sin(i * 1.7 + 0.6) * 12 - 10;
      gg.lineTo(x, y + par * 0.2);
    }
    gg.lineTo(w * 1.1, skylineY + 6);
    gg.closePath();
    gg.fill();

    // far buildings
    const rr = new Rng(this.rng.seed ^ 0x51ed);
    for (let layer = 0; layer < 2; layer++) {
      const col = layer === 0 ? P.far : P.mid;
      const baseY = skylineY + 2 + layer * 5;
      const hMax = (layer === 0 ? 0.075 : 0.055) * this.geo.h;
      gg.fillStyle = rgb(col, layer === 0 ? 0.85 : 1);
      let x = -w * 0.08;
      while (x < w * 1.08) {
        const bw = rr.range(w * 0.05, w * 0.13);
        const bh = rr.range(hMax * 0.4, hMax);
        gg.fillRect(x, baseY - bh + par * (0.3 + layer * 0.2), bw, bh + 20);
        // windows
        gg.fillStyle = rgb(mix(col, [255, 238, 196], (1 - this.dim) * 0.5), 0.5);
        const cols = Math.max(1, Math.floor(bw / 11));
        const rows = Math.max(1, Math.floor(bh / 13));
        for (let cI = 0; cI < cols; cI++) {
          for (let rI = 0; rI < rows; rI++) {
            if (rr.next() < 0.45) continue;
            gg.fillRect(
              x + 4 + cI * 11,
              baseY - bh + 6 + rI * 13 + par * (0.3 + layer * 0.2),
              4,
              5,
            );
          }
        }
        gg.fillStyle = rgb(col, layer === 0 ? 0.85 : 1);
        x += bw + rr.range(2, 10);
      }
    }
  }

  private drawParapet(gg: CanvasRenderingContext2D, P: ReturnType<Laundry['pal']>): void {
    const { w, railY, floorY } = this.geo;
    const barH = Math.max(6, (floorY - railY) * 0.16);
    // balusters
    gg.fillStyle = rgb(mix(P.rail, [120, 124, 132], 0.25), 0.95);
    const step = Math.max(16, w / 26);
    for (let x = step * 0.5; x < w; x += step) {
      gg.fillRect(x - 2, railY + barH * 0.5, 4, floorY - railY);
    }
    // top bar with a warm highlight
    const g2 = gg.createLinearGradient(0, railY, 0, railY + barH);
    g2.addColorStop(0, rgb(mix(P.rail, [255, 255, 255], 0.5)));
    g2.addColorStop(0.5, rgb(P.rail));
    g2.addColorStop(1, rgb(mix(P.rail, [110, 112, 120], 0.45)));
    gg.fillStyle = g2;
    gg.fillRect(-4, railY, w + 8, barH);
    // wet sheen on the rail
    if (this.rain > 0.05 || this.puddles[0]?.a > 0.05) {
      gg.fillStyle = `rgba(150,190,220,${0.25 * Math.max(this.rain, this.puddles[0]?.a ?? 0)})`;
      gg.fillRect(-4, railY, w + 8, barH * 0.4);
    }
    // lower band (the solid part of the balcony edge)
    gg.fillStyle = rgb(mix(P.rail, [150, 146, 140], 0.4));
    gg.fillRect(-4, floorY - barH * 0.6, w + 8, barH * 0.6);
  }

  private drawFloor(gg: CanvasRenderingContext2D, P: ReturnType<Laundry['pal']>): void {
    const { w, h, floorY } = this.geo;
    const g2 = gg.createLinearGradient(0, floorY, 0, h);
    g2.addColorStop(0, rgb(mix(P.floor, [90, 80, 70], 0.22)));
    g2.addColorStop(0.25, rgb(P.floor));
    g2.addColorStop(1, rgb(mix(P.floor, [255, 240, 214], (1 - this.dim) * 0.22)));
    gg.fillStyle = g2;
    gg.fillRect(-w, floorY, w * 3, h - floorY + 40);

    // tiles
    gg.strokeStyle = rgb(mix(P.floor, [90, 84, 76], 0.3), 0.35);
    gg.lineWidth = 1;
    const rows = 5;
    for (let i = 1; i <= rows; i++) {
      const t = i / rows;
      const y = floorY + (h - floorY) * t * t;
      gg.beginPath();
      gg.moveTo(0, y);
      gg.lineTo(w, y);
      gg.stroke();
      const cols = 4 + i;
      for (let c = 1; c < cols; c++) {
        const x = (w * c) / cols;
        gg.beginPath();
        gg.moveTo(x, y);
        gg.lineTo(x, y - (h - floorY) * (t * t - ((i - 1) / rows) ** 2));
        gg.stroke();
      }
    }

    // sun shadows of the hung clothes
    const sunny = (1 - this.dim) * 0.16;
    if (sunny > 0.01) {
      gg.fillStyle = `rgba(90,76,60,${sunny})`;
      for (const g of this.garments) {
        if (g.state !== 'hung') continue;
        const low = this.lowestPoint(g);
        gg.beginPath();
        gg.ellipse(low.x + 14, floorY + (h - floorY) * 0.42, g.halfW * 1.5, g.halfW * 0.34, 0, 0, Math.PI * 2);
        gg.fill();
      }
    }

    // puddles
    for (const p of this.puddles) {
      if (p.a < 0.02) continue;
      const y = floorY + (h - floorY) * 0.55;
      const rx = p.w * (0.4 + p.a * 0.6);
      const ry = rx * 0.22;
      const pg = gg.createLinearGradient(0, y - ry, 0, y + ry);
      pg.addColorStop(0, `rgba(120,158,190,${0.5 * p.a})`);
      pg.addColorStop(1, `rgba(170,200,224,${0.34 * p.a})`);
      gg.fillStyle = pg;
      gg.beginPath();
      gg.ellipse(p.x, y, rx, ry, 0, 0, Math.PI * 2);
      gg.fill();
    }
    // ripples
    for (const r of this.ripples) {
      const a = clamp(r.life / 0.55, 0, 1);
      gg.strokeStyle = `rgba(220,238,250,${0.4 * a})`;
      gg.lineWidth = 1.2;
      gg.beginPath();
      gg.ellipse(r.x, r.y, r.r, r.r * 0.3, 0, 0, Math.PI * 2);
      gg.stroke();
    }
  }

  private drawBasket(gg: CanvasRenderingContext2D, P: ReturnType<Laundry['pal']>): void {
    const b = this.geo.basket;
    const woven = mix([206, 164, 110], [138, 132, 128], this.dim * 0.7);
    const dark = mix(woven, [80, 58, 34], 0.35);

    // back rim
    gg.fillStyle = rgb(dark);
    gg.beginPath();
    gg.ellipse(b.x, b.y - b.ry * 0.85, b.rx, b.ry * 0.5, 0, 0, Math.PI * 2);
    gg.fill();

    // garments sitting in it
    for (const g of this.garments) {
      if (g.state !== 'basket') continue;
      const s = this.basketSlot(g.slot);
      gg.save();
      gg.translate(s.x, s.y);
      gg.rotate(s.rot);
      const r = g.halfW * 1.15;
      const gr = gg.createLinearGradient(0, -r * 0.7, 0, r * 0.7);
      gr.addColorStop(0, rgb(mix(g.base, [255, 255, 255], 0.22)));
      gr.addColorStop(1, rgb(mix(g.base, [60, 60, 70], 0.2)));
      gg.fillStyle = gr;
      gg.beginPath();
      gg.ellipse(0, 0, r * 1.15, r * 0.66, 0, 0, Math.PI * 2);
      gg.fill();
      gg.strokeStyle = rgb(mix(g.base, [40, 44, 60], 0.35), 0.5);
      gg.lineWidth = 1.2;
      gg.beginPath();
      gg.moveTo(-r * 0.8, -r * 0.1);
      gg.quadraticCurveTo(0, r * 0.2, r * 0.8, -r * 0.16);
      gg.stroke();
      gg.fillStyle = rgb(g.accent, 0.85);
      gg.beginPath();
      gg.ellipse(-r * 0.35, r * 0.1, r * 0.3, r * 0.16, 0.3, 0, Math.PI * 2);
      gg.fill();
      gg.restore();
    }

    // front body
    const bg = gg.createLinearGradient(0, b.y - b.ry, 0, b.y + b.ry * 1.6);
    bg.addColorStop(0, rgb(mix(woven, [255, 240, 210], 0.3)));
    bg.addColorStop(1, rgb(dark));
    gg.fillStyle = bg;
    gg.beginPath();
    gg.moveTo(b.x - b.rx, b.y - b.ry * 0.85);
    gg.lineTo(b.x - b.rx * 0.8, b.y + b.ry * 1.05);
    gg.quadraticCurveTo(b.x, b.y + b.ry * 1.7, b.x + b.rx * 0.8, b.y + b.ry * 1.05);
    gg.lineTo(b.x + b.rx, b.y - b.ry * 0.85);
    gg.closePath();
    gg.fill();
    // weave
    gg.strokeStyle = rgb(dark, 0.55);
    gg.lineWidth = 1.4;
    for (let i = 1; i <= 3; i++) {
      const yy = b.y - b.ry * 0.55 + i * b.ry * 0.5;
      gg.beginPath();
      gg.moveTo(b.x - b.rx * (0.98 - i * 0.05), yy);
      gg.quadraticCurveTo(b.x, yy + b.ry * 0.28, b.x + b.rx * (0.98 - i * 0.05), yy);
      gg.stroke();
    }
    // rim
    gg.fillStyle = rgb(mix(woven, [255, 246, 220], 0.45));
    gg.beginPath();
    gg.ellipse(b.x, b.y - b.ry * 0.85, b.rx, b.ry * 0.5, 0, Math.PI, Math.PI * 2);
    gg.fill();
    gg.strokeStyle = rgb(dark, 0.8);
    gg.lineWidth = 2;
    gg.beginPath();
    gg.ellipse(b.x, b.y - b.ry * 0.85, b.rx, b.ry * 0.5, 0, 0, Math.PI * 2);
    gg.stroke();
    void P;
  }

  private drawDoor(gg: CanvasRenderingContext2D, P: ReturnType<Laundry['pal']>): void {
    const d = this.geo.door;
    const side = this.geo.doorSide;
    const r = Math.min(18, d.w * 0.09);

    // wall slab behind the frame
    gg.fillStyle = rgb(mix(P.wall, [120, 116, 112], 0.1));
    this.roundRect(gg, d.x - 6, d.y - 10, d.w + 12, d.h + 14, r + 5);
    gg.fill();

    // interior
    gg.save();
    this.roundRect(gg, d.x + 6, d.y + 6, d.w - 12, d.h - 6, r);
    gg.clip();
    const warm = gg.createLinearGradient(d.x, d.y, d.x + d.w * 0.3, d.y + d.h);
    warm.addColorStop(0, 'rgb(252,224,178)');
    warm.addColorStop(0.55, 'rgb(240,198,142)');
    warm.addColorStop(1, 'rgb(206,158,106)');
    gg.fillStyle = warm;
    gg.fillRect(d.x, d.y, d.w, d.h);
    // interior floor
    gg.fillStyle = 'rgb(186,138,92)';
    gg.fillRect(d.x, d.y + d.h * 0.76, d.w, d.h * 0.24);
    gg.fillStyle = 'rgba(255,236,200,0.35)';
    gg.fillRect(d.x, d.y + d.h * 0.76, d.w, 3);
    // a lamp glow in the back
    const lg = gg.createRadialGradient(
      d.x + d.w * (side < 0 ? 0.78 : 0.22),
      d.y + d.h * 0.2,
      0,
      d.x + d.w * (side < 0 ? 0.78 : 0.22),
      d.y + d.h * 0.2,
      d.w * 0.8,
    );
    lg.addColorStop(0, 'rgba(255,246,214,0.85)');
    lg.addColorStop(1, 'rgba(255,240,200,0)');
    gg.fillStyle = lg;
    gg.fillRect(d.x, d.y, d.w, d.h);

    this.drawChairAndPile(gg, d, side);
    if (this.comicLean() <= 0.001) this.drawCharacter(gg, d, side);

    // curtain on the far side, breathing with the wind
    const cw = d.w * 0.3;
    const cx0 = side < 0 ? d.x + d.w - cw : d.x;
    gg.save();
    gg.beginPath();
    const waves = 6;
    const outer = side < 0 ? cx0 + cw : cx0; // the edge pinned to the frame
    const inner = side < 0 ? cx0 : cx0 + cw; // the loose edge
    gg.moveTo(outer, d.y);
    gg.lineTo(outer, d.y + d.h);
    for (let i = waves; i >= 0; i--) {
      const t = i / waves;
      const yy = d.y + d.h * t;
      const sway = Math.sin(this.t * 1.6 + t * 4.2) * (2 + this.wind * 10) * t;
      const ex = lerp(outer, inner, 0.82 + 0.18 * Math.sin(t * 5.1 + this.t * 0.8));
      gg.lineTo(ex + sway * (side < 0 ? -1 : 1), yy);
    }
    gg.closePath();
    const cg = gg.createLinearGradient(cx0, 0, cx0 + cw, 0);
    cg.addColorStop(side < 0 ? 1 : 0, 'rgba(255,250,240,0.96)');
    cg.addColorStop(side < 0 ? 0 : 1, 'rgba(240,222,196,0.7)');
    gg.fillStyle = cg;
    gg.fill();
    gg.restore();
    gg.restore();

    // frame
    gg.lineWidth = Math.max(7, d.w * 0.045);
    gg.strokeStyle = rgb(mix([252, 250, 246], [180, 178, 176], this.dim * 0.6));
    this.roundRect(gg, d.x + 6, d.y + 6, d.w - 12, d.h - 6, r);
    gg.stroke();
    gg.lineWidth = 2;
    gg.strokeStyle = 'rgba(120,110,100,0.35)';
    gg.stroke();

    if (this.comicLean() > 0.001) this.drawCharacter(gg, d, side);

    // warm light spilling onto the balcony floor
    const spill = 0.25 + this.dim * 0.45;
    const sg = gg.createRadialGradient(
      d.x + d.w * 0.5,
      d.y + d.h,
      0,
      d.x + d.w * 0.5,
      d.y + d.h,
      d.w * 1.1,
    );
    sg.addColorStop(0, `rgba(255,220,150,${0.34 * spill})`);
    sg.addColorStop(1, 'rgba(255,214,140,0)');
    gg.fillStyle = sg;
    gg.beginPath();
    gg.ellipse(d.x + d.w * 0.5, d.y + d.h * 0.99, d.w * 1.1, d.h * 0.2, 0, 0, Math.PI * 2);
    gg.fill();
  }

  private drawChairAndPile(gg: CanvasRenderingContext2D, d: { x: number; y: number; w: number; h: number }, side: number): void {
    const cx = d.x + d.w * (side < 0 ? 0.52 : 0.46);
    const seatY = d.y + d.h * 0.8;
    const sw = d.w * 0.44;
    const wood = 'rgb(150,102,64)';
    const wood2 = 'rgb(126,84, 52)';
    // legs
    gg.fillStyle = wood2;
    gg.fillRect(cx - sw * 0.46, seatY, sw * 0.09, d.h * 0.14);
    gg.fillRect(cx + sw * 0.37, seatY, sw * 0.09, d.h * 0.14);
    // back
    gg.fillStyle = wood;
    gg.fillRect(cx - sw * 0.5, seatY - d.h * 0.2, sw * 0.1, d.h * 0.2);
    gg.fillRect(cx - sw * 0.5, seatY - d.h * 0.2, sw, d.h * 0.035);
    // seat
    gg.fillStyle = wood;
    this.roundRect(gg, cx - sw * 0.52, seatY - d.h * 0.028, sw * 1.04, d.h * 0.038, 4);
    gg.fill();

    // rescued clothes piled on it
    const inside = this.garments.filter((g) => g.state === 'inside');
    inside.forEach((g, i) => {
      const s = this.insideSlot(g.slot);
      const x = clamp(s.x, d.x + d.w * 0.16, d.x + d.w * 0.84);
      const y = Math.min(s.y, seatY - d.h * 0.03) - i * d.h * 0.008;
      const r = g.halfW * 0.92;
      const wetC = mix(g.base, wetOf(g.base), g.wet * 0.75);
      const gr = gg.createLinearGradient(x, y - r * 0.6, x, y + r * 0.6);
      gr.addColorStop(0, rgb(mix(wetC, [255, 244, 214], 0.28)));
      gr.addColorStop(1, rgb(mix(wetC, [70, 60, 60], 0.24)));
      gg.fillStyle = gr;
      gg.beginPath();
      gg.ellipse(x, y, r * 1.1, r * 0.6, (i % 2 ? 1 : -1) * 0.16, 0, Math.PI * 2);
      gg.fill();
      gg.strokeStyle = rgb(mix(wetC, [40, 40, 50], 0.4), 0.45);
      gg.lineWidth = 1.2;
      gg.beginPath();
      gg.moveTo(x - r * 0.75, y);
      gg.quadraticCurveTo(x, y + r * 0.26, x + r * 0.75, y - r * 0.08);
      gg.stroke();
    });
  }

  private comicLean(): number {
    return this.ctx.phase.is('comic', 'settle') ? smooth((this.comicT - 0.05) / 0.5) : 0;
  }

  private drawCharacter(gg: CanvasRenderingContext2D, d: { x: number; y: number; w: number; h: number }, side: number): void {
    const comic = this.ctx.phase.is('comic', 'settle') ? this.comicT : 0;
    const lean = this.comicLean();
    const lookUp = smooth((comic - 0.55) / 0.55);
    const palm = smooth((comic - 0.95) / 0.5);
    const shrugRaw = smooth((comic - 2.05) / 0.45);
    const shrug = shrugRaw * (1 - 0.25 * Math.max(0, Math.sin((comic - 2.05) * 6)));
    const blink = this.chBlink > 0 || (comic > 1.72 && comic < 1.9) ? 1 : 0;

    const headR = d.h * 0.08;
    const out = -side; // the way the balcony is
    const baseY = d.y + d.h * 0.92;
    const x = d.x + d.w * (side < 0 ? 0.26 : 0.8) - side * lean * d.w * 0.18;
    const bodyH = d.h * 0.42;
    const shoulderY = baseY - bodyH + headR * 0.4 - shrug * headR * 0.3;
    const headY = shoulderY - headR * 1.25 - lookUp * headR * 0.1;
    const skin = 'rgb(246,208,178)';
    const shirtC = this.dim > 0.4 ? 'rgb(120,148,176)' : 'rgb(136,166,196)';

    gg.save();
    // leaning out of the doorway to look at the sky
    gg.translate(x, baseY);
    gg.scale(1 + lean * 0.16, 1 + lean * 0.16);
    gg.rotate(lean * 0.16 * out);
    gg.translate(-x, -baseY);

    // legs
    const hipY = baseY - headR * 1.5;
    gg.strokeStyle = 'rgb(86,102,124)';
    gg.lineWidth = headR * 0.46;
    gg.lineCap = 'round';
    for (const sgn of [-1, 1]) {
      gg.beginPath();
      gg.moveTo(x + sgn * headR * 0.42, hipY);
      gg.lineTo(x + sgn * headR * 0.5, baseY - headR * 0.16);
      gg.stroke();
    }
    gg.fillStyle = 'rgb(62,68,80)';
    for (const sgn of [-1, 1]) {
      gg.beginPath();
      gg.ellipse(x + sgn * headR * 0.5 + out * headR * 0.16, baseY - headR * 0.1, headR * 0.34, headR * 0.17, 0, 0, Math.PI * 2);
      gg.fill();
    }

    // torso
    gg.fillStyle = shirtC;
    gg.beginPath();
    gg.moveTo(x - headR * 0.96, hipY + headR * 0.2);
    gg.quadraticCurveTo(x - headR * 1.04, shoulderY + headR * 0.3, x - headR * 0.8, shoulderY - headR * 0.12);
    gg.quadraticCurveTo(x, shoulderY - headR * 0.34, x + headR * 0.8, shoulderY - headR * 0.12);
    gg.quadraticCurveTo(x + headR * 1.04, shoulderY + headR * 0.3, x + headR * 0.96, hipY + headR * 0.2);
    gg.quadraticCurveTo(x, hipY + headR * 0.52, x - headR * 0.96, hipY + headR * 0.2);
    gg.closePath();
    gg.fill();

    // arm: hangs at rest, then reaches out palm-up to check for rain
    const armA = lerp(Math.PI * 0.52, Math.PI * 0.1, Math.max(palm, shrug * 0.8));
    const ax = x + out * headR * 0.78;
    const ay = shoulderY + headR * 0.2;
    const alen = headR * 1.55;
    const ex = ax + Math.cos(armA) * alen * out;
    const ey = ay + Math.sin(armA) * alen;
    gg.strokeStyle = shirtC;
    gg.lineWidth = headR * 0.52;
    gg.lineCap = 'round';
    gg.beginPath();
    gg.moveTo(ax, ay);
    gg.quadraticCurveTo(ax + out * headR * 0.7, ay + headR * 0.55, ex, ey);
    gg.stroke();
    gg.fillStyle = skin;
    gg.beginPath();
    gg.ellipse(ex, ey, headR * 0.34, headR * 0.26, out * 0.5 * palm, 0, Math.PI * 2);
    gg.fill();

    // head — tips back as the eyes go up
    gg.save();
    gg.translate(x, headY);
    gg.rotate(out * lookUp * 0.24);
    gg.translate(-x, -headY);
    gg.fillStyle = skin;
    gg.beginPath();
    gg.ellipse(x, headY, headR * 0.92, headR, 0, 0, Math.PI * 2);
    gg.fill();
    // hair
    gg.fillStyle = 'rgb(74,58,52)';
    gg.beginPath();
    gg.ellipse(x, headY - headR * (0.34 + lookUp * 0.14), headR * 0.98, headR * 0.72, 0, Math.PI, Math.PI * 2);
    gg.fill();
    gg.beginPath();
    gg.ellipse(x - out * headR * 0.72, headY - headR * 0.1, headR * 0.3, headR * 0.42, 0, 0, Math.PI * 2);
    gg.fill();

    // face: looks straight out, then up at the sky
    const eyeY = headY + headR * (0.08 - lookUp * 0.28);
    const eyeDX = headR * 0.34;
    const eyeOff = out * headR * 0.1;
    gg.fillStyle = 'rgb(56,44,40)';
    for (const s of [-1, 1]) {
      const ex2 = x + s * eyeDX + eyeOff;
      if (blink) {
        gg.fillRect(ex2 - headR * 0.16, eyeY, headR * 0.32, headR * 0.075);
      } else {
        gg.beginPath();
        gg.ellipse(ex2, eyeY, headR * 0.115, headR * 0.145, 0, 0, Math.PI * 2);
        gg.fill();
      }
    }
    // mouth: small o when looking up, little smile otherwise
    gg.strokeStyle = 'rgb(176,104,92)';
    gg.lineWidth = headR * 0.12;
    gg.beginPath();
    const my = headY + headR * (0.5 - lookUp * 0.18);
    if (lookUp > 0.4) {
      gg.ellipse(x + eyeOff, my, headR * 0.15, headR * 0.13 * (1 - shrug * 0.4), 0, 0, Math.PI * 2);
    } else {
      gg.arc(x + eyeOff, my - headR * 0.16, headR * 0.28, 0.35, Math.PI - 0.35);
    }
    gg.stroke();
    gg.restore();
    gg.restore();
  }

  private roundRect(
    gg: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    const rr = Math.min(r, w / 2, h / 2);
    gg.beginPath();
    gg.moveTo(x + rr, y);
    gg.arcTo(x + w, y, x + w, y + h, rr);
    gg.arcTo(x + w, y + h, x, y + h, rr);
    gg.arcTo(x, y + h, x, y, rr);
    gg.arcTo(x, y, x + w, y, rr);
    gg.closePath();
  }

  private drawLineAndClothes(gg: CanvasRenderingContext2D, P: ReturnType<Laundry['pal']>): void {
    const geo = this.geo;
    // pole
    gg.fillStyle = rgb(mix(P.rail, [120, 118, 116], 0.3));
    gg.fillRect(geo.poleX - 4, geo.poleTop, 8, geo.poleBase - geo.poleTop);
    gg.fillStyle = rgb(mix(P.rail, [255, 255, 255], 0.4));
    gg.fillRect(geo.poleX - 4, geo.poleTop, 3, geo.poleBase - geo.poleTop);
    gg.fillStyle = rgb(mix(P.rail, [90, 88, 86], 0.5));
    gg.beginPath();
    gg.ellipse(geo.poleX, geo.poleBase, 14, 5, 0, 0, Math.PI * 2);
    gg.fill();

    // wire
    gg.strokeStyle = `rgba(70,66,62,${0.75 - this.dim * 0.15})`;
    gg.lineWidth = 2;
    gg.beginPath();
    const N = 24;
    for (let i = 0; i <= N; i++) {
      const p = this.linePoint(i / N);
      if (i === 0) gg.moveTo(p.x, p.y);
      else gg.lineTo(p.x, p.y);
    }
    gg.stroke();

    for (const g of this.garments) {
      if (g.state === 'hung' || g.state === 'loose') this.drawGarment(gg, g);
    }
    // pegs on top of the cloth
    for (const g of this.garments) {
      if (g.state !== 'hung') continue;
      const p = this.linePoint(g.u);
      for (const s of [-1, 1] as const) {
        const px = p.x + s * g.halfW * 0.62;
        const py = this.linePoint(clamp(g.u + (s * g.halfW * 0.62) / (geo.lineB.x - geo.lineA.x), 0, 1)).y;
        gg.fillStyle = s < 0 ? 'rgb(244,196,96)' : 'rgb(232,124,110)';
        this.roundRect(gg, px - 3, py - 5, 6, 13, 2.5);
        gg.fill();
        gg.fillStyle = 'rgba(255,255,255,0.35)';
        gg.fillRect(px - 3, py - 5, 2, 13);
      }
    }
  }

  /** the union silhouette of a garment, deformed by its spine */
  private garmentPath(g: Garment): Path2D {
    const path = new Path2D();
    const prof = this.profile(g.kind);
    path.addPath(this.ribbon(g.spine, prof.map((p) => p * g.halfW), g.kind !== 'towel'));
    for (const L of g.limbs) {
      const lw = g.kind === 'pants' ? prof.map((p) => p * g.halfW) : L.nodes.map((_, i) => L.width * (1 - i * 0.12));
      path.addPath(this.ribbon(L.nodes, lw, true));
    }
    if (g.kind === 'pants') {
      // waistband bridging the two legs
      const a = g.spine[0];
      const b = g.limbs[0].nodes[0];
      const mid = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
      path.addPath(this.ribbon(mid, [g.halfW * 0.62, g.halfW * 0.62], false));
    }
    return path;
  }

  private profile(kind: Kind): number[] {
    switch (kind) {
      case 'shirt':
        return [0.62, 0.98, 0.82, 0.86];
      case 'pants':
        return [0.52, 0.48, 0.44, 0.38];
      case 'towel':
        return [1, 1, 0.98, 0.94];
      case 'sock':
        return [0.8, 1, 0.9, 0.62];
    }
  }

  private ribbon(pts: Array<{ x: number; y: number }>, hw: number[], roundEnd: boolean): Path2D {
    const n = pts.length;
    const L: Array<{ x: number; y: number }> = [];
    const R: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      const w = hw[Math.min(hw.length - 1, i)];
      L.push({ x: pts[i].x - dy * w, y: pts[i].y + dx * w });
      R.push({ x: pts[i].x + dy * w, y: pts[i].y - dx * w });
    }
    const p = new Path2D();
    p.moveTo(L[0].x, L[0].y);
    for (let i = 1; i < n - 1; i++) {
      const mx = (L[i].x + L[i + 1].x) / 2;
      const my = (L[i].y + L[i + 1].y) / 2;
      p.quadraticCurveTo(L[i].x, L[i].y, mx, my);
    }
    p.lineTo(L[n - 1].x, L[n - 1].y);
    if (roundEnd) {
      const last = pts[n - 1];
      const prev = pts[n - 2];
      let dx = last.x - prev.x;
      let dy = last.y - prev.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      const w = hw[Math.min(hw.length - 1, n - 1)];
      p.quadraticCurveTo(last.x + dx * w * 1.35, last.y + dy * w * 1.35, R[n - 1].x, R[n - 1].y);
    } else {
      p.lineTo(R[n - 1].x, R[n - 1].y);
    }
    for (let i = n - 2; i > 0; i--) {
      const mx = (R[i].x + R[i - 1].x) / 2;
      const my = (R[i].y + R[i - 1].y) / 2;
      p.quadraticCurveTo(R[i].x, R[i].y, mx, my);
    }
    p.lineTo(R[0].x, R[0].y);
    p.closePath();
    return p;
  }

  private drawGarment(gg: CanvasRenderingContext2D, g: Garment): void {
    if (g.state === 'basket' || g.state === 'inside') return;
    const path = this.garmentPath(g);
    const wetC = wetOf(g.base);

    // soft drop shadow so it reads against the sky
    gg.save();
    gg.translate(3, 4);
    gg.fillStyle = 'rgba(40,46,60,0.13)';
    gg.fill(path);
    gg.restore();

    const a = this.spinePoint(g, 0.35, -1.1);
    const b = this.spinePoint(g, 0.35, 1.1);
    const grd = gg.createLinearGradient(a.x, a.y, b.x, b.y);
    const lit = mix(g.base, [255, 250, 232], 0.3 * (1 - this.dim));
    const shade = mix(g.base, [58, 62, 84], 0.28);
    grd.addColorStop(0, rgb(lit));
    grd.addColorStop(0.42, rgb(g.base));
    grd.addColorStop(1, rgb(shade));
    gg.fillStyle = grd;
    gg.fill(path);

    gg.save();
    gg.clip(path);

    // fabric fold lines
    gg.strokeStyle = rgb(mix(g.base, [60, 64, 86], 0.22), 0.5);
    gg.lineWidth = 1.1;
    for (const tt of [0.3, 0.62]) {
      const p0 = this.spinePoint(g, tt * 0.5, -0.5);
      const p1 = this.spinePoint(g, tt, 0.1);
      const p2 = this.spinePoint(g, Math.min(1, tt + 0.3), 0.6);
      gg.beginPath();
      gg.moveTo(p0.x, p0.y);
      gg.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
      gg.stroke();
    }

    // wetness: a front creeping down from the top, plus the early spots
    if (g.front > 0.04 && g.wet > 0.01) {
      const top = this.spinePoint(g, 0, 0);
      const fr = this.spinePoint(g, clamp(g.front * 1.15, 0.05, 1.15), 0);
      const wg = gg.createLinearGradient(top.x, top.y, fr.x, fr.y);
      const al = 0.34 + 0.62 * g.wet;
      const soaked = g.front > 0.97;
      wg.addColorStop(0, rgb(wetC, al));
      wg.addColorStop(0.72, rgb(wetC, al * 0.94));
      wg.addColorStop(1, rgb(wetC, soaked ? al * 0.8 : 0));
      gg.fillStyle = wg;
      gg.fill(path);
    }
    for (const s of g.spots) {
      const p = this.spinePoint(g, s.t, s.u);
      const r = s.r * (1 + s.grow);
      const sg = gg.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      sg.addColorStop(0, rgb(wetC, 0.85));
      sg.addColorStop(0.62, rgb(wetC, 0.7));
      sg.addColorStop(1, rgb(wetC, 0));
      gg.fillStyle = sg;
      gg.beginPath();
      gg.arc(p.x, p.y, r, 0, Math.PI * 2);
      gg.fill();
    }
    // wet sheen
    if (g.wet > 0.35) {
      const p = this.spinePoint(g, 0.55, -0.45);
      const sh = gg.createRadialGradient(p.x, p.y, 0, p.x, p.y, g.halfW * 1.4);
      sh.addColorStop(0, `rgba(226,244,255,${0.16 * g.wet})`);
      sh.addColorStop(1, 'rgba(226,244,255,0)');
      gg.fillStyle = sh;
      gg.beginPath();
      gg.arc(p.x, p.y, g.halfW * 1.4, 0, Math.PI * 2);
      gg.fill();
    }

    this.drawGarmentDetail(gg, g);
    gg.restore();

    gg.strokeStyle = rgb(mix(g.base, [46, 50, 70], 0.42), 0.4);
    gg.lineWidth = 1.4;
    gg.stroke(path);
  }

  private drawGarmentDetail(gg: CanvasRenderingContext2D, g: Garment): void {
    const acc = rgb(g.accent, 0.9);
    const line = (t0: number, u0: number, t1: number, u1: number, w: number, c: string) => {
      const p0 = this.spinePoint(g, t0, u0);
      const p1 = this.spinePoint(g, t1, u1);
      gg.strokeStyle = c;
      gg.lineWidth = w;
      gg.lineCap = 'round';
      gg.beginPath();
      gg.moveTo(p0.x, p0.y);
      gg.lineTo(p1.x, p1.y);
      gg.stroke();
    };
    switch (g.kind) {
      case 'shirt': {
        // collar
        const c0 = this.spinePoint(g, 0.0, -0.42);
        const cL = this.spinePoint(g, 0.05, -0.16);
        const cM = this.spinePoint(g, 0.19, 0);
        const cR = this.spinePoint(g, 0.05, 0.16);
        const c2 = this.spinePoint(g, 0.0, 0.42);
        gg.fillStyle = acc;
        gg.beginPath();
        gg.moveTo(c0.x, c0.y);
        gg.lineTo(cL.x, cL.y);
        gg.lineTo(cM.x, cM.y);
        gg.lineTo(cR.x, cR.y);
        gg.lineTo(c2.x, c2.y);
        gg.closePath();
        gg.fill();
        line(0.16, 0.02, 1, 0.02, 1.6, rgb(mix(g.base, [120, 140, 170], 0.5), 0.8));
        // cuffs
        for (const L of g.limbs) {
          const n = L.nodes[L.nodes.length - 1];
          const m = L.nodes[L.nodes.length - 2];
          const dx = n.x - m.x;
          const dy = n.y - m.y;
          const d = Math.hypot(dx, dy) || 1;
          gg.strokeStyle = acc;
          gg.lineWidth = L.width * 1.9;
          gg.lineCap = 'butt';
          gg.beginPath();
          gg.moveTo(n.x - (dy / d) * L.width, n.y + (dx / d) * L.width);
          gg.lineTo(n.x + (dy / d) * L.width, n.y - (dx / d) * L.width);
          gg.stroke();
        }
        break;
      }
      case 'pants': {
        const a = g.spine[0];
        const b = g.limbs[0].nodes[0];
        gg.strokeStyle = acc;
        gg.lineWidth = g.halfW * 0.5;
        gg.lineCap = 'butt';
        gg.beginPath();
        gg.moveTo(a.x - g.halfW * 0.5, a.y + g.halfW * 0.1);
        gg.lineTo(b.x + g.halfW * 0.5, b.y + g.halfW * 0.1);
        gg.stroke();
        line(0.22, 0, 1, 0, 1.4, rgb(mix(g.base, [20, 30, 60], 0.4), 0.6));
        break;
      }
      case 'towel': {
        for (const t of [0.16, 0.82]) {
          line(t, -1.05, t, 1.05, g.halfW * 0.26, acc);
        }
        line(0.5, -1.05, 0.5, 1.05, g.halfW * 0.1, rgb(mix(g.base, [255, 255, 255], 0.5), 0.5));
        break;
      }
      case 'sock': {
        line(0.1, -1.1, 0.1, 1.1, g.halfW * 0.5, acc);
        const toe = this.spinePoint(g, 1, 0.55);
        gg.fillStyle = rgb(mix(g.base, [255, 236, 240], 0.55), 0.95);
        gg.beginPath();
        gg.ellipse(toe.x, toe.y, g.halfW * 0.7, g.halfW * 0.56, 0.3, 0, Math.PI * 2);
        gg.fill();
        break;
      }
    }
  }

  private drawRain(gg: CanvasRenderingContext2D, from: number, to: number): void {
    gg.lineCap = 'round';
    for (const d of this.drops) {
      if (d.layer < from || d.layer > to) continue;
      const a = d.layer === 0 ? 0.2 : d.layer === 1 ? 0.32 : 0.42;
      gg.strokeStyle = `rgba(216,236,252,${a})`;
      gg.lineWidth = d.layer === 0 ? 0.9 : d.layer === 1 ? 1.5 : 2.3;
      const k = d.len / Math.hypot(d.vx, d.vy);
      gg.beginPath();
      gg.moveTo(d.x, d.y);
      gg.lineTo(d.x - d.vx * k, d.y - d.vy * k);
      gg.stroke();
    }
    if (to >= 2) {
      // the telegraphed drops — fat, slow, impossible to miss
      for (const a of this.aimed) {
        gg.fillStyle = 'rgba(206,234,252,0.92)';
        gg.beginPath();
        gg.ellipse(a.x, a.y, 3.4, 6.4, 0, 0, Math.PI * 2);
        gg.fill();
        gg.fillStyle = 'rgba(255,255,255,0.8)';
        gg.beginPath();
        gg.ellipse(a.x - 1, a.y - 1.6, 1.1, 1.8, 0, 0, Math.PI * 2);
        gg.fill();
        gg.strokeStyle = 'rgba(206,234,252,0.28)';
        gg.lineWidth = 1.6;
        gg.beginPath();
        gg.moveTo(a.x, a.y - 8);
        gg.lineTo(a.x, a.y - 26);
        gg.stroke();
      }
    }
  }

  private drawBits(gg: CanvasRenderingContext2D): void {
    for (const b of this.bits) {
      const a = clamp(b.life / b.max, 0, 1);
      if (b.kind === 0) {
        gg.fillStyle = `rgba(226,242,254,${0.7 * a})`;
        gg.beginPath();
        gg.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        gg.fill();
      } else {
        const st = clamp(Math.abs(b.vy) / 420, 0, 1);
        gg.fillStyle = `rgba(160,204,236,${0.85 * a})`;
        gg.beginPath();
        gg.ellipse(b.x, b.y, b.r * (1 - st * 0.35), b.r * (1 + st * 1.5), 0, 0, Math.PI * 2);
        gg.fill();
        gg.fillStyle = `rgba(255,255,255,${0.5 * a})`;
        gg.beginPath();
        gg.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.34, 0, Math.PI * 2);
        gg.fill();
      }
    }
  }

  private drawLight(gg: CanvasRenderingContext2D): void {
    const { w, h } = this.geo;
    if (this.dim > 0.02) {
      // the doorway keeps its warm light: that is what makes it read as shelter
      const d = this.geo.door;
      gg.save();
      const cut = new Path2D();
      cut.rect(-w, -h, w * 3, h * 3);
      cut.rect(d.x + 8, d.y + 8, d.w - 16, d.h - 10);
      gg.clip(cut, 'evenodd');
      gg.globalCompositeOperation = 'multiply';
      const c = mix([255, 255, 255], [130, 144, 176], this.dim);
      gg.fillStyle = rgb(c);
      gg.fillRect(-w, -h, w * 3, h * 3);
      gg.restore();
    }
    if (this.beam > 0.02) {
      const s = this.geo.sun;
      gg.save();
      gg.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const spread = 0.08 + i * 0.075;
        const g2 = gg.createLinearGradient(s.x, s.y, s.x - w * 0.2, h);
        g2.addColorStop(0, `rgba(255,232,172,${0.055 * this.beam})`);
        g2.addColorStop(1, 'rgba(255,220,150,0)');
        gg.fillStyle = g2;
        gg.beginPath();
        gg.moveTo(s.x - w * spread * 0.3, s.y);
        gg.lineTo(s.x + w * spread * 0.3, s.y);
        gg.lineTo(s.x + w * spread * 1.5 - w * 0.22, h + 20);
        gg.lineTo(s.x - w * spread * 1.5 - w * 0.28, h + 20);
        gg.closePath();
        gg.fill();
      }
      gg.restore();
    }
    // vignette keeps the eye in the middle
    const v = gg.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.32, w / 2, h * 0.5, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(12,16,28,0.26)');
    gg.fillStyle = v;
    gg.fillRect(-w, -h, w * 3, h * 3);
  }

  // ---------------------------------------------------------------- input

  pointer(e: PointerEvt): void {
    this.pointerX = e.x;
    this.pointerY = e.y;
    if (e.type === 'down') {
      const g = this.pick(e.x, e.y);
      if (g) {
        this.grab(g);
      } else if (this.ctx.phase.is('comic', 'settle')) {
        this.leave();
      }
    } else if (e.type === 'up' && this.held) {
      this.release(this.held, e);
    }
  }

  private pick(x: number, y: number): Garment | null {
    let best: Garment | null = null;
    let bd = 1e9;
    for (const g of this.garments) {
      if (g.state === 'inside') continue;
      let d = 1e9;
      if (g.state === 'basket') {
        const s = this.basketSlot(g.slot);
        d = Math.hypot(x - s.x, y - s.y) - g.halfW;
      } else {
        const chains = [g.spine, ...g.limbs.map((L) => L.nodes)];
        for (const c of chains) {
          for (let i = 0; i < c.length - 1; i++) d = Math.min(d, segDist(x, y, c[i], c[i + 1]) - g.halfW * 0.85);
        }
      }
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    return bd < 30 ? best : null;
  }

  private grab(g: Garment): void {
    if (g.state === 'held') return;
    g.state = 'held';
    g.grabDX = 0;
    g.grabDY = 0;
    g.settle = 0.5;
    this.held = g;
    if (g.wet > 0.5 && g.gush <= 0) {
      g.gush = 0.55 + g.wet * 0.8;
      this.ctx.audio.gush(0.9 + g.wet * 0.5);
      this.shake = 0.4;
    } else {
      this.ctx.audio.whoosh(0.3, 0.3);
    }
  }

  private release(g: Garment, e: PointerEvt): void {
    this.held = null;
    const p = g.spine[0];
    const px = p.x + clamp(e.vx, -400, 400) * 0.06;
    const py = p.y + clamp(e.vy, -400, 400) * 0.06;
    const geo = this.geo;

    if (this.inDoor(px, py)) {
      g.slot = this.garments.filter((x) => x.state === 'inside').length;
      this.placeInside(g);
      this.ctx.audio.flump(g.wet);
      if (g.wet > 0.25) {
        for (let i = 0; i < 10; i++) {
          this.bits.push({
            x: p.x + this.rng.range(-g.halfW, g.halfW),
            y: p.y + g.rest,
            vx: this.rng.range(-30, 30),
            vy: this.rng.range(0, 120),
            life: 0.9,
            max: 0.9,
            r: 2,
            kind: 1,
          });
        }
      }
      return;
    }

    const span = geo.lineB.x - geo.lineA.x;
    const u = (px - geo.lineA.x) / span;
    const lp = this.linePoint(clamp(u, 0, 1));
    const nearLine = px > geo.lineA.x - 30 && px < geo.lineB.x + 30 && Math.abs(py - lp.y) < geo.h * 0.12;
    const b = geo.basket;
    const overBasket = Math.abs(px - b.x) < b.rx * 1.3 && Math.abs(py - b.y) < b.ry * 2.4;

    if (nearLine) {
      g.state = 'hung';
      g.u = this.freeSlot(clamp(u, 0, 1));
      const lp2 = this.linePoint(g.u);
      g.spine[0].x = lp2.x;
      g.spine[0].y = lp2.y;
      g.settle = 1;
      this.ctx.audio.flump(g.wet * 0.6);
    } else if (overBasket) {
      this.placeInBasket(g);
      this.ctx.audio.flump(g.wet);
    } else {
      g.state = 'loose';
      this.ctx.audio.flump(g.wet);
    }
  }

  // ---------------------------------------------------------------- dev

  readonly devActions: DevAction[] = [
    { name: 'hang:all', run: () => this.hangAll() },
    {
      name: 'rescue:all',
      run: () => {
        this.garments.forEach((g, i) => {
          g.slot = i;
          this.placeInside(g);
        });
        this.ending = 'saved';
        this.advance('resolve');
      },
    },
    { name: 'cloud:in', run: () => { this.cloudTarget = 0.62; this.dimTarget = 0.5; this.windTarget = 0.42; } },
    { name: 'drop:one', run: () => this.aimDrop(true) },
    { name: 'rain:start', run: () => { this.rainTarget = 1; this.dimTarget = 0.78; this.cloudTarget = 0.76; this.windTarget = 0.7; } },
    { name: 'rain:stop', run: () => { this.rainTarget = 0; this.dimTarget = 0; this.beamTarget = 1; } },
    { name: 'wind:gust', run: () => { this.gust = 0.9; this.ctx.audio.whoosh(1, 1.1); } },
    { name: 'sun:beam', run: () => { this.beamTarget = 1; this.dimTarget = 0; this.ctx.audio.bloom(); } },
    {
      name: 'demo:mid-drag',
      run: () => {
        const g = this.garments.find((x) => x.kind === 'shirt') ?? this.garments[0];
        const from = this.basketSlot(g.slot);
        const to = this.linePoint(this.geo.slots[1]);
        this.pointerX = lerp(from.x, to.x, 0.5);
        this.pointerY = lerp(from.y, to.y, 0.45);
        this.resetSpine(g, this.pointerX, this.pointerY);
        this.grab(g);
        for (let i = 0; i < 40; i++) {
          this.pointerX += 1.5;
          this.pointerY -= 2.3;
          this.stepGarment(g, 1 / 120, true);
        }
      },
    },
    {
      name: 'fail:soaked',
      run: () => {
        this.ctx.phase.set('resolve');
        this.ending = 'soaked';
        this.hangAll();
        for (const g of this.garments) {
          g.wet = 1;
          g.front = 1;
          g.spots = [];
          for (let k = 0; k < 160; k++) this.stepGarment(g, 1 / 120, true);
        }
        this.rain = 0.22;
        this.rainTarget = 0;
        this.cloud = 1.0;
        this.cloudTarget = 1.25;
        this.dim = 0.5;
        this.dimTarget = 0.18;
        this.beamTarget = 0.65;
        this.windTarget = 0.22;
        for (const p of this.puddles) p.a = 1;
      },
    },
    {
      name: 'fail:gush',
      run: () => {
        this.devActions.find((a) => a.name === 'fail:soaked')?.run();
        const g = this.garments[0];
        this.pointerX = g.spine[0].x;
        this.pointerY = g.spine[0].y - this.geo.h * 0.06;
        this.resetSpine(g, this.pointerX, this.pointerY);
        this.grab(g);
        for (let i = 0; i < 26; i++) this.stepGarment(g, 1 / 120, false);
      },
    },
    {
      name: 'fail:floor',
      run: () => {
        const g = this.garments[1];
        g.wet = 0.8;
        g.front = 1;
        this.placeInBasket(g, true);
        for (let k = 0; k < 120; k++) this.stepGarment(g, 1 / 120, true);
        this.rainTarget = 1;
        this.dimTarget = 0.9;
      },
    },
  ];

  devState(): Record<string, unknown> {
    return {
      phase: this.ctx.phase.name,
      phaseT: +this.ctx.phase.t.toFixed(2),
      intervening: this.ctx.phase.intervening,
      ending: this.ending,
      seed: this.rng.seed,
      orientation: this.geo?.o,
      rain: +this.rain.toFixed(2),
      dim: +this.dim.toFixed(2),
      wind: +this.wind.toFixed(2),
      cloud: +this.cloud.toFixed(2),
      beam: +this.beam.toFixed(2),
      firstDrop: this.firstDropDone,
      lastRescueAt: +this.lastRescueAt.toFixed(2),
      drops: this.drops.length,
      bits: this.bits.length,
      held: this.held?.kind ?? null,
      garments: this.garments.map((g) => ({
        kind: g.kind,
        state: g.state,
        wet: +g.wet.toFixed(2),
        front: +g.front.toFixed(2),
        u: +g.u.toFixed(2),
      })),
    };
  }

  // ---------------------------------------------------------------- hub tile

  thumbnail(gg: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    const cloud = ((t * 0.09) % 1.6) - 0.3;
    const dim = clamp((cloud - 0.1) * 1.4, 0, 1) * clamp((0.95 - cloud) * 3, 0, 1);
    const sky = gg.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, rgb(mix([84, 166, 224], [110, 120, 136], dim)));
    sky.addColorStop(0.7, rgb(mix([190, 224, 242], [154, 160, 170], dim)));
    sky.addColorStop(1, rgb(mix([240, 226, 200], [168, 172, 178], dim)));
    gg.fillStyle = sky;
    gg.fillRect(0, 0, w, h);

    gg.fillStyle = `rgba(255,246,212,${0.9 - dim * 0.8})`;
    gg.beginPath();
    gg.arc(w * 0.8, h * 0.2, h * 0.09, 0, Math.PI * 2);
    gg.fill();

    // cloud
    const cx = lerp(-w * 0.4, w * 1.4, cloud);
    gg.fillStyle = rgb(mix([255, 255, 255], [132, 138, 152], dim));
    gg.beginPath();
    for (const s of [
      [-0.5, 0.05, 0.5],
      [0, -0.2, 0.7],
      [0.5, 0.05, 0.55],
      [0.16, 0.16, 0.5],
    ]) {
      gg.moveTo(cx + s[0] * h * 0.3 + h * 0.2 * s[2], h * 0.22 + s[1] * h * 0.2);
      gg.arc(cx + s[0] * h * 0.3, h * 0.22 + s[1] * h * 0.2, h * 0.2 * s[2], 0, Math.PI * 2);
    }
    gg.fill();

    // floor + line
    gg.fillStyle = rgb(mix([216, 200, 178], [140, 142, 148], dim));
    gg.fillRect(0, h * 0.78, w, h * 0.22);
    gg.strokeStyle = 'rgba(70,66,62,0.7)';
    gg.lineWidth = 1.5;
    const ly = h * 0.36;
    gg.beginPath();
    gg.moveTo(0, ly);
    gg.quadraticCurveTo(w * 0.5, ly + h * 0.04, w, ly - h * 0.01);
    gg.stroke();

    // two small clothes swaying
    const items: Array<[number, string, string, number]> = [
      [0.32, 'rgb(246,248,252)', 'rgb(122,170,214)', 1],
      [0.66, 'rgb(86,116,170)', 'rgb(58,84,130)', 1.3],
    ];
    for (const [u, col, acc, ph] of items) {
      const x = w * u;
      const y = ly + h * 0.03 * Math.sin(Math.PI * u);
      const ang = Math.sin(t * 1.5 + ph) * (0.08 + dim * 0.1);
      const L = h * 0.3;
      const W = h * 0.14;
      gg.save();
      gg.translate(x, y);
      gg.rotate(ang);
      gg.fillStyle = col;
      gg.beginPath();
      gg.moveTo(-W, 0);
      gg.quadraticCurveTo(-W * 1.1, L * 0.6, -W * 0.8, L);
      gg.quadraticCurveTo(0, L * 1.12, W * 0.8, L);
      gg.quadraticCurveTo(W * 1.1, L * 0.6, W, 0);
      gg.closePath();
      gg.fill();
      if (dim > 0.25) {
        gg.fillStyle = `rgba(40,58,86,${0.35 * dim})`;
        gg.fillRect(-W, 0, W * 2, L * clamp(dim * 0.9, 0, 1));
      }
      gg.fillStyle = acc;
      gg.fillRect(-W * 0.45, 0, W * 0.9, L * 0.1);
      gg.restore();
    }

    // a drop
    if (dim > 0.4) {
      const dt2 = (t * 1.1) % 1.6;
      if (dt2 < 1) {
        gg.fillStyle = 'rgba(206,234,252,0.95)';
        gg.beginPath();
        gg.ellipse(w * 0.32, h * 0.12 + dt2 * h * 0.26, h * 0.022, h * 0.04, 0, 0, Math.PI * 2);
        gg.fill();
      }
    }
  }
}

function segDist(x: number, y: number, a: Node, b: Node): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1e-6;
  let t = ((x - a.x) * dx + (y - a.y) * dy) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
}

export const episode: Episode = new Laundry();
