/** トンネル(山 + 扉)。ローカル +z が進行方向、-y が地面。 */
import { Group, Mesh, CylinderGeometry, BoxGeometry, PlaneGeometry } from 'three';
import { mat, glow } from '../materials';

export class Tunnel {
  readonly group = new Group();
  private doors: Mesh[] = [];
  private light: Mesh;
  open = 0;

  constructor(color: string) {
    const g = this.group;
    const mountain = new Mesh(new CylinderGeometry(1.5, 1.5, 2.2, 20, 1, false, 0, Math.PI), mat(color));
    // 軸を z に(x 回転)、その後 +x 側の半分を上へ(z 回転)。順序は X → Z
    mountain.rotation.order = 'ZYX';
    mountain.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    mountain.castShadow = true; mountain.receiveShadow = true;
    g.add(mountain);
    const hole = new Mesh(new BoxGeometry(1.3, 1.1, 2.3), mat('#2b1d12', { flat: false }));
    hole.position.set(0, 0.55, 0);
    g.add(hole);
    this.light = new Mesh(new PlaneGeometry(1.2, 1.0), glow('#ffe9a0', 0.0));
    this.light.position.set(0, 0.6, -1.16);
    g.add(this.light);
    for (const side of [-1, 1]) {
      const door = new Mesh(new BoxGeometry(0.66, 1.15, 0.12), mat('#a2643a'));
      door.position.set(side * 0.33, 0.58, -1.2);
      door.castShadow = true;
      g.add(door);
      this.doors.push(door);
    }
    this.setOpen(0);
  }

  setOpen(v: number): void {
    this.open = v;
    this.doors.forEach((d, i) => { d.position.x = (i === 0 ? -1 : 1) * (0.33 + v * 0.7); });
  }

  /** 漏れる光(0..1)。扉が少しでも開いていれば脈打つ */
  setGlow(alpha: number): void {
    (this.light.material as { opacity: number }).opacity = alpha;
  }
}
