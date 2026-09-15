import * as THREE from 'three';
import * as A from './audio.js';
import { setHouseLit } from './house.js';
import { playAnim, addCandy, setPath, girlWorldPoint } from './girl.js';

export const STATES = ['FIND', 'WALK', 'BELL', 'OPEN', 'REVEAL', 'BUCKET', 'CANDY', 'NEXT', 'ENDING'];

const IDLE_ATTRACT = 8.0;

export class Chain {
  constructor(ctx) {
    this.ctx = ctx;              // { world, girl, cam, fireflies, leaves, sparkles, candy, bats, fireworks, debug }
    this.state = 'FIND';
    this.houseIndex = 1;         // world.houses index currently being visited (1..5)
    this.timers = [];
    this.idle = 0;
    this.busy = false;
    this.endingT = 0;
    this.restartReady = false;
    this.log = [];
  }

  // ------------------------------------------------------------ utilities
  setState(s) {
    if (this.state === s) return;
    const prev = this.state;
    this.state = s;
    this.log.push(s);
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
    this.clearTimers();
    world.setLitHouse(1);
    cam.snapNext = true;
    this.onEnter('FIND');
  }

  onEnter(s) {
    const { world, girl, cam, fireflies } = this.ctx;
    const h = this.house;
    switch (s) {
      case 'FIND': {
        this.busy = false;
        world.setLitHouse(this.houseIndex);
        h.bellTarget = 0;
        girl.lookAt = h.doorWorld.clone();
        girl.bucketHaloTarget = 0;
        girl.offerTarget = 0;
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
        girl.lookAt = h.doorbell.getWorldPosition(new THREE.Vector3());
        cam.setFocus(h.doorbell.getWorldPosition(new THREE.Vector3()), 0.6);
        cam.zoom = 0.95;
        cam.orbit = 0.62;
        cam.eyeScale = 0.62;
        fireflies.flowTo(h.doorbell.getWorldPosition(new THREE.Vector3()));
        this.ctx.sparkles.burst(h.doorbell.getWorldPosition(new THREE.Vector3()), 10, 0xffd27a, 0.5, 0.2);
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
        if (h.resident) h.resident.userData.candy.visible = true;
        cam.setFocus(h.doorWorld, 0.6);
        cam.zoom = 0.88;
        cam.orbit = 0.5;
        cam.eyeScale = 0.58;
        this.ctx.fireflies.flowTo(girlWorldPoint(this.ctx.girl, 'bucket'));
        break;
      }
      case 'CANDY': {
        this.busy = true;
        girl.offerTarget = 1;
        girl.bucketHaloTarget = 0;
        const from = h.resident
          ? h.resident.userData.candy.getWorldPosition(new THREE.Vector3())
          : h.doorWorld.clone();
        for (let i = 0; i < 9; i++) {
          this.after(0.45 + i * 0.16, () => {
            const to = girlWorldPoint(this.ctx.girl, 'bucket');
            this.ctx.candy.drop(from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.1, (Math.random() - 0.5) * 0.3)), to);
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
        this.restartReady = false;
        world.lightAll();
        world.moonSmile.opacity = 0;
        A.sfxSparkle();
        const home = world.houses[0];
        const spot = world.offsetPoint(0.075, home.side * 6.4);
        setPath(girl, this.routeTo(new THREE.Vector3(spot.x, 0, spot.z)));
        girl.lookAt = null;
        girl.speedScale = 2.4;   // a happy skip home past every lit house
        cam.setFocus(null);
        cam.zoom = 1.15;
        cam.orbit = 0.5;
        cam.eyeScale = 0.85;
        this.ctx.bats.flock(world.moonDir.clone().multiplyScalar(40).setY(22), new THREE.Vector3(0.2, -0.1, 1), 14);
        A.sfxBats();
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
    if (this.busy) return true;
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
    if (this.busy) return true;
    if (this.state === 'BELL' && i === this.houseIndex) {
      this.setState('OPEN');
      return true;
    }
    // ringing the wrong bell: a friendly twinkle, nothing breaks
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
    if (this.busy) return true;
    if (this.state === 'REVEAL') {
      this.busy = true;
      playAnim(girl, 'reveal', 1.5);
      girl.ringGlow = 1;
      A.sfxSparkle();
      this.ctx.sparkles.ring(girl.pos.clone().setY(0.8), 36, 1.1, 0xffe08a);
      const h = this.house;
      this.after(0.9, () => {
        if (h.resident) { h.resident.userData.hop = 1; h.resident.userData.waving = 0.9; }
        A.sfxLaugh();
      });
      this.after(1.7, () => this.setState('BUCKET'));
      return true;
    }
    // spin for fun any other time
    playAnim(girl, 'reveal', 1.4);
    A.sfxSparkle();
    this.ctx.sparkles.ring(girl.pos.clone().setY(0.8), 24, 1.0, 0xffe08a);
    return true;
  }

  tapBucket() {
    const { girl } = this.ctx;
    if (this.state === 'ENDING') { girl.bucketPulse = 1; A.sfxCandy(); return true; }
    if (this.busy) return true;
    if (this.state === 'BUCKET') {
      this.setState('CANDY');
      return true;
    }
    girl.bucketPulse = 1;
    A.sfxCandy((Math.random() * 5) | 0);
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
    if (this.busy) return true;
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
      this.ctx.fireworks.launch(dirPoint.x * 0.3, dirPoint.z * 0.3);
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
        this.clearTimers(); this.setState('BUCKET'); break;
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
    this.ctx.cam.orbit = 0;
    this.ctx.cam.eyeScale = 1;
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

    // keep the framed focus current for moving targets

    // ------------------------------------------------------------ ending
    if (this.state === 'ENDING') {
      this.endingT += dt;
      world.moonSmile.opacity = Math.min(0.75, this.endingT * 0.25);
      const home = world.houses[0];
      if (girl.path && this.endingT > 34) girl.path = null;   // never strand her
      if (!girl.path && girl.anim !== 'sit' && this.endingT > 1) {
        girl.speedScale = 1;
        girl.heading = Math.atan2(cam.pos.x - girl.pos.x, cam.pos.z - girl.pos.z);
        playAnim(girl, 'sit', 1.0);
        girl.bucketHaloTarget = 0.6;
        girl.candyCount = 90; girl.candyMesh.count = 90;
        girl.candyMesh.instanceMatrix.needsUpdate = true;
        cam.setFocus(home.doorWorld, 0.35);
        cam.zoom = 0.85;
        cam.eyeScale = 0.75;
        // a beat looking up at the big smiling moon
        this.after(0.7, () => cam.panTo(world.moon.position.clone(), 2.3, true));
        this.ctx.sparkles.ring(girl.pos.clone().setY(0.6), 30, 1.2, 0xffd88a);
      }
      if (girl.anim === 'sit') this.seatedT += dt;
      if (this.endingT > 1.2 && this.fw === undefined) this.fw = 0;
      if (this.fw !== undefined) {
        this.fw -= dt;
        if (this.fw <= 0) {
          this.fw = 1.6 + Math.random() * 1.6;
          const p = world.offsetPoint(Math.random() * 0.22, (Math.random() - 0.5) * 26);
          this.ctx.fireworks.launch(p.x, p.z);
          A.sfxFirework();
        }
      }
      if (this.seatedT > 4 && !this.restartReady) {
        this.restartReady = true;
        this.busy = false;
        if (this.ctx.debug) console.log('[state] restart-ready');
      }
      if (this.restartReady) {
        home.pulseBoost = 1;
        home.lanterns.forEach(l => { l.userData.target = 0.6 + 0.4 * Math.sin(this.endingT * 4); });
        this.ctx.fireflies.flowTo(home.doorWorld);
      }
      return;
    }

    // ---------------------------------------------------------- attractor
    if (this.state === 'BELL') {
      this.bellSpark = (this.bellSpark || 0) - dt;
      if (this.bellSpark <= 0) {
        this.bellSpark = 1.1;
        const p = this.house.doorbell.getWorldPosition(new THREE.Vector3());
        this.ctx.sparkles.burst(p, 6, 0xffd88a, 0.35, 0.15);
      }
    }

    this.idle += dt;
    if (this.idle > IDLE_ATTRACT) {
      this.idle = IDLE_ATTRACT - 3.2;
      this.attract();
    }
  }

  attract() {
    const { girl, world } = this.ctx;
    const h = this.house;
    let p = h.doorWorld.clone();
    if (this.state === 'BELL') p = h.doorbell.getWorldPosition(new THREE.Vector3());
    else if (this.state === 'REVEAL') p = girl.pos.clone().setY(1.2);
    else if (this.state === 'BUCKET') p = girlWorldPoint(girl, 'bucket');
    h.pulseBoost = 1;
    h.lanterns.forEach(l => { l.userData.flicker += 1.5; });
    this.ctx.fireflies.flowTo(p);
    this.ctx.sparkles.burst(p, 12, 0xffd88a, 0.6, 0.2);
    if (!girl.path) girl.lookAt = p.clone();
    A.sfxChimeSoft();
    if (this.ctx.debug) console.log('[attract]', this.state);
  }

  noteInput() { this.idle = 0; }

  /** what the world is currently inviting a tap on - taps near it win ties */
  expected() {
    switch (this.state) {
      case 'FIND': return { type: 'house', house: this.houseIndex };
      case 'BELL': return { type: 'doorbell', house: this.houseIndex };
      case 'REVEAL': return { type: 'girl' };
      case 'BUCKET': return { type: 'bucket' };
      default: return null;
    }
  }
}
