import * as THREE from 'three';
import { toon, C, rounded, easeOutBack, easeOutElastic } from './materials.js';
import { tween } from '../tween.js';
import { setOpened, state } from '../state.js';
import { sfx } from '../audio/synth.js';

// 箱型モンスター「ハナ」。外側の箱、顔、ふた、頭の飾り。
export function createMonster() {
  const group = new THREE.Group();
  const H = 1; // 半サイズ
  const T = 0.1; // 壁の厚み

  const matBox = toon(C.cream);
  const matDark = toon(C.creamDark);

  // 底と4壁(内側が見えるように分割)
  const floor = new THREE.Mesh(rounded(2, T, 2, 0.03), matBox);
  floor.position.y = -H + T / 2;
  group.add(floor);
  const grassTop = new THREE.Mesh(new THREE.PlaneGeometry(2 - T * 2, 2 - T * 2), toon(C.grass));
  grassTop.rotation.x = -Math.PI / 2;
  grassTop.position.y = -H + T + 0.001;
  group.add(grassTop);

  const walls = [];
  const wallGeo = rounded(2, 2, T, 0.03);
  // 前面(顔)は下端で蝶番。開くと前に倒れて中が全部見える
  const frontPivot = new THREE.Group();
  frontPivot.position.set(0, -H, H);
  group.add(frontPivot);
  const frontWall = new THREE.Mesh(wallGeo, matBox);
  frontWall.position.set(0, H, -T / 2);
  frontPivot.add(frontWall);
  walls.push(frontWall);
  const wallDefs = [
    { pos: [0, 0, -H + T / 2], rot: 0 }, // 後ろ
    { pos: [-H + T / 2, 0, 0], rot: Math.PI / 2 }, // 左
    { pos: [H - T / 2, 0, 0], rot: Math.PI / 2 }, // 右
  ];
  for (const d of wallDefs) {
    const w = new THREE.Mesh(wallGeo, matBox);
    w.position.set(...d.pos);
    w.rotation.y = d.rot;
    group.add(w);
    walls.push(w);
  }

  // 顔。閉じているときは外側の顔、開いて前面が倒れると内側の顔が上を向いて見える
  const eyes = [];
  const pupils = [];
  const mouths = [];
  function makeFace() {
    const face = new THREE.Group();
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(sx * 0.32, 0.18, 0.02);
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), toon(C.white));
      white.scale.z = 0.5;
      eye.add(white);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 12), toon(C.eye));
      pupil.position.z = 0.045;
      eye.add(pupil);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), toon(C.white));
      glint.position.set(0.03, 0.035, 0.07);
      pupil.add(glint);
      face.add(eye);
      eyes.push(eye);
      pupils.push({ mesh: pupil, sx });
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), toon(C.cheek));
      cheek.position.set(sx * 0.55, -0.12, 0.01);
      cheek.scale.z = 0.3;
      face.add(cheek);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 10, 24, Math.PI), toon(C.eye));
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, -0.12, 0.02);
    face.add(mouth);
    mouths.push(mouth);
    return face;
  }
  const face = makeFace();
  face.position.set(0, H, 0);
  frontPivot.add(face);
  const innerFace = makeFace();
  innerFace.position.set(0, H, -T);
  innerFace.rotation.x = Math.PI; // 裏返し。倒れると上を向き、目が奥側になる
  frontPivot.add(innerFace);

  // ふた(後端で蝶番)
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, H, -H);
  group.add(lidPivot);
  const lid = new THREE.Mesh(rounded(2.08, T * 1.2, 2.08, 0.04), matDark);
  lid.position.set(0, T * 0.6, H);
  lidPivot.add(lid);

  // 取っ手(丸い持ち手): 明確なアフォーダンス
  const handle = new THREE.Group();
  handle.position.set(0, T * 1.2, H + 0.55);
  lidPivot.add(handle);
  const knobWrap = new THREE.Group(); // ヒントの脈動専用
  knobWrap.position.y = 0.2;
  handle.add(knobWrap);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), toon(C.handle));
  knobWrap.add(knob);
  const knobStem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.2, 10), toon(C.handle));
  knobStem.position.y = 0.1;
  handle.add(knobStem);

  // 頭の飾り: 蕾。完成すると花になる
  const topBud = new THREE.Group();
  topBud.position.set(0.55, T * 1.2, -0.4);
  lidPivot.add(topBud);
  const budStem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.28, 8), toon(C.stem));
  budStem.position.y = 0.14;
  topBud.add(budStem);
  const bud = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), toon(C.leafDark));
  bud.position.y = 0.32;
  bud.scale.y = 1.3;
  topBud.add(bud);
  const topFlower = new THREE.Group();
  topFlower.position.y = 0.32;
  topFlower.scale.setScalar(0.001);
  topBud.add(topFlower);
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), toon(C.flowers[0]));
    const a = (i / 5) * Math.PI * 2;
    p.position.set(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1);
    p.scale.set(1, 0.5, 1);
    topFlower.add(p);
  }
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), toon(C.flowerCenter));
  topFlower.add(center);

  // ---- 挙動 ----
  let lidAngle = 0; // 0 閉 / 負で開く(後ろへ倒れる)
  const OPEN_ANGLE = -Math.PI * 0.62;
  let dragPull = 0;
  let happy = 0; // 0..1 目の細め
  let blink = 0;
  let blinkTimer = 2 + Math.random() * 3;
  const lookTarget = new THREE.Vector2(0, 0);
  const lookCurrent = new THREE.Vector2(0, 0);
  let wobble = 0;

  function applyLid() {
    lidPivot.rotation.x = lidAngle - dragPull;
  }

  function open() {
    if (state.opened) return;
    setOpened();
    sfx.open();
    tween({
      duration: 0.9,
      ease: easeOutBack,
      onUpdate: (e) => {
        dragPull = 0;
        lidAngle = OPEN_ANGLE * e;
        applyLid();
      },
    });
    // 前面が前へ倒れる(顔は上を向いてプレイヤーを見る)
    tween({
      duration: 1.0,
      delay: 0.35,
      ease: easeOutBack,
      onUpdate: (e) => { frontPivot.rotation.x = (Math.PI / 2) * 0.96 * e; },
      onComplete: () => sfx.boop(),
    });
    setHappy(1, 0.4);
    tween({ duration: 1.2, onComplete: () => setHappy(0.25, 1.0), delay: 1.0 });
  }

  function setHappy(v, dur = 0.3) {
    const from = happy;
    tween({ duration: dur, onUpdate: (e) => (happy = from + (v - from) * e) });
  }

  // 取っ手: 上へ引くと開く(途中までは指に追従し、離すと戻る/開く)
  knob.userData.interactable = {
    id: 'lid',
    onDragStart: () => {
      sfx.tap();
    },
    onDrag: ({ dy }) => {
      if (state.opened) return;
      // 画面上方向へのドラッグ量(px)を引き量へ
      dragPull = THREE.MathUtils.clamp(-dy / 220, 0, 0.45);
      applyLid();
      if (dragPull >= 0.4) open();
    },
    onDragEnd: () => {
      if (state.opened) return;
      const from = dragPull;
      tween({ duration: 0.35, ease: easeOutElastic, onUpdate: (e) => { dragPull = from * (1 - e); applyLid(); } });
    },
    onTap: () => {
      if (state.opened) { rattle(); return; }
      // タップだけでも少し開いて「引ける」ことを見せる
      sfx.tap();
      const peak = 0.18;
      tween({ duration: 0.5, ease: easeOutElastic, onUpdate: (e) => { dragPull = peak * (1 - e); applyLid(); } });
    },
    getPulseNode: () => knobWrap,
    worldAnchor: () => knob.getWorldPosition(new THREE.Vector3()),
  };

  function rattle() {
    sfx.rattle();
    const base = lidAngle;
    tween({
      duration: 0.6,
      onUpdate: (e) => {
        dragPull = -Math.sin(e * Math.PI * 6) * 0.06 * (1 - e);
        applyLid();
      },
      onComplete: () => { dragPull = 0; lidAngle = base; applyLid(); },
    });
  }

  // 顔をタップ: 喜ぶ
  for (const w of walls) {
    w.userData.interactable = {
      id: 'box',
      onTap: () => {
        sfx.boop();
        setHappy(1, 0.2);
        tween({ duration: 0.8, delay: 0.6, onComplete: () => setHappy(state.complete ? 0.6 : 0.2, 0.6) });
        wobble = 1;
      },
    };
  }
  floor.userData.interactable = walls[0].userData.interactable;
  grassTop.userData.interactable = walls[0].userData.interactable;

  function bloomTop() {
    tween({ duration: 0.3, onUpdate: (e) => bud.scale.setScalar(1 - e), onComplete: () => (bud.visible = false) });
    tween({ duration: 1.0, ease: easeOutElastic, delay: 0.25, onUpdate: (e) => topFlower.scale.setScalar(Math.max(0.001, e)) });
  }

  function celebrate() {
    setHappy(1, 0.5);
    bloomTop();
    tween({ duration: 3, delay: 2.5, onComplete: () => setHappy(0.6, 1.5) });
  }

  function update(dt, t, pointerNdc) {
    // 目が指を追う
    if (pointerNdc) lookTarget.set(pointerNdc.x, pointerNdc.y);
    lookCurrent.lerp(lookTarget, 1 - Math.pow(0.001, dt));
    for (const p of pupils) {
      p.mesh.position.x = lookCurrent.x * 0.07;
      p.mesh.position.y = lookCurrent.y * 0.05;
    }
    // まばたき
    blinkTimer -= dt;
    if (blinkTimer < 0) { blink = 1; blinkTimer = 2.5 + Math.random() * 3; }
    blink = Math.max(0, blink - dt * 8);
    const squint = Math.max(happy * 0.55, blink > 0.5 ? 1 - (1 - blink) * 2 : blink * 2);
    for (const e of eyes) e.scale.y = 1 - squint * 0.85;
    for (const m of mouths) m.scale.set(1 + happy * 0.4, 1 + happy * 0.6, 1);
    // 呼吸とゆらぎ
    const breathe = 1 + Math.sin(t * 1.6) * 0.012;
    wobble = Math.max(0, wobble - dt * 1.5);
    const wob = Math.sin(t * 22) * wobble * 0.05;
    group.scale.set(breathe + wob, breathe - wob, breathe + wob);
    group.position.y = Math.sin(t * 1.1) * 0.03;
  }

  return { group, face, lidPivot, knob, handle, update, open, rattle, celebrate, setHappy, setLook: (x, y) => lookTarget.set(x, y) };
}
