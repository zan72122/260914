import * as THREE from 'three';
import { PALETTE, toy } from '../fx/fx';
import { tangentAt, type V2 } from './geometry';
import type { Segment, TrackGraph } from './graph';

const GAUGE = 0.42;
const RAIL_W = 0.08;
const RAIL_H = 0.09;
const SLEEPER = { w: 0.9, h: 0.07, d: 0.22, every: 0.6 };

const railMat = toy(PALETTE.rail);
const sleeperMat = toy(PALETTE.wood);
const pierMat = toy(PALETTE.woodDark);
const previewMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, transparent: true, opacity: 0.45, roughness: 0.9 });
const railGeo = new THREE.BoxGeometry(1, RAIL_H, RAIL_W);
const sleeperGeo = new THREE.BoxGeometry(SLEEPER.d, SLEEPER.h, SLEEPER.w);
const pierGeo = new THREE.BoxGeometry(0.28, 1, 0.9);
const railingGeo = new THREE.BoxGeometry(1, 0.22, 0.05);
const hitGeo = new THREE.BoxGeometry(1, 0.3, 1.1);
const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

/** Builds a group of instanced meshes for one segment (rails, sleepers, bridge piers). */
export function buildSegmentMesh(seg: Segment, preview = false): THREE.Group {
  const g = new THREE.Group();
  g.name = 'segment';
  g.userData.segId = seg.id;
  const n = seg.pts.length;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  const rMat = preview ? previewMat : railMat;
  const sMat = preview ? previewMat : sleeperMat;

  // Rails: one box per sample interval, per side
  const rails = new THREE.InstancedMesh(railGeo, rMat, Math.max(1, (n - 1) * 2));
  rails.castShadow = !preview;
  rails.receiveShadow = true;
  let ri = 0;
  for (let i = 0; i < n - 1; i++) {
    const a = seg.pts[i];
    const b = seg.pts[i + 1];
    const ya = seg.h[i];
    const yb = seg.h[i + 1];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const dy = yb - ya;
    const len = Math.hypot(dx, dz, dy) + 0.02;
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    for (const sgn of [-1, 1]) {
      const cx = (a[0] + b[0]) / 2 + side.x * sgn * GAUGE * 0.5;
      const cz = (a[1] + b[1]) / 2 + side.z * sgn * GAUGE * 0.5;
      const cy = (ya + yb) / 2 + SLEEPER.h + RAIL_H / 2;
      m.compose(new THREE.Vector3(cx, cy, cz), q, new THREE.Vector3(len, 1, 1));
      rails.setMatrixAt(ri++, m);
    }
  }
  rails.count = ri;
  rails.instanceMatrix.needsUpdate = true;
  rails.userData.segId = seg.id;
  g.add(rails);

  // Sleepers every SLEEPER.every along the arc
  const count = Math.max(1, Math.floor(seg.length / SLEEPER.every) + 1);
  const sleepers = new THREE.InstancedMesh(sleeperGeo, sMat, count);
  sleepers.castShadow = !preview;
  sleepers.receiveShadow = true;
  let si = 0;
  for (let k = 0; k < count; k++) {
    const s = Math.min(seg.length, k * SLEEPER.every + SLEEPER.every * 0.5);
    let i = 0;
    while (i < n - 2 && seg.cum[i + 1] < s) i++;
    const t = seg.cum[i + 1] - seg.cum[i] > 0 ? (s - seg.cum[i]) / (seg.cum[i + 1] - seg.cum[i]) : 0;
    const p: V2 = [seg.pts[i][0] + (seg.pts[i + 1][0] - seg.pts[i][0]) * t, seg.pts[i][1] + (seg.pts[i + 1][1] - seg.pts[i][1]) * t];
    const y = seg.h[i] + (seg.h[i + 1] - seg.h[i]) * t;
    const tan = tangentAt(seg.pts, i);
    const dy = (seg.h[Math.min(n - 1, i + 1)] - seg.h[Math.max(0, i - 1)]) / 0.6;
    const dir = new THREE.Vector3(tan[0], dy, tan[1]).normalize();
    q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    m.compose(new THREE.Vector3(p[0], y + SLEEPER.h / 2, p[1]), q, new THREE.Vector3(1, 1, 1));
    sleepers.setMatrixAt(si++, m);
  }
  sleepers.count = si;
  sleepers.instanceMatrix.needsUpdate = true;
  sleepers.userData.segId = seg.id;
  g.add(sleepers);

  // Invisible, wide touch strip so a finger anywhere on the track hits it
  if (!preview) {
    const hit = new THREE.InstancedMesh(hitGeo, hitMat, Math.max(1, n - 1));
    let hi = 0;
    for (let i = 0; i < n - 1; i++) {
      const a = seg.pts[i];
      const b = seg.pts[i + 1];
      const dir = new THREE.Vector3(b[0] - a[0], seg.h[i + 1] - seg.h[i], b[1] - a[1]);
      const len = dir.length() + 0.05;
      dir.normalize();
      q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
      m.compose(new THREE.Vector3((a[0] + b[0]) / 2, (seg.h[i] + seg.h[i + 1]) / 2 + 0.12, (a[1] + b[1]) / 2), q, new THREE.Vector3(len, 1, 1));
      hit.setMatrixAt(hi++, m);
    }
    hit.count = hi;
    hit.instanceMatrix.needsUpdate = true;
    hit.userData.segId = seg.id;
    hit.name = 'hit';
    g.add(hit);
  }

  // Bridge piers + railings where the track is raised
  if (!preview) {
    const raised: number[] = [];
    for (let i = 0; i < n; i++) if (seg.h[i] > 0.12) raised.push(i);
    if (raised.length) {
      const pierEvery = 4; // samples
      const piers = new THREE.InstancedMesh(pierGeo, pierMat, Math.ceil(raised.length / pierEvery) + 1);
      piers.castShadow = true;
      piers.receiveShadow = true;
      let pi = 0;
      for (let k = 0; k < raised.length; k += pierEvery) {
        const i = raised[k];
        const tan = tangentAt(seg.pts, i);
        q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(tan[0], 0, tan[1]));
        const h = seg.h[i];
        m.compose(new THREE.Vector3(seg.pts[i][0], h / 2, seg.pts[i][1]), q, new THREE.Vector3(1, h, 1));
        piers.setMatrixAt(pi++, m);
      }
      piers.count = pi;
      piers.instanceMatrix.needsUpdate = true;
      piers.userData.segId = seg.id;
      g.add(piers);

      const railings = new THREE.InstancedMesh(railingGeo, pierMat, raised.length * 2);
      railings.castShadow = true;
      let rj = 0;
      for (const i of raised) {
        if (i >= n - 1) continue;
        const a = seg.pts[i];
        const b = seg.pts[i + 1];
        const dir = new THREE.Vector3(b[0] - a[0], seg.h[i + 1] - seg.h[i], b[1] - a[1]);
        const len = dir.length() + 0.02;
        dir.normalize();
        q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
        const side = new THREE.Vector3().crossVectors(dir, up).normalize();
        for (const sgn of [-1, 1]) {
          const c = new THREE.Vector3((a[0] + b[0]) / 2 + side.x * sgn * 0.5, (seg.h[i] + seg.h[i + 1]) / 2 + 0.2, (a[1] + b[1]) / 2 + side.z * sgn * 0.5);
          m.compose(c, q, new THREE.Vector3(len, 1, 1));
          railings.setMatrixAt(rj++, m);
        }
      }
      railings.count = rj;
      railings.instanceMatrix.needsUpdate = true;
      railings.userData.segId = seg.id;
      g.add(railings);
    }
  }
  return g;
}

/** Keeps segment meshes and open-end markers in sync with the graph. */
export class TrackRenderer {
  group = new THREE.Group();
  private meshes = new Map<string, THREE.Group>();
  private endMarkers = new THREE.Group();
  private endGeo = new THREE.TorusGeometry(0.42, 0.06, 8, 24);
  private endMat = new THREE.MeshBasicMaterial({ color: PALETTE.glow, transparent: true, opacity: 0.8 });
  private plugGeo = new THREE.SphereGeometry(0.11, 10, 8);
  private plugMat = toy(PALETTE.woodDark);
  private t = 0;

  constructor(scene: THREE.Scene, private graph: TrackGraph) {
    scene.add(this.group);
    this.group.add(this.endMarkers);
  }

  sync(): void {
    for (const [id, m] of this.meshes) {
      if (!this.graph.segments.has(id)) {
        this.group.remove(m);
        this.meshes.delete(id);
      }
    }
    for (const seg of this.graph.segments.values()) {
      if (!this.meshes.has(seg.id)) {
        const m = buildSegmentMesh(seg);
        this.meshes.set(seg.id, m);
        this.group.add(m);
      }
    }
    this.rebuildEnds();
  }

  rebuildEnds(): void {
    this.endMarkers.clear();
    for (const n of this.graph.freeNodes()) {
      const ring = new THREE.Mesh(this.endGeo, this.endMat);
      ring.rotation.x = Math.PI / 2;
      const seg = this.graph.segments.get(n.ends[0].seg);
      const y = seg ? (n.ends[0].end === 'a' ? seg.h[0] : seg.h[seg.h.length - 1]) : 0;
      ring.position.set(n.pos[0], y + 0.05, n.pos[1]);
      ring.userData.nodeId = n.id;
      this.endMarkers.add(ring);
      // little magnet knob at the open end (what a wooden rail's connector looks like)
      const plug = new THREE.Mesh(this.plugGeo, this.plugMat);
      plug.position.copy(ring.position);
      plug.position.y += 0.1;
      this.endMarkers.add(plug);
    }
  }

  meshFor(segId: string): THREE.Group | undefined {
    return this.meshes.get(segId);
  }

  /** Marker rings breathe so open ends invite the finger. */
  update(dt: number, drawing: boolean): void {
    this.t += dt;
    const s = 1 + Math.sin(this.t * 3.2) * 0.14;
    const alpha = drawing ? 1 : 0.5 + Math.sin(this.t * 3.2) * 0.3;
    for (const c of this.endMarkers.children) {
      if (c.userData.nodeId) c.scale.setScalar(drawing ? 1.35 : s);
    }
    this.endMat.opacity = alpha;
  }
}
