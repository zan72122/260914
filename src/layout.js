import * as THREE from 'three';

// 縦横で構図を切り替える。Stone の状態には一切触れない。
const TILT = 33 * Math.PI / 180;   // 作業台を見下ろす角度

export const LAYOUTS = {
  portrait: {
    dist: 12.0,
    look: new THREE.Vector3(0, 0.35, 0),
    stone: new THREE.Vector3(0, 1.35, 0),      // 中央より少し上
    from: new THREE.Vector3(0, -1, 0.26),      // ドップが来る方向（画面の下・少し手前）
    rigFrom: new THREE.Vector3(0.34, -1, 0.10),// 砥石は真下より少し横にずらして受け皿と重ねない
    ped: new THREE.Vector3(0, -1.30, 0),
    shelf: new THREE.Vector3(0, -2.12, 1.9),
    shelfRotY: 0
  },
  landscape: {
    dist: 8.2,
    look: new THREE.Vector3(0.1, 0.10, 0),
    stone: new THREE.Vector3(-0.55, 0.35, 0),  // ほぼ中央
    from: new THREE.Vector3(1, 0, 0.24),       // ドップが来る方向（画面の右・少し手前）
    rigFrom: new THREE.Vector3(1, -0.42, 0.12),// 砥石は右やや下から当たる
    ped: new THREE.Vector3(0, -1.30, 0),
    shelf: new THREE.Vector3(-3.9, -1.55, 1.4),
    shelfRotY: 0
  }
};

export class Layout {
  constructor(renderer, camera) {
    this.renderer = renderer;
    this.camera = camera;
    this.portrait = true;
    this.conf = LAYOUTS.portrait;
    this.w = 1; this.h = 1;
  }

  apply(stone, machines) {
    const w = window.innerWidth || 390;
    const h = window.innerHeight || 844;
    this.w = w; this.h = h;
    this.portrait = h >= w;
    const c = this.conf = this.portrait ? LAYOUTS.portrait : LAYOUTS.landscape;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);

    this.camera.aspect = w / h;
    this.camera.fov = 42;
    // 極端に細い画面でも石が切れないように距離を微調整
    const need = 2.05 / Math.max(0.25, Math.tan(42 * Math.PI / 360) * this.camera.aspect);
    const dist = Math.max(c.dist, need);
    this.camera.position.set(
      c.look.x,
      c.look.y + Math.sin(TILT) * dist,
      c.look.z + Math.cos(TILT) * dist
    );
    this.camera.lookAt(c.look);
    this.camera.updateProjectionMatrix();

    stone.group.position.copy(c.stone);
    machines.fromDir.copy(c.from).normalize();
    machines.rigFrom.copy(c.rigFrom).normalize();
    machines.pedestal.position.copy(c.stone).add(c.ped);
    machines.spot.position.set(c.stone.x, machines.table.position.y + 0.26, c.stone.z + 0.6);
    machines.shelf.position.copy(c.shelf);
    machines.shelf.rotation.y = c.shelfRotY;
  }

  /** 画面上での石の位置と半径（px）— Playwright の試遊が指を当てる場所を知るため */
  stoneScreen(stone) {
    const p = stone.group.position.clone().project(this.camera);
    const x = (p.x * 0.5 + 0.5) * this.w;
    const y = (-p.y * 0.5 + 0.5) * this.h;
    const edge = stone.group.position.clone();
    const right = new THREE.Vector3();
    this.camera.getWorldDirection(right);
    right.cross(this.camera.up).normalize();
    edge.addScaledVector(right, stone.hitRadius());
    const q = edge.project(this.camera);
    const ex = (q.x * 0.5 + 0.5) * this.w;
    const ey = (-q.y * 0.5 + 0.5) * this.h;
    return { x, y, r: Math.hypot(ex - x, ey - y) };
  }
}
