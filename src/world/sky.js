import * as THREE from 'three';
import { toon, C, easeOutBack, easeOutElastic, easeInOut } from './materials.js';
import { tween } from '../tween.js';
import { state, setSunny, setDaytime } from '../state.js';
import { sfx } from '../audio/synth.js';

// 面B: 空。雲に隠れた太陽。雲から垂れた紐を引くと雲がどく。
// おもちゃ箱モードでは 昼→夕焼け→夜→昼 と切り替わる。
export function createSky(particles, onDaytime) {
  const group = new THREE.Group();
  const FLOOR = -0.9;

  const wall = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), toon(C.skyWall));
  wall.position.set(0, 0, -0.89);
  group.add(wall);

  // 太陽
  const sun = new THREE.Group();
  sun.position.set(0, 0.3, -0.82);
  group.add(sun);
  const sunDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 32), toon(C.sun));
  sunDisc.rotation.x = Math.PI / 2;
  sun.add(sunDisc);
  const rays = new THREE.Group();
  sun.add(rays);
  for (let i = 0; i < 10; i++) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.04), toon(C.sunRay));
    const a = (i / 10) * Math.PI * 2;
    r.position.set(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0);
    r.rotation.z = a + Math.PI / 2;
    rays.add(r);
  }
  // 太陽の顔(にこにこ)
  const sunFace = new THREE.Group();
  sunFace.position.z = 0.035;
  sun.add(sunFace);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), toon(C.eye));
    e.position.set(sx * 0.09, 0.05, 0);
    sunFace.add(e);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 16, Math.PI), toon(C.eye));
  smile.rotation.z = Math.PI;
  smile.position.y = -0.03;
  sunFace.add(smile);

  // 月(夜用)
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), toon(C.moon));
  moon.position.set(0, 0.3, -0.8);
  moon.scale.setScalar(0.001);
  group.add(moon);
  const stars = new THREE.Group();
  group.add(stars);
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.03), toon(0xfff9c4));
    s.position.set((Math.random() - 0.5) * 1.6, -0.3 + Math.random() * 1.1, -0.85);
    s.scale.setScalar(0.001);
    s.userData.tw = Math.random() * 10;
    stars.add(s);
  }

  // 雲(球の集まり)
  const cloud = new THREE.Group();
  const CLOUD_HOME = new THREE.Vector3(0, 0.3, -0.7);
  cloud.position.copy(CLOUD_HOME);
  cloud.scale.setScalar(0.72);
  group.add(cloud);
  const cm = toon(C.cloud);
  [[0, 0, 0.32], [-0.3, -0.05, 0.24], [0.3, -0.05, 0.24], [-0.15, 0.15, 0.22], [0.15, 0.17, 0.22], [0.45, -0.1, 0.16], [-0.45, -0.1, 0.16]].forEach(([x, y, r]) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), cm);
    s.position.set(x, y, 0);
    cloud.add(s);
  });
  // 雲の顔(眠そう)
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 12, Math.PI), toon(C.eye));
    e.position.set(sx * 0.1, 0.0, 0.31);
    e.rotation.z = Math.PI;
    cloud.add(e);
  }

  // 紐 + 玉(引ける)
  const stringGroup = new THREE.Group();
  stringGroup.position.set(0, -0.32, 0.1);
  cloud.add(stringGroup);
  const STRING_LEN = 0.45;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), toon(C.string));
  string.position.y = -STRING_LEN / 2;
  string.scale.y = STRING_LEN;
  stringGroup.add(string);
  const beadWrap = new THREE.Group(); // ヒントの脈動専用
  beadWrap.position.y = -STRING_LEN;
  stringGroup.add(beadWrap);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), toon(C.bead));
  beadWrap.add(bead);

  let pull = 0; // 0..1
  let busy = false;
  let cloudOffset = 0; // 雲の横ずれ 0..1
  let swing = 0;

  function applyPull() {
    const len = STRING_LEN + pull * 0.35;
    string.scale.y = len;
    string.position.y = -len / 2;
    beadWrap.position.y = -len;
    cloud.position.x = CLOUD_HOME.x + (cloudOffset + pull * 0.35) * 1.25;
    cloud.position.y = CLOUD_HOME.y - pull * 0.08;
  }

  function commit() {
    if (busy) return;
    busy = true;
    if (!state.sunny) {
      setSunny();
      sfx.sunrise();
      // 雲が横へどく
      const from = cloudOffset, fromPull = pull;
      tween({ duration: 1.1, ease: easeInOut, onUpdate: (e) => { cloudOffset = from + (1 - from) * e; pull = fromPull * (1 - e); applyPull(); }, onComplete: () => (busy = false) });
      tween({ duration: 1.4, ease: easeOutBack, delay: 0.3, onUpdate: (e) => { sun.scale.setScalar(1 + 0.25 * e); } });
      particles.puff(sun.getWorldPosition(new THREE.Vector3()), 'spark', 16, 1.2);
      onDaytime('day', true);
    } else {
      // おもちゃ箱: 昼→夕焼け→夜→昼
      const next = state.daytime === 'day' ? 'sunset' : state.daytime === 'sunset' ? 'night' : 'day';
      const fromPull = pull;
      tween({ duration: 0.6, ease: easeOutElastic, onUpdate: (e) => { pull = fromPull * (1 - e); applyPull(); }, onComplete: () => (busy = false) });
      setDaytime(next);
      if (next === 'night') {
        sfx.night();
        tween({ duration: 0.6, onUpdate: (e) => sun.scale.setScalar(Math.max(0.001, 1.25 * (1 - e))) });
        tween({ duration: 1.0, ease: easeOutBack, delay: 0.4, onUpdate: (e) => moon.scale.setScalar(Math.max(0.001, e)) });
        stars.children.forEach((s, i) => tween({ duration: 0.6, ease: easeOutBack, delay: 0.5 + i * 0.06, onUpdate: (e) => s.scale.setScalar(Math.max(0.001, e)) }));
      } else if (next === 'day') {
        sfx.sunrise();
        tween({ duration: 0.5, onUpdate: (e) => moon.scale.setScalar(Math.max(0.001, 1 - e)) });
        stars.children.forEach((s, i) => tween({ duration: 0.4, delay: i * 0.03, onUpdate: (e) => s.scale.setScalar(Math.max(0.001, 1 - e)) }));
        tween({ duration: 1.0, ease: easeOutBack, delay: 0.4, onUpdate: (e) => sun.scale.setScalar(Math.max(0.001, 1.25 * e)) });
      } else {
        sfx.chime();
      }
      onDaytime(next, false);
    }
  }

  const inter = {
    id: 'string',
    onDragStart: () => sfx.tap(),
    onDrag: ({ dy }) => {
      if (busy) return;
      const p = THREE.MathUtils.clamp(dy / 160, 0, 1);
      if (Math.floor(p * 6) !== Math.floor(pull * 6)) sfx.pull(p);
      pull = p;
      applyPull();
      if (pull >= 0.95) commit();
    },
    onDragEnd: () => {
      if (busy) return;
      const fromPull = pull;
      tween({ duration: 0.6, ease: easeOutElastic, onUpdate: (e) => { pull = fromPull * (1 - e); applyPull(); } });
    },
    onTap: () => {
      sfx.tap();
      swing = 1;
      const fromPull = pull;
      tween({ duration: 0.6, ease: easeOutElastic, onUpdate: (e) => { pull = fromPull + 0.15 * (1 - e); applyPull(); } });
    },
    getPulseNode: () => beadWrap,
    worldAnchor: () => bead.getWorldPosition(new THREE.Vector3()),
  };
  bead.userData.interactable = inter;
  string.userData.interactable = inter;
  cloud.children.forEach((c) => { if (!c.userData.interactable) c.userData.interactable = { id: 'cloud', onTap: () => { sfx.boop(); swing = 1; } }; });
  sun.traverse((m) => (m.userData.interactable = { id: 'sun', onTap: () => { sfx.chime(); tween({ duration: 0.6, ease: easeOutElastic, onUpdate: (e) => sun.scale.setScalar(1.25 + 0.2 * (1 - e)) }); particles.puff(sun.getWorldPosition(new THREE.Vector3()), 'spark', 8, 0.8); } }));
  moon.userData.interactable = { id: 'moon', onTap: () => { sfx.night(); tween({ duration: 0.6, ease: easeOutElastic, onUpdate: (e) => moon.scale.setScalar(1 + 0.2 * (1 - e)) }); } };
  wall.userData.interactable = { id: 'wall', onTap: () => sfx.boop() };

  function update(dt, t) {
    swing = Math.max(0, swing - dt * 0.8);
    stringGroup.rotation.z = Math.sin(t * 6) * swing * 0.25 + Math.sin(t * 1.2) * 0.02;
    cloud.position.y = CLOUD_HOME.y - pull * 0.08 + Math.sin(t * 0.9) * 0.02;
    rays.rotation.z = t * 0.15;
    for (const s of stars.children) {
      const k = 0.7 + 0.3 * Math.sin(t * 3 + s.userData.tw);
      if (s.scale.x > 0.5) s.scale.setScalar(k);
    }
  }

  return { group, sun, update };
}
