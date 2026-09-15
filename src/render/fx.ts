import * as THREE from 'three';

/**
 * 紙吹雪・土煙・破片(3.2 / 4.2)。
 *
 * どれも «同じ形の粒がたくさん» なので、1 種類につき InstancedMesh 1 つにまとめる(R4)。
 * 粒ごとにメッシュとマテリアルを持つと、クリアのたびに描画命令が 100 回以上増えてしまう。
 * 濃さ(opacity)だけはインスタンスごとに持てないので、いちばん «若い» 粒に合わせて
 * まとめて薄くする。粒はほぼ同時に生まれて同時に消えるため、見た目の差は出ない。
 */

interface Piece {
  readonly pos: THREE.Vector3;
  readonly rot: THREE.Euler;
  readonly vel: THREE.Vector3;
  readonly spin: THREE.Vector3;
  scale: number;
  life: number;
}

interface Pool {
  readonly mesh: THREE.InstancedMesh;
  readonly pieces: Piece[];
  /** 行列をインスタンスに書き戻す */
  flush(): void;
}

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();

function createPool(geo: THREE.BufferGeometry, mat: THREE.Material, count: number): Pool {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = count;
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i++) {
    pieces.push({
      pos: new THREE.Vector3(),
      rot: new THREE.Euler(),
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      scale: 1,
      life: 0,
    });
  }
  const flush = (): void => {
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i]!;
      if (p.life <= 0) {
        M.makeScale(0, 0, 0);
      } else {
        Q.setFromEuler(p.rot);
        S.setScalar(p.scale);
        M.compose(p.pos, Q, S);
      }
      mesh.setMatrixAt(i, M);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  flush();
  return { mesh, pieces, flush };
}

export interface Confetti {
  readonly group: THREE.Group;
  burst(at: THREE.Vector3): void;
  tick(dt: number): void;
}

const COLORS = [0xf2d857, 0xe8734f, 0x6fc9e8, 0x8ed86a, 0xffffff, 0xe86fa8];

/** 紙吹雪(3.2 の「クリア!」の置き換え) */
export function createConfetti(count = 90): Confetti {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true });
  const pool = createPool(new THREE.PlaneGeometry(0.09, 0.14), mat, count);
  // 色は粒ごと(instanceColor)。形は同じなので 1 回の描画で済む
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) pool.mesh.setColorAt(i, color.setHex(COLORS[i % COLORS.length]!));
  if (pool.mesh.instanceColor) pool.mesh.instanceColor.needsUpdate = true;
  group.add(pool.mesh);

  return {
    group,
    burst(at) {
      for (const p of pool.pieces) {
        p.pos.copy(at).add(new THREE.Vector3(0, 0.3, 0));
        p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        const a = Math.random() * Math.PI * 2;
        const s = 0.8 + Math.random() * 1.4;
        p.vel.set(Math.cos(a) * s * 0.6, 2.2 + Math.random() * 1.6, Math.sin(a) * s * 0.6);
        p.spin.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
        p.scale = 1;
        p.life = 1.6 + Math.random() * 0.8;
      }
      mat.opacity = 1;
      pool.flush();
    },
    tick(dt) {
      let alive = 0;
      let died = false;
      for (const p of pool.pieces) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          died = true;
          continue;
        }
        alive = Math.max(alive, p.life);
        p.vel.y -= 5.2 * dt;
        p.pos.addScaledVector(p.vel, dt);
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;
      }
      if (alive > 0 || died) {
        mat.opacity = Math.min(1, Math.max(alive, 0));
        pool.flush();
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
 * 土煙(4.2 T2: 持ち上げ時に少し出る)。
 * 半透明の小さな板がふわっと広がって消える。
 */
export function createDust(count = 18): Particles {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xd8cbb4,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    opacity: 0.75,
  });
  const pool = createPool(new THREE.PlaneGeometry(0.22, 0.22), mat, count);
  group.add(pool.mesh);
  let cursor = 0;

  return {
    group,
    burst(at, color) {
      if (color) mat.color.copy(color);
      for (let i = 0; i < 6; i++) {
        const p = pool.pieces[cursor % pool.pieces.length]!;
        cursor++;
        p.pos.copy(at);
        p.rot.set(-Math.PI / 2, 0, Math.random() * 6);
        p.scale = 0.5;
        const a = Math.random() * Math.PI * 2;
        p.vel.set(Math.cos(a) * 0.7, 0.5 + Math.random() * 0.3, Math.sin(a) * 0.7);
        p.spin.set(0, 0, (Math.random() - 0.5) * 3);
        p.life = 0.5 + Math.random() * 0.25;
      }
      mat.opacity = 0.75;
      pool.flush();
    },
    tick(dt) {
      let alive = 0;
      let died = false;
      for (const p of pool.pieces) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          died = true;
          continue;
        }
        alive = Math.max(alive, p.life);
        p.vel.multiplyScalar(1 - Math.min(1, dt * 3));
        p.pos.addScaledVector(p.vel, dt);
        p.rot.z += p.spin.z * dt;
        p.scale += dt * 1.2;
      }
      if (alive > 0 || died) {
        mat.opacity = Math.min(0.75, alive * 1.6);
        pool.flush();
      }
    },
  };
}

/** 破片(4.2 T3: 破壊時に飛んで重力で落ちる)。0.4 秒で片づく */
export function createDebris(count = 24): Particles {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x8b7a63, flatShading: true });
  const pool = createPool(new THREE.BoxGeometry(0.12, 0.12, 0.12), mat, count);
  pool.mesh.castShadow = true;
  group.add(pool.mesh);
  let cursor = 0;

  return {
    group,
    burst(at, color) {
      if (color) mat.color.copy(color);
      for (let i = 0; i < 12; i++) {
        const p = pool.pieces[cursor % pool.pieces.length]!;
        cursor++;
        p.pos.copy(at).add(new THREE.Vector3(0, 0.15, 0));
        p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        p.scale = 0.6 + Math.random() * 0.7;
        const a = (Math.PI * 2 * i) / 12 + Math.random() * 0.4;
        const s = 1.1 + Math.random() * 0.9;
        p.vel.set(Math.cos(a) * s, 1.8 + Math.random() * 1.2, Math.sin(a) * s);
        p.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
        p.life = 0.4 + Math.random() * 0.15;
      }
      pool.flush();
    },
    tick(dt) {
      let alive = false;
      for (const p of pool.pieces) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          alive = true; // 消えた粒を潰すために 1 回だけ書き戻す
          continue;
        }
        alive = true;
        p.vel.y -= 9 * dt; // 重力落下(7.4)
        p.pos.addScaledVector(p.vel, dt);
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;
      }
      if (alive) pool.flush();
    },
  };
}
