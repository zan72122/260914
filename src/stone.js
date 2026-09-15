import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng, Noise3 } from './rng.js';
import { createStoneMaterial, createGhostMaterial } from './stoneMaterial.js';

// icosphere detail: 10*n^2+2 頂点 (n = detail+1) → detail 19 で 4002 頂点 / 8000 三角形
const DETAIL = 19;

const BLUES = [
  // [外側の青, 内側の濃い青]
  [0x4f7fd6, 0x0b1c4d],
  [0x3f6fd0, 0x0a1740],
  [0x5c8ee0, 0x122a63],
  [0x4472c4, 0x0d1c46],
  [0x6a9ae8, 0x17306e]
];

export class Stone {
  constructor() {
    // --- ジオメトリは一度だけ作り、二度と作り直さない ---
    let geo = new THREE.IcosahedronGeometry(1, DETAIL);
    geo.deleteAttribute('uv');
    geo.deleteAttribute('normal');
    geo = mergeVertices(geo, 1e-5);
    geo.computeVertexNormals();

    this.geometry = geo;
    const N = geo.attributes.position.count;
    this.count = N;

    // 基準方向（単位球上）
    this.dir = new Float32Array(N * 3);
    const pos = geo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const l = Math.hypot(x, y, z) || 1;
      this.dir[i * 3] = x / l; this.dir[i * 3 + 1] = y / l; this.dir[i * 3 + 2] = z / l;
    }

    this.aRough = new Float32Array(N * 3);
    this.aCab = new Float32Array(N * 3);
    this.aWin = new Float32Array(N * 3);
    this.nRough = new Float32Array(N * 3);
    this.nCab = new Float32Array(N * 3);
    this.nWin = new Float32Array(N * 3);
    this.aMask = new Float32Array(N * 3); // x=grind y=polish z=window
    this.aProt = new Float32Array(N);

    geo.setAttribute('aRough', new THREE.BufferAttribute(this.aRough, 3));
    geo.setAttribute('aCab', new THREE.BufferAttribute(this.aCab, 3));
    geo.setAttribute('aWin', new THREE.BufferAttribute(this.aWin, 3));
    geo.setAttribute('nRough', new THREE.BufferAttribute(this.nRough, 3));
    geo.setAttribute('nCab', new THREE.BufferAttribute(this.nCab, 3));
    geo.setAttribute('nWin', new THREE.BufferAttribute(this.nWin, 3));
    geo.setAttribute('aMask', new THREE.BufferAttribute(this.aMask, 3));
    geo.setAttribute('aProt', new THREE.BufferAttribute(this.aProt, 1));

    this.material = createStoneMaterial();
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;

    // ゴースト輪郭（目標のカボション形）— 別オブジェクトだが同じ aCab を参照
    this.ghostMaterial = createGhostMaterial();
    this.ghost = new THREE.Mesh(geo, this.ghostMaterial);
    this.ghost.frustumCulled = false;
    this.ghost.renderOrder = 3;
    this.ghost.visible = false;

    this.pivot = new THREE.Group();   // orientation + spin
    this.pivot.add(this.mesh);
    this.pivot.add(this.ghost);
    this.group = new THREE.Group();   // layout（画面構図）用
    this.group.add(this.pivot);

    this.orientation = new THREE.Quaternion();
    this.spin = 0;
    this.spinSpeed = 0;
    this.cAxis = new THREE.Vector3(0, 1, 0);
    this.hintDir = new THREE.Vector3(1, 0, 0);
    this.stage = 0;
    this.seed = 1;
    // その工程で削れる上限（Stage2 = 出っ張りを落とすだけ / Stage3 以降 = 全周を丸める）
    this.grindCap = 1.0;
    this._finBase = null;
    this.params = {};
    this._effQ = new THREE.Quaternion();
    this._invQ = new THREE.Quaternion();
    this._spinQ = new THREE.Quaternion();
    this._statsCache = null;

    this.reseed((Math.random() * 0xffffffff) >>> 0);
  }

  // ------------------------------------------------------------------
  reseed(seed) {
    this.seed = seed >>> 0;
    const rng = new Rng(this.seed);
    const noise = new Noise3(this.seed);

    const [b, d] = BLUES[rng.i(0, BLUES.length - 1)];
    const cA = new THREE.Vector3(...rng.unitVec()).normalize();

    this.params = {
      baseColor: new THREE.Color(b),
      depthColor: new THREE.Color(d),
      silkDensity: rng.f(0.55, 1.0),
      starRays: rng.f(0, 1) < 0.12 ? 12 : 6,
      starSharpness: rng.f(14, 42),
      roughShape: rng.f(0.85, 1.12),
      cAxis: cA.clone()
    };
    this.cAxis.copy(cA);

    // 大きな出っ張り（3〜5個）
    const lumps = [];
    const nl = rng.i(3, 5);
    for (let i = 0; i < nl; i++) {
      lumps.push({
        d: new THREE.Vector3(...rng.unitVec()).normalize(),
        a: rng.f(0.18, 0.38),
        k: rng.f(2.2, 5.0)
      });
    }
    // 「薄皮」ヒント（窓を開けたくなる場所）: 出っ張りから離れた所
    let hint = new THREE.Vector3(...rng.unitVec()).normalize();
    for (let tries = 0; tries < 24; tries++) {
      const h = new THREE.Vector3(...rng.unitVec()).normalize();
      if (h.dot(cA) > -0.35 && lumps.every((L) => h.dot(L.d) < 0.55)) { hint = h; break; }
    }
    this.hintDir.copy(hint);

    const off = rng.f(0, 100);
    const N = this.count;
    const n = new THREE.Vector3();

    for (let i = 0; i < N; i++) {
      n.set(this.dir[i * 3], this.dir[i * 3 + 1], this.dir[i * 3 + 2]);

      const cabR = this._cabRadius(n, cA);

      // 原石の半径
      let f = 0.15 * noise.fbm(n.x * 1.9 + off, n.y * 1.9 + off, n.z * 1.9 + off, 4);
      f += 0.045 * noise.fbm(n.x * 6.5 - off, n.y * 6.5 + off, n.z * 6.5 - off, 2);
      f += 0.115 * (noise.ridged(n.x * 3.4 - off, n.y * 3.4 + off, n.z * 3.4, 3) - 0.45);
      let lump = 0;
      for (const L of lumps) {
        const dd = Math.max(0, n.dot(L.d));
        lump += L.a * Math.pow(dd, L.k);
      }
      let roughR = (1.0 + f + lump) * this.params.roughShape;
      roughR = Math.max(roughR, cabR + 0.035);

      // 窓（なめらかな小平面）: 低周波成分だけの面
      const smoothR = (1.0 + 0.075 * noise.fbm(n.x * 1.1 + off, n.y * 1.1 + off, n.z * 1.1 + off, 2)) * this.params.roughShape;
      let winR = Math.min(smoothR, roughR - 0.015);
      winR = Math.max(winR, cabR + 0.02);

      this.aRough[i * 3] = n.x * roughR; this.aRough[i * 3 + 1] = n.y * roughR; this.aRough[i * 3 + 2] = n.z * roughR;
      this.aCab[i * 3] = n.x * cabR; this.aCab[i * 3 + 1] = n.y * cabR; this.aCab[i * 3 + 2] = n.z * cabR;
      this.aWin[i * 3] = n.x * winR; this.aWin[i * 3 + 1] = n.y * winR; this.aWin[i * 3 + 2] = n.z * winR;
      // ゴースト輪郭からはみ出た「こぶ」の量（あとで分位点で正規化する）
      this.aProt[i] = Math.max(0, roughR - smoothR);
      this.aMask[i * 3] = 0; this.aMask[i * 3 + 1] = 0; this.aMask[i * 3 + 2] = 0;
    }

    // 「ゴースト輪郭からはみ出た出っ張り」だけが光るように分位点で正規化
    {
      const sorted = Float32Array.from(this.aProt).sort();
      const lo = sorted[Math.floor(N * 0.62)];
      const hi = sorted[Math.floor(N * 0.985)];
      const span = Math.max(1e-3, hi - lo);
      for (let i = 0; i < N; i++) {
        const t = (this.aProt[i] - lo) / span;
        this.aProt[i] = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
      }
    }

    // 当たり判定用の外接半径
    let rmax = 0, cmax = 0;
    for (let i = 0; i < N; i++) {
      const rr = Math.hypot(this.aRough[i * 3], this.aRough[i * 3 + 1], this.aRough[i * 3 + 2]);
      const cc = Math.hypot(this.aCab[i * 3], this.aCab[i * 3 + 1], this.aCab[i * 3 + 2]);
      if (rr > rmax) rmax = rr;
      if (cc > cmax) cmax = cc;
    }
    this.roughMaxR = rmax;
    this.cabMaxR = cmax;

    this._computeNormals(this.aRough, this.nRough);
    this._computeNormals(this.aCab, this.nCab);
    this._computeNormals(this.aWin, this.nWin);

    for (const k of ['aRough', 'aCab', 'aWin', 'nRough', 'nCab', 'nWin', 'aMask', 'aProt']) {
      this.geometry.attributes[k].needsUpdate = true;
    }
    this.geometry.computeBoundingSphere();

    const u = this.material.uniforms;
    u.uBaseColor.value.copy(this.params.baseColor);
    u.uDepthColor.value.copy(this.params.depthColor);
    u.uSilkDensity.value = this.params.silkDensity;
    u.uRays.value = this.params.starRays;
    u.uSharpness.value = this.params.starSharpness;
    u.uCAxis.value.copy(cA);
    u.uHintDir.value.copy(hint);
    this.ghostMaterial.uniforms.uCAxis.value.copy(cA);

    this.orientation.identity();
    this.spin = 0;
    this.spinSpeed = 0;
    this._statsCache = null;
    this.applyOrientation();
  }

  // 原点からの ray が cabochon 表面に当たる距離
  _cabRadius(n, cA) {
    const yb = -0.24, a = 0.94, b = 0.88;
    const y = n.dot(cA);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    if (y < -1e-4) {
      const t = yb / y;
      if (t * r <= a) return t;         // 平らな底面
    }
    const A = (r * r) / (a * a) + (y * y) / (b * b);
    const B = (-2 * y * yb) / (b * b);
    const C = (yb * yb) / (b * b) - 1;
    const disc = Math.max(0, B * B - 4 * A * C);
    return (-B + Math.sqrt(disc)) / (2 * A);
  }

  _computeNormals(posArr, outArr) {
    const idx = this.geometry.index.array;
    outArr.fill(0);
    const ax = new THREE.Vector3(), bx = new THREE.Vector3(), cx = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3();
    for (let t = 0; t < idx.length; t += 3) {
      const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
      ax.fromArray(posArr, i0 * 3); bx.fromArray(posArr, i1 * 3); cx.fromArray(posArr, i2 * 3);
      e1.subVectors(bx, ax); e2.subVectors(cx, ax);
      nn.crossVectors(e1, e2);
      for (const i of [i0, i1, i2]) {
        outArr[i * 3] += nn.x; outArr[i * 3 + 1] += nn.y; outArr[i * 3 + 2] += nn.z;
      }
    }
    for (let i = 0; i < this.count; i++) {
      const x = outArr[i * 3], y = outArr[i * 3 + 1], z = outArr[i * 3 + 2];
      const l = Math.hypot(x, y, z) || 1;
      outArr[i * 3] = x / l; outArr[i * 3 + 1] = y / l; outArr[i * 3 + 2] = z / l;
    }
  }

  // ------------------------------------------------------------------
  applyOrientation() {
    this._spinQ.setFromAxisAngle(this.cAxis, this.spin);
    this._effQ.copy(this.orientation).multiply(this._spinQ);
    this.pivot.quaternion.copy(this._effQ);
    this._invQ.copy(this._effQ).invert();
  }

  worldCAxis(out) {
    return out.copy(this.cAxis).applyQuaternion(this.orientation);
  }

  // world 方向 → local 方向
  toLocalDir(v, out) {
    return out.copy(v).applyQuaternion(this._invQ).normalize();
  }

  /**
   * 指が通った場所（local 単位方向）を塗る。戻り値 = 実際に増えた総量。
   * bandMix > 0 のときは、cAxis まわりの同じ緯度の帯にも弱く効く。
   * protBias > 0 のときは「出っ張っている所ほどよく削れる」（粗形成）。
   * ドップに咥えられた石は cAxis まわりにゆっくり回されているので、
   * 砥石・磨き皿は実際には「輪」を削る。これで裏側にも手が届く。
   */
  paint(channel, localDir, angRadius = 0.36, amount = 0.5, bandMix = 0, protBias = 0) {
    const ch = channel === 'grind' ? 0 : channel === 'polish' ? 1 : 2;
    const cap = ch === 0 ? this.grindCap : 1.0;
    const cosOut = Math.cos(angRadius);
    const cosIn = Math.cos(angRadius * 0.32);
    let added = 0;
    const dx = localDir.x, dy = localDir.y, dz = localDir.z;
    const cx = this.cAxis.x, cy = this.cAxis.y, cz = this.cAxis.z;
    const ct = dx * cx + dy * cy + dz * cz;      // 帯の中心（cos θ）
    const bw = angRadius * 1.15;
    const m = this.aMask, dir = this.dir, pr = this.aProt;
    for (let i = 0; i < this.count; i++) {
      const ax = dir[i * 3], ay = dir[i * 3 + 1], az = dir[i * 3 + 2];
      const d = ax * dx + ay * dy + az * dz;
      let w = 0;
      if (d > cosOut) {
        w = (d - cosOut) / (cosIn - cosOut);
        if (w > 1) w = 1;
        w = w * w * (3 - 2 * w);
      }
      if (bandMix > 0) {
        const cv = ax * cx + ay * cy + az * cz;
        let t = 1 - Math.abs(cv - ct) / bw;
        if (t > 0) {
          t = t * t * (3 - 2 * t) * bandMix;
          if (t > w) w = t;
        }
      }
      if (w <= 0) continue;
      if (protBias > 0) w *= (1 - protBias) + protBias * pr[i];
      const j = i * 3 + ch;
      const prev = m[j];
      const nv = Math.min(cap, prev + amount * w);
      if (nv > prev) { added += nv - prev; m[j] = nv; }
    }
    if (added > 0) { this.geometry.attributes.aMask.needsUpdate = true; this._statsCache = null; }
    return added;
  }

  /** 全体をわずかに進める（丸める・全体研磨の表現） */
  paintGlobal(channel, amount) {
    const ch = channel === 'grind' ? 0 : channel === 'polish' ? 1 : 2;
    const cap = ch === 0 ? this.grindCap : 1.0;
    const m = this.aMask;
    let added = 0;
    for (let i = 0; i < this.count; i++) {
      const j = i * 3 + ch;
      const nv = Math.min(cap, m[j] + amount);
      if (nv > m[j]) { added += nv - m[j]; m[j] = nv; }
    }
    if (added > 0) { this.geometry.attributes.aMask.needsUpdate = true; this._statsCache = null; }
    return added;
  }

  /**
   * 受け皿（ドップ）が石の底面を咥える。
   * カボションのガードル（腰）から下＝底面は受け皿の形に決まり、
   * 隠れて見えないので磨く必要もない。ここが「固定＝形が半分決まる」の実体。
   */
  sealBase(level) {
    const cA = this.cAxis;
    const m = this.aMask, dir = this.dir;
    let changed = false;
    for (let i = 0; i < this.count; i++) {
      const d = -(dir[i * 3] * cA.x + dir[i * 3 + 1] * cA.y + dir[i * 3 + 2] * cA.z);
      if (d <= 0.16) continue;
      // 帯（paint の bandMix）が届く範囲と必ず重なるよう、d >= 0.26 は完全に受け皿の形にする
      const w = Math.min(1, (d - 0.16) / 0.10);
      const v = level * w;
      if (m[i * 3] < v) { m[i * 3] = v; changed = true; }
      if (m[i * 3 + 1] < v) { m[i * 3 + 1] = v; changed = true; }
    }
    if (changed) { this.geometry.attributes.aMask.needsUpdate = true; this._statsCache = null; }
  }

  /**
   * 完成演出の「最後の仕上げ」: 残った grind / polish を 1.0 まで滑らかに埋める。
   * 窓の跡（z チャンネル）・色・seed はそのまま残す。
   */
  beginFinish() {
    this._finBase = Float32Array.from(this.aMask);
  }

  applyFinish(t) {
    const b = this._finBase;
    if (!b) return;
    const k = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
    const m = this.aMask;
    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      m[j] = b[j] + (1 - b[j]) * k;
      m[j + 1] = b[j + 1] + (1 - b[j + 1]) * k;
    }
    this.geometry.attributes.aMask.needsUpdate = true;
    this._statsCache = null;
    if (k >= 1) this._finBase = null;
  }

  stats() {
    if (this._statsCache) return this._statsCache;
    let g = 0, p = 0, w = 0, maxProt = 0;
    const m = this.aMask, pr = this.aProt, N = this.count;
    const hist = new Int32Array(64);
    const capN = Math.max(0.05, this.grindCap);
    for (let i = 0; i < N; i++) {
      g += m[i * 3]; p += m[i * 3 + 1]; w += m[i * 3 + 2];
      const res = pr[i] * (1 - Math.min(1, m[i * 3] / capN));
      if (res > maxProt) maxProt = res;
      hist[Math.min(63, (res * 64) | 0)]++;
    }
    // 上位 0.5% を「残っている最大の出っ張り」とみなす（1 頂点のノイズで止まらないように）
    let acc = 0, protHigh = 0;
    const cut = N * 0.005;
    for (let b = 63; b >= 0; b--) {
      acc += hist[b];
      if (acc >= cut) { protHigh = (b + 1) / 64; break; }
    }
    this._statsCache = {
      grindAvg: g / N, polishAvg: p / N, windowAvg: w / N,
      maxProtrusion: maxProt, protHigh
    };
    return this._statsCache;
  }

  /** local 方向を、その方向の現在の表面半径に変換（パーティクル位置用） */
  surfacePoint(localDir, out) {
    // 最も近い頂点を使う近似
    let best = -2, bi = 0;
    const dir = this.dir;
    for (let i = 0; i < this.count; i++) {
      const d = dir[i * 3] * localDir.x + dir[i * 3 + 1] * localDir.y + dir[i * 3 + 2] * localDir.z;
      if (d > best) { best = d; bi = i; }
    }
    const m = this.aMask;
    const g = m[bi * 3], wv = m[bi * 3 + 2];
    const rr = Math.hypot(this.aRough[bi * 3], this.aRough[bi * 3 + 1], this.aRough[bi * 3 + 2]);
    const cr = Math.hypot(this.aCab[bi * 3], this.aCab[bi * 3 + 1], this.aCab[bi * 3 + 2]);
    const wr = Math.hypot(this.aWin[bi * 3], this.aWin[bi * 3 + 1], this.aWin[bi * 3 + 2]);
    const r = (rr * (1 - wv * 0.75) + wr * wv * 0.75) * (1 - g) + cr * g;
    out.copy(localDir).multiplyScalar(r).applyQuaternion(this._effQ).add(this.group.position);
    return out;
  }

  /** おおよその外接半径（レイの当たり判定用） */
  hitRadius() {
    const g = this.stats().grindAvg;
    return (this.roughMaxR || 1.32) * (1 - g) + (this.cabMaxR || 0.98) * g;
  }

  // ---- 保存 / 復元 ----
  serialize() {
    const N = this.count;
    const bytes = new Uint8Array(N * 3);
    for (let i = 0; i < N * 3; i++) bytes[i] = Math.round(this.aMask[i] * 255);
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return {
      v: 1,
      seed: this.seed,
      stage: this.stage,
      spin: this.spin,
      q: this.orientation.toArray(),
      masks: btoa(s)
    };
  }

  restore(data) {
    if (!data || data.v !== 1) return false;
    this.reseed(data.seed >>> 0);
    try {
      const s = atob(data.masks);
      if (s.length !== this.count * 3) return false;
      for (let i = 0; i < s.length; i++) this.aMask[i] = s.charCodeAt(i) / 255;
      this.geometry.attributes.aMask.needsUpdate = true;
      this._statsCache = null;
    } catch (e) { return false; }
    this.orientation.fromArray(data.q);
    this.spin = data.spin || 0;
    this.stage = data.stage | 0;
    this.applyOrientation();
    return true;
  }
}
