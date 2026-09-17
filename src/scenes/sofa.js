import { Scene } from './scene.js';
import { State } from '../debris/base.js';
import { DustBunny } from '../debris/dustBunny.js';
import { Crumb } from '../debris/crumb.js';
import { MotherBunny } from '../debris/motherBunny.js';
import { Sock } from '../debris/sock.js';
import { Cobweb } from '../debris/cobweb.js';
import { makeWoodFloor } from '../floors/wood.js';
import { makeCanvas } from '../floors/floor.js';
import { Prop, resolveProps } from '../props/prop.js';
import { LightLayer } from '../core/light.js';
import {
  drawSofa, drawSlot, makeLeg, makeToy, makeCarpet, drawCarpetImage,
  makeSofaImage, makeBackWallImage, drawBackWallImage,
} from '../props/sofa.js';
import { makeFloorLamp, makeCushion, bakeRoomLight, bakeRugEdge } from '../props/room.js';
import { clamp, lerp, smoothstep, TAU, noise1 } from '../core/math.js';

const TMPF = { fx: 0, fy: 0, strength: 0, inCapture: false, dist: 0 };
const SP = { x: 0, y: 0 };
const VR = { x0: 0, y0: 0, x1: 0, y1: 0 };

/**
 * Scene 7 — under the sofa.
 *
 * The phenomenon: the vacuum goes where you cannot see, and its light and its
 * suction find what is hiding there.
 *
 *  - From outside, the sofa is solid. All you can see of the cavity is a dark
 *    slot along its front edge with the EDGE of a dust bunny sticking out of
 *    it, already swaying in the idle airflow. A trail of crumbs and fluff leads
 *    to that slot. Nothing is explained; the sliver is the invitation.
 *  - The moment the mouth crosses under the front edge the camera drops toward
 *    floor level (tilt), the picture goes dark, and the headlight comes on. The
 *    sofa itself fades to a ghost frame overhead: you are underneath it.
 *  - In the dark, debris outside the cone is barely a smudge. What the cone
 *    finds is already LEANING toward the mouth before you can see what it is.
 *  - The cavity holds: fluff clumps, cobwebs streaming off the skirting board,
 *    a lost sock that clogs the mouth, a toy that cannot be sucked at all, and,
 *    deepest of all, the mother of all dust bunnies.
 *  - Leaving lifts the camera and the light back, and the sliver at the edge is
 *    refilled, so the way back in is always visible.
 */
export class SofaScene extends Scene {
  constructor(rng) {
    super('sofa', rng);
    this.light = new LightLayer();
    this.light.scale = 0.42;          // the darkness is soft; a fraction of the res is plenty
    // under the furniture the dark is a real dark, and cold: a night-blue, so
    // the warm beam has something to be warm AGAINST
    this.light.darkColor = '4,6,20';
    this.light.glowColor = '255,204,138';
    this.u = 0;             // 0 = out in the room, 1 = right under the sofa
    this.motes = [];
    this.sparks = [];
    this.wipe = 0;
    this.sock = null;
    this.mother = null;
    this.sliver = null;
    this._camReady = false;
  }

  _p(nx, ny) { return { x: (nx - 0.5) * this.vw, y: (ny - 0.5) * this.vh }; }

  // ------------------------------------------------------------- layout

  layout(pose, w, h) {
    super.layout(pose, w, h);
    const vw = this.vw, vh = this.vh;
    const rng = this.rng;
    this.debris.length = 0;
    this.props.length = 0;
    this.sparks.length = 0;
    this.u = 0;
    this.wipe = 0;
    this._camReady = false;
    this.rest = { x: 0, y: 0, zoom: this.scale, tilt: 0 };

    const portrait = pose === 'portrait';
    let trail, clumps, webs, sockAt, toyAt, motherAt, legs;

    if (portrait) {
      // depth: the cavity recedes away from the viewer
      this.startPointer = { x: 0.5, y: 0.82 };
      this.sofa = { x0: -vw * 0.46, x1: vw * 0.46, yEdge: -vh * 0.05, yBack: -vh * 0.95, gap: 44 };
      this.floor = makeWoodFloor(
        { x0: -vw * 0.66, y0: -vh * 1.08, x1: vw * 0.66, y1: vh * 0.70 }, rng, { plankW: 86 });
      // the cavity is framed to FIT: zoomed in and tilted, so you are in it
      this.cave = { x: 0, y: -vh * 0.46, zoom: this.scale * 1.28, tilt: 0.45 };
      this.follow = { x: vw * 0.12, y: vh * 0.14 };
      this.carpet = { x0: -vw * 1.0, y0: vh * 0.66, x1: vw * 1.0, y1: vh * 1.7 };
      this.carpetEdge = 'bottom';
      this.exitCam = { x: 0, y: vh * 0.70, zoom: this.scale * 1.0, tilt: 0.12 };
      trail = [[0.68, 0.700, 'b15'], [0.57, 0.655, 'c'], [0.45, 0.620, 'b17'],
        [0.56, 0.575, 'c'], [0.36, 0.560, 'b14'], [0.47, 0.505, 'b19']];
      clumps = [[-0.27, -0.215, 23], [0.24, -0.185, 19], [-0.09, -0.345, 25],
        [0.30, -0.425, 21], [-0.29, -0.565, 20]];
      webs = [[-0.30, 0.55, 1], [0.05, 0.42, -1], [0.33, 0.50, 1]];
      sockAt = { x: 0.16, y: -0.285, a: 0.55 };
      toyAt = { x: -0.22, y: -0.665 };
      motherAt = { x: -0.10, y: (-0.95 * vh + 32) / vh, r: 47 };
      legs = [[-0.37, -0.085], [0.37, -0.085], [-0.37, -0.925], [0.37, -0.925]];
    } else {
      // width: a long low cavity you travel along, around the legs
      this.startPointer = { x: 0.20, y: 0.80 };
      this.sofa = { x0: -vw * 0.60, x1: vw * 0.62, yEdge: -vh * 0.02, yBack: -vh * 0.86, gap: 38 };
      this.floor = makeWoodFloor(
        { x0: -vw * 0.80, y0: -vh * 1.00, x1: vw * 0.95, y1: vh * 0.80 }, rng,
        { plankW: 80, horizontal: true });
      this.cave = { x: 0, y: -vh * 0.37, zoom: this.scale * 1.05, tilt: 0.38 };
      this.follow = { x: vw * 0.26, y: vh * 0.06 };
      this.carpet = { x0: vw * 0.98, y0: -vh * 0.6, x1: vw * 2.2, y1: vh * 1.1 };
      this.carpetEdge = 'left';
      this.exitCam = { x: vw * 1.02, y: vh * 0.06, zoom: this.scale, tilt: 0.10 };
      trail = [[0.245, 0.760, 'b15'], [0.325, 0.680, 'c'], [0.295, 0.600, 'b17'],
        [0.405, 0.620, 'c'], [0.400, 0.530, 'b14'], [0.340, 0.465, 'b19']];
      clumps = [[-0.42, -0.20, 22], [-0.20, -0.36, 20], [-0.05, -0.17, 24],
        [0.16, -0.42, 21], [0.34, -0.20, 22]];
      webs = [[-0.34, 0.50, 1], [-0.02, 0.44, -1], [0.30, 0.52, 1]];
      sockAt = { x: 0.06, y: -0.55, a: -0.25 };
      toyAt = { x: -0.30, y: -0.62 };
      motherAt = { x: 0.48, y: (-0.86 * vh + 30) / vh, r: 46 };
      legs = [[-0.555, -0.055], [0.565, -0.055], [-0.555, -0.795], [0.565, -0.795]];
    }

    const s = this.sofa;
    // ---- the trail in the lit room, leading to the slot -------------------
    for (let i = 0; i < trail.length; i++) {
      const [nx, ny, kind] = trail[i];
      const p = this._p(nx, ny);
      if (kind === 'c') {
        this.debris.push(new Crumb(p.x + rng.range(-14, 14), p.y + rng.range(-10, 10), rng));
      } else {
        this.debris.push(new DustBunny(p.x, p.y, parseFloat(kind.slice(1)), rng));
      }
    }

    // ---- the sliver: a bunny half-hidden in the slot ----------------------
    this.sliverSpot = { x: portrait ? -vw * 0.05 : -vw * 0.10, y: s.yEdge - s.gap * 1.25 };
    this.sliver = new DustBunny(this.sliverSpot.x, this.sliverSpot.y, 26, rng);
    this.debris.push(this.sliver);

    // ---- the cavity -------------------------------------------------------
    for (let i = 0; i < clumps.length; i++) {
      const [fx, fy, r] = clumps[i];
      this.debris.push(new DustBunny(fx * this.vw, fy * this.vh, r, rng));
    }
    for (let i = 0; i < webs.length; i++) {
      const [fx, wlen, dir] = webs[i];
      const ax = fx * this.vw;
      this.debris.push(new Cobweb(ax, s.yBack + 6, dir * 0.55, 0.84, this.vh * 0.09 * wlen, rng));
    }
    this.sock = new Sock(sockAt.x * this.vw, sockAt.y * this.vh, sockAt.a, rng);
    this.debris.push(this.sock);
    this.mother = new MotherBunny(motherAt.x * this.vw, motherAt.y * this.vh, motherAt.r, rng);
    this.debris.push(this.mother);

    // ---- props: legs are solid, the toy is only pushable ------------------
    // the skirting board stops the head: you cannot drive through the wall, so
    // the camera settles instead of scrolling into the void
    // It stops ~120px SHORT of the skirting board: the deepest nook is out of
    // the head's reach, so the mother bunny down there can only be won by
    // holding still and letting the airflow do the work.
    this.props.push(new Prop({
      x: (s.x0 + s.x1) * 0.5, y: s.yBack + 52, shape: 'rect',
      w: (s.x1 - s.x0) + 600, h: 90, pushable: false, shadow: false, draw: () => {},
    }));
    for (let i = 0; i < legs.length; i++) {
      this.props.push(makeLeg(legs[i][0] * this.vw, legs[i][1] * this.vh, 13));
    }
    this.toy = makeToy(toyAt.x * this.vw, toyAt.y * this.vh, rng);
    this.props.push(this.toy);
    if (!portrait) this._furnishRoom();

    this.carpetImg = makeCarpet(this.carpet, this.carpetEdge);
    this.sofaImg = makeSofaImage(s);
    this.wallImg = makeBackWallImage(s);
    this._buildFilm();
    this._replayClean();
    this._buildMotes();
    this.clearStartZone(215);
    this.placeBin();
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (typeof d.hx === 'number') { d.hx = d.x; d.hy = d.y; }
    }
  }

  /**
   * Landscape is the WIDE pose, and it was a band of sofa over an empty floor.
   * So the near half of the room gets furnished — all of it scenery, none of it
   * gameplay: the corner of the room's rug running off the bottom of the frame,
   * a standing lamp at the right that is solid (in this pose you go AROUND
   * things, like the sofa's own legs), the warm pool it throws over the boards,
   * and a cushion that has fallen off the sofa and can be shoved about.
   *
   * The rug, the pool and the lamp's long shadow are painted once into the
   * floor's own base canvas, so all of it costs nothing per frame.
   */
  _furnishRoom() {
    const vw = this.vw, vh = this.vh;
    const f = this.floor;
    const rugY = vh * 0.34;
    const lamp = { x: vw * 0.395, y: vh * 0.27 };
    const g = f.bctx;
    g.save();
    g.translate(-f.baseRect.x0, -f.baseRect.y0);
    bakeRugEdge(g, { x0: f.baseRect.x0, x1: f.baseRect.x1, y: rugY, depth: f.baseRect.y1 - rugY });
    bakeRoomLight(g, {
      x: lamp.x, y: lamp.y, r: vw * 0.54,
      // the sofa's front edge stands between the lamp and the far corner, so
      // the boards over there lie in its shadow
      shadows: [{ x: lamp.x - vw * 0.26, y: this.sofa.yEdge + 30, len: vw * 0.40, w: 34 }],
    });
    g.restore();
    this.lamp = makeFloorLamp(lamp.x, lamp.y, 17);
    this.props.push(this.lamp);
    this.cushion = makeCushion(vw * 0.10, vh * 0.30, 122, 88, -0.18);
    this.props.push(this.cushion);
  }

  /**
   * A film of dust over the cavity floor. It is its own small canvas (the
   * cavity only, not the whole room) so compositing it every frame is cheap;
   * captures punch soft holes in it, and the finale wipes a clean stripe.
   */
  _buildFilm() {
    const s = this.sofa;
    const pad = 20;
    const x = s.x0 - pad, y = s.yBack - pad;
    const w = Math.round(s.x1 - s.x0 + pad * 2), h = Math.round(s.yEdge - s.yBack + pad * 2);
    const q = 0.5;                       // the film is soft: half resolution is plenty
    const canvas = makeCanvas(Math.round(w * q), Math.round(h * q));
    const g = canvas.getContext('2d');
    g.scale(q, q);
    this.film = { canvas, ctx: g, x, y, w, h, q };
    // the gloom of the cavity is baked in here too (one composite instead of a
    // full-cavity gradient fill every frame) — and wiping the dust away also
    // lifts the gloom, which is exactly the feedback we want
    const gl = g.createLinearGradient(0, pad, 0, h - pad);
    gl.addColorStop(0, 'rgba(18,14,22,0.66)');
    gl.addColorStop(0.55, 'rgba(22,18,24,0.46)');
    gl.addColorStop(1, 'rgba(26,22,26,0.26)');
    g.fillStyle = gl;
    g.fillRect(pad, pad, w - pad * 2, h - pad * 2);
    g.fillStyle = 'rgba(170,162,148,0.30)';
    g.fillRect(pad, pad, w - pad * 2, h - pad * 2);
    const rng = this.rng;
    for (let i = 0; i < 110; i++) {
      const px = pad + rng.next() * (w - pad * 2), py = pad + rng.next() * (h - pad * 2);
      const r = rng.range(12, 48);
      const a = rng.range(0.08, 0.28);
      const grad = g.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, 'rgba(214,208,196,' + a.toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(214,208,196,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill();
    }
    // feather the near edge so the film does not end in a hard line
    g.globalCompositeOperation = 'destination-out';
    const fade = g.createLinearGradient(0, h - pad, 0, h - pad - 46);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade;
    g.fillRect(0, h - pad - 46, w, 46 + pad);
    g.globalCompositeOperation = 'source-over';
  }

  /**
   * Wipe the dust film clean at a world point, and remember it (normalized to
   * the cavity) so an orientation change keeps the patches the player cleaned.
   */
  _clean(wx, wy, r, replay) {
    const f = this.film;
    if (!f) return;
    if (!replay) {
      const s = this.sofa;
      const W = s.x1 - s.x0, H = s.yEdge - s.yBack;
      const list = this.persist.clean || (this.persist.clean = []);
      if (list.length < 500) {
        list.push([+((wx - s.x0) / W).toFixed(4), +((wy - s.yBack) / H).toFixed(4), +(r / W).toFixed(4)]);
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

  /** Orientation change: put the cleaned patches back into the fresh film. */
  _replayClean() {
    const list = this.persist.clean;
    if (!list || !list.length) return;
    const s = this.sofa;
    const W = s.x1 - s.x0, H = s.yEdge - s.yBack;
    for (let i = 0; i < list.length; i++) {
      this._clean(s.x0 + list[i][0] * W, s.yBack + list[i][1] * H, list[i][2] * W, true);
    }
  }

  _buildMotes() {
    const s = this.sofa;
    this.motes.length = 0;
    for (let i = 0; i < 22; i++) {
      this.motes.push({
        x: this.rng.range(s.x0, s.x1),
        y: this.rng.range(s.yBack, s.yEdge),
        vx: this.rng.range(-6, 6), vy: this.rng.range(-5, 5),
        r: this.rng.range(0.9, 2.3), ph: this.rng.range(0, 100),
      });
    }
  }

  // ------------------------------------------------------------- update

  update(dt, ctx) {
    const vac = ctx.vacuum, cam = ctx.camera;
    resolveProps(vac, this.props, dt);

    // ---- the finale ------------------------------------------------------
    // 1. the cavity is empty -> the light comes back up while the camera is
    //    STILL underneath and the sofa is still see-through, so the clean
    //    stripe on the floor is the thing you are looking at
    // 2. only then does the camera rise back into the room (exit() then pans
    //    on to the carpet)
    const complete = this.remaining() === 0;
    if (complete) { this.wipe += dt / 0.75; this._wipeFloor(); }
    const target = complete ? (this.wipe < 1.7 ? Math.max(0.8, this.u) : 0) : this._underness(vac);
    const rate = target > this.u ? 1.9 : 1.2;
    this.u += (target - this.u) * (1 - Math.exp(-rate * dt));
    const u = this.u;
    this.see = complete ? Math.max(u, 1 - smoothstep(1.8, 2.5, this.wipe)) : u;
    const lightU = complete ? u * (1 - smoothstep(0.45, 1.05, this.wipe)) : u;

    this._camera(dt, cam, vac, u);

    // darkness + headlight: the reveal is the whole scene
    this.light.setDark(0.945 * smoothstep(0.02, 0.85, lightU));
    const hl = vac.headlight;
    hl.on = lightU > 0.035;
    hl.r = (this.pose === 'portrait' ? 215 : 205);
    hl.cone = 0.16;                       // a torch beam, not a floodlight
    hl.softness = 1;                      // ...with a spill, so it has no cut edge
    hl.intensity = clamp(lightU * 1.25, 0, 1);
    // warm light ADDED back inside the cone: a cut-out alone can only ever be
    // "less dark", which is what made the cavity read as murky grey
    hl.warm = 0.30 * smoothstep(0.05, 0.5, lightU);
    this.lightU = lightU;

    // debris
    const list = this.debris;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.dormant) continue;
      d.update(dt, vac, ctx.world);
    }

    // the toy rocks in the flow but can never be sucked: only shoved
    const f = vac.field(this.toy.x, this.toy.y, TMPF);
    this.toy.data.wob = clamp(f.strength * 1.5, 0, 1);
    this.toy.data.seed += dt * 0.0;

    this._motes(dt, vac, u);
    this._sparks(dt);
    this._audio(ctx.audio, vac, lightU);
  }

  /** How far under the sofa the MOUTH is — the only thing that drives the mood. */
  _underness(vac) {
    const s = this.sofa;
    const mx = vac.mouthX, my = vac.mouthY;
    const inX = smoothstep(s.x0 - 8, s.x0 + 52, mx) * (1 - smoothstep(s.x1 - 52, s.x1 + 8, mx));
    const depth = smoothstep(s.yEdge + 10, s.yEdge - 68, my);
    return inX * depth;
  }

  _camera(dt, cam, vac, u) {
    const r = this.rest, c = this.cave;
    // the composition: out in the room at u=0, framing the cavity at u=1
    const A = this._camAnchor || (this._camAnchor = { x: 0, y: 0, zoom: 1, tilt: 0 });
    A.x = lerp(r.x, c.x, u); A.y = lerp(r.y, c.y, u);
    A.zoom = lerp(r.zoom, c.zoom, u); A.tilt = lerp(r.tilt, c.tilt, u);
    // ...plus a bounded-gain follow toward the nozzle, so she can push deeper
    // and travel sideways without the camera running away (core helper)
    const lim = this._camLimit || (this._camLimit = { x: 0, y: 0 });
    lim.x = this.follow.x * u; lim.y = this.follow.y * u;
    const subject = u > 0.02 ? vac.nozzle : null;
    cam.followTo(dt, A, subject, lim, { x: 0.45 * u, y: 0.40 * u }, 2.8, !this._camReady);
    this._camReady = true;
  }

  _motes(dt, vac, u) {
    const s = this.sofa;
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
      if (f.inCapture || m.x < s.x0 || m.x > s.x1 || m.y < s.yBack || m.y > s.yEdge) {
        m.x = s.x0 + (m.ph * 97.13 % 1) * (s.x1 - s.x0);
        m.y = s.yBack + ((m.ph * 53.7 + i * 0.37) % 1) * (s.yEdge - s.yBack);
        m.vx = 0; m.vy = 0;
        m.ph += 0.618;
      }
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

  /**
   * Under the furniture the room closes down around the motor. The core owns
   * the graph; the scene only says where it is. The strangled note while
   * something plugs the intake comes from `vac.clog`, which the sock and the
   * mother bunny set themselves.
   */
  _audio(audio, vac, u) {
    if (!audio) return;
    audio.setSpace({ muffle: u });
  }

  /** Completion: a clean stripe wipes from the back of the cavity to the front. */
  _wipeFloor() {
    const s = this.sofa;
    const w = clamp(this.wipe, 0, 1);
    const y = lerp(s.yBack + 20, s.yEdge - 10, w);
    const a = s.x0 + (s.x1 - s.x0) * 0.20, b = s.x1 - (s.x1 - s.x0) * 0.20;
    for (let k = 0; k < 5; k++) this._clean(lerp(a, b, (k + 0.5) / 5), y, 92);
  }

  // ------------------------------------------------------------- captures

  onCaptured(d, ctx) {
    const s = this.sofa;
    if (d.y < s.yEdge + 20) this._clean(d.x, d.y, d.type === 'mother' ? 105 : 62);
    const n = d.type === 'mother' ? 16 : d.type === 'sock' ? 10 : 6;
    for (let i = 0; i < n; i++) {
      this.sparks.push({
        x: d.x, y: d.y,
        vx: this.rng.range(-90, 90), vy: this.rng.range(-90, 90),
        life: 1, r: this.rng.range(1.2, 3.4),
      });
    }
    if (ctx && ctx.camera && (d.type === 'mother' || d.type === 'sock')) ctx.camera.kick(6);
    if (d === this.sliver) this._refillSliver();
  }

  /** The way in must never stop inviting: pull another clump into the slot. */
  _refillSliver() {
    if (this.u > 0.55) return;
    let best = null, bd = 1e9;
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      if (d.state === State.DONE || d.type !== 'bunny' || d === this.sliver) continue;
      if (d.y > this.sofa.yEdge - this.sofa.gap) continue;     // already out front
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
    const s = this.sofa;
    const see = this.see === undefined ? this.u : this.see;
    // Out in the lit room the boards are the picture and get the filter. Under
    // the sofa they are behind a 94% darkness and a dust film, where the
    // bilinear filter on that one full-screen blit is pure cost: on a soft
    // rasteriser it is worth several frames a second and nothing is visible.
    this.floor.smoothBase = see < 0.55;
    this.drawFloor(ctx, cam);
    ctx.save();
    cam.apply(ctx);
    cam.viewRect(VR, 60);
    const cp = this.carpet;
    if (cp.x1 > VR.x0 && cp.x0 < VR.x1 && cp.y1 > VR.y0 && cp.y0 < VR.y1) {
      drawCarpetImage(ctx, this.carpetImg);
    }
    if (this.film && see > 0.04) {
      // half-res soft dust magnified by the camera: the bilinear filter on that
      // one blit is dearer than everything it is smoothing
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.film.canvas, this.film.x, this.film.y, this.film.w, this.film.h);
      ctx.imageSmoothingEnabled = true;
    }
    drawBackWallImage(ctx, this.wallImg, s);
    for (let i = 0; i < this.props.length; i++) {
      const p = this.props[i];
      if (p.data && (p.data.leg || p.data.room)) p.draw(ctx);
    }
    this.toy.draw(ctx);
    ctx.restore();

    this.drawDebris(ctx, cam);

    ctx.save();
    cam.apply(ctx);
    this._drawMotes(ctx);
    this._drawSparks(ctx);
    drawSlot(ctx, s, see);
    // Under the furniture the sofa is a ghost frame, and the last few percent
    // of the solid image cost as much as the whole floor did: a full-screen
    // drawImage at alpha 0.06 is a full-screen blend. The outline carries it.
    drawSofa(ctx, s, 1 - smoothstep(0.08, 0.62, see) * 0.94, this.sofaImg, 0.14);
    ctx.restore();
  }

  /**
   * Dust in the beam. The motes themselves are drawn in world space and so are
   * under the darkness with everything else; what makes them read as dust
   * hanging in a torch beam is a warm speck ADDED for each one the beam is
   * actually on — brightest near the mouth and on the axis of the cone.
   */
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
      if (align < 0.55) continue;                       // outside the cone
      const k = (1 - d / r) * smoothstep(0.55, 0.9, align) * u;
      if (k <= 0.02) continue;
      cam.toScreen(m.x, m.y, SP);
      L.addSpark(SP.x, SP.y, (2.4 + m.r * 2.0) * cam.zoom, 0.42 * k);
    }
  }

  /**
   * Same as the base, but culled to the view. Under the sofa the camera is
   * zoomed in and tilted, so half the cavity — and the whole trail out in the
   * room — is off screen, and a dust bunny is ~30 fibre strokes each.
   */
  drawDebris(ctx, cam) {
    cam.viewRect(VR, 150);       // generous: a piece is culled by its CENTRE
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
    ctx.fillStyle = 'rgba(226,218,204,0.9)';
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      ctx.globalAlpha = clamp(s.life, 0, 1) * 0.85;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Light that is not the headlight: the lit room behind you, and the far end. */
  lights(L, cam, vac) {
    const u = this.lightU === undefined ? this.u : this.lightU;
    if (u <= 0.02) return;
    const s = this.sofa;
    const zoom = cam.zoom;
    // A weak wash all round the head. Not enough to light anything: just enough
    // that a clump sitting OUTSIDE the beam is a faint silhouette, so the child
    // can see there is more out there than the beam is on.
    cam.toScreen(vac.mouthX, vac.mouthY, SP);
    L.addLight(SP.x, SP.y, 250 * zoom, 0.19 * u);
    this._litMotes(L, cam, vac, u);
    if (this.pose === 'portrait') {
      cam.toScreen(0, s.yEdge + this.vh * 0.30, SP);
      L.addLight(SP.x, SP.y, this.vw * 0.95 * zoom, 0.55 * u);
    } else {
      cam.toScreen(-this.vw * 0.05, s.yEdge + this.vh * 0.46, SP);
      L.addLight(SP.x, SP.y, this.vw * 0.34 * zoom, 0.45 * u);
      cam.toScreen(s.x1 + 30, (s.yEdge + s.yBack) * 0.5, SP);
      L.addLight(SP.x, SP.y, this.vw * 0.15 * zoom, 0.40 * u);
    }
    // a whisper of bounce light along the slot, so the way out is never lost
    cam.toScreen((s.x0 + s.x1) * 0.5, s.yEdge - 4, SP);
    L.addLight(SP.x, SP.y, (s.x1 - s.x0) * 0.55 * zoom, 0.16 * u);
  }

  // ------------------------------------------------------------- contract

  isComplete() { return this.remaining() === 0 && this.u < 0.08 && this.wipe > 2.8; }

  exit() { return { to: this.exitCam, dur: 1.7, next: 'carpet' }; }

  entry() {
    // arriving from the entrance hall: portrait came toward the viewer, so we
    // start low; landscape came rightwards past the shoe rack, so we start left
    return this.pose === 'portrait'
      ? { x: this.rest.x, y: this.rest.y + this.vh * 0.14, zoom: this.scale * 1.06, tilt: 0.06 }
      : { x: this.rest.x - this.vw * 0.42, y: this.rest.y + this.vh * 0.08, zoom: this.scale * 1.06, tilt: 0.06 };
  }

  snapshot() {
    const s = super.snapshot();
    s.under = +this.u.toFixed(3);
    s.wipe = +this.wipe.toFixed(2);
    s.dark = +this.light.dark.toFixed(2);
    return s;
  }
}
