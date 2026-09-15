import * as THREE from 'three';
import * as A from './audio.js';
import { setHouseLit } from './house.js';
import { playAnim, addCandy, setPath, girlWorldPoint, resetGirl } from './girl.js';
import { rand } from './rng.js';

export const STATES = ['FIND', 'WALK', 'BELL', 'OPEN', 'REVEAL', 'BUCKET', 'CANDY', 'NEXT', 'ENDING'];

const IDLE_ATTRACT = 8.0;
const UP = new THREE.Vector3(0, 1, 0);

/** the camera sits behind a heading, swung a little to one side */
function behindHeading(heading, swing) {
  return new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading))
    .applyAxisAngle(UP, swing);
}

export class Chain {
  constructor(ctx) {
    this.ctx = ctx;              // { world, girl, cam, fireflies, leaves, sparkles, candy, bats, fireworks, debug }
    this.state = 'FIND';
    this.houseIndex = 1;         // world.houses index currently being visited (1..5)
    this.timers = [];
    this.idle = 0;
    this.busy = false;
    this.endingT = 0;
    this.seatedT = 0;
    this.endingPhase = null;
    this.poseToCamera = null;    // yaw offset from "straight at the camera"
    this.attractor = { active: false, level: 0 };
    // the closing composition: girl in the foreground, her own porch beside
    // her, the street and the moon beyond, fireworks over the road
    this.endShot = {
      sitX: 2.2, sitZ: 4.8,        // where she sits, local to her own house
      camT: 0, camBack: 5, camLat: 8.6, camY: 3.6,
      lookT: 0.18, lookLat: 8.2, lookY: 5.4,
      fwT0: 0.11, fwT1: 0.22, fwLat: 14, fwPower: 0.85
    };
    this.restartReady = false;
    this.ready = false;
    this.frame = 0;
    this.lastRejection = null;
    this.events = [];          // ring buffer, see note()
    this.eventSeq = 0;
  }

  // ------------------------------------------------------------ event log
  /** append to the ring buffer; never called per frame */
  note(type, data) {
    this.events.push({ i: this.eventSeq++, frame: this.frame, type, state: this.state, ...data });
    if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
  }

  /** an input the chain deliberately did not act on */
  reject(reason, detail) {
    this.lastRejection = { reason, detail: detail || null, frame: this.frame };
    this.note('reject', { reason, detail: detail || null });
  }

  // ------------------------------------------------------------ utilities
  setState(s) {
    if (this.state === s) return;
    const prev = this.state;
    this.state = s;
    this.note('state', { from: prev, to: s, house: this.houseIndex });
    if (this.ctx.debug) console.log('[state]', prev, '->', s, 'house', this.houseIndex);
    this.idle = 0;
    this.onEnter(s);
  }

  after(sec, fn) { this.timers.push({ t: sec, fn }); }
  clearTimers() { this.timers.length = 0; }

  get house() { return this.ctx.world.houses[this.houseIndex]; }

  // ------------------------------------------------------------- lifecycle
  start() {
    const { world, girl, cam } = this.ctx;
    const home = world.houses[0];
    girl.pos.copy(world.offsetPoint(0.105, home.side * 4.8));
    girl.pos.y = 0;
    girl.heading = Math.PI;
    girl.candyCount = 0;
    girl.candyMesh.count = 0;
    this.houseIndex = 1;
    this.state = 'FIND';
    this.busy = false;
    this.restartReady = false;
    this.endingT = 0;
    this.endingPhase = null;
    this.poseToCamera = null;
    this.attractor.active = false;
    this.attractor.level = 0;
    this.ctx.cam.dirOverride = null;
    this.ctx.cam.lookLift = 0.25;
    this.ctx.cam.lerpRate = 2.0;
    this.ctx.cam.setShot(null);
    this.clearTimers();
    world.setLitHouse(1);
    cam.snapNext = true;
    this.onEnter('FIND');
    this.ready = true;
    this.note('ready', { house: this.houseIndex });
  }

  onEnter(s) {
    const { world, girl, cam, fireflies } = this.ctx;
    const h = this.house;
    this.poseToCamera = null;
    // the invited object gets a fat, forgiving hit sphere while it is invited
    this.sizeProxies(s);
    switch (s) {
      case 'FIND': {
        this.busy = false;
        world.setLitHouse(this.houseIndex);
        h.bellTarget = 0;
        girl.lookAt = h.doorWorld.clone();
        girl.bucketHaloTarget = 0;
        girl.offerTarget = 0;
        girl.presentTarget = 0;
        cam.dirOverride = null;
        cam.lookLift = 0.25;
        cam.lerpRate = 2.0;
        cam.setShot(null);
        cam.setFocus(h.doorWorld, 0.26);
        cam.zoom = 1;
        cam.orbit = 0;
        cam.eyeScale = 1;
        fireflies.flowTo(h.doorWorld);
        break;
      }
      case 'WALK': {
        this.busy = true;
        girl.lookAt = null;
        cam.setFocus(h.doorWorld, 0.34);
        cam.zoom = 1;
        cam.orbit = 0;
        cam.eyeScale = 1;
        break;
      }
      case 'BELL': {
        this.busy = false;
        h.bellTarget = 1;
        h.bellShake = 1;
        const bp = h.doorbell.getWorldPosition(new THREE.Vector3());
        girl.lookAt = bp.clone();
        // step in closer, so door and bell fill the frame
        cam.setFocus(bp, 0.78);
        cam.zoom = 0.76;
        cam.orbit = 0.62;
        cam.eyeScale = 0.55;
        fireflies.flowTo(bp, 1.3);
        this.ctx.sparkles.ring(bp, 18, 0.5, 0xffd27a);
        this.ctx.sparkles.burst(bp, 10, 0xffd27a, 0.5, 0.2);
        break;
      }
      case 'OPEN': {
        this.busy = true;
        h.bellTarget = 0;
        A.sfxDoorbell();
        this.after(0.55, () => {
          h.doorTarget = 1;
          A.sfxDoorCreak();
        });
        this.after(1.5, () => {
          if (h.resident) {
            h.residentTarget = 1;
            h.resident.userData.hop = 0.6;
            A.sfxHum(200 + this.houseIndex * 22);
          }
        });
        this.after(2.4, () => this.setState('REVEAL'));
        break;
      }
      case 'REVEAL': {
        this.busy = false;
        girl.lookAt = h.doorWorld.clone();
        girl.ringGlow = 1;
        this.ctx.sparkles.ring(girl.pos.clone().setY(0.7), 28, 1.0, 0xfff0b0);
        cam.setFocus(h.doorWorld, 0.6);
        cam.zoom = 0.9;
        cam.orbit = 0.55;
        cam.eyeScale = 0.6;
        this.ctx.fireflies.flowTo(girl.pos.clone().setY(1.2));
        break;
      }
      case 'BUCKET': {
        this.busy = false;
        girl.bucketHaloTarget = 1;
        // she turns three-quarters toward us and lifts the bucket to her chest,
        // so the thing to tap is the biggest thing on screen
        girl.presentTarget = 1;
        this.poseToCamera = 0.55;
        if (h.resident) h.resident.userData.candy.visible = true;
        cam.setFocus(h.doorWorld, 0.45);
        cam.zoom = 0.8;
        cam.orbit = 0.5;
        cam.eyeScale = 0.6;
        const bkt = girlWorldPoint(girl, 'bucket');
        this.ctx.fireflies.flowTo(bkt, 1.3);
        this.ctx.sparkles.ring(bkt, 20, 0.45, 0xffd27a);
        this.bucketSpark = 0.9;
        break;
      }
      case 'CANDY': {
        this.busy = true;
        girl.offerTarget = 1;
        girl.presentTarget = 1;
        this.poseToCamera = 0.55;
        girl.bucketHaloTarget = 0;
        const from = h.resident
          ? h.resident.userData.candy.getWorldPosition(new THREE.Vector3())
          : h.doorWorld.clone();
        for (let i = 0; i < 9; i++) {
          this.after(0.45 + i * 0.16, () => {
            const to = girlWorldPoint(this.ctx.girl, 'bucket');
            this.ctx.candy.drop(from.clone().add(new THREE.Vector3((rand() - 0.5) * 0.3, 0.1, (rand() - 0.5) * 0.3)), to);
          });
        }
        this.after(2.4, () => {
          if (h.resident) {
            h.resident.userData.waving = 1.4;
            h.resident.userData.candy.visible = false;
            h.resident.userData.hop = 0.5;
          }
          A.sfxHum(260);
        });
        this.after(3.6, () => {
          h.residentTarget = 0;
          h.doorTarget = 0;
          girl.offerTarget = 0;
          girl.presentTarget = 0;
          A.sfxDoorClose();
          // step back down to the pavement so the next shot is not inside the porch
          setPath(girl, [h.walkSpot.clone()]);
        });
        this.after(4.6, () => this.setState('NEXT'));
        break;
      }
      case 'NEXT': {
        this.busy = true;
        const next = this.houseIndex + 1;
        if (next >= world.houses.length) {
          this.after(0.4, () => this.setState('ENDING'));
          break;
        }
        const nh = world.houses[next];
        setHouseLit(nh, true);
        nh.pulseBoost = 1;
        A.sfxTwinkleUp();
        cam.orbit = 0;
        cam.eyeScale = 1;
        cam.panTo(nh.doorWorld, 2.6);
        this.ctx.fireflies.flowTo(nh.doorWorld);
        this.ctx.sparkles.burst(nh.doorWorld.clone().add(new THREE.Vector3(0, 1.2, 0)), 20, 0xffc25e, 1.2, 0.3);
        this.after(2.8, () => {
          setHouseLit(this.house, false);
          this.houseIndex = next;
          this.setState('FIND');
        });
        break;
      }
      case 'ENDING': {
        this.busy = true;
        this.endingT = 0;
        this.seatedT = 0;
        this.endingPhase = null;
        this.fw = undefined;
        this.restartReady = false;
        world.lightAll();
        world.moonSmile.opacity = 0;
        A.sfxSparkle();
        const home = world.houses[0];
        girl.presentTarget = 0;
        girl.offerTarget = 0;
        // Cut to the last stretch of the street: the way home is a short happy
        // skip past the lit houses, not a hike down an empty road.
        const startP = world.offsetPoint(0.26, home.side * 5.2);
        girl.pos.set(startP.x, 0, startP.z);
        girl.path = null;
        girl.anim = null;
        girl.rig.position.set(0, 0, 0);
        const E0 = this.endShot;
        const spot = new THREE.Vector3(E0.sitX, 0, E0.sitZ)
          .applyEuler(new THREE.Euler(0, home.facing, 0)).add(home.position);
        const route = this.routeTo(new THREE.Vector3(spot.x, 0, spot.z));
        route.push(new THREE.Vector3(spot.x, 0, spot.z));
        setPath(girl, route);
        girl.heading = Math.atan2(route[0].x - girl.pos.x, route[0].z - girl.pos.z);
        girl.lookAt = null;
        // pick the skip speed so the walk home lands at about five seconds
        let len = 0;
        let prev = girl.pos;
        for (const q of route) { len += prev.distanceTo(q); prev = q; }
        girl.speedScale = Math.max(1.4, Math.min(3.6, len / (3.0 * 4.5)));
        cam.setShot(null);
        cam.setFocus(null);
        cam.pan = null;          // drop any establishing pan still in flight
        // She walks back up the street, against the direction the follow rig
        // assumes, so the camera is told explicitly which side to sit on.
        cam.dirOverride = behindHeading(girl.heading, 0.35);
        cam.lookLift = 0.25;
        cam.zoom = 1.15;
        cam.orbit = 0;
        cam.eyeScale = 0.8;
        cam.lerpRate = 6.0;      // she is skipping; the frame stays with her
        cam.snapNext = true;
        this.ctx.bats.flock(world.moonDir.clone().multiplyScalar(40).setY(22), new THREE.Vector3(0.2, -0.1, 1), 14);
        A.sfxBats();
        this.setEndingPhase('walkHome');
        break;
      }
    }
  }

  // ---------------------------------------------------------------- input
  /** returns true if the tap was consumed by the chain */
  tapHouse(i) {
    const { world, girl } = this.ctx;
    const h = world.houses[i];
    h.windowFlash = 1;
    if (this.state === 'ENDING' && this.restartReady) { this.restart(); return true; }
    if (this.busy) { this.reject('busy', 'house:' + i); return true; }
    if (this.state === 'FIND' && i === this.houseIndex) {
      this.walkToPorch(h);
      this.setState('WALK');
      return true;
    }
    // any other house: she strolls over, chain unaffected
    if (this.state === 'FIND') this.walkToPorch(h, true);
    return true;
  }

  tapDoorbell(i) {
    if (this.busy) { this.reject('busy', 'doorbell:' + i); return true; }
    if (this.state === 'BELL' && i === this.houseIndex) {
      this.setState('OPEN');
      return true;
    }
    // ringing the wrong bell: a friendly twinkle, nothing breaks
    this.reject('not-the-invited-doorbell', 'doorbell:' + i);
    const h = this.ctx.world.houses[i];
    h.bellShake = 1;
    h.windowFlash = 0.6;
    A.sfxChimeSoft();
    return true;
  }

  tapGirl() {
    const { girl } = this.ctx;
    if (this.state === 'ENDING') {
      if (this.restartReady) { this.restart(); return true; }
      playAnim(girl, 'cheer', 0.8);
      A.sfxLaugh();
      return true;
    }
    if (this.busy) { this.reject('busy', 'girl'); return true; }
    if (this.state === 'REVEAL') {
      this.busy = true;
      playAnim(girl, 'reveal', 1.5);
      girl.ringGlow = 1;
      A.sfxSparkle();
      this.ctx.sparkles.ring(girl.pos.clone().setY(0.8), 36, 1.1, 0xffe08a);
      const h = this.house;
      // the spin lands facing us: a short pose beat, then she turns back
      this.poseToCamera = 0;
      this.after(0.9, () => {
        if (h.resident) { h.resident.userData.hop = 1; h.resident.userData.waving = 0.9; }
        A.sfxLaugh();
      });
      this.after(1.5, () => {
        this.ctx.sparkles.ring(girlWorldPoint(girl, 'head').setY(girl.pos.y + 1.1), 24, 0.85, 0xfff0b0);
        girl.ringGlow = Math.max(girl.ringGlow, 0.9);
      });
      this.after(2.3, () => { this.poseToCamera = null; girl.lookAt = h.doorWorld.clone(); });
      this.after(2.75, () => this.setState('BUCKET'));
      return true;
    }
    // spin for fun any other time
    this.reject('off-chain-tap', 'girl');
    playAnim(girl, 'reveal', 1.4);
    A.sfxSparkle();
    this.ctx.sparkles.ring(girl.pos.clone().setY(0.8), 24, 1.0, 0xffe08a);
    return true;
  }

  tapBucket() {
    const { girl } = this.ctx;
    if (this.state === 'ENDING') { girl.bucketPulse = 1; A.sfxCandy(); return true; }
    if (this.busy) { this.reject('busy', 'bucket'); return true; }
    if (this.state === 'BUCKET') {
      this.setState('CANDY');
      return true;
    }
    this.reject('off-chain-tap', 'bucket');
    girl.bucketPulse = 1;
    A.sfxCandy((rand() * 5) | 0);
    return true;
  }

  tapGround(p) {
    const { girl, world, leaves } = this.ctx;
    leaves.burst(p.clone().setY(0.1), 12, 0.7);
    A.sfxLeaves();
    if (this.state === 'ENDING') {
      this.ctx.fireworks.launch(p.x, p.z);
      A.sfxFirework();
      if (this.restartReady) this.restart();
      return true;
    }
    if (this.busy) { this.reject('busy', 'ground'); return true; }
    // walk toward the tapped point, snapped near the road
    const t = world.nearestT(p);
    const centre = world.pointAt(t);
    const right = world.rightAt(t);
    let lat = p.clone().sub(centre).dot(right);
    lat = Math.max(-6.2, Math.min(6.2, lat));
    const dest = centre.clone().addScaledVector(right, lat);
    dest.y = 0;
    setPath(girl, this.routeTo(dest));
    girl.lookAt = null;
    return true;
  }

  tapSky(dirPoint) {
    const { bats, world } = this.ctx;
    bats.flock(dirPoint.clone(), new THREE.Vector3(0.3, 0.2, -1), 9);
    A.sfxBats();
    if (this.state === 'ENDING') {
      // a firework goes up where the child pointed
      this.ctx.fireworks.launch(dirPoint.x, dirPoint.z);
      A.sfxFirework();
    }
    return true;
  }

  // -------------------------------------------------------------- routing
  /** build a road-following path from the girl to a destination */
  routeTo(dest) {
    const { world, girl } = this.ctx;
    const t0 = world.nearestT(girl.pos);
    const t1 = world.nearestT(dest);
    const pts = [];
    const steps = Math.max(1, Math.round(Math.abs(t1 - t0) * 26));
    const lat0 = (() => {
      const c = world.pointAt(t0), r = world.rightAt(t0);
      return girl.pos.clone().sub(c).dot(r);
    })();
    const latEnd = (() => {
      const c = world.pointAt(t1), r = world.rightAt(t1);
      return dest.clone().sub(c).dot(r);
    })();
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const t = t0 + (t1 - t0) * k;
      const lat = lat0 + (latEnd - lat0) * k;
      const p = world.offsetPoint(t, lat);
      pts.push(new THREE.Vector3(p.x, 0, p.z));
    }
    pts.push(dest.clone().setY(0));
    return pts;
  }

  walkToPorch(h, casual = false) {
    const { girl, world } = this.ctx;
    const path = this.routeTo(h.walkSpot);
    path.push(h.porchSpot.clone());
    setPath(girl, path);
    girl.lookAt = null;
    this.casualWalk = casual;
  }

  // ----------------------------------------------------------- test hooks
  advance() {
    switch (this.state) {
      case 'FIND': this.tapHouse(this.houseIndex); break;
      case 'WALK': {
        const h = this.house;
        this.ctx.girl.path = null;
        this.ctx.girl.pos.copy(h.porchSpot);
        this.arriveAtPorch();
        break;
      }
      case 'BELL': this.setState('OPEN'); break;
      case 'OPEN': this.clearTimers(); this.house.doorTarget = 1;
        if (this.house.resident) this.house.residentTarget = 1;
        this.setState('REVEAL'); break;
      case 'REVEAL': this.clearTimers(); this.busy = false; this.tapGirl();
        this.clearTimers(); this.poseToCamera = null; this.setState('BUCKET'); break;
      case 'BUCKET': this.setState('CANDY'); break;
      case 'CANDY': this.clearTimers();
        this.house.residentTarget = 0; this.house.doorTarget = 0;
        this.ctx.girl.offerTarget = 0;
        addCandy(this.ctx.girl, 8);
        this.setState('NEXT'); break;
      case 'NEXT': {
        this.clearTimers();
        const next = this.houseIndex + 1;
        if (next >= this.ctx.world.houses.length) { this.setState('ENDING'); break; }
        setHouseLit(this.house, false);
        setHouseLit(this.ctx.world.houses[next], true);
        this.houseIndex = next;
        this.setState('FIND');
        break;
      }
      case 'ENDING': this.restart(); break;
    }
  }

  restart() {
    const { world } = this.ctx;
    this.ctx.girl.speedScale = 1;
    this.ctx.girl.presentTarget = 0;
    this.ctx.girl.present = 0;
    this.ctx.cam.orbit = 0;
    this.ctx.cam.eyeScale = 1;
    this.ctx.cam.dirOverride = null;
    this.ctx.cam.lookLift = 0.25;
    world.moonSmile.opacity = 0;
    this.ctx.girl.anim = null;
    this.ctx.girl.rig.position.y = 0;
    this.ctx.girl.candyCount = 0;
    this.ctx.girl.candyMesh.count = 0;
    this.ctx.cam.zoom = 1;
    this.state = 'RESTART';
    A.sfxTwinkleUp();
    this.start();
    if (this.ctx.debug) console.log('[state] restart');
  }

  arriveAtPorch() {
    const h = this.house;
    this.ctx.girl.lookAt = h.doorWorld.clone();
    if (this.casualWalk) { this.casualWalk = false; this.busy = false; this.setState('FIND'); return; }
    this.setState('BELL');
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const { girl, world, cam } = this.ctx;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }

    if (this.state === 'WALK' && !girl.path) {
      this.arriveAtPorch();
    }
    if (this.state === 'FIND' && this.casualWalk && !girl.path) {
      this.casualWalk = false;
      girl.lookAt = this.house.doorWorld.clone();
    }

    // --------------------------------------------- posing toward the camera
    // The camera almost always sits behind her, so a pose the child can read
    // means turning her, not moving the camera.
    if (this.poseToCamera !== null && !girl.path && girl.anim !== 'sit') {
      const c = cam.pos;
      const a = Math.atan2(c.x - girl.pos.x, c.z - girl.pos.z) + this.poseToCamera;
      girl.lookAt = girl.pos.clone()
        .add(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(4));
      girl.lookAt.y = 1.2;
    }

    // ------------------------------------------------------------ ending
    if (this.state === 'ENDING') {
      this.endingT += dt;
      world.moonSmile.opacity = Math.min(0.75, this.endingT * 0.4);
      const home = world.houses[0];
      if (girl.path && this.endingT > 8) girl.path = null;   // never strand her

      if (girl.path && this.endingPhase === 'walkHome' && cam.dirOverride) {
        cam.dirOverride.lerp(behindHeading(girl.heading, 0.35), Math.min(1, dt * 2.5)).normalize();
      }

      if (!girl.path && this.endingPhase === 'walkHome') {
        girl.speedScale = 1;
        girl.lookAt = null;
        girl.heading = Math.atan2(cam.pos.x - girl.pos.x, cam.pos.z - girl.pos.z);
        cam.dirOverride = behindHeading(girl.heading + Math.PI, 0);
        cam.setFocus(home.doorWorld, 0.4);
        cam.zoom = 1.0;
        cam.eyeScale = 0.95;
        cam.orbit = 0.2;
        cam.lookLift = 2.2;
        cam.panTo(world.moon.position.clone(), 1.6, true);
        this.setEndingPhase('moon');

        this.after(1.5, () => {
          playAnim(girl, 'sit', 1.0);
          girl.bucketHaloTarget = 0.6;
          girl.candyCount = 90; girl.candyMesh.count = 90;
          girl.candyMesh.instanceMatrix.needsUpdate = true;
          this.ctx.sparkles.ring(girl.pos.clone().setY(0.6), 30, 1.2, 0xffd88a);
          // one deliberate shot, not the follow rig: her porch beside her, the
          // street and the moon beyond, and room overhead for the fireworks
          const E = this.endShot;
          // landscape has a shorter vertical field, so it steps back and tilts up
          const wide = cam.portrait ? 0 : 1;
          const camP = world.offsetPoint(E.camT, home.side * E.camLat)
            .addScaledVector(world.tangentAt(E.camT), -(E.camBack + wide * 3.5));
          camP.y = E.camY + wide * 0.5;
          const lookP = world.offsetPoint(E.lookT, home.side * E.lookLat);
          lookP.y = E.lookY + wide * 1.6;
          cam.setShot(camP, lookP);
          cam.lerpRate = 2.6;
          girl.heading = Math.atan2(camP.x - girl.pos.x, camP.z - girl.pos.z);
          this.setEndingPhase('sit');
          this.after(0.8, () => { this.fw = 0; this.setEndingPhase('fireworks'); });
        });
      }

      if (girl.anim === 'sit') this.seatedT += dt;
      if (this.fw !== undefined) {
        this.fw -= dt;
        if (this.fw <= 0) {
          this.fw = 0.35 + rand() * 0.35;
          // down the street in front of her, where the camera is already looking
          const E = this.endShot;
          const p = world.offsetPoint(E.fwT0 + rand() * (E.fwT1 - E.fwT0),
            (rand() - 0.5) * E.fwLat);
          this.ctx.fireworks.launch(p.x, p.z, undefined, E.fwPower);
          A.sfxFirework();
        }
      }
      if (this.seatedT > 5.0 && !this.restartReady) {
        this.restartReady = true;
        this.busy = false;
        // frame the blinking lantern that invites another go
        this.restartPoint = home.lanterns[0].getWorldPosition(new THREE.Vector3());
        cam.setShot(null);
        cam.lerpRate = 2.0;
        cam.dirOverride = null;
        cam.lookLift = 0.35;
        cam.setFocus(this.restartPoint, 0.75);
        cam.zoom = 0.95;
        cam.orbit = 0.25;
        cam.eyeScale = 0.8;
        this.setEndingPhase('restartReady');
      }
      if (this.restartReady) {
        home.pulseBoost = 1;
        home.lanterns.forEach(l => { l.userData.target = 0.6 + 0.4 * Math.sin(this.endingT * 4); });
        this.ctx.fireflies.flowTo(home.doorWorld);
      }
      return;
    }

    // --------------------------------------------- the invited thing sparkles
    if (this.state === 'BELL') {
      this.bellSpark = (this.bellSpark || 0) - dt;
      if (this.bellSpark <= 0) {
        this.bellSpark = 1.0;
        const p = this.house.doorbell.getWorldPosition(new THREE.Vector3());
        this.ctx.sparkles.ring(p, 14, 0.42 + 0.1 * this.attractor.level, 0xffd88a);
      }
    }
    if (this.state === 'BUCKET') {
      this.bucketSpark = (this.bucketSpark || 0) - dt;
      if (this.bucketSpark <= 0) {
        this.bucketSpark = 1.0;
        this.ctx.sparkles.ring(girlWorldPoint(girl, 'bucket'), 14, 0.4, 0xffd88a);
      }
    }

    // ---------------------------------------------------------- attractor
    this.idle += dt;
    if (this.attractor.active) {
      this.attractor.level = Math.max(0.5, this.attractor.level - dt * 0.12);
    } else {
      this.attractor.level = Math.min(0.99, this.idle / IDLE_ATTRACT);
    }
    if (this.idle > IDLE_ATTRACT) {
      this.idle = IDLE_ATTRACT - 3.2;
      this.attract();
    }
  }

  /** the ending is one state but several beats; each beat is logged */
  setEndingPhase(name) {
    if (this.endingPhase === name) return;
    const prev = this.endingPhase;
    this.endingPhase = name;
    this.note('state', {
      from: prev || 'ENDING', to: name, ending: true,
      at: Math.round(this.endingT * 100) / 100
    });
    if (this.ctx.debug) console.log('[state] ending', prev, '->', name);
  }

  /** fat hit spheres for whatever the world is inviting right now */
  sizeProxies(state) {
    const { world, proxies } = this.ctx;
    if (!proxies) return;
    if (proxies.bucket) {
      proxies.bucket.scale.setScalar(state === 'BUCKET' || state === 'CANDY' ? 1 : 0.38);
    }
    if (proxies.girl) proxies.girl.scale.setScalar(state === 'REVEAL' ? 1 : 0.65);
    for (const h of world.houses) {
      if (!h.bellProxy) continue;
      h.bellProxy.scale.setScalar(
        state === 'BELL' && h.index === this.houseIndex ? 1 : 0.33);
    }
  }

  attract() {
    const { girl } = this.ctx;
    const h = this.house;
    let p = h.doorWorld.clone();
    if (this.state === 'BELL') p = h.doorbell.getWorldPosition(new THREE.Vector3());
    else if (this.state === 'REVEAL') p = girlWorldPoint(girl, 'head');
    else if (this.state === 'BUCKET') p = girlWorldPoint(girl, 'bucket');
    h.pulseBoost = 1.8;
    h.lanterns.forEach(l => { l.userData.flicker += 1.5; });
    // a stream of fireflies runs from her to the thing to touch
    this.ctx.fireflies.flowTo(p, 1.8);
    this.ctx.sparkles.ring(p, 20, 0.7, 0xffd88a);
    this.ctx.sparkles.burst(p, 14, 0xffd88a, 0.7, 0.2);
    // and a tiny sparkle on the point of her hat, so she is part of the hint
    this.ctx.sparkles.burst(girlWorldPoint(girl, 'hat'), 6, 0xfff0c0, 0.4, 0.15);
    if (!girl.path) girl.lookAt = p.clone();
    A.sfxChimeSoft();
    this.attractor.active = true;
    this.attractor.level = 1;
    this.note('attract', { target: this.state, house: this.houseIndex, level: 1 });
    if (this.ctx.debug) console.log('[attract]', this.state);
  }

  noteInput() {
    this.idle = 0;
    this.attractor.active = false;
    this.attractor.level = 0;
  }

  /** why the chain is not accepting the next chain input right now */
  waitReason() {
    if (!this.ready) return 'loading';
    if (this.ctx.girl.path) return 'walking';
    if (this.state === 'OPEN') return 'animating:doorOpen';
    if (this.state === 'CANDY') return 'animating:candy';
    if (this.state === 'NEXT') return 'animating:nextHousePan';
    if (this.state === 'REVEAL' && this.busy) return 'animating:costumeSpin';
    if (this.busy) return 'animating:' + this.state.toLowerCase();
    if (this.timers.length) return 'timers:' + this.timers.length;
    return null;
  }

  /** the hit radius, in world units, of whatever is invited right now */
  invitedHitRadius() {
    const h = this.house;
    switch (this.state) {
      case 'FIND': case 'WALK': return h ? h.hitRadius : 0;
      case 'BELL': return h ? h.doorbell.userData.hitRadius : 0;
      case 'REVEAL': return 0.95;
      case 'BUCKET': return this.ctx.girl.bucket.userData.hitRadius || 0;
      case 'ENDING':
        return this.restartReady ? this.ctx.world.houses[0].hitRadius : 0;
      default: return 0;
    }
  }

  /** the thing the world is currently inviting, as a world-space point */
  invitedPoint() {
    const h = this.house;
    switch (this.state) {
      case 'FIND': return h ? h.doorWorld.clone() : null;
      case 'WALK': return h ? h.doorWorld.clone() : null;
      case 'BELL': return h ? h.doorbell.getWorldPosition(new THREE.Vector3()) : null;
      case 'REVEAL': return girlWorldPoint(this.ctx.girl, 'head');
      case 'BUCKET': return girlWorldPoint(this.ctx.girl, 'bucket');
      case 'ENDING':
        if (!this.restartReady) return null;
        return (this.restartPoint ||
          this.ctx.world.houses[0].lanterns[0].getWorldPosition(new THREE.Vector3())).clone();
      default: return null;
    }
  }

  // ------------------------------------------------------- named scenarios
  /**
   * Load the consistent state that sits right before `stage` at `houseIndex`,
   * reusing the normal init and the normal transitions. The run-up to the
   * stage is fast-forwarded; the stage itself is left untouched and waiting
   * for a real tap.
   */
  loadScenario(stage, houseIndex) {
    const st = String(stage || 'find').toUpperCase();
    if (STATES.indexOf(st) < 0) throw new Error('unknown scenario stage: ' + stage);
    const world = this.ctx.world;
    let want = Math.max(1, Math.min(world.houses.length - 1, houseIndex || 1));
    if (st === 'ENDING') want = world.houses.length - 1;

    this.ready = false;
    this.clearTimers();
    this.fw = undefined;
    this.endingPhase = null;
    this.poseToCamera = null;
    this.bellSpark = 0;
    this.bucketSpark = 0;
    this.attractor.active = false;
    this.attractor.level = 0;
    resetGirl(this.ctx.girl);
    world.resetHouses();
    this.ctx.fireflies.reset();
    this.ctx.leaves.reset();
    this.ctx.sparkles.reset();
    this.ctx.candy.reset();
    this.ctx.bats.reset();
    this.ctx.fireworks.reset();
    this.ctx.cam.orbit = 0;
    this.ctx.cam.eyeScale = 1;
    this.ctx.cam.zoom = 1;
    this.ctx.cam.pan = null;
    this.ctx.cam.dirOverride = null;
    this.ctx.cam.lookLift = 0.25;
    this.ctx.cam.lerpRate = 2.0;
    this.ctx.cam.setShot(null);
    this.events.length = 0;
    this.eventSeq = 0;
    this.lastRejection = null;

    this.start();                       // the normal fresh-game path
    this.note('scenario', { stage: st, house: want });

    let guard = 0;
    while (this.houseIndex < want && guard++ < 200) this.advance();
    while (this.state !== st && guard++ < 200) this.advance();
    // advance() leaves scheduled work behind; a scenario starts quiet
    if (st !== 'OPEN' && st !== 'CANDY' && st !== 'NEXT' && st !== 'ENDING') this.clearTimers();
    // and it must not inherit a half-played animation from the run-up
    const g = this.ctx.girl;
    if (st !== 'ENDING') {
      g.anim = null; g.animT = 0; g.animDur = 0;
      g.rig.position.set(0, 0, 0);
      g.ringGlow = 0;
      if (st !== 'WALK') g.path = null;
    }
    // the run-up can leave an establishing pan mid-flight; a scenario is quiet
    this.ctx.cam.pan = null;
    this.idle = 0;
    this.ready = true;
    this.note('ready', { stage: this.state, house: this.houseIndex });
    return { stage: this.state, houseIndex: this.houseIndex };
  }

  /** what the world is currently inviting a tap on - taps near it win ties */
  expected() {
    switch (this.state) {
      case 'FIND': return { type: 'house', house: this.houseIndex };
      case 'BELL': return { type: 'doorbell', house: this.houseIndex };
      case 'REVEAL': return { type: 'girl' };
      case 'BUCKET': return { type: 'bucket' };
      // once the ending offers another go, the blinking home wins any tie
      case 'ENDING': return this.restartReady ? { type: 'house', house: 0 } : null;
      default: return null;
    }
  }
}
