import * as THREE from 'three';
import { PALETTE } from './scene.js';

// とんがり帽子の小さな女の子
export function createCharacter(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const body = new THREE.Group();
  group.add(body);

  const dress = new THREE.Mesh(
    new THREE.ConeGeometry(0.27, 0.55, 24),
    new THREE.MeshLambertMaterial({ color: PALETTE.girlDress })
  );
  dress.position.y = 0.275;
  dress.castShadow = true;
  body.add(dress);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 20, 16),
    new THREE.MeshLambertMaterial({ color: PALETTE.girlSkin })
  );
  head.position.y = 0.66;
  head.castShadow = true;
  body.add(head);

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.165, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })
  );
  hair.position.y = 0.68;
  body.add(hair);

  const hat = new THREE.Mesh(
    new THREE.ConeGeometry(0.19, 0.5, 24),
    new THREE.MeshLambertMaterial({ color: PALETTE.girlHat })
  );
  hat.position.y = 0.66 + 0.12 + 0.25;
  hat.castShadow = true;
  body.add(hat);

  // 目(進行方向が分かるように、前を向いている印)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x4a3b45 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), eyeMat);
    eye.position.set(sx * 0.06, 0.67, 0.145);
    body.add(eye);
  }

  return {
    group,
    body,
    facing: 0, // rad, y 軸まわり
    walkT: 0,
    walking: false,
    hidden: false,
  };
}

// 位置と向きを更新。pos: THREE.Vector3(足元)。
export function placeCharacter(c, pos) {
  c.group.position.copy(pos);
}

export function faceToward(c, dx, dz) {
  if (Math.abs(dx) + Math.abs(dz) < 1e-6) return;
  c.targetFacing = Math.atan2(dx, dz);
}

export function updateCharacter(c, dt, time) {
  if (c.targetFacing !== undefined) {
    let d = c.targetFacing - c.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    c.facing += d * Math.min(1, dt * 10);
  }
  c.group.rotation.y = c.facing;

  if (c.walking) {
    c.walkT += dt * 14;
    c.body.position.y = Math.abs(Math.sin(c.walkT)) * 0.06;
    c.body.rotation.z = Math.sin(c.walkT) * 0.06;
  } else {
    c.body.position.y += (Math.sin(time * 1.6) * 0.012 - c.body.position.y) * Math.min(1, dt * 5);
    c.body.rotation.z += (0 - c.body.rotation.z) * Math.min(1, dt * 8);
  }
}
