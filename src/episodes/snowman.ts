/**
 * F. 雪だるまと日差し — snowman.
 *
 * A cold overcast garden. Roll the snowballs along the ground — they turn,
 * they grow, they leave a cleared stripe of darker earth behind them. Stack
 * them, push the bucket on, plant the carrot, and the face arrives by itself.
 *
 * Then the cloud lid slides off the sky. The white light turns butter-yellow,
 * the shadows sharpen, a drop gathers on the brim and lets go — and the child
 * knows, several seconds before it starts, exactly what is about to happen.
 *
 * Three ways out, all of them the same idea: take the sun away. Drag the whole
 * wobbling snowman into the shade of the fir; plant the parasol over him; or
 * simply reach up into the sky and pull a cloud across the sun.
 *
 * Fail and he becomes a puddle with a hat on it, which is arguably the better
 * ending, and you can start rolling the leftover lump again.
 *
 * Episode-specific code on purpose: no shared engine, no generic physics.
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

// ---------------------------------------------------------------- world

type BallState = 'ground' | 'held' | 'stacked';

interface Ball {
  x: number;
  y: number;
  /** packed radius before melting */
  r: number;
  rot: number;
  state: BallState;
  vy: number;
  /** comic wobble after a heavy ball lands on a light one */
  wob: number;
  wobT: number;
  /** 0..1 how much of it the sun has taken */
  melt: number;
  /** wet highlight, follows the melt but reacts instantly to shade */
  sheen: number;
  /** squash impulse when it lands */
  squash: number;
  grabDX: number;
  grabDY: number;
  rolling: boolean;
  /** silhouette bumpiness so it never looks like a vector circle */
  lumps: number[];
  /** packed-snow speckles, in local polar coords */
  grain: Array<{ a: number; d: number; s: number }>;
  dripT: number;
}

type PropState = 'ground' | 'held' | 'on' | 'fallen';

interface Prop {
  x: number;
  y: number;
  rot: number;
  state: PropState;
  vx: number;
  vy: number;
  vr: number;
  grabDX: number;
  grabDY: number;
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  /** 0 snow powder, 1 water drop, 2 frost sparkle, 3 snow chunk */
  kind: 0 | 1 | 2 | 3;
  spin: number;
  /** a splash droplet: it never splashes again (that way lies infinity) */
  splash?: boolean;
}

interface Trail {
  x: number;
  w: number;
  a: number;
}

interface Flake {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  layer: number;
  ph: number;
}

interface Geo {
  w: number;
  h: number;
  o: Orientation;
  unit: number;
  horizonY: number;
  fenceY: number;
  groundY: number;
  sun: { x: number; y: number };
  /** +1 the sun is on the right, -1 on the left */
  sunSide: 1 | -1;
  tree: { x: number; baseY: number; top: number; spread: number };
  shade: { x: number; y: number; rx: number; ry: number };
  house: { x: number; y: number; w: number; h: number; side: 1 | -1 };
  /** where a fresh snowman ends up if nobody moves it */
  buildX: number;
  ballHome: Array<{ x: number; r: number }>;
  propHome: { hat: { x: number; y: number }; carrot: { x: number; y: number }; peb: Array<{ x: number; y: number }> };
  umbHome: { x: number; y: number };
  cloudHome: { x: number; y: number; r: number };
  branch: { x: number; y: number; dir: 1 | -1 };
}

// ---------------------------------------------------------------- episode

class Snowman implements Episode {
  readonly id = 'snowman';
  readonly title = 'F. 雪だるまと日差し / snowman';

  private ctx!: EpisodeCtx;
  private rng = new Rng(1);
  private noise = makeNoise1d(1);
  private geo!: Geo;

  private balls: Ball[] = [];
  private stack: Ball[] = [];
  private hat!: Prop;
  private carrot!: Prop;
  private pebbles: Prop[] = [];
  private umbrella!: Prop;
  private bits: Bit[] = [];
  private trail: Trail[] = [];
  private flakes: Flake[] = [];
  private hills: Array<{ x: number; y: number; r: number; row: number }> = [];
  private farTrees: Array<{ x: number; s: number; row: number }> = [];

  // sky / light
  private t = 0;
  private lid = 1; // overcast cloud lid, 1 closed 0 open
  private lidTarget = 1;
  private sunUp = 0; // how much sun is reaching the garden
  private sunUpTarget = 0;
  private warm = 0; // colour temperature, 0 cold white, 1 buttery
  private sharp = 0; // shadow crispness
  private cloud = { x: 0, y: 0, r: 0, vx: 0, held: false, grabDX: 0, grabDY: 0 };
  private cloudSeeds: Array<{ x: number; y: number; r: number }> = [];
  private lidSeeds: Array<{ x: number; y: number; r: number }> = [];

  // snowman
  private snowX = 0;
  private snowLean = 0;
  private snowLeanV = 0;
  private built = false;
  private builtT = -1;
  private face = 0; // 0..1 face fade-in
  private blink = 0;
  private blinkT = 2;
  private smile = 0;
  private glance = 0;
  private relief = 0; // 0..1 "aah" after being saved
  private firm = 0;
  private puddle = 0;
  private wetGround = 0;
  private heat = 0; // current melting pressure 0..1
  private shadeCover = 0;
  private savedFor = 0;
  private lastDripAt = -99;
  private meltedMass = 0;

  // bird
  private bird = { x: 0, y: 0, vx: 0, vy: 0, state: 'away' as 'away' | 'fly' | 'branch' | 'tohat' | 'hat', t: 0, hop: 0, shiver: 0, flap: 0 };
  private branchSnow = 1;
  private clumpDone = false;

  // beats
  private ending: 'none' | 'saved' | 'melted' = 'none';
  private quiet = 0;
  private comicT = 0;
  private troubleT = 0;
  private fade = 1;
  private fadeOut = false;
  private foreDrip = -1; // the telegraphed brim drop: -1 none, else 0..1 swell
  private foreDripY = 0;
  private foreDripFall = 0;
  private replayArmed = false;

  // camera
  private camZ = 1;
  private camZT = 1;
  private camX = 0;
  private camY = 0;
  private camYT = 0;

  private held: Ball | Prop | null = null;
  private heldKind: 'ball' | 'stack' | 'hat' | 'carrot' | 'umbrella' | 'cloud' | null = null;
  private px = 0;
  private py = 0;
  private crunch = 0;

  // ---------------------------------------------------------------- setup

  init(ctx: EpisodeCtx): void {
    this.ctx = ctx;
    this.rng = ctx.rng;
    this.rng.reset();
    this.noise = makeNoise1d(this.rng.seed ^ 0x51c3);
    this.t = 0;
    this.fade = 1;
    this.fadeOut = false;
    this.bits = [];
    this.trail = [];
    this.held = null;
    this.heldKind = null;

    this.cloudSeeds = [];
    for (let i = 0; i < 9; i++) {
      const f = i / 8;
      this.cloudSeeds.push({
        x: -1 + f * 2 + this.rng.range(-0.1, 0.1),
        y: this.rng.range(-0.26, 0.1) * (1 - Math.abs(f - 0.5) * 1.4),
        r: (0.44 + 0.56 * Math.sin(Math.PI * f) ** 0.6) * this.rng.range(0.84, 1.08),
      });
    }
    this.lidSeeds = [];
    for (let i = 0; i < 54; i++) {
      this.lidSeeds.push({
        x: this.rng.range(-0.15, 1.15),
        y: this.rng.range(0, 1),
        r: this.rng.range(0.75, 1.5),
      });
    }

    this.buildBalls();
    this.hat = this.newProp();
    this.carrot = this.newProp();
    this.pebbles = [this.newProp(), this.newProp()];
    this.umbrella = this.newProp();
    if (this.geo) this.seedScenery();
    this.enterPhase('establish');
  }

  private newProp(): Prop {
    return { x: 0, y: 0, rot: 0, state: 'ground', vx: 0, vy: 0, vr: 0, grabDX: 0, grabDY: 0 };
  }

  private newBall(r: number): Ball {
    const lumps: number[] = [];
    for (let i = 0; i < 9; i++) lumps.push(this.rng.range(-0.042, 0.042));
    const grain: Array<{ a: number; d: number; s: number }> = [];
    for (let i = 0; i < 16; i++) {
      grain.push({ a: this.rng.range(0, Math.PI * 2), d: Math.sqrt(this.rng.next()) * 0.86, s: this.rng.range(0.4, 1) });
    }
    return {
      x: 0,
      y: 0,
      r,
      rot: this.rng.range(0, 6),
      state: 'ground',
      vy: 0,
      wob: 0,
      wobT: 0,
      melt: 0,
      sheen: 0,
      squash: 0,
      grabDX: 0,
      grabDY: 0,
      rolling: false,
      lumps,
      grain,
      dripT: this.rng.range(0, 0.5),
    };
  }

  private buildBalls(): void {
    const u = this.geo ? this.geo.unit : 390;
    this.balls = [this.newBall(u * 0.102), this.newBall(u * 0.076), this.newBall(u * 0.055)];
    this.stack = [];
  }

  private seedScenery(): void {
    const r = new Rng((this.rng.seed ^ 0x2f10) >>> 0);
    this.hills = [];
    for (let row = 0; row < 2; row++) {
      const n = 5 + row * 2;
      for (let i = 0; i <= n; i++) {
        this.hills.push({
          x: (i / n) * 1.3 - 0.15 + r.range(-0.04, 0.04),
          y: r.range(0.2, 1),
          r: r.range(0.5, 1.1),
          row,
        });
      }
    }
    this.farTrees = [];
    for (let i = 0; i < 16; i++) {
      this.farTrees.push({ x: r.range(-0.05, 1.05), s: r.range(0.6, 1.25), row: r.next() < 0.5 ? 0 : 1 });
    }
    this.flakes = [];
    for (let i = 0; i < 90; i++) this.flakes.push(this.newFlake(true));
  }

  private newFlake(anywhere: boolean): Flake {
    const g = this.geo;
    const layer = this.rng.next() < 0.45 ? 0 : this.rng.next() < 0.6 ? 1 : 2;
    return {
      x: this.rng.range(-g.w * 0.1, g.w * 1.1),
      y: anywhere ? this.rng.range(-g.h * 0.1, g.h) : -this.rng.range(6, g.h * 0.2),
      vx: this.rng.range(-8, 4),
      vy: (12 + layer * 16) * this.rng.range(0.8, 1.25),
      r: (0.9 + layer * 0.9) * this.rng.range(0.8, 1.3),
      layer,
      ph: this.rng.range(0, 7),
    };
  }

  // ---------------------------------------------------------------- layout

  layout(o: Orientation, w: number, h: number): void {
    const prev = this.geo;
    const unit = Math.min(w, h);
    const g: Geo = {
      w,
      h,
      o,
      unit,
      horizonY: 0,
      fenceY: 0,
      groundY: 0,
      sun: { x: 0, y: 0 },
      sunSide: 1,
      tree: { x: 0, baseY: 0, top: 0, spread: 0 },
      shade: { x: 0, y: 0, rx: 0, ry: 0 },
      house: { x: 0, y: 0, w: 0, h: 0, side: 1 },
      buildX: 0,
      ballHome: [],
      propHome: { hat: { x: 0, y: 0 }, carrot: { x: 0, y: 0 }, peb: [] },
      umbHome: { x: 0, y: 0 },
      cloudHome: { x: 0, y: 0, r: 0 },
      branch: { x: 0, y: 0, dir: 1 },
    };

    if (o === 'portrait') {
      // sun top-right, fir bottom-left, snowman in the middle: the shade is a
      // short pull to the left, straight down the reading direction of the eye.
      g.horizonY = h * 0.5;
      g.fenceY = h * 0.632;
      g.groundY = h * 0.795;
      g.sun = { x: w * 0.8, y: h * 0.113 };
      g.sunSide = 1;
      g.tree = { x: w * 0.2, baseY: h * 0.715, top: h * 0.345, spread: w * 0.4 };
      g.shade = { x: w * 0.265, y: g.groundY - unit * 0.012, rx: unit * 0.25, ry: unit * 0.082 };
      g.house = { x: w * 0.58, y: g.fenceY - h * 0.135, w: w * 0.56, h: h * 0.135, side: 1 };
      g.buildX = w * 0.62;
      g.ballHome = [
        { x: w * 0.4, r: unit * 0.108 },
        { x: w * 0.55, r: unit * 0.08 },
        { x: w * 0.7, r: unit * 0.06 },
      ];
      g.propHome = {
        hat: { x: w * 0.22, y: g.groundY + unit * 0.128 },
        carrot: { x: w * 0.36, y: g.groundY + unit * 0.148 },
        peb: [
          { x: w * 0.5, y: g.groundY + unit * 0.132 },
          { x: w * 0.555, y: g.groundY + unit * 0.14 },
        ],
      };
      g.umbHome = { x: w * 0.845, y: g.groundY - unit * 0.01 };
      g.cloudHome = { x: w * 0.3, y: h * 0.135, r: unit * 0.12 };
      g.branch = { x: w * 0.2, y: h * 0.5, dir: -1 };
    } else {
      // sun top-left, fir on the right, snowman centre-left.
      g.horizonY = h * 0.44;
      g.fenceY = h * 0.615;
      g.groundY = h * 0.79;
      g.sun = { x: w * 0.13, y: h * 0.16 };
      g.sunSide = -1;
      g.tree = { x: w * 0.79, baseY: h * 0.715, top: h * 0.135, spread: w * 0.155 };
      g.shade = { x: w * 0.745, y: g.groundY - unit * 0.012, rx: unit * 0.25, ry: unit * 0.08 };
      g.house = { x: -w * 0.03, y: g.fenceY - h * 0.23, w: w * 0.3, h: h * 0.23, side: -1 };
      g.buildX = w * 0.52;
      g.ballHome = [
        { x: w * 0.33, r: unit * 0.108 },
        { x: w * 0.42, r: unit * 0.08 },
        { x: w * 0.505, r: unit * 0.06 },
      ];
      g.propHome = {
        hat: { x: w * 0.6, y: g.groundY + unit * 0.11 },
        carrot: { x: w * 0.663, y: g.groundY + unit * 0.135 },
        peb: [
          { x: w * 0.715, y: g.groundY + unit * 0.115 },
          { x: w * 0.75, y: g.groundY + unit * 0.124 },
        ],
      };
      g.umbHome = { x: w * 0.22, y: g.groundY - unit * 0.008 };
      g.cloudHome = { x: w * 0.42, y: h * 0.17, r: unit * 0.13 };
      g.branch = { x: w * 0.79, y: h * 0.36, dir: 1 };
    }

    this.geo = g;
    if (!this.balls.length) return;
    if (!this.hills.length) this.seedScenery();

    // keep everything where it was, proportionally
    const sx = prev ? w / prev.w : 1;
    const su = prev ? unit / prev.unit : 1;
    for (const b of this.balls) {
      b.r *= su;
      if (b.state === 'ground') {
        b.x = prev ? clamp(b.x * sx, unit * 0.06, w - unit * 0.06) : 0;
        b.y = g.groundY;
      }
    }
    if (!prev) this.homeBalls();
    this.snowX = prev ? clamp(this.snowX * sx, w * 0.08, w * 0.92) : g.buildX;
    for (const t of this.trail) {
      t.x *= sx;
      t.w *= su;
    }
    for (const p of [this.hat, this.carrot, this.umbrella, ...this.pebbles]) {
      if (p.state === 'ground' || p.state === 'fallen') {
        p.x = prev ? p.x * sx : p.x;
        p.y = prev ? g.groundY + (p.y - prev.groundY) * su : p.y;
      }
    }
    if (!prev) this.homeProps();
    this.cloud.r = g.cloudHome.r;
    if (prev) this.cloud.x *= sx;
    else {
      this.cloud.x = g.cloudHome.x;
      this.cloud.y = g.cloudHome.y;
    }
    this.cloud.y = g.cloudHome.y + (prev ? 0 : 0);
    this.layoutStack();
    for (const f of this.flakes) f.x = ((f.x % w) + w) % w;
  }

  private homeBalls(): void {
    const g = this.geo;
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      const hpos = g.ballHome[Math.min(i, g.ballHome.length - 1)];
      b.r = hpos.r;
      b.x = hpos.x;
      b.y = g.groundY;
      b.state = 'ground';
      b.melt = 0;
      b.sheen = 0;
      b.wob = 0;
      b.squash = 0;
      b.rot = i * 1.7;
    }
    this.stack = [];
  }

  private homeProps(): void {
    const g = this.geo;
    const put = (p: Prop, x: number, y: number, rot: number) => {
      p.x = x;
      p.y = y;
      p.rot = rot;
      p.state = 'ground';
      p.vx = 0;
      p.vy = 0;
      p.vr = 0;
    };
    put(this.hat, g.propHome.hat.x, g.propHome.hat.y, -0.22);
    put(this.carrot, g.propHome.carrot.x, g.propHome.carrot.y, 1.45);
    put(this.pebbles[0], g.propHome.peb[0].x, g.propHome.peb[0].y, 0.3);
    put(this.pebbles[1], g.propHome.peb[1].x, g.propHome.peb[1].y, -0.5);
    put(this.umbrella, g.umbHome.x, g.umbHome.y, g.o === 'portrait' ? 0.3 : -0.3);
  }

  // ---------------------------------------------------------------- stack

  /** radii after the sun has had its way: wider, lower, wetter */
  private rx(b: Ball): number {
    return b.r * (1 - b.melt * 0.58) * (1 + b.melt * 0.5) * (1 + b.squash * 0.16);
  }

  private ry(b: Ball): number {
    return b.r * (1 - b.melt * 0.58) * (1 - b.melt * 0.3) * (1 - b.squash * 0.2);
  }

  private layoutStack(): void {
    if (!this.geo) return;
    let y = this.geo.groundY;
    for (let i = 0; i < this.stack.length; i++) {
      const b = this.stack[i];
      const ry = this.ry(b);
      const wobX = Math.sin(b.wobT * 9.5) * b.wob * this.geo.unit * 0.05 * (i + 1) * 0.6;
      b.y = y - ry * (i === 0 ? 0.88 : 0.82);
      b.x = this.snowX + wobX + this.snowLean * (i + 1) * this.geo.unit * 0.02;
      y = b.y - ry * 0.82;
    }
  }

  private top(): Ball | null {
    return this.stack.length ? this.stack[this.stack.length - 1] : null;
  }

  /** the point on the top ball where the face lives */
  private facePt(): { x: number; y: number; r: number } | null {
    const t = this.top();
    if (!t) return null;
    return { x: t.x, y: t.y - this.ry(t) * 0.08, r: this.rx(t) };
  }

  private hatSeat(): { x: number; y: number; rot: number } | null {
    const t = this.top();
    if (!t) return null;
    const slide = this.hatSlide;
    return {
      x: t.x + slide * this.rx(t) * 0.95,
      y: t.y - this.ry(t) * (0.84 - Math.abs(slide) * 0.25),
      rot: slide * 0.7 + this.snowLean * 0.1,
    };
  }

  private hatSlide = 0;

  // ---------------------------------------------------------------- phases

  enterPhase(name: PhaseName): void {
    const ph = this.ctx.phase;
    if (ph.name !== name) ph.set(name);
    ph.intervening = name === 'trouble';
    this.quiet = 0;
    this.comicT = 0;
    this.troubleT = 0;
    this.savedFor = 0;
    this.replayArmed = false;
    this.bits = [];
    this.held = null;
    this.heldKind = null;
    this.cloud.held = false;
    this.foreDrip = -1;
    this.foreDripFall = 0;
    this.clumpDone = false;
    this.meltedMass = 0;

    const cold = () => {
      this.ending = 'none';
      this.lid = this.lidTarget = 1;
      this.sunUp = this.sunUpTarget = 0;
      this.warm = 0;
      this.sharp = 0;
      this.puddle = 0;
      this.wetGround = 0;
      this.relief = 0;
      this.firm = 0;
      this.glance = 0;
      this.smile = 0;
      this.hatSlide = 0;
      this.branchSnow = 1;
      this.trail = [];
      this.snowLean = 0;
      this.snowLeanV = 0;
      this.cloud.x = this.geo.cloudHome.x;
      this.cloud.y = this.geo.cloudHome.y;
      this.cloud.vx = this.geo.unit * 0.0006;
      this.bird.state = 'away';
      this.bird.t = 0;
      this.homeBalls();
      this.homeProps();
      this.snowX = this.geo.buildX;
      this.built = false;
      this.builtT = -1;
      this.face = 0;
    };

    const sunny = () => {
      this.lid = this.lidTarget = 0.08;
      this.sunUp = this.sunUpTarget = 1;
      this.warm = 1;
      this.sharp = 1;
      this.cloud.x = this.geo.cloudHome.x - this.geo.w * 0.12;
      this.bird.state = 'branch';
      this.bird.x = this.geo.branch.x + this.geo.branch.dir * this.geo.unit * 0.1;
      this.bird.y = this.geo.branch.y - this.geo.unit * 0.028;
      this.branchSnow = 0;
      this.clumpDone = true;
    };

    switch (name) {
      case 'establish':
        cold();
        this.camZ = 1.07;
        this.camZT = 1;
        this.camY = this.geo.h * 0.015;
        this.camYT = 0;
        break;

      case 'action':
        cold();
        this.camZ = this.camZT = 1;
        this.camY = this.camYT = 0;
        break;

      case 'foreshadow':
        this.enterPhase('action');
        ph.set('foreshadow');
        this.buildSnowman();
        this.lidTarget = 0.08;
        this.sunUpTarget = 1;
        this.bird.state = 'fly';
        this.bird.t = 0;
        this.bird.x = this.geo.branch.x - this.geo.branch.dir * this.geo.w * 0.7;
        this.bird.y = this.geo.branch.y - this.geo.unit * 0.24;
        break;

      case 'trouble':
        this.enterPhase('action');
        ph.set('trouble');
        ph.intervening = true;
        this.buildSnowman();
        sunny();
        for (const b of this.stack) b.melt = 0.05;
        this.puddle = 0.05;
        this.wetGround = 0.5;
        break;

      case 'resolve':
        this.enterPhase('trouble');
        ph.set('resolve');
        ph.intervening = false;
        this.ending = 'saved';
        this.snowX = this.geo.shade.x;
        for (const b of this.stack) {
          b.melt = 0.1;
          b.sheen = 0;
        }
        this.relief = 1;
        this.smile = 1;
        this.layoutStack();
        break;

      case 'comic':
        this.enterPhase('resolve');
        ph.set('comic');
        this.comicT = 0;
        this.bird.state = 'tohat';
        this.bird.t = 0;
        break;

      case 'settle':
        this.enterPhase('comic');
        ph.set('settle');
        this.comicT = 4;
        this.bird.state = 'hat';
        this.bird.t = 2;
        break;
    }
    this.layoutStack();
  }

  /** instant, lived-in snowman: three balls stacked, hat, carrot, face */
  private buildSnowman(): void {
    this.homeBalls();
    this.stack = [this.balls[0], this.balls[1], this.balls[2]];
    for (const b of this.stack) {
      b.state = 'stacked';
      b.melt = 0;
      b.wob = 0;
      b.squash = 0;
    }
    this.snowX = this.geo.buildX;
    this.layoutStack();
    this.hat.state = 'on';
    this.carrot.state = 'on';
    this.pebbles[0].state = 'on';
    this.pebbles[1].state = 'on';
    this.hatSlide = 0;
    this.built = true;
    this.builtT = 2;
    this.face = 1;
    this.smile = 1;
    // a rolled-in trail so the ground remembers the work
    this.trail = [];
    const g = this.geo;
    for (let i = 0; i < 26; i++) {
      const f = i / 25;
      this.trail.push({ x: lerp(g.ballHome[0].x, g.buildX, f), w: lerp(g.unit * 0.1, g.unit * 0.18, f), a: 1 });
    }
  }

  /** forward transition during real play: keep the world, arm the next beat */
  private advance(name: PhaseName): void {
    const ph = this.ctx.phase;
    ph.set(name);
    ph.intervening = name === 'trouble';
    switch (name) {
      case 'foreshadow':
        this.lidTarget = 0.08;
        this.sunUpTarget = 1;
        this.ctx.audio.whoosh(0.45, 1.8);
        this.bird.state = 'fly';
        this.bird.t = 0;
        this.bird.x = this.geo.branch.x - this.geo.branch.dir * this.geo.w * 0.7;
        this.bird.y = this.geo.branch.y - this.geo.unit * 0.24;
        break;
      case 'trouble':
        this.troubleT = 0;
        break;
      case 'resolve':
        ph.intervening = false;
        if (this.ending === 'saved') {
          this.relief = 0;
          this.firm = 1;
          this.ctx.audio.bloom();
          for (let i = 0; i < 14; i++) this.puff(this.snowX, this.geo.groundY - this.geo.unit * 0.12, 0.7);
        } else {
          this.ctx.audio.flump(1);
        }
        break;
      case 'comic':
        this.comicT = 0;
        this.bird.state = 'tohat';
        this.bird.t = 0;
        break;
      default:
        break;
    }
  }

  private leave(): void {
    this.fadeOut = true;
  }

  // ---------------------------------------------------------------- update

  update(dt: number): void {
    this.t += dt;
    const ph = this.ctx.phase;
    ph.update(dt);

    this.updateBeats(dt);
    this.updateSky(dt);
    this.updateShade();
    this.updateBalls(dt);
    this.updateProps(dt);
    this.updateBird(dt);
    this.updateBits(dt);
    this.updateFlakes(dt);
    this.updateCamera(dt);
    this.updateSound();

    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 0.15;
      this.blinkT = this.rng.range(2.6, 6);
    }
    this.blink = Math.max(0, this.blink - dt);

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

  private isBuilt(): boolean {
    return this.stack.length >= 2 && this.hat.state === 'on' && this.carrot.state === 'on';
  }

  private updateBeats(dt: number): void {
    const ph = this.ctx.phase;
    switch (ph.name) {
      case 'establish':
        if (ph.t > 2.8 && !this.held) this.advance('action');
        break;

      case 'action': {
        if (this.isBuilt() && !this.held) {
          this.quiet += dt;
          if (this.builtT < 0) {
            this.builtT = 0;
            this.ctx.audio.bloom();
            this.frostSparkle();
          }
          if (this.quiet > 1.5) this.advance('foreshadow');
        } else {
          this.quiet = 0;
        }
        break;
      }

      case 'foreshadow': {
        const t = ph.t;
        // the brim drop: swells for a second, hangs, lets go
        if (t > 3.3 && this.foreDrip < 0 && this.foreDripFall <= 0) this.foreDrip = 0;
        if (this.foreDrip >= 0 && this.foreDripFall <= 0) {
          this.foreDrip = Math.min(1, this.foreDrip + dt * 0.85);
          if (this.foreDrip >= 1) {
            this.foreDripFall = 1;
            const s = this.hatSeat();
            if (s) {
              this.bits.push({
                x: s.x + this.geo.unit * 0.05 * this.geo.sunSide,
                y: this.foreDripY,
                vx: 0,
                vy: 12,
                life: 1.6,
                max: 1.6,
                r: this.geo.unit * 0.009,
                kind: 1,
                spin: 0,
              });
            }
            this.foreDrip = -1;
          }
        }
        if (t > 6.2) this.advance('trouble');
        break;
      }

      case 'trouble': {
        this.troubleT += dt;
        if (this.shadeCover > 0.86 || this.sunUp < 0.22) this.savedFor += dt;
        else this.savedFor = 0;
        if (this.savedFor > 1.1 && this.stack.length >= 2) {
          this.ending = 'saved';
          this.advance('resolve');
        } else if (this.stack.length <= 1 && (this.stack[0]?.melt ?? 1) >= 0.78) {
          this.ending = 'melted';
          this.advance('resolve');
        }
        break;
      }

      case 'resolve': {
        if (this.ending === 'saved') {
          this.relief = Math.min(1, this.relief + dt * 1.6);
          if (ph.t > 2.2) this.advance('comic');
        } else if (ph.t > 3) this.advance('comic');
        break;
      }

      case 'comic': {
        this.comicT += dt;
        // saved: he looks up at the sun, then back at you, as if to check
        const g1 = smooth((this.comicT - 0.7) / 0.35) * (1 - smooth((this.comicT - 1.75) / 0.3));
        const g2 = smooth((this.comicT - 2.5) / 0.25) * (1 - smooth((this.comicT - 3.05) / 0.3));
        this.glance = this.ending === 'saved' ? Math.max(g1, g2 * 0.6) : 0;
        if (this.comicT > 3.6) this.advance('settle');
        break;
      }

      case 'settle':
        // after a melt the sky quietly closes again, the snow comes back, and
        // the leftover lump is just a snowball waiting to be rolled
        if (this.ending === 'melted' && ph.t > 3.2 && this.sunUpTarget > 0) {
          this.lidTarget = 1;
          this.sunUpTarget = 0;
          this.ctx.audio.whoosh(0.35, 1.8);
        }
        if (ph.t > (this.ending === 'melted' ? 13 : 6.5) && !this.held && !this.replayArmed) this.leave();
        break;
    }
  }

  private updateSky(dt: number): void {
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    this.lid += (this.lidTarget - this.lid) * k(0.52);
    // the drifting cloud can sit in front of the sun
    const g = this.geo;
    const over = clamp(1 - Math.abs(this.cloud.x - g.sun.x) / (this.cloud.r * 1.35), 0, 1);
    const yOver = clamp(1 - Math.abs(this.cloud.y - g.sun.y) / (this.cloud.r * 1.6), 0, 1);
    const blocked = smooth(over * yOver * 1.25);
    const want = this.sunUpTarget * (1 - blocked) * (1 - smooth(this.lid * 1.35));
    // the sun answers a blocking cloud within a frame or two; it returns slowly
    this.sunUp += (want - this.sunUp) * k(want < this.sunUp ? 7.5 : 1.1);
    this.warm += (this.sunUpTarget * (1 - this.lid) - this.warm) * k(0.55);
    this.sharp += (this.sunUp - this.sharp) * k(1.4);

    if (!this.cloud.held) {
      this.cloud.x += this.cloud.vx * 60 * dt;
      if (this.cloud.x > g.w + this.cloud.r * 1.6) this.cloud.x = -this.cloud.r * 1.6;
      if (this.cloud.x < -this.cloud.r * 1.8) this.cloud.x = g.w + this.cloud.r * 1.5;
      this.cloud.y += Math.sin(this.t * 0.4) * dt * 2;
    }
  }

  private shadeAt(x: number): number {
    const g = this.geo;
    // the fir's pool of shade
    const d = Math.abs(x - g.shade.x);
    let c = clamp(1 - (d - g.shade.rx * 0.55) / (g.shade.rx * 0.5), 0, 1);
    // the parasol carries its own pool of shade wherever it goes
    const ux = this.umbShadeX();
    const ur = this.geo.unit * 0.175;
    const du = Math.abs(x - ux);
    c = Math.max(c, clamp(1 - (du - ur * 0.3) / (ur * 0.7), 0, 1));
    return c;
  }

  private umbShadeX(): number {
    const g = this.geo;
    const lift = Math.max(0, g.groundY - this.umbrella.y);
    return this.umbrella.x - g.sunSide * (g.unit * 0.05 + lift * 0.12);
  }

  private updateShade(): void {
    this.shadeCover = this.stack.length ? this.shadeAt(this.snowX) : this.shadeAt(this.geo.buildX);
    this.heat = clamp(this.sunUp * (1 - this.shadeCover), 0, 1);
  }

  private updateBalls(dt: number): void {
    const g = this.geo;
    const melting = this.ctx.phase.at('trouble') && this.ending !== 'saved';
    for (const b of this.balls) {
      b.squash = Math.max(0, b.squash - dt * 4.5);
      b.wobT += dt;
      b.wob = Math.max(0, b.wob - dt * 0.75);

      if (b.state === 'held') {
        const tx = this.px + b.grabDX;
        const ty = this.py + b.grabDY;
        const groundish = ty > g.groundY - b.r * 0.85;
        const nx = clamp(tx, b.r * 0.6, g.w - b.r * 0.6);
        if (groundish) {
          // ROLLING: it sticks to the snow, turns with the distance, and grows
          const dx = nx - b.x;
          b.rolling = true;
          b.x = nx;
          b.y = lerp(b.y, g.groundY, 1 - Math.exp(-dt * 18));
          b.rot += dx / Math.max(6, b.r);
          const dist = Math.abs(dx);
          if (dist > 0.01 && this.ctx.phase.is('action', 'establish')) {
            const rMax = g.unit * 0.135;
            b.r = Math.min(rMax, b.r + dist * 0.14 * (1 - b.r / rMax));
            // rolling packs fresh snow onto a sagging lump: it firms up again
            if (b.melt > 0) {
              b.melt = Math.max(0, b.melt - dist * 0.005);
              b.sheen = Math.max(0, b.sheen - dist * 0.01);
            }
            this.pushTrail(b);
            this.crunch += dist;
            if (this.crunch > g.unit * 0.05) {
              this.crunch = 0;
              this.ctx.audio.drop(this.rng.range(0.24, 0.36));
              for (let i = 0; i < 2; i++) {
                this.bits.push({
                  x: b.x - Math.sign(dx) * b.r * 0.7,
                  y: g.groundY + this.rng.range(-2, 2),
                  vx: -Math.sign(dx) * this.rng.range(10, 60),
                  vy: this.rng.range(-70, -14),
                  life: 0.5,
                  max: 0.5,
                  r: this.rng.range(1, 2.6),
                  kind: 0,
                  spin: 0,
                });
              }
            }
          }
        } else {
          b.rolling = false;
          const lag = 1 - Math.exp(-dt * 20);
          b.x += (nx - b.x) * lag;
          b.y += (ty - b.y) * lag;
          b.rot += (nx - b.x) * 0.002;
        }
        continue;
      }

      if (b.state === 'ground') {
        // settle to the snow
        if (b.y < g.groundY - 0.4) {
          b.vy += 2100 * dt;
          b.y += b.vy * dt;
          if (b.y >= g.groundY) {
            b.y = g.groundY;
            if (b.vy > 90) {
              b.squash = clamp(b.vy / 900, 0.2, 1);
              this.ctx.audio.thump(0.8);
              for (let i = 0; i < 9; i++) this.puff(b.x, g.groundY, 0.8);
            }
            b.vy = 0;
          }
        } else {
          b.y = g.groundY;
          b.vy = 0;
        }
      }

      if (melting && b.state === 'stacked') {
        const rate = this.heat * 0.1 * (g.unit * 0.076 / Math.max(6, b.r));
        const cap = this.stack.length === 1 && this.stack[0] === b ? 0.8 : 1;
        b.melt = Math.min(cap, b.melt + rate * dt);
        b.sheen += (this.heat * 0.85 + b.melt * 0.2 - b.sheen) * (1 - Math.exp(-dt * 2.4));
        if (b.melt > 0.06 && this.heat > 0.1) {
          b.dripT -= dt * (0.5 + this.heat * 1.6 + b.melt);
          if (b.dripT <= 0) {
            b.dripT = this.rng.range(0.35, 1.1);
            this.bits.push({
              x: b.x + this.rng.range(-this.rx(b) * 0.7, this.rx(b) * 0.7),
              y: b.y + this.ry(b) * 0.82,
              vx: this.rng.range(-4, 4),
              vy: 10,
              life: 1.4,
              max: 1.4,
              r: g.unit * 0.0075,
              kind: 1,
              spin: 0,
            });
            if (this.t - this.lastDripAt > 0.4) {
              this.lastDripAt = this.t;
              this.ctx.audio.plip(this.rng.range(0.8, 1.3));
            }
          }
        }
        this.puddle = Math.min(1, this.puddle + this.heat * dt * 0.052);
        this.wetGround = Math.min(1, this.wetGround + this.heat * dt * 0.25);
      } else {
        b.sheen += ((this.ending === 'saved' ? 0 : b.melt * 0.14) - b.sheen) * (1 - Math.exp(-dt * 2.8));
        if (this.ending === 'saved') this.wetGround = Math.max(0, this.wetGround - dt * 0.5);
      }
    }

    // a ball that has finished melting slumps away and lowers the hat
    if (this.ctx.phase.at('trouble') && this.stack.length > 1) {
      const t = this.stack[this.stack.length - 1];
      if (t.melt >= 0.985) {
        this.stack.pop();
        t.state = 'ground';
        t.x = -9999;
        this.meltedMass++;
        this.puddle = Math.min(1, this.puddle + 0.16);
        this.ctx.audio.flump(0.9);
        for (let i = 0; i < 10; i++) {
          this.bits.push({
            x: t.x,
            y: t.y,
            vx: this.rng.range(-40, 40),
            vy: this.rng.range(-20, 40),
            life: 0.8,
            max: 0.8,
            r: this.rng.range(1.5, 3.5),
            kind: 1,
            spin: 0,
          });
        }
        // whatever was up there drops onto the new top
        const nt = this.top();
        if (nt) nt.squash = 0.55;
      }
    }

    // the whole stack leans when you drag it, and rights itself
    const lean = this.snowLean;
    this.snowLeanV += (-lean * 62 - this.snowLeanV * 7.5) * dt;
    this.snowLean += this.snowLeanV * dt;
    this.layoutStack();
  }

  private pushTrail(b: Ball): void {
    const last = this.trail.length ? this.trail[this.trail.length - 1] : null;
    if (last && Math.abs(last.x - b.x) < this.geo.unit * 0.012) {
      last.w = Math.max(last.w, b.r * 1.9);
      return;
    }
    this.trail.push({ x: b.x, w: b.r * 1.9, a: 1 });
    if (this.trail.length > 160) this.trail.shift();
  }

  private puff(x: number, y: number, s: number): void {
    this.bits.push({
      x: x + this.rng.range(-8, 8) * s,
      y: y + this.rng.range(-4, 4),
      vx: this.rng.range(-70, 70) * s,
      vy: this.rng.range(-120, -20) * s,
      life: 0.6 * this.rng.range(0.7, 1.3),
      max: 0.7,
      r: this.rng.range(1.4, 4) * s,
      kind: 0,
      spin: 0,
    });
  }

  private frostSparkle(): void {
    const f = this.facePt();
    if (!f) return;
    for (let i = 0; i < 16; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(0.7, 1.5) * f.r;
      this.bits.push({
        x: f.x + Math.cos(a) * d,
        y: f.y + Math.sin(a) * d * 0.8,
        vx: Math.cos(a) * 8,
        vy: Math.sin(a) * 8 - 10,
        life: this.rng.range(0.6, 1.3),
        max: 1.3,
        r: this.geo.unit * this.rng.range(0.006, 0.014),
        kind: 2,
        spin: this.rng.range(-3, 3),
      });
    }
  }

  private updateProps(dt: number): void {
    const g = this.geo;
    const melt = this.stack.length ? this.stack[this.stack.length - 1].melt : 0;
    const melting = this.ctx.phase.at('trouble') && this.ending !== 'saved';

    // the bucket creeps off a shrinking head
    const slideT = melting ? clamp((melt - 0.18) * 1.5, 0, 1) * 0.9 : 0;
    this.hatSlide += (slideT - this.hatSlide) * (1 - Math.exp(-dt * 1.1));

    for (const p of [this.hat, this.carrot, this.umbrella, ...this.pebbles]) {
      if (p.state === 'held') {
        const lag = 1 - Math.exp(-dt * 22);
        p.x += (this.px + p.grabDX - p.x) * lag;
        p.y += (this.py + p.grabDY - p.y) * lag;
        continue;
      }
      if (p.state === 'ground' || p.state === 'fallen') {
        const rest = p === this.umbrella ? g.groundY - g.unit * 0.008 : p.y;
        if (p.vy !== 0 || p.y < rest - 0.5) {
          p.vy += 1900 * dt;
          p.y += p.vy * dt;
          p.x += p.vx * dt;
          p.rot += p.vr * dt;
          if (p.y >= rest) {
            p.y = rest;
            if (p.vy > 120) {
              this.ctx.audio.flump(0.3);
              for (let i = 0; i < 6; i++) this.puff(p.x, p.y, 0.6);
            }
            p.vy = 0;
            p.vx = 0;
            p.vr = 0;
            if (p !== this.umbrella) p.rot = clamp(p.rot, -1.5, 1.5);
          }
        }
      }
    }

    // the carrot droops, then gives up
    if (this.carrot.state === 'on') {
      if (melting && melt > 0.46) {
        const t = this.top();
        if (melt > 0.7 && t) {
          this.carrot.state = 'fallen';
          const f = this.facePt();
          if (f) {
            this.carrot.x = f.x + g.sunSide * f.r * 0.5;
            this.carrot.y = f.y;
          }
          this.carrot.vy = 20;
          this.carrot.vx = g.sunSide * 12;
          this.carrot.vr = g.sunSide * 2.2;
          this.ctx.audio.thump(1.5);
        }
      }
    }
    // the eyes fall out shortly after
    if (melting && melt > 0.8) {
      for (const pb of this.pebbles) {
        if (pb.state !== 'on') continue;
        const f = this.facePt();
        pb.state = 'fallen';
        if (f) {
          pb.x = f.x + (pb === this.pebbles[0] ? -1 : 1) * f.r * 0.34;
          pb.y = f.y - f.r * 0.12;
        }
        pb.vy = 10;
        pb.vx = (pb === this.pebbles[0] ? -1 : 1) * this.rng.range(14, 34);
        this.ctx.audio.drop(1.6);
      }
    }

    // once nothing is left to sit on, the hat finds the lump
    if (this.hat.state === 'on' && this.stack.length === 0) {
      this.hat.state = 'ground';
      this.hat.y = g.groundY;
      this.hat.vy = 40;
    }

    // small relief bounce
    this.firm = Math.max(0, this.firm - dt * 1.3);
    this.smile += ((this.ending === 'saved' ? 1 : this.face) - this.smile) * (1 - Math.exp(-dt * 3));
  }

  private updateBird(dt: number): void {
    const g = this.geo;
    const b = this.bird;
    b.t += dt;
    b.flap += dt * (b.state === 'fly' || b.state === 'tohat' ? 17 : 0);
    b.shiver = Math.max(0, b.shiver - dt * 0.6);
    const branchX = g.branch.x + g.branch.dir * g.unit * 0.1;
    const branchY = g.branch.y - g.unit * 0.028;

    switch (b.state) {
      case 'fly': {
        const k = 1 - Math.exp(-dt * 1.5);
        b.x += (branchX - b.x) * k;
        b.y += (branchY - b.y + Math.sin(b.t * 5) * 6) * k;
        if (Math.hypot(b.x - branchX, b.y - branchY) < g.unit * 0.02) {
          b.state = 'branch';
          b.t = 0;
          b.x = branchX;
          b.y = branchY;
          this.ctx.audio.mew();
        }
        break;
      }
      case 'branch': {
        b.x = branchX;
        b.y = branchY + Math.sin(b.t * 2.3) * 1.2;
        // the branch lets go of its snow: the last free warning
        if (!this.clumpDone && b.t > 0.55) {
          this.clumpDone = true;
          this.branchSnow = 0;
          this.ctx.audio.flump(0.35);
          for (let i = 0; i < 22; i++) {
            this.bits.push({
              x: g.branch.x + g.branch.dir * g.unit * this.rng.range(0.03, 0.2),
              y: g.branch.y + this.rng.range(-4, 6),
              vx: this.rng.range(-18, 18),
              vy: this.rng.range(20, 90),
              life: this.rng.range(0.8, 1.5),
              max: 1.5,
              r: this.rng.range(1.6, 5),
              kind: 3,
              spin: this.rng.range(-4, 4),
            });
          }
        }
        break;
      }
      case 'tohat': {
        const s = this.hatSeat();
        const tx = s ? s.x : this.hat.x;
        const ty = (s ? s.y : this.hat.y) - g.unit * 0.055;
        const k = 1 - Math.exp(-dt * 2.1);
        b.x += (tx - b.x) * k;
        b.y += (ty - b.y - Math.sin(clamp(b.t, 0, 1.4) * 2.2) * g.unit * 0.05) * k;
        if (b.t > 1.5) {
          b.state = 'hat';
          b.t = 0;
          b.shiver = 1;
          this.ctx.audio.mew();
          if (this.ending === 'melted') {
            // and the hat sinks a little further. plop.
            this.hat.vy = 60;
            this.ctx.audio.flump(1);
            for (let i = 0; i < 8; i++) {
              this.bits.push({
                x: this.hat.x + this.rng.range(-14, 14),
                y: this.hat.y,
                vx: this.rng.range(-50, 50),
                vy: this.rng.range(-70, -10),
                life: 0.7,
                max: 0.7,
                r: this.rng.range(1.5, 3),
                kind: 1,
                spin: 0,
              });
            }
          }
        }
        break;
      }
      case 'hat': {
        const s = this.hatSeat();
        const hx = s ? s.x : this.hat.x;
        const hy = (s ? s.y : this.hat.y - g.unit * 0.055) - g.unit * 0.13;
        const sh = b.shiver > 0 ? Math.sin(b.t * 32) * 1.4 * b.shiver : 0;
        b.x += (hx + sh - b.x) * (1 - Math.exp(-dt * 12));
        b.y += (hy - b.y) * (1 - Math.exp(-dt * 12));
        if (b.t > 2.4 && b.shiver <= 0) {
          b.shiver = 1;
          b.t = 0;
        }
        break;
      }
      default:
        break;
    }
  }

  private updateBits(dt: number): void {
    const g = this.geo;
    if (this.bits.length > 460) this.bits.splice(0, this.bits.length - 460);
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const p = this.bits[i];
      p.life -= dt;
      if (p.kind === 0) {
        p.vy += 260 * dt;
        p.vx *= 1 - dt * 2.2;
      } else if (p.kind === 1) {
        p.vy += 1500 * dt;
      } else if (p.kind === 2) {
        p.vy += 10 * dt;
      } else {
        p.vy += 900 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if ((p.kind === 1 || p.kind === 3) && p.y > g.groundY && p.vy > 0) {
        if (p.kind === 1) {
          this.bits.splice(i, 1);
          if (p.splash) continue;
          this.ctx.audio.plip(this.rng.range(1.1, 1.7));
          this.puddle = Math.min(1, this.puddle + 0.004);
          for (let k = 0; k < 2; k++) {
            this.bits.push({
              x: p.x,
              y: g.groundY,
              vx: this.rng.range(-30, 30),
              vy: this.rng.range(-70, -20),
              life: 0.22,
              max: 0.22,
              r: 1.1,
              kind: 1,
              spin: 0,
              splash: true,
            });
          }
          continue;
        }
        p.vy *= -0.2;
        p.vx *= 0.4;
        p.y = g.groundY;
        p.life = Math.min(p.life, 0.25);
      }
      if (p.life <= 0) this.bits.splice(i, 1);
    }
  }

  private updateFlakes(dt: number): void {
    const g = this.geo;
    const want = clamp(1 - this.warm * 1.25, 0, 1);
    const n = Math.floor(this.flakes.length * 1);
    for (let i = 0; i < n; i++) {
      const f = this.flakes[i];
      f.y += f.vy * dt;
      f.x += (f.vx + Math.sin(this.t * 0.8 + f.ph) * 9) * dt;
      if (f.y > g.h + 8) {
        if (want > 0.05) {
          const nf = this.newFlake(false);
          this.flakes[i] = nf;
        } else {
          f.y = g.h + 200;
        }
      }
    }
    // bring the snow back when the sun goes away again
    if (want > 0.5) {
      for (let i = 0; i < this.flakes.length; i++) {
        if (this.flakes[i].y > g.h + 100) this.flakes[i] = this.newFlake(false);
      }
    }
  }

  private updateCamera(dt: number): void {
    const k = 1 - Math.exp(-dt * 1.8);
    this.camZ += (this.camZT - this.camZ) * k;
    this.camY += (this.camYT - this.camY) * k;
    const focus = this.held
      ? (this.px - this.geo.w / 2) * 0.05
      : (this.snowX - this.geo.w / 2) * 0.025;
    const drift = Math.sin(this.t * 0.12) * this.geo.unit * 0.014;
    this.camX += (focus + drift - this.camX) * (1 - Math.exp(-dt * 1.5));
  }

  private updateSound(): void {
    const a = this.ctx.audio;
    a.bed('breeze', 0.018 * (1 - this.warm * 0.55), 280 + this.warm * 120);
    a.bed('shimmer', this.heat * 0.012, 4200);
  }

  // ---------------------------------------------------------------- palette

  private pal(): Record<string, RGB> {
    const wv = this.warm;
    return {
      skyTop: mix([150, 163, 180], [98, 166, 216], wv),
      skyMid: mix([190, 198, 210], [166, 208, 234], wv),
      skyLow: mix([216, 220, 226], [212, 232, 244], wv),
      hillFar: mix([196, 204, 218], [200, 214, 232], wv),
      hillNear: mix([208, 215, 226], [222, 228, 234], wv),
      snow: mix([224, 232, 244], [248, 246, 234], wv),
      snowLit: mix([238, 244, 252], [255, 250, 226], wv),
      snowShade: mix([182, 196, 220], [176, 194, 226], wv),
      fir: mix([46, 74, 68], [58, 92, 74], wv),
      firLit: mix([70, 102, 92], [96, 134, 96], wv),
      bark: mix([82, 70, 66], [104, 84, 70], wv),
      fence: mix([196, 190, 184], [226, 212, 190], wv),
      house: mix([206, 200, 198], [232, 216, 198], wv),
      roof: mix([120, 124, 136], [142, 132, 132], wv),
    };
  }

  // ---------------------------------------------------------------- render

  render(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    const P = this.pal();
    const { w, h } = g;

    gg.save();
    gg.translate(w / 2, h / 2);
    gg.scale(this.camZ, this.camZ);
    gg.translate(-w / 2, -h / 2 + this.camY);

    this.drawSky(gg, P);
    this.layer(gg, 0.16, () => this.drawHills(gg, P));
    this.drawGround(gg, P);
    this.layer(gg, 0.42, () => this.drawHouse(gg, P));
    this.layer(gg, 0.52, () => this.drawFence(gg, P));
    this.layer(gg, 0.78, () => this.drawTree(gg, P));
    this.drawShadePool(gg);
    this.drawPuddle(gg, P);
    this.drawGroundShadows(gg);
    this.drawScene(gg, P);
    this.drawBits(gg);
    this.layer(gg, 1.5, () => this.drawForeBank(gg, P));
    this.drawFlakes(gg);
    this.drawLight(gg);
    gg.restore();

    if (this.fade > 0.001) {
      gg.fillStyle = `rgba(10,14,22,${this.fade})`;
      gg.fillRect(0, 0, w, h);
    }
  }

  private layer(gg: CanvasRenderingContext2D, depth: number, fn: () => void): void {
    gg.save();
    gg.translate(-this.camX * depth, 0);
    fn();
    gg.restore();
  }

  // ------------------------------------------------------------- sky

  private drawSky(gg: CanvasRenderingContext2D, P: Record<string, RGB>): void {
    const { w, h, horizonY } = this.geo;
    const grd = gg.createLinearGradient(0, -h * 0.12, 0, horizonY + 8);
    grd.addColorStop(0, rgb(P.skyTop));
    grd.addColorStop(0.62, rgb(P.skyMid));
    grd.addColorStop(1, rgb(P.skyLow));
    gg.fillStyle = grd;
    gg.fillRect(-w, -h, w * 3, horizonY + h + 12);

    this.layer(gg, 0.05, () => {
      this.drawLid(gg);
      this.drawSun(gg);
      this.drawFreeCloud(gg);
    });
  }

  private drawSun(gg: CanvasRenderingContext2D): void {
    const { sun, unit } = this.geo;
    const sharp = this.sharp;
    const soft = 1 - sharp;
    // the bright spot behind the lid, before it becomes a sun
    const bigR = unit * (0.5 - sharp * 0.22);
    const bg = gg.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, bigR);
    const aa = 0.36 * soft + 0.3 * sharp;
    bg.addColorStop(0, `rgba(255,252,236,${aa})`);
    bg.addColorStop(0.35, `rgba(255,248,220,${aa * 0.42})`);
    bg.addColorStop(1, 'rgba(255,244,208,0)');
    gg.fillStyle = bg;
    gg.beginPath();
    gg.arc(sun.x, sun.y, bigR, 0, Math.PI * 2);
    gg.fill();

    if (sharp > 0.02) {
      const r = unit * 0.052;
      // a soft corona
      const cg = gg.createRadialGradient(sun.x, sun.y, r * 0.6, sun.x, sun.y, r * 3.6);
      cg.addColorStop(0, `rgba(255,246,200,${0.5 * sharp})`);
      cg.addColorStop(1, 'rgba(255,240,180,0)');
      gg.fillStyle = cg;
      gg.beginPath();
      gg.arc(sun.x, sun.y, r * 3.6, 0, Math.PI * 2);
      gg.fill();
      // the disc
      gg.fillStyle = `rgba(255,250,226,${sharp})`;
      gg.beginPath();
      gg.arc(sun.x, sun.y, r * (0.72 + sharp * 0.28), 0, Math.PI * 2);
      gg.fill();
      gg.fillStyle = `rgba(255,255,248,${sharp * 0.9})`;
      gg.beginPath();
      gg.arc(sun.x - r * 0.18, sun.y - r * 0.2, r * 0.44, 0, Math.PI * 2);
      gg.fill();
    }
  }

  /** the overcast lid: a low flat ceiling of cloud that slides apart */
  private drawLid(gg: CanvasRenderingContext2D): void {
    const { w, horizonY, unit } = this.geo;
    const a = smooth(this.lid);
    if (a < 0.01) return;
    const band = horizonY * 0.78;
    gg.save();
    gg.globalAlpha = a;
    for (let pass = 0; pass < 2; pass++) {
      gg.fillStyle = pass === 0 ? 'rgba(168,177,192,0.35)' : 'rgba(224,229,238,0.9)';
      gg.beginPath();
      for (const sd of this.lidSeeds) {
        const split = (sd.x - 0.5) * (1 - this.lid) * w * 1.3;
        const x = sd.x * w + split;
        // squashed: a ceiling, not a herd of balloons
        const y = band * (0.1 + sd.y * 0.62) + (pass === 0 ? unit * 0.013 : 0);
        const r = unit * 0.095 * sd.r;
        gg.save();
        gg.translate(x, y);
        gg.scale(1.55, 0.52);
        gg.moveTo(r, 0);
        gg.arc(0, 0, r, 0, Math.PI * 2);
        gg.restore();
      }
      gg.fill();
    }
    // the deck fades down into the haze instead of ending in a hard edge
    const fg = gg.createLinearGradient(0, band * 0.55, 0, horizonY);
    fg.addColorStop(0, 'rgba(226,231,239,0)');
    fg.addColorStop(1, `rgba(228,232,240,${0.8 * a})`);
    gg.fillStyle = fg;
    gg.fillRect(-w * 0.2, band * 0.55, w * 1.4, horizonY - band * 0.55);
    gg.restore();
  }

  /** the draggable cloud: clearly a separate, solid, grabbable thing */
  private drawFreeCloud(gg: CanvasRenderingContext2D): void {
    const c = this.cloud;
    const r = c.r;
    const bob = Math.sin(this.t * 0.9) * r * 0.03;
    gg.save();
    gg.translate(c.x, c.y + bob);
    const held = c.held ? 1 : 0;
    gg.scale(1 + held * 0.04, 1 + held * 0.04);
    for (let pass = 0; pass < 2; pass++) {
      gg.fillStyle = pass === 0 ? rgb(mix([158, 168, 186], [186, 178, 190], this.warm), 0.92) : 'rgba(250,252,255,0.98)';
      gg.beginPath();
      for (const s of this.cloudSeeds) {
        const rr = r * s.r * 0.72;
        const x = s.x * r * 1.05;
        const y = s.y * r * 0.5 + (pass === 0 ? r * 0.17 : 0);
        gg.moveTo(x + rr, y);
        gg.arc(x, y, rr, 0, Math.PI * 2);
      }
      gg.fill();
    }
    gg.restore();
  }

  // ------------------------------------------------------------- land

  private drawHills(gg: CanvasRenderingContext2D, P: Record<string, RGB>): void {
    const { w, horizonY, unit } = this.geo;
    for (let row = 0; row < 2; row++) {
      const base = horizonY + row * unit * 0.022;
      const col = row === 0 ? P.hillFar : P.hillNear;
      gg.fillStyle = rgb(col);
      gg.beginPath();
      gg.moveTo(-w * 0.2, base + unit * 0.1);
      const pts = this.hills.filter((hh) => hh.row === row);
      gg.lineTo(-w * 0.2, base);
      for (const hp of pts) {
        const x = hp.x * w;
        const y = base - unit * (0.02 + hp.y * (row === 0 ? 0.055 : 0.03)) * hp.r;
        gg.quadraticCurveTo(x - w * 0.06, y, x, y);
        gg.quadraticCurveTo(x + w * 0.06, y, x + w * 0.1, base - unit * 0.004);
      }
      gg.lineTo(w * 1.2, base + unit * 0.1);
      gg.closePath();
      gg.fill();
      // a warm rim where the sun catches the ridge
      if (this.warm > 0.05) {
        gg.strokeStyle = `rgba(255,244,216,${0.3 * this.warm})`;
        gg.lineWidth = 1.6;
        gg.stroke();
      }
    }
    // little firs on the far slope
    for (const ft of this.farTrees) {
      const x = ft.x * w;
      const y = horizonY + ft.row * unit * 0.018 - unit * 0.004;
      const s = unit * 0.02 * ft.s;
      gg.fillStyle = rgb(mix(P.fir, P.hillNear, 0.45 - ft.row * 0.12), 0.8);
      gg.beginPath();
      gg.moveTo(x, y - s * 2.1);
      gg.lineTo(x + s * 0.62, y);
      gg.lineTo(x - s * 0.62, y);
      gg.closePath();
      gg.fill();
    }
  }

  private drawHouse(gg: CanvasRenderingContext2D, P: Record<string, RGB>): void {
    const ho = this.geo.house;
    const { unit } = this.geo;
    const top = ho.y;
    const base = ho.y + ho.h;
    const eave = top + unit * 0.05;
    // wall
    const wg = gg.createLinearGradient(ho.x, eave, ho.x, base);
    wg.addColorStop(0, rgb(mix(P.house, [255, 250, 238], 0.3)));
    wg.addColorStop(1, rgb(mix(P.house, [128, 128, 140], 0.32)));
    gg.fillStyle = wg;
    gg.fillRect(ho.x, eave, ho.w, base - eave);
    // clapboard
    gg.strokeStyle = rgb(mix(P.house, [110, 108, 116], 0.35), 0.35);
    gg.lineWidth = 1;
    for (let y = eave + unit * 0.024; y < base; y += unit * 0.024) {
      gg.beginPath();
      gg.moveTo(ho.x, y);
      gg.lineTo(ho.x + ho.w, y);
      gg.stroke();
    }
    // a sloped roof with a fat lip of snow
    gg.fillStyle = rgb(P.roof);
    gg.beginPath();
    gg.moveTo(ho.x - unit * 0.035, eave + unit * 0.014);
    gg.lineTo(ho.x + ho.w * (ho.side > 0 ? 0.1 : 0.9), top - unit * 0.012);
    gg.lineTo(ho.x + ho.w + unit * 0.035, eave + unit * 0.014);
    gg.closePath();
    gg.fill();
    gg.fillStyle = rgb(P.snowLit);
    gg.beginPath();
    gg.moveTo(ho.x - unit * 0.042, eave + unit * 0.012);
    gg.lineTo(ho.x + ho.w * (ho.side > 0 ? 0.1 : 0.9), top - unit * 0.03);
    gg.lineTo(ho.x + ho.w + unit * 0.042, eave + unit * 0.012);
    gg.quadraticCurveTo(ho.x + ho.w * 0.5, eave + unit * 0.03, ho.x - unit * 0.042, eave + unit * 0.012);
    gg.closePath();
    gg.fill();
    // one warm window
    const wx = ho.x + ho.w * (ho.side > 0 ? 0.28 : 0.56);
    const wy = eave + unit * 0.045;
    const ww = unit * 0.082;
    const wh = unit * 0.09;
    gg.fillStyle = rgb(mix([250, 222, 160], [255, 240, 204], this.warm), 0.95);
    gg.fillRect(wx, wy, ww, wh);
    gg.strokeStyle = rgb(mix(P.house, [104, 98, 96], 0.55));
    gg.lineWidth = Math.max(2, unit * 0.007);
    gg.strokeRect(wx, wy, ww, wh);
    gg.beginPath();
    gg.moveTo(wx + ww / 2, wy);
    gg.lineTo(wx + ww / 2, wy + wh);
    gg.moveTo(wx, wy + wh / 2);
    gg.lineTo(wx + ww, wy + wh / 2);
    gg.stroke();
    gg.fillStyle = rgb(P.snowLit, 0.95);
    gg.fillRect(wx - unit * 0.009, wy + wh, ww + unit * 0.018, unit * 0.012);
  }

  private drawFence(gg: CanvasRenderingContext2D, P: Record<string, RGB>): void {
    const { w, fenceY, unit } = this.geo;
    const ph = unit * 0.115;
    const pw = unit * 0.026;
    const gap = unit * 0.05;
    const y0 = fenceY - ph;
    // rails behind
    gg.fillStyle = rgb(mix(P.fence, [120, 112, 104], 0.35));
    gg.fillRect(-w * 0.1, y0 + ph * 0.3, w * 1.2, unit * 0.014);
    gg.fillRect(-w * 0.1, y0 + ph * 0.68, w * 1.2, unit * 0.014);
    for (let x = -gap; x < w + gap; x += gap) {
      const jitter = Math.sin(x * 0.21) * unit * 0.004;
      const top = y0 + jitter;
      const gr = gg.createLinearGradient(x, top, x + pw, top);
      gr.addColorStop(0, rgb(mix(P.fence, [255, 248, 236], 0.4)));
      gr.addColorStop(1, rgb(mix(P.fence, [128, 122, 118], 0.4)));
      gg.fillStyle = gr;
      gg.beginPath();
      gg.moveTo(x, top + pw * 0.5);
      gg.lineTo(x + pw * 0.5, top);
      gg.lineTo(x + pw, top + pw * 0.5);
      gg.lineTo(x + pw, fenceY);
      gg.lineTo(x, fenceY);
      gg.closePath();
      gg.fill();
      // snow cap
      gg.fillStyle = rgb(P.snowLit);
      gg.beginPath();
      gg.moveTo(x - pw * 0.16, top + pw * 0.56);
      gg.lineTo(x + pw * 0.5, top - pw * 0.22);
      gg.lineTo(x + pw * 1.16, top + pw * 0.56);
      gg.quadraticCurveTo(x + pw * 0.5, top + pw * 0.28, x - pw * 0.16, top + pw * 0.56);
      gg.closePath();
      gg.fill();
    }
  }

  private drawGround(gg: CanvasRenderingContext2D, P: Record<string, RGB>): void {
    const { w, h, horizonY, groundY, unit } = this.geo;
    const g2 = gg.createLinearGradient(0, horizonY - unit * 0.02, 0, h);
    g2.addColorStop(0, rgb(mix(P.snow, P.snowShade, 0.35)));
    g2.addColorStop(0.32, rgb(P.snow));
    g2.addColorStop(0.72, rgb(P.snowLit));
    g2.addColorStop(1, rgb(mix(P.snowLit, P.snowShade, 0.25)));
    gg.fillStyle = g2;
    gg.fillRect(-w, horizonY - 2, w * 3, h - horizonY + 60);

    // soft drifts: broad low-contrast bands that give the field a surface
    gg.save();
    gg.globalAlpha = 0.5;
    for (let i = 0; i < 5; i++) {
      const y = horizonY + (h - horizonY) * (0.12 + i * 0.19);
      gg.fillStyle = rgb(P.snowShade, 0.16 + i * 0.015);
      gg.beginPath();
      gg.moveTo(-w * 0.1, y + unit * 0.05);
      for (let k = 0; k <= 10; k++) {
        const f = k / 10;
        const x = lerp(-w * 0.1, w * 1.1, f);
        gg.lineTo(x, y + this.noise(f * 3.5 + i * 4.1) * unit * 0.022);
      }
      gg.lineTo(w * 1.1, y + unit * 0.06);
      gg.closePath();
      gg.fill();
    }
    gg.restore();

    // the cleared stripe the rolling balls left. three union passes, each one
    // filled once, so the overlapping stamps can never stack into a hard slab
    if (this.trail.length > 1) {
      const n = this.trail.length;
      const taperAt = (i: number) => smooth(Math.min(i, n - 1 - i) / 3.5) * 0.7 + 0.3;
      for (let k = 0; k < 3; k++) {
        const grow = 1.7 - k * 0.32;
        const band = new Path2D();
        for (let i = 0; i < n; i++) {
          const t = this.trail[i];
          const tp = taperAt(i);
          const rx = t.w * 0.5 * tp * (1 + (grow - 1) * 0.35);
          const ry = t.w * 0.155 * tp * grow * (1 + this.noise(t.x * 0.07) * 0.22);
          band.moveTo(t.x + rx, groundY + ry * 0.2);
          band.ellipse(t.x, groundY + ry * 0.2, rx, ry, 0, 0, Math.PI * 2);
        }
        gg.fillStyle = `rgba(124,138,170,${0.06 + k * 0.055})`;
        gg.fill(band);
      }
      // the lip of snow pushed up on the near side
      gg.strokeStyle = rgb(P.snowLit, 0.55);
      gg.lineWidth = Math.max(1.4, unit * 0.005);
      gg.beginPath();
      for (let i = 0; i < n; i++) {
        const t = this.trail[i];
        const y = groundY + t.w * 0.16 * taperAt(i);
        if (i === 0) gg.moveTo(t.x, y);
        else gg.lineTo(t.x, y);
      }
      gg.stroke();
    }

    // sparkle in the crust, brighter when the sun is out
    const spark = 0.25 + this.sunUp * 0.75;
    const r = new Rng((this.rng.seed ^ 0x77aa) >>> 0);
    gg.fillStyle = `rgba(255,255,255,${0.75 * spark})`;
    for (let i = 0; i < 70; i++) {
      const f = r.next();
      const y = horizonY + (h - horizonY) * (f * f * 0.98 + 0.02);
      const x = r.range(-w * 0.05, w * 1.05);
      const tw = Math.sin(this.t * r.range(2, 6) + r.range(0, 7));
      if (tw < 0.55) continue;
      const s = (0.6 + (y - horizonY) / (h - horizonY) * 1.8) * (tw - 0.55) * 3;
      gg.fillRect(x, y, s, s * 0.8);
    }

    // wet sheen once the melt has begun
    if (this.wetGround > 0.03) {
      const wg = gg.createLinearGradient(0, groundY - unit * 0.12, 0, h);
      wg.addColorStop(0, `rgba(176,206,232,0)`);
      wg.addColorStop(0.5, `rgba(168,202,232,${0.2 * this.wetGround})`);
      wg.addColorStop(1, `rgba(196,220,240,${0.1 * this.wetGround})`);
      gg.fillStyle = wg;
      gg.fillRect(-w, groundY - unit * 0.12, w * 3, h);
    }
  }

  private drawShadePool(gg: CanvasRenderingContext2D): void {
    const s = this.geo.shade;
    const a = 0.2 + this.sunUp * 0.58;
    gg.save();
    gg.globalCompositeOperation = 'multiply';
    const grd = gg.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.rx);
    grd.addColorStop(0, `rgba(122,150,196,${a})`);
    grd.addColorStop(0.5, `rgba(140,168,208,${a * 0.82})`);
    grd.addColorStop(0.82, `rgba(168,192,222,${a * 0.35})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = grd;
    gg.beginPath();
    gg.ellipse(s.x, s.y, s.rx, s.ry * (1 + this.sharp * 0.25), 0, 0, Math.PI * 2);
    gg.fill();
    gg.restore();

    // the parasol's travelling patch
    {
      const ux = this.umbShadeX();
      const ur = this.geo.unit * 0.175;
      const ua = 0.1 + this.sunUp * 0.44;
      gg.save();
      gg.globalCompositeOperation = 'multiply';
      const ug = gg.createRadialGradient(ux, this.geo.groundY, 0, ux, this.geo.groundY, ur);
      ug.addColorStop(0, `rgba(122,150,196,${ua})`);
      ug.addColorStop(0.75, `rgba(160,186,220,${ua * 0.4})`);
      ug.addColorStop(1, 'rgba(255,255,255,0)');
      gg.fillStyle = ug;
      gg.beginPath();
      gg.ellipse(ux, this.geo.groundY, ur, ur * 0.34, 0, 0, Math.PI * 2);
      gg.fill();
      gg.restore();
    }
  }

  private drawPuddle(gg: CanvasRenderingContext2D, P: Record<string, RGB>): void {
    if (this.puddle < 0.015) return;
    const { unit, groundY, sun } = this.geo;
    const p = this.puddle;
    const cx = this.stack.length ? this.stack[0].x : this.snowX;
    const rx = unit * (0.08 + p * 0.26);
    const ry = rx * 0.26;
    const y = groundY + unit * 0.012;
    gg.save();
    gg.beginPath();
    gg.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2);
    gg.clip();
    // the sky, lying on the ground
    const pg = gg.createLinearGradient(0, y - ry, 0, y + ry);
    pg.addColorStop(0, rgb(mix([120, 150, 186], P.skyTop, 0.5), 0.86));
    pg.addColorStop(0.55, rgb(mix([150, 180, 210], P.skyMid, 0.5), 0.8));
    pg.addColorStop(1, rgb(mix([186, 208, 228], P.skyLow, 0.5), 0.72));
    gg.fillStyle = pg;
    gg.fillRect(cx - rx, y - ry, rx * 2, ry * 2);
    // the reflected sun, wobbling
    if (this.sunUp > 0.05) {
      const sx = cx + (sun.x - cx) * 0.18;
      const sg = gg.createRadialGradient(sx, y + ry * 0.1, 0, sx, y + ry * 0.1, rx * 0.5);
      sg.addColorStop(0, `rgba(255,250,222,${0.7 * this.sunUp})`);
      sg.addColorStop(1, 'rgba(255,244,200,0)');
      gg.fillStyle = sg;
      gg.fillRect(cx - rx, y - ry, rx * 2, ry * 2);
    }
    gg.strokeStyle = 'rgba(255,255,255,0.28)';
    gg.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const yy = y + Math.sin(this.t * 0.9 + i * 2) * ry * 0.2 + (i - 1) * ry * 0.4;
      gg.beginPath();
      gg.moveTo(cx - rx, yy);
      gg.quadraticCurveTo(cx, yy + ry * 0.12, cx + rx, yy);
      gg.stroke();
    }
    gg.restore();
    gg.strokeStyle = `rgba(150,180,206,${0.4 + p * 0.3})`;
    gg.lineWidth = Math.max(1.2, unit * 0.004);
    gg.beginPath();
    gg.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2);
    gg.stroke();
  }

  /** every standing thing gets a cast shadow that hardens with the sun */
  private drawGroundShadows(gg: CanvasRenderingContext2D): void {
    const g = this.geo;
    const a = 0.07 + this.sharp * 0.2;
    const dir = -g.sunSide;
    const put = (x: number, rx: number, lift: number) => {
      const off = dir * (g.unit * 0.02 + lift * 0.34);
      const soft = 1 - this.sharp;
      const sx = x + off;
      const rr = rx * (1.05 + soft * 0.45);
      const grd = gg.createRadialGradient(sx, g.groundY + g.unit * 0.008, 0, sx, g.groundY + g.unit * 0.008, rr);
      grd.addColorStop(0, `rgba(86,112,158,${a})`);
      grd.addColorStop(1 - this.sharp * 0.35, `rgba(96,122,168,${a * 0.55})`);
      grd.addColorStop(1, 'rgba(110,138,182,0)');
      gg.fillStyle = grd;
      gg.beginPath();
      gg.ellipse(sx, g.groundY + g.unit * 0.008, rr, rr * 0.3, 0, 0, Math.PI * 2);
      gg.fill();
    };
    for (const b of this.balls) {
      if (b.x < -1000) continue;
      if (b.state === 'ground' || (b.state === 'held' && b.rolling)) {
        put(b.x, this.rx(b) * 1.1, Math.max(0, g.groundY - b.y));
      }
    }
    if (this.stack.length) {
      const bottom = this.stack[0];
      let top = bottom.y;
      for (const s of this.stack) top = Math.min(top, s.y - this.ry(s));
      put(bottom.x, this.rx(bottom) * 1.15, g.groundY - top);
    }
    if (this.umbrella.state !== 'held') {
      // its shade is drawn separately; this is the pole's foot
      put(this.umbrella.x, g.unit * 0.02, 0);
    }
  }

  // ------------------------------------------------------------- scene

  private drawTree(gg: CanvasRenderingContext2D, P: Record<string, RGB>): void {
    const { tree, unit, branch } = this.geo;
    const baseY = tree.baseY;
    const topY = tree.top;
    const H = baseY - topY;
    const sunL = this.geo.sunSide < 0;

    // a drift banked against the foot, so it is planted in the snow
    gg.fillStyle = rgb(mix(P.snowLit, P.snowShade, 0.18));
    gg.beginPath();
    gg.ellipse(tree.x, baseY + unit * 0.012, unit * 0.12, unit * 0.028, 0, 0, Math.PI * 2);
    gg.fill();

    // trunk
    gg.fillStyle = rgb(P.bark);
    gg.beginPath();
    gg.moveTo(tree.x - unit * 0.026, baseY + unit * 0.012);
    gg.lineTo(tree.x - unit * 0.013, baseY - H * 0.5);
    gg.lineTo(tree.x + unit * 0.013, baseY - H * 0.5);
    gg.lineTo(tree.x + unit * 0.026, baseY + unit * 0.012);
    gg.closePath();
    gg.fill();

    const bx = branch.x;
    const by = branch.y;

    // five overlapping skirts of needles, each with snow lying on top of it
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const f = i / (tiers - 1);
      const y = lerp(baseY - H * 0.02, topY + H * 0.1, f);
      const spread = tree.spread * 0.5 * (1 - f * 0.78);
      const drop = H * 0.3 * (1 - f * 0.4);
      const skirt = (cx: number, cy: number, sp: number, dr: number): void => {
        gg.beginPath();
        gg.moveTo(cx, cy - dr);
        const n = 9;
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const x = cx + lerp(-sp, sp, t);
          const notch = k % 2 === 0 ? 0 : -dr * 0.09;
          gg.lineTo(x, cy + Math.sin(t * Math.PI) * dr * 0.16 + notch);
        }
        gg.closePath();
        gg.fill();
      };
      // the snow sits on the skirt: the same shape, a little wider, a little higher
      gg.fillStyle = rgb(P.snowLit, 0.97);
      skirt(tree.x, y - unit * 0.024, spread * 1.03, drop);
      const grd = gg.createLinearGradient(tree.x - spread, y, tree.x + spread, y);
      grd.addColorStop(0, rgb(sunL ? P.firLit : P.fir));
      grd.addColorStop(1, rgb(sunL ? P.fir : P.firLit));
      gg.fillStyle = grd;
      skirt(tree.x, y, spread, drop);
    }

    // the bare branch the bird uses, drawn over the needles so it reads
    gg.strokeStyle = rgb(mix(P.bark, [58, 50, 48], 0.35));
    gg.lineWidth = Math.max(3, unit * 0.011);
    gg.lineCap = 'round';
    gg.beginPath();
    gg.moveTo(bx + branch.dir * unit * 0.01, by + unit * 0.03);
    gg.quadraticCurveTo(bx + branch.dir * unit * 0.09, by + unit * 0.008, bx + branch.dir * unit * 0.16, by - unit * 0.012);
    gg.stroke();

    // the clump of snow still sitting on the branch
    if (this.branchSnow > 0.02) {
      gg.fillStyle = rgb(P.snowLit, 0.95 * this.branchSnow);
      gg.beginPath();
      gg.ellipse(bx + branch.dir * unit * 0.075, by - unit * 0.002, unit * 0.034, unit * 0.013, branch.dir * 0.12, 0, Math.PI * 2);
      gg.fill();
    }
  }

  private drawScene(gg: CanvasRenderingContext2D, P: Record<string, RGB>): void {
    // loose balls behind, the stack in the middle, props in front
    for (const b of this.balls) {
      if (b.state === 'ground' && b.x > -1000) this.drawBall(gg, b, P);
    }
    for (const b of this.stack) this.drawBall(gg, b, P);
    this.drawFace(gg);
    if (this.hat.state === 'on') {
      const s = this.hatSeat();
      if (s) this.drawHat(gg, s.x, s.y, s.rot, this.geo.unit * 0.088);
    }
    for (const pb of this.pebbles) if (pb.state !== 'on') this.drawPebble(gg, pb);
    if (this.carrot.state !== 'on') this.drawCarrot(gg, this.carrot.x, this.carrot.y, this.carrot.rot, this.geo.unit * 0.055);
    if (this.hat.state !== 'on' && this.hat.state !== 'held') this.drawHat(gg, this.hat.x, this.hat.y, this.hat.rot, this.geo.unit * 0.088);
    this.drawUmbrella(gg);
    if (this.bird.state !== 'away') this.drawBird(gg);
    // whatever is in the hand draws on top
    if (this.heldKind === 'ball' && this.held) this.drawBall(gg, this.held as Ball, P);
    if (this.heldKind === 'hat') this.drawHat(gg, this.hat.x, this.hat.y, this.hat.rot, this.geo.unit * 0.088);
    if (this.heldKind === 'carrot') this.drawCarrot(gg, this.carrot.x, this.carrot.y, this.carrot.rot, this.geo.unit * 0.055);
  }

  private ballPath(b: Ball): Path2D {
    const rx = this.rx(b);
    const ry = this.ry(b);
    const slump = b.melt;
    const p = new Path2D();
    const N = 36;
    const pts: Array<{ x: number; y: number }> = [];
    const L = b.lumps.length;
    for (let i = 0; i < N; i++) {
      const f = (i / N) * L;
      const j = Math.floor(f);
      const k = f - j;
      // interpolate the lump field so the outline stays round, never faceted
      const lv = lerp(b.lumps[j % L], b.lumps[(j + 1) % L], k * k * (3 - 2 * k));
      const a = (i / N) * Math.PI * 2 - Math.PI / 2;
      const lump = 1 + lv * (1 - slump * 0.6);
      const low = Math.max(0, Math.sin(a));
      pts.push({
        x: b.x + Math.cos(a) * rx * lump * (1 + slump * 0.22 * low),
        y: b.y + Math.sin(a) * ry * lump * (1 - slump * 0.2 * low),
      });
    }
    const mid = (i: number, j: number) => ({ x: (pts[i].x + pts[j].x) / 2, y: (pts[i].y + pts[j].y) / 2 });
    let m = mid(N - 1, 0);
    p.moveTo(m.x, m.y);
    for (let i = 0; i < N; i++) {
      const nx = mid(i, (i + 1) % N);
      p.quadraticCurveTo(pts[i].x, pts[i].y, nx.x, nx.y);
    }
    p.closePath();
    return p;
  }

  private drawBall(gg: CanvasRenderingContext2D, b: Ball, P: Record<string, RGB>): void {
    const g = this.geo;
    const rx = this.rx(b);
    const ry = this.ry(b);
    const path = this.ballPath(b);
    const lightX = -g.sunSide;
    const cool = this.shadeCover * (b.state === 'stacked' ? 1 : 0);
    const litC = mix(mix(P.snowLit, [255, 252, 238], this.warm * 0.5), [196, 212, 238], cool * 0.55);
    const shC = mix(P.snowShade, [150, 172, 208], cool * 0.5);

    const grd = gg.createRadialGradient(
      b.x - lightX * rx * 0.42,
      b.y - ry * 0.45,
      rx * 0.08,
      b.x,
      b.y,
      rx * 1.35,
    );
    grd.addColorStop(0, rgb(litC));
    grd.addColorStop(0.5, rgb(mix(litC, shC, 0.35)));
    grd.addColorStop(1, rgb(shC));
    gg.fillStyle = grd;
    gg.fill(path);

    gg.save();
    gg.clip(path);
    // packed-snow grain
    gg.fillStyle = rgb(mix(shC, [255, 255, 255], 0.35), 0.4);
    for (const gr of b.grain) {
      const a = gr.a + b.rot;
      const x = b.x + Math.cos(a) * rx * gr.d;
      const y = b.y + Math.sin(a) * ry * gr.d;
      gg.beginPath();
      gg.ellipse(x, y, rx * 0.05 * gr.s, rx * 0.035 * gr.s, a, 0, Math.PI * 2);
      gg.fill();
    }
    // the snow packed under it is always in shadow
    const ao = gg.createLinearGradient(0, b.y - ry * 0.1, 0, b.y + ry);
    ao.addColorStop(0, 'rgba(118,144,188,0)');
    ao.addColorStop(1, 'rgba(112,138,184,0.42)');
    gg.fillStyle = ao;
    gg.fill(path);
    // rolled-in seam so the rotation is readable
    gg.strokeStyle = rgb(mix(shC, [120, 146, 190], 0.5), 0.34);
    gg.lineWidth = Math.max(1, rx * 0.05);
    for (let k = 0; k < 2; k++) {
      const a = b.rot + k * Math.PI;
      gg.beginPath();
      gg.ellipse(b.x, b.y, rx * 0.66, ry * 0.66, 0, a - 0.55, a + 0.55);
      gg.stroke();
    }
    // the sun's own hot rim
    if (this.sunUp > 0.05) {
      const hg = gg.createRadialGradient(
        b.x + g.sunSide * rx * 0.6,
        b.y - ry * 0.55,
        0,
        b.x + g.sunSide * rx * 0.6,
        b.y - ry * 0.55,
        rx * 1.1,
      );
      hg.addColorStop(0, `rgba(255,248,216,${0.42 * this.sunUp * (1 - this.shadeCover * 0.85)})`);
      hg.addColorStop(1, 'rgba(255,244,206,0)');
      gg.fillStyle = hg;
      gg.fill(path);
    }
    // wet sheen: a hard specular streak that only exists while it is melting
    if (b.sheen > 0.05) {
      const sx = b.x - lightX * rx * 0.38;
      const sy = b.y - ry * 0.5;
      const sg = gg.createRadialGradient(sx, sy, 0, sx, sy, rx * 0.62);
      sg.addColorStop(0, `rgba(255,255,255,${0.62 * b.sheen})`);
      sg.addColorStop(0.5, `rgba(226,244,255,${0.24 * b.sheen})`);
      sg.addColorStop(1, 'rgba(226,244,255,0)');
      gg.fillStyle = sg;
      gg.beginPath();
      gg.ellipse(sx, sy, rx * 0.62, ry * 0.38, -0.4 * lightX, 0, Math.PI * 2);
      gg.fill();
      // a dark wet skirt at the bottom
      const wg = gg.createLinearGradient(0, b.y + ry * 0.1, 0, b.y + ry);
      wg.addColorStop(0, 'rgba(150,180,212,0)');
      wg.addColorStop(1, `rgba(140,172,208,${0.5 * b.sheen})`);
      gg.fillStyle = wg;
      gg.fill(path);
    }
    gg.restore();

    gg.strokeStyle = rgb(mix(shC, [110, 138, 180], 0.4), 0.55);
    gg.lineWidth = Math.max(1, rx * 0.035);
    gg.stroke(path);
  }

  private drawFace(gg: CanvasRenderingContext2D): void {
    const f = this.facePt();
    if (!f || this.face < 0.02) return;
    const g = this.geo;
    const a = this.face;
    const eyeDX = f.r * 0.34;
    const blink = this.blink > 0 ? 1 : 0;
    const glance = this.glance * g.sunSide;
    const eyeY = f.y - f.r * 0.24;
    if (this.pebbles[0].state === 'on') {
      gg.save();
      gg.globalAlpha = a;
      for (const s of [-1, 1]) {
        const x = f.x + s * eyeDX + glance * f.r * 0.12;
        const r = f.r * 0.105;
        gg.fillStyle = 'rgb(56,54,60)';
        gg.beginPath();
        gg.ellipse(x, eyeY, r, r * (blink ? 0.22 : 1), 0, 0, Math.PI * 2);
        gg.fill();
        if (!blink) {
          gg.fillStyle = 'rgba(255,255,255,0.75)';
          gg.beginPath();
          gg.arc(x - r * 0.3, eyeY - r * 0.32, r * 0.3, 0, Math.PI * 2);
          gg.fill();
        }
      }
      // mouth: a little arc of pebbles that curls up when he is happy
      const curl = lerp(0.12, 0.42, this.smile) * (this.ending === 'melted' ? 0.2 : 1);
      gg.fillStyle = 'rgb(66,62,66)';
      for (let i = 0; i < 5; i++) {
        const t = (i / 4 - 0.5) * 1.5;
        const x = f.x + t * f.r * 0.38 + glance * f.r * 0.08;
        const y = f.y + f.r * 0.33 - (0.25 - t * t) * f.r * curl * 2.4;
        gg.beginPath();
        gg.arc(x, y, f.r * 0.05, 0, Math.PI * 2);
        gg.fill();
      }
      gg.restore();
    }
    if (this.carrot.state === 'on') {
      const droop = this.stack.length ? clamp((this.stack[this.stack.length - 1].melt - 0.44) * 3.4, 0, 1) : 0;
      const rot = lerp(-0.06, 1.15, droop) * g.sunSide;
      gg.save();
      gg.globalAlpha = a;
      this.drawCarrot(gg, f.x + g.sunSide * f.r * 0.12, f.y + f.r * 0.06, rot + (g.sunSide > 0 ? 0 : Math.PI), f.r * 0.95, false);
      gg.restore();
    }
  }

  private drawCarrot(gg: CanvasRenderingContext2D, x: number, y: number, rot: number, len: number, tuft = true): void {
    gg.save();
    gg.translate(x, y);
    gg.rotate(rot);
    const wdt = len * 0.34;
    const grd = gg.createLinearGradient(0, -wdt, 0, wdt);
    grd.addColorStop(0, 'rgb(255,178,84)');
    grd.addColorStop(0.5, 'rgb(240,136,46)');
    grd.addColorStop(1, 'rgb(196,98,30)');
    gg.fillStyle = grd;
    gg.beginPath();
    gg.moveTo(-len * 0.1, -wdt);
    gg.quadraticCurveTo(len * 0.55, -wdt * 0.5, len, 0);
    gg.quadraticCurveTo(len * 0.55, wdt * 0.5, -len * 0.1, wdt);
    gg.quadraticCurveTo(-len * 0.28, 0, -len * 0.1, -wdt);
    gg.closePath();
    gg.fill();
    gg.strokeStyle = 'rgba(150,72,18,0.45)';
    gg.lineWidth = Math.max(1, len * 0.05);
    for (let i = 1; i <= 3; i++) {
      const f = i / 4;
      const hw = wdt * (1 - f) * 0.9;
      gg.beginPath();
      gg.moveTo(len * f, -hw);
      gg.lineTo(len * f + len * 0.06, hw);
      gg.stroke();
    }
    gg.fillStyle = 'rgba(255,224,178,0.5)';
    gg.beginPath();
    gg.moveTo(0, -wdt * 0.6);
    gg.quadraticCurveTo(len * 0.5, -wdt * 0.32, len * 0.9, -wdt * 0.04);
    gg.quadraticCurveTo(len * 0.5, -wdt * 0.12, 0, -wdt * 0.2);
    gg.closePath();
    gg.fill();
    // a tuft of green at the thick end
    if (!tuft) {
      gg.restore();
      return;
    }
    gg.strokeStyle = 'rgb(92,146,74)';
    gg.lineWidth = Math.max(1.4, len * 0.07);
    gg.lineCap = 'round';
    for (const s of [-0.55, 0, 0.55]) {
      gg.beginPath();
      gg.moveTo(-len * 0.12, s * wdt * 0.6);
      gg.lineTo(-len * 0.4, s * wdt * 1.4 - wdt * 0.1);
      gg.stroke();
    }
    gg.restore();
  }

  private drawPebble(gg: CanvasRenderingContext2D, p: Prop): void {
    const r = this.geo.unit * 0.017;
    gg.save();
    gg.translate(p.x, p.y);
    gg.rotate(p.rot);
    gg.fillStyle = 'rgb(74,72,78)';
    gg.beginPath();
    gg.ellipse(0, 0, r, r * 0.8, 0, 0, Math.PI * 2);
    gg.fill();
    gg.fillStyle = 'rgba(190,196,206,0.5)';
    gg.beginPath();
    gg.ellipse(-r * 0.25, -r * 0.28, r * 0.38, r * 0.24, -0.4, 0, Math.PI * 2);
    gg.fill();
    gg.restore();
  }

  private drawHat(gg: CanvasRenderingContext2D, x: number, y: number, rot: number, s: number): void {
    // a red garden bucket worn upside down: wide rim down, narrow base up
    gg.save();
    gg.translate(x, y);
    gg.rotate(rot);
    const rw = s * 0.92; // rim half width (bottom)
    const tw = s * 0.7; // top half width
    const hh = s * 0.98;
    const body = gg.createLinearGradient(-rw, 0, rw, 0);
    body.addColorStop(0, 'rgb(150,44,40)');
    body.addColorStop(0.32, 'rgb(220,78,62)');
    body.addColorStop(0.62, 'rgb(240,116,92)');
    body.addColorStop(1, 'rgb(158,48,42)');
    gg.fillStyle = body;
    gg.beginPath();
    gg.moveTo(-rw, 0);
    gg.lineTo(-tw, -hh);
    gg.quadraticCurveTo(0, -hh - s * 0.16, tw, -hh);
    gg.lineTo(rw, 0);
    gg.quadraticCurveTo(0, s * 0.22, -rw, 0);
    gg.closePath();
    gg.fill();
    // the base of the bucket, now the crown
    gg.fillStyle = 'rgb(246,140,112)';
    gg.beginPath();
    gg.ellipse(0, -hh, tw, s * 0.17, 0, 0, Math.PI * 2);
    gg.fill();
    gg.strokeStyle = 'rgba(120,32,28,0.55)';
    gg.lineWidth = Math.max(1.2, s * 0.045);
    gg.beginPath();
    gg.ellipse(0, -hh, tw, s * 0.17, 0, 0, Math.PI * 2);
    gg.stroke();
    // rolled rim
    gg.fillStyle = 'rgb(186,58,48)';
    gg.beginPath();
    gg.ellipse(0, 0, rw, s * 0.2, 0, 0, Math.PI);
    gg.fill();
    gg.strokeStyle = 'rgba(112,28,24,0.6)';
    gg.lineWidth = Math.max(1.2, s * 0.05);
    gg.beginPath();
    gg.ellipse(0, 0, rw, s * 0.2, 0, 0, Math.PI * 2);
    gg.stroke();
    // wire handle, hanging off one side
    gg.strokeStyle = 'rgb(150,154,164)';
    gg.lineWidth = Math.max(1.6, s * 0.055);
    gg.lineCap = 'round';
    const sw = Math.sin(this.t * 2.2) * 0.08;
    gg.beginPath();
    gg.moveTo(-rw * 0.96, -hh * 0.42);
    gg.quadraticCurveTo(-rw * 1.5 + sw * s, -hh * 0.05, -rw * 1.05, hh * 0.34);
    gg.stroke();
    // a band of white paint so it reads as a bucket, not a fez
    gg.fillStyle = 'rgba(255,244,236,0.85)';
    gg.beginPath();
    gg.moveTo(-lerp(rw, tw, 0.45), -hh * 0.45);
    gg.lineTo(lerp(rw, tw, 0.45), -hh * 0.45);
    gg.lineTo(lerp(rw, tw, 0.62), -hh * 0.62);
    gg.lineTo(-lerp(rw, tw, 0.62), -hh * 0.62);
    gg.closePath();
    gg.fill();
    gg.restore();
  }

  private drawUmbrella(gg: CanvasRenderingContext2D): void {
    const u = this.umbrella;
    const g = this.geo;
    const s = g.unit * 0.19;
    const held = u.state === 'held';
    gg.save();
    gg.translate(u.x, u.y);
    gg.rotate(held ? u.rot * 0.35 : u.rot);
    // pole
    gg.strokeStyle = 'rgb(120,104,92)';
    gg.lineWidth = Math.max(2.4, g.unit * 0.009);
    gg.lineCap = 'round';
    gg.beginPath();
    gg.moveTo(0, 0);
    gg.lineTo(0, -s * 1.55);
    gg.stroke();
    // canopy: five fabric panels that sag and flex with the motion
    const flex = clamp((this.px - u.x) * 0.004, -0.5, 0.5) * (held ? 1 : 0);
    const top = -s * 1.55;
    const N = 5;
    for (let i = 0; i < N; i++) {
      const a0 = Math.PI + (i / N) * Math.PI;
      const a1 = Math.PI + ((i + 1) / N) * Math.PI;
      const x0 = Math.cos(a0) * s;
      const x1 = Math.cos(a1) * s;
      const y0 = top - Math.sin(a0) * s * 0.05 + s * 0.42;
      const y1 = top - Math.sin(a1) * s * 0.05 + s * 0.42;
      const mx = (x0 + x1) / 2;
      const sag = s * (0.26 + Math.sin((i + 0.5) / N * Math.PI) * 0.12) + flex * s * 0.1 * (mx / s);
      gg.fillStyle = i % 2 === 0 ? 'rgb(96,164,196)' : 'rgb(238,240,244)';
      gg.beginPath();
      gg.moveTo(0, top);
      gg.quadraticCurveTo(x0 * 0.55 + flex * s * 0.12, top + sag * 0.55, x0, y0);
      gg.quadraticCurveTo(mx, y0 + sag * 0.42, x1, y1);
      gg.quadraticCurveTo(x1 * 0.55 + flex * s * 0.12, top + sag * 0.55, 0, top);
      gg.closePath();
      gg.fill();
      gg.strokeStyle = 'rgba(60,84,104,0.22)';
      gg.lineWidth = 1;
      gg.stroke();
    }
    // scalloped hem
    gg.strokeStyle = 'rgba(56,88,106,0.45)';
    gg.lineWidth = Math.max(1.4, g.unit * 0.005);
    gg.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI + (i / 24) * Math.PI;
      const x = Math.cos(a) * s;
      const y = top + s * 0.42 - Math.sin(a) * s * 0.05;
      if (i === 0) gg.moveTo(x, y);
      else gg.lineTo(x, y);
    }
    gg.stroke();
    // little knob
    gg.fillStyle = 'rgb(206,178,120)';
    gg.beginPath();
    gg.arc(0, top - s * 0.06, s * 0.055, 0, Math.PI * 2);
    gg.fill();
    gg.restore();
  }

  private drawBird(gg: CanvasRenderingContext2D): void {
    const b = this.bird;
    const u = this.geo.unit;
    const s = u * 0.042;
    const flying = b.state === 'fly' || b.state === 'tohat';
    const flap = flying ? Math.sin(b.flap) : 0;
    const face = this.geo.branch.dir * (b.state === 'branch' ? -1 : 1);
    gg.save();
    gg.translate(b.x, b.y);
    gg.scale(face, 1);
    // tail
    gg.fillStyle = 'rgb(88,78,86)';
    gg.beginPath();
    gg.moveTo(s * 0.5, 0);
    gg.lineTo(s * 1.5, -s * 0.3);
    gg.lineTo(s * 1.45, s * 0.25);
    gg.closePath();
    gg.fill();
    // body
    const bg = gg.createLinearGradient(0, -s, 0, s);
    bg.addColorStop(0, 'rgb(122,110,118)');
    bg.addColorStop(0.55, 'rgb(90,80,88)');
    bg.addColorStop(1, 'rgb(220,206,190)');
    gg.fillStyle = bg;
    gg.beginPath();
    gg.ellipse(0, 0, s * 0.85, s * 0.72, 0, 0, Math.PI * 2);
    gg.fill();
    // head
    gg.fillStyle = 'rgb(104,92,100)';
    gg.beginPath();
    gg.arc(-s * 0.62, -s * 0.52, s * 0.44, 0, Math.PI * 2);
    gg.fill();
    // wing
    gg.fillStyle = 'rgba(58,50,58,0.85)';
    gg.save();
    gg.translate(s * 0.05, -s * 0.12);
    gg.rotate(flap * 0.8);
    gg.beginPath();
    gg.ellipse(0, 0, s * 0.6, s * 0.3, 0.2, 0, Math.PI * 2);
    gg.fill();
    gg.restore();
    // beak + eye
    gg.fillStyle = 'rgb(240,176,72)';
    gg.beginPath();
    gg.moveTo(-s * 1.0, -s * 0.5);
    gg.lineTo(-s * 1.42, -s * 0.36);
    gg.lineTo(-s * 1.0, -s * 0.26);
    gg.closePath();
    gg.fill();
    gg.fillStyle = 'rgb(28,26,30)';
    gg.beginPath();
    gg.arc(-s * 0.74, -s * 0.6, s * 0.1, 0, Math.PI * 2);
    gg.fill();
    // feet
    gg.strokeStyle = 'rgb(210,150,70)';
    gg.lineWidth = Math.max(1.2, s * 0.12);
    gg.beginPath();
    gg.moveTo(-s * 0.1, s * 0.66);
    gg.lineTo(-s * 0.1, s * 0.95);
    gg.moveTo(s * 0.26, s * 0.62);
    gg.lineTo(s * 0.26, s * 0.92);
    gg.stroke();
    gg.restore();
  }

  private drawBits(gg: CanvasRenderingContext2D): void {
    for (const p of this.bits) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.kind === 0 || p.kind === 3) {
        gg.fillStyle = `rgba(255,255,255,${(p.kind === 3 ? 0.95 : 0.8) * a})`;
        gg.beginPath();
        gg.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        gg.fill();
      } else if (p.kind === 1) {
        const st = clamp(Math.abs(p.vy) / 420, 0, 1);
        gg.fillStyle = `rgba(150,196,232,${0.9 * a})`;
        gg.beginPath();
        gg.ellipse(p.x, p.y, p.r * (1 - st * 0.3), p.r * (1 + st * 1.6), 0, 0, Math.PI * 2);
        gg.fill();
        gg.fillStyle = `rgba(255,255,255,${0.6 * a})`;
        gg.beginPath();
        gg.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.38, 0, Math.PI * 2);
        gg.fill();
      } else {
        // frost sparkle: a four-point star
        const r = p.r * (0.4 + a * 0.8);
        gg.save();
        gg.translate(p.x, p.y);
        gg.rotate(p.spin * p.life);
        gg.fillStyle = `rgba(255,255,255,${0.9 * a})`;
        gg.beginPath();
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          const rr = i % 2 === 0 ? r : r * 0.3;
          const x = Math.cos(ang) * rr;
          const y = Math.sin(ang) * rr;
          if (i === 0) gg.moveTo(x, y);
          else gg.lineTo(x, y);
        }
        gg.closePath();
        gg.fill();
        gg.restore();
      }
    }
  }

  private drawForeBank(gg: CanvasRenderingContext2D, P: Record<string, RGB>): void {
    const { w, h, unit } = this.geo;
    const y = h - unit * 0.035;
    gg.fillStyle = rgb(mix(P.snowLit, [255, 255, 255], 0.3));
    gg.beginPath();
    gg.moveTo(-w * 0.2, h + 40);
    gg.lineTo(-w * 0.2, y);
    for (let i = 0; i <= 12; i++) {
      const f = i / 12;
      const x = lerp(-w * 0.2, w * 1.2, f);
      gg.quadraticCurveTo(x, y - unit * (0.02 + 0.03 * Math.abs(this.noise(f * 4.2 + 3))), x + w * 0.06, y - unit * 0.01);
    }
    gg.lineTo(w * 1.2, h + 40);
    gg.closePath();
    gg.fill();
    gg.fillStyle = rgb(P.snowShade, 0.22);
    gg.fillRect(-w * 0.2, y + unit * 0.02, w * 1.4, unit * 0.02);
  }

  private drawFlakes(gg: CanvasRenderingContext2D): void {
    const a = clamp(1 - this.warm * 1.2, 0, 1);
    if (a < 0.03) return;
    for (const f of this.flakes) {
      if (f.y > this.geo.h + 10) continue;
      gg.fillStyle = `rgba(255,255,255,${(0.35 + f.layer * 0.24) * a})`;
      gg.beginPath();
      gg.arc(f.x - this.camX * (0.4 + f.layer * 0.5), f.y, f.r, 0, Math.PI * 2);
      gg.fill();
    }
  }

  private drawLight(gg: CanvasRenderingContext2D): void {
    const { w, h, sun, unit } = this.geo;
    // global colour temperature
    if (this.warm > 0.02) {
      gg.save();
      gg.globalCompositeOperation = 'multiply';
      gg.fillStyle = rgb(mix([255, 255, 255], [255, 236, 196], this.warm * 0.55));
      gg.fillRect(-w, -h, w * 3, h * 3);
      gg.restore();
    } else if (this.warm < 0.5) {
      gg.save();
      gg.globalCompositeOperation = 'multiply';
      gg.fillStyle = rgb(mix([222, 230, 244], [255, 255, 255], this.warm * 2));
      gg.fillRect(-w, -h, w * 3, h * 3);
      gg.restore();
    }
    // shafts of light from the opening sky
    if (this.sunUp > 0.04) {
      gg.save();
      gg.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const spread = 0.07 + i * 0.07;
        const g2 = gg.createLinearGradient(sun.x, sun.y, sun.x - this.geo.sunSide * w * 0.25, h);
        g2.addColorStop(0, `rgba(255,236,186,${0.06 * this.sunUp})`);
        g2.addColorStop(1, 'rgba(255,224,160,0)');
        gg.fillStyle = g2;
        gg.beginPath();
        gg.moveTo(sun.x - w * spread * 0.28, sun.y);
        gg.lineTo(sun.x + w * spread * 0.28, sun.y);
        gg.lineTo(sun.x + w * spread * 1.4 - this.geo.sunSide * w * 0.26, h + 20);
        gg.lineTo(sun.x - w * spread * 1.4 - this.geo.sunSide * w * 0.3, h + 20);
        gg.closePath();
        gg.fill();
      }
      gg.restore();
    }
    // a cold wash inside the fir's shade, so "safe" is a colour, not a rule
    if (this.sunUp > 0.08) {
      const s = this.geo.shade;
      gg.save();
      gg.globalCompositeOperation = 'multiply';
      const cg = gg.createRadialGradient(s.x, s.y - unit * 0.18, 0, s.x, s.y - unit * 0.18, s.rx * 1.25);
      cg.addColorStop(0, rgb(mix([255, 255, 255], [156, 182, 226], 0.85 * this.sunUp)));
      cg.addColorStop(1, 'rgb(255,255,255)');
      gg.fillStyle = cg;
      gg.beginPath();
      gg.ellipse(s.x, s.y - unit * 0.18, s.rx * 1.25, s.rx * 1.1, 0, 0, Math.PI * 2);
      gg.fill();
      gg.restore();
    }
    const v = gg.createRadialGradient(w / 2, h * 0.52, Math.min(w, h) * 0.34, w / 2, h * 0.52, Math.max(w, h) * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(18,28,48,0.24)');
    gg.fillStyle = v;
    gg.fillRect(-w, -h, w * 3, h * 3);
  }

  // ---------------------------------------------------------------- input

  pointer(e: PointerEvt): void {
    const prevX = this.px;
    this.px = e.x;
    this.py = e.y;
    if (e.type === 'down') {
      this.grab(e.x, e.y);
      return;
    }
    if (e.type === 'move') {
      if (this.heldKind === 'stack') {
        const g = this.geo;
        const nx = clamp(e.x + (this.held as Ball).grabDX, g.unit * 0.1, g.w - g.unit * 0.1);
        const dx = nx - this.snowX;
        this.snowX = nx;
        this.snowLeanV -= dx * 0.9;
        this.snowLean = clamp(this.snowLean, -0.9, 0.9);
        for (const b of this.stack) b.wob = Math.min(1, b.wob + Math.abs(dx) * 0.004);
        this.layoutStack();
      } else if (this.heldKind === 'cloud') {
        this.cloud.x = e.x + this.cloud.grabDX;
        this.cloud.y = clamp(e.y + this.cloud.grabDY, this.geo.unit * 0.05, this.geo.horizonY * 0.82);
      } else if (this.heldKind === 'umbrella') {
        const g = this.geo;
        this.umbrella.rot = clamp((e.x - prevX) * -0.006 + this.umbrella.rot * 0.9, -0.35, 0.35);
        void g;
      }
      return;
    }
    // up
    this.release(e);
  }

  private grab(x: number, y: number): void {
    const g = this.geo;
    const ph = this.ctx.phase;
    const reach = g.unit * 0.075;

    // the sky first, but only where there is sky
    if (y < g.horizonY * 0.92 && Math.hypot(x - this.cloud.x, (y - this.cloud.y) * 1.5) < this.cloud.r * 1.15) {
      this.cloud.held = true;
      this.heldKind = 'cloud';
      this.held = null;
      this.cloud.grabDX = this.cloud.x - x;
      this.cloud.grabDY = this.cloud.y - y;
      this.ctx.audio.whoosh(0.25, 0.4);
      return;
    }

    const cand: Array<{ d: number; fn: () => void }> = [];
    const add = (px: number, py: number, pad: number, fn: () => void) => {
      const d = Math.hypot(x - px, y - py) - pad;
      if (d < reach) cand.push({ d, fn });
    };

    if (this.hat.state === 'ground' || this.hat.state === 'fallen') {
      add(this.hat.x, this.hat.y - g.unit * 0.04, g.unit * 0.075, () => {
        this.hat.state = 'held';
        this.hat.grabDX = 0;
        this.hat.grabDY = -g.unit * 0.05;
        this.heldKind = 'hat';
        this.held = this.hat;
        this.ctx.audio.flump(0);
      });
    }
    if (this.carrot.state === 'ground' || this.carrot.state === 'fallen') {
      add(this.carrot.x, this.carrot.y, g.unit * 0.06, () => {
        this.carrot.state = 'held';
        this.carrot.grabDX = 0;
        this.carrot.grabDY = -g.unit * 0.02;
        this.carrot.rot = g.sunSide > 0 ? 0 : Math.PI;
        this.heldKind = 'carrot';
        this.held = this.carrot;
        this.ctx.audio.drop(1.5);
      });
    }
    add(this.umbrella.x, this.umbrella.y - g.unit * 0.19, g.unit * 0.11, () => {
      this.umbrella.state = 'held';
      this.umbrella.grabDX = 0;
      this.umbrella.grabDY = g.unit * 0.19;
      this.heldKind = 'umbrella';
      this.held = this.umbrella;
      this.ctx.audio.whoosh(0.3, 0.35);
    });

    for (const b of this.balls) {
      if (b.x < -1000) continue;
      if (b.state === 'ground') {
        add(b.x, b.y - this.ry(b) * 0.4, this.rx(b) * 0.95, () => this.grabBall(b, x, y));
      } else if (b.state === 'stacked') {
        add(b.x, b.y, this.rx(b) * 0.95, () => this.grabStacked(b, x, y));
      }
    }

    cand.sort((a, b) => a.d - b.d);
    if (cand.length) {
      cand[0].fn();
      return;
    }
    if (ph.is('comic', 'settle')) this.leave();
  }

  private grabBall(b: Ball, x: number, y: number): void {
    b.state = 'held';
    b.vy = 0;
    b.grabDX = b.x - x;
    b.grabDY = clamp(b.y - y, -this.geo.unit * 0.06, this.geo.unit * 0.06);
    this.held = b;
    this.heldKind = 'ball';
    this.crunch = this.geo.unit * 0.05;
    this.ctx.audio.drop(0.3);
  }

  private grabStacked(b: Ball, x: number, y: number): void {
    const isTop = this.stack[this.stack.length - 1] === b;
    const canLift = this.ctx.phase.is('establish', 'action') && isTop;
    if (canLift) {
      this.stack.pop();
      b.state = 'held';
      this.grabBall(b, x, y);
      if (this.hat.state === 'on') {
        this.hat.state = 'ground';
        this.hat.x = b.x;
        this.hat.y = this.geo.groundY;
        this.hat.vy = 30;
      }
      if (this.carrot.state === 'on') {
        this.carrot.state = 'ground';
        this.carrot.x = b.x + this.geo.unit * 0.06;
        this.carrot.y = this.geo.groundY;
        this.carrot.rot = 1.4;
      }
      for (const p of this.pebbles) if (p.state === 'on') p.state = 'ground';
      this.face = 0;
      this.built = false;
      this.builtT = -1;
      return;
    }
    // the whole fellow comes along, wobbling
    this.held = b;
    this.heldKind = 'stack';
    b.grabDX = this.snowX - x;
    for (const s of this.stack) s.wob = Math.max(s.wob, 0.35);
    this.ctx.audio.thump(0.7);
    this.replayArmed = false;
  }

  private release(e: PointerEvt): void {
    const g = this.geo;
    const kind = this.heldKind;
    this.heldKind = null;
    this.cloud.held = false;
    const h = this.held;
    this.held = null;
    if (kind === 'cloud') {
      this.cloud.vx = g.unit * 0.0006;
      return;
    }
    if (kind === 'stack') {
      for (const s of this.stack) s.wob = Math.max(s.wob, 0.5);
      // restarting the loop from the melted lump
      if (this.ctx.phase.is('settle') && this.ending === 'melted') this.restartLoop();
      return;
    }
    if (kind === 'umbrella') {
      this.umbrella.state = 'ground';
      this.umbrella.x = clamp(this.umbrella.x, g.unit * 0.08, g.w - g.unit * 0.08);
      this.umbrella.y = g.groundY - g.unit * 0.008;
      this.umbrella.rot = clamp(this.umbrella.rot, -0.2, 0.2);
      this.ctx.audio.thump(1.2);
      for (let i = 0; i < 7; i++) this.puff(this.umbrella.x, g.groundY, 0.6);
      return;
    }
    if (kind === 'hat') {
      const t = this.top();
      const s = this.hatSeat();
      if (t && s && Math.hypot(this.hat.x - s.x, this.hat.y - s.y) < this.rx(t) * 1.9) {
        this.hat.state = 'on';
        this.hat.rot = 0;
        this.ctx.audio.flump(0.2);
        for (let i = 0; i < 8; i++) this.puff(s.x, s.y, 0.7);
      } else {
        this.hat.state = 'ground';
        this.hat.vy = 60;
        this.hat.rot = this.rng.range(-0.3, 0.3);
      }
      return;
    }
    if (kind === 'carrot') {
      const f = this.facePt();
      if (f && Math.hypot(this.carrot.x - f.x, this.carrot.y - f.y) < f.r * 1.5) {
        this.carrot.state = 'on';
        // the eyes and the mouth arrive by themselves: two pebbles is one drag
        // too many for a four-year-old, and the reveal is nicer as a surprise
        for (const p of this.pebbles) p.state = 'on';
        this.face = 1;
        this.built = true;
        this.ctx.audio.plip(1.5);
        this.frostSparkle();
      } else {
        this.carrot.state = 'ground';
        this.carrot.vy = 40;
        this.carrot.vr = this.rng.range(-3, 3);
      }
      return;
    }
    if (kind === 'ball' && h) {
      const b = h as Ball;
      b.state = 'ground';
      b.vy = clamp(e.vy, -200, 600) * 0.2;
      // does it land on something?
      const target = this.dropTarget(b);
      if (target) {
        this.stackOnto(b, target);
      } else if (b.y >= g.groundY - 2) {
        b.y = g.groundY;
        b.vy = 0;
        for (let i = 0; i < 5; i++) this.puff(b.x, g.groundY, 0.6);
      }
    }
  }

  /** the ball you just let go of ON TOP of, if any. There is only ever one
   *  snowman, so once a stack exists only its top ball can take another. */
  private dropTarget(b: Ball): Ball | null {
    const cands: Ball[] = this.stack.length
      ? [this.stack[this.stack.length - 1]]
      : this.balls.filter((o) => o !== b && o.state === 'ground' && o.x > -1000);
    let best: Ball | null = null;
    let bd = 1e9;
    for (const o of cands) {
      if (o === b) continue;
      const dx = Math.abs(b.x - o.x);
      const dy = b.y - o.y;
      // forgiving sideways, but it really does have to be held above the other
      // one: a ball merely rolled up alongside must not climb on by itself
      if (dx < (this.rx(b) + this.rx(o)) * 1.3 && dy < -this.ry(o) * 0.28 && dy > -this.ry(o) * 6) {
        const d = dx + Math.abs(dy) * 0.25;
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
    }
    return best;
  }

  private stackOnto(b: Ball, target: Ball): void {
    if (target.state !== 'stacked' && this.stack.length) return;
    if (target.state !== 'stacked') {
      // the target becomes the base of a new snowman, right where it stands
      this.stack = [target];
      target.state = 'stacked';
      this.snowX = target.x;
      this.snowLean = 0;
      this.snowLeanV = 0;
    }
    b.state = 'stacked';
    this.stack.push(b);
    b.squash = 0.8;
    // a bigger ball on a smaller one gets the wobble
    const below = this.stack[this.stack.length - 2];
    const heavy = b.r > below.r * 1.02;
    b.wob = heavy ? 1 : 0.45;
    below.wob = Math.max(below.wob, heavy ? 0.7 : 0.25);
    this.layoutStack();
    this.ctx.audio.thump(heavy ? 0.7 : 0.95);
    this.ctx.audio.flump(0);
    for (let i = 0; i < 16; i++) this.puff(b.x + this.rng.range(-this.rx(b), this.rx(b)), b.y + this.ry(b) * 0.85, 0.9);
  }

  private restartLoop(): void {
    // the leftover lump is a perfectly good snowball. the sky closes again.
    this.ending = 'none';
    this.lidTarget = 1;
    this.sunUpTarget = 0;
    this.puddle = Math.max(0, this.puddle * 0.4);
    this.wetGround = 0;
    this.replayArmed = true;
    const keep = this.stack[0];
    for (const b of this.balls) {
      if (b === keep) continue;
      b.state = 'ground';
      b.melt = 0;
      b.sheen = 0;
      b.r = this.geo.ballHome[this.balls.indexOf(b)].r * 0.72;
      const off = [-1.15, 1.05, 1.95][this.balls.indexOf(b)] ?? 1;
      b.x = clamp(this.snowX + off * this.geo.unit * 0.2, this.geo.unit * 0.1, this.geo.w - this.geo.unit * 0.1);
      b.y = this.geo.groundY;
    }
    if (keep) {
      this.stack = [keep];
      keep.melt = 0.34;
    }
    this.hat.state = 'ground';
    this.carrot.state = 'ground';
    for (const p of this.pebbles) p.state = 'ground';
    this.face = 0;
    this.built = false;
    this.builtT = -1;
    this.ctx.phase.set('action');
    this.ctx.audio.whoosh(0.4, 1.4);
  }

  // ---------------------------------------------------------------- dev

  private devSunOut(): void {
    this.lidTarget = 0.08;
    this.sunUpTarget = 1;
    this.lid = 0.08;
    this.sunUp = 1;
    this.warm = 1;
    this.sharp = 1;
    this.cloud.x = this.geo.cloudHome.x - this.geo.w * 0.18;
    this.branchSnow = 0;
    this.clumpDone = true;
  }

  private devMelt(amount: number): void {
    this.devSunOut();
    for (const b of this.stack) {
      b.melt = clamp(amount * (1 + (this.stack.length - 1 - this.stack.indexOf(b)) * 0), 0, 0.95);
      b.sheen = 0.8;
    }
    this.hatSlide = clamp((amount - 0.18) * 1.5, 0, 1) * 0.9;
    this.puddle = amount * 0.65;
    this.wetGround = 1;
    this.layoutStack();
  }

  readonly devActions: DevAction[] = [
    {
      name: 'snowman:build',
      run: () => {
        this.buildSnowman();
        this.frostSparkle();
        this.ctx.audio.bloom();
      },
    },
    {
      name: 'sun:out',
      run: () => {
        this.devSunOut();
        this.ctx.audio.whoosh(0.45, 1.6);
      },
    },
    {
      name: 'sun:hide',
      run: () => {
        this.lidTarget = 1;
        this.sunUpTarget = 0;
        this.lid = 1;
        this.sunUp = 0;
        this.warm = 0;
        this.sharp = 0;
      },
    },
    {
      name: 'cloud:over-sun',
      run: () => {
        this.cloud.x = this.geo.sun.x;
        this.cloud.y = this.geo.sun.y;
        this.cloud.vx = this.geo.unit * 0.0003;
      },
    },
    {
      name: 'fail:half',
      run: () => {
        const ph = this.ctx.phase;
        ph.set('trouble');
        ph.intervening = true;
        this.ending = 'none';
        this.buildSnowman();
        this.devMelt(0.52);
        this.troubleT = 6;
        // the carrot is on its way down but still attached
        this.carrot.state = 'on';
        for (let i = 0; i < 5; i++) {
          this.bits.push({
            x: this.snowX + this.rng.range(-20, 20),
            y: this.stack[0].y,
            vx: 0,
            vy: this.rng.range(30, 180),
            life: 1.2,
            max: 1.2,
            r: this.geo.unit * 0.008,
            kind: 1,
            spin: 0,
          });
        }
      },
    },
    {
      name: 'fail:melted',
      run: () => {
        const g = this.geo;
        const ph = this.ctx.phase;
        this.buildSnowman();
        this.devSunOut();
        ph.set('resolve');
        ph.intervening = false;
        this.ending = 'melted';
        // one small lump left, hat on it, carrot beside, pebbles like eyes
        const keep = this.stack[0];
        for (const b of this.balls) {
          if (b === keep) continue;
          b.state = 'ground';
          b.x = -9999;
        }
        this.stack = [keep];
        keep.state = 'stacked';
        keep.melt = 0.8;
        keep.sheen = 0.5;
        this.meltedMass = 2;
        this.snowX = g.buildX;
        this.layoutStack();
        this.hatSlide = 0.1;
        this.hat.state = 'on';
        this.carrot.state = 'fallen';
        this.carrot.x = g.buildX + g.sunSide * g.unit * 0.17;
        this.carrot.y = g.groundY + g.unit * 0.012;
        this.carrot.rot = g.sunSide * 0.25 + (g.sunSide > 0 ? 0 : Math.PI);
        this.carrot.vy = 0;
        this.pebbles[0].state = 'fallen';
        this.pebbles[0].x = g.buildX - g.unit * 0.1;
        this.pebbles[0].y = g.groundY + g.unit * 0.028;
        this.pebbles[1].state = 'fallen';
        this.pebbles[1].x = g.buildX - g.unit * 0.05;
        this.pebbles[1].y = g.groundY + g.unit * 0.036;
        for (const p of this.pebbles) {
          p.vy = 0;
          p.vx = 0;
        }
        this.puddle = 1;
        this.wetGround = 1;
        this.face = 0;
        this.bird.state = 'hat';
        this.bird.t = 1;
        this.bird.shiver = 0.6;
        const s = this.hatSeat();
        this.bird.x = s ? s.x : g.buildX;
        this.bird.y = (s ? s.y : g.groundY) - g.unit * 0.13;
      },
    },
    {
      name: 'demo:mid-drag',
      run: () => {
        const g = this.geo;
        this.ctx.phase.set('action');
        this.homeBalls();
        this.trail = [];
        // clear the lane so the rolling ball is the only thing in it
        this.balls[0].x = -9999;
        this.balls[2].x = -9999;
        const b = this.balls[1];
        b.state = 'held';
        b.grabDX = 0;
        b.grabDY = 0;
        this.held = b;
        this.heldKind = 'ball';
        // roll it a good stretch so the trail, the seam and the puff all read
        const from = g.w * (g.o === 'portrait' ? 0.8 : 0.72);
        const to = g.w * (g.o === 'portrait' ? 0.47 : 0.47);
        this.px = from;
        this.py = g.groundY;
        b.x = from;
        b.y = g.groundY;
        const steps = 70;
        for (let i = 1; i <= steps; i++) {
          this.px = lerp(from, to, i / steps);
          this.updateBalls(1 / 60);
        }
        for (let i = 0; i < 26; i++) {
          this.bits.push({
            x: b.x - this.rx(b) * this.rng.range(0.3, 1.5),
            y: g.groundY + this.rng.range(-6, 3),
            vx: this.rng.range(-130, -10),
            vy: this.rng.range(-190, -20),
            life: this.rng.range(0.35, 0.8),
            max: 0.8,
            r: this.rng.range(1.4, 4.2),
            kind: 0,
            spin: 0,
          });
        }
        this.ctx.audio.drop(0.3);
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
      lid: +this.lid.toFixed(2),
      sunUp: +this.sunUp.toFixed(2),
      warm: +this.warm.toFixed(2),
      sharp: +this.sharp.toFixed(2),
      heat: +this.heat.toFixed(2),
      shade: +this.shadeCover.toFixed(2),
      savedFor: +this.savedFor.toFixed(2),
      puddle: +this.puddle.toFixed(2),
      snowX: Math.round(this.snowX),
      stack: this.stack.map((b) => ({ r: Math.round(b.r), melt: +b.melt.toFixed(2) })),
      loose: this.balls.filter((b) => b.state === 'ground' && b.x > -1000).length,
      built: this.isBuilt(),
      builtFlag: this.built,
      hat: this.hat.state,
      carrot: this.carrot.state,
      umbrellaX: Math.round(this.umbrella.x),
      cloudX: Math.round(this.cloud.x),
      bird: this.bird.state,
      held: this.heldKind,
      topXY: (() => {
        const t = this.top();
        return t ? [Math.round(t.x), Math.round(t.y), Math.round(this.rx(t))] : null;
      })(),
      hatSeatXY: (() => {
        const s2 = this.hatSeat();
        return s2 ? [Math.round(s2.x), Math.round(s2.y)] : null;
      })(),
      faceXY: (() => {
        const f = this.facePt();
        return f ? [Math.round(f.x), Math.round(f.y)] : null;
      })(),
      ballsXY: this.balls.map((b) => [Math.round(b.x), Math.round(b.y), Math.round(this.rx(b)), b.state]),
      propsXY: {
        hat: [Math.round(this.hat.x), Math.round(this.hat.y)],
        carrot: [Math.round(this.carrot.x), Math.round(this.carrot.y)],
        umbrella: [Math.round(this.umbrella.x), Math.round(this.umbrella.y)],
        cloud: [Math.round(this.cloud.x), Math.round(this.cloud.y), Math.round(this.cloud.r)],
      },
      ground: Math.round(this.geo.groundY),
      shadeX: Math.round(this.geo.shade.x),
      bits: this.bits.length,
      trail: this.trail.length,
      meltedMass: this.meltedMass,
    };
  }

  // ---------------------------------------------------------------- hub tile

  thumbnail(gg: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    // an 8-second loop: the lid opens, he starts to go, a cloud saves him
    const cyc = (t % 9) / 9;
    const sun = smooth((cyc - 0.12) / 0.2) * (1 - smooth((cyc - 0.72) / 0.12));
    const melt = smooth((cyc - 0.38) / 0.3) * (1 - smooth((cyc - 0.76) / 0.1)) * 0.45;
    const warm = sun;

    const sky = gg.createLinearGradient(0, 0, 0, h * 0.62);
    sky.addColorStop(0, rgb(mix([150, 163, 180], [104, 170, 218], warm)));
    sky.addColorStop(1, rgb(mix([214, 219, 226], [206, 230, 244], warm)));
    gg.fillStyle = sky;
    gg.fillRect(0, 0, w, h);

    // bright spot / sun
    const sx = w * 0.78;
    const sy = h * 0.19;
    const bg = gg.createRadialGradient(sx, sy, 0, sx, sy, h * 0.42);
    bg.addColorStop(0, `rgba(255,250,224,${0.35 + sun * 0.35})`);
    bg.addColorStop(1, 'rgba(255,246,210,0)');
    gg.fillStyle = bg;
    gg.fillRect(0, 0, w, h);
    if (sun > 0.05) {
      gg.fillStyle = `rgba(255,250,226,${sun})`;
      gg.beginPath();
      gg.arc(sx, sy, h * 0.058, 0, Math.PI * 2);
      gg.fill();
    }

    // ground
    const gy = h * 0.68;
    const gr = gg.createLinearGradient(0, gy - h * 0.06, 0, h);
    gr.addColorStop(0, rgb(mix([226, 233, 244], [248, 246, 234], warm)));
    gr.addColorStop(1, rgb(mix([238, 244, 252], [255, 250, 226], warm)));
    gg.fillStyle = gr;
    gg.fillRect(0, gy - h * 0.06, w, h);

    // fir on the left with its pool of shade
    gg.fillStyle = `rgba(100,130,176,${0.1 + sun * 0.22})`;
    gg.beginPath();
    gg.ellipse(w * 0.17, gy + h * 0.06, w * 0.2, h * 0.05, 0, 0, Math.PI * 2);
    gg.fill();
    gg.fillStyle = 'rgb(58,70,64)';
    gg.fillRect(w * 0.165, gy - h * 0.02, w * 0.02, h * 0.1);
    for (let i = 0; i < 3; i++) {
      const y = gy - h * (0.02 + i * 0.1);
      const sp = w * (0.14 - i * 0.032);
      gg.fillStyle = rgb(mix([46, 74, 68], [58, 92, 74], warm));
      gg.beginPath();
      gg.moveTo(w * 0.175, y - h * 0.16);
      gg.lineTo(w * 0.175 + sp, y);
      gg.lineTo(w * 0.175 - sp, y);
      gg.closePath();
      gg.fill();
    }

    // snowman
    const cx = w * 0.56;
    const rs = [h * 0.11, h * 0.082, h * 0.06];
    let yy = gy + h * 0.04;
    const cy: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = rs[i] * (1 - melt * 0.5);
      const ry = r * (1 - melt * 0.3);
      const y = yy - ry * 0.85;
      cy.push(y);
      const bgd = gg.createRadialGradient(cx - r * 0.4, y - r * 0.4, 0, cx, y, r * 1.3);
      bgd.addColorStop(0, rgb(mix([246, 250, 255], [255, 252, 236], warm)));
      bgd.addColorStop(1, rgb(mix([186, 200, 224], [190, 200, 226], warm)));
      gg.fillStyle = bgd;
      gg.beginPath();
      gg.ellipse(cx, y, r * (1 + melt * 0.4), ry, 0, 0, Math.PI * 2);
      gg.fill();
      yy = y - ry * 0.82;
    }
    // face + hat
    const hy = cy[2];
    const hr = rs[2] * (1 - melt * 0.5);
    gg.fillStyle = 'rgb(56,54,60)';
    for (const s of [-1, 1]) {
      gg.beginPath();
      gg.arc(cx + s * hr * 0.34, hy - hr * 0.22, hr * 0.11, 0, Math.PI * 2);
      gg.fill();
    }
    gg.fillStyle = 'rgb(240,136,46)';
    gg.beginPath();
    gg.moveTo(cx + hr * 0.1, hy - hr * 0.02);
    gg.lineTo(cx + hr * 0.75, hy + hr * 0.06);
    gg.lineTo(cx + hr * 0.1, hy + hr * 0.16);
    gg.closePath();
    gg.fill();
    gg.fillStyle = 'rgb(214,74,60)';
    const hty = hy - hr * (0.85 - melt * 0.2);
    gg.beginPath();
    gg.moveTo(cx - hr * 0.85, hty);
    gg.lineTo(cx - hr * 0.62, hty - hr * 0.8);
    gg.lineTo(cx + hr * 0.62, hty - hr * 0.8);
    gg.lineTo(cx + hr * 0.85, hty);
    gg.closePath();
    gg.fill();

    // a drip while the sun is on him
    if (melt > 0.04) {
      const dt2 = (t * 1.3) % 1.1;
      gg.fillStyle = 'rgba(150,196,232,0.95)';
      gg.beginPath();
      gg.ellipse(cx + hr * 0.7, cy[1] + dt2 * h * 0.2, h * 0.012, h * 0.02, 0, 0, Math.PI * 2);
      gg.fill();
      gg.fillStyle = `rgba(150,180,210,${0.5 * melt * 2})`;
      gg.beginPath();
      gg.ellipse(cx, gy + h * 0.055, h * 0.1 * melt * 2.2, h * 0.025 * melt * 2.2, 0, 0, Math.PI * 2);
      gg.fill();
    }

    // the cloud that comes to the rescue
    const ccx = lerp(-w * 0.3, w * 1.3, clamp((cyc - 0.55) / 0.35, 0, 1));
    if (cyc > 0.5) {
      gg.fillStyle = 'rgba(250,252,255,0.97)';
      gg.beginPath();
      for (const s of [
        [-0.55, 0.08, 0.5],
        [0, -0.2, 0.72],
        [0.55, 0.06, 0.55],
      ]) {
        gg.moveTo(ccx + s[0] * h * 0.3 + h * 0.2 * s[2], sy + s[1] * h * 0.2);
        gg.arc(ccx + s[0] * h * 0.3, sy + s[1] * h * 0.2, h * 0.2 * s[2], 0, Math.PI * 2);
      }
      gg.fill();
    }

    // a few flakes when the sky is shut
    const cold = 1 - sun;
    if (cold > 0.15) {
      gg.fillStyle = `rgba(255,255,255,${0.6 * cold})`;
      for (let i = 0; i < 12; i++) {
        const fx = ((i * 97.3) % 100) / 100 * w;
        const fy = (((i * 53.7) % 100) / 100 * h + t * (12 + i)) % h;
        gg.beginPath();
        gg.arc(fx, fy, 1.3, 0, Math.PI * 2);
        gg.fill();
      }
    }
  }
}

export const episode: Episode = new Snowman();
