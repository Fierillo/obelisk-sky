// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { mergeStatic } from './merge';

const meshes = (o: THREE.Object3D) => { const out: THREE.Mesh[] = []; o.traverse((x) => { if ((x as THREE.Mesh).isMesh) out.push(x as THREE.Mesh); }); return out; };
const worldBox = (o: THREE.Object3D) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };

describe('merging static pieces', () => {
  it('folds pieces sharing a material into one mesh, in the same place', () => {
    const root = new THREE.Group();
    root.position.set(5, 0, -2);
    root.rotation.y = 0.7;
    const wood = new THREE.MeshStandardMaterial(), stone = new THREE.MeshStandardMaterial();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 6; i++) {
      const sub = new THREE.Group();
      sub.position.set(i, 0, 0);
      const m = new THREE.Mesh(geo, i % 2 ? wood : stone);
      m.position.y = i * 0.5;
      m.castShadow = true;
      sub.add(m);
      root.add(sub);
    }
    const before = worldBox(root);
    expect(mergeStatic(root)).toBe(4);
    const ms = meshes(root);
    expect(ms).toHaveLength(2);
    expect(new Set(ms.map((m) => m.material))).toEqual(new Set([wood, stone]));
    expect(ms.every((m) => m.castShadow)).toBe(true);
    const after = worldBox(root);
    expect(after.min.distanceTo(before.min)).toBeLessThan(1e-6);
    expect(after.max.distanceTo(before.max)).toBeLessThan(1e-6);
  });

  it('leaves alone what must stay separate: kept, hidden, mirrored, instanced', () => {
    const root = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const roof = new THREE.Mesh(geo, mat); roof.name = 'roof';
    const hiddenWin = new THREE.Mesh(geo, mat); hiddenWin.visible = false;
    const mirrored = new THREE.Mesh(geo, mat); mirrored.scale.x = -1;
    const inst = new THREE.InstancedMesh(geo, mat, 3);
    const a = new THREE.Mesh(geo, mat), b = new THREE.Mesh(geo, mat);
    b.position.x = 2;
    root.add(roof, hiddenWin, mirrored, inst, a, b);
    expect(mergeStatic(root, (m) => m.name === 'roof')).toBe(1);
    expect(roof.parent).toBe(root);
    expect(hiddenWin.parent).toBe(root);
    expect(mirrored.parent).toBe(root);
    expect(inst.parent).toBe(root);
    expect(a.parent).toBeNull();
  });
});

describe('finding what moves', () => {
  it('reports meshes a hook moves, hides or unshadows, and everything under a moving node', async () => {
    const { findDynamic } = await import('./merge');
    const root = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial();
    const box = () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    const still = box(), spun = box(), hidden = box(), wall = box();
    const door = new THREE.Group();
    const leaf = box(), knob = box();
    door.add(leaf, knob);
    wall.castShadow = true;
    root.add(still, spun, hidden, wall, door);
    const moving = findDynamic(root, () => {
      spun.rotation.y = 1;
      hidden.visible = false;
      wall.castShadow = false;
      door.rotation.y = 1.4;
      mat.opacity = 0.3; // a material change is shared, merged or not
    });
    expect(moving.has(still)).toBe(false);
    for (const m of [spun, hidden, wall, leaf, knob]) expect(moving.has(m)).toBe(true);
  });

  it('keeps every landmark whole: what it animates stays out of the merge', async () => {
    const { findDynamic } = await import('./merge');
    const { LANDMARKS } = await import('./landmarks');
    const { vi } = await import('vitest');
    // jsdom has no canvas: a 2D context that takes every call and draws nothing.
    const noop: unknown = new Proxy(() => noop, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 0 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : noop), set: () => true, apply: () => noop });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noop as never);
    for (const d of LANDMARKS) {
      const b = d.build();
      const poke = () => {
        for (const t of [0.4, 2.9, 7.3, 13.1]) b.update?.(0.016, t);
        b.setNight(1, 1);
        b.interior?.setDoor(1);
        b.interior?.setInside(true);
        b.pulse?.();
        b.update?.(0.5, 17);
        b.interior?.setInside(false);
        b.interior?.setDoor(0);
        b.setNight(0, 1);
      };
      const moving = findDynamic(b.group, poke);
      const before = meshes(b.group).length;
      mergeStatic(b.group, (m) => moving.has(m) || m.name === 'roof');
      expect(meshes(b.group).length).toBeLessThan(before);
      // Every mesh the hooks still move survived the merge.
      for (const m of moving) if ((m as THREE.Mesh).isMesh) expect(m.parent).not.toBeNull();
      // And the hooks still run on what's left.
      expect(poke).not.toThrow();
    }
  });
});
