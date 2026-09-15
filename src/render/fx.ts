import * as THREE from 'three';

/** 紙吹雪(3.2 の「クリア!」の置き換え)。M4 で磨き込む簡易版 */
export interface Confetti {
  readonly group: THREE.Group;
  burst(at: THREE.Vector3): void;
  tick(dt: number): void;
}

interface Piece {
  readonly mesh: THREE.Mesh;
  readonly vel: THREE.Vector3;
  readonly spin: THREE.Vector3;
  life: number;
}

const COLORS = [0xf2d857, 0xe8734f, 0x6fc9e8, 0x8ed86a, 0xffffff, 0xe86fa8];

export function createConfetti(count = 90): Confetti {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(0.09, 0.14);
  const pieces: Piece[] = [];

  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS[i % COLORS.length]!,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    group.add(mesh);
    pieces.push({ mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
  }

  return {
    group,
    burst(at) {
      for (const p of pieces) {
        p.mesh.visible = true;
        p.mesh.position.copy(at).add(new THREE.Vector3(0, 0.3, 0));
        p.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        const a = Math.random() * Math.PI * 2;
        const s = 0.8 + Math.random() * 1.4;
        p.vel.set(Math.cos(a) * s * 0.6, 2.2 + Math.random() * 1.6, Math.sin(a) * s * 0.6);
        p.spin.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
        p.life = 1.6 + Math.random() * 0.8;
      }
    },
    tick(dt) {
      for (const p of pieces) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.mesh.visible = false;
          continue;
        }
        p.vel.y -= 5.2 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.rotation.x += p.spin.x * dt;
        p.mesh.rotation.y += p.spin.y * dt;
        p.mesh.rotation.z += p.spin.z * dt;
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, p.life);
      }
    },
  };
}
