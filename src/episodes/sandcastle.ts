/**
 * D. 砂の城と波 — sandcastle.
 *
 * A bright beach. Tip a bucket over on the dry sand and a tower of sand is
 * left standing. Four of them make a castle. Then the sea, which has been
 * quietly measuring the beach the whole time, arrives.
 *
 * Everything the player can touch lives in beach coordinates (s, u):
 *   s = 0 far out at sea ... 1 high up the dry beach (towards the camera)
 *   u = -1 .. +1 along the shore
 * A single bilinear map turns (s,u) into screen pixels, so portrait and
 * landscape are genuinely different compositions (sea above / sea to the
 * left) while the simulation never has to know which one it is.
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
/** fast out, slow in — how a sheet of water rushes up a beach */
const rushOut = (t: number): number => 1 - (1 - clamp(t, 0, 1)) ** 2.4;
const easeIn = (t: number): number => clamp(t, 0, 1) ** 2;

/** the colour of sand once the sea has touched it */
const wetSand = (c: RGB): RGB => [c[0] * 0.72, c[1] * 0.665, c[2] * 0.6];

const NB = 30; // lateral bins across the shoreline
const U0 = -1.25;
const U1 = 1.25;
/** how far past the play area the shoreline polylines are drawn */
const binU = (i: number): number => U0 + ((i + 0.5) * (U1 - U0)) / NB;

// ---------------------------------------------------------------- types

interface Pt {
  x: number;
  y: number;
}

interface Geo {
  w: number;
  h: number;
  o: Orientation;
  short: number;
  horizonY: number;
  /** bilinear corners: f = waterline end (s=0), n = dry end (s=1) */
  fA: Pt; // u = -1
  fB: Pt; // u = +1
  nA: Pt;
  nB: Pt;
  sclFar: number;
  sclNear: number;
  sun: Pt;
  /** where the bucket, shovel, flag, shells and the child live */
  home: { bucket: Pt; shovel: Pt; flag: Pt; shells: Pt[]; kid: Pt; crab: Pt };
  /** the middle of the buildable sand */
  build: { s: number; u: number };
}

interface Tower {
  s: number;
  u: number;
  /** 0..1 reveal as the bucket lifts */
  grow: number;
  /** 0..1 melted into a lump */
  slump: number;
  /** darkened, rounded-off base */
  wetBase: number;
  /** seeded wobble so no two towers are identical */
  seed: number;
  rMul: number;
  hMul: number;
  /** squash-bounce when it lands */
  bounce: number;
  crack: number;
  /** drag offset kept while a cluster is being pulled */
  dragS: number;
  dragU: number;
}

type DecoKind = 'flag' | 'shell';

interface Deco {
  kind: DecoKind;
  s: number;
  u: number;
  rot: number;
  /** index into towers, or -1 while it is lying on the sand */
  on: number;
  tilt: number;
  tiltV: number;
  hue: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  kind: 0 | 1 | 2 | 3; // sand | foam | spray | glint
  spin: number;
}

interface Scar {
  ax: number;
  au: number;
  bx: number;
  bu: number;
  w: number;
  age: number;
}

interface Wave {
  t: number;
  up: number;
  down: number;
  strength: number;
  peak: Float64Array;
  broke: boolean;
}

type BucketState = 'rest' | 'held' | 'tip' | 'fly';
type CrabMode = 'hidden' | 'sidle' | 'watch' | 'climb' | 'inside' | 'pop';
type Ending = 'none' | 'stood' | 'washed';

// ---------------------------------------------------------------- episode

class Sandcastle implements Episode {
  readonly id = 'sandcastle';
  readonly title = 'D. 砂の城と波 / sandcastle';

  private ctx!: EpisodeCtx;
  private rng = new Rng(1);
  private noise = makeNoise1d(1);
  private geo!: Geo;

  private t = 0;
  private fade = 1;
  private fadeOut = false;

  // --- sea ---------------------------------------------------------------
  private tideS = 0.16;
  private tideTarget = 0.16;
  private waveAmp = 0.035;
  private waveAmpTarget = 0.035;
  private waveStrength = 0.15;
  private waveEvery = 3.4;
  private waveTimer = 1.2;
  private wave: Wave | null = null;
  private reach = new Float64Array(NB);
  private wetS = new Float64Array(NB);
  private foamS = new Float64Array(NB);
  private foamA = new Float64Array(NB);
  private waveCount = 0;
  private surf = 0.1;
  private boatX = 0.2;
  private gullT = -4;

  // --- sand --------------------------------------------------------------
  private bermS = new Float64Array(NB);
  private bermH = new Float64Array(NB);
  private scars: Scar[] = [];
  private grains: Particle[] = [];

  // --- things ------------------------------------------------------------
  private towers: Tower[] = [];
  private deco: Deco[] = [];
  private bucket = {
    s: 0.86,
    u: 0.38,
    state: 'rest' as BucketState,
    tip: 0,
    lift: 0,
    fly: 0,
    fromS: 0,
    fromU: 0,
    wob: 0,
    poured: false,
  };
  private newTower: Tower | null = null;

  private crab = {
    mode: 'hidden' as CrabMode,
    s: 0.3,
    u: -1.15,
    ts: 0.3,
    tu: -1.15,
    face: 1,
    t: 0,
    wave: 0,
    tower: -1,
  };

  private kid = {
    nod: 0,
    clap: 0,
    blink: 0,
    blinkT: 2,
    look: 0,
    foam: 0,
    laugh: 0,
  };

  // --- beats -------------------------------------------------------------
  private ending: Ending = 'none';
  private admire = 0;
  private idle = 0;
  private nudge = 0;
  private comicT = 0;
  private sparkle = 0;
  private firstSheetDone = false;
  private toweringDone = false;

  // --- interaction -------------------------------------------------------
  private px = 0;
  private py = 0;
  private held: 'none' | 'bucket' | 'deco' | 'cluster' | 'berm' = 'none';
  private heldDeco = -1;
  private cluster: number[] = [];
  private clusterAnchor = { s: 0, u: 0 };
  private bermLast = { s: 0, u: 0 };
  private bermSound = 0;

  // --- camera ------------------------------------------------------------
  private camZ = 1;
  private camZT = 1;
  private camDrift = 0;
  private shake = 0;

  // ================================================================= setup

  init(ctx: EpisodeCtx): void {
    this.ctx = ctx;
    this.rng = ctx.rng;
    this.rng.reset();
    this.noise = makeNoise1d(this.rng.seed ^ 0x5eaf);
    this.t = 0;
    this.fade = 1;
    this.fadeOut = false;
    this.grains = [];
    this.scars = [];
    this.enterPhase('establish');
  }

  // ================================================================ layout

  layout(o: Orientation, w: number, h: number): void {
    const short = Math.min(w, h);
    const g: Geo = {
      w,
      h,
      o,
      short,
      horizonY: 0,
      fA: { x: 0, y: 0 },
      fB: { x: 0, y: 0 },
      nA: { x: 0, y: 0 },
      nB: { x: 0, y: 0 },
      sclFar: short * 0.075,
      sclNear: short * 0.3,
      sun: { x: 0, y: 0 },
      home: {
        bucket: { x: 0.87, y: 0.4 },
        shovel: { x: 0.9, y: 0.66 },
        flag: { x: 0.855, y: -0.2 },
        shells: [],
        kid: { x: 0.8, y: -0.72 },
        crab: { x: 0.9, y: -0.2 },
      },
      build: { s: 0.62, u: 0 },
    };

    if (o === 'portrait') {
      // sea above, castle in the middle, dry sand (safe) at the bottom
      g.horizonY = h * 0.215;
      g.fA = { x: w * 0.12, y: h * 0.4 };
      g.fB = { x: w * 0.88, y: h * 0.4 };
      g.nA = { x: -w * 0.06, y: h * 1.06 };
      g.nB = { x: w * 1.06, y: h * 1.06 };
      g.sun = { x: w * 0.78, y: h * 0.085 };
      g.home.bucket = { x: 0.775, y: 0.5 };
      g.home.shovel = { x: 0.805, y: 0.7 };
      g.home.flag = { x: 0.785, y: -0.06 };
      g.home.shells = [
        { x: 0.845, y: -0.44 },
        { x: 0.86, y: 0.2 },
      ];
      g.home.kid = { x: 0.715, y: -0.68 };
      g.home.crab = { x: 0.86, y: -0.18 };
      g.build = { s: 0.615, u: 0.0 };
    } else {
      // sea to the left, castle centre, dry sand (safe) to the right
      g.horizonY = h * 0.14;
      g.fA = { x: w * 0.34, y: h * 0.2 };
      g.fB = { x: w * 0.04, y: h * 0.72 };
      g.nA = { x: w * 0.78, y: h * 0.34 };
      g.nB = { x: w * 0.86, y: h * 1.1 };
      g.sun = { x: w * 0.18, y: h * 0.045 };
      g.home.bucket = { x: 0.8, y: -0.05 };
      g.home.shovel = { x: 0.95, y: -0.25 };
      g.home.flag = { x: 0.78, y: 0.62 };
      g.home.shells = [
        { x: 0.98, y: 0.55 },
        { x: 0.9, y: -0.45 },
      ];
      g.home.kid = { x: 0.92, y: 0.66 };
      g.home.crab = { x: 0.99, y: -0.85 };
      g.build = { s: 0.66, u: 0.0 };
    }

    this.geo = g;
  }

  // ------------------------------------------------------- beach <-> screen

  /** perspective compression: near the sea, equal steps of s cover less screen */
  private sK(s: number): number {
    return s * (0.45 + 0.55 * s);
  }

  private pos(s: number, u: number): Pt {
    const g = this.geo;
    const k = this.sK(s);
    const ax = g.fA.x + (g.nA.x - g.fA.x) * k;
    const ay = g.fA.y + (g.nA.y - g.fA.y) * k;
    const bx = g.fB.x + (g.nB.x - g.fB.x) * k;
    const by = g.fB.y + (g.nB.y - g.fB.y) * k;
    const t = (u + 1) / 2;
    return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
  }

  /** the size unit of an object standing at depth s */
  private scl(s: number): number {
    return lerp(this.geo.sclFar, this.geo.sclNear, this.sK(s));
  }

  /** screen point -> beach coords (inverse of the bilinear map, by search) */
  private inv(x: number, y: number): { s: number; u: number } {
    let s = 0.5;
    let u = 0;
    for (let i = 0; i < 26; i++) {
      const p = this.pos(s, u);
      const e = 0.004;
      const ps = this.pos(s + e, u);
      const pu = this.pos(s, u + e);
      const j00 = (ps.x - p.x) / e;
      const j10 = (ps.y - p.y) / e;
      const j01 = (pu.x - p.x) / e;
      const j11 = (pu.y - p.y) / e;
      const det = j00 * j11 - j01 * j10;
      if (Math.abs(det) < 1e-6) break;
      const rx = x - p.x;
      const ry = y - p.y;
      s += (j11 * rx - j01 * ry) / det;
      u += (-j10 * rx + j00 * ry) / det;
      s = clamp(s, -0.4, 1.5);
      u = clamp(u, -2.2, 2.2);
    }
    return { s, u };
  }

  // ================================================================ phases

  enterPhase(name: PhaseName): void {
    const ph = this.ctx.phase;
    if (ph.name !== name) ph.set(name);
    ph.intervening = name === 'trouble';

    this.held = 'none';
    this.heldDeco = -1;
    this.cluster = [];
    this.newTower = null;
    this.admire = 0;
    this.idle = 0;
    this.nudge = 0;
    this.comicT = 0;
    this.sparkle = 0;
    this.grains = [];
    this.waveCount = 0;
    this.wave = null;
    this.firstSheetDone = false;
    this.toweringDone = false;
    this.kid.foam = 0;
    this.kid.clap = 0;
    this.kid.nod = 0;
    this.kid.laugh = 0;
    this.kid.look = 0;
    this.shake = 0;

    const calm = (tide: number, amp: number, str: number, every: number): void => {
      this.tideS = this.tideTarget = tide;
      this.waveAmp = this.waveAmpTarget = amp;
      this.waveStrength = str;
      this.waveEvery = every;
      this.waveTimer = every * 0.45;
      for (let i = 0; i < NB; i++) {
        this.reach[i] = tide;
        this.wetS[i] = tide + amp * 0.8;
        this.foamS[i] = tide;
        this.foamA[i] = 0.25;
      }
    };

    const clearSand = (): void => {
      this.scars = [];
      this.bermH.fill(0);
      this.bermS.fill(0.75);
    };

    const resetProps = (): void => {
      const hm = this.geo.home;
      this.bucket.state = 'rest';
      this.bucket.s = hm.bucket.x;
      this.bucket.u = hm.bucket.y;
      this.bucket.tip = 0;
      this.bucket.lift = 0;
      this.bucket.wob = 0;
      this.bucket.poured = false;
      this.deco = [
        { kind: 'flag', s: hm.flag.x, u: hm.flag.y, rot: 1.05, on: -1, tilt: 0, tiltV: 0, hue: 0 },
        { kind: 'shell', s: hm.shells[0].x, u: hm.shells[0].y, rot: 0.4, on: -1, tilt: 0, tiltV: 0, hue: 0 },
        { kind: 'shell', s: hm.shells[1].x, u: hm.shells[1].y, rot: -0.7, on: -1, tilt: 0, tiltV: 0, hue: 1 },
      ];
    };

    switch (name) {
      case 'establish':
        this.ending = 'none';
        this.towers = [];
        clearSand();
        resetProps();
        calm(0.15, 0.06, 0.14, 3.6);
        this.crab.mode = 'hidden';
        this.crab.s = 0.28;
        this.crab.u = -1.2;
        this.camZ = 1.07;
        this.camZT = 1;
        this.surf = 0.08;
        this.boatX = 0.18;
        this.gullT = -3;
        break;

      case 'action':
        this.enterPhase('establish');
        this.ctx.phase.set('action');
        this.camZ = this.camZT = 1;
        break;

      case 'foreshadow':
        this.enterPhase('action');
        this.ctx.phase.set('foreshadow');
        this.buildCastle(4);
        this.tideS = 0.18;
        this.tideTarget = 0.4;
        this.waveAmp = 0.07;
        this.waveAmpTarget = 0.17;
        this.waveStrength = 0.3;
        this.waveEvery = 2.1;
        this.waveTimer = 0.5;
        this.crab.mode = 'sidle';
        this.crab.s = 0.44;
        this.crab.u = this.geo.home.crab.y - 0.7;
        this.crab.tu = this.geo.home.crab.y;
        this.crab.ts = this.geo.home.crab.x;
        this.crab.face = 1;
        this.surf = 0.3;
        break;

      case 'trouble': {
        this.enterPhase('foreshadow');
        this.ctx.phase.set('trouble');
        this.ctx.phase.intervening = true;
        this.tideS = 0.4;
        this.tideTarget = 0.47;
        this.waveAmp = 0.22;
        this.waveAmpTarget = 0.27;
        this.waveStrength = 0.75;
        this.waveEvery = 2.7;
        this.waveTimer = 0.7;
        this.crab.mode = 'watch';
        this.crab.s = this.geo.home.crab.x;
        this.crab.u = this.geo.home.crab.y;
        this.crab.face = -1;
        this.surf = 0.72;
        for (let i = 0; i < NB; i++) this.wetS[i] = 0.63 + this.noise(i * 0.35) * 0.008;
        for (const tw of this.towers) tw.wetBase = 0.25;
        break;
      }

      case 'resolve':
        this.enterPhase('trouble');
        this.ctx.phase.set('resolve');
        this.ctx.phase.intervening = false;
        for (const tw of this.towers) {
          tw.wetBase = 0.75;
          tw.slump = Math.min(0.5, tw.slump + 0.26);
        }
        this.bermH.fill(0);
        {
          const bu = this.geo.build.u;
          const span = this.geo.o === 'portrait' ? 0.72 : 0.5;
          for (let i = 0; i < NB; i++) {
            const d = Math.abs(binU(i) - bu);
            if (d > span) continue;
            this.bermS[i] = this.geo.build.s - 0.145;
            this.bermH[i] = Math.max(0, 0.6 * (1 - (d / span) ** 2));
          }
        }
        this.waveCount = 4;
        this.tideS = 0.5;
        this.tideTarget = 0.26;
        this.waveAmp = 0.16;
        this.waveAmpTarget = 0.07;
        this.waveStrength = 0.22;
        this.waveEvery = 3.2;
        this.waveTimer = 1.6;
        this.surf = 0.4;
        this.ending = 'stood';
        this.crab.mode = 'watch';
        this.crab.s = this.geo.home.crab.x + 0.02;
        this.crab.u = this.geo.home.crab.y;
        break;

      case 'comic':
        this.enterPhase('resolve');
        this.ctx.phase.set('comic');
        this.tideS = 0.34;
        this.tideTarget = 0.2;
        this.waveAmp = this.waveAmpTarget = 0.07;
        this.waveStrength = 0.16;
        this.waveEvery = 3.4;
        this.surf = 0.22;
        this.comicT = 0;
        this.armComic();
        break;

      case 'settle':
        this.enterPhase('comic');
        this.ctx.phase.set('settle');
        this.comicT = 3.6;
        this.kid.foam = this.ending === 'stood' ? 1 : 0;
        if (this.ending === 'stood') {
          this.crab.mode = 'climb';
          this.crab.t = 3;
        } else {
          this.crab.mode = 'pop';
          this.crab.t = 3;
        }
        break;
    }
  }

  /** forward transition during real play: keep the world, only arm the next beat */
  private advance(name: PhaseName): void {
    const ph = this.ctx.phase;
    ph.set(name);
    ph.intervening = name === 'trouble';
    switch (name) {
      case 'action':
        this.camZT = 1;
        break;
      case 'foreshadow':
        this.tideTarget = 0.38;
        this.waveAmpTarget = 0.17;
        this.waveStrength = 0.3;
        this.waveEvery = 2.1;
        this.waveTimer = Math.min(this.waveTimer, 0.9);
        this.crab.mode = 'sidle';
        this.crab.s = 0.44;
        this.crab.u = this.geo.home.crab.y - 0.72;
        this.crab.tu = this.geo.home.crab.y;
        this.crab.ts = this.geo.home.crab.x;
        this.crab.face = 1;
        this.ctx.audio.whoosh(0.4, 1.6);
        break;
      case 'trouble':
        this.tideTarget = 0.47;
        this.waveAmpTarget = 0.27;
        this.waveStrength = 0.4;
        this.waveEvery = 2.7;
        this.waveTimer = Math.min(this.waveTimer, 1.1);
        this.waveCount = 0;
        this.firstSheetDone = false;
        break;
      case 'resolve':
        // whatever the sea did reach has softened a little
        for (const t of this.towers) t.slump = Math.min(1, t.slump + t.wetBase * 0.2);
        this.decideEnding();
        this.tideTarget = 0.26;
        this.waveAmpTarget = 0.045;
        this.waveStrength = 0.22;
        this.waveEvery = 3.2;
        this.waveTimer = 1.4;
        break;
      case 'comic':
        this.comicT = 0;
        this.tideTarget = 0.2;
        this.armComic();
        break;
      default:
        break;
    }
  }

  private decideEnding(): void {
    const standing = this.towers.filter((t) => t.slump < 0.55 && t.grow > 0.5).length;
    this.ending = standing >= 2 || (this.towers.length > 0 && standing === this.towers.length) ? 'stood' : 'washed';
    if (this.towers.length === 0) this.ending = 'stood';
  }

  private armComic(): void {
    if (this.ending === 'stood') {
      this.crab.mode = 'climb';
      this.crab.t = 0;
      this.crab.face = -1;
      const spot = this.climbSpot();
      this.crab.s = spot.s + 0.12;
      this.crab.u = spot.u + 0.1;
    } else {
      this.crab.mode = 'inside';
      this.crab.t = 0;
      const flagOn = this.deco.find((d) => d.kind === 'flag')?.on ?? -1;
      let best = -1;
      let bs = -1;
      for (let i = 0; i < this.towers.length; i++) {
        if (i === flagOn) continue;
        if (this.towers[i].slump > 0.5 && this.towers[i].s > bs) {
          bs = this.towers[i].s;
          best = i;
        }
      }
      if (best < 0) best = flagOn;
      this.crab.tower = best;
    }
  }

  // ---------------------------------------------------------- castle setup

  private towerAt(s: number, u: number, grow = 1): Tower {
    return {
      s,
      u,
      grow,
      slump: 0,
      wetBase: 0,
      seed: this.rng.range(0, 100),
      rMul: this.rng.range(0.93, 1.07),
      hMul: this.rng.range(0.92, 1.1),
      bounce: 0,
      crack: 0,
      dragS: 0,
      dragU: 0,
    };
  }

  private buildCastle(n: number): void {
    const b = this.geo.build;
    const wide = this.geo.o === 'portrait';
    const du = wide ? 1 : 0.62;
    const ds = wide ? 1 : 1.4;
    const slots: Array<[number, number]> = [
      [b.s - 0.02 * ds, b.u - 0.52 * du],
      [b.s - 0.05 * ds, b.u - 0.17 * du],
      [b.s + 0.01 * ds, b.u + 0.18 * du],
      [b.s + 0.04 * ds, b.u + 0.52 * du],
      [b.s - 0.09 * ds, b.u + 0.02 * du],
    ];
    this.towers = [];
    for (let i = 0; i < Math.min(n, slots.length); i++) {
      this.towers.push(this.towerAt(slots[i][0], slots[i][1]));
    }
    // flag on the tallest, shells on two others
    const flag = this.deco.find((d) => d.kind === 'flag');
    if (flag && this.towers.length) {
      flag.on = Math.min(1, this.towers.length - 1);
      flag.rot = 0;
    }
    const shells = this.deco.filter((d) => d.kind === 'shell');
    if (shells[0] && this.towers.length > 2) shells[0].on = 2;
    if (shells[1] && this.towers.length > 3) shells[1].on = 3;
    this.toweringDone = true;
  }

  // ================================================================ update

  update(dt: number): void {
    this.t += dt;
    const ph = this.ctx.phase;
    ph.update(dt);

    this.updateBeats(dt);
    this.updateSea(dt);
    this.updateSand(dt);
    this.updateBucket(dt);
    this.updateTowers(dt);
    this.updateDeco(dt);
    this.updateCrab(dt);
    this.updateKid(dt);
    this.updateParticles(dt);

    const k = 1 - Math.exp(-dt * 1.8);
    this.camZ += (this.camZT - this.camZ) * k;
    this.camDrift = Math.sin(this.t * 0.14) * this.geo.short * 0.013;
    this.shake = Math.max(0, this.shake - dt * 2.4);

    this.ctx.audio.bed('surf', this.surf * 0.09, 420 + this.surf * 760);

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

  private leave(): void {
    if (!this.fadeOut) this.fadeOut = true;
  }

  private updateBeats(dt: number): void {
    const ph = this.ctx.phase;
    if (this.held === 'none' && this.bucket.state === 'rest') this.idle += dt;
    else this.idle = 0;

    switch (ph.name) {
      case 'establish':
        if (ph.t > 2.5 && this.held === 'none') this.advance('action');
        break;

      case 'action': {
        const built = this.towers.filter((t) => t.grow > 0.9).length;
        const flag = this.deco.find((d) => d.kind === 'flag');
        const done = built >= 4 || (!!flag && flag.on >= 0 && built >= 1);
        if (done && !this.toweringDone) {
          this.toweringDone = true;
          this.sparkle = 1;
          this.kid.nod = 1;
          this.ctx.audio.bloom();
          this.sparkleBurst();
        }
        if (this.toweringDone && this.held === 'none' && this.bucket.state === 'rest') {
          this.admire += dt;
          if (this.admire > 0.95) this.advance('foreshadow');
        } else if (!this.toweringDone) {
          // the tide is not going to wait forever
          if (built >= 1 && this.idle > 11) this.advance('foreshadow');
          // a small world-cue: the bucket settles a grain or two
          this.nudge -= dt;
          if (this.idle > 5 && this.nudge <= 0) {
            this.nudge = 4.5;
            this.bucket.wob = 1;
            this.kid.look = 1;
            for (let i = 0; i < 5; i++) this.spillGrain(this.bucket.s, this.bucket.u, 0.5);
          }
        }
        break;
      }

      case 'foreshadow':
        if (ph.t > 6.4) this.advance('trouble');
        break;

      case 'trouble':
        if (this.waveCount >= 4 && !this.wave && ph.t > 9) this.advance('resolve');
        else if (ph.t > 16) this.advance('resolve');
        break;

      case 'resolve':
        if (ph.t > 3.1) this.advance('comic');
        break;

      case 'comic':
        this.comicT += dt;
        if (this.comicT > 3.6) this.advance('settle');
        break;

      case 'settle':
        if (ph.t > 7 && this.held === 'none' && this.bucket.state === 'rest') this.leave();
        break;
    }
  }

  // ------------------------------------------------------------------- sea

  private updateSea(dt: number): void {
    const k = (rate: number): number => 1 - Math.exp(-rate * dt);
    this.tideS += (this.tideTarget - this.tideS) * k(0.28);
    this.waveAmp += (this.waveAmpTarget - this.waveAmp) * k(0.4);

    const wantSurf = clamp(0.08 + (this.tideS - 0.15) * 1.25 + this.waveAmp * 2.2, 0.05, 1);
    this.surf += (wantSurf - this.surf) * k(0.6);

    this.boatX += dt * 0.0055;
    if (this.boatX > 1.25) this.boatX = -0.25;
    this.gullT += dt;
    if (this.gullT > 22) this.gullT = -this.rng.range(3, 9);

    // spawn waves on a rhythm
    this.waveTimer -= dt;
    if (this.waveTimer <= 0 && !this.wave) {
      this.waveTimer = this.waveEvery * this.rng.range(0.9, 1.12);
      this.spawnWave(this.waveStrength);
    }

    // current reach per bin
    const lap = 0.008 * Math.sin(this.t * 1.3);
    for (let i = 0; i < NB; i++) this.reach[i] = this.tideS + lap * (0.6 + 0.4 * this.noise(i * 0.7));

    const wv = this.wave;
    if (wv) {
      wv.t += dt;
      const total = wv.up + wv.down;
      let p: number;
      if (wv.t < wv.up) p = rushOut(wv.t / wv.up);
      else p = 1 - easeIn((wv.t - wv.up) / wv.down);
      p = clamp(p, 0, 1);
      const rising = wv.t < wv.up;

      if (!wv.broke && wv.t > wv.up * 0.28) {
        wv.broke = true;
        if (wv.strength > 0.45) {
          this.ctx.audio.gush(0.55 + wv.strength * 0.7);
          this.shake = Math.max(this.shake, wv.strength * 0.42);
        } else {
          this.ctx.audio.whoosh(0.3 + wv.strength, 0.6);
        }
      }

      const blocked: number[] = [];
      for (let i = 0; i < NB; i++) {
        let r = lerp(this.tideS, wv.peak[i], p);
        const bh = this.bermH[i];
        const bs = this.bermS[i];
        if (bh > 0.06 && bs > this.tideS && r > bs - 0.005) {
          // the berm holds until the sea out-muscles it
          const over = (wv.strength * 0.9 + (r - bs) * 2.4) - bh * 1.5;
          const stop = bs - 0.006 + Math.max(0, over) * 0.09;
          if (stop < r) {
            blocked.push(i);
            if (rising) {
              this.bermH[i] = Math.max(0, bh - dt * (0.1 + wv.strength * 0.28));
              if (this.rng.next() < 0.5) this.splashAt(bs, binU(i), wv.strength);
            }
            r = stop;
          }
        }
        this.reach[i] = Math.max(this.reach[i], r);
      }
      // water that cannot climb the berm goes round it
      if (blocked.length) {
        for (const i of blocked) {
          for (const j of [i - 1, i + 1, i - 2, i + 2]) {
            if (j < 0 || j >= NB) continue;
            if (this.bermH[j] > 0.06) continue;
            this.reach[j] = Math.min(wv.peak[j] + 0.03, this.reach[j] + 0.012);
          }
        }
      }

      if (wv.t > total) {
        this.wave = null;
        // streaks left behind
        for (let i = 0; i < NB; i += 2) this.foamA[i] = Math.max(this.foamA[i], 0.5);
      }
    }

    // wet mark + foam memory
    for (let i = 0; i < NB; i++) {
      if (this.reach[i] > this.wetS[i]) {
        this.wetS[i] = this.reach[i];
        this.foamS[i] = this.reach[i];
        this.foamA[i] = 1;
      } else {
        this.wetS[i] = Math.max(this.tideS, this.wetS[i] - dt * 0.022);
        this.foamS[i] += (this.reach[i] - this.foamS[i]) * (1 - Math.exp(-dt * 1.4));
        this.foamA[i] = Math.max(0, this.foamA[i] - dt * 0.55);
      }
    }
  }

  private spawnWave(strength: number): void {
    const peak = new Float64Array(NB);
    const off = this.rng.range(0, 40);
    const bulge = this.rng.range(-0.7, 0.7);
    for (let i = 0; i < NB; i++) {
      const u = binU(i);
      const n = this.noise(off + i * 0.55) * 0.5 + 0.5;
      const env = 0.82 + 0.3 * Math.cos((u - bulge) * 1.5);
      peak[i] = this.tideS + this.waveAmp * env * (0.8 + 0.4 * n) * (0.62 + strength * 0.42);
    }
    this.wave = {
      t: 0,
      up: lerp(1.05, 0.72, clamp(strength, 0, 1)),
      down: lerp(1.5, 2.1, clamp(strength, 0, 1)),
      strength,
      peak,
      broke: false,
    };
    this.waveCount++;
    if (this.ctx.phase.is('trouble')) {
      this.waveStrength = Math.min(1.05, this.waveStrength + 0.19);
      this.waveAmpTarget = Math.min(0.34, this.waveAmpTarget + 0.024);
    }
  }

  private waterAtU(u: number): number {
    const f = ((u - U0) / (U1 - U0)) * NB - 0.5;
    const i = Math.floor(f);
    const t = f - i;
    const a = this.reach[clamp(i, 0, NB - 1)];
    const b = this.reach[clamp(i + 1, 0, NB - 1)];
    return lerp(a, b, clamp(t, 0, 1));
  }

  private binOf(u: number): number {
    return clamp(Math.round(((u - U0) / (U1 - U0)) * NB - 0.5), 0, NB - 1);
  }

  // ------------------------------------------------------------------ sand

  private updateSand(dt: number): void {
    for (let i = 0; i < NB; i++) {
      if (this.bermH[i] > 0) this.bermH[i] = Math.max(0, this.bermH[i] - dt * 0.012);
    }
    for (let i = this.scars.length - 1; i >= 0; i--) {
      this.scars[i].age += dt;
      if (this.scars[i].age > 26) this.scars.splice(i, 1);
    }
    this.bermSound = Math.max(0, this.bermSound - dt);
  }

  // ---------------------------------------------------------------- bucket

  private updateBucket(dt: number): void {
    const b = this.bucket;
    b.wob = Math.max(0, b.wob - dt * 2.2);

    if (b.state === 'held') {
      const k = 1 - Math.exp(-dt * 20);
      const target = this.inv(this.px, this.py - this.scl(b.s) * 0.28);
      b.s += (clamp(target.s, 0.16, 1.02) - b.s) * k;
      b.u += (clamp(target.u, -1.15, 1.15) - b.u) * k;
      b.lift += (0.22 - b.lift) * k;
    } else if (b.state === 'tip') {
      b.tip += dt / 1.05;
      const p = b.tip;
      const t = this.newTower;
      if (t) {
        // sand slides out from under the rising bucket
        if (p < 0.34) {
          t.grow = 0;
        } else if (p < 0.78) {
          t.grow = (p - 0.34) / 0.44;
          if (!b.poured) {
            b.poured = true;
            this.ctx.audio.flump(0.15);
          }
          for (let i = 0; i < 3; i++) this.spillRim(t, 0.9);
        } else {
          t.grow = 1;
        }
      }
      if (p >= 0.78 && b.lift < 1) {
        b.lift = 1;
        if (t) {
          t.bounce = 1;
          this.ctx.audio.thump(1.35);
          for (let i = 0; i < 14; i++) this.spillGrain(t.s, t.u, 1.4);
        }
      }
      if (p >= 1) {
        b.state = 'fly';
        b.fly = 0;
        b.fromS = b.s;
        b.fromU = b.u;
        this.newTower = null;
      }
    } else if (b.state === 'fly') {
      b.fly += dt / 0.45;
      const hm = this.geo.home;
      const e = smooth(b.fly);
      b.s = lerp(b.fromS, hm.bucket.x, e);
      b.u = lerp(b.fromU, hm.bucket.y, e);
      b.tip = lerp(1, 0, smooth(clamp((b.fly - 0.25) / 0.6, 0, 1)));
      b.lift = Math.sin(Math.PI * clamp(b.fly, 0, 1)) * 0.5;
      if (b.fly >= 1) {
        b.state = 'rest';
        b.tip = 0;
        b.lift = 0;
        b.poured = false;
        this.ctx.audio.flump(0);
      }
    } else {
      b.lift *= Math.exp(-dt * 8);
    }
  }

  // ---------------------------------------------------------------- towers

  private updateTowers(dt: number): void {
    for (const t of this.towers) {
      t.bounce = Math.max(0, t.bounce - dt * 3.2);
      const i = this.binOf(t.u);
      const water = this.reach[i];
      const front = t.s - this.towerRS(t);
      const depth = water - front;
      if (depth > 0) {
        const str = this.wave ? this.wave.strength : 0.12;
        const bite = clamp(depth * 6, 0, 1);
        t.wetBase = Math.min(1, t.wetBase + dt * (0.9 + str) * bite);
        // a thin first sheet only wets the base; real waves take the sand away
        const eat = Math.max(0, str - 0.26) * bite * dt * 0.3;
        if (eat > 0) {
          t.slump = Math.min(1, t.slump + eat);
          if (this.rng.next() < 0.4) this.spillGrain(t.s - this.towerRS(t) * 0.5, t.u, 0.7, true);
          if (t.slump > 0.62 && t.crack < 1) {
            t.crack = 1;
            this.ctx.audio.flump(0.6);
          }
        }
        if (!this.firstSheetDone && this.ctx.phase.is('trouble')) {
          this.firstSheetDone = true;
          this.ctx.audio.plip(0.7);
        }
      } else {
        t.wetBase = Math.max(0, t.wetBase - dt * 0.055);
      }
    }
  }

  /** a tower's radius expressed in beach-s units (for water tests) */
  private towerRS(t: Tower): number {
    const p = this.pos(t.s, t.u);
    const r = this.scl(t.s) * 0.32;
    // how much s one pixel of "towards the sea" is worth, locally
    const q = this.pos(t.s - 0.03, t.u);
    const d = Math.hypot(p.x - q.x, p.y - q.y) || 1;
    return (0.03 * r) / d;
  }

  private towerTop(t: Tower): { x: number; y: number; r: number } {
    const p = this.pos(t.s, t.u);
    const sc = this.scl(t.s);
    const grow = smooth(t.grow);
    const h = sc * 1.02 * grow * t.hMul * (1 - t.slump * 0.76) * (1 - t.bounce * 0.1);
    const r = sc * 0.32 * t.rMul * (1 + t.slump * 0.55);
    return { x: p.x, y: p.y - h, r: r * lerp(0.82, 0.3, t.slump) };
  }

  private linked(i: number, j: number): boolean {
    const a = this.towers[i];
    const b = this.towers[j];
    if (!a || !b) return false;
    const pa = this.pos(a.s, a.u);
    const pb = this.pos(b.s, b.u);
    const ra = this.scl(a.s) * 0.32 * a.rMul;
    const rb = this.scl(b.s) * 0.32 * b.rMul;
    return Math.hypot(pa.x - pb.x, pa.y - pb.y) < (ra + rb) * 1.95;
  }

  private clusterOf(start: number): number[] {
    const out = [start];
    const seen = new Set<number>([start]);
    for (let q = 0; q < out.length; q++) {
      for (let j = 0; j < this.towers.length; j++) {
        if (seen.has(j)) continue;
        if (this.linked(out[q], j)) {
          seen.add(j);
          out.push(j);
        }
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ deco

  private updateDeco(dt: number): void {
    for (const d of this.deco) {
      if (d.on >= 0) {
        const t = this.towers[d.on];
        if (!t) {
          d.on = -1;
          continue;
        }
        const want = d.kind === 'flag' ? t.slump * 0.42 : t.slump * 0.5;
        d.tiltV += (want - d.tilt) * dt * 26 - d.tiltV * dt * 7;
        d.tilt += d.tiltV * dt;
      } else {
        d.tilt *= Math.exp(-dt * 4);
      }
    }
  }

  // ------------------------------------------------------------------ crab

  private updateCrab(dt: number): void {
    const c = this.crab;
    c.t += dt;
    const step = (sp: number): void => {
      const ds = c.ts - c.s;
      const du = c.tu - c.u;
      const d = Math.hypot(ds * 1.4, du) || 1;
      const v = Math.min(d, sp * dt);
      c.s += (ds / d) * v * 1.4;
      c.u += (du / d) * v;
      if (du > 0.002) c.face = 1;
      else if (du < -0.002) c.face = -1;
    };
    switch (c.mode) {
      case 'hidden':
        break;
      case 'sidle': {
        step(0.3);
        if (Math.hypot((c.ts - c.s) * 1.4, c.tu - c.u) < 0.04) {
          c.mode = 'watch';
          c.face = -1;
        }
        break;
      }
      case 'watch': {
        // keeps backing away from the water
        const w = this.waterAtU(c.u);
        if (c.s < w + 0.12) {
          c.ts = Math.min(1.0, w + 0.22);
          c.tu = clamp(c.u + 0.05, -1, 1);
          step(0.5);
        }
        break;
      }
      case 'climb': {
        const spot = this.climbSpot();
        c.ts = spot.s;
        c.tu = spot.u;
        step(0.36);
        if (Math.hypot((c.ts - c.s) * 1.4, c.tu - c.u) < 0.06) c.face = -1;
        break;
      }
      case 'inside': {
        const t = this.towers[c.tower];
        if (t) {
          c.s = t.s;
          c.u = t.u;
        }
        if (c.t > 0.75) {
          c.mode = 'pop';
          c.t = 0;
          this.ctx.audio.blip();
        }
        break;
      }
      case 'pop':
        c.wave = clamp((c.t - 1.5) * 1.4, 0, 1);
        break;
    }
  }

  /** the shoulder of the berm (or the castle) where a crab can sit and stare at the sea */
  private climbSpot(): { s: number; u: number } {
    let bs = 0;
    let bu = 0;
    let best = -1;
    for (let i = 0; i < NB; i++) {
      if (this.bermH[i] < 0.12) continue;
      const q = this.pos(this.bermS[i], binU(i));
      let clearOf = 1e9;
      for (const tw of this.towers) {
        const tp = this.pos(tw.s, tw.u);
        clearOf = Math.min(clearOf, Math.hypot(q.x - tp.x, q.y - tp.y) / (this.scl(tw.s) || 1));
      }
      const score = this.bermH[i] * 0.5 + Math.min(clearOf, 1.6);
      if (score > best) {
        best = score;
        bs = this.bermS[i];
        bu = binU(i);
      }
    }
    if (best < 0) {
      const t = this.towers[0];
      if (t) return { s: t.s + this.towerRS(t) * 1.8, u: t.u };
      return { s: this.geo.build.s - 0.08, u: this.geo.build.u };
    }
    return { s: bs, u: bu };
  }

  // ------------------------------------------------------------------- kid

  private updateKid(dt: number): void {
    const k = this.kid;
    k.blinkT -= dt;
    if (k.blinkT <= 0) {
      k.blink = 0.15;
      k.blinkT = this.rng.range(2.2, 5.2);
    }
    k.blink = Math.max(0, k.blink - dt);
    k.nod = Math.max(0, k.nod - dt * 1.1);
    k.look = Math.max(0, k.look - dt * 0.7);
    const ph = this.ctx.phase;
    if (ph.is('comic', 'settle') && this.ending === 'stood') {
      const c = this.comicT;
      k.clap = c > 0.35 && c < 1.0 ? smooth((c - 0.35) / 0.2) * (1 - smooth((c - 0.7) / 0.3)) : 0;
      if (c > 0.72 && k.foam <= 0) {
        k.foam = 1;
        this.ctx.audio.plip(1.5);
      }
    } else if (ph.is('comic', 'settle')) {
      k.laugh = smooth((this.comicT - 0.8) / 0.6);
    }
    if (k.clap > 0.55 && !this.clapped) {
      this.clapped = true;
      this.ctx.audio.thump(2.2);
    }
    if (k.clap < 0.1) this.clapped = false;
  }

  private clapped = false;

  // ------------------------------------------------------------- particles

  private spillGrain(s: number, u: number, power: number, wet = false): void {
    const p = this.pos(s, u);
    const sc = this.scl(s);
    this.grains.push({
      x: p.x + this.rng.range(-sc * 0.3, sc * 0.3),
      y: p.y - this.rng.range(0, sc * 0.2),
      vx: this.rng.range(-1, 1) * 40 * power,
      vy: -this.rng.range(10, 90) * power,
      life: this.rng.range(0.35, 0.8),
      max: 0.8,
      r: sc * this.rng.range(0.012, 0.03),
      kind: wet ? 1 : 0,
      spin: 0,
    });
  }

  /** sand shrugging off the edge of the tower as the mould comes away */
  private spillRim(t: Tower, power: number): void {
    const p = this.pos(t.s, t.u);
    const sc = this.scl(t.s);
    const h = sc * 1.02 * t.hMul * clamp(t.grow, 0, 1);
    const a = this.rng.range(0, Math.PI * 2);
    const drop = this.rng.range(0, 0.75);
    this.grains.push({
      x: p.x + Math.cos(a) * sc * (0.3 + drop * 0.1),
      y: p.y - h * (1 - drop) + Math.sin(a) * sc * 0.09,
      vx: Math.cos(a) * 30 * power,
      vy: this.rng.range(20, 120) * power,
      life: this.rng.range(0.4, 0.85),
      max: 0.85,
      r: sc * this.rng.range(0.035, 0.075),
      kind: 0,
      spin: 0,
    });
  }

  private splashAt(s: number, u: number, strength: number): void {
    const p = this.pos(s, u);
    const sc = this.scl(s);
    const n = 2 + Math.floor(strength * 5);
    for (let i = 0; i < n; i++) {
      this.grains.push({
        x: p.x + this.rng.range(-sc * 0.2, sc * 0.2),
        y: p.y,
        vx: this.rng.range(-70, 70) * (0.4 + strength),
        vy: -this.rng.range(70, 240) * (0.4 + strength),
        life: this.rng.range(0.4, 0.85),
        max: 0.85,
        r: sc * this.rng.range(0.016, 0.042),
        kind: 2,
        spin: 0,
      });
    }
    if (this.rng.next() < 0.25) this.ctx.audio.plip(this.rng.range(0.8, 1.4));
  }

  private sparkleBurst(): void {
    for (const t of this.towers) {
      const top = this.towerTop(t);
      for (let i = 0; i < 9; i++) {
        const a = this.rng.range(0, Math.PI * 2);
        this.grains.push({
          x: top.x + Math.cos(a) * top.r * 0.9,
          y: top.y + Math.sin(a) * top.r * 0.32,
          vx: Math.cos(a) * 20,
          vy: -this.rng.range(28, 90),
          life: this.rng.range(0.55, 1.1),
          max: 1.1,
          r: this.scl(t.s) * this.rng.range(0.014, 0.03),
          kind: 3,
          spin: this.rng.range(0, 6),
        });
      }
    }
  }

  private updateParticles(dt: number): void {
    this.sparkle = Math.max(0, this.sparkle - dt * 0.7);
    for (let i = this.grains.length - 1; i >= 0; i--) {
      const g = this.grains[i];
      g.life -= dt;
      g.vy += (g.kind === 2 ? 620 : 900) * dt;
      g.vx *= 1 - dt * (g.kind === 2 ? 1.2 : 2.2);
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      g.spin += dt * 9;
      if (g.life <= 0) this.grains.splice(i, 1);
    }
  }

  // ================================================================ render

  private pal(): {
    skyTop: RGB;
    skyLow: RGB;
    haze: RGB;
    seaDeep: RGB;
    seaMid: RGB;
    seaShallow: RGB;
    dry: RGB;
    dryShade: RGB;
    wet: RGB;
  } {
    // the day stays bright, but as the surf builds the light cools a shade
    const c = clamp((this.surf - 0.25) * 0.95, 0, 0.55);
    const dry = mix([238, 214, 172], [206, 200, 186], c * 0.5);
    return {
      skyTop: mix([84, 164, 224], [86, 140, 186], c),
      skyLow: mix([178, 220, 240], [178, 200, 216], c),
      haze: mix([240, 238, 224], [216, 222, 222], c),
      seaDeep: mix([24, 106, 146], [18, 84, 122], c),
      seaMid: mix([38, 152, 178], [30, 128, 158], c),
      seaShallow: mix([108, 204, 198], [92, 184, 186], c),
      dry,
      dryShade: mix([206, 176, 130], [180, 168, 148], c * 0.5),
      wet: wetSand(dry),
    };
  }

  render(gg: CanvasRenderingContext2D): void {
    const { w, h } = this.geo;
    const P = this.pal();

    gg.save();
    const sx = this.shake ? Math.sin(this.t * 52) * this.shake * 3.4 : 0;
    const sy = this.shake ? Math.cos(this.t * 61) * this.shake * 2.2 : 0;
    gg.translate(w / 2 + sx, h / 2 + sy);
    gg.scale(this.camZ, this.camZ);
    gg.translate(-w / 2, -h / 2);

    this.drawSky(gg, P);
    this.drawSand(gg, P);
    this.drawWetBand(gg, P);
    this.drawSea(gg, P);
    this.drawWater(gg, P);
    this.drawBerm(gg, P);
    this.drawWorld(gg);
    this.drawParticles(gg);
    this.drawLight(gg);
    gg.restore();

    if (this.fade > 0.001) {
      gg.fillStyle = `rgba(8,10,16,${this.fade})`;
      gg.fillRect(0, 0, w, h);
    }
  }

  // ------------------------------------------------------------------- sky

  private drawSky(gg: CanvasRenderingContext2D, P: ReturnType<Sandcastle['pal']>): void {
    const { w, h, horizonY } = this.geo;
    const grd = gg.createLinearGradient(0, -h * 0.12, 0, horizonY + 6);
    grd.addColorStop(0, rgb(P.skyTop));
    grd.addColorStop(0.62, rgb(P.skyLow));
    grd.addColorStop(1, rgb(P.haze));
    gg.fillStyle = grd;
    gg.fillRect(-w, -h, w * 3, horizonY + h + 8);

    // sun and its haze
    const s = this.geo.sun;
    const r = this.geo.short * 0.075;
    const g2 = gg.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 5);
    g2.addColorStop(0, 'rgba(255,252,226,0.95)');
    g2.addColorStop(0.14, 'rgba(255,244,196,0.42)');
    g2.addColorStop(1, 'rgba(255,238,180,0)');
    gg.fillStyle = g2;
    gg.beginPath();
    gg.arc(s.x, s.y, r * 5, 0, Math.PI * 2);
    gg.fill();

    // far clouds, drifting slowly (the slowest parallax layer)
    const par = this.camDrift * 0.3;
    const rr = new Rng((this.rng.seed ^ 0x1f7b) >>> 0);
    for (let i = 0; i < 7; i++) {
      const base = rr.range(-0.2, 1.2);
      const cx = ((base + this.t * 0.0035 + 1.4) % 1.7) * w * 1.15 - w * 0.2 + par;
      const cy = horizonY * rr.range(0.16, 0.6);
      const cr = this.geo.short * rr.range(0.03, 0.062);
      gg.save();
      gg.globalAlpha = 0.75;
      for (let pass = 0; pass < 2; pass++) {
        gg.fillStyle = pass === 0 ? 'rgba(206,222,238,0.85)' : 'rgb(255,255,255)';
        gg.beginPath();
        for (let k = 0; k < 5; k++) {
          const f = k / 4;
          const x = cx + (f - 0.5) * cr * 3.1;
          const y = cy + Math.sin(f * 3.1) * cr * 0.12 + (pass === 0 ? cr * 0.16 : 0);
          const rad = cr * (0.44 + 0.56 * Math.sin(Math.PI * f) ** 0.7);
          gg.moveTo(x + rad, y);
          gg.arc(x, y, rad, 0, Math.PI * 2);
        }
        gg.fill();
      }
      gg.restore();
    }

    // a gull, once in a while
    if (this.gullT > 0 && this.gullT < 12) {
      const f = this.gullT / 12;
      const gx = lerp(-w * 0.1, w * 1.1, this.geo.o === 'portrait' ? f : 1 - f);
      const gy = horizonY * (0.36 + 0.12 * Math.sin(f * 5)) + Math.sin(this.t * 0.9) * 4;
      const sc = this.geo.short * 0.028;
      const flap = Math.sin(this.t * 5.5) * 0.5 + 0.5;
      gg.strokeStyle = 'rgba(58,72,88,0.78)';
      gg.lineWidth = Math.max(1.2, sc * 0.16);
      gg.lineCap = 'round';
      gg.beginPath();
      gg.moveTo(gx - sc, gy + flap * sc * 0.38);
      gg.quadraticCurveTo(gx - sc * 0.4, gy - sc * 0.3 * flap, gx, gy);
      gg.quadraticCurveTo(gx + sc * 0.4, gy - sc * 0.3 * flap, gx + sc, gy + flap * sc * 0.38);
      gg.stroke();
    }
  }

  // ------------------------------------------------------------------- sea

  /** the screen polyline of the current water edge, u from U0 to U1 */
  private edgePts(fn: (i: number) => number): Pt[] {
    const out: Pt[] = [this.pos(fn(0), U0 - 0.9)];
    for (let i = 0; i < NB; i++) out.push(this.pos(fn(i), binU(i)));
    out.push(this.pos(fn(NB - 1), U1 + 0.9));
    return out;
  }

  /** 1-2-1 smoothed sample of a per-bin field, so shorelines read as curves */
  private soft(arr: Float64Array, i: number): number {
    const a = arr[clamp(i - 1, 0, NB - 1)];
    const b = arr[i];
    const c = arr[clamp(i + 1, 0, NB - 1)];
    return (a + 2 * b + c) / 4;
  }

  /** a closed band between two polylines, both drawn as smooth curves */
  private smoothPoly(gg: CanvasRenderingContext2D, near: Pt[], far: Pt[]): void {
    const run = (pts: Pt[], rev: boolean): void => {
      const list = rev ? [...pts].reverse() : pts;
      gg.lineTo(list[0].x, list[0].y);
      for (let i = 1; i < list.length - 1; i++) {
        const mx = (list[i].x + list[i + 1].x) / 2;
        const my = (list[i].y + list[i + 1].y) / 2;
        gg.quadraticCurveTo(list[i].x, list[i].y, mx, my);
      }
      gg.lineTo(list[list.length - 1].x, list[list.length - 1].y);
    };
    gg.moveTo(near[0].x, near[0].y);
    run(near, false);
    run(far, true);
    gg.closePath();
  }

  private strokeEdge(gg: CanvasRenderingContext2D, pts: Pt[], close: 'sea' | 'none'): void {
    gg.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      gg.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    gg.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    if (close === 'sea') {
      const { w, h, horizonY, o } = this.geo;
      if (o === 'portrait') {
        gg.lineTo(w * 1.4, horizonY);
        gg.lineTo(-w * 0.4, horizonY);
      } else {
        gg.lineTo(-w * 0.4, h * 1.4);
        gg.lineTo(-w * 0.4, horizonY);
        gg.lineTo(pts[0].x, horizonY);
      }
      gg.closePath();
    }
  }

  private drawSea(gg: CanvasRenderingContext2D, P: ReturnType<Sandcastle['pal']>): void {
    const { w, h, horizonY, o } = this.geo;
    const pts = this.edgePts((i) => this.soft(this.reach, i));

    gg.save();
    gg.beginPath();
    gg.rect(-w, horizonY, w * 3, h * 3);
    gg.clip();
    gg.beginPath();
    this.strokeEdge(gg, pts, 'sea');
    gg.clip();

    // body of water: deep far away, luminous close in
    const far = this.pos(0, 0);
    const near = pts[Math.floor(NB / 2)];
    const grd =
      o === 'portrait'
        ? gg.createLinearGradient(0, horizonY, 0, near.y + h * 0.04)
        : gg.createLinearGradient(
            far.x + (far.x - near.x) * 0.55,
            far.y + (far.y - near.y) * 0.55,
            near.x,
            near.y,
          );
    grd.addColorStop(0, rgb(P.seaDeep));
    grd.addColorStop(0.42, rgb(P.seaMid));
    grd.addColorStop(0.86, rgb(mix(P.seaMid, P.seaShallow, 0.7)));
    grd.addColorStop(1, rgb(P.seaShallow));
    gg.fillStyle = grd;
    gg.fillRect(-w, horizonY - 4, w * 3, h * 2);

    // swells rolling in: each one travels up the beach and whitens as it shoals
    const par = this.camDrift * 0.45;
    const NSW = 9;
    for (let k = 0; k < NSW; k++) {
      const f = ((this.t * 0.055 + k / NSW) % 1 + 1) % 1;
      const sS = f * 0.99;
      const shoal = smooth((f - 0.35) / 0.6);
      const amp = lerp(1.6, 5.5, f);
      const row: Pt[] = [];
      for (let i = 0; i <= 16; i++) {
        const u = lerp(U0, U1, i / 16);
        const q = this.pos(sS, u);
        const wob = (Math.sin(u * 3.1 + k * 1.9 + this.t * 0.8) + 0.5 * Math.sin(u * 7.4 + k * 3.1)) * amp;
        row.push({ x: q.x + wob + par * f, y: q.y + wob * 0.25 });
      }
      const curve = (): void => {
        gg.beginPath();
        gg.moveTo(row[0].x, row[0].y);
        for (let i = 1; i < row.length - 1; i++) {
          gg.quadraticCurveTo(row[i].x, row[i].y, (row[i].x + row[i + 1].x) / 2, (row[i].y + row[i + 1].y) / 2);
        }
        gg.lineTo(row[row.length - 1].x, row[row.length - 1].y);
      };
      // trough just seaward of the crest
      gg.save();
      gg.translate(0, -lerp(1, 4, f));
      gg.strokeStyle = `rgba(12,74,104,${0.1 + f * 0.16})`;
      gg.lineWidth = lerp(1.4, 4.2, f);
      curve();
      gg.stroke();
      gg.restore();
      // the crest
      gg.strokeStyle = `rgba(255,255,255,${0.1 + shoal * 0.55})`;
      gg.lineWidth = lerp(1.2, 3.4, f) * (0.6 + shoal * 0.9);
      gg.lineCap = 'round';
      curve();
      gg.stroke();
    }

    // haze where the water meets the sky
    {
      const hz = gg.createLinearGradient(0, horizonY, 0, horizonY + h * 0.22);
      hz.addColorStop(0, 'rgba(206,228,238,0.5)');
      hz.addColorStop(1, 'rgba(206,228,238,0)');
      gg.fillStyle = hz;
      gg.fillRect(-w, horizonY, w * 3, h * 0.24);
    }

    // sun glitter
    const sun = this.geo.sun;
    const glr = new Rng((this.rng.seed ^ 0x77aa) >>> 0);
    for (let i = 0; i < 46; i++) {
      const s = glr.range(0.02, 0.96);
      const u = glr.range(U0, U1);
      const p = this.pos(s, u);
      const dx = Math.abs(p.x - sun.x) / w;
      const a = clamp(1 - dx * 1.9, 0, 1) * (0.2 + 0.8 * (0.5 + 0.5 * Math.sin(this.t * 3 + i * 2.1)));
      if (a < 0.05) continue;
      gg.fillStyle = `rgba(255,255,244,${a * 0.5})`;
      const ln = this.scl(s) * 0.09;
      gg.fillRect(p.x - ln, p.y - 0.7, ln * 2, 1.4);
    }

    // a small sailboat, far out
    this.drawBoat(gg);
    gg.restore();
  }

  private drawBoat(gg: CanvasRenderingContext2D): void {
    const u = lerp(U0 - 0.2, U1 + 0.2, this.boatX);
    const s = 0.1;
    const p = this.pos(s, u);
    const sc = this.geo.short * 0.028;
    const bob = Math.sin(this.t * 0.9) * sc * 0.08;
    gg.save();
    gg.translate(p.x + this.camDrift * 0.25, p.y + bob);
    // hull
    gg.fillStyle = 'rgb(58,70,86)';
    gg.beginPath();
    gg.moveTo(-sc * 0.75, 0);
    gg.quadraticCurveTo(0, sc * 0.4, sc * 0.75, 0);
    gg.closePath();
    gg.fill();
    // sails
    gg.fillStyle = 'rgb(252,250,244)';
    gg.beginPath();
    gg.moveTo(sc * 0.06, -sc * 1.5);
    gg.lineTo(sc * 0.06, -sc * 0.05);
    gg.lineTo(sc * 0.78, -sc * 0.05);
    gg.closePath();
    gg.fill();
    gg.fillStyle = 'rgb(236,232,224)';
    gg.beginPath();
    gg.moveTo(-sc * 0.04, -sc * 1.42);
    gg.lineTo(-sc * 0.04, -sc * 0.05);
    gg.lineTo(-sc * 0.6, -sc * 0.05);
    gg.closePath();
    gg.fill();
    gg.restore();
  }

  // ------------------------------------------------------------------ sand

  private drawSand(gg: CanvasRenderingContext2D, P: ReturnType<Sandcastle['pal']>): void {
    const { w, h, horizonY } = this.geo;
    const nearMid = this.pos(1, 0);
    const farMid = this.pos(0, 0);
    const grd = gg.createLinearGradient(farMid.x, farMid.y, nearMid.x, nearMid.y);
    grd.addColorStop(0, rgb(mix(P.dryShade, P.dry, 0.35)));
    grd.addColorStop(0.35, rgb(P.dry));
    grd.addColorStop(1, rgb(mix(P.dry, [255, 240, 210], 0.35)));
    gg.fillStyle = grd;
    gg.fillRect(-w, horizonY - 2, w * 3, h * 2);

    // granularity: a fixed speckle field in beach space, so it holds still
    const rr = new Rng((this.rng.seed ^ 0x2c1d) >>> 0);
    for (let i = 0; i < 1200; i++) {
      const s = rr.range(-0.02, 1.08);
      const u = rr.range(U0 - 0.2, U1 + 0.2);
      const p = this.pos(s, u);
      if (p.y < horizonY) continue;
      const sc = this.scl(s);
      const dark = rr.next() < 0.45;
      gg.fillStyle = dark ? 'rgba(146,114,72,0.3)' : 'rgba(255,250,232,0.5)';
      const r = sc * rr.range(0.01, 0.026);
      gg.fillRect(p.x, p.y, r, r * 0.8);
    }
    // wind ripples: long shallow arcs running with the shore
    gg.save();
    gg.lineCap = 'round';
    for (let k = 0; k < 9; k++) {
      const sS = 0.36 + k * 0.075;
      const row: Pt[] = [];
      for (let i = 0; i <= 12; i++) {
        const u = lerp(U0 - 0.3, U1 + 0.3, i / 12);
        const q = this.pos(sS + this.noise(u * 1.6 + k * 4) * 0.012, u);
        row.push(q);
      }
      const th = Math.max(1, this.scl(sS) * 0.016);
      for (let pass = 0; pass < 2; pass++) {
        gg.beginPath();
        gg.moveTo(row[0].x, row[0].y + (pass ? th : 0));
        for (let i = 1; i < row.length - 1; i++) {
          gg.quadraticCurveTo(
            row[i].x,
            row[i].y + (pass ? th : 0),
            (row[i].x + row[i + 1].x) / 2,
            (row[i].y + row[i + 1].y) / 2 + (pass ? th : 0),
          );
        }
        gg.strokeStyle = pass ? 'rgba(160,128,84,0.09)' : 'rgba(255,250,232,0.16)';
        gg.lineWidth = th;
        gg.stroke();
      }
    }
    gg.restore();

    // a few shell chips and pebbles
    const pr = new Rng((this.rng.seed ^ 0x9d31) >>> 0);
    for (let i = 0; i < 16; i++) {
      const s = pr.range(0.62, 1.04);
      const u = pr.range(U0, U1);
      const p = this.pos(s, u);
      const sc = this.scl(s);
      gg.fillStyle = pr.next() < 0.5 ? 'rgba(255,250,238,0.75)' : 'rgba(186,158,118,0.6)';
      gg.beginPath();
      gg.ellipse(p.x, p.y, sc * 0.035, sc * 0.019, pr.range(0, 3), 0, Math.PI * 2);
      gg.fill();
    }

    // drag scars
    for (const sc of this.scars) {
      const a = this.pos(sc.ax, sc.au);
      const b = this.pos(sc.bx, sc.bu);
      const fade = clamp(1 - sc.age / 26, 0, 1);
      gg.strokeStyle = `rgba(150,118,76,${0.3 * fade})`;
      gg.lineWidth = sc.w;
      gg.lineCap = 'round';
      gg.beginPath();
      gg.moveTo(a.x, a.y);
      gg.lineTo(b.x, b.y);
      gg.stroke();
      gg.strokeStyle = `rgba(255,246,222,${0.26 * fade})`;
      gg.lineWidth = sc.w * 0.45;
      gg.beginPath();
      gg.moveTo(a.x, a.y - sc.w * 0.4);
      gg.lineTo(b.x, b.y - sc.w * 0.4);
      gg.stroke();
    }
  }

  private drawWetBand(gg: CanvasRenderingContext2D, P: ReturnType<Sandcastle['pal']>): void {
    const water = this.edgePts((i) => this.soft(this.reach, i) - 0.004);
    // the damp sand keeps a soft, slightly ragged upper edge
    const ragged = (i: number): number => this.noise(i * 0.45 + 3) * 0.008 + this.noise(i * 1.5 + 17) * 0.003;
    const wet = this.edgePts((i) => this.soft(this.wetS, i) + ragged(i));
    const soft = this.edgePts((i) => this.soft(this.wetS, i) + 0.09 + ragged(i) * 1.2);

    // the faint fringe of drying sand above the high-water mark
    gg.save();
    gg.beginPath();
    this.smoothPoly(gg, wet, soft);
    gg.clip();
    let wm = 0;
    for (let i = 0; i < NB; i++) wm += this.wetS[i];
    wm /= NB;
    const fa = this.pos(wm, 0);
    const fb = this.pos(wm + 0.095, 0);
    const fg = gg.createLinearGradient(fa.x, fa.y, fb.x, fb.y);
    fg.addColorStop(0, rgb(mix(P.wet, P.dry, 0.74), 0.85));
    fg.addColorStop(0.5, rgb(mix(P.wet, P.dry, 0.88), 0.45));
    fg.addColorStop(1, rgb(mix(P.wet, P.dry, 0.96), 0));
    gg.fillStyle = fg;
    gg.fillRect(-this.geo.w, this.geo.horizonY - 2, this.geo.w * 3, this.geo.h * 2);
    gg.restore();

    gg.save();
    gg.beginPath();
    this.smoothPoly(gg, water, wet);
    gg.clip();

    let wa = 0;
    let wb = 0;
    for (let i = 0; i < NB; i++) {
      wa += this.reach[i];
      wb += this.wetS[i];
    }
    wa /= NB;
    wb /= NB;
    const a = this.pos(wa, 0);
    const b = this.pos(wb + 0.02, 0);
    const grd = gg.createLinearGradient(a.x, a.y, b.x, b.y);
    grd.addColorStop(0, rgb(mix(P.wet, [60, 56, 48], 0.16)));
    grd.addColorStop(0.22, rgb(P.wet));
    grd.addColorStop(0.58, rgb(mix(P.wet, P.dry, 0.4)));
    grd.addColorStop(1, rgb(mix(P.wet, P.dry, 0.9)));
    gg.fillStyle = grd;
    const { w, h, horizonY } = this.geo;
    gg.fillRect(-w, horizonY - 2, w * 3, h * 2);

    // gloss: the mirror-sheen of a beach that has just been under water
    for (let k = 0; k < 5; k++) {
      const s = lerp(0.1, 1.0, (k + 0.4) / 5);
      const p = this.pos(s, 0);
      gg.fillStyle = `rgba(214,236,240,${0.1 - k * 0.012})`;
      const q = this.pos(s + 0.03, 0);
      const th = Math.max(1.5, Math.hypot(q.x - p.x, q.y - p.y) * 0.45);
      gg.save();
      gg.beginPath();
      const row = this.edgePts(() => s);
      gg.moveTo(row[0].x, row[0].y);
      for (let i = 1; i < NB; i++) gg.lineTo(row[i].x, row[i].y);
      gg.lineWidth = th;
      gg.strokeStyle = `rgba(226,244,246,${0.09})`;
      gg.stroke();
      gg.restore();
    }

    // the wrack line: chips of shell and weed the last wave left at its limit
    {
      const dr = new Rng((this.rng.seed ^ 0x4c7d) >>> 0);
      for (let i = 0; i < NB; i++) {
        const sc = this.scl(this.wetS[i]);
        for (let k = 0; k < 2; k++) {
          const u = binU(i) + dr.range(-0.045, 0.045);
          const q = this.pos(this.soft(this.wetS, i) + dr.range(-0.004, 0.014), u);
          const dark = dr.next() < 0.5;
          gg.fillStyle = dark ? 'rgba(112,94,64,0.26)' : 'rgba(255,250,236,0.45)';
          gg.beginPath();
          gg.ellipse(q.x, q.y, sc * dr.range(0.012, 0.03), sc * dr.range(0.005, 0.012), dr.range(0, 3), 0, Math.PI * 2);
          gg.fill();
        }
      }
    }

    // receding streaks
    for (let i = 0; i < NB; i += 1) {
      const a2 = this.foamA[i];
      if (a2 < 0.08) continue;
      const u = binU(i) + this.noise(i * 1.3) * 0.02;
      const p0 = this.pos(this.reach[i], u);
      const p1 = this.pos(this.wetS[i], u);
      gg.strokeStyle = `rgba(255,255,255,${0.18 * a2})`;
      gg.lineWidth = 1.2;
      gg.beginPath();
      gg.moveTo(p0.x, p0.y);
      gg.lineTo(lerp(p0.x, p1.x, 0.55), lerp(p0.y, p1.y, 0.55));
      gg.stroke();
    }
    gg.restore();
  }

  /** the leading sheet of water: foam edge, translucent sheet, specular */
  private drawWater(gg: CanvasRenderingContext2D, P: ReturnType<Sandcastle['pal']>): void {
    const pts = this.edgePts((i) => this.soft(this.reach, i));
    const wv = this.wave;
    const rising = !!wv && wv.t < wv.up;

    // translucent sheet just behind the edge
    const { w, h, horizonY } = this.geo;
    gg.save();
    gg.beginPath();
    gg.rect(-w, horizonY, w * 3, h * 3);
    gg.clip();
    gg.beginPath();
    this.strokeEdge(gg, pts, 'sea');
    gg.clip();
    const a = this.pos(0.0, 0);
    const b = pts[Math.floor(NB / 2)];
    const grd = gg.createLinearGradient(a.x, a.y, b.x, b.y);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.72, `rgba(226,248,248,${0.1 + (wv ? wv.strength * 0.12 : 0)})`);
    grd.addColorStop(1, `rgba(255,255,255,${0.3 + (wv ? wv.strength * 0.3 : 0.05)})`);
    gg.fillStyle = grd;
    gg.fillRect(-w, horizonY - 4, w * 3, h * 2);
    gg.restore();

    // foam edge: a lumpy white lip with fingers reaching further in places
    gg.save();
    gg.beginPath();
    gg.rect(-w, horizonY, w * 3, h * 3);
    gg.clip();
    gg.lineCap = 'round';
    gg.lineJoin = 'round';
    const lw = Math.max(2, this.geo.short * 0.012);
    for (let pass = 0; pass < 2; pass++) {
      const lip: Pt[] = [this.pos(this.reach[0], U0 - 0.9)];
      for (let i = 0; i < NB; i++) {
        const wob = this.noise(i * 0.9 + this.t * 0.9) * 0.005 * (1 + (wv ? wv.strength : 0));
        lip.push(this.pos(this.soft(this.reach, i) + wob, binU(i)));
      }
      lip.push(this.pos(this.reach[NB - 1], U1 + 0.9));
      gg.beginPath();
      this.strokeEdge(gg, lip, 'none');
      gg.strokeStyle = pass === 0 ? 'rgba(255,255,255,0.95)' : 'rgba(214,244,246,0.5)';
      gg.lineWidth = pass === 0 ? lw : lw * 2.4;
      gg.stroke();
    }
    // foam bubbles clinging to the wet sand behind the lip
    const fr = new Rng((this.rng.seed ^ 0x3311) >>> 0);
    for (let i = 0; i < NB; i++) {
      const a2 = Math.max(this.foamA[i], rising ? 0.8 : 0.2);
      if (a2 < 0.1) continue;
      const n = 3;
      for (let k = 0; k < n; k++) {
        const u = binU(i) + fr.range(-0.03, 0.03);
        const s = lerp(this.reach[i], this.foamS[i], fr.range(-0.25, 0.6));
        const p = this.pos(s, u);
        const sc = this.scl(s);
        gg.fillStyle = `rgba(255,255,255,${0.42 * a2 * fr.range(0.5, 1)})`;
        gg.beginPath();
        gg.ellipse(p.x, p.y, sc * fr.range(0.012, 0.035), sc * fr.range(0.006, 0.014), 0, 0, Math.PI * 2);
        gg.fill();
      }
    }
    gg.restore();

    // specular sparkle on the leading edge
    if (wv) {
      for (let i = 0; i < NB; i += 2) {
        const p = this.pos(this.reach[i], binU(i));
        const a2 = 0.3 * (0.4 + 0.6 * Math.sin(this.t * 7 + i));
        gg.fillStyle = `rgba(255,255,255,${a2 * (rising ? 1 : 0.4)})`;
        gg.beginPath();
        gg.ellipse(p.x, p.y - 1, this.scl(this.reach[i]) * 0.03, 1.2, 0, 0, Math.PI * 2);
        gg.fill();
      }
    }
    void P;
  }

  private drawBerm(gg: CanvasRenderingContext2D, P: ReturnType<Sandcastle['pal']>): void {
    // contiguous runs of raised sand, drawn as smooth ridges
    const runs: number[][] = [];
    let cur: number[] = [];
    for (let i = 0; i < NB; i++) {
      if (this.soft(this.bermH, i) > 0.07) cur.push(i);
      else if (cur.length) {
        runs.push(cur);
        cur = [];
      }
    }
    if (cur.length) runs.push(cur);
    if (!runs.length) return;

    gg.save();
    for (const run of runs) {
      if (run.length < 2) continue;
      const back: Pt[] = [];
      const crest: Pt[] = [];
      const front: Pt[] = [];
      let scour = 0;
      for (const i of run) {
        const u = binU(i);
        const hgt = this.soft(this.bermH, i);
        const bs = this.soft(this.bermS, i);
        const sc = this.scl(bs);
        const w2 = 0.01 + 0.026 * hgt;
        const b = this.pos(bs - w2, u);
        const f = this.pos(bs + w2 * 0.9, u);
        back.push(b);
        front.push(f);
        crest.push({ x: (b.x + f.x) / 2, y: (b.y + f.y) / 2 - hgt * sc * 0.52 });
        scour += clamp((this.soft(this.wetS, i) - bs + 0.02) * 12, 0, 1);
      }
      scour /= run.length;

      const mid = crest[Math.floor(crest.length / 2)];
      this.sandShadow(gg, mid.x, mid.y, this.geo.short * 0.09, this.geo.short * 0.04, 0.1);

      const m = Math.floor(crest.length / 2);
      // seaward face, scoured and damp
      gg.beginPath();
      this.smoothPoly(gg, back, crest);
      const sg = gg.createLinearGradient(back[m].x, back[m].y, crest[m].x, crest[m].y);
      sg.addColorStop(0, rgb(mix(mix(P.dry, P.wet, scour), [104, 82, 54], 0.34)));
      sg.addColorStop(1, rgb(mix(mix(P.dry, P.wet, scour * 0.6), [200, 168, 120], 0.3)));
      gg.fillStyle = sg;
      gg.fill();
      // landward face: bright along the crest, falling into shadow at the foot
      gg.beginPath();
      this.smoothPoly(gg, crest, front);
      const lg = gg.createLinearGradient(crest[m].x, crest[m].y, front[m].x, front[m].y);
      lg.addColorStop(0, rgb(mix(P.dry, [255, 250, 226], 0.32)));
      lg.addColorStop(0.45, rgb(P.dry));
      lg.addColorStop(1, rgb(mix(P.dryShade, [148, 120, 82], 0.45)));
      gg.fillStyle = lg;
      gg.fill();
      // crest
      gg.beginPath();
      gg.moveTo(crest[0].x, crest[0].y);
      for (let i = 1; i < crest.length - 1; i++) {
        gg.quadraticCurveTo(crest[i].x, crest[i].y, (crest[i].x + crest[i + 1].x) / 2, (crest[i].y + crest[i + 1].y) / 2);
      }
      gg.lineTo(crest[crest.length - 1].x, crest[crest.length - 1].y);
      gg.strokeStyle = 'rgba(255,250,228,0.3)';
      gg.lineWidth = Math.max(1.2, this.geo.short * 0.0045);
      gg.lineCap = 'round';
      gg.lineJoin = 'round';
      gg.stroke();

      // loose grains on the landward slope
      const gr = new Rng((this.rng.seed ^ 0x6b1f) >>> 0);
      for (let k = 0; k < crest.length; k++) {
        const sc = this.geo.short * 0.012;
        for (let n = 0; n < 3; n++) {
          const f = gr.range(-0.2, 1.1);
          gg.fillStyle = gr.next() < 0.5 ? 'rgba(255,250,228,0.4)' : 'rgba(158,124,80,0.24)';
          gg.fillRect(
            lerp(crest[k].x, front[k].x, f) + gr.range(-sc, sc),
            lerp(crest[k].y, front[k].y, f),
            sc * 0.5,
            sc * 0.42,
          );
        }
      }
    }
    gg.restore();
  }

  // --------------------------------------------------------------- objects

  /** everything that stands on the sand, painted back-to-front */
  private drawWorld(gg: CanvasRenderingContext2D): void {
    type Item = { s: number; draw: () => void };
    const items: Item[] = [];

    // walls first, behind the towers they join
    for (let i = 0; i < this.towers.length; i++) {
      for (let j = i + 1; j < this.towers.length; j++) {
        if (!this.linked(i, j)) continue;
        const a = this.towers[i];
        const b = this.towers[j];
        items.push({ s: Math.min(a.s, b.s) - 0.001, draw: () => this.drawWall(gg, a, b) });
      }
    }
    for (const t of this.towers) items.push({ s: t.s, draw: () => this.drawTower(gg, t) });
    for (const d of this.deco) {
      const s = d.on >= 0 && this.towers[d.on] ? this.towers[d.on].s + 0.001 : d.s;
      items.push({ s, draw: () => this.drawDeco(gg, d) });
    }
    items.push({ s: this.bucket.s, draw: () => this.drawBucket(gg) });
    items.push({ s: this.geo.home.shovel.x, draw: () => this.drawShovel(gg) });
    if (this.crab.mode !== 'hidden' && this.crab.mode !== 'inside') {
      items.push({ s: this.crab.s + 0.002, draw: () => this.drawCrab(gg) });
    }
    items.push({ s: this.geo.home.kid.x, draw: () => this.drawKid(gg) });

    items.sort((a, b) => a.s - b.s);
    for (const it of items) it.draw();
  }

  private sandShadow(gg: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0.22): void {
    // the sun is high and off to one side; shadows fall the other way, short and soft
    const dir = this.geo.sun.x > this.geo.w * 0.5 ? -1 : 1;
    gg.save();
    gg.translate(x + rx * 0.3 * dir, y + ry * 0.2);
    gg.scale(1, ry / rx);
    const g2 = gg.createRadialGradient(0, 0, 0, 0, 0, rx);
    g2.addColorStop(0, `rgba(138,104,64,${a})`);
    g2.addColorStop(0.55, `rgba(138,104,64,${a * 0.62})`);
    g2.addColorStop(1, 'rgba(138,104,64,0)');
    gg.fillStyle = g2;
    gg.beginPath();
    gg.arc(0, 0, rx, 0, Math.PI * 2);
    gg.fill();
    gg.restore();
  }

  private drawTower(gg: CanvasRenderingContext2D, t: Tower): void {
    if (t.grow <= 0.001) return;
    const p = this.pos(t.s, t.u);
    const sc = this.scl(t.s);
    const grow = smooth(t.grow);
    const bounce = t.bounce;
    const sl = t.slump;
    const h = sc * 1.02 * grow * t.hMul * (1 - sl * 0.76) * (1 - bounce * 0.12);
    const r = sc * 0.32 * t.rMul * (1 + sl * 0.55) * (1 + bounce * 0.1);
    const topR = r * lerp(0.82, 0.3, sl);
    const ey = r * 0.3;

    this.sandShadow(gg, p.x, p.y, r * 1.55, r * 0.52, 0.2 + sl * 0.06);

    // silhouette: frustum that bulges into a dome as it melts
    const seed = t.seed;
    const side = (sign: number): Pt[] => {
      const out: Pt[] = [];
      const N = 9;
      for (let i = 0; i <= N; i++) {
        const f = i / N;
        const cone = lerp(r, topR, f);
        const dome = r * Math.sqrt(Math.max(0, 1 - f * f * 0.94));
        const rad = lerp(cone, dome, sl);
        const wob = this.noise(seed + f * 5 + sign * 11) * sc * 0.012 * (1 - sl * 0.5);
        out.push({ x: p.x + sign * (rad + wob), y: p.y - h * f });
      }
      return out;
    };
    const L = side(-1);
    const R = side(1);

    const tr = Math.abs(R[R.length - 1].x - p.x);
    const path = new Path2D();
    path.moveTo(L[0].x, L[0].y);
    for (const q of L) path.lineTo(q.x, q.y);
    path.ellipse(p.x, p.y - h, tr, tr * 0.3, 0, Math.PI, 0, true);
    for (let i = R.length - 1; i >= 0; i--) path.lineTo(R[i].x, R[i].y);
    path.ellipse(p.x, p.y, r, ey, 0, 0, Math.PI, false);
    path.closePath();

    const lit = this.geo.o === 'portrait' ? 1 : -1;
    const g2 = gg.createLinearGradient(p.x - r * lit, p.y - h, p.x + r * 1.3 * lit, p.y);
    g2.addColorStop(0, 'rgb(250,232,196)');
    g2.addColorStop(0.42, 'rgb(230,204,158)');
    g2.addColorStop(1, 'rgb(186,154,108)');
    gg.fillStyle = g2;
    gg.fill(path);

    gg.save();
    gg.clip(path);

    // moulding ridges left by the bucket
    const rings = 3;
    const ringA = clamp(1 - sl * 1.9, 0, 1) * grow;
    for (let i = 1; i <= rings; i++) {
      const f = i / (rings + 1);
      const y = p.y - h * f;
      const rad = lerp(r, topR, f) * 1.02;
      gg.strokeStyle = `rgba(160,126,84,${0.24 * ringA})`;
      gg.lineWidth = Math.max(1, sc * 0.022);
      gg.beginPath();
      gg.ellipse(p.x, y, rad * 0.93, rad * 0.28, 0, 0.3, Math.PI - 0.3);
      gg.stroke();
      gg.strokeStyle = `rgba(255,248,222,${0.3 * ringA})`;
      gg.lineWidth = Math.max(1, sc * 0.016);
      gg.beginPath();
      gg.ellipse(p.x, y - sc * 0.02, rad * 0.9, rad * 0.28, 0, 0.34, Math.PI - 0.34);
      gg.stroke();
    }

    // grain speckle on the tower itself
    const gr = new Rng((seed * 9301 + 49297) >>> 0);
    for (let i = 0; i < 26; i++) {
      const f = gr.range(0, 1);
      const rad = lerp(r, topR, f);
      const x = p.x + gr.range(-rad, rad);
      const y = p.y - h * f;
      gg.fillStyle = gr.next() < 0.5 ? 'rgba(255,250,224,0.5)' : 'rgba(150,116,74,0.32)';
      gg.fillRect(x, y, sc * 0.016, sc * 0.014);
    }

    // wet, dark, rounded base
    if (t.wetBase > 0.02) {
      const wh = h * (0.16 + t.wetBase * 0.42);
      const wg = gg.createLinearGradient(0, p.y + ey, 0, p.y - wh);
      const wetA = t.wetBase * (1 - t.slump * 0.45);
      wg.addColorStop(0, `rgba(108,80,52,${0.66 * wetA})`);
      wg.addColorStop(0.6, `rgba(126,96,64,${0.45 * wetA})`);
      wg.addColorStop(1, 'rgba(126,96,64,0)');
      gg.fillStyle = wg;
      gg.fillRect(p.x - r * 1.6, p.y - wh, r * 3.2, wh + ey * 2);
      // a narrow vertical sheen: wet sand mirrors the sky
      const sg = gg.createLinearGradient(p.x - r * 0.62 * lit, 0, p.x - r * 0.1 * lit, 0);
      sg.addColorStop(0, 'rgba(206,236,244,0)');
      sg.addColorStop(0.5, `rgba(214,240,246,${0.2 * t.wetBase})`);
      sg.addColorStop(1, 'rgba(206,236,244,0)');
      gg.fillStyle = sg;
      gg.fillRect(p.x - r * 0.7 * lit, p.y - wh * 0.9, r * 0.7 * lit, wh + ey);
    }
    gg.restore();

    // crumbling rim of grains along the silhouette
    const cr = new Rng((seed * 2654435761) >>> 0);
    const crumbs = 10 + Math.floor(sl * 14);
    for (let i = 0; i < crumbs; i++) {
      const f = cr.range(0, 1);
      const sign = cr.next() < 0.5 ? -1 : 1;
      const rad = lerp(lerp(r, topR, f), r * Math.sqrt(Math.max(0, 1 - f * f * 0.94)), sl);
      gg.fillStyle = 'rgba(214,186,140,0.85)';
      gg.fillRect(p.x + sign * rad - sc * 0.01, p.y - h * f, sc * 0.02, sc * 0.018);
    }

    // flat top, catching the sun
    const tg = gg.createLinearGradient(p.x - tr, p.y - h - tr * 0.3, p.x + tr, p.y - h + tr * 0.3);
    tg.addColorStop(0, `rgba(255,244,214,${clamp(1 - sl * 1.2, 0, 1)})`);
    tg.addColorStop(1, `rgba(226,198,150,${clamp(1 - sl * 1.2, 0, 1)})`);
    gg.fillStyle = tg;
    gg.beginPath();
    gg.ellipse(p.x, p.y - h, tr, tr * 0.3, 0, 0, Math.PI * 2);
    gg.fill();
    if (sl < 0.4) {
      gg.strokeStyle = 'rgba(158,124,82,0.45)';
      gg.lineWidth = Math.max(1, sc * 0.015);
      gg.beginPath();
      gg.ellipse(p.x, p.y - h, tr * 0.68, tr * 0.2, 0, 0, Math.PI * 2);
      gg.stroke();
    }

    // a crack for a tower that has been shoved about
    if (t.crack > 0 && sl < 0.8) {
      gg.strokeStyle = `rgba(140,106,66,${0.4 * t.crack * (1 - sl)})`;
      gg.lineWidth = Math.max(1, sc * 0.018);
      gg.beginPath();
      gg.moveTo(p.x - r * 0.2, p.y - h * 0.9);
      gg.lineTo(p.x - r * 0.42, p.y - h * 0.5);
      gg.lineTo(p.x - r * 0.24, p.y - h * 0.16);
      gg.stroke();
    }
  }

  private drawWall(gg: CanvasRenderingContext2D, a: Tower, b: Tower): void {
    const pa = this.pos(a.s, a.u);
    const pb = this.pos(b.s, b.u);
    const sc = (this.scl(a.s) + this.scl(b.s)) / 2;
    const grow = Math.min(smooth(a.grow), smooth(b.grow));
    if (grow < 0.05) return;
    const sl = (a.slump + b.slump) / 2;
    const hh = sc * 0.3 * grow * (1 - sl * 0.82);
    const th = sc * 0.16 * (1 + sl * 0.25);

    this.sandShadow(gg, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2, sc * 0.5, sc * 0.14, 0.16);

    gg.save();
    gg.lineCap = 'round';
    gg.lineJoin = 'round';
    // the footprint, pressed into the sand
    gg.strokeStyle = `rgba(180,148,104,${1 - sl * 0.6})`;
    gg.lineWidth = th * 2;
    gg.beginPath();
    gg.moveTo(pa.x, pa.y);
    gg.lineTo(pb.x, pb.y);
    gg.stroke();
    // the slab itself, standing on that footprint
    const my = (pa.y + pb.y) / 2;
    const flat = clamp(sl * 1.1, 0, 1);
    const g2 = gg.createLinearGradient(0, my - hh - th * 0.6, 0, my + th * 0.6);
    g2.addColorStop(0, rgb(mix([250, 232, 196], [216, 190, 146], flat)));
    g2.addColorStop(0.5, rgb(mix([228, 200, 152], [204, 176, 132], flat)));
    g2.addColorStop(1, rgb(mix([186, 154, 110], [196, 166, 122], flat)));
    gg.strokeStyle = g2;
    gg.lineWidth = hh + th * 1.2;
    gg.beginPath();
    gg.moveTo(pa.x, pa.y - hh * 0.5);
    gg.lineTo(pb.x, pb.y - hh * 0.5);
    gg.stroke();
    // lit crest
    gg.strokeStyle = `rgba(252,240,212,${0.8 * clamp(1 - sl * 1.3, 0, 1)})`;
    gg.lineWidth = Math.max(1.4, th * 0.5);
    gg.beginPath();
    gg.moveTo(pa.x, pa.y - hh);
    gg.lineTo(pb.x, pb.y - hh);
    gg.stroke();
    gg.restore();
  }

  private drawDeco(gg: CanvasRenderingContext2D, d: Deco): void {
    let x: number;
    let y: number;
    let sc: number;
    if (d.on >= 0 && this.towers[d.on]) {
      const top = this.towerTop(this.towers[d.on]);
      x = top.x;
      y = top.y;
      sc = this.scl(this.towers[d.on].s);
    } else {
      const p = this.pos(d.s, d.u);
      x = p.x;
      y = p.y;
      sc = this.scl(d.s);
    }

    if (d.kind === 'flag') {
      const planted = d.on >= 0;
      const len = sc * (planted ? 0.62 : 0.5);
      gg.save();
      gg.translate(x, y);
      gg.rotate(planted ? d.tilt : d.rot);
      if (!planted) this.sandShadow(gg, 0, 0, sc * 0.3, sc * 0.1, 0.16);
      gg.strokeStyle = 'rgb(226,220,206)';
      gg.lineWidth = Math.max(1.6, sc * 0.035);
      gg.lineCap = 'round';
      gg.beginPath();
      gg.moveTo(0, 0);
      gg.lineTo(0, -len);
      gg.stroke();
      const flut = Math.sin(this.t * 4.2) * sc * 0.03;
      const fw = sc * 0.36;
      gg.fillStyle = 'rgb(240,92,74)';
      gg.beginPath();
      gg.moveTo(1, -len);
      gg.quadraticCurveTo(fw * 0.6, -len + sc * 0.04 + flut, fw, -len + sc * 0.12);
      gg.quadraticCurveTo(fw * 0.55, -len + sc * 0.16 - flut, 1, -len + sc * 0.24);
      gg.closePath();
      gg.fill();
      gg.fillStyle = 'rgba(255,255,255,0.32)';
      gg.beginPath();
      gg.moveTo(1, -len);
      gg.quadraticCurveTo(fw * 0.6, -len + sc * 0.04 + flut, fw, -len + sc * 0.12);
      gg.lineTo(1, -len + sc * 0.09);
      gg.closePath();
      gg.fill();
      gg.restore();
      return;
    }

    // shell
    const r = sc * 0.14;
    gg.save();
    gg.translate(x, y - (d.on >= 0 ? r * 0.2 : 0));
    gg.rotate(d.rot + d.tilt);
    if (d.on < 0) this.sandShadow(gg, 0, r * 0.2, r * 1.3, r * 0.5, 0.18);
    const c0: RGB = d.hue > 0 ? [255, 236, 226] : [252, 226, 196];
    const c1: RGB = d.hue > 0 ? [238, 174, 168] : [226, 180, 132];
    const sg = gg.createLinearGradient(0, -r, 0, r * 0.6);
    sg.addColorStop(0, rgb(c0));
    sg.addColorStop(1, rgb(c1));
    gg.fillStyle = sg;
    gg.beginPath();
    gg.moveTo(0, r * 0.5);
    gg.quadraticCurveTo(-r * 1.25, r * 0.15, -r * 0.8, -r * 0.7);
    gg.quadraticCurveTo(0, -r * 1.05, r * 0.8, -r * 0.7);
    gg.quadraticCurveTo(r * 1.25, r * 0.15, 0, r * 0.5);
    gg.closePath();
    gg.fill();
    gg.strokeStyle = rgb(mix(c1, [160, 110, 92], 0.4), 0.5);
    gg.lineWidth = Math.max(0.8, r * 0.09);
    for (let i = -2; i <= 2; i++) {
      gg.beginPath();
      gg.moveTo(0, r * 0.45);
      gg.lineTo(i * r * 0.36, -r * 0.78);
      gg.stroke();
    }
    gg.restore();
  }

  private drawBucket(gg: CanvasRenderingContext2D): void {
    const b = this.bucket;
    const p = this.pos(b.s, b.u);
    const sc = this.scl(b.s);
    const tip = smooth(clamp(b.tip / 0.34, 0, 1));
    const t = this.newTower;
    const rTop = sc * 0.34;
    const rBot = sc * 0.27;
    const hh = sc * 0.42;
    let lift = b.lift * sc * 0.35;
    if (b.state === 'tip' && t) {
      // the mould rides exactly on top of the sand it is uncovering
      const rev = clamp((b.tip - 0.34) / 0.44, 0, 1);
      const clear = smooth(clamp((b.tip - 0.78) / 0.22, 0, 1));
      lift = sc * 1.02 * t.hMul * rev + hh * 0.5 + clear * sc * 0.6;
    }
    const wob = b.wob * Math.sin(this.t * 26) * 0.12;

    const cx = p.x;
    const cy = p.y - lift;

    if (lift < sc * 0.1) this.sandShadow(gg, p.x, p.y, rTop * 1.5, rTop * 0.5, 0.22);
    else this.sandShadow(gg, p.x, p.y, rTop * 1.8, rTop * 0.55, 0.14);

    gg.save();
    gg.translate(cx, cy);
    gg.rotate(Math.PI * tip + wob);

    // sand still inside, visible while the bucket is upright
    const body = new Path2D();
    body.moveTo(-rTop, -hh * 0.5);
    body.lineTo(-rBot, hh * 0.5);
    body.ellipse(0, hh * 0.5, rBot, rBot * 0.32, 0, Math.PI, 0, true);
    body.lineTo(rTop, -hh * 0.5);
    body.ellipse(0, -hh * 0.5, rTop, rTop * 0.32, 0, 0, Math.PI, true);
    body.closePath();

    // inner mouth
    gg.fillStyle = 'rgb(126,32,26)';
    gg.beginPath();
    gg.ellipse(0, -hh * 0.5, rTop, rTop * 0.32, 0, 0, Math.PI * 2);
    gg.fill();
    if (b.state !== 'tip' && b.state !== 'fly') {
      gg.fillStyle = 'rgb(226,200,152)';
      gg.beginPath();
      gg.ellipse(0, -hh * 0.5 + rTop * 0.05, rTop * 0.88, rTop * 0.28, 0, 0, Math.PI * 2);
      gg.fill();
    }

    const bg = gg.createLinearGradient(-rTop, 0, rTop, 0);
    bg.addColorStop(0, 'rgb(196,44,36)');
    bg.addColorStop(0.32, 'rgb(240,78,58)');
    bg.addColorStop(0.55, 'rgb(255,138,112)');
    bg.addColorStop(1, 'rgb(186,38,32)');
    gg.fillStyle = bg;
    gg.fill(body);

    // plastic specular streak
    gg.fillStyle = 'rgba(255,255,255,0.38)';
    gg.beginPath();
    gg.ellipse(-rTop * 0.42, 0, rTop * 0.1, hh * 0.32, 0.08, 0, Math.PI * 2);
    gg.fill();

    // rim
    gg.strokeStyle = 'rgb(255,208,72)';
    gg.lineWidth = Math.max(2, sc * 0.05);
    gg.beginPath();
    gg.ellipse(0, -hh * 0.5, rTop, rTop * 0.32, 0, 0, Math.PI * 2);
    gg.stroke();

    // handle
    gg.strokeStyle = 'rgb(255,208,72)';
    gg.lineWidth = Math.max(1.6, sc * 0.035);
    gg.beginPath();
    gg.arc(0, -hh * 0.5, rTop * 1.05, Math.PI * 1.08, Math.PI * 1.92);
    gg.stroke();
    gg.restore();

    // a few grains crumble off the rim as it lifts
    if (b.state === 'tip' && b.tip > 0.34 && b.tip < 0.86) {
      const gr = new Rng(((this.t * 90) | 0) >>> 0);
      for (let i = 0; i < 7; i++) {
        const a = gr.range(0, Math.PI);
        const x = cx + Math.cos(a) * rTop * 0.95;
        const y = cy + hh * 0.5 + Math.sin(a) * rTop * 0.18;
        gg.fillStyle = 'rgba(232,208,158,0.9)';
        gg.fillRect(x, y + gr.range(0, sc * 0.12), sc * 0.022, sc * 0.03);
      }
    }
  }

  private drawShovel(gg: CanvasRenderingContext2D): void {
    const hm = this.geo.home.shovel;
    const p = this.pos(hm.x, hm.y);
    const sc = this.scl(hm.x);
    this.sandShadow(gg, p.x, p.y, sc * 0.5, sc * 0.14, 0.18);
    gg.save();
    gg.translate(p.x, p.y);
    gg.rotate(this.geo.o === 'portrait' ? -0.55 : -0.3);
    // handle
    gg.strokeStyle = 'rgb(255,200,60)';
    gg.lineWidth = Math.max(2, sc * 0.055);
    gg.lineCap = 'round';
    gg.beginPath();
    gg.moveTo(-sc * 0.42, 0);
    gg.lineTo(sc * 0.2, -sc * 0.06);
    gg.stroke();
    gg.strokeStyle = 'rgba(255,255,255,0.35)';
    gg.lineWidth = Math.max(1, sc * 0.018);
    gg.beginPath();
    gg.moveTo(-sc * 0.4, -sc * 0.018);
    gg.lineTo(sc * 0.16, -sc * 0.075);
    gg.stroke();
    // blade
    gg.fillStyle = 'rgb(58,150,214)';
    gg.beginPath();
    gg.moveTo(sc * 0.18, -sc * 0.16);
    gg.quadraticCurveTo(sc * 0.56, -sc * 0.14, sc * 0.5, sc * 0.06);
    gg.quadraticCurveTo(sc * 0.4, sc * 0.16, sc * 0.18, sc * 0.08);
    gg.closePath();
    gg.fill();
    gg.fillStyle = 'rgba(255,255,255,0.3)';
    gg.beginPath();
    gg.ellipse(sc * 0.33, -sc * 0.04, sc * 0.1, sc * 0.045, -0.3, 0, Math.PI * 2);
    gg.fill();
    gg.restore();
  }

  private drawCrab(gg: CanvasRenderingContext2D): void {
    const c = this.crab;
    let x: number;
    let y: number;
    let sc: number;
    if (c.mode === 'pop' && this.towers[c.tower]) {
      const top = this.towerTop(this.towers[c.tower]);
      const rise = smooth(clamp(c.t / 0.55, 0, 1));
      x = top.x;
      y = top.y - rise * this.scl(this.towers[c.tower].s) * 0.16;
      sc = this.scl(this.towers[c.tower].s);
    } else {
      const p = this.pos(c.s, c.u);
      x = p.x;
      y = p.y;
      sc = this.scl(c.s);
    }
    const r = sc * 0.21;
    const scut = Math.sin(this.t * 13) * (c.mode === 'sidle' ? 1 : 0.12);

    this.sandShadow(gg, x, y, r * 1.6, r * 0.5, 0.2);

    gg.save();
    gg.translate(x, y - r * 0.5 + Math.abs(scut) * r * 0.1);

    // legs
    gg.strokeStyle = 'rgb(198,82,56)';
    gg.lineWidth = Math.max(1.2, r * 0.16);
    gg.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      for (const sgn of [-1, 1]) {
        const a = 0.35 + i * 0.42;
        const swing = Math.sin(this.t * 13 + i * 1.3 + (sgn > 0 ? 1.6 : 0)) * (c.mode === 'sidle' ? 0.24 : 0.04);
        gg.beginPath();
        gg.moveTo(sgn * r * 0.5, r * 0.08);
        gg.quadraticCurveTo(
          sgn * r * (1.1 + i * 0.05),
          r * (0.1 + Math.sin(a) * 0.25) - swing * r,
          sgn * r * (1.5 - i * 0.16),
          r * (0.62 + i * 0.06) + swing * r * 0.6,
        );
        gg.stroke();
      }
    }
    // claws
    for (const sgn of [-1, 1]) {
      const wv = sgn === c.face ? c.wave : 0;
      const up = wv * Math.abs(Math.sin(this.t * 9)) * r * 0.9;
      gg.strokeStyle = 'rgb(214,96,64)';
      gg.lineWidth = Math.max(1.4, r * 0.2);
      gg.beginPath();
      gg.moveTo(sgn * r * 0.55, -r * 0.1);
      gg.lineTo(sgn * r * 1.15, -r * 0.35 - up);
      gg.stroke();
      gg.fillStyle = 'rgb(236,112,76)';
      gg.beginPath();
      gg.ellipse(sgn * r * 1.32, -r * 0.5 - up, r * 0.3, r * 0.22, sgn * 0.5, 0, Math.PI * 2);
      gg.fill();
      gg.strokeStyle = 'rgb(180,64,44)';
      gg.lineWidth = Math.max(1, r * 0.09);
      gg.beginPath();
      gg.moveTo(sgn * r * 1.5, -r * 0.62 - up);
      gg.lineTo(sgn * r * 1.15, -r * 0.46 - up);
      gg.stroke();
    }
    // shell
    const bg = gg.createLinearGradient(0, -r * 0.7, 0, r * 0.5);
    bg.addColorStop(0, 'rgb(246,140,104)');
    bg.addColorStop(0.5, 'rgb(226,104,72)');
    bg.addColorStop(1, 'rgb(182,62,44)');
    gg.fillStyle = bg;
    gg.beginPath();
    gg.ellipse(0, 0, r, r * 0.74, 0, 0, Math.PI * 2);
    gg.fill();
    gg.fillStyle = 'rgba(255,255,255,0.28)';
    gg.beginPath();
    gg.ellipse(-r * 0.3, -r * 0.28, r * 0.3, r * 0.16, -0.3, 0, Math.PI * 2);
    gg.fill();
    // eyes on stalks
    for (const sgn of [-1, 1]) {
      gg.strokeStyle = 'rgb(198,82,56)';
      gg.lineWidth = Math.max(1, r * 0.12);
      gg.beginPath();
      gg.moveTo(sgn * r * 0.3, -r * 0.5);
      gg.lineTo(sgn * r * 0.34, -r * 0.92);
      gg.stroke();
      gg.fillStyle = 'rgb(255,255,255)';
      gg.beginPath();
      gg.arc(sgn * r * 0.34, -r * 1.02, r * 0.16, 0, Math.PI * 2);
      gg.fill();
      gg.fillStyle = 'rgb(40,32,30)';
      gg.beginPath();
      gg.arc(sgn * r * 0.34 + c.face * r * 0.05, -r * 1.03, r * 0.075, 0, Math.PI * 2);
      gg.fill();
    }
    gg.restore();
  }

  private drawKid(gg: CanvasRenderingContext2D): void {
    const hm = this.geo.home.kid;
    const p = this.pos(hm.x, hm.y);
    const sc = this.scl(hm.x);
    const k = this.kid;
    const headR = sc * 0.3;
    const nod = smooth(k.nod) * Math.sin(k.nod * 9) * 0.22;
    const lean = k.look * 0.12 + k.laugh * 0.16;
    const baseY = p.y;

    this.sandShadow(gg, p.x, baseY, headR * 2.1, headR * 0.6, 0.24);

    // which way the sea is, in screen x
    const seaDir = Math.sign(this.pos(0.2, hm.y).x - p.x) || -1;

    gg.save();
    gg.translate(p.x, baseY);
    gg.rotate(lean * seaDir * 0.5);

    // legs stretched out towards the sea, one a little in front of the other
    for (const sgn of [-1, 1]) {
      const near = sgn > 0 ? 1 : 0;
      const oy = -headR * (0.34 + near * 0.16);
      gg.strokeStyle = near ? 'rgb(248,212,182)' : 'rgb(232,192,162)';
      gg.lineWidth = headR * 0.42;
      gg.lineCap = 'round';
      gg.lineJoin = 'round';
      gg.beginPath();
      gg.moveTo(-seaDir * headR * 0.18, oy);
      gg.quadraticCurveTo(seaDir * headR * 0.85, oy - headR * 0.16, seaDir * headR * 1.62, oy + headR * 0.06);
      gg.stroke();
      // foot
      gg.fillStyle = near ? 'rgb(252,220,192)' : 'rgb(236,196,166)';
      gg.save();
      gg.translate(seaDir * headR * 1.72, oy + headR * 0.02);
      gg.rotate(seaDir * -0.5);
      gg.beginPath();
      gg.ellipse(0, 0, headR * 0.3, headR * 0.19, 0, 0, Math.PI * 2);
      gg.fill();
      gg.restore();
    }

    // body: a small round swimsuit
    const bodyY = -headR * 0.95;
    const bg = gg.createLinearGradient(0, bodyY - headR * 0.7, 0, bodyY + headR * 0.7);
    bg.addColorStop(0, 'rgb(96,196,196)');
    bg.addColorStop(1, 'rgb(42,140,152)');
    gg.fillStyle = bg;
    gg.beginPath();
    gg.ellipse(0, bodyY, headR * 0.72, headR * 0.82, 0, 0, Math.PI * 2);
    gg.fill();
    gg.fillStyle = 'rgba(255,255,255,0.5)';
    gg.beginPath();
    gg.ellipse(-headR * 0.22, bodyY - headR * 0.3, headR * 0.2, headR * 0.12, -0.4, 0, Math.PI * 2);
    gg.fill();

    // arms: resting on knees, or coming together for a clap
    const clap = k.clap;
    gg.strokeStyle = 'rgb(246,208,178)';
    gg.lineWidth = headR * 0.3;
    gg.lineCap = 'round';
    for (const sgn of [-1, 1]) {
      const hx = lerp(seaDir * headR * 0.95 + sgn * headR * 0.3, seaDir * headR * 0.55, clap);
      const hy = lerp(-headR * 0.72, -headR * 1.35, clap);
      gg.beginPath();
      gg.moveTo(sgn * headR * 0.55, bodyY);
      gg.quadraticCurveTo(sgn * headR * 0.8, bodyY + headR * 0.4, hx, hy);
      gg.stroke();
    }

    // head
    const headY = bodyY - headR * 1.0 - nod * headR * 0.3;
    gg.save();
    gg.translate(0, headY);
    gg.rotate(nod * 0.3 + k.laugh * -0.16 * seaDir);
    gg.fillStyle = 'rgb(248,212,182)';
    gg.beginPath();
    gg.ellipse(0, 0, headR * 0.86, headR * 0.92, 0, 0, Math.PI * 2);
    gg.fill();
    // face, turned a little toward the sea
    const ex = seaDir * headR * 0.1;
    const eyeY = headR * 0.1;
    gg.fillStyle = 'rgb(58,44,40)';
    for (const sgn of [-1, 1]) {
      const x = ex + sgn * headR * 0.3;
      if (k.blink > 0) {
        gg.fillRect(x - headR * 0.14, eyeY, headR * 0.28, headR * 0.07);
      } else {
        gg.beginPath();
        gg.ellipse(x, eyeY, headR * 0.1, headR * 0.13, 0, 0, Math.PI * 2);
        gg.fill();
      }
    }
    // cheeks
    gg.fillStyle = 'rgba(240,146,130,0.5)';
    for (const sgn of [-1, 1]) {
      gg.beginPath();
      gg.ellipse(ex + sgn * headR * 0.46, eyeY + headR * 0.2, headR * 0.15, headR * 0.1, 0, 0, Math.PI * 2);
      gg.fill();
    }
    // mouth
    gg.strokeStyle = 'rgb(176,100,88)';
    gg.lineWidth = headR * 0.1;
    gg.lineCap = 'round';
    gg.beginPath();
    if (k.laugh > 0.3) {
      gg.ellipse(ex, eyeY + headR * 0.42, headR * 0.18, headR * 0.16, 0, 0, Math.PI * 2);
    } else {
      gg.arc(ex, eyeY + headR * 0.18, headR * 0.26, 0.42, Math.PI - 0.42);
    }
    gg.stroke();

    // sunhat: crown plus a wide straw brim
    const brimW = headR * 1.5;
    const hatY = -headR * 0.52;
    const hg = gg.createLinearGradient(-brimW, hatY, brimW, hatY + headR * 0.4);
    hg.addColorStop(0, 'rgb(252,232,176)');
    hg.addColorStop(0.55, 'rgb(238,208,140)');
    hg.addColorStop(1, 'rgb(206,170,104)');
    gg.fillStyle = hg;
    gg.beginPath();
    gg.ellipse(0, hatY, brimW, headR * 0.34, 0, 0, Math.PI * 2);
    gg.fill();
    gg.beginPath();
    gg.ellipse(0, hatY - headR * 0.2, headR * 0.72, headR * 0.5, 0, Math.PI, Math.PI * 2);
    gg.fill();
    gg.fillStyle = 'rgb(232,96,84)';
    gg.beginPath();
    gg.ellipse(0, hatY - headR * 0.18, headR * 0.73, headR * 0.12, 0, Math.PI, Math.PI * 2);
    gg.fill();
    gg.strokeStyle = 'rgba(176,138,84,0.5)';
    gg.lineWidth = Math.max(1, headR * 0.05);
    for (let i = 1; i <= 2; i++) {
      gg.beginPath();
      gg.ellipse(0, hatY, brimW * (i / 3), headR * 0.34 * (i / 3), 0, 0, Math.PI * 2);
      gg.stroke();
    }

    // a blob of sea foam that landed on the brim
    if (k.foam > 0.01) {
      const fx = -brimW * 0.55;
      const fy = hatY - headR * 0.06;
      const wob = Math.sin(this.t * 6) * headR * 0.02;
      gg.fillStyle = 'rgba(255,255,255,0.94)';
      gg.beginPath();
      gg.ellipse(fx, fy + wob, headR * 0.3, headR * 0.2, 0, 0, Math.PI * 2);
      gg.fill();
      gg.beginPath();
      gg.arc(fx - headR * 0.16, fy - headR * 0.08 + wob, headR * 0.12, 0, Math.PI * 2);
      gg.arc(fx + headR * 0.18, fy - headR * 0.04 + wob, headR * 0.1, 0, Math.PI * 2);
      gg.fill();
      gg.fillStyle = 'rgba(206,232,236,0.6)';
      gg.beginPath();
      gg.arc(fx + headR * 0.05, fy + headR * 0.06 + wob, headR * 0.06, 0, Math.PI * 2);
      gg.fill();
    }
    gg.restore();
    gg.restore();
  }

  private drawParticles(gg: CanvasRenderingContext2D): void {
    for (const g of this.grains) {
      const a = clamp(g.life / g.max, 0, 1);
      if (g.kind === 0) {
        gg.fillStyle = `rgba(240,216,168,${0.85 * a})`;
        gg.fillRect(g.x, g.y, g.r, g.r * 0.85);
      } else if (g.kind === 1) {
        gg.fillStyle = `rgba(164,132,92,${0.8 * a})`;
        gg.fillRect(g.x, g.y, g.r, g.r * 0.85);
      } else if (g.kind === 2) {
        gg.fillStyle = `rgba(250,254,255,${0.9 * a})`;
        gg.beginPath();
        gg.ellipse(g.x, g.y, g.r * 0.8, g.r * 1.15, 0, 0, Math.PI * 2);
        gg.fill();
      } else {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(g.spin));
        gg.fillStyle = `rgba(255,250,214,${a * tw})`;
        gg.beginPath();
        gg.moveTo(g.x, g.y - g.r * 1.7);
        gg.lineTo(g.x + g.r * 0.5, g.y);
        gg.lineTo(g.x, g.y + g.r * 1.7);
        gg.lineTo(g.x - g.r * 0.5, g.y);
        gg.closePath();
        gg.fill();
      }
    }
  }

  private drawLight(gg: CanvasRenderingContext2D): void {
    const { w, h } = this.geo;
    // warm mid-day wash from the sun's side
    const s = this.geo.sun;
    const g2 = gg.createRadialGradient(s.x, s.y, 0, s.x, s.y, Math.max(w, h) * 0.95);
    g2.addColorStop(0, 'rgba(255,240,196,0.16)');
    g2.addColorStop(1, 'rgba(255,230,170,0)');
    gg.fillStyle = g2;
    gg.fillRect(-w, -h, w * 3, h * 3);

    const v = gg.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.34, w / 2, h * 0.52, Math.max(w, h) * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(24,26,20,${0.2 + clamp(this.surf, 0, 1) * 0.12})`);
    gg.fillStyle = v;
    gg.fillRect(-w, -h, w * 3, h * 3);
  }

  // ================================================================= input

  pointer(e: PointerEvt): void {
    this.px = e.x;
    this.py = e.y;
    const ph = this.ctx.phase;

    if (e.type === 'down') {
      if (this.grabBucket(e.x, e.y)) return;
      if (ph.is('comic', 'settle')) {
        this.leave();
        return;
      }
      const d = this.pickDeco(e.x, e.y);
      if (d >= 0) {
        this.held = 'deco';
        this.heldDeco = d;
        this.deco[d].on = -1;
        this.ctx.audio.blip();
        return;
      }
      const tw = this.pickTower(e.x, e.y);
      if (tw >= 0 && ph.at('foreshadow')) {
        this.held = 'cluster';
        this.cluster = this.clusterOf(tw);
        const b = this.inv(e.x, e.y);
        this.clusterAnchor = { s: b.s, u: b.u };
        for (const i of this.cluster) {
          this.towers[i].dragS = this.towers[i].s - b.s;
          this.towers[i].dragU = this.towers[i].u - b.u;
        }
        this.ctx.audio.whoosh(0.3, 0.35);
        return;
      }
      // otherwise: push sand up into a ridge
      const b = this.inv(e.x, e.y);
      this.held = 'berm';
      this.bermLast = { s: b.s, u: b.u };
      this.pushBerm(b.s, b.u, 0.1);
      return;
    }

    if (e.type === 'move') {
      if (this.held === 'deco' && this.heldDeco >= 0) {
        const b = this.inv(e.x, e.y);
        const d = this.deco[this.heldDeco];
        d.s = clamp(b.s, 0.2, 1.05);
        d.u = clamp(b.u, -1.15, 1.15);
      } else if (this.held === 'cluster') {
        const b = this.inv(e.x, e.y);
        const ds = b.s - this.clusterAnchor.s;
        const du = b.u - this.clusterAnchor.u;
        if (Math.hypot(ds, du) > 0.0015) {
          for (const i of this.cluster) {
            const t = this.towers[i];
            const ns = clamp(b.s + t.dragS, 0.24, 1.0);
            const nu = clamp(b.u + t.dragU, -1.1, 1.1);
            this.scars.push({ ax: t.s, au: t.u, bx: ns, bu: nu, w: this.scl(t.s) * 0.62, age: 0 });
            if (this.scars.length > 260) this.scars.shift();
            t.s = ns;
            t.u = nu;
            t.crack = Math.min(1, t.crack + 0.02);
            if (this.rng.next() < 0.35) this.spillGrain(t.s, t.u, 0.45);
          }
          this.clusterAnchor = { s: b.s, u: b.u };
          if (this.bermSound <= 0) {
            this.bermSound = 0.26;
            this.ctx.audio.flump(0.05);
          }
        }
      } else if (this.held === 'berm') {
        const b = this.inv(e.x, e.y);
        const steps = Math.max(1, Math.ceil(Math.hypot(b.u - this.bermLast.u, b.s - this.bermLast.s) / 0.03));
        for (let k = 1; k <= steps; k++) {
          const f = k / steps;
          this.pushBerm(lerp(this.bermLast.s, b.s, f), lerp(this.bermLast.u, b.u, f), 0.055);
        }
        this.bermLast = { s: b.s, u: b.u };
      }
      return;
    }

    // up
    if (this.held === 'bucket') this.releaseBucket();
    else if (this.held === 'deco' && this.heldDeco >= 0) this.dropDeco(this.heldDeco);
    else if (this.held === 'cluster') {
      for (const i of this.cluster) this.towers[i].bounce = 0.6;
      this.ctx.audio.thump(1.1);
    }
    this.held = 'none';
    this.heldDeco = -1;
    this.cluster = [];
  }

  private grabBucket(x: number, y: number): boolean {
    const b = this.bucket;
    if (b.state === 'tip') return false;
    const p = this.pos(b.s, b.u);
    const sc = this.scl(b.s);
    if (Math.hypot(x - p.x, y - (p.y - sc * 0.22)) > sc * 0.85) return false;
    b.state = 'held';
    this.held = 'bucket';
    this.ctx.audio.whoosh(0.28, 0.28);
    return true;
  }

  private pickDeco(x: number, y: number): number {
    let best = -1;
    let bd = 1e9;
    for (let i = 0; i < this.deco.length; i++) {
      const d = this.deco[i];
      let p: Pt;
      let sc: number;
      if (d.on >= 0 && this.towers[d.on]) {
        const top = this.towerTop(this.towers[d.on]);
        p = { x: top.x, y: top.y - (d.kind === 'flag' ? this.scl(this.towers[d.on].s) * 0.3 : 0) };
        sc = this.scl(this.towers[d.on].s);
      } else {
        p = this.pos(d.s, d.u);
        sc = this.scl(d.s);
        if (d.kind === 'flag') p = { x: p.x + sc * 0.2, y: p.y - sc * 0.12 };
      }
      const dd = Math.hypot(x - p.x, y - p.y) - sc * 0.42;
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    return bd < 18 ? best : -1;
  }

  private pickTower(x: number, y: number): number {
    let best = -1;
    let bd = 1e9;
    for (let i = 0; i < this.towers.length; i++) {
      const t = this.towers[i];
      if (t.grow < 0.5) continue;
      const p = this.pos(t.s, t.u);
      const sc = this.scl(t.s);
      const dd = Math.hypot(x - p.x, (y - (p.y - sc * 0.3)) * 0.75) - sc * 0.4;
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    return bd < 20 ? best : -1;
  }

  private releaseBucket(): void {
    const b = this.bucket;
    const water = this.waterAtU(b.u);
    const tooWet = b.s < water + 0.03;
    const room = this.towers.length < 6;
    if (tooWet || !room) {
      b.state = 'fly';
      b.fly = 0;
      b.fromS = b.s;
      b.fromU = b.u;
      if (tooWet) {
        this.ctx.audio.plip(0.8);
        this.splashAt(b.s, b.u, 0.3);
      } else {
        this.ctx.audio.flump(0.1);
      }
      return;
    }
    // nudge apart from an existing tower so towers never sit inside each other
    let s = clamp(b.s, water + 0.05, 1.0);
    let u = clamp(b.u, -1.05, 1.05);
    for (let k = 0; k < 6; k++) {
      let moved = false;
      for (const t of this.towers) {
        const pa = this.pos(s, u);
        const pb = this.pos(t.s, t.u);
        const min = (this.scl(s) + this.scl(t.s)) * 0.31;
        const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (d < min && d > 0.001) {
          const push = (min - d) / min;
          u += Math.sign(u - t.u || 1) * 0.06 * push;
          s += Math.sign(s - t.s || 1) * 0.012 * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
    const t = this.towerAt(clamp(s, water + 0.05, 1.0), clamp(u, -1.1, 1.1), 0);
    this.towers.push(t);
    this.newTower = t;
    b.s = t.s;
    b.u = t.u;
    b.state = 'tip';
    b.tip = 0;
    b.poured = false;
    this.ctx.audio.whoosh(0.35, 0.4);
  }

  private dropDeco(i: number): void {
    const d = this.deco[i];
    let best = -1;
    let bd = 1e9;
    for (let k = 0; k < this.towers.length; k++) {
      const t = this.towers[k];
      if (t.grow < 0.6) continue;
      const top = this.towerTop(t);
      const p = this.pos(d.s, d.u);
      const dd = Math.hypot(p.x - top.x, p.y - top.y);
      if (dd < bd) {
        bd = dd;
        best = k;
      }
    }
    if (best >= 0 && bd < this.scl(this.towers[best].s) * 1.15) {
      d.on = best;
      d.tilt = 0;
      d.tiltV = d.kind === 'flag' ? 2.2 : 0;
      this.ctx.audio.plip(1.6);
      for (let k = 0; k < 6; k++) this.spillGrain(this.towers[best].s, this.towers[best].u, 0.4);
    } else {
      d.on = -1;
      d.rot = this.rng.range(-1.1, 1.1);
      this.ctx.audio.flump(0);
    }
  }

  private pushBerm(s: number, u: number, power: number): void {
    const s2 = clamp(s, 0.22, 1.02);
    const i0 = this.binOf(u);
    // before the sea is a threat a finger only scuffs the surface
    const cap = this.ctx.phase.at('foreshadow') ? 1 : 0.28;
    for (let d = -2; d <= 2; d++) {
      const i = i0 + d;
      if (i < 0 || i >= NB) continue;
      const wgt = d === 0 ? 1 : Math.abs(d) === 1 ? 0.62 : 0.26;
      if (this.bermH[i] < 0.02) this.bermS[i] = s2;
      else this.bermS[i] += (s2 - this.bermS[i]) * 0.3 * wgt;
      this.bermH[i] = Math.min(cap, this.bermH[i] + power * wgt);
    }
    if (this.rng.next() < 0.6) this.spillGrain(s2, u, 0.4);
    if (this.bermSound <= 0) {
      this.bermSound = 0.2;
      this.ctx.audio.whoosh(0.16, 0.22);
    }
  }

  // =================================================================== dev

  readonly devActions: DevAction[] = [
    {
      name: 'castle:build',
      run: () => {
        this.buildCastle(4);
        this.sparkleBurst();
        this.kid.nod = 1;
        this.ctx.audio.bloom();
      },
    },
    {
      name: 'tide:in',
      run: () => {
        this.tideTarget = 0.47;
        this.waveAmpTarget = 0.27;
        this.waveStrength = 0.6;
        this.waveEvery = 2.6;
        this.waveTimer = 0.3;
      },
    },
    {
      name: 'wave:big',
      run: () => {
        this.wave = null;
        this.waveAmp = Math.max(this.waveAmp, 0.3);
        this.spawnWave(1);
      },
    },
    {
      name: 'tide:out',
      run: () => {
        this.tideTarget = 0.2;
        this.waveAmpTarget = 0.07;
        this.waveStrength = 0.18;
        this.waveEvery = 3.4;
      },
    },
    {
      name: 'berm:demo',
      run: () => {
        const b = this.geo.build;
        const span = this.geo.o === 'portrait' ? 0.7 : 0.5;
        for (let i = 0; i < NB; i++) {
          const d = Math.abs(binU(i) - b.u);
          if (d > span) continue;
          this.bermS[i] = b.s - 0.145;
          this.bermH[i] = clamp(0.95 * (1 - (d / span) ** 2) + 0.05, 0, 1);
        }
        this.tideTarget = Math.max(this.tideTarget, 0.52);
        this.tideS = Math.max(this.tideS, 0.46);
        this.waveAmp = Math.max(this.waveAmp, 0.26);
        this.wave = null;
        this.spawnWave(0.85);
      },
    },
    {
      name: 'demo:mid-drag',
      run: () => {
        const b = this.geo.build;
        this.towers = [];
        this.towers.push(this.towerAt(b.s - 0.02, b.u - 0.5));
        this.towers.push(this.towerAt(b.s - 0.05, b.u - 0.15));
        const t = this.towerAt(b.s + 0.01, b.u + 0.2, 0);
        this.towers.push(t);
        this.newTower = t;
        this.bucket.s = t.s;
        this.bucket.u = t.u;
        this.bucket.state = 'tip';
        this.bucket.tip = 0.62;
        this.bucket.poured = true;
        this.bucket.lift = 0;
        t.grow = (0.62 - 0.34) / 0.44;
        // a curtain of sand already coming off the rim
        for (let i = 0; i < 34; i++) this.spillRim(t, 1.2);
        for (const g of this.grains) g.life = g.max * this.rng.range(0.5, 1);
        this.toweringDone = false;
      },
    },
    {
      name: 'fail:collapse',
      run: () => {
        this.ctx.phase.set('resolve');
        this.ctx.phase.intervening = false;
        if (this.towers.length < 3) this.buildCastle(4);
        for (const t of this.towers) {
          t.slump = this.rng.range(0.82, 0.97);
          t.wetBase = 1;
          t.grow = 1;
          t.crack = 1;
        }
        let tall = 0;
        for (let i = 0; i < this.towers.length; i++) if (this.towers[i].s > this.towers[tall].s) tall = i;
        this.towers[tall].slump = 0.78;
        const flag = this.deco.find((d) => d.kind === 'flag');
        if (flag) {
          flag.on = tall;
          flag.tilt = 0.3;
          flag.tiltV = 0;
        }
        for (const d of this.deco) if (d.kind === 'shell') d.on = -1;
        this.tideS = 0.5;
        this.tideTarget = 0.3;
        this.waveAmp = this.waveAmpTarget = 0.1;
        this.waveStrength = 0.2;
        this.wave = null;
        this.waveTimer = 2.4;
        for (let i = 0; i < NB; i++) this.wetS[i] = 0.78;
        this.ending = 'washed';
        this.crab.mode = 'pop';
        this.crab.t = 1.9;
        this.crab.wave = 1;
        this.crab.face = -1;
        let best = -1;
        for (let i = 0; i < this.towers.length; i++) {
          if (i === tall) continue;
          if (best < 0 || this.towers[i].s > this.towers[best].s) best = i;
        }
        this.crab.tower = best < 0 ? tall : best;
        this.kid.laugh = 1;
        this.comicT = 1.9;
        this.surf = 0.4;
      },
    },
    {
      name: 'fail:washed',
      run: () => {
        this.ctx.phase.set('resolve');
        this.ctx.phase.intervening = false;
        const b = this.geo.build;
        // nothing left but a low mound with the flag still in it
        this.towers = [this.towerAt(b.s, b.u, 1)];
        this.towers[0].slump = 1;
        this.towers[0].wetBase = 0.9;
        this.towers[0].rMul = 1.0;
        this.towers[0].hMul = 0.62;
        const flag = this.deco.find((d) => d.kind === 'flag');
        if (flag) {
          flag.on = 0;
          flag.tilt = 0.24;
          flag.tiltV = 0;
        }
        for (const d of this.deco) {
          if (d.kind !== 'shell') continue;
          d.on = -1;
          d.s = b.s + this.rng.range(0.06, 0.16);
          d.u = b.u + this.rng.range(-0.5, 0.5);
        }
        this.bermH.fill(0);
        this.scars = [];
        this.tideS = 0.54;
        this.tideTarget = 0.32;
        this.waveAmp = this.waveAmpTarget = 0.11;
        this.waveStrength = 0.25;
        this.wave = null;
        this.waveTimer = 1.8;
        for (let i = 0; i < NB; i++) {
          this.wetS[i] = 0.78;
          this.foamA[i] = 0.5;
        }
        this.ending = 'washed';
        this.crab.mode = 'watch';
        this.crab.s = this.geo.home.crab.x + 0.03;
        this.crab.u = this.geo.home.crab.y + 0.04;
        this.crab.face = -1;
        this.kid.laugh = 1;
        this.comicT = 1.6;
        this.surf = 0.55;
      },
    },
  ];

  devState(): Record<string, unknown> {
    let bermMax = 0;
    for (let i = 0; i < NB; i++) bermMax = Math.max(bermMax, this.bermH[i]);
    return {
      phase: this.ctx.phase.name,
      phaseT: +this.ctx.phase.t.toFixed(2),
      intervening: this.ctx.phase.intervening,
      ending: this.ending,
      seed: this.rng.seed,
      orientation: this.geo?.o,
      tide: +this.tideS.toFixed(3),
      tideTarget: +this.tideTarget.toFixed(3),
      waveAmp: +this.waveAmp.toFixed(3),
      waveStrength: +this.waveStrength.toFixed(2),
      waveActive: !!this.wave,
      waveCount: this.waveCount,
      surf: +this.surf.toFixed(2),
      bermMax: +bermMax.toFixed(2),
      bucket: this.bucket.state,
      held: this.held,
      towers: this.towers.map((t) => ({
        s: +t.s.toFixed(2),
        u: +t.u.toFixed(2),
        grow: +t.grow.toFixed(2),
        slump: +t.slump.toFixed(2),
        wet: +t.wetBase.toFixed(2),
      })),
      flagOn: this.deco.find((d) => d.kind === 'flag')?.on ?? -1,
      crab: this.crab.mode,
      grains: this.grains.length,
    };
  }

  // ============================================================== hub tile

  thumbnail(gg: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    const hz = h * 0.3;
    const sky = gg.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, 'rgb(84,164,224)');
    sky.addColorStop(1, 'rgb(210,234,240)');
    gg.fillStyle = sky;
    gg.fillRect(0, 0, w, hz + 2);

    gg.fillStyle = 'rgba(255,250,214,0.95)';
    gg.beginPath();
    gg.arc(w * 0.82, h * 0.13, h * 0.07, 0, Math.PI * 2);
    gg.fill();

    // sand
    const sand = gg.createLinearGradient(0, hz, 0, h);
    sand.addColorStop(0, 'rgb(220,192,146)');
    sand.addColorStop(1, 'rgb(244,224,186)');
    gg.fillStyle = sand;
    gg.fillRect(0, hz, w, h - hz);

    // sea: the edge breathes up and down the beach
    const phase = (t * 0.32) % 1;
    const edge = hz + (h - hz) * (0.16 + 0.16 * (1 - Math.cos(phase * Math.PI * 2)) * 0.5);
    gg.fillStyle = 'rgba(122,96,60,0.28)';
    gg.fillRect(0, edge, w, (h - hz) * 0.16);
    const sea = gg.createLinearGradient(0, hz, 0, edge);
    sea.addColorStop(0, 'rgb(26,110,150)');
    sea.addColorStop(1, 'rgb(96,196,192)');
    gg.fillStyle = sea;
    gg.fillRect(0, hz, w, edge - hz);
    gg.strokeStyle = 'rgba(255,255,255,0.9)';
    gg.lineWidth = Math.max(1.5, h * 0.012);
    gg.beginPath();
    for (let i = 0; i <= 10; i++) {
      const x = (w * i) / 10;
      const y = edge + Math.sin(i * 1.4 + t * 2.2) * h * 0.008;
      if (i === 0) gg.moveTo(x, y);
      else gg.lineTo(x, y);
    }
    gg.stroke();

    // two towers and a flag
    const towers: Array<[number, number, number]> = [
      [0.36, 0.84, 0.9],
      [0.56, 0.9, 1.1],
    ];
    for (const [u, sy, hs] of towers) {
      const x = w * u;
      const y = h * sy;
      const r = h * 0.1;
      const th = h * 0.24 * hs;
      gg.fillStyle = 'rgba(126,96,60,0.22)';
      gg.beginPath();
      gg.ellipse(x + r * 0.3, y + r * 0.1, r * 1.3, r * 0.4, 0, 0, Math.PI * 2);
      gg.fill();
      const tg = gg.createLinearGradient(x - r, 0, x + r, 0);
      tg.addColorStop(0, 'rgb(248,228,190)');
      tg.addColorStop(0.5, 'rgb(228,200,152)');
      tg.addColorStop(1, 'rgb(184,150,104)');
      gg.fillStyle = tg;
      gg.beginPath();
      gg.moveTo(x - r, y);
      gg.lineTo(x - r * 0.82, y - th);
      gg.lineTo(x + r * 0.82, y - th);
      gg.lineTo(x + r, y);
      gg.closePath();
      gg.fill();
      gg.fillStyle = 'rgb(252,238,206)';
      gg.beginPath();
      gg.ellipse(x, y - th, r * 0.82, r * 0.26, 0, 0, Math.PI * 2);
      gg.fill();
      gg.strokeStyle = 'rgba(160,126,84,0.4)';
      gg.lineWidth = Math.max(1, h * 0.008);
      for (let i = 1; i <= 2; i++) {
        gg.beginPath();
        gg.ellipse(x, y - (th * i) / 3, r * 0.94, r * 0.24, 0, 0.2, Math.PI - 0.2);
        gg.stroke();
      }
    }
    // flag on the taller one
    const fx = w * 0.56;
    const fy = h * 0.9 - h * 0.264;
    gg.strokeStyle = 'rgb(232,226,212)';
    gg.lineWidth = Math.max(1.4, h * 0.012);
    gg.beginPath();
    gg.moveTo(fx, fy);
    gg.lineTo(fx, fy - h * 0.16);
    gg.stroke();
    gg.fillStyle = 'rgb(240,92,74)';
    gg.beginPath();
    gg.moveTo(fx, fy - h * 0.16);
    gg.quadraticCurveTo(fx + h * 0.09, fy - h * 0.13 + Math.sin(t * 4) * h * 0.012, fx + h * 0.02, fy - h * 0.09);
    gg.closePath();
    gg.fill();

    // the red bucket waiting on the dry sand
    const bx = w * 0.82;
    const by = h * 0.92;
    const br = h * 0.09;
    gg.fillStyle = 'rgba(126,96,60,0.24)';
    gg.beginPath();
    gg.ellipse(bx + br * 0.3, by, br * 1.2, br * 0.34, 0, 0, Math.PI * 2);
    gg.fill();
    const bgr = gg.createLinearGradient(bx - br, 0, bx + br, 0);
    bgr.addColorStop(0, 'rgb(196,44,36)');
    bgr.addColorStop(0.45, 'rgb(248,92,68)');
    bgr.addColorStop(1, 'rgb(180,36,30)');
    gg.fillStyle = bgr;
    gg.beginPath();
    gg.moveTo(bx - br, by - br * 1.1);
    gg.lineTo(bx - br * 0.78, by);
    gg.lineTo(bx + br * 0.78, by);
    gg.lineTo(bx + br, by - br * 1.1);
    gg.closePath();
    gg.fill();
    gg.strokeStyle = 'rgb(255,208,72)';
    gg.lineWidth = Math.max(1.4, h * 0.012);
    gg.beginPath();
    gg.ellipse(bx, by - br * 1.1, br, br * 0.3, 0, 0, Math.PI * 2);
    gg.stroke();
  }
}

export const episode: Episode = new Sandcastle();
