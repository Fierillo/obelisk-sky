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
