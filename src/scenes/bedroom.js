import { Scene } from './scene.js';
import { State } from '../debris/base.js';
import { DustBunny } from '../debris/dustBunny.js';
import { PetHair } from '../debris/petHair.js';
import { Cushion } from '../debris/cushion.js';
import { BossBunny, CoreBit } from '../debris/bossBunny.js';
import { makeBedroomFloor } from '../floors/bedroom.js';
import { makeCanvas } from '../floors/floor.js';
import { Prop, resolveProps } from '../props/prop.js';
import { Airborne } from '../core/airborne.js';
import { LightLayer } from '../core/light.js';
import {
  makeBedImage, drawBed, drawSkirt, drawUnderSlot, makeUnderWallImage,
  drawUnderWallImage, makeBedLeg, makeSlipper, drawSparkle, underness,
} from '../props/bed.js';
import { clamp, lerp, smoothstep, TAU, noise1 } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };
const SP = { x: 0, y: 0 };
const VR = { x0: 0, y0: 0, x1: 0, y1: 0 };

/**
 * Room 13 — the bedroom. The last room in the house, and the biggest thing in it.
 *
 * Part one is a surface that is not the floor. Two or three cushions have ended
 * up on the bedside mat, and they are fabric: the weave BULGES up into the mouth
 * as the head passes over, higher the closer and the longer you hold; pet hair
 * that has been trodden into that weave stands up, leans, and then streams out
 * of it a hair at a time for as long as you hover; and the cushion brightens
 * where it has been worked, so what is left to do is written on the thing
 * itself. Hold on one and the fabric is sucked flat onto the intake — the motor
 * labours — and letting go is a soft fwump. They are also just cushions: shove
 * one and it scoots, and there is a ring of hair underneath it.
 *
 * Part two is under the bed. The skirt hides the cavity, and one enormous edge
 * of fluff sticks out from under it, swaying in the idle air: the invitation.
 * Going under drops and darkens the camera and lights the headlight, exactly as
 * the sofa does (same core services, not the sofa's code). Down there: a few
 * small bunnies, a lost slipper that can only ever be tugged and shoved, and the
 * boss — a dust bunny three times the mother, which cannot be pulled at all. A
 * hold tears tufts off it, they fly up the tube, it thins, its core shows
 * through, and only then does it let go: a slide, a long teardrop, and the
 * biggest gulp in the game.
 *
 * The cup fills during that fight. That is the point: the bin is by the door.
 */
export class BedroomScene extends Scene {
  constructor(rng) {
    super('bedroom', rng);
    this.light = new LightLayer();
    this.light.scale = 0.42;
    this.light.darkColor = '6,6,22';        // night-blue, so the beam is warm against it
    this.light.glowColor = '255,206,142';
    this.air = new Airborne(220, {
      kinds: {
        // a tuft is several fibres at once: big enough to watch ride the tube,
        // and heavy enough in the cup that the boss fills it on its own
        tuft: { color: '#ded5c4', drag: 2.7, gravity: 62, r: 6.6, life: 3.2, lift: 1.2 },
      },
    });
    this.u = 0;
    this.wipe = 0;
    this.cushions = [];
    this.motes = [];
    this.sparks = [];
    this.sparkles = [];
    this.boss = null;
    this.hem = new Float32Array(15);
    this.t = 0;
    this.bright = 0;
    this._camReady = false;
  }

  _p(nx, ny) { return { x: (nx - 0.5) * this.vw, y: (ny - 0.5) * this.vh }; }

  // ------------------------------------------------------------- layout

  layout(pose, w, h) {
    super.layout(pose, w, h);
    const vw = this.vw, vh = this.vh, rng = this.rng;
    this.debris.length = 0;
    this.props.length = 0;
    this.cushions.length = 0;
    this.sparks.length = 0;
    this.air.reset();
    this.u = 0; this.wipe = 0; this._camReady = false;
    this.rest = { x: 0, y: 0, zoom: this.scale, tilt: 0 };
    const portrait = pose === 'portrait';
    this.leadPx = portrait ? 92 : 78;

    let cushionAt, hairAt, clumps, bossAt, slipperAt, legs, binAt, mat, sparkAt;

    if (portrait) {
      // DEPTH: the cushions are near, the bed is across the far end, and going
      // under it is going away from the viewer.
      this.startPointer = { x: 0.5, y: 0.84 };
      this.bed = { x0: -vw * 0.47, x1: vw * 0.47, yEdge: -vh * 0.08, yBack: -vh * 0.92, gap: 54 };
      this.cave = { x: 0, y: -vh * 0.46, zoom: this.scale * 1.26, tilt: 0.44 };
      this.follow = { x: vw * 0.12, y: vh * 0.15 };
      this.exitCam = { x: 0, y: vh * 0.52, zoom: this.scale * 1.02, tilt: 0.08 };
      mat = { x: -vw * 0.02, y: vh * 0.16, rx: vw * 0.46, ry: vh * 0.15 };
      cushionAt = [
        [-vw * 0.26, vh * 0.07, 152, 114, '#8fa9c4', '#c6dbee'],
        [vw * 0.22, vh * 0.17, 134, 102, '#c08fa8', '#edc8da'],
        [-vw * 0.24, vh * 0.29, 122, 94, '#93bfa6', '#c9e8d6'],
      ];
      hairAt = [[0, -0.22, -0.18], [0, 0.24, 0.16], [1, -0.20, 0.18], [1, 0.22, -0.16], [2, 0.0, -0.10]];
      clumps = [[-0.25, -0.28, 21], [0.26, -0.38, 23], [-0.07, -0.50, 19]];
      bossAt = { x: -vw * 0.03, y: -vh * 0.72, r: 132 };
      slipperAt = { x: vw * 0.24, y: -vh * 0.20, a: 0.42 };
      legs = [[-0.40, -0.09], [0.40, -0.09], [-0.40, -0.90], [0.40, -0.90]];
      binAt = { x: vw * 0.32, y: vh * 0.30 };
      sparkAt = [[-0.22, 0.02], [0.10, -0.03], [0.28, 0.10], [-0.06, 0.12]];
    } else {
      // WIDTH: a long bed side. Going under is going UP under it, into a wide
      // shallow cavity you travel along.
      this.startPointer = { x: 0.12, y: 0.80 };
      this.bed = { x0: -vw * 0.60, x1: vw * 0.62, yEdge: -vh * 0.10, yBack: -vh * 0.95, gap: 46 };
      this.cave = { x: vw * 0.02, y: -vh * 0.40, zoom: this.scale * 1.06, tilt: 0.38 };
      this.follow = { x: vw * 0.26, y: vh * 0.07 };
      this.exitCam = { x: vw * 0.50, y: vh * 0.16, zoom: this.scale * 1.02, tilt: 0.06 };
      mat = { x: -vw * 0.06, y: vh * 0.14, rx: vw * 0.34, ry: vh * 0.22 };
      cushionAt = [
        [-vw * 0.22, vh * 0.10, 150, 112, '#8fa9c4', '#c6dbee'],
        [-vw * 0.04, vh * 0.19, 132, 100, '#c08fa8', '#edc8da'],
        [vw * 0.12, vh * 0.05, 120, 92, '#93bfa6', '#c9e8d6'],
      ];
      hairAt = [[0, -0.22, -0.16], [0, 0.22, 0.18], [1, -0.20, 0.16], [1, 0.24, -0.14], [2, 0.02, -0.08]];
      clumps = [[-0.42, -0.34, 21], [-0.14, -0.52, 23], [0.06, -0.38, 19]];
      bossAt = { x: vw * 0.42, y: -vh * 0.66, r: 126 };
      slipperAt = { x: -vw * 0.24, y: -vh * 0.30, a: -0.3 };
      legs = [[-0.555, -0.115], [0.575, -0.115], [-0.555, -0.905], [0.575, -0.905]];
      binAt = { x: vw * 0.42, y: vh * 0.15 };
      sparkAt = [[-0.30, 0.02], [-0.02, 0.10], [0.22, -0.02], [0.40, 0.08]];
    }

    const b = this.bed;
    this.floor = makeBedroomFloor(
      portrait
        ? { x0: -vw * 0.66, y0: -vh * 1.05, x1: vw * 0.66, y1: vh * 0.66 }
        : { x0: -vw * 0.78, y0: -vh * 1.10, x1: vw * 0.92, y1: vh * 0.72 },
      rng, { horizontal: !portrait, plankW: portrait ? 86 : 80, mat,
        pool: { x: portrait ? vw * 0.36 : -vw * 0.40, y: portrait ? vh * 0.34 : vh * 0.16, r: vw * 0.42 } });

    // ---- the cushions, and the hair trodden into them ---------------------
    for (let i = 0; i < cushionAt.length; i++) {
      const [x, y, cw, ch, col, cl2] = cushionAt[i];
      const c = new Cushion(x, y, cw, ch, rng, { color: col, cleanColor: cl2 });
      this.cushions.push(c);
    }
    for (let i = 0; i < hairAt.length; i++) {
      const [ci, ux, uy] = hairAt[i];
      const c = this.cushions[ci];
      const p = new PetHair(c.x + ux * c.w, c.y + uy * c.h, rng, { host: c, anchored: true });
      p.onHair = (hx, hy) => { c.wash(hx, hy, 46, 0.5); this._spark(hx, hy, 3); };
      c.hairs.push(p);
      this.debris.push(p);
    }
    // the ring of hair each cushion has been sitting on: hidden until it is
    // shoved off its spot, and a bonus rather than a chore (decor)
    for (let i = 0; i < this.cushions.length; i++) {
      const c = this.cushions[i];
      const ring = new PetHair(c.homeX, c.homeY, rng, { n: 7, spread: c.w * 0.32, anchored: true });
      ring.decor = true; ring.dormant = true;
      ring.onHair = (hx, hy) => this._spark(hx, hy, 2);
      c.ringHair = ring;
      this.debris.push(ring);
    }

    // ---- the invitation: an edge of fluff under the skirt ------------------
    // it sits just OUT of the gap, with the hem over its far side: from the
    // lit room it is one big edge of fluff poking out from under the skirt and
    // swaying, and it can be won without going under — which is the taste of
    // what is down there that makes going under worth it
    this.sliverSpot = { x: portrait ? -vw * 0.10 : vw * 0.28, y: b.yEdge + 10 };
    this.sliver = new DustBunny(this.sliverSpot.x, this.sliverSpot.y, 42, rng);
    this.debris.push(this.sliver);

    // ---- under the bed ----------------------------------------------------
    for (let i = 0; i < clumps.length; i++) {
      const [fx, fy, r] = clumps[i];
      this.debris.push(new DustBunny(fx * vw, fy * vh, r, rng));
    }
    this.boss = new BossBunny(bossAt.x, bossAt.y, bossAt.r, rng, { air: this.air });
    this.debris.push(this.boss);
    /**
     * The boss is SOLID while it is whole. The head cannot drive through it or
     * past it: it buries itself in the fluff and stops, which is both the
     * clearest possible statement of "this one is too big" and what keeps the
     * mouth facing INTO it (drive past a thing and the cone points away from
     * it, and holding would do nothing at all). The collider goes the instant
     * it starts to slide. It stays there afterwards, too: it is what keeps the
     * head from driving over the little hard things the boss leaves behind,
     * which would put them behind the cone where no amount of holding helps.
     */
    this.bossWall = new Prop({
      x: bossAt.x, y: bossAt.y + this.boss.r * 0.85 - 45,
      shape: 'rect', w: this.boss.r * 2.6, h: 90,
      pushable: false, shadow: false, draw: () => {},
    });
    this.props.push(this.bossWall);

    this.props.push(new Prop({
      x: (b.x0 + b.x1) * 0.5, y: b.yBack + 46, shape: 'rect',
      w: (b.x1 - b.x0) + 600, h: 86, pushable: false, shadow: false, draw: () => {},
    }));
    for (let i = 0; i < legs.length; i++) this.props.push(makeBedLeg(legs[i][0] * vw, legs[i][1] * vh, 13));
    this.slipper = makeSlipper(slipperAt.x, slipperAt.y, slipperAt.a, rng);
    this.props.push(this.slipper);

    this.bedImg = makeBedImage(b, { head: portrait ? 'far' : 'left' });
    this.wallImg = makeUnderWallImage(b);
    this.sparkles = sparkAt.map(([nx, ny]) => ({ x: nx * vw, y: ny * vh + b.yEdge + vh * 0.16, ph: rng.range(0, TAU) }));
    // ...and two where the boss was, so the finale points at what was won
    this.sparkles.push({ x: bossAt.x - 30, y: bossAt.y + 20, ph: rng.range(0, TAU) });
    this.sparkles.push({ x: bossAt.x + 34, y: bossAt.y - 14, ph: rng.range(0, TAU) });
    this._buildFilm();
    this._replayClean();
    this._buildMotes();
    this._restoreRoom();

    this.clearStartZone(200, this.leadPx);
    this.placeBin(binAt);
    // where a shoved cushion is allowed to end up: inside the nozzle's reach,
    // with a little room to spare, and never under the bed
    this.pushRect = portrait
      ? { x0: -vw * 0.26, x1: vw * 0.26, y0: b.yEdge + 60, y1: vh * 0.32 }
      : { x0: -vw * 0.34, x1: vw * 0.34, y0: b.yEdge + 50, y1: vh * 0.20 };
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (typeof d.hx === 'number') { d.hx = d.x; d.hy = d.y; }
    }
  }

  /**
   * A film of dust over the cavity floor, with the gloom baked into it: one
   * half-res composite instead of a full-cavity gradient every frame, and
   * wiping the dust also lifts the gloom.
   */
  _buildFilm() {
    const b = this.bed;
    const pad = 20;
    const x = b.x0 - pad, y = b.yBack - pad;
    const w = Math.round(b.x1 - b.x0 + pad * 2), h = Math.round(b.yEdge - b.yBack + pad * 2);
    const q = 0.5;
    const canvas = makeCanvas(Math.round(w * q), Math.round(h * q));
    const g = canvas.getContext('2d');
    g.scale(q, q);
    this.film = { canvas, ctx: g, x, y, w, h, q };
    const gl = g.createLinearGradient(0, pad, 0, h - pad);
    gl.addColorStop(0, 'rgba(16,13,24,0.68)');
    gl.addColorStop(0.55, 'rgba(20,16,26,0.46)');
    gl.addColorStop(1, 'rgba(24,20,28,0.24)');
    g.fillStyle = gl;
    g.fillRect(pad, pad, w - pad * 2, h - pad * 2);
    g.fillStyle = 'rgba(172,164,150,0.30)';
    g.fillRect(pad, pad, w - pad * 2, h - pad * 2);
    const rng = this.rng;
    for (let i = 0; i < 100; i++) {
      const px = pad + rng.next() * (w - pad * 2), py = pad + rng.next() * (h - pad * 2);
      const r = rng.range(14, 52);
      const a = rng.range(0.08, 0.26);
      const grad = g.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, 'rgba(214,208,196,' + a.toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(214,208,196,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'destination-out';
    const fade = g.createLinearGradient(0, h - pad, 0, h - pad - 46);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade;
    g.fillRect(0, h - pad - 46, w, 46 + pad);
    g.globalCompositeOperation = 'source-over';
  }

  _clean(wx, wy, r, replay) {
    const f = this.film;
    if (!f) return;
    if (!replay) {
      const b = this.bed;
      const W = b.x1 - b.x0, H = b.yEdge - b.yBack;
      const list = this.persist.clean || (this.persist.clean = []);
      if (list.length < 500) {
        list.push([+((wx - b.x0) / W).toFixed(4), +((wy - b.yBack) / H).toFixed(4), +(r / W).toFixed(4)]);
      }
    }
    const g = f.ctx;
    const x = wx - f.x, y = wy - f.y;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.9)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.restore();
  }

  _replayClean() {
    const list = this.persist.clean;
    if (!list || !list.length) return;
    const b = this.bed;
    const W = b.x1 - b.x0, H = b.yEdge - b.yBack;
    for (let i = 0; i < list.length; i++) {
      this._clean(b.x0 + list[i][0] * W, b.yBack + list[i][1] * H, list[i][2] * W, true);
    }
  }

  _buildMotes() {
    const b = this.bed;
    this.motes.length = 0;
    for (let i = 0; i < 20; i++) {
      this.motes.push({
        x: this.rng.range(b.x0, b.x1), y: this.rng.range(b.yBack, b.yEdge),
        vx: this.rng.range(-6, 6), vy: this.rng.range(-5, 5),
        r: this.rng.range(0.9, 2.3), ph: this.rng.range(0, 100),
      });
    }
  }

  // ---------------------------------------------- progress across a rotation

  /**
   * An orientation change rebuilds the room, so the boss's thinning, the
   * cushions' clean masks and where the cushions were shoved to all have to be
   * put back. Everything here goes through `persist`, which survives the
   * rebuild; the debris identities are the base class's job.
   */
  saveProgress() {
    const p = super.saveProgress();
    this.persist.boss = this.boss ? { shed: this.boss.n - this.boss.fibers, r: this.boss.r } : null;
    this.persist.cushions = this.cushions.map((c) => ({
      clean: Array.from(c.clean, (v) => +v.toFixed(2)),
      // DESIGN px, not a fraction of the viewport: design units are the same
      // in both poses, so a cushion shoved 30px stays shoved 30px
      dx: Math.round(c.x - c.homeX),
      dy: Math.round(c.y - c.homeY),
    }));
    return p;
  }

  _restoreRoom() {
    const pb = this.persist.boss;
    if (pb && this.boss && pb.shed > 0) {
      // shed silently: same state, no tufts, no noise
      const boss = this.boss;
      for (let k = 0; k < pb.shed && boss.fibers > 4; k++) {
        for (let i = 0; i < boss.n; i++) {
          if (boss.fl[i] <= 0) continue;
          boss.fl[i] = 0; boss.fibers--; break;
        }
      }
      if (pb.r) boss.r = pb.r;
    }
    const pc = this.persist.cushions;
    if (pc) {
      for (let i = 0; i < this.cushions.length && i < pc.length; i++) {
        const c = this.cushions[i], s = pc[i];
        if (s.clean && s.clean.length === c.clean.length) c.clean.set(s.clean);
        const dx = s.dx || 0, dy = s.dy || 0;
        if (dx || dy) { c.translate(dx, dy); c.moved = Math.hypot(dx, dy); }
      }
    }
  }

  // ------------------------------------------------------------- update

  update(dt, ctx) {
    const vac = ctx.vacuum, cam = ctx.camera;
    const b = this.bed;
    this.t = (this.t || 0) + dt;

    resolveProps(vac, this.props, dt, { separate: true });
    this._keepReachable();

    // ---- the finale: the light comes back under the bed first, then we rise
    const complete = this.remaining() === 0;
    if (complete) { this.wipe += dt / 0.75; if (this.wipe < 1.06) this._wipeFloor(); }
    const target = complete ? (this.wipe < 1.7 ? Math.max(0.8, this.u) : 0) : underness(b, vac.mouthX, vac.mouthY);
    const rate = target > this.u ? 1.9 : 1.2;
    this.u += (target - this.u) * (1 - Math.exp(-rate * dt));
    const u = this.u;
    this.see = complete ? Math.max(u, 1 - smoothstep(1.8, 2.5, this.wipe)) : u;
    const lightU = complete ? u * (1 - smoothstep(0.45, 1.05, this.wipe)) : u;
    this.lightU = lightU;
    this.bright = complete ? smoothstep(1.6, 2.8, this.wipe) : 0;

    this._camera(dt, cam, vac, u);

    this.light.setDark(0.94 * smoothstep(0.02, 0.85, lightU));
    const hl = vac.headlight;
    hl.on = lightU > 0.035;
    hl.r = this.pose === 'portrait' ? 215 : 205;
    hl.cone = 0.16;
    hl.softness = 1;
    hl.intensity = clamp(lightU * 1.25, 0, 1);
    hl.warm = 0.30 * smoothstep(0.05, 0.5, lightU);

    // ---- the skirt: the airflow lifts the hem, which is the way in --------
    const n = this.hem.length, W = b.x1 - b.x0;
    const finale = smoothstep(0.2, 1.2, this.wipe) * (1 - smoothstep(2.4, 3.4, this.wipe));
    for (let i = 0; i < n; i++) {
      const x = b.x0 + (i / (n - 1)) * W;
      const f = vac.field(x, b.yEdge - 8, TMPF);
      const want = clamp(f.strength * 1.15, 0, 1) * (1 - 0.5 * u) + u * 0.55
        + finale * 0.5 * (0.5 + 0.5 * Math.sin(this.t * 3.4 + i * 0.6));
      this.hem[i] += (clamp(want, 0, 1.2) - this.hem[i]) * (1 - Math.exp(-7 * dt));
    }

    // ---- cushions and everything in the flow -----------------------------
    for (let i = 0; i < this.cushions.length; i++) {
      const c = this.cushions[i];
      c.update(dt, vac, ctx);
      if (c.ringHair && c.ringHair.dormant && c.moved > 18) {
        c.ringHair.dormant = false;
        this._spark(c.homeX, c.homeY, 6);
      }
    }
    const list = this.debris;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.dormant) continue;
      d.update(dt, vac, ctx.world);
    }
    this.air.update(dt, vac);

    // the slipper is tugged by the flow and shoved by the head; never swallowed
    const sf = vac.field(this.slipper.x, this.slipper.y, TMPF);
    this.slipper.data.tug = clamp(sf.strength * 1.4, 0, 1);
    if (sf.strength > 0.34) {
      // it creeps toward the mouth a little, and stops the moment it is let go
      this.slipper.vx += sf.fx * 60 * dt;
      this.slipper.vy += sf.fy * 60 * dt;
    }

    if (this.boss && !this.boss.popped && this.boss.state === State.DONE) {
      this.boss.popped = true;
      // the core stays where the PILE was: the boss slid away from it, so the
      // two hard little things are lying in the clean patch it left behind
      this._dropCore(this.boss.hx, this.boss.hy);
    }

    this._motes(dt, vac, u);
    this._sparks(dt);
    if (ctx.audio) {
      ctx.audio.setSpace({ muffle: u });
      // the "zazaa" of a mass going in: the hair stream and the boss stripping
      let stream = 0;
      for (let i = 0; i < list.length; i++) {
        const d = list[i];
        if (d.type === 'hair' && d.state === State.REACTING) stream = Math.max(stream, d.lift * 0.5);
      }
      if (this.boss && this.boss.phase === 'hold') {
        stream = Math.max(stream, clamp((this.boss.strength - 0.4) * 0.9, 0, 0.8));
      }
      if (!(this.bin && this.bin.pouring)) ctx.audio.setStream(stream);
    }
  }

  /**
   * A shoved cushion must never take its hair somewhere the head cannot follow.
   * The cushions are held inside the box the nozzle can reach at the rest
   * camera, and the slipper inside the cavity, which is the only clamping in
   * the room (the bed's own legs and back wall do the rest).
   */
  _keepReachable() {
    const P = this.pushRect, b = this.bed;
    for (let i = 0; i < this.cushions.length; i++) {
      const c = this.cushions[i];
      const dx = clamp(c.x, P.x0, P.x1) - c.x, dy = clamp(c.y, P.y0, P.y1) - c.y;
      if (dx || dy) {
        c.translate(dx, dy);
        if (dx) c.vx = 0;
        if (dy) c.vy = 0;
      }
    }
    const s = this.slipper;
    const sx = clamp(s.x, b.x0 + 40, b.x1 - 40), sy = clamp(s.y, b.yBack + 80, b.yEdge - 30);
    if (sx !== s.x) { s.x = sx; s.vx = 0; }
    if (sy !== s.y) { s.y = sy; s.vy = 0; }
  }

  /** What the boss was built around, left on the floor to rattle in after it. */
  _dropCore(x, y) {
    this.debris.push(new CoreBit(x - 16, y + 8, 'tie', this.rng));
    this.debris.push(new CoreBit(x + 18, y - 6, 'marble', this.rng));
    this._spark(x, y, 20);
    this._clean(x, y, 130);
  }

  _camera(dt, cam, vac, u) {
    const r = this.rest, c = this.cave;
    const A = this._camAnchor || (this._camAnchor = { x: 0, y: 0, zoom: 1, tilt: 0 });
    A.x = lerp(r.x, c.x, u); A.y = lerp(r.y, c.y, u);
    A.zoom = lerp(r.zoom, c.zoom, u); A.tilt = lerp(r.tilt, c.tilt, u);
    const lim = this._camLimit || (this._camLimit = { x: 0, y: 0 });
    lim.x = this.follow.x * u; lim.y = this.follow.y * u;
    const subject = u > 0.02 ? vac.nozzle : null;
    cam.followTo(dt, A, subject, lim, { x: 0.45 * u, y: 0.40 * u }, 2.8, !this._camReady);
    this._camReady = true;
  }

  _motes(dt, vac, u) {
    const b = this.bed;
    this.tt = (this.tt || 0) + dt * 1.6;
    if (u < 0.05) return;
    const list = this.motes;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const f = vac.field(m.x, m.y, TMPF);
      m.vx += f.fx * 190 * dt + noise1(m.ph + this.tt) * 6 * dt;
      m.vy += f.fy * 190 * dt + noise1(m.ph + this.tt + 41) * 5 * dt;
      m.vx *= 0.985; m.vy *= 0.985;
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (f.inCapture || m.x < b.x0 || m.x > b.x1 || m.y < b.yBack || m.y > b.yEdge) {
        m.x = b.x0 + (m.ph * 97.13 % 1) * (b.x1 - b.x0);
        m.y = b.yBack + ((m.ph * 53.7 + i * 0.37) % 1) * (b.yEdge - b.yBack);
        m.vx = 0; m.vy = 0; m.ph += 0.618;
      }
    }
  }

  _spark(x, y, n) {
    for (let i = 0; i < n; i++) {
      if (this.sparks.length > 90) break;
      this.sparks.push({
        x, y, vx: this.rng.range(-90, 90), vy: this.rng.range(-90, 90),
        life: 1, r: this.rng.range(1.2, 3.4),
      });
    }
  }

  _sparks(dt) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= 0.93; s.vy *= 0.93;
      s.life -= dt * 1.5;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }
  }

  /** Completion: a clean stripe wipes from the far wall out to the skirt. */
  _wipeFloor() {
    const b = this.bed;
    const w = clamp(this.wipe, 0, 1);
    const y = lerp(b.yBack + 20, b.yEdge - 10, w);
    const a = b.x0 + (b.x1 - b.x0) * 0.18, c = b.x1 - (b.x1 - b.x0) * 0.18;
    for (let k = 0; k < 5; k++) this._clean(lerp(a, c, (k + 0.5) / 5), y, 96);
  }

  // ------------------------------------------------------------- captures

  onCaptured(d, ctx) {
    const b = this.bed;
    if (d.y < b.yEdge + 20) this._clean(d.x, d.y, d.type === 'boss' ? 150 : 64);
    const n = d.type === 'boss' ? 26 : d.type === 'hair' ? 5 : 8;
    this._spark(d.x, d.y, n);
    if (ctx && ctx.camera && d.type === 'boss') ctx.camera.kick(8);
    if (d === this.sliver) this._refillSliver();
  }

  /** The way in must never stop inviting: pull another clump into the gap. */
  _refillSliver() {
    if (this.u > 0.55) return;
    let best = null, bd = 1e9;
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (d.state === State.DONE || d.type !== 'bunny' || d === this.sliver) continue;
      if (d.y > this.bed.yEdge - this.bed.gap) continue;
      const dd = Math.hypot(d.x - this.sliverSpot.x, d.y - this.sliverSpot.y);
      if (dd < bd) { bd = dd; best = d; }
    }
    if (!best) return;
    best.hx = this.sliverSpot.x; best.hy = this.sliverSpot.y;
    best.entry = { fromX: best.x, fromY: best.y, t: 0, dur: 1.0 };
    this.sliver = best;
  }

  // ---------------------------------------------------------------- draw

  draw(ctx, cam) {
    const b = this.bed;
    const see = this.see === undefined ? this.u : this.see;
    this.floor.smoothBase = see < 0.55;
    this.drawFloor(ctx, cam);

    ctx.save();
    cam.apply(ctx);
    // the hair rings the cushions have been sitting on, on the boards
    for (let i = 0; i < this.cushions.length; i++) this.cushions[i].drawRing(ctx);
    if (this.film && see > 0.04) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.film.canvas, this.film.x, this.film.y, this.film.w, this.film.h);
      ctx.imageSmoothingEnabled = true;
    }
    drawUnderWallImage(ctx, this.wallImg);
    for (let i = 0; i < this.props.length; i++) {
      const p = this.props[i];
      if (p.data && p.data.leg) p.draw(ctx);
    }
    this.slipper.draw(ctx);
    for (let i = 0; i < this.cushions.length; i++) this.cushions[i].draw(ctx);
    ctx.restore();

    this.drawDebris(ctx, cam);

    ctx.save();
    cam.apply(ctx);
    this.air.draw(ctx, cam);
    this._drawMotes(ctx);
    this._drawSparks(ctx);
    drawUnderSlot(ctx, b, this.hem, see);
    drawSkirt(ctx, b, this.hem, { t: this.t || 0, alpha: 1 - smoothstep(0.1, 0.75, see) * 0.82 });
    // under the bed the bed itself is a ghost frame: the last few percent of
    // the solid image cost a whole full-screen blend, so the outline carries it
    drawBed(ctx, b, 1 - smoothstep(0.08, 0.62, see) * 0.94, this.bedImg, 0.14);
    if (this.bright > 0.01) {
      // the room comes up: one warm wash over the boards, for the two seconds
      // of the finale only, and a twinkle on the floor the bed was hiding
      const r = this.floor.baseRect;
      ctx.fillStyle = 'rgba(255,236,190,' + (0.17 * this.bright).toFixed(3) + ')';
      ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
      this._drawSparkles(ctx);
    }
    ctx.restore();
  }

  /** Culled to the view: under the bed most of the room is off screen. */
  drawDebris(ctx, cam) {
    cam.viewRect(VR, 170);
    ctx.save();
    cam.apply(ctx);
    const list = this.debris;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.dormant) continue;
      if (d.x < VR.x0 || d.x > VR.x1 || d.y < VR.y0 || d.y > VR.y1) continue;
      d.draw(ctx, cam);
    }
    ctx.restore();
  }

  _drawMotes(ctx) {
    const a = smoothstep(0.15, 0.7, this.lightU === undefined ? this.u : this.lightU);
    if (a <= 0.01) return;
    ctx.fillStyle = 'rgba(255,252,240,' + (0.75 * a).toFixed(3) + ')';
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill();
    }
  }

  _drawSparks(ctx) {
    if (!this.sparks.length) return;
    ctx.fillStyle = 'rgba(232,224,210,0.9)';
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      ctx.globalAlpha = clamp(s.life, 0, 1) * 0.85;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** The room is clean: the boards in front of the bed twinkle. */
  _drawSparkles(ctx) {
    const t = this.t || 0;
    for (let i = 0; i < this.sparkles.length; i++) {
      const s = this.sparkles[i];
      const k = 0.5 + 0.5 * Math.sin(t * 3.1 + s.ph);
      drawSparkle(ctx, s.x, s.y, 13 + k * 11, this.bright * (0.45 + 0.55 * k));
    }
  }

  lights(L, cam, vac) {
    const u = this.lightU === undefined ? this.u : this.lightU;
    if (u <= 0.02) return;
    const b = this.bed;
    const zoom = cam.zoom;
    cam.toScreen(vac.mouthX, vac.mouthY, SP);
    L.addLight(SP.x, SP.y, 250 * zoom, 0.19 * u);
    this._litMotes(L, cam, vac, u);
    if (this.pose === 'portrait') {
      cam.toScreen(0, b.yEdge + this.vh * 0.28, SP);
      L.addLight(SP.x, SP.y, this.vw * 0.95 * zoom, 0.55 * u);
    } else {
      cam.toScreen(-this.vw * 0.20, b.yEdge + this.vh * 0.40, SP);
      L.addLight(SP.x, SP.y, this.vw * 0.36 * zoom, 0.48 * u);
      cam.toScreen(b.x1 + 20, (b.yEdge + b.yBack) * 0.5, SP);
      L.addLight(SP.x, SP.y, this.vw * 0.14 * zoom, 0.34 * u);
    }
    // a whisper of light along the gap, so the way out is never lost
    cam.toScreen((b.x0 + b.x1) * 0.5, b.yEdge - 4, SP);
    L.addLight(SP.x, SP.y, (b.x1 - b.x0) * 0.55 * zoom, 0.16 * u);
  }

  _litMotes(L, cam, vac, u) {
    const mx = vac.mouthX, my = vac.mouthY;
    const r = vac.headlight.r * 1.15;
    const list = this.motes;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const dx = m.x - mx, dy = m.y - my;
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      const align = d < 1 ? 1 : (dx * vac.dirX + dy * vac.dirY) / d;
      if (align < 0.55) continue;
      const k = (1 - d / r) * smoothstep(0.55, 0.9, align) * u;
      if (k <= 0.02) continue;
      cam.toScreen(m.x, m.y, SP);
      L.addSpark(SP.x, SP.y, (2.4 + m.r * 2.0) * cam.zoom, 0.42 * k);
    }
  }

  // ------------------------------------------------------------- contract

  isComplete() { return this.remaining() === 0 && this.u < 0.08 && this.wipe > 2.8; }

  exit() { return { to: this.exitCam, dur: 1.6, next: 'hall' }; }

  entry() {
    // walking in through the door: a step wider and lower than rest, looking at
    // the cushions, with the bed (and the thing under it) across the far end
    return this.pose === 'portrait'
      ? { x: this.rest.x, y: this.rest.y + this.vh * 0.16, zoom: this.scale * 1.05, tilt: 0.06 }
      : { x: this.rest.x - this.vw * 0.30, y: this.rest.y + this.vh * 0.10, zoom: this.scale * 1.05, tilt: 0.05 };
  }

  devFinish() {
    // the boss's core would otherwise be dropped on the next tick, and the room
    // would be two little hard things short of finished
    if (this.boss) this.boss.popped = true;
    for (let i = 0; i < this.debris.length; i++) this.debris[i].state = State.DONE;
    for (let i = 0; i < this.cushions.length; i++) this.cushions[i].clean.fill(1);
    this.u = 0; this.wipe = 3.2;
    this._wipeFloor();
  }

  snapshot() {
    const s = super.snapshot();
    s.under = +this.u.toFixed(3);
    s.wipe = +this.wipe.toFixed(2);
    s.dark = +this.light.dark.toFixed(2);
    s.air = this.air.snapshot();
    s.cushions = this.cushions.map((c) => c.snapshot());
    return s;
  }
}
