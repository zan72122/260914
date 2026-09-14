/** Raycaster と当たり判定用の不可視球。レイヤー 1 に置き、描画はしない。 */
import { Mesh, SphereGeometry, MeshBasicMaterial, Raycaster, Vector2, Vector3, Plane, type Object3D, type Camera } from 'three';

export const HIT_LAYER = 1;
const hitGeo = new SphereGeometry(1, 8, 6);
const hitMat = new MeshBasicMaterial({ visible: false });

export interface HitInfo { kind: string; [k: string]: unknown }

export function makeHit(radius: number, info: HitInfo, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(hitGeo, hitMat);
  m.scale.setScalar(radius);
  m.position.set(x, y, z);
  m.layers.set(HIT_LAYER);
  m.userData = info;
  return m;
}

export class Picker {
  private ray = new Raycaster();
  private ndc = new Vector2();

  constructor(private camera: Camera, private width: () => number, private height: () => number) {
    this.ray.layers.set(HIT_LAYER);
  }

  private setFrom(x: number, y: number): void {
    this.ndc.set((x / this.width()) * 2 - 1, -(y / this.height()) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
  }

  /** 最も手前の当たりを返す */
  pick(x: number, y: number, roots: Object3D[]): HitInfo | null {
    this.setFrom(x, y);
    const hits = this.ray.intersectObjects(roots, true);
    return hits.length ? (hits[0].object.userData as HitInfo) : null;
  }

  /** 高さ y の水平面との交点 */
  onPlane(x: number, y: number, planeY: number): Vector3 | null {
    this.setFrom(x, y);
    const plane = new Plane(new Vector3(0, 1, 0), -planeY);
    const out = new Vector3();
    return this.ray.ray.intersectPlane(plane, out) ? out : null;
  }
}
