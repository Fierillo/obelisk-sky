// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildGym, gymLights, pickGymChannel, BENCH_TOP } from './gym';
import { trackLap, TRACK_LANES } from './districts';
import { dist } from './layout';

describe('the gym', () => {
  const sports = () => 'sports' as const;
  const wide = () => 2;
  it('goes to a channel named like a gym, La Crypta\'s first', () => {
    const groups = [
      { id: 'a', name: 'general', kind: 'text' },
      { id: 'b', name: 'Gym talk', kind: 'text' },
      { id: 'c', name: 'La Crypta Fitness', kind: 'text' },
    ];
    expect(pickGymChannel(groups, () => 'plaza', wide)).toBe('c');
    expect(pickGymChannel(groups.slice(0, 2), () => 'plaza', wide)).toBe('b');
  });
  it('falls back to a sports channel, never a voice room, and needs room for the machines', () => {
    expect(pickGymChannel([{ id: 'v', name: 'gym voice', kind: 'voice' }, { id: 'r', name: 'runners', kind: 'text' }], sports, wide)).toBe('r');
    expect(pickGymChannel([{ id: 'g', name: 'gym', kind: 'text' }], sports, () => 1)).toBeNull();
    expect(pickGymChannel([{ id: 'x', name: 'chat', kind: 'text' }], () => 'plaza', wide)).toBeNull();
  });
  it('has machines inside the room, each with a way on, and a ramp in at the door', () => {
    const slot = { index: 0, pos: { x: 0, z: 0 }, rot: 0, w: 2, d: 2, door: { x: 0, z: 1.2 }, yard: { x: 0, z: 2 } };
    const g = buildGym(slot, 0xff0000);
    const room = g.interior.rooms[0];
    expect(g.stations.map((s) => s.kinds[0]).sort()).toEqual(['benchpress', 'curl', 'squat']);
    for (const s of g.stations) {
      for (const p of [s.at, s.approach]) {
        expect(p.x).toBeGreaterThan(room.minX);
        expect(p.x).toBeLessThan(room.maxX);
        expect(p.z).toBeGreaterThan(room.minZ);
        expect(p.z).toBeLessThan(room.maxZ);
      }
    }
    expect(g.stations.find((s) => s.kinds[0] === 'benchpress')!.grip).toBe(BENCH_TOP);
    // Outside 0, inside the floor, and no ledge on the way in.
    expect(g.groundAt({ x: 0, z: 3 })).toBe(0);
    const floor = g.groundAt({ x: 0, z: 0 });
    expect(floor).toBeGreaterThan(0.05);
    let last = g.groundAt({ x: 0, z: 1.8 });
    for (let z = 1.8; z > 0.5; z -= 0.02) {
      const h = g.groundAt({ x: 0, z });
      expect(h - last).toBeLessThan(0.02);
      last = h;
    }
  });
});

describe('track lanes', () => {
  it('runs each lane on its own line, inside to outside', () => {
    const site = { c: { x: 0, z: 0 }, rot: 0 };
    const lanes = Array.from({ length: TRACK_LANES }, (_, i) => trackLap(site, 40, i));
    const r = (pts: { x: number; z: number }[]) => Math.max(...pts.map((p) => Math.abs(p.z)));
    for (let i = 1; i < lanes.length; i++) expect(r(lanes[i])).toBeGreaterThan(r(lanes[i - 1]) + 0.2);
    // Neighbouring runners never share a line.
    expect(Math.min(...lanes[0].map((p) => Math.min(...lanes[1].map((q) => dist(p, q)))))).toBeGreaterThan(0.2);
  });
});

describe('the gym never closes', () => {
  it('keeps its lights on by day and brightens them at night', () => {
    const day = gymLights(0), night = gymLights(1);
    expect(day.lamp).toBeGreaterThan(0);
    expect(day.strip).toBeGreaterThan(0);
    expect(night.lamp).toBeGreaterThan(day.lamp * 2);
    expect(night.strip).toBeGreaterThan(day.strip);
    expect(night.glass).toBeGreaterThan(0);
    expect(gymLights(0.5).lamp).toBeGreaterThan(day.lamp);
  });

  it('hangs strip lights under the ceiling, inside the walls', () => {
    const slot = { pos: { x: 0, z: 0 }, rot: 0, w: 2.4, d: 2, yard: { x: 0, z: 2 } } as never;
    const strips = buildGym(slot, 0x334455).group.children.filter((o) => o.name === 'gym-strip');
    expect(strips).toHaveLength(2);
    for (const s of strips) expect(Math.abs(s.position.z)).toBeLessThan(1);
  });
  it('keeps its glass door out of the merge, so it still slides open', async () => {
    const THREE = await import('three');
    const { findDynamic, mergeStatic } = await import('./merge');
    const slot = { index: 0, pos: { x: 0, z: 0 }, rot: 0, w: 2, d: 2, door: { x: 0, z: 1.2 }, yard: { x: 0, z: 2 } };
    const gb = buildGym(slot, 0x334455);
    // As world.ts builds it.
    const moving = findDynamic(gb.group, (mark) => {
      gb.interior.setDoor(1); mark(); gb.interior.setInside(true); mark(); gb.interior.setInside(false); gb.interior.setDoor(0);
    });
    mergeStatic(gb.group, (m) => moving.has(m) || m.name === 'roof' || gb.windows.includes(m));
    const all = () => { const out: InstanceType<typeof THREE.Mesh>[] = []; gb.group.traverse((o) => { if ((o as InstanceType<typeof THREE.Mesh>).isMesh) out.push(o as InstanceType<typeof THREE.Mesh>); }); return out; };
    gb.group.updateMatrixWorld(true);
    const at = new Map(all().map((m) => [m, m.matrixWorld.elements.slice()]));
    gb.interior.setDoor(1);
    gb.group.updateMatrixWorld(true);
    expect(all().some((m) => at.get(m)?.some((x, i) => Math.abs(x - m.matrixWorld.elements[i]) > 1e-6))).toBe(true);
  });
});
