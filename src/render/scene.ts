import * as THREE from 'three';
import type { Palette } from '../levels/schema';
import {
  fitOrthographic,
  frameFromBox,
  lerpFrame,
  onViewportChange,
  readSafeInsets,
  MIN_MARGIN,
  type Frame,
  type SafeInsets,
} from './fit';

/** カメラ移動(島 ↔ 盤面)の時間(7.4) */
export const CAMERA_SECONDS = 0.8;
/**
 * 明滅・旗の揺れしか動いていないフレームの描画間隔(R5)。
 * まったく描かないと明滅が止まってしまうので、低頻度でだけ描く。
 */
const IDLE_FRAME_SECONDS = 1 / 12;
/** 蛍のゆらぎ・水面のコースティクスなど「常に少し動く」ものの描画間隔(R4 / R5: 30fps に間引く) */
const SLOW_FRAME_SECONDS = 1 / 30;

export interface Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  readonly root: THREE.Group;
  /** 対象に合わせてカメラを即座に合わせる */
  fit(frame: Frame): void;
  /** 現在の枠から frame へ seconds かけて寄る / 引く(7.4: 0.8s ease-in-out) */
  animateFit(frame: Frame, seconds?: number): void;
  /** 現在の枠 */
  readonly frame: Frame;
  /** 対象の外に残す余白の割合(5.3)。地図画面は詰める */
  setMargin(margin: number): void;
  setPalette(palette: Palette): void;
  /** 毎フレーム呼ばれるコールバックを登録する。戻り値を呼ぶと解除できる */
  onFrame(cb: (dt: number, t: number) => void): () => void;
  /** このフレームは描画が要る(オンデマンドレンダリング、R5) */
  requestRender(): void;
  /** ゆっくり動くものだけが要る(30fps に間引く) */
  requestSlowRender(): void;
  /** 明滅などの低頻度の更新だけが要る(12fps) */
  requestIdleRender(): void;
  start(): void;
  /** ループを止める(画面を隠して保持しておくとき) */
  stop(): void;
  /** キャンバスの表示・非表示 */
  setVisible(visible: boolean): void;
  dispose(): void;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

const DEFAULT_FRAME: Frame = frameFromBox(
  new THREE.Box3(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 1, 2)),
);

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
  let margin = MIN_MARGIN;
  let current: Frame = DEFAULT_FRAME;

  // カメラ移動のトゥイーン(7.4)
  let fromFrame: Frame = current;
  let toFrame: Frame = current;
  let camT = -1;
  let camDuration = CAMERA_SECONDS;

  let dirty = true;
  let idleAccum = 0;
  let idleWanted = false;
  let slowWanted = false;

  function requestRender(): void {
    dirty = true;
  }
  function requestSlowRender(): void {
    slowWanted = true;
  }
  function requestIdleRender(): void {
    idleWanted = true;
  }

  function applyShadowFrustum(frame: Frame): void {
    const r = Math.max(frame.halfX, frame.halfY) * 1.1 + 1.5;
    sun.position.copy(frame.center).add(new THREE.Vector3(r, r * 1.8, r * 0.9));
    sun.target.position.copy(frame.center);
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

  function apply(): void {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    fitOrthographic(camera, { frame: current, width: w, height: h, insets, margin });
  }

  function resize(): void {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    apply();
    requestRender();
  }

  function fit(frame: Frame): void {
    current = frame;
    camT = -1;
    applyShadowFrustum(current); // 影のフラスタムを対象にぴったり合わせる(7.3)
    resize();
  }

  function animateFit(frame: Frame, seconds = CAMERA_SECONDS): void {
    fromFrame = current;
    toFrame = frame;
    camDuration = Math.max(0.001, seconds);
    camT = 0;
    applyShadowFrustum(toFrame);
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
  function onFrame(cb: (dt: number, t: number) => void): () => void {
    frameCbs.push(cb);
    return () => {
      const i = frameCbs.indexOf(cb);
      if (i >= 0) frameCbs.splice(i, 1);
    };
  }

  let raf = 0;
  let prev = 0;
  let slowAccum = 0;
  function loop(now: number): void {
    raf = requestAnimationFrame(loop);
    const t = now / 1000;
    // 1 フレームで進める時間の上限。タブ復帰などの大きな飛びだけを抑え、
    // «描画が重いだけ» のときはアニメーションが伸びないようにする(伸びると
    // 回転中の入力止めやカメラ移動が実時間より長くなる)
    const dt = prev === 0 ? 0 : Math.min(0.25, t - prev);
    prev = t;

    if (camT >= 0) {
      camT = Math.min(camDuration, camT + dt);
      current = lerpFrame(fromFrame, toFrame, easeInOut(camT / camDuration));
      apply();
      if (camT >= camDuration) camT = -1;
      dirty = true;
    }

    idleWanted = false;
    slowWanted = false;
    for (const cb of frameCbs) cb(dt, t);

    // オンデマンドレンダリング(R5)。ゆっくり動くものは 30fps、明滅だけなら 12fps
    if (!dirty && slowWanted) {
      slowAccum += dt;
      if (slowAccum >= SLOW_FRAME_SECONDS) dirty = true;
    }
    if (!dirty && idleWanted) {
      idleAccum += dt;
      if (idleAccum >= IDLE_FRAME_SECONDS) dirty = true;
    }
    if (dirty) {
      idleAccum = 0;
      slowAccum = 0;
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
    get frame() {
      return current;
    },
    setMargin(m) {
      margin = m;
      apply();
      requestRender();
    },
    setPalette,
    onFrame,
    requestRender,
    requestSlowRender,
    requestIdleRender,
    start() {
      if (raf === 0) {
        prev = 0;
        resize();
        raf = requestAnimationFrame(loop);
      }
    },
    stop() {
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
    },
    setVisible(visible) {
      renderer.domElement.style.display = visible ? 'block' : 'none';
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
