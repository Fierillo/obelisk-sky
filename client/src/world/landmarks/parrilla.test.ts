// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { buildParrilla, parrillaGround, roofTopAt, ASADOR, BRASERO, GRILL, PARRILLA, ROOF } from './parrilla';

vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

describe('the parrilla', () => {
  const b = buildParrilla();

  it('has no side walls: the only tall solid is the asador itself', () => {
    const tall = b.solids!.filter((s) => s.top > 1);
    expect(tall).toEqual([{ x: 0, z: ASADOR.z, hx: ASADOR.hx, hz: ASADOR.hz, top: ASADOR.top }]);
  });

  it('splits the inside of the asador: the brasero in the left quarter, the grill over the rest', () => {
    const inner = ASADOR.hx - ASADOR.jamb;
    expect(BRASERO.x - BRASERO.hx).toBeCloseTo(-inner, 5);
    expect(BRASERO.hx * 2).toBeCloseTo(inner * 2 * 0.25, 5);
    expect(GRILL.x - GRILL.hx).toBeGreaterThan(BRASERO.x + BRASERO.hx);
    expect(GRILL.x + GRILL.hx).toBeLessThanOrEqual(inner);
    expect(GRILL.y).toBeGreaterThan(BRASERO.top);
  });

  it('keeps the brasero inside the asador, its coals on it and under the grate', () => {
    const coals = b.group.children.find((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).count === 34) as THREE.InstancedMesh;
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    let inCorner = 0;
    for (let i = 0; i < coals.count; i++) {
      coals.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      if (Math.abs(p.x - BRASERO.x) < BRASERO.hx && Math.abs(p.z - BRASERO.z) < BRASERO.hz) inCorner++;
    }
    expect(inCorner).toBeGreaterThanOrEqual(12);
    expect(Math.abs(BRASERO.z - ASADOR.z) + BRASERO.hz).toBeLessThanOrEqual(ASADOR.hz);
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

  it('rests the roof on the posts, the two slopes closing at the ridge', () => {
    const under = (z: number) => roofTopAt(z) - ROOF.t / Math.cos(ROOF.pitch);
    expect(under(0.05)).toBeCloseTo(ROOF.postTop, 5);
    expect(under(-PARRILLA.D + 0.05)).toBeCloseTo(ROOF.postTop, 5);
    expect(roofTopAt(ROOF.ridgeZ)).toBeGreaterThan(roofTopAt(0));
    // Each slope's top face, as built, meets the ridge and drops to the eave.
    const slopes = b.group.children.filter((o) => (o as THREE.Mesh).isMesh && Math.abs(o.rotation.x - ROOF.pitch) < 1e-6 || Math.abs(o.rotation.x + ROOF.pitch) < 1e-6) as THREE.Mesh[];
    expect(slopes).toHaveLength(2);
    for (const sl of slopes) {
      sl.updateMatrixWorld(true);
      const len = (sl.geometry as THREE.BoxGeometry).parameters.depth;
      const s = Math.sign(sl.rotation.x);
      const top = (k: number) => new THREE.Vector3(0, ROOF.t / 2, k * len / 2).applyMatrix4(sl.matrix);
      const ridgeEnd = top(-s), eave = top(s);
      expect(ridgeEnd.z).toBeCloseTo(ROOF.ridgeZ, 4);
      expect(ridgeEnd.y).toBeCloseTo(roofTopAt(ROOF.ridgeZ), 4);
      expect(eave.y).toBeCloseTo(roofTopAt(eave.z), 4);
    }
  });

  it('puts the chimney out through the roof', () => {
    const chimney = b.group.children.find((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry instanceof THREE.BoxGeometry
      && ((o as THREE.Mesh).geometry as THREE.BoxGeometry).parameters.width === 0.24) as THREE.Mesh;
    const p = (chimney.geometry as THREE.BoxGeometry).parameters;
    expect(chimney.position.y + p.height / 2).toBeGreaterThan(roofTopAt(chimney.position.z) + 0.3);
    expect(chimney.position.z).toBeGreaterThan(ASADOR.z - ASADOR.hz);
  });
});
