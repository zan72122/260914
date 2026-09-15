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

/** 土煙・破片の共通インターフェース */
export interface Particles {
  readonly group: THREE.Group;
  /** at を中心に噴き出す */
  burst(at: THREE.Vector3, color?: THREE.Color): void;
  tick(dt: number): void;
}

/**
 * 土煙(4.2 T2: 持ち上げ時に少し出る)。簡易版。
 * 半透明の小さな板がふわっと広がって消える。
 */
export function createDust(count = 18): Particles {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(0.22, 0.22);
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xd8cbb4,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    group.add(mesh);
    pieces.push({ mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
  }
  let cursor = 0;
  return {
    group,
    burst(at, color) {
      for (let i = 0; i < 6; i++) {
        const p = pieces[cursor % pieces.length]!;
        cursor++;
        const mat = p.mesh.material as THREE.MeshBasicMaterial;
        if (color) mat.color.copy(color);
        p.mesh.visible = true;
        p.mesh.position.copy(at);
        p.mesh.rotation.set(-Math.PI / 2, 0, Math.random() * 6);
        p.mesh.scale.setScalar(0.5);
        const a = Math.random() * Math.PI * 2;
        p.vel.set(Math.cos(a) * 0.7, 0.5 + Math.random() * 0.3, Math.sin(a) * 0.7);
        p.spin.set(0, 0, (Math.random() - 0.5) * 3);
        p.life = 0.5 + Math.random() * 0.25;
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
        p.vel.multiplyScalar(1 - Math.min(1, dt * 3));
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.rotation.z += p.spin.z * dt;
        p.mesh.scale.addScalar(dt * 1.2);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(0.75, p.life * 1.6);
      }
    },
  };
}

/** 破片(4.2 T3: 破壊時に飛んで重力で落ちる)。0.4 秒で片づく */
export function createDebris(count = 24): Particles {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x8b7a63, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.castShadow = true;
    group.add(mesh);
    pieces.push({ mesh, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
  }
  let cursor = 0;
  return {
    group,
    burst(at, color) {
      for (let i = 0; i < 12; i++) {
        const p = pieces[cursor % pieces.length]!;
        cursor++;
        const mat = p.mesh.material as THREE.MeshLambertMaterial;
        if (color) mat.color.copy(color);
        p.mesh.visible = true;
        p.mesh.position.copy(at).add(new THREE.Vector3(0, 0.15, 0));
        p.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        p.mesh.scale.setScalar(0.6 + Math.random() * 0.7);
        const a = (Math.PI * 2 * i) / 12 + Math.random() * 0.4;
        const s = 1.1 + Math.random() * 0.9;
        p.vel.set(Math.cos(a) * s, 1.8 + Math.random() * 1.2, Math.sin(a) * s);
        p.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
        p.life = 0.4 + Math.random() * 0.15;
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
        p.vel.y -= 9 * dt; // 重力落下(7.4)
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.rotation.x += p.spin.x * dt;
        p.mesh.rotation.y += p.spin.y * dt;
        p.mesh.rotation.z += p.spin.z * dt;
      }
    },
  };
}
