import * as THREE from 'three';

export const PALETTE = {
  platformTop: 0xfaefd6,
  platformSide: 0xe9b58c,
  platformSideDark: 0xd39473,
  towerBody: 0xa9cfd2,
  towerBodyDark: 0x86b1b6,
  towerTop: 0xf6efdf,
  handle: 0xe98b6c,
  handleGlow: 0xffb48f,
  door: 0x7a659c,
  light: 0xfff3c4,
  road: 0xf3d6b0,
  drawerSide: 0x8fb3c4,
  drawerTop: 0xeaf4f8,
  girlDress: 0xffffff,
  girlHat: 0xf7b7c8,
  girlSkin: 0xffe1c9,
};

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // 地面より下は描かない(沈んだ階段や切り替え中の建物が地面に潜って見える)
  renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.02)];
  return renderer;
}

export function createScene() {
  const scene = new THREE.Scene();

  const hemi = new THREE.HemisphereLight(0xfff4e0, 0xc9b0d8, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2dc, 1.1);
  sun.position.set(6, 12, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const s = 14;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0015;
  scene.add(sun);
  scene.add(sun.target);

  return { scene, hemi, sun };
}

// 等角風の正投影カメラ
export function createCamera(target) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const dir = new THREE.Vector3(1, 1, 1).normalize();
  camera.position.copy(target).addScaledVector(dir, 30);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  return camera;
}

// 与えられたバウンディングボックスが画面に収まるように正投影の範囲を設定
export function fitCamera(camera, box, width, height, margin = 1.12) {
  const corners = [];
  for (let i = 0; i < 8; i++) {
    corners.push(
      new THREE.Vector3(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z
      )
    );
  }
  const inv = camera.matrixWorldInverse;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const c of corners) {
    c.applyMatrix4(inv);
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const w = (maxX - minX) * margin;
  const h = (maxY - minY) * margin;
  const aspect = width / height;
  let halfW, halfH;
  if (w / h > aspect) {
    halfW = w / 2;
    halfH = halfW / aspect;
  } else {
    halfH = h / 2;
    halfW = halfH * aspect;
  }
  camera.left = cx - halfW;
  camera.right = cx + halfW;
  camera.top = cy + halfH;
  camera.bottom = cy - halfH;
  camera.updateProjectionMatrix();
}
