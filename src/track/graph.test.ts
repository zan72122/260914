import { describe, expect, it } from 'vitest';
import { resample, type V2 } from './geometry';
import { TrackGraph } from './graph';

const line = (a: V2, b: V2): V2[] => resample([a, b], 0.3);

describe('TrackGraph', () => {
  it('welds a second segment onto a free node and advances across the joint', () => {
    const g = new TrackGraph();
    const s1 = g.addPath(line([0, 0], [3, 0]), null, null);
    const end = g.nearestFreeNode([3.1, 0]);
    expect(end?.id).toBe(s1.b);
    const s2 = g.addPath(line([3, 0], [3, 3]), end, null);
    expect(g.freeNodes()).toHaveLength(2);
    const r = g.advance({ seg: s1.id, s: 2.5, sign: 1 }, 1);
    expect(r.ok).toBe(true);
    expect(r.pos.seg).toBe(s2.id);
    expect(r.pos.s).toBeCloseTo(0.5);
    expect(r.pos.sign).toBe(1);
  });

  it('flips sign when entering a segment through its b end', () => {
    const g = new TrackGraph();
    const s1 = g.addPath(line([0, 0], [3, 0]), null, null);
    // second segment drawn from far end towards the joint (its b end welds to s1.b)
    const s2raw = line([3, 3], [3, 0]);
    const s2 = g.addPath(s2raw, null, g.nearestFreeNode([3, 0]));
    const r = g.advance({ seg: s1.id, s: 2.5, sign: 1 }, 1);
    expect(r.pos.seg).toBe(s2.id);
    expect(r.pos.s).toBeCloseTo(s2.length - 0.5);
    expect(r.pos.sign).toBe(-1);
    // going backwards from there returns to s1
    const back = g.advance(r.pos, -1);
    expect(back.pos.seg).toBe(s1.id);
    expect(back.pos.s).toBeCloseTo(2.5);
    expect(back.pos.sign).toBe(1);
  });

  it('reports dead ends', () => {
    const g = new TrackGraph();
    const s1 = g.addPath(line([0, 0], [3, 0]), null, null);
    const r = g.advance({ seg: s1.id, s: 2.5, sign: 1 }, 1);
    expect(r.ok).toBe(false);
    expect(r.pos.s).toBeCloseTo(3);
    expect(g.distanceToDeadEnd({ seg: s1.id, s: 1, sign: 1 })).toBeCloseTo(2, 1);
  });

  it('loops around a closed ring', () => {
    const g = new TrackGraph();
    const ring: V2[] = [];
    for (let i = 0; i <= 64; i++) ring.push([Math.cos((i / 64) * Math.PI * 2) * 3, Math.sin((i / 64) * Math.PI * 2) * 3]);
    const s = g.addPath(resample(ring, 0.3), null, null);
    // close: weld b onto a
    const na = g.nodes.get(s.a)!;
    const nb = g.nodes.get(s.b)!;
    expect(g.nearestFreeNode(nb.pos, 1.2, nb.id)?.id).toBe(na.id);
    // emulate weld
    na.ends.push(...nb.ends);
    s.b = na.id;
    g.nodes.delete(nb.id);
    expect(g.freeNodes()).toHaveLength(0);
    const r = g.advance({ seg: s.id, s: s.length - 0.1, sign: 1 }, 0.5);
    expect(r.ok).toBe(true);
    expect(r.pos.s).toBeCloseTo(0.4);
  });

  it('raises a bridge where a new segment crosses an existing one', () => {
    const g = new TrackGraph();
    g.addPath(line([-4, 0], [4, 0]), null, null);
    const s2 = g.addPath(line([0, -4], [0, 4]), null, null);
    const mid = s2.h[Math.round(s2.h.length / 2)];
    expect(mid).toBeGreaterThan(1);
    expect(s2.h[0]).toBe(0);
  });

  it('round-trips through serialize/deserialize', () => {
    const g = new TrackGraph();
    const s1 = g.addPath(line([0, 0], [3, 0]), null, null);
    g.addPath(line([3, 0], [3, 3]), g.nearestFreeNode([3, 0]), null);
    const g2 = TrackGraph.deserialize(JSON.parse(JSON.stringify(g.serialize())));
    expect(g2.segments.size).toBe(2);
    expect(g2.freeNodes()).toHaveLength(2);
    const r = g2.advance({ seg: s1.id, s: 2.5, sign: 1 }, 1);
    expect(r.ok).toBe(true);
  });
});
