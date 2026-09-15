import { describe, expect, it } from 'vitest';
import { Kid, STATE_POSE, canTransition, resolvedState, stateDuration } from '../src/crowd/kid';
import type { KidState } from '../src/crowd/kid';
import { POSE_FRAMES, frameIndex, poseColumn, FRAMES_PER_VARIANT } from '../src/art/kidSheet';

const ALL: KidState[] = ['idle', 'walk', 'run', 'laugh', 'jump', 'fall', 'clap', 'sleep'];

describe('state machine', () => {
  it('starts idle', () => {
    expect(new Kid().state).toBe('idle');
  });

  it('allows the ordinary walk/run/idle transitions', () => {
    const k = new Kid();
    expect(k.setState('walk')).toBe(true);
    expect(k.state).toBe('walk');
    expect(k.setState('run')).toBe(true);
    expect(k.setState('idle')).toBe(true);
  });

  it('only wakes a sleeping kid into idle', () => {
    expect(canTransition('sleep', 'idle')).toBe(true);
    expect(canTransition('sleep', 'run')).toBe(false);
    const k = new Kid();
    k.setState('sleep');
    expect(k.setState('run')).toBe(false);
    expect(k.state).toBe('sleep');
    expect(k.setState('idle')).toBe(true);
  });

  it('lets a fall finish, then resolves it into a laugh', () => {
    const k = new Kid();
    k.setState('fall');
    expect(k.setState('walk')).toBe(false);
    for (let i = 0; i < 120; i++) k.update(1 / 60);
    expect(k.state).toBe('laugh');
  });

  it('resolves every transient state back to a happy steady state', () => {
    for (const s of ['laugh', 'jump', 'clap'] as KidState[]) {
      const k = new Kid();
      k.setState(s);
      expect(k.stateTimer).toBeGreaterThan(0);
      for (let i = 0; i < 300; i++) k.update(1 / 60);
      expect(k.state).toBe('idle');
    }
    expect(resolvedState('fall')).toBe('laugh');
  });

  it('keeps steady states forever without input', () => {
    for (const s of ['idle', 'walk', 'run', 'sleep'] as KidState[]) {
      expect(stateDuration(s)).toBe(0);
      const k = new Kid();
      k.setState(s);
      for (let i = 0; i < 600; i++) k.update(1 / 60);
      expect(k.state).toBe(s);
    }
  });

  it('cycles the animation frames of its pose and never goes out of range', () => {
    const k = new Kid();
    k.setState('walk');
    for (let i = 0; i < 600; i++) {
      k.update(1 / 60);
      expect(k.frame).toBeGreaterThanOrEqual(0);
      expect(k.frame).toBeLessThan(POSE_FRAMES[k.pose]);
    }
  });

  it('faces the direction it is moving', () => {
    const k = new Kid();
    k.vx = -50;
    k.update(1 / 60);
    expect(k.facing).toBe(-1);
    k.vx = 50;
    k.update(1 / 60);
    expect(k.facing).toBe(1);
  });

  it('maps every state to a drawable pose', () => {
    for (const s of ALL) {
      expect(POSE_FRAMES[STATE_POSE[s]]).toBeGreaterThan(0);
    }
  });
});

describe('sprite atlas indexing', () => {
  it('lays poses out contiguously', () => {
    expect(poseColumn('idle')).toBe(0);
    expect(poseColumn('walk')).toBe(2);
    // idle 2 + walk 4 + run 4 + laugh 2 + jump 1 + clap 2 + sleep 1 + wave 2
    // + sit 2 + hold 2 + climb 2 + roll 4
    expect(FRAMES_PER_VARIANT).toBe(28);
  });

  it('wraps frame and variant indices into range', () => {
    const max = 6 * FRAMES_PER_VARIANT;
    expect(frameIndex(0, 'idle', 0)).toBe(0);
    expect(frameIndex(0, 'idle', 5)).toBe(frameIndex(0, 'idle', 1));
    expect(frameIndex(7, 'walk', 0)).toBeLessThan(max);
    expect(frameIndex(-1, 'walk', 0)).toBeGreaterThanOrEqual(0);
  });
});
