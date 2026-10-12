// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { buildLibertureHouse, orbPosition, ringYaw, PILLARS, ROOF } from './liberture';
import { LANDMARKS } from './index';

// jsdom has no 2D canvas: the house draws its textures only when there is one.
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

describe('the Liberture house', () => {
  const b = buildLibertureHouse();
  const inRect = (p: { x: number; z: number }, r: { minX: number; maxX: number; minZ: number; maxZ: number }) =>
    p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;

  it('floats the six pillar orbs above the roof, in Liberture order', () => {
    const orbs = b.group.children.filter((o) => o.name.startsWith('orb:')) as THREE.Mesh[];
    expect(orbs.map((o) => o.name)).toEqual(PILLARS.map((p) => `orb:${p.id}`));
    orbs.forEach((o, i) => expect((o.material as THREE.MeshStandardMaterial).color.getHex()).toBe(PILLARS[i].color));
    for (let t = 0; t < 30; t += 0.7) {
      for (let i = 0; i < 6; i++) expect(orbPosition(i, t).y - 0.15).toBeGreaterThan(ROOF + 0.3);
    }
    b.update!(0.016, 4.2);
    orbs.forEach((o, i) => expect(o.position.distanceTo(orbPosition(i, 4.2))).toBeLessThan(1e-6));
  });

  it('stands them on an upright ring that swings like the nostr-wot graph', () => {
    for (const t of [0, 3.1, 7.7, 19]) {
      const yaw = ringYaw(t);
      // The ring's plane is vertical, facing (sin yaw, 0, cos yaw): every orb is on it.
      const n = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const p = [0, 1, 2, 3, 4, 5].map((i) => orbPosition(i, t));
      const c = p.reduce((s, q) => s.add(q), new THREE.Vector3()).multiplyScalar(1 / 6);
      for (const q of p) expect(Math.abs(q.clone().sub(c).dot(n))).toBeLessThan(1e-6);
      // Neighbours as far apart as the radius (a hexagon), give or take the bob.
      const r = p[0].distanceTo(c);
      for (let i = 0; i < 6; i++) expect(Math.abs(p[i].distanceTo(p[(i + 1) % 6]) - r)).toBeLessThan(0.07);
      // Upright: the ring spans height, not just width.
      expect(Math.max(...p.map((q) => q.y)) - Math.min(...p.map((q) => q.y))).toBeGreaterThan(0.8);
    }
    expect(Math.abs(ringYaw(6.3))).toBeGreaterThan(0.5);
  });

  it('puts every indoor seat and piece of furniture inside the room, the door in the doorway', () => {
    const [room, doorway] = b.interior!.rooms;
    for (const s of b.seats!) {
      expect(s.indoor).toBe(true);
      expect(inRect(s.pos, room)).toBe(true);
    }
    // Furniture may stand against the walls (the room is inset from them by 0.02).
    const walls = { minX: room.minX - 0.03, maxX: room.maxX + 0.03, minZ: room.minZ - 0.03, maxZ: room.maxZ + 0.03 };
    for (const s of b.solids!) {
      expect(inRect({ x: s.x - s.hx, z: s.z - s.hz }, walls)).toBe(true);
      expect(inRect({ x: s.x + s.hx, z: s.z + s.hz }, walls)).toBe(true);
    }
    expect(inRect(b.interior!.door, doorway)).toBe(true);
  });

  it('leaves a free path from the door to every seat', () => {
    // No solid sits on the straight walk in from the doorway to the room centre.
    for (const s of b.solids!) expect(Math.abs(s.x) > s.hx + 0.15 || s.z + s.hz < -0.6).toBe(true);
  });

  it('builds inside its footprint', () => {
    const f = LANDMARKS.find((d) => d.id === 'liberture')!.footprint;
    const box = new THREE.Box3();
    for (const o of b.group.children) {
      if (!(o instanceof THREE.Mesh) || o.name.startsWith('orb:')) continue;
      box.setFromObject(o);
      expect(box.min.x).toBeGreaterThanOrEqual(f.minX - 0.01);
      expect(box.max.x).toBeLessThanOrEqual(f.maxX + 0.01);
      expect(box.min.z).toBeGreaterThanOrEqual(f.minZ - 0.01);
    }
  });

  it('has a single light, dark by day', () => {
    const lights: THREE.Light[] = [];
    b.group.traverse((o) => { if (o instanceof THREE.PointLight || o instanceof THREE.SpotLight) lights.push(o); });
    expect(lights).toHaveLength(1);
    b.setNight(0, 0);
    expect(lights[0].intensity).toBe(0);
    b.setNight(1, 0);
    expect(lights[0].intensity).toBeGreaterThan(1);
  });
});
