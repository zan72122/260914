import { BRIDGE_HEIGHT, bridgeProfile, cumulative, dist, polylineCrossings, sampleAt, SNAP_RADIUS, tangentAt, type V2 } from './geometry';

export interface Segment {
  id: string;
  pts: V2[];
  cum: number[];
  h: number[]; // height per sample (bridges)
  length: number;
  a: string; // node id at pts[0]
  b: string; // node id at pts[last]
}

export interface Node {
  id: string;
  pos: V2;
  ends: { seg: string; end: 'a' | 'b' }[]; // at most 2
}

/** A position on the rail network. sign=+1 means the object's forward axis follows increasing s. */
export interface PathPos {
  seg: string;
  s: number;
  sign: 1 | -1;
}

export interface Placement {
  pos: V2;
  y: number;
  tan: V2; // forward direction in ground plane (already multiplied by sign)
  pitch: number; // dy/ds along forward
}

export interface SerializedGraph {
  nodes: { id: string; pos: V2 }[];
  segments: { id: string; pts: V2[]; h: number[]; a: string; b: string }[];
}

let counter = 0;
const uid = (p: string): string => `${p}${(++counter).toString(36)}${Date.now().toString(36).slice(-3)}`;

export class TrackGraph {
  nodes = new Map<string, Node>();
  segments = new Map<string, Segment>();

  /** Nodes with only one segment end attached (open rail ends). */
  freeNodes(): Node[] {
    return [...this.nodes.values()].filter((n) => n.ends.length === 1);
  }

  nearestFreeNode(p: V2, radius = SNAP_RADIUS, exclude?: string): Node | null {
    let best: Node | null = null;
    let bd = radius;
    for (const n of this.freeNodes()) {
      if (n.id === exclude) continue;
      const d = dist(n.pos, p);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  /** Closest point on any segment. */
  nearestOnTrack(p: V2): { seg: Segment; s: number; d: number; index: number } | null {
    let best: { seg: Segment; s: number; d: number; index: number } | null = null;
    for (const seg of this.segments.values()) {
      for (let i = 0; i < seg.pts.length; i++) {
        const d = dist(seg.pts[i], p);
        if (!best || d < best.d) best = { seg, s: seg.cum[i], d, index: i };
      }
    }
    return best;
  }

  private makeNode(pos: V2): Node {
    const n: Node = { id: uid('n'), pos, ends: [] };
    this.nodes.set(n.id, n);
    return n;
  }

  /**
   * Add a finished path. Endpoints within snap radius of a free node get welded to it.
   * The caller is expected to have already bent the path's endpoints onto the snapped nodes.
   * Returns the new segment.
   */
  addPath(pts: V2[], snapStart: Node | null, snapEnd: Node | null): Segment {
    if (snapStart && snapEnd && snapStart.id === snapEnd.id) snapEnd = null;
    const cum = cumulative(pts);
    const seg: Segment = { id: uid('s'), pts, cum, h: cum.map(() => 0), length: cum[cum.length - 1], a: '', b: '' };
    const na = snapStart ?? this.makeNode(pts[0]);
    const nb = snapEnd ?? this.makeNode(pts[pts.length - 1]);
    na.ends.push({ seg: seg.id, end: 'a' });
    nb.ends.push({ seg: seg.id, end: 'b' });
    seg.a = na.id;
    seg.b = nb.id;
    this.segments.set(seg.id, seg);
    this.computeBridges(seg);
    return seg;
  }

  /** New segments bridge over anything they cross (existing tracks and themselves). */
  private computeBridges(seg: Segment): void {
    const crossings: number[] = [];
    for (const other of this.segments.values()) {
      if (other.id === seg.id) continue;
      for (const [sA, sB] of polylineCrossings(seg.pts, seg.cum, other.pts, other.cum)) {
        // Skip hits right at welded joints.
        if (sA < 0.5 || sA > seg.length - 0.5) continue;
        if (sB < 0.5 || sB > other.length - 0.5) continue;
        // If the other track is already raised here, we go under instead (stay flat).
        const otherH = sampleAt(other.h, other.cum, sB);
        if (otherH > BRIDGE_HEIGHT * 0.5) continue;
        crossings.push(sA);
      }
    }
    for (const [sA, sB] of polylineCrossings(seg.pts, seg.cum, seg.pts, seg.cum, true)) {
      // later part of the stroke goes over the earlier part
      const later = Math.max(sA, sB);
      if (later > 0.5 && later < seg.length - 0.5) crossings.push(later);
    }
    seg.h = crossings.length ? bridgeProfile(seg.cum, crossings) : seg.cum.map(() => 0);
  }

  removeSegment(id: string): void {
    const seg = this.segments.get(id);
    if (!seg) return;
    for (const nid of [seg.a, seg.b]) {
      const n = this.nodes.get(nid);
      if (!n) continue;
      n.ends = n.ends.filter((e) => e.seg !== id);
      if (n.ends.length === 0) this.nodes.delete(nid);
    }
    this.segments.delete(id);
  }

  segmentAt(pos: PathPos): Segment {
    const s = this.segments.get(pos.seg);
    if (!s) throw new Error('missing segment ' + pos.seg);
    return s;
  }

  place(pos: PathPos): Placement {
    const seg = this.segmentAt(pos);
    const p = sampleAt(seg.pts, seg.cum, pos.s);
    const y = sampleAt(seg.h, seg.cum, pos.s);
    // index for tangent
    let i = 0;
    while (i < seg.cum.length - 1 && seg.cum[i + 1] < pos.s) i++;
    const t = tangentAt(seg.pts, i);
    const ahead = sampleAt(seg.h, seg.cum, Math.min(seg.length, pos.s + 0.3));
    const behind = sampleAt(seg.h, seg.cum, Math.max(0, pos.s - 0.3));
    const pitch = ((ahead - behind) / 0.6) * pos.sign;
    return { pos: p, y, tan: [t[0] * pos.sign, t[1] * pos.sign], pitch };
  }

  /**
   * Move `delta` along the forward axis (negative = backwards). Crosses welded joints.
   * Returns the new position and whether the full distance was travelled (false at a dead end).
   */
  advance(pos: PathPos, delta: number): { pos: PathPos; ok: boolean } {
    let { seg: segId, s, sign } = pos;
    let remaining = delta * sign; // signed movement in s of the current segment
    for (let guard = 0; guard < 64; guard++) {
      const seg = this.segmentAt({ seg: segId, s, sign });
      const target = s + remaining;
      if (target >= 0 && target <= seg.length) return { pos: { seg: segId, s: target, sign }, ok: true };
      const exitEnd: 'a' | 'b' = target < 0 ? 'a' : 'b';
      const overshoot = target < 0 ? -target : target - seg.length;
      const node = this.nodes.get(exitEnd === 'a' ? seg.a : seg.b);
      const next = node?.ends.find((e) => !(e.seg === segId && e.end === exitEnd));
      if (!next) {
        return { pos: { seg: segId, s: exitEnd === 'a' ? 0 : seg.length, sign }, ok: false };
      }
      const nseg = this.segmentAt({ seg: next.seg, s: 0, sign });
      // Direction of s-travel on the current segment (+1 if we exited through b).
      const travel = exitEnd === 'b' ? 1 : -1;
      if (next.end === 'a') {
        // entering at start: s increases in the same travel sense
        segId = nseg.id;
        s = 0;
        remaining = overshoot;
        if (travel === -1) sign = (sign * -1) as 1 | -1;
      } else {
        segId = nseg.id;
        s = nseg.length;
        remaining = -overshoot;
        if (travel === 1) sign = (sign * -1) as 1 | -1;
      }
      // keep sign consistent with the direction of forward motion:
      // forward (delta>0) must correspond to remaining having sign `sign`.
      if (delta !== 0 && Math.sign(remaining) !== Math.sign(delta) * sign) sign = (sign * -1) as 1 | -1;
    }
    return { pos: { seg: segId, s, sign }, ok: true };
  }

  /** Distance forward until the network dead-ends (capped). */
  distanceToDeadEnd(pos: PathPos, cap = 6): number {
    let travelled = 0;
    let cur = pos;
    const step = 0.5;
    while (travelled < cap) {
      const r = this.advance(cur, step);
      if (!r.ok) {
        // compute exact remainder in this segment
        const seg = this.segmentAt(cur);
        const rem = cur.sign > 0 ? seg.length - cur.s : cur.s;
        return travelled + rem;
      }
      cur = r.pos;
      travelled += step;
    }
    return cap;
  }

  totalLength(): number {
    let t = 0;
    for (const s of this.segments.values()) t += s.length;
    return t;
  }

  serialize(): SerializedGraph {
    const r2 = (v: number): number => Math.round(v * 100) / 100;
    return {
      nodes: [...this.nodes.values()].map((n) => ({ id: n.id, pos: [r2(n.pos[0]), r2(n.pos[1])] })),
      segments: [...this.segments.values()].map((s) => ({
        id: s.id,
        pts: s.pts.map((p) => [r2(p[0]), r2(p[1])] as V2),
        h: s.h.map(r2),
        a: s.a,
        b: s.b,
      })),
    };
  }

  static deserialize(data: SerializedGraph): TrackGraph {
    const g = new TrackGraph();
    for (const n of data.nodes) g.nodes.set(n.id, { id: n.id, pos: n.pos, ends: [] });
    for (const s of data.segments) {
      if (s.pts.length < 2) continue;
      const cum = cumulative(s.pts);
      const seg: Segment = { id: s.id, pts: s.pts, cum, h: s.h.length === s.pts.length ? s.h : cum.map(() => 0), length: cum[cum.length - 1], a: s.a, b: s.b };
      const na = g.nodes.get(s.a);
      const nb = g.nodes.get(s.b);
      if (!na || !nb) continue;
      na.ends.push({ seg: seg.id, end: 'a' });
      nb.ends.push({ seg: seg.id, end: 'b' });
      g.segments.set(seg.id, seg);
    }
    return g;
  }
}
