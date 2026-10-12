import { describe, it, expect } from 'vitest';
import { CALISTHENICS_LAMPS, CALISTHENICS_STATIONS, PARK_MAT } from './districts';
import { dist } from './layout';

describe('the calisthenics park', () => {
  it('has lamps just outside its mat, clear of every station', () => {
    expect(CALISTHENICS_LAMPS.length).toBeGreaterThanOrEqual(2);
    for (const l of CALISTHENICS_LAMPS) {
      // The mat is 2.6 × 1.4: the lamp stands off it, but close.
      expect(Math.abs(l.x) > 1.3 || Math.abs(l.z) > 0.7).toBe(true);
      expect(Math.max(Math.abs(l.x) - 1.3, Math.abs(l.z) - 0.7)).toBeLessThan(0.3);
      for (const st of CALISTHENICS_STATIONS) expect(dist(l, st.at)).toBeGreaterThan(0.6);
    }
  });
});

describe('training on the mat', () => {
  // People stand on the mat's top (World.groundAt), so grips are heights above it.
  it('puts push-up hands flat on the mat and the bars at their drawn height', () => {
    const grip = (k: string) => CALISTHENICS_STATIONS.find((s) => s.kinds.includes(k as never))!.grip;
    expect(grip('pushup')).toBe(0);
    expect(grip('pullup') + PARK_MAT.top).toBeCloseTo(1.12);
    expect(grip('dip') + PARK_MAT.top).toBeCloseTo(0.5);
  });
  it('covers every station', () => {
    for (const st of CALISTHENICS_STATIONS) {
      expect(Math.abs(st.at.x)).toBeLessThan(PARK_MAT.halfX);
      expect(Math.abs(st.at.z)).toBeLessThan(PARK_MAT.halfZ);
    }
  });
});
