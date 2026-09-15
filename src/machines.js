import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const WHEEL_R = 0.95;
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();

function metal(color, rough = 0.45, metalness = 0.85, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness, emissive });
}

/** 軸が +z を向いた円盤（画面に対して正面を向く砥石／磨き皿） */
function discGeo(r, thick, seg = 44) {
  const g = new THREE.CylinderGeometry(r, r, thick, seg);
  g.rotateX(Math.PI / 2);
  return g;
}

export class Machines {
  constructor() {
    this.group = new THREE.Group();

    // ---- 作業台 ----
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9, 0.5, 48),
      new THREE.MeshStandardMaterial({ color: 0x27334a, roughness: 0.92, metalness: 0.08, emissive: 0x0c1322 })
    );
    table.position.y = -2.55;
    this.table = table;
    this.group.add(table);

    // ---- 作業台のスポットライト（放射状グラデーションのメッシュ） ----
    const spot = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 13),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
        uniforms: { uColor: { value: new THREE.Color(0x7fa8e8) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `precision mediump float; uniform vec3 uColor; varying vec2 vUv;
          void main(){
            float r = length(vUv - 0.5) * 2.0;
            float a = pow(max(0.0, 1.0 - r), 2.6);
            gl_FragColor = vec4(uColor, a * 0.34);
          }`
      })
    );
    spot.rotation.x = -Math.PI / 2;
    spot.position.y = -2.29;
    spot.renderOrder = -5;
    this.spot = spot;
    this.group.add(spot);

    // ---- ドップ棒 ----
    // 受け皿は石の底（-cAxis）に合わせ、棒は画面の下（縦）／右（横）から伸びてくる。
    // 受け皿と棒を別々に置くので、棒が石の裏に隠れず「どこから来ているか」が必ず見える。
    this.dop = new THREE.Group();
    this.dopCup = new THREE.Group();
    const cupMat = new THREE.MeshStandardMaterial({
      color: 0x93a2bd, roughness: 0.22, metalness: 0.95, emissive: 0x1b3d6b, emissiveIntensity: 1
    });
    this.cupMat = cupMat;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.99, 0.62, 0.30, 36), cupMat);
    cup.position.y = -0.17;                       // 石の平らな底に合う浅い皿
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.40, 0.55, 20), cupMat);
    stem.position.y = -0.58;
    this.rimMat = new THREE.MeshStandardMaterial({
      color: 0xcfe7ff, emissive: 0x4a90f0, roughness: 0.2, metalness: 0.5
    });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.99, 0.082, 14, 48), this.rimMat);
    rim.rotation.x = Math.PI / 2;
    this.dopCup.add(cup, stem, rim);

    // 棒（画面端から伸びる金属の柄）: 原点から +y 方向に長さ 1、scale.y で伸ばす
    this.dopRod = new THREE.Group();
    this.rodMat = new THREE.MeshStandardMaterial({
      color: 0xcbd8ec, roughness: 0.26, metalness: 0.82, emissive: 0x24334f
    });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 1, 20), this.rodMat);
    rod.position.y = 0.5;
    this.dopRod.add(rod);
    this.dop.add(this.dopCup, this.dopRod);
    this.dop.visible = false;
    this.group.add(this.dop);

    // ---- 研削盤（回転する砥石。縁に溝、回転が分かる印） ----
    this.rig = new THREE.Group();
    this.wheel = new THREE.Mesh(discGeo(WHEEL_R, 0.40), new THREE.MeshStandardMaterial({
      color: 0x8e99ac, roughness: 0.82, metalness: 0.30, emissive: 0x232b3b
    }));
    const grooveMat = new THREE.MeshStandardMaterial({
      color: 0x5b667e, roughness: 0.95, metalness: 0.1, emissive: 0x1a2231
    });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const gm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.46), grooveMat);
      gm.position.set(Math.cos(a) * 0.93, Math.sin(a) * 0.93, 0);
      gm.rotation.z = a;
      this.wheel.add(gm);
    }
    // 回転が一目で分かる印（前面のオレンジの目印）
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.14, 0.07),
      new THREE.MeshStandardMaterial({ color: 0xffbf80, emissive: 0xd0651a, roughness: 0.4, metalness: 0.3 }));
    mark.position.set(0.42, 0, 0.21);
    this.wheel.add(mark);
    const hub = new THREE.Mesh(discGeo(0.20, 0.56, 18), metal(0xd6e0f0, 0.25, 0.98));
    this.rigArm = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.48, 0.44), metal(0x46536e, 0.6, 0.6, 0x1a2338));
    this.rig.add(this.wheel, hub, this.rigArm);
    this.rig.visible = false;
    this.group.add(this.rig);

    // ---- 磨き皿（フェルト風の円盤。砥石と同じ「接触する位置」に立つ） ----
    this.pad = new THREE.Group();
    this.padDisc = new THREE.Mesh(discGeo(WHEEL_R, 0.36, 40), new THREE.MeshStandardMaterial({
      color: 0xbfae95, roughness: 1.0, metalness: 0.0, emissive: 0x1d160e
    }));
    const feltMat = new THREE.MeshStandardMaterial({ color: 0xa8997f, roughness: 1.0, metalness: 0.0 });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.13, 0.42), feltMat);
      fl.position.set(Math.cos(a) * 0.91, Math.sin(a) * 0.91, 0);
      fl.rotation.z = a;
      this.padDisc.add(fl);
    }
    const padHub = new THREE.Mesh(discGeo(0.19, 0.48, 16), metal(0xd6e0f0, 0.3, 0.9));
    this.padArm = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.48, 0.44), metal(0x46536e, 0.6, 0.6, 0x1a2338));
    this.pad.add(this.padDisc, padHub, this.padArm);
    this.pad.visible = false;
    this.group.add(this.pad);

    // ---- 台座（完成品） ----
    this.pedestal = new THREE.Group();
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 0.30, 32),
      new THREE.MeshStandardMaterial({ color: 0x24314e, roughness: 0.5, metalness: 0.4, emissive: 0x0e1c3c }));
    const pedRing = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.05, 10, 40),
      new THREE.MeshStandardMaterial({ color: 0x9cc6ff, emissive: 0x3a79dc, roughness: 0.3, metalness: 0.6 }));
    pedRing.rotation.x = Math.PI / 2;
    pedRing.position.y = 0.16;
    this.pedestal.add(ped, pedRing);
    this.pedestal.visible = false;
    this.group.add(this.pedestal);

    // ---- 棚（コレクション） ----
    this.shelf = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x2a3a57, roughness: 0.8, metalness: 0.2, emissive: 0x0c1526 }));
    this.shelf.add(board);
    this.shelfBoard = board;
    this.shelfItems = new THREE.Group();
    this.shelf.add(this.shelfItems);
    this.shelf.visible = false;
    this.group.add(this.shelf);

    // ---- 次の原石（画面端から転がってくる） ----
    const ng = new THREE.IcosahedronGeometry(0.42, 2);
    const np = ng.attributes.position;
    for (let i = 0; i < np.count; i++) {
      const s = 0.86 + 0.28 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1);
      np.setXYZ(i, np.getX(i) * s, np.getY(i) * s, np.getZ(i) * s);
    }
    ng.computeVertexNormals();
    this.nextStone = new THREE.Mesh(ng, new THREE.MeshStandardMaterial({
      color: 0x33538f, roughness: 0.85, metalness: 0.15, emissive: 0x0d1c3e
    }));
    this.nextStone.visible = false;
    this.group.add(this.nextStone);

    this.dopExtend = 0;      // 0 = 隠れている / 1 = 石を咥えている
    this.rigExtend = 0;
    this.padExtend = 0;
    this.pedExtend = 0;
    this.wheelSpin = 0;
    this.motor = 0;
    this.fromDir = DOWN.clone();      // ドップが来る方向（縦 = 下 / 横 = 右）
    this.rigFrom = DOWN.clone();      // 砥石／磨き皿が石に触れる方向（受け皿と重ならないよう少しずらす）
    this.contact = new THREE.Vector3();
  }

  /**
   * ドップを石の底（-cAxis）に向けて構える。
   * 受け皿 = 石の底、棒 = 画面の下（縦）／右（横）から受け皿へ。
   */
  placeDop(stoneWorldPos, cAxisWorld, t, pulse, stoneR) {
    const hidden = 2.7 * (1 - this.dopExtend);
    const shake = this.dopExtend > 0.02 && this.dopExtend < 0.999
      ? Math.sin(t * 22) * 0.024 * (1 - this.dopExtend) : 0;
    const d = (stoneR || 1.2) * 0.80 + 0.34 - 0.18 * this.dopExtend + hidden + shake;
    const from = _v2.copy(this.fromDir).normalize();
    // 石の底（-cAxis）へ向けつつ、画面の下（縦）／右（横）寄りに構える。
    // こうすると受け皿と棒が石の裏に隠れず、「どこから来ているか」が必ず見える。
    const hold = _v5.copy(cAxisWorld).multiplyScalar(-1).addScaledVector(from, 0.55).normalize();
    const cup = _v1.copy(stoneWorldPos).addScaledVector(hold, d);
    this.dopCup.position.copy(cup);
    this.dopCup.quaternion.setFromUnitVectors(UP, _v6.copy(hold).multiplyScalar(-1));
    const anchor = _v3.copy(cup).addScaledVector(from, 6.0);
    const toCup = _v4.copy(cup).sub(anchor);
    const len = toCup.length() || 1;
    toCup.multiplyScalar(1 / len);
    this.dopRod.position.copy(anchor);
    this.dopRod.quaternion.setFromUnitVectors(UP, toCup);
    this.dopRod.scale.set(1, len, 1);

    this.dop.visible = this.dopExtend > 0.02;
    this.dopRod.visible = this.dopExtend > 0.06;
    const e = this.dopExtend;
    this.cupMat.emissiveIntensity = (0.22 + 3.0 * pulse) * e;
    this.rimMat.emissiveIntensity = (0.28 + 4.0 * pulse) * e;
  }

  /**
   * 砥石／磨き皿を石に「接触する位置」に置き、接触点（火花の発生源）を更新する。
   * 円盤は画面正面を向いたまま、縁が石に触れる。
   */
  placeRig(stoneWorldPos, stoneR) {
    const d = _v1.copy(this.rigFrom).normalize();
    const c = _v2.copy(stoneWorldPos).addScaledVector(d, stoneR + WHEEL_R * 0.88);
    this.rig.position.copy(c);
    this.pad.position.copy(c);
    const armOff = 1.05;
    this.rigArm.position.set(d.x * armOff, d.y * armOff, -0.15);
    this.padArm.position.copy(this.rigArm.position);
    this.contact.copy(stoneWorldPos).addScaledVector(d, stoneR * 0.97);
    return this.contact;
  }

  update(dt, t) {
    this.wheel.rotation.z -= dt * this.wheelSpin;
    this.padDisc.rotation.z -= dt * this.wheelSpin * 0.45;
    this.rig.visible = this.rigExtend > 0.001;
    this.pad.visible = this.padExtend > 0.001;
    this.pedestal.visible = this.pedExtend > 0.001;
    this.rig.scale.setScalar(0.001 + this.rigExtend);
    this.pad.scale.setScalar(0.001 + this.padExtend);
    this.pedestal.scale.setScalar(0.001 + this.pedExtend);
  }
}
