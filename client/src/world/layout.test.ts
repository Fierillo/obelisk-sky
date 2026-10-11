import { describe, it, expect } from 'vitest';
import { planIsland, buildNavGrid, assignSlots, inFootprint, dist, islandOutline, ISLAND_R } from './layout';

describe('island plan', () => {
  const plan = planIsland();
  it('is deterministic and has room for the channels', () => {
    expect(planIsland().slots.map((s) => s.pos)).toEqual(plan.slots.map((s) => s.pos));
    expect(plan.slots.length).toBeGreaterThanOrEqual(16);
  });
  it('slots do not overlap each other', () => {
    for (const a of plan.slots) for (const b of plan.slots) {
      if (a !== b) expect(dist(a.pos, b.pos)).toBeGreaterThan(2.5);
    }
  });
  it('every yard is reachable from the plaza', () => {
    const grid = buildNavGrid(plan, plan.slots, [plan.river[2], plan.river[5]]);
    for (const s of plan.slots) {
      const path = grid.findPath({ x: 0, z: 3 }, s.yard);
      expect(path, `slot ${s.index}`).not.toBeNull();
      for (const p of path!) expect(plan.slots.some((o) => inFootprint(p, o, 0.05))).toBe(false);
    }
  });
  it('assigns the busiest channel the first slot', () => {
    const a = assignSlots(['x', 'y', 'z'], new Map([['y', 10], ['z', 3]]), 2);
    expect(a.get('y')).toBe(0);
    expect(a.get('z')).toBe(1);
    expect(a.has('x')).toBe(false);
  });
});

import { assignByDistrict, trackSite, onTrack } from './layout';

describe('themed districts', () => {
  const plan = planIsland();
  const track = trackSite(plan);
  it('finds room for a running track away from water and the plaza', () => {
    expect(track).not.toBeNull();
    expect(dist(track!.c, plan.plaza.c)).toBeGreaterThan(plan.plaza.r + 4);
    expect(dist(track!.c, plan.pond.c)).toBeGreaterThan(plan.pond.r + 4);
  });
  it('gathers each theme together and keeps the busiest plaza channels central', () => {
    const chans = [
      { id: 'run', district: 'sports' as const, activity: 5 },
      { id: 'gym', district: 'sports' as const, activity: 1 },
      { id: 'game', district: 'gaming' as const, activity: 3 },
      { id: 'general', district: 'plaza' as const, activity: 99 },
      { id: 'quiet', district: 'plaza' as const, activity: 0 },
    ];
    const a = assignByDistrict(chans, plan, track);
    expect(a.size).toBe(5);
    const pos = (id: string) => plan.slots[a.get(id)!].pos;
    // Both sports channels sit by the track, nearer to it than the arcade is.
    for (const id of ['run', 'gym']) expect(dist(pos(id), track!.c)).toBeLessThan(dist(pos('game'), track!.c));
    expect(Math.hypot(pos('general').x, pos('general').z)).toBeLessThan(Math.hypot(pos('quiet').x, pos('quiet').z) + 0.01);
    expect(new Set(a.values()).size).toBe(5);
    for (const i of a.values()) expect(onTrack(plan.slots[i].pos, track!, 0.5)).toBe(false);
  });
});

describe('bridges', () => {
  it('can be walked straight across, bank to bank', async () => {
    const { planIsland, buildNavGrid, riverTangentAt } = await import('./layout');
    const plan = planIsland();
    // A bridge where the river runs straight, as world.ts places them.
    const b = plan.river[4];
    const grid = buildNavGrid(plan, [], [b]);
    const t = riverTangentAt(plan.river, b);
    const n = { x: -t.z, z: t.x };
    for (let s = -1.6; s <= 1.6; s += 0.1) {
      expect(grid.isWalkable({ x: b.x + n.x * s, z: b.z + n.z * s })).toBe(true);
    }
  });
});

describe('island outline (the loading screen map)', () => {
  const plan = planIsland();
  it('traces the rim the ground is built with, all the way round', () => {
    const rim = islandOutline(plan, 64);
    expect(rim).toHaveLength(64);
    for (const p of rim) {
      const r = Math.hypot(p.x, p.z);
      expect(r).toBeGreaterThan(ISLAND_R * 0.88);
      expect(r).toBeLessThan(ISLAND_R * 1.12);
      expect(r).toBeCloseTo(plan.radiusAt(Math.atan2(p.z, p.x)), 6);
    }
  });
  it('has the river inside the island until it falls off the edge', () => {
    for (const p of plan.river.slice(0, -1)) expect(Math.hypot(p.x, p.z)).toBeLessThan(plan.radiusAt(Math.atan2(p.z, p.x)));
  });
});
