import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// 描画・カメラ・レスポンシブ。視点操作は無し。塊が画面上部に収まるようカメラ距離だけ自動調整する。
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  // 金属・ガラスの映り込み用の環境マップ（画像ファイル不要）
  {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;
    pmrem.dispose();
  }
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
  scene.add(camera);

  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2a6e, 0.55));
  const sun = new THREE.DirectionalLight(0xfff2e0, 1.1);
  sun.position.set(6, 14, 10);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8fb8ff, 0.5);
  fill.position.set(-8, 2, -6);
  scene.add(fill);

  // 遠景のきらめき（星）
  {
    const n = 220, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120;
      pos[i * 3 + 1] = Math.random() * 60 - 10;
      pos[i * 3 + 2] = -40 - Math.random() * 40;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.55, sizeAttenuation: true, depthWrite: false });
    scene.add(new THREE.Points(g, m));
  }

  const viewDir = new THREE.Vector3(0, 0.32, 1).normalize(); // やや下から見上げる
  let fitBox = new THREE.Box3(new THREE.Vector3(-3, 3, -3), new THREE.Vector3(3, 11, 3));
  const target = new THREE.Vector3();
  const cameraHome = new THREE.Vector3();
  const shake = new THREE.Vector3();

  // 塊の箱を NDC の x∈[-0.82,0.82], y∈[-0.35,0.9] に収める距離を探す（下部は足元のボール置き場）
  function fit() {
    fitBox.getCenter(target);
    const corners = [];
    for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3(
      i & 1 ? fitBox.max.x : fitBox.min.x, i & 2 ? fitBox.max.y : fitBox.min.y, i & 4 ? fitBox.max.z : fitBox.min.z));
    const v = new THREE.Vector3();
    // 横画面では足元が塊に重なりやすいので、塊をより上に寄せる
    const yMin = camera.aspect > 1 ? -0.08 : -0.32;
    let d = 6;
    for (; d < 120; d += 0.5) {
      camera.position.copy(target).addScaledVector(viewDir, d);
      camera.lookAt(target.x, target.y - d * 0.14, target.z); // 少し下を向けて塊を上寄せ
      camera.updateMatrixWorld();
      let ok = true;
      for (const c of corners) {
        v.copy(c).project(camera);
        if (v.x < -0.82 || v.x > 0.82 || v.y < yMin || v.y > 0.9) { ok = false; break; }
      }
      if (ok) break;
    }
    cameraHome.copy(camera.position);
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fit();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 60));
  resize();

  return {
    renderer, scene, camera,
    setFitBox(box) { fitBox = box.clone(); fit(); },
    shake(amount) { shake.set((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount, 0); },
    update(dt) {
      shake.multiplyScalar(Math.max(0, 1 - dt * 8));
      camera.position.copy(cameraHome).add(shake);
    },
    render() { renderer.render(scene, camera); },
  };
}
