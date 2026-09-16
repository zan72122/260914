/**
 * E. 帽子と風 — hatwind.
 *
 * A park bench, a kid with an ice cream, and a straw hat that does not yet
 * know it is about to become a kite. The world is the toy: grass ripples,
 * seeds lift, a dog waits on the path, a scarecrow keeps its counsel and a
 * duck minds the pond. Every head in this park accepts a hat.
 *
 * The scene is 2.5D: things live at (x, depth, height). Depth drives both the
 * screen y of the ground and the scale, so the hat really does fly *away*
 * and come *back* rather than sliding around on glass.
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
/** 0 -> 1 -> 0 hump */
const hump = (t: number): number => {
  const x = clamp(t, 0, 1);
  return Math.sin(Math.PI * x);
};
const approach = (cur: number, to: number, rate: number, dt: number): number =>
  cur + (to - cur) * (1 - Math.exp(-rate * dt));

// ---------------------------------------------------------------- types

type CatcherKind = 'kid' | 'dog' | 'scarecrow' | 'duck';
type Ending = 'none' | 'kid' | 'dog' | 'scarecrow' | 'duck';
type HatState = 'bench' | 'held' | 'free' | 'worn';

interface Catcher {
  kind: CatcherKind;
  /** world position */
  x: number;
  d: number;
  /** height of the crown of the head above the ground, in scale-1 px */
  hz: number;
  /** head radius in scale-1 px */
  hr: number;
  /** how proudly it is wearing the hat right now */
  react: number;
  /** looks straight at the camera */
  look: number;
  /** per-kind animation clocks */
  wag: number;
  bob: number;
  quack: number;
  /** walking offset for the dog trot / duck waddle */
  walk: number;
  walkX: number;
  walkD: number;
}

interface Blade {
  x: number;
  d: number;
  h: number;
  w: number;
  lean: number;
  ph: number;
  tone: number;
}

interface Mote {
  kind: 0 | 1 | 2; // 0 dandelion seed, 1 leaf, 2 dust
  x: number;
  d: number;
  z: number;
  vx: number;
  vd: number;
  vz: number;
  rot: number;
  spin: number;
  size: number;
  life: number;
  max: number;
  tone: number;
}

interface Puff {
  x: number;
  d: number;
  stem: number;
  /** 1 = full seed head, 0 = bare */
  full: number;
  pop: number;
  ph: number;
}

interface Cloud {
  x: number;
  y: number;
  r: number;
  speed: number;
  puffs: Array<{ x: number; y: number; r: number }>;
}

interface Geo {
  w: number;
  h: number;
  o: Orientation;
  unit: number;
  horizonY: number;
  sun: { x: number; y: number };
  /** wind direction in world (x, depth) */
  wx: number;
  wd: number;
  bench: { x: number; d: number };
  tree: { x: number; d: number };
  pond: { x: number; d: number; rx: number };
  path: Array<{ x: number; d: number }>;
  puffs: Array<{ x: number; d: number }>;
  hills: number;
}

const GRASS: RGB[] = [
  [122, 176, 92],
  [142, 192, 104],
  [104, 158, 84],
  [158, 200, 116],
];
const STRAW: RGB = [230, 196, 132];
const STRAW_LIT: RGB = [250, 230, 176];
const STRAW_DARK: RGB = [172, 134, 78];
const RIBBON: RGB = [196, 84, 78];

// ---------------------------------------------------------------- episode

class HatWind implements Episode {
  readonly id = 'hatwind';
  readonly title = 'E. 帽子と風 / hatwind';

  private ctx!: EpisodeCtx;
  private rng = new Rng(1);
  private noise = makeNoise1d(1);
  private geo!: Geo;

  private t = 0;
  private fade = 1;
  private fadeOut = false;

  // ---- wind
  private windBase = 0.08;
  private windBaseT = 0.08;
  private wind = 0.08;
  private gustAmp = 0;
  private gustAge = 99;
  private gustDur = 1;
  private gustsLeft = 0;
  private gustTimer = 0;
  private gustCount = 0;
  private shadowX = -2; // cloud shadow sweeping the field, -2..2
  private ripple = 0; // travelling-ripple emphasis

  // ---- sky
  private clouds: Cloud[] = [];
  private warm = 1; // 1 sunny, 0 grey

  // ---- world
  private blades: Blade[] = [];
  private motes: Mote[] = [];
  private puffs: Puff[] = [];
  private catchers: Catcher[] = [];
  private pondRipples: Array<{ r: number; life: number }> = [];

  // ---- hat
  private hat = {
    x: 0,
    d: 0.7,
    z: 0,
    vx: 0,
    vd: 0,
    vz: 0,
    spin: 0,
    spinV: 0,
    tilt: 1.22,
    tiltV: 0,
    state: 'bench' as HatState,
    wearer: 0,
    press: 0,
    settle: 0,
    flap: 0,
    restT: 0,
    grabDX: 0,
    grabDY: 0,
    target: -1,
    steer: 0,
    everWorn: false,
  };

  // ---- kid
  private kid = {
    grin: 0,
    alarm: 0,
    relief: 0,
    shrug: 0,
    lookWind: 0,
    hold: 0,
    lick: 0,
    eyeUp: 0,
    blink: 0,
    blinkT: 2,
    reach: 0,
    hair: 0,
    coneHat: 0,
  };

  // ---- ice cream
  private cone = {
    held: false,
    x: 0,
    y: 0,
    drip: 0,
    dripZ: -1,
    dripX: 0,
    dripY: 0,
    licks: 0,
    grabDX: 0,
    grabDY: 0,
  };

  // ---- butterfly
  private fly = { x: 0, y: 0, tx: 0, ty: 0, flap: 0, perch: 0, scare: 0 };

  // ---- beats
  private ending: Ending = 'none';
  private comicT = 0;
  private quiet = 0;
  private idle = 0;
  private autoWear = 0;
  private savedAt = -99;
  private landedAt = -99;
  private camZ = 1;
  private camZT = 1;
  private camX = 0;
  private camY = 0;

  private pointerX = 0;
  private pointerY = 0;
  private pointerDown = false;
  private grab: 'none' | 'hat' | 'cone' | 'puff' = 'none';
  private grabPuff = -1;

  // ------------------------------------------------------------ lifecycle

  init(ctx: EpisodeCtx): void {
    this.ctx = ctx;
    this.rng = ctx.rng;
    this.rng.reset();
    this.noise = makeNoise1d(this.rng.seed ^ 0x5eed);
    this.t = 0;
    this.fade = 1;
    this.fadeOut = false;
    this.motes = [];
    this.pondRipples = [];
    this.grab = 'none';
    this.buildClouds();
    if (this.geo) {
      this.buildField();
      this.enterPhase('establish');
    }
  }

  private buildClouds(): void {
    this.clouds = [];
    for (let i = 0; i < 4; i++) {
      const puffs: Array<{ x: number; y: number; r: number }> = [];
      const n = 5 + Math.floor(this.rng.range(0, 3));
      for (let k = 0; k < n; k++) {
        const f = k / (n - 1);
        puffs.push({
          x: -1 + f * 2 + this.rng.range(-0.12, 0.12),
          y: this.rng.range(-0.34, 0.1) * (1 - Math.abs(f - 0.5) * 1.3),
          r: (0.4 + 0.6 * Math.sin(Math.PI * f) ** 0.6) * this.rng.range(0.82, 1.1),
        });
      }
      this.clouds.push({
        x: this.rng.range(-0.2, 1.2),
        y: this.rng.range(0.05, 0.62),
        r: this.rng.range(0.6, 1.25),
        speed: this.rng.range(0.7, 1.35),
        puffs,
      });
    }
  }

  // ------------------------------------------------------------ geometry

  private fieldY(d: number): number {
    const g = this.geo;
    return g.horizonY + (g.h - g.horizonY) * Math.pow(clamp(d, 0, 1.6), 1.3);
  }

  private scaleAt(d: number): number {
    return 0.34 + 0.66 * clamp(d, 0, 1.6);
  }

  private sy(d: number, z: number): number {
    return this.fieldY(d) - z * this.scaleAt(d);
  }

  layout(o: Orientation, w: number, h: number): void {
    const prev = this.geo;
    const unit = Math.min(w, h);
    const g: Geo = {
      w,
      h,
      o,
      unit,
      horizonY: 0,
      sun: { x: 0, y: 0 },
      wx: 1,
      wd: 0,
      bench: { x: 0, d: 0.7 },
      tree: { x: 0, d: 0.95 },
      pond: { x: 0, d: 0.4, rx: 0 },
      path: [],
      puffs: [],
      hills: 0,
    };

    let specs: Array<[CatcherKind, number, number, number, number]> = [];
    if (o === 'portrait') {
      // wind out of the top-left, catchers down the right side
      g.horizonY = h * 0.4;
      g.sun = { x: w * 0.16, y: h * 0.1 };
      g.wx = 0.92;
      g.wd = 0.22;
      g.bench = { x: w * 0.34, d: 0.7 };
      g.tree = { x: w * 0.015, d: 0.34 };
      g.pond = { x: w * 0.86, d: 0.42, rx: w * 0.24 };
      g.path = [
        { x: -w * 0.08, d: 0.46 },
        { x: w * 0.46, d: 0.56 },
        { x: w * 1.04, d: 0.92 },
      ];
      g.puffs = [
        { x: w * 0.14, d: 0.62 },
        { x: w * 0.58, d: 0.86 },
        { x: w * 0.88, d: 1.0 },
      ];
      g.hills = h * 0.075;
      specs = [
        ['kid', g.bench.x, g.bench.d, 0.5, 0.078],
        ['dog', w * 0.7, 0.66, 0.175, 0.05],
        ['scarecrow', w * 0.74, 0.32, 0.47, 0.062],
        ['duck', w * 0.66, 0.48, 0.14, 0.05],
      ];
    } else {
      // wind left to right, catchers spread across the right
      g.horizonY = h * 0.42;
      g.sun = { x: w * 0.1, y: h * 0.13 };
      g.wx = 1;
      g.wd = 0.16;
      g.bench = { x: w * 0.2, d: 0.72 };
      g.tree = { x: w * 0.9, d: 0.26 };
      g.pond = { x: w * 0.68, d: 0.42, rx: w * 0.2 };
      g.path = [
        { x: -w * 0.04, d: 0.56 },
        { x: w * 0.4, d: 0.72 },
        { x: w * 1.04, d: 0.6 },
      ];
      g.puffs = [
        { x: w * 0.08, d: 0.86 },
        { x: w * 0.3, d: 0.72 },
        { x: w * 0.62, d: 0.96 },
      ];
      g.hills = h * 0.08;
      specs = [
        ['kid', g.bench.x, g.bench.d, 0.5, 0.078],
        ['dog', w * 0.38, 0.68, 0.175, 0.05],
        ['scarecrow', w * 0.44, 0.3, 0.47, 0.062],
        ['duck', w * 0.46, 0.47, 0.14, 0.05],
      ];
    }

    this.geo = g;
    this.catchers = specs.map((sp) =>
      this.mkCatcher(sp[0] as CatcherKind, sp[1] as number, sp[2] as number, sp[3] as number, sp[4] as number),
    );
    this.buildField();

    // keep the hat where it was, relatively
    if (!prev) {
      this.restHatOnBench();
    } else if (this.hat.state === 'worn') {
      this.snapHatToHead(this.catchers[this.hat.wearer]);
    } else if (this.hat.state === 'bench') {
      this.restHatOnBench();
    } else {
      this.hat.x = clamp(this.hat.x, w * 0.08, w * 0.92);
    }
    this.resetCone();
    this.fly.x = clamp(this.fly.x || w * 0.62, w * 0.1, w * 0.9);
    this.fly.y = clamp(this.fly.y || h * 0.5, h * 0.3, h * 0.8);
    this.fly.tx = this.fly.x;
    this.fly.ty = this.fly.y;
  }

  private mkCatcher(kind: CatcherKind, x: number, d: number, hz: number, hr: number): Catcher {
    const u = this.geo.unit;
    const old = this.catchers.find((c) => c.kind === kind);
    return {
      kind,
      x,
      d,
      hz: hz * u,
      hr: hr * u,
      react: old?.react ?? 0,
      look: old?.look ?? 0,
      wag: old?.wag ?? 0,
      bob: old?.bob ?? this.rng.range(0, 6),
      quack: old?.quack ?? 0,
      walk: old?.walk ?? 0,
      walkX: old?.walkX ?? 0,
      walkD: old?.walkD ?? 0,
    };
  }

  private buildField(): void {
    const g = this.geo;
    const r = new Rng(this.rng.seed ^ 0x9a17);
    this.blades = [];
    const clumps = Math.round(280 * clamp(g.w / 390, 0.9, 2.2));
    for (let i = 0; i < clumps; i++) {
      const d = 0.16 + Math.pow(r.next(), 0.5) * 1.24;
      const cx = r.range(-g.w * 0.08, g.w * 1.08);
      const n = 2 + Math.floor(r.next() * 3);
      const s0 = this.scaleAt(d);
      for (let k = 0; k < n; k++) {
        const bx2 = cx + r.range(-1, 1) * g.unit * 0.02 * s0;
        const bd2 = d + r.range(-0.012, 0.012);
        const py = this.fieldY(g.pond.d);
        const pry = g.pond.rx * 0.3;
        const q = ((bx2 - g.pond.x) / (g.pond.rx * 1.04)) ** 2 + ((this.fieldY(bd2) - py) / (pry * 1.04)) ** 2;
        if (q < 1) continue;
        this.blades.push({
          x: bx2,
          d: bd2,
          h: g.unit * r.range(0.03, 0.085),
          w: g.unit * r.range(0.004, 0.009),
          lean: r.range(-0.35, 0.35),
          ph: r.range(0, 30),
          tone: r.next(),
        });
      }
    }
    this.blades.sort((a, b) => a.d - b.d);

    this.puffs = g.puffs.map((p, i) => ({
      x: p.x,
      d: p.d,
      stem: g.unit * (0.075 + 0.02 * ((i * 7) % 3)),
      full: 1,
      pop: 0,
      ph: r.range(0, 10),
    }));
  }

  private resetCone(): void {
    const h = this.handPos();
    this.cone.x = h.x;
    this.cone.y = h.y;
    this.cone.held = false;
  }

  // ------------------------------------------------------------ hat placement

  private hatR(): number {
    return this.geo.unit * 0.118 * this.scaleAt(this.hat.d);
  }

  private restHatOnBench(): void {
    const g = this.geo;
    const s = this.scaleAt(g.bench.d);
    this.hat.state = 'bench';
    this.hat.x = g.bench.x + g.unit * 0.205 * s;
    this.hat.d = g.bench.d;
    this.hat.z = g.unit * 0.152;
    this.hat.vx = this.hat.vd = this.hat.vz = 0;
    this.hat.spin = 0.16;
    this.hat.spinV = 0;
    this.hat.tilt = 1.25;
    this.hat.tiltV = 0;
    this.hat.settle = 0;
    this.hat.target = -1;
  }

  private snapHatToHead(c: Catcher): void {
    this.hat.state = 'worn';
    this.hat.wearer = this.catchers.indexOf(c);
    this.hat.x = c.x + this.headLean(c) * 0.0;
    this.hat.d = c.d;
    this.hat.z = c.hz;
    this.hat.vx = this.hat.vd = this.hat.vz = 0;
    this.hat.spin = c.kind === 'duck' ? 0.3 : c.kind === 'dog' ? -0.18 : 0.06;
    this.hat.spinV = 0;
    this.hat.tilt = 1.22;
    this.hat.tiltV = 0;
    this.hat.target = -1;
    this.hat.everWorn = true;
  }

  private headLean(c: Catcher): number {
    return c.kind === 'kid' ? 0 : 0;
  }

  /** where a worn hat wants to sit (world) */
  private wornSpot(c: Catcher): { x: number; d: number; z: number } {
    const sc = this.scaleAt(c.d + c.walkD);
    const off =
      c.kind === 'kid'
        ? -c.hr * 0.72
        : c.kind === 'scarecrow'
          ? -c.hr * 0.8
          : c.kind === 'dog'
            ? c.hr * 0.5
            : // the duck wears it down over its eyes, so only the bill shows
              -c.hr * 0.15;
    const dx =
      (c.kind === 'dog' ? this.geo.unit * 0.055 : c.kind === 'duck' ? this.geo.unit * 0.022 : 0) * sc;
    return { x: c.x + c.walkX + dx, d: c.d + c.walkD, z: c.hz + off };
  }

  // ------------------------------------------------------------ phases

  enterPhase(name: PhaseName): void {
    const ph = this.ctx.phase;
    if (ph.name !== name) ph.set(name);
    ph.intervening = name === 'trouble';
    this.quiet = 0;
    this.idle = 0;
    this.comicT = 0;
    this.motes = [];
    this.grab = 'none';
    this.cone.held = false;
    this.gustTimer = 0;
    this.gustsLeft = 0;
    this.gustCount = 0;
    this.gustAmp = 0;
    this.gustAge = 99;
    this.shadowX = -2.2;
    this.autoWear = 0;
    const k = this.kid;

    switch (name) {
      case 'establish':
        this.ending = 'none';
        this.windBase = this.windBaseT = 0.08;
        this.wind = 0.08;
        this.ripple = 0.15;
        this.warm = 1;
        this.camZ = 1.07;
        this.camZT = 1;
        this.camX = 0;
        this.camY = 0;
        this.hat.everWorn = false;
        this.restHatOnBench();
        this.resetCone();
        this.cone.drip = 0.35;
        this.cone.dripZ = -1;
        this.cone.licks = 0;
        k.grin = k.alarm = k.relief = k.shrug = k.lookWind = k.hold = k.lick = k.reach = k.eyeUp = 0;
        k.hair = 0;
        k.coneHat = 0;
        for (const c of this.catchers) {
          c.react = 0;
          c.look = 0;
          c.walk = 0;
          c.walkX = 0;
          c.walkD = 0;
          c.quack = 0;
        }
        for (const p of this.puffs) {
          p.full = 1;
          p.pop = 0;
        }
        this.fly.perch = 0;
        this.fly.scare = 0;
        break;

      case 'action':
        this.enterPhase('establish');
        this.ctx.phase.set('action');
        this.camZ = this.camZT = 1;
        break;

      case 'foreshadow':
        this.enterPhase('action');
        this.ctx.phase.set('foreshadow');
        this.snapHatToHead(this.catchers[0]);
        this.windBase = 0.2;
        this.windBaseT = 0.52;
        this.wind = 0.22;
        this.ripple = 1;
        this.warm = 0.86;
        this.puffs[0].full = 0.55;
        break;

      case 'trouble': {
        this.enterPhase('foreshadow');
        this.ctx.phase.set('trouble');
        this.ctx.phase.intervening = true;
        this.windBase = this.windBaseT = 0.62;
        this.wind = 0.66;
        this.ripple = 1;
        this.warm = 0.66;
        this.gustsLeft = 3;
        this.gustTimer = 0.3;
        this.shadowX = -1.3;
        k.lookWind = 1;
        k.hold = 0.6;
        for (const p of this.puffs) p.full = Math.min(p.full, 0.4);
        break;
      }

      case 'resolve':
        this.enterPhase('trouble');
        this.ctx.phase.set('resolve');
        this.ctx.phase.intervening = false;
        this.ending = 'kid';
        this.snapHatToHead(this.catchers[0]);
        this.catchers[0].react = 1;
        this.savedAt = this.t;
        this.windBase = this.windBaseT = 0.12;
        this.wind = 0.2;
        this.ripple = 0.35;
        this.warm = 1;
        k.alarm = 0;
        k.relief = 1;
        k.hold = 0.7;
        k.lookWind = 0;
        break;

      case 'comic':
        this.enterPhase('resolve');
        this.ctx.phase.set('comic');
        this.comicT = 0;
        break;

      case 'settle':
        this.enterPhase('comic');
        this.ctx.phase.set('settle');
        this.comicT = 4;
        this.catchers[0].look = 0;
        this.fly.perch = 1;
        break;
    }
  }

  /** forward transition during play: keep the world, arm the next beat */
  private advance(name: PhaseName): void {
    const ph = this.ctx.phase;
    ph.set(name);
    ph.intervening = name === 'trouble';
    switch (name) {
      case 'action':
        this.camZT = 1;
        break;
      case 'foreshadow':
        this.windBaseT = 0.52;
        this.ripple = 1;
        this.ctx.audio.whoosh(0.35, 1.6);
        break;
      case 'trouble':
        this.windBaseT = 0.62;
        this.gustsLeft = 3;
        this.gustTimer = 0.35;
        this.gustCount = 0;
        break;
      case 'resolve':
        this.windBaseT = 0.1;
        this.gustsLeft = 0;
        this.camZT = 1.03;
        if (this.ending === 'kid') this.ctx.audio.bloom();
        break;
      case 'comic':
        this.comicT = 0;
        this.camZT = 1;
        break;
      case 'settle':
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------ update

  update(dt: number): void {
    this.t += dt;
    const ph = this.ctx.phase;
    ph.update(dt);

    this.updateWind(dt);
    this.updateBeats(dt);
    this.updateHat(dt);
    this.updateCatchers(dt);
    this.updateKid(dt);
    this.updateMotes(dt);
    this.updatePuffs(dt);
    this.updateButterfly(dt);
    this.updateClouds(dt);
    this.updateCamera(dt);
    this.updateSound();

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

  private gustShape(): number {
    if (this.gustAge > this.gustDur) return 0;
    const u = this.gustAge / this.gustDur;
    return Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62)), 1.25);
  }

  private startGust(peak: number, dur: number, target = -1): void {
    this.gustAmp = peak;
    this.gustDur = dur;
    this.gustAge = 0;
    this.gustCount++;
    this.shadowX = -1.25;
    this.ctx.audio.whoosh(clamp(peak * 1.1, 0.4, 1.3), dur * 0.8);
    // the field answers immediately
    for (let i = 0; i < 14; i++) this.spawnMote(2);
    for (const p of this.puffs) if (p.full > 0.05 && this.rng.next() < 0.7) this.popPuff(p, 0.5);
    if (target >= 0) {
      this.hat.target = target;
      this.hat.steer = 1;
    }
  }

  private updateWind(dt: number): void {
    this.windBase = approach(this.windBase, this.windBaseT, 0.8, dt);
    this.gustAge += dt;
    const g = this.gustAmp * this.gustShape();
    const breath = 0.045 * this.noise(this.t * 0.7);
    this.wind = approach(this.wind, this.windBase + g + breath, 9, dt);
    this.ripple = approach(this.ripple, clamp(this.wind * 1.7, 0.15, 1), 1.4, dt);
    if (this.gustAge < this.gustDur * 1.6) this.shadowX += dt * 0.85;
    else this.shadowX = approach(this.shadowX, 2.4, 0.4, dt);
    this.warm = approach(this.warm, clamp(1 - this.wind * 0.55, 0.55, 1), 1.6, dt);
  }

  /** the travelling ripple: how hard the grass at (x, d) is bending right now */
  private windAt(x: number, d: number): number {
    const g = this.geo;
    const travel = this.t * (1.4 + this.wind * 2.6) - (x / (g.unit * 0.42)) - d * 1.1;
    const wave = 0.5 + 0.5 * Math.sin(travel);
    return this.wind * (0.42 + 0.78 * this.ripple * wave) + 0.03 * this.noise(x * 0.01 + this.t * 0.6);
  }

  private updateBeats(dt: number): void {
    const ph = this.ctx.phase;
    switch (ph.name) {
      case 'establish':
        if (ph.t > 2.8) this.advance('action');
        break;

      case 'action': {
        // the make step: the hat is on the kid's head and nobody is fiddling
        const worn = this.hat.state === 'worn' && this.hat.wearer === 0;
        if (worn && this.grab === 'none' && !this.cone.held) {
          this.quiet += dt;
          if (this.quiet > 1.9) this.advance('foreshadow');
        } else {
          this.quiet = 0;
        }
        // nobody touched anything for a long while: the kid puts it on itself
        if (this.grab === 'none' && !this.pointerDown) this.idle += dt;
        else this.idle = 0;
        if (!worn && this.idle > 8 && this.hat.state !== 'held') {
          this.autoWear += dt;
          this.kid.reach = smooth(this.autoWear / 0.9);
          if (this.autoWear > 0.95) {
            this.landHatOn(this.catchers[0], true);
            this.kid.reach = 0;
            this.idle = 0;
          }
        }
        break;
      }

      case 'foreshadow': {
        const t = ph.t;
        // brim lifts once, then twice
        if (t > 1.15 && this.hat.flap < 0.01 && this.gustCount === 0) {
          this.hat.flap = 0.75;
          this.gustCount = 1;
          this.ctx.audio.whoosh(0.4, 0.5);
        }
        if (t > 2.5 && this.gustCount === 1) {
          this.hat.flap = 0.95;
          this.gustCount = 2;
          this.ctx.audio.whoosh(0.5, 0.45);
          this.popPuff(this.puffs[0], 0.7);
        }
        if (t > 2.95 && this.gustCount === 2) {
          this.hat.flap = 1;
          this.gustCount = 3;
          this.kid.hold = 1;
          this.kid.lookWind = 1;
        }
        if (t > 0.6 && this.motes.filter((m) => m.kind === 1).length < 1 && this.rng.next() < dt * 0.9) {
          this.spawnMote(1);
        }
        if (this.rng.next() < dt * (3 + this.wind * 10)) this.spawnMote(2);
        if (this.rng.next() < dt * (0.9 + this.wind * 3)) this.spawnMote(0);
        if (t > 4.9) {
          this.gustCount = 0;
          this.advance('trouble');
        }
        break;
      }

      case 'trouble': {
        this.gustTimer -= dt;
        if (this.gustTimer <= 0 && this.gustsLeft > 0) {
          this.gustsLeft--;
          const last = this.gustsLeft === 0;
          const tgt = last ? this.failTarget() : -1;
          this.startGust(last ? 1.15 : 0.95, last ? 2.1 : 1.6, tgt);
          this.gustTimer = last ? 5 : 3.6;
        }
        if (this.rng.next() < dt * (2 + this.wind * 12)) this.spawnMote(2);
        if (this.rng.next() < dt * this.wind * 4) this.spawnMote(0);
        if (this.rng.next() < dt * this.wind * 1.4) this.spawnMote(1);

        const settled = this.hat.state === 'worn';
        const doneGusts = this.gustsLeft === 0 && this.gustAge > this.gustDur * 1.15;
        if (settled && doneGusts && this.hat.settle < 0.05) {
          this.ending = this.catchers[this.hat.wearer].kind as Ending;
          this.landedAt = this.t;
          this.advance('resolve');
        } else if (ph.t > 18) {
          if (this.hat.state !== 'worn') this.landHatOn(this.catchers[this.failTarget()], false);
          this.ending = this.catchers[this.hat.wearer].kind as Ending;
          this.advance('resolve');
        }
        break;
      }

      case 'resolve': {
        const dur = this.ending === 'kid' ? 2.2 : 2.8;
        if (ph.t > dur) this.advance('comic');
        break;
      }

      case 'comic':
        this.comicT += dt;
        this.runComic(dt);
        if (this.comicT > 3.8) this.advance('settle');
        break;

      case 'settle':
        if (this.grab === 'none' && !this.pointerDown) this.idle += dt;
        else this.idle = 0;
        if (this.idle > 6.5) this.leave();
        break;
    }
  }

  /** deterministic landing target for this run */
  private failTarget(): number {
    const pick = (this.rng.seed % 3) + 1; // 1 dog, 2 scarecrow, 3 duck
    return pick;
  }

  // ------------------------------------------------------------ comic beats

  private runComic(dt: number): void {
    const c = this.comicT;
    const k = this.kid;
    switch (this.ending) {
      case 'kid':
        // the butterfly decides the hat is a landing pad; the kid freezes and
        // tries to look at it without moving its head
        if (c > 0.5) this.fly.perch = 1;
        k.relief = 1;
        if (c > 1.2) k.eyeUp = smooth((c - 1.2) / 0.5);
        if (c > 2.6) this.catchers[0].look = smooth((c - 2.6) / 0.5);
        break;

      case 'dog': {
        // the dog trots over and drops the hat at the kid's feet
        const dog = this.catchers[1];
        if (c > 0.9 && c < 2.6) {
          const p = smooth((c - 0.9) / 1.7);
          const g = this.geo;
          dog.walkX = (g.bench.x + g.unit * 0.16 * this.scaleAt(g.bench.d) - dog.x) * p;
          dog.walkD = (g.bench.d + 0.1 - dog.d) * p;
          dog.walk += dt * 9;
        }
        if (c > 2.6 && this.hat.state === 'worn' && this.hat.wearer === 1) {
          this.hat.state = 'free';
          this.hat.vz = 30;
          this.hat.vx = 0;
          this.hat.spinV = 1.2;
          this.ctx.audio.flump(0);
          dog.react = 0.4;
        }
        if (c > 3.0) dog.look = smooth((c - 3.0) / 0.5);
        if (c > 2.7) k.grin = Math.max(k.grin, smooth((c - 2.7) / 0.5));
        if (c > 0.6 && c < 2.4) k.shrug = smooth((c - 0.6) / 0.5);
        break;
      }

      case 'scarecrow':
        // the kid wears the ice cream cup instead
        if (c > 0.4 && c < 1.6) k.shrug = smooth((c - 0.4) / 0.4) * (1 - smooth((c - 1.3) / 0.3));
        if (c > 1.5) k.coneHat = smooth((c - 1.5) / 0.6);
        if (c > 2.3) {
          this.catchers[0].look = smooth((c - 2.3) / 0.5);
          this.catchers[2].look = smooth((c - 2.6) / 0.5);
        }
        break;

      case 'duck': {
        const duck = this.catchers[3];
        if (c > 0.3 && c < 2.2) {
          const p = smooth((c - 0.3) / 1.9);
          duck.walkX = this.geo.unit * 0.17 * p * (this.geo.o === 'portrait' ? 1 : 1);
          duck.walkD = -0.05 * p;
          duck.walk += dt * 6;
        }
        if (c > 2.3) {
          duck.look = smooth((c - 2.3) / 0.45);
          if (duck.quack <= 0 && c < 2.5) {
            duck.quack = 0.5;
            this.ctx.audio.mew();
          }
        }
        if (c > 0.8 && c < 2.6) this.kid.shrug = smooth((c - 0.8) / 0.5);
        break;
      }

      default:
        break;
    }
  }

  // ------------------------------------------------------------ the hat

  private updateHat(dt: number): void {
    const H = this.hat;
    const g = this.geo;
    H.flap = Math.max(0, H.flap - dt * 1.8);
    H.press = Math.max(0, H.press - dt * 2.4);
    H.settle = Math.max(0, H.settle - dt * 2.2);

    if (H.state === 'worn') {
      const c = this.catchers[H.wearer];
      const spot = this.wornSpot(c);
      const bounce = Math.sin(H.settle * 26) * H.settle * g.unit * 0.05;
      H.x = approach(H.x, spot.x, 26, dt);
      H.d = approach(H.d, spot.d, 26, dt);
      H.z = approach(H.z, spot.z + bounce - H.press * g.unit * 0.025, 26, dt);
      const restSpin = c.kind === 'duck' ? 0.34 : c.kind === 'dog' ? -0.2 : 0.05;
      H.spin = approach(H.spin, restSpin + this.wind * 0.03, 8, dt);
      H.tilt = approach(H.tilt, 1.22, 8, dt);
      H.spinV = 0;
      H.tiltV = 0;
      H.restT = 0;
      // held down by a finger: the wind can only rattle the brim
      const gripped = this.gripping();
      if (gripped) H.flap = Math.max(H.flap, this.wind * 0.9);
      else H.flap = Math.max(H.flap, this.wind * 0.45);
      return;
    }

    if (H.state === 'bench') {
      H.flap = Math.max(H.flap, this.wind * 0.3);
      return;
    }

    if (H.state === 'held') {
      const tx = this.pointerX + H.grabDX;
      const ty = this.pointerY + H.grabDY;
      const lag = 1 - Math.exp(-dt * 13);
      const sy = this.sy(H.d, H.z);
      const nx = H.x + (tx - H.x) * lag;
      const ny = sy + (ty - sy) * lag;
      H.vx = (nx - H.x) / Math.max(dt, 1e-3);
      H.x = nx;
      H.z = (this.fieldY(H.d) - ny) / this.scaleAt(H.d);
      H.spinV = approach(H.spinV, clamp(H.vx * 0.02, -9, 9), 2.4, dt);
      H.spin += H.spinV * dt;
      H.tilt += H.tiltV * dt;
      H.tiltV = approach(H.tiltV, Math.abs(H.spinV) * 0.42, 2, dt);
      H.flap = Math.max(H.flap, Math.min(0.8, Math.abs(H.vx) / 900));
      return;
    }

    // --- free flight -------------------------------------------------
    const wind = this.wind;
    const drag = 2.6;
    if (H.target >= 0 && this.gustAge > this.gustDur * 0.8) H.steer = Math.min(3.4, H.steer + dt * 0.8);
    // once the wind has made its point, an eddy carries the hat to its new owner
    const homing = clamp((H.steer - 0.9) / 1.5, 0, 1);
    const airX = g.wx * wind * g.unit * 0.66 * (1 - homing * 0.92);
    const airD = g.wd * wind * 0.5 * (1 - homing * 0.92);
    H.vx = approach(H.vx, airX, drag, dt);
    H.vd = approach(H.vd, airD, drag, dt);

    // a disc generates lift when it is face-on to the flow and moving
    const face = Math.abs(Math.cos(H.tilt));
    const spd = Math.abs(H.vx) / (g.unit * 0.8);
    const lift = wind * (0.35 + 0.65 * face) * (0.3 + spd * 0.7) * g.unit * 1.55;
    const eddy = this.noise(this.t * 2.1 + H.x * 0.004) * wind * g.unit * 0.9;
    H.vz += (-g.unit * 2.05 * (1 - homing * 0.72) + lift + eddy * (1 - homing)) * dt;
    const zCap = (this.fieldY(H.d) - g.h * 0.12) / this.scaleAt(H.d);
    if (H.z > zCap) {
      H.z = zCap;
      if (H.vz > 0) H.vz *= -0.2;
    }

    if (H.target >= 0 && H.steer > 0) {
      const c = this.catchers[H.target];
      const s = this.wornSpot(c);
      const k = H.steer * 1.25;
      H.vx += (s.x - H.x) * k * dt;
      H.vd += (s.d - H.d) * k * dt * 0.9;
      H.vz += (s.z + g.unit * 0.05 - H.z) * k * dt * 2.6;
      if (H.steer > 1.4) {
        // the eddy carries it home
        H.vx *= 1 - Math.min(0.8, dt * (H.steer - 1.2));
        H.vz *= 1 - Math.min(0.8, dt * (H.steer - 1.2) * 0.6);
      }
    }

    H.x += H.vx * dt;
    H.d += H.vd * dt;
    H.z += H.vz * dt;

    H.spinV = approach(H.spinV, 2 + wind * 5 + Math.abs(H.vx) / (g.unit * 0.55), 1.4, dt);
    H.spin += H.spinV * dt;
    H.tiltV = approach(H.tiltV, 1.1 + wind * 4.4, 1.2, dt);
    H.tilt += H.tiltV * dt;
    H.flap = Math.max(H.flap, clamp(wind * 0.7, 0, 1));

    // bounds: the hat never leaves the park, and never leaves the child's reach
    const minX = Math.max(g.w * 0.06, g.bench.x - g.unit * 0.42);
    const maxX = Math.min(g.w * 0.93, g.bench.x + g.unit * 0.62);
    if (H.x < minX) {
      H.x = minX;
      H.vx = Math.abs(H.vx) * 0.5;
    }
    if (H.x > maxX) {
      H.x = maxX;
      H.vx = -Math.abs(H.vx) * 0.45;
      H.spinV *= 0.7;
    }
    if (H.d > g.bench.d + 0.1) {
      H.d = g.bench.d + 0.1;
      H.vd = Math.min(0, H.vd);
    }
    if (H.d < 0.32) {
      H.d = 0.32;
      H.vd = Math.max(0, H.vd);
    }

    // ground
    if (H.z <= 0) {
      H.z = 0;
      if (H.vz < -g.unit * 0.12) {
        H.vz = -H.vz * 0.42 + wind * g.unit * 0.5;
        H.vx *= 0.72;
        H.spinV *= 0.8;
        this.ctx.audio.flump(0);
        for (let i = 0; i < 5; i++) this.spawnMote(2, H.x, H.d);
      } else {
        H.vz = wind > 0.5 ? wind * g.unit * 0.42 : 0;
      }
      // rolling / skidding on the grass
      H.vx *= 1 - Math.min(0.9, dt * (4.5 - wind * 3));
      H.tiltV *= 0.86;
      H.tilt = approach(H.tilt, 1.25, 4, dt);
      H.restT += dt;
      if (H.restT > 0.35 && wind < 0.35) {
        H.spinV = approach(H.spinV, 0, 5, dt);
        const wrap = ((H.spin + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        H.spin = approach(H.spin, H.spin - wrap * 0.9, 3, dt);
      }
    } else {
      H.restT = 0;
    }

    // landing on a head
    if (H.vz <= 0 || H.target >= 0) {
      for (const c of this.catchers) {
        const s = this.wornSpot(c);
        const sc = this.scaleAt(c.d);
        const near = Math.hypot(H.x - s.x, (H.d - s.d) * this.geo.h * 0.5) < c.hr * 2.5 * sc;
        if (near && H.z < s.z + c.hr * 1.5 && H.z > s.z - c.hr * 2.4) {
          this.landHatOn(c, false);
          break;
        }
      }
    }
  }

  private gripping(): boolean {
    if (!this.pointerDown || this.hat.state !== 'worn') return false;
    const p = this.hatScreen();
    const r = this.hatR();
    return Math.hypot(this.pointerX - p.x, this.pointerY - p.y) < r * 1.5 + 26;
  }

  private hatScreen(): { x: number; y: number } {
    return { x: this.hat.x, y: this.sy(this.hat.d, this.hat.z) };
  }

  private landHatOn(c: Catcher, quiet: boolean): void {
    const H = this.hat;
    const wasFlying = H.state === 'free';
    const spot = this.wornSpot(c);
    H.state = 'worn';
    H.wearer = this.catchers.indexOf(c);
    H.target = -1;
    H.steer = 0;
    H.settle = 1;
    H.vx = H.vd = H.vz = 0;
    H.spinV = 0;
    H.tiltV = 0;
    H.everWorn = true;
    H.x = spot.x;
    H.d = spot.d;
    H.z = spot.z + this.geo.unit * 0.055;
    c.react = 1;
    if (!quiet) {
      this.ctx.audio.flump(0.1);
      this.ctx.audio.plip(c.kind === 'duck' ? 1.5 : 0.8);
    }
    if (c.kind === 'kid') {
      this.kid.alarm = 0;
      this.kid.relief = 1;
      this.kid.hold = 0.8;
      if (wasFlying || quiet) this.savedAt = this.t;
    } else if (c.kind === 'dog') {
      c.wag = Math.max(c.wag, 1);
      this.ctx.audio.thump(1.9);
    } else if (c.kind === 'duck') {
      c.quack = 0.6;
      this.ctx.audio.mew();
    }
    // the kid stops reaching
    this.kid.reach = 0;
  }

  /** the wind rips the hat off whatever head it is on */
  private blowHatOff(power: number): void {
    const H = this.hat;
    const g = this.geo;
    if (H.state !== 'worn' && H.state !== 'bench') return;
    const c = H.state === 'worn' ? this.catchers[H.wearer] : null;
    H.state = 'free';
    H.restT = 0;
    H.vx = g.wx * power * g.unit * 0.42 + g.unit * 0.06;
    H.vd = g.wd * power * 0.26;
    H.vz = g.unit * (0.7 + power * 0.34);
    H.spinV = 6 + power * 7;
    H.tiltV = 2.4 + power * 3.2;
    H.flap = 1;
    this.ctx.audio.whoosh(1, 0.8);
    if (c && c.kind === 'kid') {
      this.kid.alarm = 1;
      this.kid.hair = 1;
      this.kid.relief = 0;
      this.kid.hold = 0;
      this.kid.reach = 1;
    }
    if (c) c.react = 0;
  }

  // ------------------------------------------------------------ catchers

  private updateCatchers(dt: number): void {
    for (const c of this.catchers) {
      c.react = Math.max(0, c.react - dt * 0.28);
      c.bob += dt;
      const wearing = this.hat.state === 'worn' && this.catchers[this.hat.wearer] === c;
      if (!wearing && this.ctx.phase.name !== 'comic') c.look = approach(c.look, 0, 1.6, dt);
      if (c.kind === 'dog') {
        const want = wearing ? 1 : 0.16 + this.wind * 0.2;
        c.wag = approach(c.wag, want, 2.4, dt);
      }
      if (c.kind === 'duck') c.quack = Math.max(0, c.quack - dt);
      if (this.ctx.phase.is('settle') && !wearing) {
        c.walkX = approach(c.walkX, 0, 0.8, dt);
        c.walkD = approach(c.walkD, 0, 0.8, dt);
      }
    }
  }

  private updateKid(dt: number): void {
    const k = this.kid;
    const ph = this.ctx.phase;
    const worn = this.hat.state === 'worn' && this.hat.wearer === 0;
    k.blinkT -= dt;
    if (k.blinkT <= 0) {
      k.blink = 0.15;
      k.blinkT = this.rng.range(2.2, 5.4);
    }
    k.blink = Math.max(0, k.blink - dt);
    k.grin = approach(k.grin, this.hat.press > 0.15 ? 1 : 0, 3.2, dt);
    k.lick = Math.max(0, k.lick - dt * 1.4);
    k.hair = approach(k.hair, worn ? 0 : clamp(this.wind * 0.7 + (ph.is('trouble') ? 0.5 : 0), 0, 1), 3, dt);
    const wantLook = ph.is('foreshadow') ? smooth((ph.t - 2.3) / 0.6) : ph.is('trouble') && !worn ? 0.35 : 0;
    k.lookWind = approach(k.lookWind, Math.max(wantLook, k.lookWind * 0.98 * (ph.is('resolve', 'comic', 'settle') ? 0 : 1)), 2.4, dt);
    const wantHold = worn && (this.gripping() || (ph.is('foreshadow') && ph.t > 2.4) || (this.wind > 0.45 && ph.is('trouble'))) ? 1 : worn && ph.is('resolve', 'comic', 'settle') ? 0.55 : 0;
    k.hold = approach(k.hold, wantHold, 4.5, dt);
    k.alarm = approach(k.alarm, this.hat.state === 'free' && ph.is('trouble') ? 1 : 0, 2.2, dt);
    k.relief = approach(k.relief, worn && ph.at('resolve') ? 1 : worn && this.t - this.savedAt < 1.6 ? 1 : 0, 2.4, dt);
    k.reach = approach(k.reach, this.hat.state === 'free' && ph.is('trouble') ? 0.8 : k.reach > 0.02 ? k.reach : 0, 2.6, dt);
    const stolen = ph.at('resolve') && this.ending !== 'none' && this.ending !== 'kid';
    if (!ph.is('comic')) k.shrug = approach(k.shrug, stolen && ph.is('resolve') ? 0.75 : 0, 2, dt);
    if (!ph.is('comic') && this.ending !== 'scarecrow') k.coneHat = approach(k.coneHat, 0, 2, dt);

    // ice cream drip
    if (this.cone.dripZ < 0) {
      this.cone.drip += dt * (0.22 + (this.ctx.phase.is('establish', 'action') ? 0.12 : 0));
      if (this.cone.drip > 1) {
        this.cone.drip = 0;
        const c = this.conePos();
        this.cone.dripZ = 0;
        this.cone.dripX = c.x - this.geo.unit * 0.012;
        this.cone.dripY = c.y + this.geo.unit * 0.012;
      }
    } else {
      this.cone.dripZ += dt;
      this.cone.dripY += (60 + this.cone.dripZ * 320) * dt;
      if (this.cone.dripY > this.sy(this.geo.bench.d, this.geo.unit * 0.02)) {
        this.cone.dripZ = -1;
        this.ctx.audio.plip(1.6);
      }
    }
    if (this.cone.held) {
      const lag = 1 - Math.exp(-dt * 16);
      this.cone.x += (this.pointerX + this.cone.grabDX - this.cone.x) * lag;
      this.cone.y += (this.pointerY + this.cone.grabDY - this.cone.y) * lag;
      const m = this.mouthPos();
      if (Math.hypot(this.cone.x - m.x, this.cone.y - m.y) < this.geo.unit * 0.05 && k.lick < 0.2) {
        k.lick = 1;
        this.cone.licks++;
        this.ctx.audio.plip(0.8);
      }
    } else {
      const h = this.handPos();
      this.cone.x = approach(this.cone.x, h.x, 9, dt);
      this.cone.y = approach(this.cone.y, h.y, 9, dt);
    }
  }

  /** a gust in progress steals the hat unless a finger is holding it down */
  private gustBite = false;

  private updateGustBite(): void {
    if (this.gustAge > this.gustDur) {
      this.gustBite = false;
      return;
    }
    if (this.gustBite) return;
    if (this.gustAge < this.gustDur * 0.26) return;
    this.gustBite = true;
    if (this.hat.state === 'worn' && !this.gripping()) {
      this.blowHatOff(this.gustAmp);
    } else if (this.hat.state === 'worn') {
      // held down: only the brim gets away
      this.hat.flap = 1;
      this.hat.press = Math.max(this.hat.press, 0.5);
      this.kid.hold = 1;
      this.kid.grin = Math.max(this.kid.grin, 0.5);
    } else if (this.hat.state === 'free') {
      this.hat.vz += this.geo.unit * 1.1;
      this.hat.spinV += 4;
    }
  }

  // ------------------------------------------------------------ small things

  private spawnMote(kind: 0 | 1 | 2, atX?: number, atD?: number): void {
    const g = this.geo;
    if (this.motes.length > 190) return;
    const x = atX ?? this.rng.range(-g.w * 0.05, g.w * 0.75);
    const d = atD ?? this.rng.range(0.3, 1.05);
    const s = this.scaleAt(d);
    this.motes.push({
      kind,
      x,
      d,
      z: kind === 1 ? this.rng.range(0, g.unit * 0.05) : this.rng.range(g.unit * 0.02, g.unit * 0.22),
      vx: g.wx * this.wind * g.unit * this.rng.range(0.5, 1.1),
      vd: g.wd * this.wind * this.rng.range(0.1, 0.5),
      vz: kind === 0 ? this.rng.range(0, g.unit * 0.3) : this.rng.range(-0.05, 0.4) * g.unit,
      rot: this.rng.range(0, 7),
      spin: this.rng.range(-7, 7),
      size: g.unit * (kind === 0 ? 0.016 : kind === 1 ? 0.024 : 0.006) * s * this.rng.range(0.7, 1.3),
      life: kind === 2 ? this.rng.range(0.7, 1.6) : this.rng.range(3.4, 6.5),
      max: 6.5,
      tone: this.rng.next(),
    });
  }

  private popPuff(p: Puff, amount: number): void {
    if (p.full <= 0.04) return;
    const n = Math.max(1, Math.round(amount * 9 * p.full));
    for (let i = 0; i < n; i++) {
      const s = this.scaleAt(p.d);
      this.motes.push({
        kind: 0,
        x: p.x + this.rng.range(-1, 1) * this.geo.unit * 0.02 * s,
        d: p.d,
        z: p.stem + this.rng.range(-0.3, 0.6) * this.geo.unit * 0.02,
        vx: this.geo.wx * this.wind * this.geo.unit * this.rng.range(0.6, 1.3) + this.geo.unit * 0.05,
        vd: this.geo.wd * this.wind * this.rng.range(0.2, 0.6),
        vz: this.rng.range(0.05, 0.42) * this.geo.unit,
        rot: this.rng.range(0, 7),
        spin: this.rng.range(-3, 3),
        size: this.geo.unit * 0.016 * s * this.rng.range(0.8, 1.2),
        life: this.rng.range(3.5, 7),
        max: 7,
        tone: this.rng.next(),
      });
    }
    p.full = Math.max(0, p.full - amount);
    p.pop = 1;
    this.ctx.audio.whoosh(0.22, 0.35);
  }

  private updateMotes(dt: number): void {
    const g = this.geo;
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.life -= dt;
      const drag = m.kind === 0 ? 2.4 : m.kind === 1 ? 3.4 : 4;
      m.vx = approach(m.vx, g.wx * this.wind * g.unit * (m.kind === 0 ? 1.15 : 0.95), drag, dt);
      m.vd = approach(m.vd, g.wd * this.wind * 0.8, drag, dt);
      const fall = m.kind === 0 ? 0.16 : m.kind === 1 ? 0.55 : 0.1;
      m.vz += (-g.unit * fall + this.noise(this.t * 2 + i) * g.unit * 0.42 * this.wind) * dt;
      if (m.kind === 1 && m.z <= 0) {
        m.z = 0;
        m.vz = Math.max(0, m.vz) + this.wind * g.unit * 0.25;
        m.vx *= 0.9;
      }
      m.x += m.vx * dt;
      m.d += m.vd * dt;
      m.z += m.vz * dt;
      m.rot += m.spin * dt * (0.4 + this.wind);
      if (m.life <= 0 || m.x > g.w * 1.12 || m.z > g.h) this.motes.splice(i, 1);
    }
  }

  private updatePuffs(dt: number): void {
    for (const p of this.puffs) {
      p.pop = Math.max(0, p.pop - dt * 2);
      if (this.ctx.phase.is('establish', 'action', 'settle')) p.full = Math.min(1, p.full + dt * 0.04);
      // a strong gust strips them by itself
      if (this.wind > 0.8 && p.full > 0.05 && this.rng.next() < dt * 1.2) this.popPuff(p, 0.34);
    }
  }

  private updateButterfly(dt: number): void {
    const f = this.fly;
    const g = this.geo;
    f.flap += dt * (9 + this.wind * 12);
    f.scare = approach(f.scare, this.wind > 0.5 ? 1 : 0, 1.2, dt);
    if (f.perch > 0.5 && this.hat.state === 'worn') {
      const p = this.hatScreen();
      const r = this.hatR();
      f.x = approach(f.x, p.x + r * 0.62, 5, dt);
      f.y = approach(f.y, p.y - r * 0.22, 5, dt);
      return;
    }
    if (Math.hypot(f.x - f.tx, f.y - f.ty) < g.unit * 0.02 || this.rng.next() < dt * 0.5) {
      const spread = 0.24 + f.scare * 0.5;
      f.tx = clamp(f.x + this.rng.range(-1, 1) * g.w * spread + this.wind * g.unit * 0.3, g.w * 0.08, g.w * 0.94);
      f.ty = clamp(f.y + this.rng.range(-1, 1) * g.h * 0.12, g.horizonY + g.h * 0.06, g.h * 0.9);
    }
    const sp = 1.6 + f.scare * 3.4;
    f.x = approach(f.x, f.tx, sp, dt);
    f.y = approach(f.y, f.ty + Math.sin(this.t * 6) * g.unit * 0.012, sp, dt);
  }

  private updateClouds(dt: number): void {
    for (const c of this.clouds) {
      c.x += (0.006 + this.wind * 0.05) * c.speed * dt;
      if (c.x > 1.35) c.x = -0.35;
    }
    for (let i = this.pondRipples.length - 1; i >= 0; i--) {
      const r = this.pondRipples[i];
      r.life -= dt;
      r.r += dt * 0.4;
      if (r.life <= 0) this.pondRipples.splice(i, 1);
    }
    if (this.rng.next() < dt * (0.5 + this.wind * 3)) this.pondRipples.push({ r: this.rng.range(0.1, 0.5), life: 2.4 });
  }

  private updateCamera(dt: number): void {
    const g = this.geo;
    this.camZ = approach(this.camZ, this.camZT, 1.6, dt);
    // a gentle lean toward the flying hat, never more than a few percent
    let tx = 0;
    let ty = 0;
    if (this.hat.state === 'free' || this.hat.state === 'held') {
      const p = this.hatScreen();
      tx = clamp((p.x - g.w * 0.5) * 0.05, -g.w * 0.035, g.w * 0.035);
      ty = clamp((p.y - g.h * 0.55) * 0.04, -g.h * 0.03, g.h * 0.03);
    }
    this.camX = approach(this.camX, tx, 2.2, dt);
    this.camY = approach(this.camY, ty, 2.2, dt);
  }

  private updateSound(): void {
    const a = this.ctx.audio;
    a.bed('wind', Math.max(0, this.wind - 0.12) * 0.075, 300 + this.wind * 520);
    this.updateGustBite();
  }

  // ------------------------------------------------------------ kid anchors

  private kidBase(): { x: number; y: number; u: number } {
    const g = this.geo;
    const d = g.bench.d;
    return { x: g.bench.x, y: this.fieldY(d), u: g.unit * this.scaleAt(d) };
  }

  private headPos(): { x: number; y: number; r: number } {
    const b = this.kidBase();
    const c = this.catchers[0];
    const r = c.hr * this.scaleAt(c.d);
    const lean = this.kid.lookWind * -0.5 - this.kid.shrug * 0.1;
    return { x: b.x + lean * r * 0.5, y: b.y - c.hz * this.scaleAt(c.d) + r, r };
  }

  private mouthPos(): { x: number; y: number } {
    const h = this.headPos();
    return { x: h.x + h.r * 0.1, y: h.y + h.r * 0.42 };
  }

  private handPos(): { x: number; y: number } {
    const b = this.kidBase();
    const h = this.headPos();
    const side = -1;
    return {
      x: b.x + side * b.u * 0.15,
      y: h.y + h.r * 1.9 - this.kid.reach * b.u * 0.05,
    };
  }

  private conePos(): { x: number; y: number } {
    return { x: this.cone.x, y: this.cone.y - this.geo.unit * 0.045 * this.scaleAt(this.geo.bench.d) };
  }

  private puffTop(p: Puff): { x: number; y: number; r: number } {
    const s = this.scaleAt(p.d);
    const bend = this.windAt(p.x, p.d);
    const x = p.x + bend * p.stem * s * 0.55;
    const y = this.fieldY(p.d) - p.stem * s;
    return { x, y, r: this.geo.unit * 0.032 * s * (0.35 + 0.65 * p.full) };
  }

  // ------------------------------------------------------------ input

  pointer(e: PointerEvt): void {
    this.pointerX = e.x;
    this.pointerY = e.y;
    if (e.type === 'down') {
      this.pointerDown = true;
      this.idle = 0;
      const hp = this.hatScreen();
      const hr = this.hatR();
      const dHat = Math.hypot(e.x - hp.x, e.y - hp.y) - hr * 1.15;
      const cp = this.conePos();
      const dCone = Math.hypot(e.x - cp.x, e.y - cp.y) - this.geo.unit * 0.05;
      let bestPuff = -1;
      let dPuff = 1e9;
      for (let i = 0; i < this.puffs.length; i++) {
        const t = this.puffTop(this.puffs[i]);
        const d = Math.hypot(e.x - t.x, e.y - t.y) - t.r * 1.6;
        if (d < dPuff) {
          dPuff = d;
          bestPuff = i;
        }
      }
      const dFly = Math.hypot(e.x - this.fly.x, e.y - this.fly.y) - this.geo.unit * 0.04;

      if (dHat < 34 && dHat <= dCone && dHat <= dPuff) {
        this.grabHat(e);
      } else if (dCone < 30 && dCone <= dPuff && this.kid.coneHat < 0.2) {
        this.cone.held = true;
        this.cone.grabDX = this.cone.x - e.x;
        this.cone.grabDY = this.cone.y - e.y;
        this.grab = 'cone';
      } else if (dPuff < 34 && bestPuff >= 0) {
        this.grab = 'puff';
        this.grabPuff = bestPuff;
        this.popPuff(this.puffs[bestPuff], 0.55);
      } else if (dFly < 30) {
        this.fly.scare = 1;
        this.fly.perch = 0;
        this.fly.tx = clamp(this.fly.x + this.geo.w * 0.22, 0, this.geo.w * 0.92);
        this.fly.ty = this.fly.y - this.geo.h * 0.08;
      } else if (this.ctx.phase.is('settle')) {
        this.leave();
      }
    } else if (e.type === 'move') {
      if (this.grab === 'puff' && this.grabPuff >= 0) {
        const p = this.puffs[this.grabPuff];
        const t = this.puffTop(p);
        if (Math.hypot(e.x - t.x, e.y - t.y) < this.geo.unit * 0.12) this.popPuff(p, 0.5 * Math.min(1, Math.hypot(e.dx, e.dy) * 0.08));
      }
    } else if (e.type === 'up') {
      this.pointerDown = false;
      if (this.grab === 'hat') this.releaseHat(e);
      if (this.grab === 'cone') this.cone.held = false;
      this.grab = 'none';
      this.grabPuff = -1;
    }
  }

  private grabHat(e: PointerEvt): void {
    const H = this.hat;
    const p = this.hatScreen();
    if (H.state === 'worn' && this.ctx.phase.is('action', 'foreshadow', 'trouble', 'settle', 'resolve', 'comic')) {
      // a tap presses it down; a drag lifts it off
      H.press = 1;
      this.kid.grin = 1;
      this.ctx.audio.flump(0);
    }
    H.grabDX = p.x - e.x;
    H.grabDY = p.y - e.y;
    H.state = 'held';
    H.restT = 0;
    H.target = -1;
    H.steer = 0;
    this.grab = 'hat';
    if (this.catchers[H.wearer]) this.catchers[H.wearer].react = 0;
    this.ctx.audio.whoosh(0.28, 0.3);
  }

  private releaseHat(e: PointerEvt): void {
    const H = this.hat;
    if (H.state !== 'held') return;
    const p = this.hatScreen();
    // a tap on a worn hat = press it down, not a lift
    if (e.travel < 14 && e.age < 0.45 && H.everWorn) {
      const near = this.nearestHead(p.x, p.y, 1.8);
      if (near) {
        this.landHatOn(near, true);
        this.hat.press = 1;
        this.hat.settle = 0.5;
        return;
      }
    }
    const head = this.nearestHead(p.x + e.vx * 0.05, p.y + e.vy * 0.05, 1.7);
    if (head) {
      this.landHatOn(head, false);
      return;
    }
    H.state = 'free';
    H.vx = clamp(e.vx, -1400, 1400) * 0.55;
    H.vz = clamp(-e.vy, -1400, 1400) * 0.55;
    H.vd = 0;
    H.spinV = clamp(e.vx * 0.012, -10, 10) + 2;
    H.tiltV = 1.4;
    H.restT = 0;
  }

  private nearestHead(x: number, y: number, k: number): Catcher | null {
    let best: Catcher | null = null;
    let bd = 1e9;
    for (const c of this.catchers) {
      const s = this.wornSpot(c);
      const sc = this.scaleAt(c.d);
      const px = s.x;
      const py = this.sy(s.d, s.z);
      const d = Math.hypot(x - px, y - py) - c.hr * sc * k - 18;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return bd < 0 ? best : null;
  }

  // ------------------------------------------------------------ dev

  private failTo(kind: CatcherKind): void {
    const c = this.catchers.find((x) => x.kind === kind);
    if (!c) return;
    this.enterPhase('trouble');
    this.ctx.phase.set('resolve');
    this.ctx.phase.intervening = false;
    this.landHatOn(c, true);
    c.react = 1;
    this.ending = kind as Ending;
    this.landedAt = this.t;
    this.gustsLeft = 0;
    this.gustAmp = 0;
    this.gustAge = 99;
    this.windBase = this.windBaseT = 0.16;
    this.wind = 0.3;
    this.kid.alarm = 0;
    this.kid.hair = 0.25;
    this.kid.shrug = 1;
    this.kid.hold = 0;
    this.kid.relief = 0;
    this.kid.reach = 0;
    if (kind === 'dog') c.wag = 1;
    if (kind === 'duck') c.quack = 0.6;
  }

  readonly devActions: DevAction[] = [
    { name: 'hat:on-head', run: () => this.landHatOn(this.catchers[0], false) },
    { name: 'wind:gust', run: () => this.startGust(1.05, 1.7) },
    {
      name: 'wind:stop',
      run: () => {
        this.windBase = this.windBaseT = 0.07;
        this.gustAmp = 0;
        this.gustAge = 99;
        this.gustsLeft = 0;
        this.ripple = 0.15;
      },
    },
    { name: 'fail:dog', run: () => this.failTo('dog') },
    { name: 'fail:scarecrow', run: () => this.failTo('scarecrow') },
    { name: 'fail:duck', run: () => this.failTo('duck') },
    {
      name: 'demo:mid-drag',
      run: () => {
        const g = this.geo;
        const H = this.hat;
        const from = this.wornSpot(this.catchers[0]);
        H.state = 'held';
        H.d = g.bench.d;
        this.pointerX = from.x + g.unit * 0.2;
        this.pointerY = this.sy(from.d, from.z) - g.unit * 0.16;
        H.x = this.pointerX;
        H.z = (this.fieldY(H.d) - this.pointerY) / this.scaleAt(H.d);
        H.grabDX = 0;
        H.grabDY = 0;
        H.spin = 0.9;
        H.spinV = 7;
        H.tilt = 0.55;
        H.tiltV = 4;
        H.flap = 0.8;
        this.grab = 'hat';
        this.pointerDown = true;
        this.kid.reach = 0.7;
        this.windBaseT = 0.4;
        for (let i = 0; i < 24; i++) {
          this.pointerX -= g.unit * 0.004;
          this.pointerY += g.unit * 0.002;
          this.updateHat(1 / 120);
        }
      },
    },
    {
      name: 'demo:hold-brim',
      run: () => {
        this.landHatOn(this.catchers[0], true);
        const p = this.hatScreen();
        this.pointerX = p.x;
        this.pointerY = p.y;
        this.pointerDown = true;
        this.startGust(1.1, 1.8);
        this.hat.press = 0.7;
        this.kid.hold = 1;
        this.kid.grin = 1;
      },
    },
    { name: 'puff:pop', run: () => this.puffs.forEach((p) => this.popPuff(p, 1)) },
  ];

  devState(): Record<string, unknown> {
    return {
      phase: this.ctx.phase.name,
      phaseT: +this.ctx.phase.t.toFixed(2),
      intervening: this.ctx.phase.intervening,
      ending: this.ending,
      seed: this.rng.seed,
      orientation: this.geo?.o,
      wind: +this.wind.toFixed(2),
      windBase: +this.windBase.toFixed(2),
      gust: +this.gustShape().toFixed(2),
      gustsLeft: this.gustsLeft,
      ripple: +this.ripple.toFixed(2),
      hat: {
        state: this.hat.state,
        wearer: this.catchers[this.hat.wearer]?.kind ?? null,
        x: Math.round(this.hat.x),
        d: +this.hat.d.toFixed(2),
        z: Math.round(this.hat.z),
        spin: +this.hat.spin.toFixed(2),
        tilt: +this.hat.tilt.toFixed(2),
        target: this.hat.target,
      },
      kid: {
        hold: +this.kid.hold.toFixed(2),
        alarm: +this.kid.alarm.toFixed(2),
        relief: +this.kid.relief.toFixed(2),
        licks: this.cone.licks,
      },
      motes: this.motes.length,
      landedAt: +this.landedAt.toFixed(2),
      idle: +this.idle.toFixed(1),
    };
  }

  // ------------------------------------------------------------ render

  private pal() {
    const d = 1 - this.warm;
    return {
      skyTop: mix([92, 166, 226], [124, 142, 166], d),
      skyMid: mix([168, 214, 240], [156, 168, 182], d),
      haze: mix([228, 240, 236], [196, 202, 206], d),
      hillFar: mix([150, 186, 176], [128, 146, 148], d),
      hillNear: mix([124, 172, 126], [108, 136, 118], d),
      treeFar: mix([96, 148, 104], [88, 118, 100], d),
      grass: mix([132, 184, 100], [116, 150, 100], d),
      grassFar: mix([164, 202, 146], [144, 168, 146], d),
      path: mix([222, 200, 158], [186, 178, 162], d),
      water: mix([122, 182, 214], [116, 146, 166], d),
    };
  }

  render(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    if (!g) return;
    const P = this.pal();

    gg.save();
    gg.translate(g.w / 2 - this.camX, g.h / 2 - this.camY);
    gg.scale(this.camZ, this.camZ);
    gg.translate(-g.w / 2, -g.h / 2);

    this.drawSky(gg, P);
    this.drawHills(gg, P);
    this.drawGround(gg, P);
    this.drawPond(gg, P);
    this.drawPath(gg, P);
    this.drawCloudShadow(gg);
    this.drawScene(gg, P);
    this.drawMotes(gg);
    this.drawWindStreaks(gg);
    this.drawButterfly(gg);
    this.drawLight(gg);

    gg.restore();

    if (this.fade > 0.001) {
      gg.fillStyle = `rgba(8,12,10,${this.fade})`;
      gg.fillRect(0, 0, g.w, g.h);
    }
  }

  private drawSky(gg: CanvasRenderingContext2D, P: ReturnType<HatWind['pal']>): void {
    const g = this.geo;
    const grd = gg.createLinearGradient(0, -g.h * 0.12, 0, g.horizonY + 6);
    grd.addColorStop(0, rgb(P.skyTop));
    grd.addColorStop(0.62, rgb(P.skyMid));
    grd.addColorStop(1, rgb(P.haze));
    gg.fillStyle = grd;
    gg.fillRect(-g.w, -g.h, g.w * 3, g.horizonY + g.h + 8);

    // sun
    const s = g.sun;
    const r = g.unit * 0.075;
    const a = 0.35 + this.warm * 0.55;
    const sg = gg.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 4.6);
    sg.addColorStop(0, `rgba(255,250,222,${0.92 * a})`);
    sg.addColorStop(0.18, `rgba(255,242,192,${0.42 * a})`);
    sg.addColorStop(1, 'rgba(255,236,180,0)');
    gg.fillStyle = sg;
    gg.beginPath();
    gg.arc(s.x, s.y, r * 4.6, 0, Math.PI * 2);
    gg.fill();

    for (const c of this.clouds) this.drawCloud(gg, c);
  }

  private drawCloud(gg: CanvasRenderingContext2D, c: Cloud): void {
    const g = this.geo;
    const cx = lerp(-g.w * 0.3, g.w * 1.3, c.x);
    const cy = g.horizonY * (0.08 + c.y * 0.62);
    const R = g.unit * 0.1 * c.r;
    const grey = (1 - this.warm) * 0.5;
    const body = mix([255, 255, 255], [178, 184, 196], grey);
    const under = mix([214, 228, 240], [148, 156, 172], grey);
    gg.save();
    gg.globalAlpha = 0.92;
    // the wind smears them a little
    const smear = 1 + this.wind * 0.55;
    for (let pass = 0; pass < 2; pass++) {
      gg.fillStyle = pass === 0 ? rgb(under) : rgb(body);
      gg.beginPath();
      for (const p of c.puffs) {
        const x = cx + p.x * R * 1.5 * smear;
        const y = cy + p.y * R * 0.7 + (pass === 0 ? R * 0.16 : 0);
        gg.moveTo(x + R * p.r, y);
        gg.arc(x, y, R * p.r, 0, Math.PI * 2);
      }
      gg.fill();
    }
    gg.restore();
  }

  private drawHills(gg: CanvasRenderingContext2D, P: ReturnType<HatWind['pal']>): void {
    const g = this.geo;
    for (let layer = 0; layer < 2; layer++) {
      const col = layer === 0 ? P.hillFar : P.hillNear;
      const amp = g.hills * (layer === 0 ? 1 : 0.62);
      const base = g.horizonY + layer * g.h * 0.012;
      gg.fillStyle = rgb(col, layer === 0 ? 0.85 : 1);
      gg.beginPath();
      gg.moveTo(-g.w * 0.1, base + 20);
      const n = 26;
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const x = -g.w * 0.1 + g.w * 1.2 * f;
        const k = layer === 0 ? 2.1 : 3.3;
        const y =
          base -
          amp * (0.45 + 0.55 * Math.sin(f * k * Math.PI + layer * 1.7)) -
          amp * 0.25 * Math.sin(f * 9.1 + layer);
        gg.lineTo(x, y);
      }
      gg.lineTo(g.w * 1.1, base + 20);
      gg.closePath();
      gg.fill();
    }

    // a distant tree line on the near hills
    const r = new Rng(this.rng.seed ^ 0x2b71);
    for (let i = 0; i < 16; i++) {
      const x = r.range(-g.w * 0.05, g.w * 1.05);
      const s = g.unit * r.range(0.022, 0.05);
      const y = g.horizonY + g.h * 0.012 - g.hills * 0.12 + r.range(-4, 6);
      const sway = Math.sin(this.t * 1.1 + x * 0.01) * this.wind * s * 0.22;
      gg.fillStyle = rgb(P.treeFar, 0.82);
      gg.beginPath();
      gg.ellipse(x + sway, y - s * 0.9, s * 0.72, s, 0, 0, Math.PI * 2);
      gg.fill();
      gg.fillStyle = rgb(mix(P.treeFar, [80, 66, 54], 0.5), 0.8);
      gg.fillRect(x - s * 0.06, y - s * 0.6, s * 0.12, s * 0.7);
    }
  }

  private drawGround(gg: CanvasRenderingContext2D, P: ReturnType<HatWind['pal']>): void {
    const g = this.geo;
    const grd = gg.createLinearGradient(0, g.horizonY - 4, 0, g.h);
    grd.addColorStop(0, rgb(P.grassFar));
    grd.addColorStop(0.28, rgb(mix(P.grassFar, P.grass, 0.7)));
    grd.addColorStop(1, rgb(mix(P.grass, [78, 122, 66], 0.45)));
    gg.fillStyle = grd;
    gg.fillRect(-g.w, g.horizonY - 4, g.w * 3, g.h * 1.3 - g.horizonY);

    // soft bands of mown grass for depth
    gg.save();
    gg.globalAlpha = 0.055;
    for (let i = 0; i < 6; i++) {
      const d0 = 0.1 + i * 0.18;
      const y0 = this.fieldY(d0);
      const y1 = this.fieldY(d0 + 0.09);
      gg.fillStyle = i % 2 ? rgb(mix(P.grass, [255, 255, 220], 0.5)) : rgb(mix(P.grass, [40, 80, 50], 0.5));
      gg.fillRect(-g.w, y0, g.w * 3, Math.max(1, y1 - y0));
    }
    gg.restore();
  }

  private drawPond(gg: CanvasRenderingContext2D, P: ReturnType<HatWind['pal']>): void {
    const g = this.geo;
    const p = g.pond;
    const y = this.fieldY(p.d);
    const ry = p.rx * 0.3;
    // bank
    gg.fillStyle = rgb(mix(P.grass, [196, 184, 148], 0.55));
    gg.beginPath();
    gg.ellipse(p.x, y, p.rx * 1.1, ry * 1.26, 0, 0, Math.PI * 2);
    gg.fill();
    // water
    const wg = gg.createLinearGradient(0, y - ry, 0, y + ry);
    wg.addColorStop(0, rgb(mix(P.water, [210, 236, 248], 0.55)));
    wg.addColorStop(1, rgb(mix(P.water, [42, 86, 120], 0.3)));
    gg.fillStyle = wg;
    gg.beginPath();
    gg.ellipse(p.x, y, p.rx, ry, 0, 0, Math.PI * 2);
    gg.fill();
    gg.save();
    gg.beginPath();
    gg.ellipse(p.x, y, p.rx, ry, 0, 0, Math.PI * 2);
    gg.clip();
    // wind streaks
    gg.strokeStyle = `rgba(255,255,255,${0.16 + this.wind * 0.3})`;
    gg.lineWidth = 1.4;
    for (let i = 0; i < 7; i++) {
      const yy = y - ry + ((i + 0.5) / 7) * ry * 2;
      const ph = Math.sin(this.t * (1 + this.wind * 3) + i * 1.7);
      gg.beginPath();
      gg.moveTo(p.x - p.rx * 0.9 + ph * 6, yy);
      gg.lineTo(p.x + p.rx * 0.9 + ph * 6, yy);
      gg.stroke();
    }
    for (const r of this.pondRipples) {
      const a = clamp(r.life / 2.4, 0, 1) * 0.4;
      gg.strokeStyle = `rgba(255,255,255,${a})`;
      gg.lineWidth = 1.2;
      gg.beginPath();
      gg.ellipse(p.x - p.rx * 0.2, y + ry * 0.2, p.rx * r.r, ry * r.r, 0, 0, Math.PI * 2);
      gg.stroke();
    }
    gg.restore();
    // reeds on the far bank
    const rr = new Rng(this.rng.seed ^ 0x77a1);
    for (let i = 0; i < 12; i++) {
      const a = rr.range(Math.PI * 1.05, Math.PI * 1.95);
      const x = p.x + Math.cos(a) * p.rx * 0.95;
      const yy = y + Math.sin(a) * ry * 0.95;
      const hgt = g.unit * rr.range(0.03, 0.062);
      const bend = this.windAt(x, p.d) * hgt * 0.7;
      gg.strokeStyle = rgb(mix(P.grass, [92, 128, 70], 0.4));
      gg.lineWidth = Math.max(1.2, g.unit * 0.004);
      gg.beginPath();
      gg.moveTo(x, yy);
      gg.quadraticCurveTo(x + bend * 0.4, yy - hgt * 0.6, x + bend, yy - hgt);
      gg.stroke();
    }
  }

  private pathPoint(t: number): { x: number; d: number } {
    const p = this.geo.path;
    const u = 1 - t;
    return {
      x: p[0].x * u * u + 2 * p[1].x * u * t + p[2].x * t * t,
      d: p[0].d * u * u + 2 * p[1].d * u * t + p[2].d * t * t,
    };
  }

  private drawPath(gg: CanvasRenderingContext2D, P: ReturnType<HatWind['pal']>): void {
    const g = this.geo;
    const N = 26;
    const L: Array<{ x: number; y: number }> = [];
    const R: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = this.pathPoint(t);
      const y = this.fieldY(p.d);
      const hw = g.unit * 0.085 * this.scaleAt(p.d);
      L.push({ x: p.x - hw, y: y + hw * 0.1 });
      R.push({ x: p.x + hw, y: y - hw * 0.1 });
    }
    gg.beginPath();
    gg.moveTo(L[0].x, L[0].y);
    for (let i = 1; i <= N; i++) gg.lineTo(L[i].x, L[i].y);
    for (let i = N; i >= 0; i--) gg.lineTo(R[i].x, R[i].y);
    gg.closePath();
    const pg = gg.createLinearGradient(0, g.horizonY, 0, g.h);
    pg.addColorStop(0, rgb(mix(P.path, P.grassFar, 0.35)));
    pg.addColorStop(1, rgb(P.path));
    gg.fillStyle = pg;
    gg.fill();
    gg.strokeStyle = rgb(mix(P.path, [140, 122, 92], 0.45), 0.5);
    gg.lineWidth = 1.2;
    gg.stroke();
    // pebbles
    const r = new Rng(this.rng.seed ^ 0x13ac);
    gg.fillStyle = rgb(mix(P.path, [150, 136, 110], 0.55), 0.5);
    for (let i = 0; i < 34; i++) {
      const t = r.next();
      const p = this.pathPoint(t);
      const s = this.scaleAt(p.d);
      const off = r.range(-0.8, 0.8) * g.unit * 0.08 * s;
      gg.beginPath();
      gg.ellipse(p.x + off, this.fieldY(p.d) + r.range(-2, 2), g.unit * 0.005 * s, g.unit * 0.0032 * s, 0, 0, Math.PI * 2);
      gg.fill();
    }
  }

  private drawCloudShadow(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    if (this.shadowX < -1.6 || this.shadowX > 2.1) return;
    const a = 0.16 * clamp(1 - Math.abs(this.shadowX - 0.4) * 0.7, 0, 1);
    if (a < 0.005) return;
    const cx = lerp(-g.w * 0.5, g.w * 1.6, (this.shadowX + 1.6) / 3.7);
    const grd = gg.createLinearGradient(cx - g.w * 0.5, 0, cx + g.w * 0.6, 0);
    grd.addColorStop(0, 'rgba(40,60,70,0)');
    grd.addColorStop(0.5, `rgba(40,60,70,${a})`);
    grd.addColorStop(1, 'rgba(40,60,70,0)');
    gg.fillStyle = grd;
    gg.fillRect(-g.w, g.horizonY, g.w * 3, g.h * 1.3 - g.horizonY);
  }

  /** grass blades and props share one depth-sorted pass */
  private drawScene(gg: CanvasRenderingContext2D, P: ReturnType<HatWind['pal']>): void {
    const g = this.geo;
    const props: Array<{ d: number; f: () => void }> = [];
    for (const c of this.catchers) {
      const d = c.d + c.walkD;
      if (c.kind === 'kid') props.push({ d, f: () => this.drawBenchAndKid(gg, P) });
      else if (c.kind === 'dog') props.push({ d, f: () => this.drawDog(gg, c) });
      else if (c.kind === 'scarecrow') props.push({ d, f: () => this.drawScarecrow(gg, c) });
      else props.push({ d, f: () => this.drawDuck(gg, c) });
    }
    for (const p of this.puffs) props.push({ d: p.d, f: () => this.drawPuff(gg, p) });
    props.push({ d: g.tree.d, f: () => this.drawTree(gg, P) });
    if (this.hat.state !== 'worn' || this.catchers[this.hat.wearer]?.kind !== 'kid') {
      props.push({ d: this.hat.d + 0.001, f: () => this.drawHat(gg) });
    }
    props.sort((a, b) => a.d - b.d);

    let pi = 0;
    for (const b of this.blades) {
      while (pi < props.length && props[pi].d <= b.d) props[pi++].f();
      this.drawBlade(gg, b, P);
    }
    while (pi < props.length) props[pi++].f();
  }

  private drawBlade(gg: CanvasRenderingContext2D, b: Blade, P: ReturnType<HatWind['pal']>): void {
    const s = this.scaleAt(b.d);
    const x = b.x;
    const y = this.fieldY(b.d);
    const h = b.h * s;
    const bend = (this.windAt(x, b.d) * 1.35 + b.lean * 0.4) * h * 0.95;
    const tipX = x + bend;
    const tipY = y - h * (1 - Math.min(0.45, Math.abs(bend) / (h * 2.6)));
    const w = b.w * s;
    const near = clamp((b.d - 0.2) / 0.9, 0, 1);
    const col = mix(mix(P.grassFar, P.grass, near), GRASS[Math.floor(b.tone * 4) % 4], 0.6);
    gg.fillStyle = rgb(mix(col, [46, 86, 48], 0.1 + near * 0.34), 0.95);
    gg.beginPath();
    gg.moveTo(x - w, y + 1);
    gg.quadraticCurveTo(x + bend * 0.32, y - h * 0.62, tipX, tipY);
    gg.quadraticCurveTo(x + bend * 0.3 + w * 1.5, y - h * 0.58, x + w, y + 1);
    gg.closePath();
    gg.fill();
  }

  private drawTree(gg: CanvasRenderingContext2D, P: ReturnType<HatWind['pal']>): void {
    const g = this.geo;
    const s = this.scaleAt(g.tree.d);
    const x = g.tree.x;
    const y = this.fieldY(g.tree.d);
    const u = g.unit * s;
    const sway = Math.sin(this.t * 0.9) * this.wind * 0.06 + this.wind * 0.05;
    const big = g.o === 'portrait' ? 1 : 0.72;
    gg.save();
    gg.translate(x, y);
    // trunk
    const th = u * 0.86 * big;
    gg.fillStyle = 'rgb(112,84,58)';
    gg.beginPath();
    gg.moveTo(-u * 0.075, 0);
    gg.quadraticCurveTo(-u * 0.055 + sway * u * 0.2, -th * 0.6, -u * 0.045 + sway * u * 0.5, -th);
    gg.lineTo(u * 0.045 + sway * u * 0.5, -th);
    gg.quadraticCurveTo(u * 0.06 + sway * u * 0.2, -th * 0.6, u * 0.08, 0);
    gg.closePath();
    gg.fill();
    gg.fillStyle = 'rgba(70,50,34,0.4)';
    gg.fillRect(-u * 0.07, -th, u * 0.035, th);
    // canopy
    const cy = -th - u * 0.16 * big;
    const cx = sway * u * 0.7;
    const r = new Rng(this.rng.seed ^ 0x4f11);
    const blobs: Array<[number, number, number]> = [];
    for (let i = 0; i < 9; i++) {
      blobs.push([r.range(-0.42, 0.42) * big, r.range(-0.3, 0.22) * big, r.range(0.2, 0.36) * big]);
    }
    for (let pass = 0; pass < 2; pass++) {
      gg.fillStyle = pass === 0 ? rgb(mix(P.treeFar, [40, 70, 48], 0.35)) : rgb(mix(P.treeFar, [188, 226, 150], 0.45));
      gg.beginPath();
      for (const bl of blobs) {
        const wob = Math.sin(this.t * 1.5 + bl[0] * 8) * this.wind * u * 0.03;
        const bx = cx + bl[0] * u + wob + (pass === 0 ? u * 0.02 : -u * 0.02);
        const by = cy + bl[1] * u + (pass === 0 ? u * 0.03 : 0);
        gg.moveTo(bx + bl[2] * u, by);
        gg.arc(bx, by, bl[2] * u, 0, Math.PI * 2);
      }
      gg.fill();
    }
    gg.restore();
  }

  private drawPuff(gg: CanvasRenderingContext2D, p: Puff): void {
    const g = this.geo;
    const s = this.scaleAt(p.d);
    const y0 = this.fieldY(p.d);
    const top = this.puffTop(p);
    gg.strokeStyle = 'rgb(126,168,92)';
    gg.lineWidth = Math.max(1.1, g.unit * 0.0045 * s);
    gg.beginPath();
    gg.moveTo(p.x, y0);
    gg.quadraticCurveTo(p.x + (top.x - p.x) * 0.25, y0 - p.stem * s * 0.55, top.x, top.y);
    gg.stroke();
    if (p.full < 0.05) {
      gg.fillStyle = 'rgb(150,186,120)';
      gg.beginPath();
      gg.arc(top.x, top.y, g.unit * 0.008 * s, 0, Math.PI * 2);
      gg.fill();
      return;
    }
    const r = top.r * (1 + p.pop * 0.12);
    // seed head: a soft ball of little parachutes
    const rr = new Rng(0x1234 + Math.round(p.x));
    gg.save();
    gg.globalAlpha = 0.5 + p.full * 0.5;
    gg.strokeStyle = 'rgba(255,255,255,0.85)';
    gg.lineWidth = Math.max(0.8, g.unit * 0.0022 * s);
    const n = Math.round(16 * p.full) + 4;
    for (let i = 0; i < n; i++) {
      const a = rr.range(0, Math.PI * 2) + this.t * 0.05;
      const rad = r * rr.range(0.55, 1);
      gg.beginPath();
      gg.moveTo(top.x, top.y);
      gg.lineTo(top.x + Math.cos(a) * rad, top.y + Math.sin(a) * rad);
      gg.stroke();
    }
    const gr = gg.createRadialGradient(top.x, top.y, 0, top.x, top.y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.75)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = gr;
    gg.beginPath();
    gg.arc(top.x, top.y, r, 0, Math.PI * 2);
    gg.fill();
    gg.restore();
  }

  // ------------------------------------------------------------ the straw hat

  private drawHat(gg: CanvasRenderingContext2D, overrideR?: number): void {
    const H = this.hat;
    const g = this.geo;
    const R = overrideR ?? this.hatR();
    const p = this.hatScreen();
    const c = Math.cos(H.tilt);
    const sq = Math.max(0.035, Math.abs(c));
    const e = Math.sqrt(Math.max(0, 1 - sq * sq));
    const faceUp = c >= 0;
    const crownH = R * 0.62;
    const cw = R * 0.58;
    const flex = H.flap * 0.5 + this.wind * 0.12;
    // where the wind is coming from, in the hat's own frame
    const windAng = Math.atan2(-g.wd * 0.5, g.wx) - H.spin;

    // ground shadow
    if (H.state !== 'worn') {
      const gy = this.fieldY(H.d);
      const fall = clamp(1 - H.z / (g.unit * 0.9), 0.16, 1);
      gg.fillStyle = `rgba(48,74,46,${0.24 * fall})`;
      gg.beginPath();
      gg.ellipse(H.x + H.z * 0.06, gy, R * 0.9 * fall, R * 0.3 * fall, 0, 0, Math.PI * 2);
      gg.fill();
    }

    gg.save();
    gg.translate(p.x, p.y);
    gg.rotate(H.spin);

    const brim = (scaleR: number, lift: number): Path2D => {
      const path = new Path2D();
      const N = 44;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const wave = Math.cos(a - windAng);
        const rr = R * scaleR * (1 + flex * 0.1 * Math.cos(2 * (a - windAng)));
        const x = Math.cos(a) * rr;
        let y = Math.sin(a) * rr * sq;
        // the windward edge curls up, the far edge dips
        y -= lift * R * (0.34 * flex + 0.06) * (wave * 0.5 + 0.5) * (0.4 + sq);
        y += lift * R * 0.05 * flex * (1 - (wave * 0.5 + 0.5));
        if (i === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      path.closePath();
      return path;
    };

    const under = brim(1, 1);
    // brim underside (a touch of thickness)
    gg.save();
    gg.translate(0, R * 0.055);
    gg.fillStyle = rgb(STRAW_DARK);
    gg.fill(under);
    gg.restore();

    const drawCrown = () => {
      const oy = -crownH * e * (faceUp ? 1 : -1);
      const topY = oy;
      // side of the crown
      gg.fillStyle = rgb(mix(STRAW, [150, 116, 66], 0.18));
      gg.beginPath();
      gg.ellipse(0, topY, cw, cw * sq, 0, 0, Math.PI * 2);
      gg.fill();
      if (e > 0.06) {
        gg.beginPath();
        gg.moveTo(-cw, topY);
        gg.lineTo(-cw, 0);
        gg.ellipse(0, 0, cw, cw * sq, 0, Math.PI, 0, true);
        gg.lineTo(cw, topY);
        gg.ellipse(0, topY, cw, cw * sq, 0, 0, Math.PI, true);
        gg.closePath();
        const cg = gg.createLinearGradient(-cw, 0, cw, 0);
        cg.addColorStop(0, rgb(mix(STRAW, [140, 106, 58], 0.4)));
        cg.addColorStop(0.42, rgb(STRAW_LIT));
        cg.addColorStop(1, rgb(mix(STRAW, [150, 116, 66], 0.3)));
        gg.fillStyle = cg;
        gg.fill();
        // ribbon
        gg.save();
        gg.beginPath();
        gg.moveTo(-cw, topY);
        gg.lineTo(-cw, 0);
        gg.ellipse(0, 0, cw, cw * sq, 0, Math.PI, 0, true);
        gg.lineTo(cw, topY);
        gg.ellipse(0, topY, cw, cw * sq, 0, 0, Math.PI, true);
        gg.closePath();
        gg.clip();
        gg.fillStyle = rgb(RIBBON);
        gg.fillRect(-cw, topY * 0.36 - cw * sq * 0.3, cw * 2, Math.max(2, crownH * e * 0.3));
        gg.restore();
      }
      // crown top
      gg.fillStyle = rgb(mix(STRAW_LIT, [255, 248, 214], 0.35));
      gg.beginPath();
      gg.ellipse(0, topY, cw, cw * sq, 0, 0, Math.PI * 2);
      gg.fill();
      gg.strokeStyle = rgb(STRAW_DARK, 0.55);
      gg.lineWidth = Math.max(0.8, R * 0.02);
      gg.beginPath();
      gg.ellipse(0, topY, cw * 0.72, cw * 0.72 * sq, 0, 0, Math.PI * 2);
      gg.stroke();
    };

    if (!faceUp) drawCrown();

    // brim top face
    const top = brim(1, 1);
    const bg = gg.createLinearGradient(-R, -R * sq, R, R * sq);
    bg.addColorStop(0, rgb(mix(STRAW_LIT, [255, 250, 226], 0.3)));
    bg.addColorStop(0.5, rgb(STRAW));
    bg.addColorStop(1, rgb(mix(STRAW, [160, 122, 68], 0.42)));
    gg.fillStyle = faceUp ? bg : rgb(mix(STRAW_DARK, [212, 176, 114], 0.45));
    gg.fill(top);
    // straw weave
    gg.save();
    gg.clip(top);
    gg.strokeStyle = rgb(STRAW_DARK, 0.28);
    gg.lineWidth = Math.max(0.7, R * 0.022);
    for (let i = 1; i < 5; i++) {
      gg.beginPath();
      gg.ellipse(0, 0, (R * i) / 5, ((R * i) / 5) * sq, 0, 0, Math.PI * 2);
      gg.stroke();
    }
    gg.restore();
    gg.strokeStyle = rgb(mix(STRAW_DARK, [110, 78, 40], 0.4), 0.75);
    gg.lineWidth = Math.max(1, R * 0.035);
    gg.stroke(top);

    if (faceUp) drawCrown();

    gg.restore();
  }

  // ------------------------------------------------------------ bench + kid

  private drawBenchAndKid(gg: CanvasRenderingContext2D, P: ReturnType<HatWind['pal']>): void {
    const g = this.geo;
    const d = g.bench.d;
    const s = this.scaleAt(d);
    const u = g.unit * s;
    const bx = g.bench.x;
    const by = this.fieldY(d);
    const k = this.kid;

    // ground shadow
    gg.fillStyle = 'rgba(48,74,46,0.22)';
    gg.beginPath();
    gg.ellipse(bx, by + u * 0.01, u * 0.4, u * 0.075, 0, 0, Math.PI * 2);
    gg.fill();

    const wood = (a: number): string => rgb(mix([186, 134, 86], [214, 166, 112], a));
    const metal = 'rgb(84,92,96)';
    const halfW = u * 0.34;
    const seatY = by - u * 0.155;
    const backTop = by - u * 0.36;

    // --- bench behind the kid
    gg.fillStyle = metal;
    for (const sgn of [-1, 1]) {
      gg.fillRect(bx + sgn * halfW * 0.92 - u * 0.012, backTop, u * 0.024, by - backTop);
    }
    for (let i = 0; i < 3; i++) {
      const y = backTop + i * u * 0.058;
      gg.fillStyle = wood(i % 2 ? 0.25 : 0.55);
      this.rr(gg, bx - halfW, y, halfW * 2, u * 0.042, u * 0.016);
      gg.fill();
      gg.fillStyle = 'rgba(255,240,210,0.22)';
      gg.fillRect(bx - halfW, y, halfW * 2, u * 0.008);
    }

    // --- kid legs (dangling in front of the bench, behind the seat apron)
    const legTop = seatY - u * 0.01;
    const swing = Math.sin(this.t * 1.7) * u * 0.012 * (1 - k.alarm * 0.6) + k.alarm * u * 0.01;
    gg.strokeStyle = 'rgb(92,120,168)';
    gg.lineWidth = u * 0.045;
    gg.lineCap = 'round';
    for (const sgn of [-1, 1]) {
      const fx = bx + sgn * u * 0.062;
      gg.beginPath();
      gg.moveTo(fx, legTop);
      gg.lineTo(fx + swing * sgn * 0.6, by - u * 0.03);
      gg.stroke();
    }
    gg.fillStyle = 'rgb(212,88,78)';
    for (const sgn of [-1, 1]) {
      const fx = bx + sgn * u * 0.062 + swing * sgn * 0.6;
      gg.beginPath();
      gg.ellipse(fx + u * 0.008, by - u * 0.024, u * 0.034, u * 0.018, 0, 0, Math.PI * 2);
      gg.fill();
    }

    // --- seat slab
    gg.fillStyle = wood(0.6);
    this.rr(gg, bx - halfW, seatY, halfW * 2, u * 0.036, u * 0.014);
    gg.fill();
    gg.fillStyle = 'rgba(255,244,216,0.3)';
    gg.fillRect(bx - halfW, seatY, halfW * 2, u * 0.008);
    gg.fillStyle = wood(0.1);
    this.rr(gg, bx - halfW, seatY + u * 0.032, halfW * 2, u * 0.018, u * 0.008);
    gg.fill();
    // bench legs at the front
    gg.fillStyle = metal;
    for (const sgn of [-1, 1]) {
      gg.fillRect(bx + sgn * halfW * 0.8 - u * 0.01, seatY + u * 0.04, u * 0.02, by - seatY - u * 0.04);
    }

    // --- the hat resting on the bench
    if (this.hat.state === 'bench') this.drawHat(gg);

    // --- kid
    const hp = this.headPos();
    const hr = hp.r;
    const shoulderY = hp.y + hr * 1.4 - k.shrug * hr * 0.28;
    const hipY = seatY + u * 0.004;
    const lean = -k.lookWind * 0.14 - k.alarm * 0.06 + k.relief * 0.02;
    const shirt: RGB = [246, 176, 88];
    const shirtDark = mix(shirt, [140, 80, 40], 0.35);
    const skin: RGB = [248, 210, 176];

    gg.save();
    gg.translate(bx, hipY);
    gg.rotate(lean);
    gg.translate(-bx, -hipY);

    // torso
    gg.beginPath();
    gg.moveTo(bx - hr * 0.86, hipY + hr * 0.12);
    gg.quadraticCurveTo(bx - hr * 0.98, shoulderY + hr * 0.3, bx - hr * 0.76, shoulderY - hr * 0.1);
    gg.quadraticCurveTo(bx, shoulderY - hr * 0.36, bx + hr * 0.76, shoulderY - hr * 0.1);
    gg.quadraticCurveTo(bx + hr * 0.98, shoulderY + hr * 0.3, bx + hr * 0.86, hipY + hr * 0.12);
    gg.closePath();
    const tg = gg.createLinearGradient(bx - hr, 0, bx + hr, 0);
    tg.addColorStop(0, rgb(mix(shirt, [255, 232, 190], 0.25)));
    tg.addColorStop(1, rgb(shirtDark));
    gg.fillStyle = tg;
    gg.fill();
    gg.strokeStyle = rgb(mix(shirtDark, [110, 60, 30], 0.4), 0.55);
    gg.lineWidth = Math.max(1, hr * 0.07);
    gg.stroke();
    // --- neck: the head sits on shoulders, it does not grow out of the shirt
    const neckTop = hp.y + hr * 0.5;
    gg.fillStyle = rgb(mix(skin, [206, 160, 128], 0.3));
    gg.beginPath();
    gg.moveTo(bx - hr * 0.27, neckTop);
    gg.lineTo(bx + hr * 0.27, neckTop);
    gg.lineTo(bx + hr * 0.33, shoulderY - hr * 0.06);
    gg.lineTo(bx - hr * 0.33, shoulderY - hr * 0.06);
    gg.closePath();
    gg.fill();
    // the shadow the chin throws down the neck
    const ng = gg.createLinearGradient(0, neckTop, 0, shoulderY - hr * 0.06);
    ng.addColorStop(0, 'rgba(126,84,60,0.45)');
    ng.addColorStop(0.75, 'rgba(126,84,60,0)');
    gg.fillStyle = ng;
    gg.fillRect(bx - hr * 0.34, neckTop, hr * 0.68, shoulderY - neckTop);

    // --- collar: a band with two little points, sitting on the shoulders
    const colY = shoulderY - hr * 0.14;
    gg.fillStyle = rgb(mix(shirt, [255, 246, 226], 0.66));
    gg.beginPath();
    gg.ellipse(bx, colY, hr * 0.46, hr * 0.19, 0, 0, Math.PI * 2);
    gg.fill();
    gg.fillStyle = rgb(mix(shirt, [255, 250, 236], 0.8));
    for (const sgn of [-1, 1]) {
      gg.beginPath();
      gg.moveTo(bx + sgn * hr * 0.06, colY - hr * 0.02);
      gg.lineTo(bx + sgn * hr * 0.52, colY - hr * 0.04);
      gg.lineTo(bx + sgn * hr * 0.22, colY + hr * 0.32);
      gg.closePath();
      gg.fill();
    }
    gg.strokeStyle = rgb(mix(shirtDark, [110, 60, 30], 0.35), 0.45);
    gg.lineWidth = Math.max(0.8, hr * 0.05);
    for (const sgn of [-1, 1]) {
      gg.beginPath();
      gg.moveTo(bx + sgn * hr * 0.06, colY - hr * 0.02);
      gg.lineTo(bx + sgn * hr * 0.22, colY + hr * 0.32);
      gg.stroke();
    }
    // a shirt hem that flutters
    gg.strokeStyle = rgb(shirtDark, 0.7);
    gg.lineWidth = Math.max(1, hr * 0.09);
    gg.beginPath();
    gg.moveTo(bx - hr * 0.84, hipY + hr * 0.04);
    for (let i = 1; i <= 5; i++) {
      const f = i / 5;
      const x = bx - hr * 0.84 + f * hr * 1.68;
      gg.lineTo(x, hipY + hr * 0.04 + Math.sin(f * 7 + this.t * (5 + this.wind * 9)) * hr * 0.09 * this.wind);
    }
    gg.stroke();

    // --- arms
    const armC = rgb(mix(shirt, [255, 226, 180], 0.1));
    const drawArm = (side: number, hx: number, hy: number, bendK: number): void => {
      const ax = bx + side * hr * 0.78;
      const ay = shoulderY + hr * 0.16;
      const mx = (ax + hx) / 2 + side * hr * 0.42 * bendK;
      const my = (ay + hy) / 2 + hr * 0.2;
      gg.strokeStyle = rgb(mix(shirtDark, [90, 50, 26], 0.35));
      gg.lineWidth = hr * 0.46;
      gg.lineCap = 'round';
      gg.beginPath();
      gg.moveTo(ax, ay);
      gg.quadraticCurveTo(mx, my, hx, hy);
      gg.stroke();
      gg.strokeStyle = armC;
      gg.lineWidth = hr * 0.34;
      gg.beginPath();
      gg.moveTo(ax, ay);
      gg.quadraticCurveTo(mx, my, hx, hy);
      gg.stroke();
      // forearm in skin
      gg.strokeStyle = rgb(skin);
      gg.lineWidth = hr * 0.3;
      gg.beginPath();
      gg.moveTo(lerp(mx, hx, 0.25), lerp(my, hy, 0.25));
      gg.quadraticCurveTo(lerp(mx, hx, 0.6), lerp(my, hy, 0.6), hx, hy);
      gg.stroke();
      gg.fillStyle = rgb(skin);
      gg.beginPath();
      gg.arc(hx, hy, hr * 0.24, 0, Math.PI * 2);
      gg.fill();
      gg.strokeStyle = 'rgba(130,86,54,0.35)';
      gg.lineWidth = Math.max(0.8, hr * 0.05);
      gg.beginPath();
      gg.arc(hx, hy, hr * 0.24, 0, Math.PI * 2);
      gg.stroke();
    };

    // right arm: holds the brim / reaches after the hat / shrugs
    const brimX = hp.x + hr * 1.5;
    const brimY = hp.y - hr * 0.34;
    let lhx = bx + hr * 1.18;
    let lhy = hipY - hr * 0.42;
    if (k.hold > 0.02) {
      lhx = lerp(lhx, brimX, k.hold);
      lhy = lerp(lhy, brimY, k.hold);
    }
    if (k.shrug > 0.02) {
      lhx = lerp(lhx, bx + hr * 1.62, k.shrug);
      lhy = lerp(lhy, shoulderY - hr * 0.22, k.shrug);
    }
    if (k.reach > 0.02) {
      const hs = this.hatScreen();
      const sxx = bx + hr * 0.78;
      const syy = shoulderY + hr * 0.16;
      const dir = hs.x >= bx ? 1 : -1;
      const maxL = hr * 1.8;
      lhx = lerp(lhx, sxx + dir * maxL * 0.72, k.reach);
      lhy = lerp(lhy, syy - maxL * 0.66, k.reach);
    }
    drawArm(1, lhx, lhy, 1);

    // left arm: the ice cream
    const cp = { x: this.cone.x, y: this.cone.y };
    let rhx = cp.x;
    let rhy = cp.y;
    if (k.shrug > 0.02) {
      rhx = lerp(rhx, bx - hr * 1.62, k.shrug);
      rhy = lerp(rhy, shoulderY - hr * 0.22, k.shrug);
    }
    if (k.coneHat > 0.5) {
      rhx = bx - hr * 1.1;
      rhy = shoulderY + hr * 0.6;
    }
    drawArm(-1, rhx, rhy, -1);

    // --- short sleeves, so the arms come out of a shirt instead of a block
    for (const sgn of [-1, 1]) {
      gg.save();
      gg.translate(bx + sgn * hr * 0.62, shoulderY + hr * 0.08);
      gg.rotate(sgn * 0.3);
      gg.scale(sgn, 1);
      const sg = gg.createLinearGradient(-hr * 0.36, 0, hr * 0.44, 0);
      sg.addColorStop(0, rgb(mix(shirt, [255, 232, 190], 0.2)));
      sg.addColorStop(1, rgb(shirtDark));
      gg.fillStyle = sg;
      gg.beginPath();
      gg.moveTo(-hr * 0.36, -hr * 0.3);
      gg.quadraticCurveTo(hr * 0.34, -hr * 0.36, hr * 0.42, hr * 0.12);
      gg.quadraticCurveTo(hr * 0.12, hr * 0.42, -hr * 0.3, hr * 0.26);
      gg.closePath();
      gg.fill();
      // the cuff of the sleeve
      gg.strokeStyle = rgb(mix(shirtDark, [110, 60, 30], 0.45), 0.7);
      gg.lineWidth = Math.max(1, hr * 0.07);
      gg.beginPath();
      gg.moveTo(hr * 0.42, hr * 0.12);
      gg.quadraticCurveTo(hr * 0.12, hr * 0.42, -hr * 0.3, hr * 0.26);
      gg.stroke();
      gg.restore();
    }

    // --- head
    gg.save();
    gg.translate(hp.x, hp.y);
    gg.rotate(-k.lookWind * 0.12 + k.relief * 0.04);
    // hair behind
    gg.fillStyle = 'rgb(86,62,48)';
    gg.beginPath();
    gg.ellipse(0, -hr * 0.05, hr * 1.06, hr * 1.06, 0, 0, Math.PI * 2);
    gg.fill();
    // face
    gg.fillStyle = rgb(skin);
    gg.beginPath();
    gg.ellipse(0, hr * 0.06, hr * 0.94, hr * 0.98, 0, 0, Math.PI * 2);
    gg.fill();
    // fringe
    gg.fillStyle = 'rgb(86,62,48)';
    gg.beginPath();
    gg.moveTo(-hr * 0.98, -hr * 0.1);
    gg.quadraticCurveTo(-hr * 0.5, -hr * 0.62, hr * 0.15, -hr * 0.42);
    gg.quadraticCurveTo(hr * 0.72, -hr * 0.28, hr * 0.98, -hr * 0.52);
    gg.quadraticCurveTo(hr * 0.9, -hr * 1.1, 0, -hr * 1.08);
    gg.quadraticCurveTo(-hr * 0.92, -hr * 1.0, -hr * 0.98, -hr * 0.1);
    gg.closePath();
    gg.fill();
    // hair tufts flying in the wind
    if (k.hair > 0.02) {
      gg.strokeStyle = 'rgb(86,62,48)';
      gg.lineWidth = hr * 0.11;
      gg.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI * 0.86 + i * 0.3;
        const l = hr * (0.22 + 0.34 * k.hair) * (0.7 + 0.4 * Math.sin(this.t * 9 + i));
        gg.beginPath();
        gg.moveTo(Math.cos(a) * hr * 0.85, Math.sin(a) * hr * 0.85);
        gg.quadraticCurveTo(
          Math.cos(a) * hr * 0.85 + l * 0.4,
          Math.sin(a) * hr * 0.85 - l * 0.7,
          Math.cos(a) * hr * 0.85 + l * (0.5 + this.wind),
          Math.sin(a) * hr * 0.85 - l * 0.4,
        );
        gg.stroke();
      }
    }
    // eyes
    const blink = k.blink > 0 ? 1 : 0;
    const eyeY = hr * (0.12 - k.eyeUp * 0.14);
    const ex = hr * 0.36;
    const off = -k.lookWind * hr * 0.16 + k.eyeUp * hr * 0.12;
    gg.fillStyle = 'rgb(58,44,40)';
    gg.strokeStyle = 'rgb(58,44,40)';
    for (const sgn of [-1, 1]) {
      const x = sgn * ex + off;
      if (blink) {
        gg.lineWidth = hr * 0.09;
        gg.lineCap = 'round';
        gg.beginPath();
        gg.moveTo(x - hr * 0.16, eyeY);
        gg.lineTo(x + hr * 0.16, eyeY);
        gg.stroke();
      } else if ((k.relief > 0.5 || k.grin > 0.5) && k.eyeUp < 0.3) {
        gg.lineWidth = hr * 0.1;
        gg.lineCap = 'round';
        gg.beginPath();
        gg.arc(x, eyeY + hr * 0.06, hr * 0.17, Math.PI * 1.12, Math.PI * 1.88);
        gg.stroke();
      } else {
        const r = hr * (0.13 + k.alarm * 0.08);
        gg.beginPath();
        gg.ellipse(x, eyeY, r, r * 1.2, 0, 0, Math.PI * 2);
        gg.fill();
        gg.fillStyle = 'rgba(255,255,255,0.9)';
        gg.beginPath();
        gg.arc(x - r * 0.3, eyeY - r * 0.42, r * 0.34, 0, Math.PI * 2);
        gg.fill();
        gg.fillStyle = 'rgb(58,44,40)';
      }
    }
    // brows
    gg.lineWidth = hr * 0.1;
    gg.lineCap = 'round';
    for (const sgn of [-1, 1]) {
      const x = sgn * ex + off;
      const up = k.alarm * hr * 0.16 + k.grin * hr * 0.04;
      gg.beginPath();
      gg.moveTo(x - hr * 0.2, eyeY - hr * 0.34 - up);
      gg.lineTo(x + hr * 0.2, eyeY - hr * (0.38 + k.alarm * 0.1) - up);
      gg.stroke();
    }
    // mouth
    const my = hr * 0.5;
    gg.strokeStyle = 'rgb(168,96,86)';
    gg.lineWidth = hr * 0.11;
    gg.beginPath();
    if (k.alarm > 0.45) {
      gg.fillStyle = 'rgb(150,78,74)';
      gg.ellipse(off * 0.6, my, hr * 0.17, hr * 0.22, 0, 0, Math.PI * 2);
      gg.fill();
    } else if (k.lick > 0.15) {
      gg.fillStyle = 'rgb(150,78,74)';
      gg.ellipse(off * 0.6, my, hr * 0.22, hr * 0.16, 0, 0, Math.PI * 2);
      gg.fill();
      gg.fillStyle = 'rgb(232,134,146)';
      gg.beginPath();
      gg.ellipse(off * 0.6 + hr * 0.1, my + hr * 0.04, hr * 0.14, hr * 0.1, 0.3, 0, Math.PI * 2);
      gg.fill();
    } else {
      if (k.shrug > 0.4) {
        gg.moveTo(-hr * 0.26, my);
        gg.quadraticCurveTo(0, my - hr * 0.16, hr * 0.26, my);
        gg.stroke();
      } else {
        const wide = 0.24 + k.grin * 0.16 + k.relief * 0.12;
        gg.arc(off * 0.6, my - hr * 0.16, hr * wide, 0.34, Math.PI - 0.34);
        gg.stroke();
      }
      if (k.grin > 0.4 || k.relief > 0.6) {
        gg.fillStyle = 'rgba(244,150,150,0.5)';
        for (const sgn of [-1, 1]) {
          gg.beginPath();
          gg.ellipse(sgn * hr * 0.62, hr * 0.34, hr * 0.17, hr * 0.11, 0, 0, Math.PI * 2);
          gg.fill();
        }
      }
    }
    gg.restore();

    // the ice-cream cup worn as a hat
    if (k.coneHat > 0.05) {
      gg.save();
      gg.translate(hp.x, hp.y - hr * (0.7 + 0.5 * k.coneHat));
      gg.rotate(Math.PI + 0.12);
      this.drawCone(gg, u * 0.9, 0.35);
      gg.restore();
    }
    gg.restore();

    // the hat, if the kid is wearing it (drawn after the head)
    if (this.hat.state === 'worn' && this.catchers[this.hat.wearer]?.kind === 'kid') this.drawHat(gg);

    // the ice cream in the hand
    if (k.coneHat < 0.05) {
      gg.save();
      gg.translate(this.cone.x, this.cone.y);
      gg.rotate(this.cone.held ? clamp((this.pointerX - bx) * 0.002, -0.5, 0.5) : -0.12);
      this.drawCone(gg, u, 1);
      gg.restore();
      // a falling drip
      if (this.cone.dripZ >= 0) {
        gg.fillStyle = 'rgba(252,226,208,0.95)';
        gg.beginPath();
        gg.ellipse(this.cone.dripX, this.cone.dripY, u * 0.012, u * 0.02, 0, 0, Math.PI * 2);
        gg.fill();
      }
    }
    void P;
  }

  private drawCone(gg: CanvasRenderingContext2D, u: number, scoops: number): void {
    const cw = u * 0.038;
    const ch = u * 0.062;
    // waffle cone
    gg.fillStyle = 'rgb(214,164,96)';
    gg.beginPath();
    gg.moveTo(-cw, 0);
    gg.lineTo(cw, 0);
    gg.lineTo(0, ch);
    gg.closePath();
    gg.fill();
    gg.strokeStyle = 'rgba(150,108,58,0.6)';
    gg.lineWidth = Math.max(0.7, u * 0.004);
    for (let i = -1; i <= 1; i++) {
      gg.beginPath();
      gg.moveTo(i * cw * 0.6, 0);
      gg.lineTo(i * cw * 0.2, ch * 0.75);
      gg.stroke();
    }
    if (scoops <= 0) return;
    const melt = 1 - clamp(this.cone.licks * 0.06, 0, 0.35);
    // scoops
    const s1 = cw * 1.12 * melt;
    gg.fillStyle = 'rgb(252,230,208)';
    gg.beginPath();
    gg.arc(0, -s1 * 0.55, s1, 0, Math.PI * 2);
    gg.fill();
    if (scoops > 0.6) {
      gg.fillStyle = 'rgb(246,168,186)';
      gg.beginPath();
      gg.arc(-cw * 0.12, -s1 * 1.5, s1 * 0.86, 0, Math.PI * 2);
      gg.fill();
      gg.fillStyle = 'rgba(255,255,255,0.45)';
      gg.beginPath();
      gg.arc(-cw * 0.42, -s1 * 1.72, s1 * 0.28, 0, Math.PI * 2);
      gg.fill();
    }
    // the drip forming on the rim
    const dr = this.cone.drip;
    if (dr > 0.35 && this.cone.dripZ < 0) {
      gg.fillStyle = 'rgba(252,226,208,0.95)';
      gg.beginPath();
      gg.ellipse(-s1 * 0.75, -s1 * 0.2 + (dr - 0.35) * u * 0.03, u * 0.011, u * 0.013 + (dr - 0.35) * u * 0.02, 0, 0, Math.PI * 2);
      gg.fill();
    }
  }

  private rr(gg: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const rad = Math.min(r, w / 2, h / 2);
    gg.beginPath();
    gg.moveTo(x + rad, y);
    gg.arcTo(x + w, y, x + w, y + h, rad);
    gg.arcTo(x + w, y + h, x, y + h, rad);
    gg.arcTo(x, y + h, x, y, rad);
    gg.arcTo(x, y, x + w, y, rad);
    gg.closePath();
  }

  // ------------------------------------------------------------ catchers

  private drawDog(gg: CanvasRenderingContext2D, c: Catcher): void {
    const g = this.geo;
    const d = c.d + c.walkD;
    const s = this.scaleAt(d);
    const u = g.unit * s;
    const x = c.x + c.walkX;
    const y = this.fieldY(d);
    const face = g.o === 'portrait' ? -1 : -1; // looks back toward the bench
    const proud = c.react;
    const trot = Math.sin(c.walk) * (this.ctx.phase.is('comic') && this.ending === 'dog' ? 1 : 0);

    gg.save();
    gg.translate(x, y + Math.abs(trot) * u * 0.012);
    gg.scale(face, 1);

    gg.fillStyle = 'rgba(48,74,46,0.24)';
    gg.beginPath();
    gg.ellipse(0, 0, u * 0.13, u * 0.028, 0, 0, Math.PI * 2);
    gg.fill();

    const furA: RGB = [214, 164, 96];
    const furB: RGB = [176, 124, 68];
    const cream: RGB = [246, 226, 194];

    // tail — wags
    const wag = Math.sin(this.t * (6 + c.wag * 16)) * c.wag;
    gg.strokeStyle = rgb(furB);
    gg.lineWidth = u * 0.026;
    gg.lineCap = 'round';
    gg.beginPath();
    gg.moveTo(u * 0.07, -u * 0.045);
    gg.quadraticCurveTo(u * 0.13, -u * 0.075 - wag * u * 0.03, u * 0.15 + wag * u * 0.03, -u * 0.13 + wag * u * 0.02);
    gg.stroke();

    // haunch + body
    gg.fillStyle = rgb(furA);
    gg.beginPath();
    gg.ellipse(u * 0.045, -u * 0.055, u * 0.072, u * 0.058, 0, 0, Math.PI * 2);
    gg.fill();
    gg.beginPath();
    gg.moveTo(u * 0.08, -u * 0.05);
    gg.quadraticCurveTo(0, -u * 0.13, -u * 0.05, -u * 0.105);
    gg.quadraticCurveTo(-u * 0.085, -u * 0.075, -u * 0.06, -u * 0.005);
    gg.lineTo(u * 0.06, -u * 0.005);
    gg.closePath();
    gg.fill();
    // chest
    gg.fillStyle = rgb(cream);
    gg.beginPath();
    gg.ellipse(-u * 0.045, -u * 0.05, u * 0.028, u * 0.048, 0.2, 0, Math.PI * 2);
    gg.fill();
    // front legs
    gg.fillStyle = rgb(furA);
    for (const o of [0, 0.022]) {
      this.rr(gg, -u * (0.062 - o), -u * 0.055, u * 0.026, u * 0.056, u * 0.012);
      gg.fill();
    }
    gg.fillStyle = rgb(furB);
    for (const o of [0, 0.022]) {
      gg.beginPath();
      gg.ellipse(-u * (0.05 - o), -u * 0.006, u * 0.02, u * 0.01, 0, 0, Math.PI * 2);
      gg.fill();
    }

    // head
    const hy = -c.hz * s + c.hr * s * 0.9;
    const hx = -u * 0.055;
    const tiltUp = proud * 0.18;
    gg.save();
    gg.translate(hx, hy);
    gg.rotate(-tiltUp);
    const hr = c.hr * s;
    gg.fillStyle = rgb(furA);
    gg.beginPath();
    gg.ellipse(0, 0, hr, hr * 0.92, 0, 0, Math.PI * 2);
    gg.fill();
    // muzzle
    gg.fillStyle = rgb(cream);
    gg.beginPath();
    gg.ellipse(-hr * 0.66, hr * 0.26, hr * 0.46, hr * 0.34, -0.1, 0, Math.PI * 2);
    gg.fill();
    gg.fillStyle = 'rgb(58,44,42)';
    gg.beginPath();
    gg.ellipse(-hr * 1.02, hr * 0.14, hr * 0.15, hr * 0.12, 0, 0, Math.PI * 2);
    gg.fill();
    // mouth / tongue
    gg.strokeStyle = 'rgb(88,62,54)';
    gg.lineWidth = Math.max(1, hr * 0.1);
    gg.beginPath();
    gg.arc(-hr * 0.62, hr * 0.3, hr * 0.26, 0.2, Math.PI - 0.5);
    gg.stroke();
    if (c.wag > 0.55) {
      gg.fillStyle = 'rgb(238,138,148)';
      gg.beginPath();
      gg.ellipse(-hr * 0.64, hr * 0.56 + Math.sin(this.t * 9) * hr * 0.05, hr * 0.14, hr * 0.2, 0, 0, Math.PI * 2);
      gg.fill();
    }
    // ear, flops in the wind
    const flop = this.windAt(c.x, c.d) * 0.5;
    gg.fillStyle = rgb(furB);
    gg.save();
    gg.translate(hr * 0.42, -hr * 0.5);
    gg.rotate(0.4 - flop * 0.7);
    gg.beginPath();
    gg.ellipse(0, hr * 0.42, hr * 0.28, hr * 0.56, 0, 0, Math.PI * 2);
    gg.fill();
    gg.restore();
    // eye — looks at the camera when it is proud
    const look = c.look;
    gg.fillStyle = 'rgb(48,38,34)';
    gg.beginPath();
    gg.ellipse(-hr * 0.24 + look * hr * 0.12, -hr * 0.08, hr * 0.12, hr * 0.14, 0, 0, Math.PI * 2);
    gg.fill();
    gg.fillStyle = 'rgba(255,255,255,0.9)';
    gg.beginPath();
    gg.arc(-hr * 0.28 + look * hr * 0.12, -hr * 0.13, hr * 0.045, 0, Math.PI * 2);
    gg.fill();
    if (look > 0.4) {
      gg.fillStyle = 'rgb(48,38,34)';
      gg.beginPath();
      gg.ellipse(hr * 0.42, -hr * 0.08, hr * 0.1, hr * 0.12, 0, 0, Math.PI * 2);
      gg.fill();
    }
    // fur tufts that the wind ruffles
    gg.strokeStyle = rgb(furB, 0.9);
    gg.lineWidth = Math.max(0.8, hr * 0.08);
    for (let i = 0; i < 3; i++) {
      const a = -1.9 + i * 0.35;
      gg.beginPath();
      gg.moveTo(Math.cos(a) * hr * 0.8, Math.sin(a) * hr * 0.8);
      gg.lineTo(Math.cos(a) * hr * 1.1 + flop * hr * 0.5, Math.sin(a) * hr * 1.05);
      gg.stroke();
    }
    gg.restore();
    gg.restore();
  }

  private drawScarecrow(gg: CanvasRenderingContext2D, c: Catcher): void {
    const g = this.geo;
    const s = this.scaleAt(c.d);
    const u = g.unit * s;
    const x = c.x;
    const y = this.fieldY(c.d);
    const H = c.hz * s;
    const hr = c.hr * s;
    const proud = c.react;
    const wind = this.windAt(c.x, c.d);

    gg.save();
    gg.translate(x, y);
    gg.fillStyle = 'rgba(48,74,46,0.22)';
    gg.beginPath();
    gg.ellipse(0, 0, u * 0.09, u * 0.022, 0, 0, Math.PI * 2);
    gg.fill();

    // post
    gg.fillStyle = 'rgb(134,102,68)';
    gg.fillRect(-u * 0.016, -H, u * 0.032, H);
    // cross bar
    const barY = -H * 0.72;
    gg.save();
    gg.translate(0, barY);
    gg.rotate(-0.05 + wind * 0.03);
    gg.fillStyle = 'rgb(150,116,78)';
    gg.fillRect(-u * 0.24, -u * 0.014, u * 0.48, u * 0.028);
    // straw at the wrists
    gg.strokeStyle = 'rgb(226,196,124)';
    gg.lineWidth = Math.max(1, u * 0.008);
    for (const sgn of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const a = -0.5 + i * 0.35;
        gg.beginPath();
        gg.moveTo(sgn * u * 0.23, 0);
        gg.lineTo(sgn * u * 0.23 + Math.cos(a) * u * 0.06 * sgn + wind * u * 0.025, Math.sin(a) * u * 0.06);
        gg.stroke();
      }
    }
    gg.restore();

    // shirt, flapping
    const shirtTop = barY - u * 0.02;
    const shirtBot = -H * 0.3;
    gg.beginPath();
    gg.moveTo(-u * 0.13, shirtTop);
    gg.lineTo(u * 0.13, shirtTop);
    const N = 6;
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const yy = lerp(shirtTop, shirtBot, f);
      gg.lineTo(u * 0.13 + Math.sin(f * 4 + this.t * (3 + this.wind * 8)) * u * 0.035 * (0.3 + this.wind) * f, yy);
    }
    for (let i = N; i >= 0; i--) {
      const f = i / N;
      const yy = lerp(shirtBot, shirtTop, 1 - f);
      gg.lineTo(-u * 0.13 + Math.sin(f * 4 + this.t * (3 + this.wind * 8)) * u * 0.03 * (0.3 + this.wind) * f, yy);
    }
    gg.closePath();
    gg.fillStyle = 'rgb(196,102,96)';
    gg.fill();
    // plaid
    gg.save();
    gg.clip();
    gg.strokeStyle = 'rgba(255,232,214,0.4)';
    gg.lineWidth = Math.max(1, u * 0.007);
    for (let i = -3; i <= 3; i++) {
      gg.beginPath();
      gg.moveTo(i * u * 0.045, shirtTop);
      gg.lineTo(i * u * 0.045 + wind * u * 0.03, shirtBot);
      gg.stroke();
    }
    for (let i = 0; i < 5; i++) {
      const yy = lerp(shirtTop, shirtBot, i / 4);
      gg.beginPath();
      gg.moveTo(-u * 0.2, yy);
      gg.lineTo(u * 0.2, yy);
      gg.stroke();
    }
    gg.restore();

    // straw poking out of the collar
    gg.strokeStyle = 'rgb(226,196,124)';
    gg.lineWidth = Math.max(1, u * 0.007);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * 0.8 + i * 0.4;
      gg.beginPath();
      gg.moveTo(0, shirtTop);
      gg.lineTo(Math.cos(a) * u * 0.06 + wind * u * 0.02, shirtTop + Math.sin(a) * u * 0.05);
      gg.stroke();
    }

    // burlap head
    const hy = -H + hr;
    gg.save();
    gg.translate(0, hy);
    gg.rotate(-proud * 0.14 + wind * 0.04);
    gg.fillStyle = 'rgb(220,192,146)';
    gg.beginPath();
    gg.ellipse(0, 0, hr * 0.96, hr * 1.06, 0, 0, Math.PI * 2);
    gg.fill();
    gg.strokeStyle = 'rgba(168,136,96,0.55)';
    gg.lineWidth = Math.max(0.7, hr * 0.06);
    for (let i = -2; i <= 2; i++) {
      gg.beginPath();
      gg.moveTo(i * hr * 0.32, -hr);
      gg.lineTo(i * hr * 0.32, hr);
      gg.stroke();
    }
    // button eyes
    gg.fillStyle = 'rgb(62,52,46)';
    for (const sgn of [-1, 1]) {
      gg.beginPath();
      gg.arc(sgn * hr * 0.36, -hr * 0.12, hr * 0.17, 0, Math.PI * 2);
      gg.fill();
      gg.fillStyle = 'rgba(255,255,255,0.8)';
      gg.beginPath();
      gg.arc(sgn * hr * 0.36 - hr * 0.05, -hr * 0.17, hr * 0.05, 0, Math.PI * 2);
      gg.fill();
      gg.fillStyle = 'rgb(62,52,46)';
    }
    // stitched smile, a little more dignified when it wears the hat
    gg.strokeStyle = 'rgb(140,96,72)';
    gg.lineWidth = Math.max(1, hr * 0.1);
    gg.beginPath();
    gg.arc(0, hr * 0.28 + proud * hr * 0.06, hr * 0.42, 0.25, Math.PI - 0.25);
    gg.stroke();
    gg.lineWidth = Math.max(0.6, hr * 0.06);
    for (let i = 0; i < 5; i++) {
      const a = 0.35 + (i / 4) * (Math.PI - 0.7);
      const px = Math.cos(a) * hr * 0.42;
      const py = Math.sin(a) * hr * 0.42 + hr * 0.28 + proud * hr * 0.06;
      gg.beginPath();
      gg.moveTo(px, py - hr * 0.09);
      gg.lineTo(px, py + hr * 0.09);
      gg.stroke();
    }
    // straw hair under the sack
    gg.strokeStyle = 'rgb(226,196,124)';
    gg.lineWidth = Math.max(0.8, hr * 0.1);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1.08 + (i / 6) * 0.84);
      gg.beginPath();
      gg.moveTo(Math.cos(a) * hr * 0.9, Math.sin(a) * hr * 0.98);
      gg.lineTo(Math.cos(a) * hr * 1.25 + wind * hr * 0.6, Math.sin(a) * hr * 1.2);
      gg.stroke();
    }
    gg.restore();
    gg.restore();
  }

  private drawDuck(gg: CanvasRenderingContext2D, c: Catcher): void {
    const g = this.geo;
    const d = c.d + c.walkD;
    const s = this.scaleAt(d);
    const u = g.unit * s;
    const x = c.x + c.walkX;
    const y = this.fieldY(d);
    const hr = c.hr * s;
    const waddling = this.ctx.phase.is('comic') && this.ending === 'duck' && this.comicT < 2.3;
    const wob = waddling ? Math.sin(c.walk * 2) : Math.sin(c.bob * 1.6) * 0.25;
    const face = c.look > 0.4 ? 0 : 1;

    gg.save();
    gg.translate(x, y - Math.abs(wob) * u * 0.008);
    gg.rotate(wob * 0.08);
    gg.fillStyle = 'rgba(48,74,46,0.2)';
    gg.beginPath();
    gg.ellipse(0, 0, u * 0.07, u * 0.016, 0, 0, Math.PI * 2);
    gg.fill();

    // feet
    gg.fillStyle = 'rgb(236,158,62)';
    for (const sgn of [-1, 1]) {
      const st = waddling ? Math.sin(c.walk * 2 + (sgn > 0 ? 0 : Math.PI)) * u * 0.012 : 0;
      gg.beginPath();
      gg.ellipse(sgn * u * 0.016 + st, -u * 0.004, u * 0.022, u * 0.009, 0, 0, Math.PI * 2);
      gg.fill();
    }
    // body
    const body: RGB = [250, 246, 236];
    gg.fillStyle = rgb(body);
    gg.beginPath();
    gg.ellipse(0, -u * 0.045, u * 0.062, u * 0.042, -0.08, 0, Math.PI * 2);
    gg.fill();
    // tail
    gg.beginPath();
    gg.moveTo(u * 0.05, -u * 0.055);
    gg.lineTo(u * 0.095, -u * 0.075);
    gg.lineTo(u * 0.05, -u * 0.03);
    gg.closePath();
    gg.fill();
    // wing
    gg.fillStyle = rgb(mix(body, [190, 182, 166], 0.6));
    gg.beginPath();
    gg.ellipse(u * 0.012, -u * 0.045, u * 0.036, u * 0.022, -0.1, 0, Math.PI * 2);
    gg.fill();
    // neck + head
    const hy = -c.hz * s + hr * 0.8;
    gg.fillStyle = rgb(body);
    gg.beginPath();
    gg.moveTo(-u * 0.03, -u * 0.05);
    gg.quadraticCurveTo(-u * 0.05, hy * 0.7, -u * 0.035, hy + hr * 0.5);
    gg.lineTo(-u * 0.005, hy + hr * 0.5);
    gg.quadraticCurveTo(-u * 0.012, hy * 0.6, u * 0.01, -u * 0.05);
    gg.closePath();
    gg.fill();
    gg.beginPath();
    gg.ellipse(-u * 0.022, hy, hr, hr * 0.92, 0, 0, Math.PI * 2);
    gg.fill();
    // bill
    const open = c.quack > 0.2 ? hr * 0.22 : 0;
    gg.fillStyle = 'rgb(240,168,64)';
    gg.save();
    gg.translate(-u * 0.022 - hr * 0.8 * face, hy + hr * 0.2);
    gg.beginPath();
    gg.ellipse(-hr * 0.42 * face, 0, hr * 0.68, hr * 0.22, 0.06, 0, Math.PI * 2);
    gg.fill();
    gg.strokeStyle = 'rgba(176,104,34,0.5)';
    gg.lineWidth = Math.max(0.8, hr * 0.06);
    gg.beginPath();
    gg.moveTo(-hr * 1.05 * face, 0);
    gg.lineTo(hr * 0.2 * face, 0);
    gg.stroke();
    if (open > 0) {
      gg.fillStyle = 'rgb(210,132,50)';
      gg.beginPath();
      gg.ellipse(-hr * 0.35 * face, open, hr * 0.48, hr * 0.16, 0.14, 0, Math.PI * 2);
      gg.fill();
    }
    gg.restore();
    // eye
    gg.fillStyle = 'rgb(48,40,36)';
    gg.beginPath();
    gg.arc(-u * 0.022 - hr * 0.3 * face, hy - hr * 0.16, hr * 0.13, 0, Math.PI * 2);
    gg.fill();
    if (c.look > 0.4) {
      gg.beginPath();
      gg.arc(-u * 0.022 + hr * 0.36, hy - hr * 0.16, hr * 0.13, 0, Math.PI * 2);
      gg.fill();
    }
    gg.fillStyle = 'rgba(255,255,255,0.85)';
    gg.beginPath();
    gg.arc(-u * 0.022 - hr * 0.34 * face, hy - hr * 0.21, hr * 0.05, 0, Math.PI * 2);
    gg.fill();
    gg.restore();
  }

  // ------------------------------------------------------------ air

  private drawMotes(gg: CanvasRenderingContext2D): void {
    for (const m of this.motes) {
      const s = this.scaleAt(m.d);
      const x = m.x;
      const y = this.sy(m.d, m.z);
      const a = clamp(m.life / 1.1, 0, 1);
      if (m.kind === 0) {
        // a dandelion seed: a little parachute with a seed hanging under it
        gg.save();
        gg.translate(x, y);
        gg.rotate(Math.sin(m.rot) * 0.5 + this.geo.wx * 0.2);
        const r = m.size;
        gg.strokeStyle = `rgba(255,255,255,${0.8 * a})`;
        gg.lineWidth = Math.max(0.6, r * 0.12);
        for (let i = 0; i < 7; i++) {
          const ang = -Math.PI * 0.5 + (i / 6 - 0.5) * 2.1;
          gg.beginPath();
          gg.moveTo(0, 0);
          gg.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
          gg.stroke();
        }
        gg.fillStyle = `rgba(226,214,180,${0.9 * a})`;
        gg.beginPath();
        gg.ellipse(0, r * 0.32, r * 0.1, r * 0.26, 0, 0, Math.PI * 2);
        gg.fill();
        gg.restore();
      } else if (m.kind === 1) {
        gg.save();
        gg.translate(x, y);
        gg.rotate(m.rot);
        const r = m.size;
        gg.fillStyle = `rgba(${180 + m.tone * 50},${120 + m.tone * 40},${60 + m.tone * 30},${0.95 * a})`;
        gg.beginPath();
        gg.ellipse(0, 0, r, r * (0.3 + 0.5 * Math.abs(Math.cos(m.rot * 1.7))), 0, 0, Math.PI * 2);
        gg.fill();
        gg.restore();
      } else {
        gg.fillStyle = `rgba(232,226,198,${0.42 * a})`;
        gg.beginPath();
        gg.arc(x, y, m.size * (0.6 + s * 0.6), 0, Math.PI * 2);
        gg.fill();
      }
    }
  }

  /** the gust made visible: long soft streaks racing across the field */
  private drawWindStreaks(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    const a = clamp((this.wind - 0.42) * 1.5, 0, 1);
    if (a < 0.02) return;
    gg.save();
    gg.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const d = 0.3 + ((i * 0.37) % 1) * 0.85;
      const sc = this.scaleAt(d);
      const speed = g.unit * (0.5 + sc * 1.3) * (0.8 + this.wind);
      const span = g.w * 1.5;
      const x = ((this.t * speed + i * 211) % span) - g.w * 0.25;
      const y = this.fieldY(d) - g.unit * (0.02 + ((i * 0.23) % 1) * 0.16) * sc;
      const len = g.unit * (0.12 + ((i * 0.41) % 1) * 0.2) * sc * (0.6 + this.wind);
      gg.strokeStyle = `rgba(255,255,255,${0.1 * a * (0.5 + sc * 0.5)})`;
      gg.lineWidth = Math.max(1, g.unit * 0.006 * sc);
      gg.beginPath();
      gg.moveTo(x, y);
      gg.quadraticCurveTo(x + len * 0.5, y - len * 0.1, x + len, y + len * 0.06);
      gg.stroke();
    }
    gg.restore();
  }

  private drawButterfly(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    const f = this.fly;
    const r = g.unit * 0.022;
    const flap = Math.abs(Math.sin(f.flap));
    gg.save();
    gg.translate(f.x, f.y);
    gg.rotate(Math.sin(f.flap * 0.2) * 0.2 + this.wind * 0.2);
    for (const sgn of [-1, 1]) {
      gg.fillStyle = sgn < 0 ? 'rgba(255,196,96,0.92)' : 'rgba(255,214,132,0.92)';
      gg.beginPath();
      gg.ellipse(sgn * r * 0.5 * (0.35 + flap), -r * 0.15, r * (0.35 + flap * 0.45), r * 0.62, sgn * 0.5, 0, Math.PI * 2);
      gg.fill();
      gg.fillStyle = 'rgba(214,120,60,0.6)';
      gg.beginPath();
      gg.ellipse(sgn * r * 0.62 * (0.35 + flap), -r * 0.05, r * 0.14, r * 0.2, 0, 0, Math.PI * 2);
      gg.fill();
    }
    gg.fillStyle = 'rgb(86,62,48)';
    gg.beginPath();
    gg.ellipse(0, 0, r * 0.1, r * 0.4, 0, 0, Math.PI * 2);
    gg.fill();
    gg.restore();
  }

  private drawLight(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    // warm afternoon wash from the sun side
    const warm = this.warm;
    const lg = gg.createLinearGradient(g.sun.x, g.sun.y, g.w * 0.6, g.h);
    lg.addColorStop(0, `rgba(255,236,178,${0.16 * warm})`);
    lg.addColorStop(1, 'rgba(255,228,170,0)');
    gg.fillStyle = lg;
    gg.fillRect(-g.w, -g.h, g.w * 3, g.h * 3);
    if (warm < 0.98) {
      gg.save();
      gg.globalCompositeOperation = 'multiply';
      const c = mix([255, 255, 255], [176, 190, 200], (1 - warm) * 0.8);
      gg.fillStyle = rgb(c);
      gg.fillRect(-g.w, -g.h, g.w * 3, g.h * 3);
      gg.restore();
    }
    const v = gg.createRadialGradient(g.w / 2, g.h * 0.52, Math.min(g.w, g.h) * 0.34, g.w / 2, g.h * 0.52, Math.max(g.w, g.h) * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(20,26,16,0.26)');
    gg.fillStyle = v;
    gg.fillRect(-g.w, -g.h, g.w * 3, g.h * 3);
  }

  // ------------------------------------------------------------ hub tile

  thumbnail(gg: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    const loop = t % 8;
    const flying = loop > 3.2 && loop < 6.6;
    const ft = clamp((loop - 3.2) / 3.4, 0, 1);
    const wind = flying ? hump(ft) * 0.9 + 0.1 : 0.12;

    const sky = gg.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, 'rgb(98,172,228)');
    sky.addColorStop(0.55, 'rgb(178,220,242)');
    sky.addColorStop(1, 'rgb(226,238,232)');
    gg.fillStyle = sky;
    gg.fillRect(0, 0, w, h);
    gg.fillStyle = 'rgba(255,248,214,0.9)';
    gg.beginPath();
    gg.arc(w * 0.18, h * 0.18, h * 0.08, 0, Math.PI * 2);
    gg.fill();
    // cloud
    gg.fillStyle = 'rgba(255,255,255,0.95)';
    const cx = ((t * (0.02 + wind * 0.06)) % 1.4 - 0.2) * w;
    for (const p of [[-0.5, 0, 0.5], [0, -0.25, 0.7], [0.55, 0.02, 0.5]]) {
      gg.beginPath();
      gg.arc(cx + p[0] * h * 0.22, h * 0.22 + p[1] * h * 0.16, h * 0.13 * p[2], 0, Math.PI * 2);
      gg.fill();
    }
    // hills + field
    gg.fillStyle = 'rgb(140,182,142)';
    gg.beginPath();
    gg.moveTo(0, h * 0.6);
    for (let i = 0; i <= 8; i++) gg.lineTo((w * i) / 8, h * 0.56 - Math.sin(i * 0.9) * h * 0.04);
    gg.lineTo(w, h * 0.7);
    gg.lineTo(0, h * 0.7);
    gg.closePath();
    gg.fill();
    const gr = gg.createLinearGradient(0, h * 0.58, 0, h);
    gr.addColorStop(0, 'rgb(158,200,132)');
    gr.addColorStop(1, 'rgb(104,152,86)');
    gg.fillStyle = gr;
    gg.fillRect(0, h * 0.58, w, h * 0.42);

    // grass ripple
    gg.strokeStyle = 'rgba(74,116,64,0.55)';
    for (let i = 0; i < 30; i++) {
      const x = (i / 30) * w + (i % 3) * 3;
      const y = h * (0.72 + ((i * 37) % 10) / 34);
      const bl = h * 0.06;
      const bend = Math.sin(t * 3 - x * 0.05) * wind * bl * 0.9;
      gg.lineWidth = 1.6;
      gg.beginPath();
      gg.moveTo(x, y);
      gg.quadraticCurveTo(x + bend * 0.4, y - bl * 0.6, x + bend, y - bl);
      gg.stroke();
    }

    // bench + kid
    const bx = w * 0.34;
    const by = h * 0.86;
    const u = h * 0.5;
    gg.fillStyle = 'rgb(186,134,86)';
    gg.fillRect(bx - u * 0.3, by - u * 0.3, u * 0.6, u * 0.06);
    gg.fillRect(bx - u * 0.3, by - u * 0.16, u * 0.6, u * 0.05);
    gg.fillStyle = 'rgb(84,92,96)';
    gg.fillRect(bx - u * 0.28, by - u * 0.32, u * 0.03, u * 0.32);
    gg.fillRect(bx + u * 0.25, by - u * 0.32, u * 0.03, u * 0.32);
    // kid
    gg.fillStyle = 'rgb(246,176,88)';
    gg.beginPath();
    gg.ellipse(bx, by - u * 0.25, u * 0.105, u * 0.135, 0, 0, Math.PI * 2);
    gg.fill();
    const hy = by - u * 0.43;
    gg.fillStyle = 'rgb(86,62,48)';
    gg.beginPath();
    gg.arc(bx, hy, u * 0.095, 0, Math.PI * 2);
    gg.fill();
    gg.fillStyle = 'rgb(248,210,176)';
    gg.beginPath();
    gg.arc(bx, hy + u * 0.012, u * 0.082, 0, Math.PI * 2);
    gg.fill();
    gg.fillStyle = 'rgb(58,44,40)';
    for (const sgn of [-1, 1]) {
      gg.beginPath();
      gg.arc(bx + sgn * u * 0.033, hy + u * 0.008, u * 0.012, 0, Math.PI * 2);
      gg.fill();
    }
    gg.strokeStyle = 'rgb(168,96,86)';
    gg.lineWidth = Math.max(1, u * 0.012);
    gg.beginPath();
    gg.arc(bx, hy + u * 0.028, u * 0.03, 0.4, Math.PI - 0.4);
    gg.stroke();

    // the straw hat: on the head, then up and away
    const hx = flying ? lerp(bx, w * 1.05, ft) : bx;
    const hyy = flying ? hy - u * 0.2 - hump(ft) * h * 0.34 : hy - u * 0.13;
    const R = u * 0.2;
    const spin = flying ? ft * 16 : 0.1;
    const sq = flying ? Math.abs(Math.cos(ft * 11)) * 0.8 + 0.16 : 0.34;
    gg.save();
    gg.translate(hx, hyy);
    gg.rotate(spin);
    gg.fillStyle = 'rgb(230,196,132)';
    gg.beginPath();
    gg.ellipse(0, 0, R, R * sq, 0, 0, Math.PI * 2);
    gg.fill();
    gg.strokeStyle = 'rgba(172,134,78,0.8)';
    gg.lineWidth = Math.max(1, R * 0.08);
    gg.stroke();
    const e = Math.sqrt(Math.max(0, 1 - sq * sq));
    gg.fillStyle = 'rgb(246,222,166)';
    gg.beginPath();
    gg.ellipse(0, -R * 0.55 * e, R * 0.56, R * 0.56 * sq, 0, 0, Math.PI * 2);
    gg.fill();
    gg.fillStyle = 'rgb(196,84,78)';
    gg.fillRect(-R * 0.56, -R * 0.3 * e, R * 1.12, Math.max(1.5, R * 0.16 * e));
    gg.restore();

    // the dog waiting on the path
    const dx = w * 0.78;
    const dy = h * 0.9;
    const du = h * 0.3;
    gg.fillStyle = 'rgb(214,164,96)';
    gg.beginPath();
    gg.ellipse(dx, dy - du * 0.16, du * 0.2, du * 0.17, 0, 0, Math.PI * 2);
    gg.fill();
    gg.beginPath();
    gg.arc(dx - du * 0.17, dy - du * 0.38, du * 0.14, 0, Math.PI * 2);
    gg.fill();
    gg.fillStyle = 'rgb(176,124,68)';
    gg.beginPath();
    gg.ellipse(dx - du * 0.07, dy - du * 0.47, du * 0.07, du * 0.13, 0.2, 0, Math.PI * 2);
    gg.fill();
    gg.fillStyle = 'rgb(58,44,42)';
    gg.beginPath();
    gg.arc(dx - du * 0.26, dy - du * 0.4, du * 0.035, 0, Math.PI * 2);
    gg.fill();
    // wagging tail
    const wag = Math.sin(t * 9) * 0.5;
    gg.strokeStyle = 'rgb(176,124,68)';
    gg.lineWidth = du * 0.07;
    gg.lineCap = 'round';
    gg.beginPath();
    gg.moveTo(dx + du * 0.16, dy - du * 0.2);
    gg.quadraticCurveTo(dx + du * 0.3, dy - du * 0.3, dx + du * 0.32 + wag * du * 0.1, dy - du * 0.42);
    gg.stroke();
  }
}

export const episode: Episode = new HatWind();
