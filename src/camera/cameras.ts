import * as THREE from 'three';
import { damp } from '../fx/fx';

export type ViewMode = 'overhead' | 'cab';

/** Screen fraction reserved for the toy box (bottom in portrait, right in landscape). */
export const TOYBOX_FRACTION = 0.2;

export class Cameras {
  overhead = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  cab = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
  /** Camera actually used for rendering (blends the two). */
  view = new THREE.PerspectiveCamera(42, 1, 0.05, 200);
  mode: ViewMode = 'overhead';
  blend = 0; // 0 = overhead, 1 = cab
  width = 1;
  height = 1;
  private targetCenter = new THREE.Vector3();
  private center = new THREE.Vector3();
  private targetDist = 14;
  private dist = 14;
  private get pitch(): number {
    return THREE.MathUtils.degToRad(this.portrait ? 64 : 56);
  }
  private tmpBox = new THREE.Box3();
  private lastBox = new THREE.Box3();
  private corners: THREE.Vector3[] = Array.from({ length: 8 }, () => new THREE.Vector3());
  private cabPos = new THREE.Vector3();
  private cabQuat = new THREE.Quaternion();

  get portrait(): boolean {
    return this.height >= this.width;
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    const aspect = w / h;
    for (const c of [this.overhead, this.cab, this.view]) {
      c.aspect = aspect;
    }
    // Shift the overhead view so the play area is centred in the part of the screen
    // not covered by the toy box.
    this.applyViewOffset();
    this.cab.updateProjectionMatrix();
    this.view.updateProjectionMatrix();
    this.frame(this.lastBox);
    this.snap();
  }

  /** Restore the overhead camera's aspect and toy-box offset (also used after the PiP render). */
  applyViewOffset(): void {
    const f = TOYBOX_FRACTION;
    const { width: w, height: h } = this;
    this.overhead.aspect = w / h;
    if (this.portrait) this.overhead.setViewOffset(w, h, 0, h * (f / 2), w, h);
    else this.overhead.setViewOffset(w, h, w * (f / 2), 0, w, h);
    this.overhead.updateProjectionMatrix();
  }

  /** Overhead camera direction (from target towards the camera). */
  private dirToCamera(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, Math.sin(this.pitch), Math.cos(this.pitch));
  }

  /** Distance needed for the given world box to fit the visible region. */
  private fitDistance(box: THREE.Box3): number {
    if (box.isEmpty()) return 12;
    const f = TOYBOX_FRACTION;
    const vfov = THREE.MathUtils.degToRad(this.overhead.fov);
    const tanV = Math.tan(vfov / 2) * (this.portrait ? 1 - f : 1) * 0.86;
    const tanH = tanV * this.overhead.aspect * (this.portrait ? 1 / (1 - f) : 1 - f);
    const dir = this.dirToCamera(new THREE.Vector3());
    const right = new THREE.Vector3(1, 0, 0);
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    const c = box.getCenter(new THREE.Vector3());
    let need = 4;
    const min = box.min;
    const max = box.max;
    let k = 0;
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) this.corners[k++].set(x, y, z);
    for (const p of this.corners) {
      const o = p.clone().sub(c);
      const depth = -o.dot(dir); // positive when farther from camera than the centre
      const px = Math.abs(o.dot(right));
      const py = Math.abs(o.dot(up));
      need = Math.max(need, px / tanH - depth, py / tanV - depth);
    }
    return Math.max(9, need);
  }

  /** Called whenever the content changes (tracks added, props moved). */
  frame(box: THREE.Box3): void {
    if (box !== this.lastBox) this.lastBox.copy(box);
    this.tmpBox.copy(box);
    // Always show at least a comfortable patch of felt and keep some margin.
    const c = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const minHalf = this.portrait ? 3.2 : 4.0;
    this.tmpBox.expandByPoint(new THREE.Vector3(c.x - minHalf, 0, c.z - minHalf));
    this.tmpBox.expandByPoint(new THREE.Vector3(c.x + minHalf, 1.5, c.z + minHalf));
    this.tmpBox.expandByScalar(1.0);
    this.tmpBox.getCenter(this.targetCenter);
    this.targetCenter.y = 0.3;
    this.targetDist = this.fitDistance(this.tmpBox);
  }

  snap(): void {
    this.center.copy(this.targetCenter);
    this.dist = this.targetDist;
    this.updateOverhead();
  }

  private updateOverhead(): void {
    const dir = this.dirToCamera(new THREE.Vector3());
    this.overhead.position.copy(this.center).addScaledVector(dir, this.dist);
    this.overhead.lookAt(this.center);
  }

  /** Place the cab camera inside the locomotive. */
  setCab(loco: THREE.Object3D): void {
    loco.updateMatrixWorld();
    loco.localToWorld(this.cabPos.set(-0.15, 1.1, 0));
    // look forward along loco +X, slightly down
    const fwd = new THREE.Vector3(1, -0.3, 0).applyQuaternion(loco.quaternion).normalize();
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), fwd, new THREE.Vector3(0, 1, 0));
    this.cabQuat.setFromRotationMatrix(m);
    this.cab.position.copy(this.cabPos);
    this.cab.quaternion.copy(this.cabQuat);
  }

  enterCab(): void {
    this.mode = 'cab';
  }

  exitCab(): void {
    this.mode = 'overhead';
  }

  get inCab(): boolean {
    return this.mode === 'cab' && this.blend > 0.95;
  }

  update(dt: number): void {
    this.center.x = damp(this.center.x, this.targetCenter.x, 2.5, dt);
    this.center.z = damp(this.center.z, this.targetCenter.z, 2.5, dt);
    this.dist = damp(this.dist, this.targetDist, 2.5, dt);
    this.updateOverhead();
    this.blend = damp(this.blend, this.mode === 'cab' ? 1 : 0, 4, dt);
    if (this.blend < 0.002) this.blend = 0;
    if (this.blend > 0.998) this.blend = 1;
    // eased blend for position; the fov blends as well
    const e = this.blend * this.blend * (3 - 2 * this.blend);
    this.view.position.lerpVectors(this.overhead.position, this.cab.position, e);
    this.view.quaternion.slerpQuaternions(this.overhead.quaternion, this.cab.quaternion, e);
    this.view.fov = THREE.MathUtils.lerp(this.overhead.fov, this.cab.fov, e);
    if (e < 0.5) {
      this.view.setViewOffset(this.width, this.height, this.overhead.view?.offsetX ?? 0, this.overhead.view?.offsetY ?? 0, this.width, this.height);
    } else this.view.clearViewOffset();
    this.view.updateProjectionMatrix();
  }
}
