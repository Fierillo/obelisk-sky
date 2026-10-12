// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { buildParrilla, parrillaGround, BRASERO, PARRILLA } from './parrilla';

vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

describe('the parrilla', () => {
  const b = buildParrilla();

  it('has brick walls on both sides as well as the back', () => {
    const sides = b.solids!.filter((s) => s.top > 1 && Math.abs(s.x) > PARRILLA.W / 2 - 0.15);
    expect(sides.map((s) => Math.sign(s.x)).sort()).toEqual([-1, 1]);
  });

  it('keeps a brasero in the corner, its coals on it and under the grate', () => {
    const coals = b.group.children.find((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).count === 34) as THREE.InstancedMesh;
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    let inCorner = 0;
    for (let i = 0; i < coals.count; i++) {
      coals.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      if (Math.abs(p.x - BRASERO.x) < BRASERO.hx && Math.abs(p.z - BRASERO.z) < BRASERO.hz) inCorner++;
    }
    expect(inCorner).toBeGreaterThanOrEqual(12);
    expect(b.solids!.some((s) => s.x === BRASERO.x && s.z === BRASERO.z)).toBe(true);
  });

  it('stands the benches on legs that reach the floor', () => {
    const legs = b.group.children.filter((o) => o.name === 'bench-leg');
    expect(legs).toHaveLength(8);
    const box = new THREE.Box3();
    for (const l of legs) {
      box.setFromObject(l);
      expect(box.min.y).toBeCloseTo(PARRILLA.FLOOR, 3);
      expect(box.max.y).toBeLessThanOrEqual(0.1626);
    }
  });

  it('lays a fork and a knife at every place', () => {
    for (const n of ['forks', 'knives']) expect((b.group.getObjectByName(n) as THREE.InstancedMesh).count).toBe(b.seats!.length);
  });

  it('raises the ground to the tiles, without a ledge', () => {
    expect(parrillaGround({ x: 0, z: -0.6 })).toBeCloseTo(PARRILLA.FLOOR, 5);
    expect(parrillaGround({ x: 0, z: 1 })).toBe(0);
    let last = parrillaGround({ x: 0, z: 0.5 });
    for (let z = 0.5; z > -0.3; z -= 0.01) {
      const h = parrillaGround({ x: 0, z });
      expect(Math.abs(h - last)).toBeLessThan(0.0051);
      last = h;
    }
  });
});
