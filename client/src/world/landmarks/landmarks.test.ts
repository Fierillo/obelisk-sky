import { describe, it, expect } from 'vitest';
import { planIsland, trackSite, onTrack } from '../layout';
import { LANDMARKS, reserveLandmarkSlots } from './index';
import { branchGrowth } from './nostrwot';

describe('landmark slots', () => {
  const plan = planIsland();
  const track = trackSite(plan);
  const free = plan.slots.filter((s) => !track || !onTrack(s.pos, track, s.w * 0.7 + 0.6));
  const held = reserveLandmarkSlots(free, plan.plaza.c);
  it('gives every landmark its own slot', () => {
    expect(held.size).toBe(LANDMARKS.length);
    expect(new Set([...held.values()].map((s) => s.index)).size).toBe(LANDMARKS.length);
  });
  it('puts the nostr-wot HQ in the big slot nearest the obelisk (after La Crypta)', () => {
    const hq = held.get('nostrwot')!;
    const lc = held.get('lacrypta')!;
    const others = free.filter((s) => s.w >= 3 && s.index !== lc.index && s.index !== hq.index);
    const d = (s: { pos: { x: number; z: number } }) => Math.hypot(s.pos.x - plan.plaza.c.x, s.pos.z - plan.plaza.c.z);
    for (const o of others) expect(d(hq)).toBeLessThanOrEqual(d(o));
  });
  it('respects each landmark minimum size', () => {
    for (const d of LANDMARKS) expect(held.get(d.id)!.w).toBeGreaterThanOrEqual(d.minSize);
  });
});

describe('the HQ graph grows like the animated logo', () => {
  it('starts empty, grows branch by branch, holds, then fades', () => {
    expect(branchGrowth(0, 0).line).toBe(0);
    expect(branchGrowth(0, 1).line).toBe(1);
    expect(branchGrowth(5, 1).line).toBe(0);
    expect(branchGrowth(5, 7).ends).toBe(1);
    expect(branchGrowth(2, 7).alpha).toBe(1);
    expect(branchGrowth(2, 8.6).alpha).toBeLessThan(0.2);
    expect(branchGrowth(0, 9.5).line).toBe(branchGrowth(0, 0.5).line);
  });
});
