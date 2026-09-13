import * as THREE from 'three';
import { Diorama } from './scene/Diorama';
import { Gesture } from './input/Gesture';
import { Synth } from './audio/Synth';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
const synth = new Synth();
const diorama = new Diorama(scene, synth);

const LOOK = new THREE.Vector3(0, 0.55, 0);

function layout(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  const portrait = aspect < 1;
  LOOK.y = portrait ? 1.4 : 0.55;
  camera.aspect = aspect;
  camera.fov = portrait ? 58 : 44;
  // 円盤(半径4)が横幅に収まる距離
  const halfW = 4.6;
  const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
  const dist = Math.max(10.5, halfW / (tanHalf * aspect));
  const elev = portrait ? 0.5 : 0.42;
  camera.position.set(0, LOOK.y + dist * Math.sin(elev), dist * Math.cos(elev));
  camera.lookAt(LOOK);
  camera.updateProjectionMatrix();
  diorama.layoutMoon(camera, portrait);
}
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 150));
layout();

new Gesture(renderer.domElement, camera, diorama, synth);
(window as unknown as { __diorama: Diorama; __camera: THREE.Camera }).__diorama = diorama;
(window as unknown as { __camera: THREE.Camera }).__camera = camera;

let last = performance.now();
renderer.setAnimationLoop((now: number) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  diorama.update(dt, now / 1000, camera);
  renderer.render(scene, camera);
});
