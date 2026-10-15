// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MAX_RAMP_SLOPE } from '../../player/controller';
import { findDynamic, mergeStatic } from '../merge';
import { planIsland, trackSite, onTrack } from '../layout';
import { LANDMARKS, reserveLandmarkSlots } from './index';
import { THEATER, buildTheater, theaterFloor } from './theater';
import { letterbox } from '../theaterScreen';

describe('the theater', () => {
  const b = buildTheater();

  it('has rows of popcorn seats, indoors, facing the screen', () => {
    expect(b.seats).toHaveLength(THEATER.ROWS.length * THEATER.COLS.length);
    for (const s of b.seats!) {
      expect(s).toMatchObject({ face: 0, prop: 'popcorn', indoor: true });
      expect(s.bench).toBeUndefined();
      // The cushion sits on the raked floor under it.
      expect(s.y).toBeCloseTo(theaterFloor(s.pos.z) + THEATER.SEAT_TOP, 5);
      // Inside the hall.
      expect(b.interior!.rooms[0].minZ).toBeLessThan(s.pos.z);
      expect(s.pos.z).toBeLessThan(b.interior!.rooms[0].maxZ);
    }
  });

  it('rises toward the back with no ledge anywhere a foot can go', () => {
    const step = 0.05;
    // From the lawn in front, through the door, up to the back row (the back wall stops you there).
    for (let z = 0.4; z > -THEATER.D + THEATER.T + step; z -= step) {
      for (const x of [-1, 0, 1.05]) {
        const a = b.groundAt!({ x, z }), c = b.groundAt!({ x, z: z - step });
        expect(Math.abs(c - a)).toBeLessThanOrEqual(MAX_RAMP_SLOPE * step + 1e-6);
      }
    }
    expect(theaterFloor(THEATER.RAKE_Z1 - 0.1)).toBeGreaterThan(theaterFloor(THEATER.RAKE_Z0 + 0.1));
  });

  it('keeps the screen its own mesh when the building is merged', () => {
    const g = b.group;
    const moving = findDynamic(g, (mark) => {
      for (const t of [0.4, 2.9]) { b.update?.(0.016, t); mark(); }
      b.setNight(1, 1); mark();
      b.interior?.setDoor(1); mark();
      b.interior?.setInside(true); mark();
      b.interior?.setInside(false); b.interior?.setDoor(0); b.setNight(0, 1);
    });
    mergeStatic(g, (m) => moving.has(m) || m.name === 'roof' || m.name === 'theater-screen');
    let screens = 0;
    g.traverse((o) => { if (o.name === 'theater-screen') screens++; });
    expect(screens).toBe(1);
    expect(b.hall!.screen.mesh.parent).toBe(g);
  });

  it('adds one light at most (the house light)', () => {
    let lights = 0;
    b.group.traverse((o) => { if ((o as THREE.Light).isLight) lights++; });
    expect(lights).toBeLessThanOrEqual(1);
  });

  it('dims the house lights while a film plays', () => {
    const light = (() => { let l: THREE.PointLight | null = null; b.group.traverse((o) => { if ((o as THREE.PointLight).isPointLight) l = o as THREE.PointLight; }); return l!; })();
    b.hall!.setPlaying(false);
    for (let i = 0; i < 30; i++) b.update!(0.1, i);
    const up = light.intensity;
    b.hall!.setPlaying(true);
    for (let i = 0; i < 30; i++) b.update!(0.1, i);
    expect(light.intensity).toBeLessThan(up * 0.5);
  });

  it('gets a big slot, its walls clear of every other slot', () => {
    const plan = planIsland();
    const track = trackSite(plan);
    const free = plan.slots.filter((s) => !track || !onTrack(s.pos, track, s.w * 0.7 + 0.6));
    const s = reserveLandmarkSlots(free, plan.plaza.c).get('theater')!;
    const d = LANDMARKS.find((x) => x.id === 'theater')!;
    expect(s.w).toBeGreaterThanOrEqual(3);
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    const f = d.footprint;
    const corners = [[f.minX, f.minZ], [f.maxX, f.minZ], [f.minX, f.maxZ], [f.maxX, f.maxZ]].map(([x, z]) => ({
      x: s.pos.x + sn * d.forward + x * c + z * sn, z: s.pos.z + c * d.forward - x * sn + z * c,
    }));
    // Inside its own slot's square (slot-local: x across, z toward the yard).
    expect(Math.max(-f.minX, f.maxX)).toBeLessThanOrEqual(s.w / 2);
    expect(f.minZ + d.forward).toBeGreaterThanOrEqual(-s.w / 2);
    expect(f.maxZ + d.forward).toBeLessThanOrEqual(s.w / 2);
    for (const o of plan.slots) {
      if (o.index === s.index) continue;
      for (const p of corners) expect(Math.max(Math.abs(p.x - o.pos.x), Math.abs(p.z - o.pos.z))).toBeGreaterThan(o.w / 2 + 0.3);
    }
  });
});

describe('the screen hangs over the audience’s heads', () => {
  it('its bottom clears a seated head in the front row (its film is drawn over the canvas: world/domScreen.ts)', () => {
    const seatedHead = theaterFloor(THEATER.ROWS[0]) + THEATER.SEAT_TOP + 0.45;
    expect(THEATER.SCREEN_Y - THEATER.SCREEN_H / 2).toBeGreaterThan(seatedHead - 0.15);
    expect(THEATER.SCREEN_Y + THEATER.SCREEN_H / 2).toBeLessThan(THEATER.H - 0.1);
  });
});

describe('the screen keeps the picture’s shape', () => {
  it('letterboxes wide pictures and pillarboxes tall ones', () => {
    expect(letterbox(16 / 9, 16 / 9)).toEqual([1, 1]);
    const [wx, wy] = letterbox(2.39, 16 / 9);
    expect(wx).toBe(1);
    expect(wy).toBeCloseTo(16 / 9 / 2.39);
    const [tx, ty] = letterbox(4 / 3, 16 / 9);
    expect(ty).toBe(1);
    expect(tx).toBeCloseTo(4 / 3 / (16 / 9));
    expect(letterbox(0, 1)).toEqual([1, 1]);
  });
});

describe('the theater door', () => {
  it('is wide enough to walk through when the hall stands at 45°', () => {
    const b = buildTheater();
    const [room, door] = b.interior!.rooms;
    // The controller keeps 0.18 m clear along world x and z: at 45° that is 0.13 m each way along the door.
    const reach = 0.18 * Math.SQRT1_2 * 2;
    expect(door.maxX - door.minX).toBeGreaterThan(reach * 1.5);
    // A proper double door: at least 0.7 m you can walk through.
    expect(door.maxX - door.minX).toBeGreaterThanOrEqual(0.7);
    // The doorway overlaps the room, so you step straight from one to the other.
    expect(door.minZ).toBeLessThan(room.maxZ);
    // Nothing solid in it (the stage stays left of the door).
    for (const s of b.solids!) expect(s.x + s.hx).toBeLessThan(door.minX);
  });
});
