import * as THREE from 'three';
import type { Audio } from '../audio/audio';
import { clamp, damp, type Particles } from '../fx/fx';
import type { TrackGraph } from '../track/graph';
import type { Train } from '../train/train';
import { hitSphere } from '../train/train';
import { buildDoll, buildProp, propRadius, type PropType } from './models';

export interface Prop {
  id: string;
  type: PropType;
  group: THREE.Group;
  x: number;
  z: number;
  rot: number;
  lift: number; // current visual lift height
  liftTarget: number;
  wobble: number;
  /** station only */
  waiting: Doll[];
  spawnTimer: number;
  cooldown: number;
  onTrack: boolean;
  reactTimer: number;
}

export interface Doll {
  group: THREE.Group;
  t: number;
  from: string; // station id
  state: 'wait' | 'board' | 'ride' | 'exit';
  anim: number;
  rideTime: number;
  target: THREE.Vector3;
  start: THREE.Vector3;
}

export interface SerializedProp {
  type: PropType;
  x: number;
  z: number;
  rot: number;
}

let counter = 0;

export class Props {
  group = new THREE.Group();
  list: Prop[] = [];
  onboard: Doll[] = [];
  private tmp = new THREE.Vector3();
  private t = 0;

  constructor(scene: THREE.Scene, private graph: TrackGraph, private train: Train, private audio: Audio, private fx: Particles) {
    scene.add(this.group);
  }

  add(type: PropType, x: number, z: number, rot = Math.random() * Math.PI * 2, lifted = false): Prop {
    const group = buildProp(type);
    group.add(hitSphere(Math.max(0.6, propRadius(type) + 0.3), 0.4));
    const p: Prop = {
      id: `p${++counter}`,
      type,
      group,
      x,
      z,
      rot,
      lift: lifted ? 1.2 : 0,
      liftTarget: lifted ? 1.2 : 0,
      wobble: 0,
      waiting: [],
      spawnTimer: 2 + Math.random() * 2,
      cooldown: 0,
      onTrack: false,
      reactTimer: 0,
    };
    group.userData.propId = p.id;
    this.group.add(group);
    this.list.push(p);
    this.applyTransform(p);
    return p;
  }

  byId(id: string): Prop | undefined {
    return this.list.find((p) => p.id === id);
  }

  remove(p: Prop): void {
    for (const d of p.waiting) this.group.remove(d.group);
    p.waiting = [];
    this.group.remove(p.group);
    this.list = this.list.filter((q) => q !== p);
  }

  /** Nearest free spot on the felt that isn't on the rails. */
  clearOfTrack(x: number, z: number, type: PropType): [number, number] {
    const r = propRadius(type) + 0.55;
    let px = x;
    let pz = z;
    for (let iter = 0; iter < 8; iter++) {
      const hit = this.graph.nearestOnTrack([px, pz]);
      if (!hit || hit.d >= r) break;
      // push away from the track
      const dx = px - hit.seg.pts[hit.index][0];
      const dz = pz - hit.seg.pts[hit.index][1];
      const d = Math.hypot(dx, dz) || 1;
      px += (dx / d) * (r - hit.d + 0.05);
      pz += (dz / d) * (r - hit.d + 0.05);
    }
    return [px, pz];
  }

  /** Stations snap parallel to the nearest rail, platform facing it. */
  snapStation(p: Prop): void {
    const hit = this.graph.nearestOnTrack([p.x, p.z]);
    if (!hit || hit.d > 2.2) return;
    const seg = hit.seg;
    const i = hit.index;
    const a = seg.pts[Math.max(0, i - 1)];
    const b = seg.pts[Math.min(seg.pts.length - 1, i + 1)];
    const tx = b[0] - a[0];
    const tz = b[1] - a[1];
    const len = Math.hypot(tx, tz) || 1;
    const nx = -tz / len;
    const nz = tx / len;
    // choose the side the station is currently on
    const side = (p.x - seg.pts[i][0]) * nx + (p.z - seg.pts[i][1]) * nz >= 0 ? 1 : -1;
    const off = 0.95;
    p.x = seg.pts[i][0] + nx * side * off;
    p.z = seg.pts[i][1] + nz * side * off;
    // platform local -Z must face the track: rotation so that local +X is along tangent, and -Z points to track.
    const yaw = -Math.atan2(tz, tx);
    p.rot = side === 1 ? yaw : yaw + Math.PI;
    p.onTrack = true;
    this.applyTransform(p);
  }

  applyTransform(p: Prop): void {
    p.group.position.set(p.x, p.lift, p.z);
    p.group.rotation.set(0, p.rot, 0);
  }

  /** World position where waiting dolls stand on a station. */
  private stationSlot(p: Prop, k: number, out: THREE.Vector3): THREE.Vector3 {
    return p.group.localToWorld(out.set(-0.7 + k * 0.45, 0.22, -0.2));
  }

  private trackSideOfStation(p: Prop, out: THREE.Vector3): THREE.Vector3 {
    return p.group.localToWorld(out.set(0, 0.2, -0.95));
  }

  serialize(): SerializedProp[] {
    const r2 = (v: number): number => Math.round(v * 100) / 100;
    return this.list.map((p) => ({ type: p.type, x: r2(p.x), z: r2(p.z), rot: r2(p.rot) }));
  }

  load(data: SerializedProp[]): void {
    for (const d of data) {
      const p = this.add(d.type, d.x, d.z, d.rot);
      if (d.type === 'station') this.snapStation(p);
    }
  }

  update(dt: number): void {
    this.t += dt;
    const train = this.train;
    const locoPos = train.loco.position;
    for (const p of this.list) {
      // lift / wobble animation
      p.lift = damp(p.lift, p.liftTarget, 12, dt);
      if (p.wobble > 0) {
        p.wobble = Math.max(0, p.wobble - dt);
        p.group.rotation.z = Math.sin(this.t * 28) * 0.08 * Math.min(1, p.wobble);
        p.group.rotation.x = Math.cos(this.t * 23) * 0.06 * Math.min(1, p.wobble);
      } else {
        p.group.rotation.z = 0;
        p.group.rotation.x = 0;
      }
      p.group.position.y = p.lift;
      p.group.rotation.y = p.rot;

      const dTrain = Math.hypot(locoPos.x - p.x, locoPos.z - p.z);

      // animals react to the passing train
      if (p.type === 'cow' || p.type === 'sheep' || p.type === 'dog') {
        p.reactTimer -= dt;
        if (dTrain < 2.6 && train.isMoving && p.reactTimer <= 0) {
          p.reactTimer = 4 + Math.random() * 3;
          p.wobble = 0.8;
          if (p.type === 'cow') this.audio.moo();
          else if (p.type === 'sheep') this.audio.baa();
          else this.audio.woof();
          p.group.userData.hop = 1;
        }
        const hop = (p.group.userData.hop as number | undefined) ?? 0;
        if (hop > 0) {
          p.group.userData.hop = Math.max(0, hop - dt * 2.2);
          p.group.position.y = p.lift + Math.sin((1 - hop) * Math.PI) * 0.3;
        }
        if (p.type === 'dog') {
          const tail = p.group.getObjectByName('tail');
          if (tail) tail.rotation.y = Math.sin(this.t * 10) * 0.5;
        }
      }

      if (p.type === 'station') this.updateStation(p, dt, dTrain);
    }

    // dolls riding: keep them in the coaches
    this.onboard.forEach((d, k) => {
      if (train.isMoving) d.rideTime += dt;
      const car = train.cars[k % train.cars.length];
      const slot = Math.floor(k / train.cars.length);
      car.localToWorld(this.tmp.set(-0.25 + slot * 0.25, 0.45, 0));
      d.group.position.copy(this.tmp);
      d.group.quaternion.copy(car.quaternion);
    });
  }

  private updateStation(p: Prop, dt: number, dTrain: number): void {
    const train = this.train;
    if (!p.onTrack) this.snapStation(p);
    p.cooldown = Math.max(0, p.cooldown - dt);

    // spawn passengers now and then (max 3)
    p.spawnTimer -= dt;
    if (p.spawnTimer <= 0 && p.waiting.length < 3 && this.list.filter((q) => q.type === 'station').length >= 1) {
      p.spawnTimer = 6 + Math.random() * 6;
      const doll: Doll = { group: buildDoll(Math.floor(Math.random() * 5)), t: 0, from: p.id, state: 'wait', anim: 0, rideTime: 0, target: new THREE.Vector3(), start: new THREE.Vector3() };
      p.waiting.push(doll);
      this.group.add(doll.group);
      this.stationSlot(p, p.waiting.length - 1, doll.group.position);
      doll.group.position.y += 1.2; // drops in
      doll.start.copy(doll.group.position);
      doll.anim = 0;
    }

    // dolls waiting: stand in slots, wave when the train is near
    p.waiting.forEach((d, k) => {
      d.t += dt;
      if (d.state === 'wait') {
        const slot = this.stationSlot(p, k, this.tmp);
        d.group.position.x = damp(d.group.position.x, slot.x, 8, dt);
        d.group.position.z = damp(d.group.position.z, slot.z, 8, dt);
        d.group.position.y = damp(d.group.position.y, slot.y, 8, dt);
        d.group.rotation.y = p.rot;
        const arm = d.group.getObjectByName('arm');
        if (arm) arm.rotation.z = dTrain < 6 ? -2.6 + Math.sin(d.t * 10) * 0.4 : -0.4;
      } else if (d.state === 'board') {
        d.anim = Math.min(1, d.anim + dt * 1.4);
        const e = d.anim * d.anim * (3 - 2 * d.anim);
        d.group.position.lerpVectors(d.start, d.target, e);
        d.group.position.y += Math.sin(e * Math.PI) * 0.4;
        if (d.anim >= 1) {
          d.state = 'ride';
          this.onboard.push(d);
        }
      }
    });
    p.waiting = p.waiting.filter((d) => d.state === 'wait' || d.state === 'board');

    // exiting dolls animate off the train onto the platform
    for (const d of this.exiting) {
      if (d.from !== p.id) continue;
      d.anim = Math.min(1, d.anim + dt * 1.2);
      const e = d.anim * d.anim * (3 - 2 * d.anim);
      d.group.position.lerpVectors(d.start, d.target, e);
      d.group.position.y += Math.sin(e * Math.PI) * 0.5;
      d.group.rotation.y += dt * 6;
      if (d.anim >= 1) {
        d.state = 'wait';
        d.t = 0;
        d.from = p.id;
        p.waiting.push(d);
        this.exiting = this.exiting.filter((q) => q !== d);
        this.fx.sparkle(d.group.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 8);
        this.audio.sparkle();
      }
    }

    // the train pulls in when passengers are waiting or want to get off here
    const wantsStop = p.waiting.some((d) => d.state === 'wait') || this.onboard.some((d) => this.wantsOff(d, p));
    const nearLoco = dTrain < 1.5;
    if (nearLoco && wantsStop && p.cooldown <= 0 && train.running) {
      p.cooldown = 10;
      train.hold = 3.2;
      this.audio.bell();
      const bell = p.group.getObjectByName('bell');
      if (bell) p.wobble = 0.6;
      // schedule boarding once stopped
      p.group.userData.boardTimer = 1.0;
    }
    const bt = p.group.userData.boardTimer as number | undefined;
    if (bt !== undefined) {
      const nb = bt - dt;
      p.group.userData.boardTimer = nb;
      if (nb <= 0) {
        delete p.group.userData.boardTimer;
        this.exchange(p);
      }
    }
  }

  private exiting: Doll[] = [];

  /** A passenger gets off at another station, or back home after a good long ride. */
  private wantsOff(d: Doll, station: Prop): boolean {
    return d.from !== station.id || d.rideTime > 9;
  }

  /** Passengers get off (if from elsewhere) and on. */
  private exchange(p: Prop): void {
    const leaving = this.onboard.filter((d) => this.wantsOff(d, p));
    if (leaving.length) {
      this.onboard = this.onboard.filter((d) => !leaving.includes(d));
      leaving.forEach((d, k) => {
        d.state = 'exit';
        d.anim = 0;
        d.rideTime = 0;
        d.start.copy(d.group.position);
        this.stationSlot(p, p.waiting.length + k, d.target);
        d.from = p.id;
        this.exiting.push(d);
      });
      this.audio.passengers(false);
    }
    const boarding = p.waiting.filter((d) => d.state === 'wait');
    if (boarding.length && this.onboard.length + boarding.length <= 6) {
      const door = this.trackSideOfStation(p, new THREE.Vector3());
      boarding.forEach((d) => {
        d.state = 'board';
        d.anim = 0;
        d.start.copy(d.group.position);
        d.target.copy(door).add(new THREE.Vector3(0, 0.25, 0));
      });
      this.audio.passengers(true);
    }
    if (leaving.length || boarding.length) {
      this.fx.sparkle(this.trackSideOfStation(p, new THREE.Vector3()).add(new THREE.Vector3(0, 0.6, 0)), 12);
    }
  }

  /** After new rails are laid, anything sitting on them hops aside. */
  pushOffTrack(): boolean {
    let moved = false;
    for (const p of this.list) {
      const [x, z] = this.clearOfTrack(p.x, p.z, p.type);
      if (Math.abs(x - p.x) > 1e-3 || Math.abs(z - p.z) > 1e-3) {
        p.x = x;
        p.z = z;
        p.group.userData.hop = 1;
        p.wobble = 0.5;
        if (p.type === 'station') {
          p.onTrack = false;
          this.snapStation(p);
        } else this.applyTransform(p);
        moved = true;
      }
    }
    return moved;
  }

  /** Bounding points for camera framing. */
  bounds(out: THREE.Box3): void {
    for (const p of this.list) out.expandByPoint(this.tmp.set(p.x, 0, p.z));
  }

  radiusOf(p: Prop): number {
    return propRadius(p.type);
  }

  setLift(p: Prop, up: boolean): void {
    p.liftTarget = up ? 0.9 : 0;
  }

  static clampToFelt(v: number, half: number): number {
    return clamp(v, -half + 0.6, half - 0.6);
  }
}
