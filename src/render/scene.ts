import * as THREE from 'three';
import type { Palette } from '../levels/schema';
import { fitOrthographic, onViewportChange, readSafeInsets, type SafeInsets } from './fit';

/** カメラ移動(島 ↔ 盤面)の時間(7.4) */
export const CAMERA_SECONDS = 0.8;
/**
 * 明滅・旗の揺れしか動いていないフレームの描画間隔(R5)。
 * まったく描かないと明滅が止まってしまうので、低頻度でだけ描く。
 */
const IDLE_FRAME_SECONDS = 1 / 12;

export interface Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  readonly root: THREE.Group;
  /** 盤面のバウンディングボックスに合わせてカメラを再フィットする */
  fit(box: THREE.Box3): void;
  /** 現在の枠から box へ seconds かけて寄る / 引く(7.4: 0.8s ease-in-out) */
  animateFit(box: THREE.Box3, seconds?: number): void;
  /** 一時的に枠を広げる(ズームアウトして地図へ戻る演出の途中など) */
  readonly fitBox: THREE.Box3;
  setPalette(palette: Palette): void;
  /** 毎フレーム呼ばれるコールバックを登録する */
  onFrame(cb: (dt: number, t: number) => void): void;
  /** このフレームは描画が要る(オンデマンドレンダリング、R5) */
  requestRender(): void;
  /** 明滅などの低頻度の更新だけが要る */
  requestIdleRender(): void;
  start(): void;
  dispose(): void;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
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

  // 影を落とす平行光は 1 灯だけ(7.3 / R4)
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(4, 8, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); // 7.3
  sun.shadow.bias = -0.0015;
  scene.add(sun);
  scene.add(sun.target);

  let insets: SafeInsets = readSafeInsets();
  let lastBox = new THREE.Box3(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 1, 2));

  // カメラ移動のトゥイーン(7.4)
  const fromBox = new THREE.Box3();
  const toBox = new THREE.Box3();
  let camT = -1;
  let camDuration = CAMERA_SECONDS;

  let dirty = true;
  let idleAccum = 0;
  let idleWanted = false;

  function requestRender(): void {
    dirty = true;
  }
  function requestIdleRender(): void {
    idleWanted = true;
  }

  function applyShadowFrustum(box: THREE.Box3): void {
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
  }

  function resize(): void {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    fitOrthographic(camera, { box: lastBox, width: w, height: h, insets });
    requestRender();
  }

  function fit(box: THREE.Box3): void {
    lastBox = box.clone();
    camT = -1;
    applyShadowFrustum(lastBox); // 影のフラスタムを盤面にぴったり合わせる(7.3)
    resize();
  }

  function animateFit(box: THREE.Box3, seconds = CAMERA_SECONDS): void {
    fromBox.copy(lastBox);
    toBox.copy(box);
    camDuration = Math.max(0.001, seconds);
    camT = 0;
    applyShadowFrustum(toBox);
    requestRender();
  }

  function setPalette(palette: Palette): void {
    const sky = new THREE.Color(palette.sky);
    scene.background = sky;
    hemi.intensity = palette.hemi;
    sun.intensity = palette.sun;
    sun.color.set(palette.sunColor);
    // 夜も半球光は十分に明るく保つ(7.1: 明度差は大きめ / 4 歳児の視認性)。
    // 夜らしさは空の色・発光プロップ・寒色の光で出す。
    hemi.color.copy(new THREE.Color(palette.night ? '#BFD8F5' : '#FFFFFF'));
    hemi.groundColor.copy(new THREE.Color(palette.ground).multiplyScalar(palette.night ? 0.75 : 0.6));
    document.documentElement.style.background = palette.sky;
    document.body.style.background = palette.sky;
    requestRender();
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

    if (camT >= 0) {
      camT = Math.min(camDuration, camT + dt);
      const e = easeInOut(camT / camDuration);
      lastBox.min.lerpVectors(fromBox.min, toBox.min, e);
      lastBox.max.lerpVectors(fromBox.max, toBox.max, e);
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      fitOrthographic(camera, { box: lastBox, width: w, height: h, insets });
      if (camT >= camDuration) camT = -1;
      dirty = true;
    }

    idleWanted = false;
    for (const cb of frameCbs) cb(dt, t);

    // オンデマンドレンダリング(R5)。明滅だけのときは低頻度で描く
    if (!dirty && idleWanted) {
      idleAccum += dt;
      if (idleAccum >= IDLE_FRAME_SECONDS) dirty = true;
    }
    if (dirty) {
      idleAccum = 0;
      renderer.render(scene, camera);
      dirty = false;
    }
  }

  const offViewport = onViewportChange(() => {
    insets = readSafeInsets();
    resize();
  });

  // R3: コンテキストロストに備えて既定の挙動を止め、復帰時に描き直す
  const onLost = (e: Event): void => e.preventDefault();
  const onRestored = (): void => {
    resize();
    requestRender();
  };
  renderer.domElement.addEventListener('webglcontextlost', onLost);
  renderer.domElement.addEventListener('webglcontextrestored', onRestored);

  resize();

  return {
    renderer,
    scene,
    camera,
    root,
    fit,
    animateFit,
    get fitBox() {
      return lastBox;
    },
    setPalette,
    onFrame,
    requestRender,
    requestIdleRender,
    start() {
      if (raf === 0) raf = requestAnimationFrame(loop);
    },
    dispose() {
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
      offViewport();
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onRestored);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
