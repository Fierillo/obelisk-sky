// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { findDynamic, mergeStatic } from '../merge';
import { planIsland, trackSite, onTrack, distToPolyline } from '../layout';
import { terrainHeight, smoothRiver } from '../island';
import { LANDMARKS, reserveLandmarkSlots } from './index';
import { LABITCONF, LABITCONF_FLOOR, buildLabitconf } from './labitconf';
import { buildBitcoineta } from '../bitcoineta';

const inRect = (p: { x: number; z: number }, r: { minX: number; maxX: number; minZ: number; maxZ: number }) =>
  p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ;
const overlaps = (s: { x: number; z: number; hx: number; hz: number }, r: { minX: number; maxX: number; minZ: number; maxZ: number }) =>
  s.x + s.hx > r.minX && s.x - s.hx < r.maxX && s.z + s.hz > r.minZ && s.z - s.hz < r.maxZ;

describe('LABITCONF', () => {
  const b = buildLabitconf();
  const [room, door] = b.interior!.rooms;

  it('seats the audience facing the stage and the panel on it, all indoors', () => {
    const audience = b.seats!.filter((s) => s.pos.z > LABITCONF.STAGE_Z);
    const panel = b.seats!.filter((s) => s.pos.z < LABITCONF.STAGE_Z);
    expect(audience).toHaveLength(LABITCONF.ROWS.length * LABITCONF.COLS.length);
    expect(panel.length).toBeGreaterThanOrEqual(3);
    for (const s of audience) {
      expect(s).toMatchObject({ face: Math.PI, indoor: true });
      expect(s.y).toBeCloseTo(LABITCONF_FLOOR + LABITCONF.SEAT_TOP, 5);
    }
    for (const s of panel) {
      expect(s).toMatchObject({ face: 0, indoor: true });
      expect(s.pos.z).toBeLessThan(LABITCONF.STAGE_Z);
    }
    for (const s of b.seats!) {
      expect(inRect(s.pos, room)).toBe(true);
      // No seat inside the van, the obelisk or (for the audience) the stage.
      for (const so of b.solids!) {
        if (so.top === LABITCONF.STAGE_TOP && s.pos.z < LABITCONF.STAGE_Z) continue;
        expect(overlaps({ ...s.pos, hx: 0.05, hz: 0.05 }, { minX: so.x - so.hx, maxX: so.x + so.hx, minZ: so.z - so.hz, maxZ: so.z + so.hz })).toBe(false);
      }
    }
  });

  it('has a flat floor inside and the lawn outside', () => {
    expect(b.groundAt!({ x: 0, z: -1.2 })).toBeCloseTo(LABITCONF_FLOOR, 5);
    expect(b.groundAt!({ x: 0, z: 0.5 })).toBe(0);
  });

  it('keeps the door wide and clear, and an aisle from it to the stage', () => {
    const reach = 0.18 * Math.SQRT1_2 * 2;
    expect(door.maxX - door.minX).toBeGreaterThan(reach * 1.5);
    expect(door.maxX - door.minX).toBeGreaterThanOrEqual(0.7);
    expect(door.minZ).toBeLessThan(room.maxZ);
    // In from the door down the right of the chairs, then across in front of the stage: nothing solid in the way.
    const right = LABITCONF.COLS[LABITCONF.COLS.length - 1] + 0.12;
    const aisle = { minX: right, maxX: right + 0.2, minZ: LABITCONF.STAGE_Z + 0.05, maxZ: 0.6 };
    const front = { minX: -0.4, maxX: right + 0.2, minZ: LABITCONF.STAGE_Z + 0.05, maxZ: LABITCONF.ROWS[LABITCONF.ROWS.length - 1] - 0.12 };
    for (const s of b.solids!) {
      expect(overlaps(s, door)).toBe(false);
      expect(overlaps(s, aisle)).toBe(false);
      expect(overlaps(s, front)).toBe(false);
    }
    // And room to stand at La Bitcoineta's counter, between it and the chairs.
    const van = b.solids![1];
    expect(LABITCONF.COLS[0] - 0.12 - (van.x + van.hx)).toBeGreaterThan(0.3);
  });

  it('stands the solids inside the walls', () => {
    for (const s of b.solids!) {
      expect(s.x - s.hx).toBeGreaterThanOrEqual(-LABITCONF.W / 2 + LABITCONF.T - 1e-6);
      expect(s.x + s.hx).toBeLessThanOrEqual(LABITCONF.W / 2 - LABITCONF.T + 1e-6);
      expect(s.z - s.hz).toBeGreaterThanOrEqual(-LABITCONF.D + LABITCONF.T - 1e-6);
    }
  });

  it('hangs the LED wall over the stage, inside the hall, facing the audience', () => {
    const s = b.screen;
    expect(s.name).toBe('labitconf-screen');
    // On the back wall's inner face, within the side walls.
    expect(s.position.z).toBeGreaterThan(-LABITCONF.D + LABITCONF.T);
    expect(Math.abs(s.position.x) + LABITCONF.SCREEN_W / 2).toBeLessThan(LABITCONF.W / 2 - LABITCONF.T);
    s.updateMatrixWorld(true);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(s.matrixWorld);
    expect(normal.z).toBeCloseTo(1, 5);
    // Above the heads of the panel sitting on the stage.
    expect(s.position.y - LABITCONF.SCREEN_H / 2).toBeGreaterThan(LABITCONF.STAGE_TOP + 0.6);
    expect(s.position.y + LABITCONF.SCREEN_H / 2).toBeLessThan(LABITCONF.H);
  });

  it('keeps the LED wall its own mesh when the building is merged', () => {
    const g = b.group;
    const moving = findDynamic(g, (mark) => {
      for (const t of [0.4, 2.9]) { b.update?.(0.016, t); mark(); }
      b.setNight(1, 1); mark();
      b.interior?.setDoor(1); mark();
      b.interior?.setInside(true); mark();
      b.interior?.setInside(false); b.interior?.setDoor(0); b.setNight(0, 1);
    });
    mergeStatic(g, (m) => moving.has(m) || m.name === 'roof' || m.name === 'labitconf-screen');
    let screens = 0;
    g.traverse((o) => { if (o.name === 'labitconf-screen') screens++; });
    expect(screens).toBe(1);
    expect(b.screen.parent).toBe(g);
  });

  it('adds one light (the room’s): the obelisk and the spots glow without their own', () => {
    let lights = 0;
    b.group.traverse((o) => { if ((o as THREE.Light).isLight) lights++; });
    expect(lights).toBe(1);
  });

  it('takes a big slot of its own, overhanging it but clear of every other slot and the water', () => {
    const plan = planIsland();
    const track = trackSite(plan);
    const free = plan.slots.filter((s) => !track || !onTrack(s.pos, track, s.w * 0.7 + 0.6));
    const held = reserveLandmarkSlots(free, plan.plaza.c);
    const s = held.get('labitconf')!;
    expect(s).toBeTruthy();
    expect(s.w).toBeGreaterThanOrEqual(3);
    const d = LANDMARKS.find((x) => x.id === 'labitconf')!;
    const f = d.footprint;
    // The walls sit inside the footprint.
    expect(f.minX).toBeLessThanOrEqual(-LABITCONF.W / 2);
    expect(f.maxX).toBeGreaterThanOrEqual(LABITCONF.W / 2);
    expect(f.minZ).toBeLessThanOrEqual(-LABITCONF.D);
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    const toWorld = (x: number, z: number) => ({ x: s.pos.x + sn * d.forward + x * c + z * sn, z: s.pos.z + c * d.forward - x * sn + z * c });
    const corners = [[f.minX, f.minZ], [f.maxX, f.minZ], [f.minX, f.maxZ], [f.maxX, f.maxZ]].map(([x, z]) => toWorld(x, z));
    for (const o of plan.slots) {
      if (o.index === s.index) continue;
      for (const p of corners) expect(Math.max(Math.abs(p.x - o.pos.x), Math.abs(p.z - o.pos.z))).toBeGreaterThan(o.w / 2 + 0.3);
    }
    // Off the pond and the river banks, and the lawn under the whole floor sunk below it (world.ts footprints).
    const river = smoothRiver(plan);
    // As world.ts sinks it: a slot's square, or all of a landmark that overhangs it.
    const reach = Math.hypot(Math.max(-f.minX, f.maxX), Math.max(-(f.minZ + d.forward), f.maxZ + d.forward)) + 0.5;
    const height = terrainHeight(plan, river, plan.slots.map((o) => ({ pos: o.pos, r: Math.max(o.w * 0.8 + 1.0, o.index === s.index ? reach : 0) })));
    for (let x = f.minX; x <= f.maxX; x += 0.1) for (let z = f.minZ; z <= f.maxZ; z += 0.1) {
      const p = toWorld(x, z);
      // Past the pond's bank (it dips within pond.r + 0.5).
      expect(Math.hypot(p.x - plan.pond.c.x, p.z - plan.pond.c.z)).toBeGreaterThan(plan.pond.r + 0.65);
      // Past the river's banks (the bed dips within riverWidth·0.62 + 0.3 of its line), with room to walk by.
      expect(distToPolyline(p, river)).toBeGreaterThan(plan.riverWidth * 0.62 + 0.3 + 0.5);
      expect(height(p)).toBeLessThan(LABITCONF_FLOOR);
    }
  });

  it('is bigger than the theater, with a wide stage for a panel of five', () => {
    expect(LABITCONF.W * LABITCONF.D).toBeGreaterThan(3.4 * 3.2);
    expect(LABITCONF.STAGE_X1 - LABITCONF.STAGE_X0).toBeGreaterThanOrEqual(2.2);
    expect(-LABITCONF.STAGE_Z - LABITCONF.D + LABITCONF.T).toBeLessThan(-0.7);
    expect(LABITCONF.PANEL).toHaveLength(5);
    for (const x of LABITCONF.PANEL) {
      expect(x - 0.1).toBeGreaterThan(LABITCONF.STAGE_X0);
      expect(x + 0.1).toBeLessThan(LABITCONF.STAGE_X1);
    }
  });
});

describe('La Bitcoineta', () => {
  it('is a van at people’s scale, standing on its wheels, orange and white', () => {
    const v = buildBitcoineta();
    const box = new THREE.Box3().setFromObject(v);
    expect(box.min.y).toBeCloseTo(0, 2);
    const size = box.getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(1.5);
    expect(size.z).toBeLessThan(2);
    expect(size.y).toBeLessThan(LABITCONF.H - 0.6);
    const colours = new Set<number>();
    v.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      for (const x of Array.isArray(m) ? m : m ? [m] : []) if ((x as THREE.MeshStandardMaterial).color) colours.add((x as THREE.MeshStandardMaterial).color.getHex());
    });
    expect(colours.has(new THREE.Color(0xf2a516).getHex())).toBe(true);
    expect(colours.has(new THREE.Color(0xf7f3ea).getHex())).toBe(true);
  });
});
