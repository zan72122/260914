import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

function metal(color, rough = 0.45, metalness = 0.85, emissive = 0x000000) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness, emissive });
}

export class Machines {
  constructor() {
    this.group = new THREE.Group();

    // ---- 作業台 ----
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9, 0.5, 48),
      new THREE.MeshStandardMaterial({ color: 0x1b2333, roughness: 0.95, metalness: 0.05, emissive: 0x070b14 })
    );
    table.position.y = -2.55;
    this.table = table;
    this.group.add(table);

    // ---- ドップ棒 ----
    this.dop = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 3.4, 16),
      new THREE.MeshStandardMaterial({ color: 0x9aa6ba, roughness: 0.35, metalness: 0.85, emissive: 0x101a2c }));
    rod.position.y = -1.95;
    const cupMat = new THREE.MeshStandardMaterial({
      color: 0x6f7c93, roughness: 0.3, metalness: 0.9, emissive: 0x1b3d6b, emissiveIntensity: 1
    });
    this.cupMat = cupMat;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.34, 0.52, 32, 1, true), cupMat);
    cup.position.y = -0.18;
    // 受け皿のふち: 石の底と同じ形に光る（誘い）
    this.rimMat = new THREE.MeshStandardMaterial({
      color: 0x9ec9ff, emissive: 0x2f6fd0, roughness: 0.25, metalness: 0.5
    });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.065, 12, 44), this.rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.08;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 24), cupMat);
    pad.position.y = -0.42;
    this.dop.add(rod, cup, rim, pad);
    this.dop.visible = false;
    this.group.add(this.dop);

    // ---- 研削盤（同じ機械が粗削り→細目→磨きへ変わる） ----
    this.rig = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.7, 0.9), metal(0x3c4760, 0.65, 0.5, 0x141c2c));
    body.position.set(0, -0.55, 0);
    this.wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.95, 0.34, 40),
      new THREE.MeshStandardMaterial({ color: 0x8b95a6, roughness: 0.85, metalness: 0.25, emissive: 0x2b3446 })
    );
    this.wheel.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.44, 16), metal(0xc2ccdd, 0.3, 0.95));
    hub.rotation.z = Math.PI / 2;
    this.rig.add(body, this.wheel, hub);
    this.rig.visible = false;
    this.group.add(this.rig);

    // ---- 磨き皿 ----
    this.pad = new THREE.Group();
    const padBody = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.18, 36),
      new THREE.MeshStandardMaterial({ color: 0xd8c8b4, roughness: 0.55, metalness: 0.05, emissive: 0x2a1d10 }));
    const padBase = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.9, 20), metal(0x2a3346, 0.7, 0.4));
    padBase.position.y = -0.55;
    this.padDisc = padBody;
    this.pad.add(padBody, padBase);
    this.pad.visible = false;
    this.group.add(this.pad);

    // ---- 台座（完成品） ----
    this.pedestal = new THREE.Group();
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 0.30, 32),
      new THREE.MeshStandardMaterial({ color: 0x1d2740, roughness: 0.5, metalness: 0.4, emissive: 0x0a1630 }));
    const pedRing = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.05, 10, 40),
      new THREE.MeshStandardMaterial({ color: 0x86b8ff, emissive: 0x2d6ad0, roughness: 0.3, metalness: 0.6 }));
    pedRing.rotation.x = Math.PI / 2;
    pedRing.position.y = 0.16;
    this.pedestal.add(ped, pedRing);
    this.pedestal.visible = false;
    this.group.add(this.pedestal);

    // ---- 棚（コレクション） ----
    this.shelf = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x223049, roughness: 0.8, metalness: 0.2, emissive: 0x08101f }));
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
  }

  /** ドップを石の底（-cAxis）に向けて構える */
  placeDop(stoneWorldPos, cAxisWorld, t, pulse) {
    const q = new THREE.Quaternion().setFromUnitVectors(UP, cAxisWorld);
    this.dop.quaternion.copy(q);
    const hidden = 2.7 * (1 - this.dopExtend);
    const shake = this.dopExtend > 0.02 && this.dopExtend < 0.999
      ? Math.sin(t * 22) * 0.018 * (1 - this.dopExtend) : 0;
    const d = 1.30 - 0.22 * this.dopExtend + hidden + shake;
    this.dop.position.copy(stoneWorldPos).addScaledVector(cAxisWorld, -d);
    this.dop.visible = this.dopExtend > 0.001;
    this.cupMat.emissiveIntensity = 0.4 + 2.6 * pulse;
    this.rimMat.emissiveIntensity = 0.5 + 3.4 * pulse;
  }

  update(dt, t) {
    this.wheel.rotation.y += dt * this.wheelSpin;
    this.padDisc.rotation.y += dt * this.wheelSpin * 0.45;
    this.rig.visible = this.rigExtend > 0.001;
    this.pad.visible = this.padExtend > 0.001;
    this.pedestal.visible = this.pedExtend > 0.001;
    this.rig.scale.setScalar(0.001 + this.rigExtend);
    this.pad.scale.setScalar(0.001 + this.padExtend);
    this.pedestal.scale.setScalar(0.001 + this.pedExtend);
  }
}
