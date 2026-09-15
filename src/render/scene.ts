import * as THREE from 'three';
import type { Palette } from '../levels/schema';
import { fitOrthographic, onViewportChange, readSafeInsets, type SafeInsets } from './fit';

export interface Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  readonly root: THREE.Group;
  /** 盤面のバウンディングボックスに合わせてカメラを再フィットする */
  fit(box: THREE.Box3): void;
  setPalette(palette: Palette): void;
  /** 毎フレーム呼ばれるコールバックを登録する */
  onFrame(cb: (dt: number, t: number) => void): void;
  start(): void;
  dispose(): void;
}

export function createStage(container: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // R4
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);

  // 正射影の固定アイソメ(5.3)。回転・自由視点は無し
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  scene.add(camera);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.05);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(4, 8, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); // 7.3
  sun.shadow.bias = -0.0015;
  scene.add(sun);
  scene.add(sun.target);

  let insets: SafeInsets = readSafeInsets();
  let lastBox = new THREE.Box3(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 1, 2));

  function resize(): void {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    fitOrthographic(camera, { box: lastBox, width: w, height: h, insets });
  }

  function fit(box: THREE.Box3): void {
    lastBox = box.clone();
    // 影のフラスタムを盤面にぴったり合わせる(7.3)
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z) * 0.9 + 1.5;
    sun.position.set(center.x + r, center.y + r * 1.8, center.z + r * 0.9);
    sun.target.position.copy(center);
    sun.target.updateMatrixWorld();
    const cam = sun.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 0.1;
    cam.far = r * 6;
    cam.updateProjectionMatrix();
    resize();
  }

  function setPalette(palette: Palette): void {
    const sky = new THREE.Color(palette.sky);
    scene.background = sky;
    hemi.color.copy(sky);
    hemi.groundColor.copy(new THREE.Color(palette.ground).multiplyScalar(0.6));
    document.documentElement.style.background = palette.sky;
    document.body.style.background = palette.sky;
  }

  const frameCbs: ((dt: number, t: number) => void)[] = [];
  function onFrame(cb: (dt: number, t: number) => void): void {
    frameCbs.push(cb);
  }

  let raf = 0;
  let prev = 0;
  function loop(now: number): void {
    raf = requestAnimationFrame(loop);
    const t = now / 1000;
    const dt = prev === 0 ? 0 : Math.min(0.05, t - prev);
    prev = t;
    for (const cb of frameCbs) cb(dt, t);
    renderer.render(scene, camera);
  }

  const offViewport = onViewportChange(() => {
    insets = readSafeInsets();
    resize();
  });

  // R3: コンテキストロストに備えて既定の挙動を止め、復帰時に再フィットする
  renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
  renderer.domElement.addEventListener('webglcontextrestored', () => resize());

  resize();

  return {
    renderer,
    scene,
    camera,
    root,
    fit,
    setPalette,
    onFrame,
    start() {
      if (raf === 0) raf = requestAnimationFrame(loop);
    },
    dispose() {
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
      offViewport();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
