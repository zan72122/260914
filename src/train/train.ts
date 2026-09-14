import * as THREE from 'three';
import { clamp, damp, PALETTE, toy } from '../fx/fx';
import type { PathPos, TrackGraph } from '../track/graph';

const CAR_LEN = 1.05;
const CAR_GAP = 0.18;
const MAX_SPEED = 3.2;

const wheelGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 14).rotateX(Math.PI / 2);
const hubGeo = new THREE.BoxGeometry(0.16, 0.05, 0.1);
const wheelMat = toy(PALETTE.wheel);
const hubMat = toy(PALETTE.white);

function wheelSet(parent: THREE.Object3D, x: number, w = 0.5): void {
  for (const s of [-1, 1]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(x, 0.16, (s * w) / 2);
    wheel.castShadow = true;
    wheel.name = 'wheel';
    parent.add(wheel);
    const h = new THREE.Mesh(hubGeo, hubMat);
    h.position.set(0, 0, s * 0.045);
    wheel.add(h);
  }
}

/** Invisible, generous touch target so small fingers hit the toy easily. */
export function hitSphere(r: number, y: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  m.position.y = y;
  m.name = 'hit';
  return m;
}

export function buildLocomotive(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.3, 0.5), toy(PALETTE.loco));
  body.position.set(0, 0.32, 0);
  body.castShadow = true;
  g.add(body);
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 16), toy(PALETTE.loco));
  boiler.rotation.z = Math.PI / 2;
  boiler.position.set(0.15, 0.58, 0);
  boiler.castShadow = true;
  g.add(boiler);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.5), toy(PALETTE.car1));
  cab.position.set(-0.3, 0.68, 0);
  cab.castShadow = true;
  g.add(cab);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.58), toy(PALETTE.wheel));
  roof.position.set(-0.3, 0.96, 0);
  roof.castShadow = true;
  g.add(roof);
  const window1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.26), toy(PALETTE.glow));
  window1.position.set(-0.12, 0.72, 0);
  g.add(window1);
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.25, 12), toy(PALETTE.wheel));
  chimney.position.set(0.34, 0.85, 0);
  chimney.castShadow = true;
  chimney.name = 'chimney';
  g.add(chimney);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), toy(PALETTE.car2));
  dome.position.set(0.05, 0.78, 0);
  g.add(dome);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), toy(PALETTE.loco));
  nose.position.set(0.45, 0.58, 0);
  g.add(nose);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 16), toy(PALETTE.white));
  face.rotation.z = Math.PI / 2;
  face.position.set(0.62, 0.58, 0);
  g.add(face);
  // headlamp glow
  const lamp = new THREE.PointLight(0xffe0a0, 0.0, 3);
  lamp.position.set(0.7, 0.58, 0);
  lamp.name = 'lamp';
  g.add(lamp);
  wheelSet(g, 0.25);
  wheelSet(g, -0.25);
  // magnet coupling knob at the back
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), toy(PALETTE.wheel));
  knob.position.set(-0.52, 0.28, 0);
  g.add(knob);
  return g;
}

export function buildCar(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.42, 0.5), toy(color));
  body.position.set(0, 0.42, 0);
  body.castShadow = true;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.58), toy(PALETTE.woodDark));
  roof.position.set(0, 0.67, 0);
  roof.castShadow = true;
  g.add(roof);
  for (const x of [-0.25, 0.25]) {
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.02), toy(PALETTE.glow));
      w.position.set(x, 0.48, s * 0.255);
      g.add(w);
    }
  }
  wheelSet(g, 0.28);
  wheelSet(g, -0.28);
  const seats = new THREE.Group();
  seats.name = 'seats';
  g.add(seats);
  return g;
}

/** The single train: a locomotive with two coaches following the loco along the rails. */
export class Train {
  group = new THREE.Group();
  loco = buildLocomotive();
  cars = [buildCar(PALETTE.car1), buildCar(PALETTE.car2)];
  pos: PathPos | null = null;
  speed = 0; // signed along forward axis (always >= 0 here, direction stored as dir)
  dir: 1 | -1 = 1;
  throttle = 0; // 0..1 target
  running = false;
  reversePause = 0;
  private wheelSpin = 0;
  private t = 0;
  /** Set when the train has been asked to hold (e.g., at a station). */
  hold = 0;
  smokeTimer = 0;
  onDeadEnd: (() => void) | null = null;

  constructor(scene: THREE.Scene, private graph: TrackGraph) {
    this.loco.add(hitSphere(1.0, 0.45));
    for (const c of this.cars) c.add(hitSphere(0.8, 0.4));
    this.group.add(this.loco, ...this.cars);
    scene.add(this.group);
  }

  get isMoving(): boolean {
    return Math.abs(this.speed) > 0.05;
  }

  get maxSpeed(): number {
    return MAX_SPEED;
  }

  /** Put the train on a segment at arc s. */
  placeOn(seg: string, s: number, sign: 1 | -1 = 1): void {
    this.pos = { seg, s, sign };
    this.dir = 1;
    this.speed = 0;
    this.updateMeshes();
  }

  /** If the current segment vanished, hop to any remaining one (or hide). */
  validate(): void {
    if (this.pos && this.graph.segments.has(this.pos.seg)) return;
    const first = this.graph.segments.values().next().value;
    if (first) this.placeOn(first.id, Math.min(first.length * 0.5, CAR_LEN * 2.5));
    else this.pos = null;
    this.group.visible = !!this.pos;
  }

  toggle(): void {
    if (this.running) {
      this.running = false;
      this.throttle = 0;
    } else {
      this.running = true;
      this.throttle = 0.75;
      this.hold = 0;
    }
  }

  /** Cab lever: 0..1 */
  setThrottle(v: number): void {
    this.throttle = clamp(v, 0, 1);
    this.running = this.throttle > 0.02;
    if (this.running) this.hold = 0;
  }

  frontWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.loco.localToWorld(out.set(0.6, 0.55, 0));
  }

  chimneyWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.loco.localToWorld(out.set(0.34, 1.0, 0));
  }

  update(dt: number): { deadEnd: boolean } {
    let deadEnd = false;
    this.t += dt;
    if (!this.pos) return { deadEnd };
    if (this.reversePause > 0) {
      this.reversePause -= dt;
      this.speed = 0;
    } else {
      let target = this.running && this.hold <= 0 ? this.throttle * MAX_SPEED : 0;
      if (this.hold > 0) this.hold -= dt;
      // slow down before a dead end so we stop just short of it
      const ahead = this.graph.distanceToDeadEnd({ ...this.pos, sign: (this.pos.sign * this.dir) as 1 | -1 }, 6);
      const usable = Math.max(0, ahead - CAR_LEN * 0.55);
      const stopSpeed = Math.sqrt(2 * 2.5 * usable);
      target = Math.min(target, stopSpeed);
      const accel = target > this.speed ? 2.2 : 3.2;
      this.speed = damp(this.speed, target, accel, dt);
      if (target === 0 && this.speed < 0.02) this.speed = 0;

      if (this.speed > 0) {
        const r = this.graph.advance(this.pos, this.speed * dt * this.dir);
        this.pos = r.pos;
        if (!r.ok) {
          // bumped the end: turn around after a beat
          this.speed = 0;
          this.dir = (this.dir * -1) as 1 | -1;
          this.reversePause = 0.7;
          deadEnd = true;
          this.onDeadEnd?.();
        }
      } else if (this.running && usable < 0.05 && this.hold <= 0) {
        // arrived at a dead end at crawl speed: reverse
        this.dir = (this.dir * -1) as 1 | -1;
        this.reversePause = 0.7;
        deadEnd = true;
        this.onDeadEnd?.();
      }
    }
    this.wheelSpin += this.speed * dt * 6;
    this.updateMeshes();
    return { deadEnd };
  }

  private tmpV = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();

  private setPose(obj: THREE.Object3D, at: PathPos, bob: number): void {
    const pl = this.graph.place(at);
    obj.position.set(pl.pos[0], pl.y + bob, pl.pos[1]);
    const fwd = this.tmpV.set(pl.tan[0], pl.pitch, pl.tan[1]).normalize();
    this.tmpQ.setFromUnitVectors(new THREE.Vector3(1, 0, 0), fwd);
    obj.quaternion.copy(this.tmpQ);
    // keep roll zero: recompute with lookAt style basis
    const m = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const realUp = new THREE.Vector3().crossVectors(fwd, right).normalize();
    m.makeBasis(fwd, realUp, right.negate());
    obj.quaternion.setFromRotationMatrix(m);
  }

  updateMeshes(): void {
    if (!this.pos) return;
    const idleBob = this.isMoving ? 0 : Math.max(0, Math.sin(this.t * 2.6)) * 0.03;
    this.setPose(this.loco, this.pos, idleBob);
    let cur = this.pos;
    for (const car of this.cars) {
      const r = this.graph.advance(cur, -(CAR_LEN + CAR_GAP));
      cur = r.pos;
      car.visible = r.ok;
      if (r.ok) this.setPose(car, cur, 0);
    }
    // spin wheels
    this.group.traverse((o) => {
      if (o.name === 'wheel') o.rotation.z = -this.wheelSpin;
    });
  }
}
