import { describe, it, expect } from 'vitest';
import { CALISTHENICS_LAMPS, CALISTHENICS_STATIONS } from './districts';
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
