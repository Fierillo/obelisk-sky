// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildVoiceTree } from './ombu';

describe('the voice tree', () => {
  it('rings the trunk with chairs facing out, clear of the trunk, and has room for three benches', () => {
    const t = buildVoiceTree(2, 0x3f6fc4, 7);
    expect(t.seats.length).toBeGreaterThanOrEqual(6);
    for (const s of t.seats) {
      const r = Math.hypot(s.pos.x, s.pos.z);
      expect(r).toBeGreaterThan(t.trunkR);
      // Facing out: the facing direction points away from the trunk.
      expect(Math.sin(s.face) * s.pos.x + Math.cos(s.face) * s.pos.z).toBeGreaterThan(0);
    }
    expect(t.benchSpots).toHaveLength(3);
    for (const b of t.benchSpots) {
      expect(Math.hypot(b.pos.x, b.pos.z)).toBeGreaterThan(Math.hypot(t.seats[0].pos.x, t.seats[0].pos.z) + 0.3);
      // Benches face the tree.
      expect(Math.sin(b.face) * b.pos.x + Math.cos(b.face) * b.pos.z).toBeLessThan(0);
    }
  });
});
