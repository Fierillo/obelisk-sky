// Instanced static props: trees, flowers, rocks, cobbles. One InstancedMesh
// per (model, sub-mesh), so hundreds of trees cost a handful of draw calls.

import * as THREE from 'three';
import { loaded } from './assets';

interface Part { geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; local: THREE.Matrix4 }

const partsCache = new Map<string, Part[]>();

function partsOf(path: string): Part[] {
  let parts = partsCache.get(path);
  if (parts) return parts;
  parts = [];
  const g = loaded.get(path);
  if (g) {
    g.scene.updateMatrixWorld(true);
    g.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) parts!.push({ geometry: m.geometry, material: m.material, local: m.matrixWorld.clone() });
    });
  }
  partsCache.set(path, parts);
  return parts;
}

export class PropBatch {
  private items = new Map<string, THREE.Matrix4[]>();
  /** Instanced meshes that should sway in the wind (trees). */
  readonly swaying: THREE.InstancedMesh[] = [];

  add(path: string, x: number, y: number, z: number, rotY = 0, scale = 1, sx = 1): void {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(scale * sx, scale, scale),
    );
    let list = this.items.get(path);
    if (!list) this.items.set(path, (list = []));
    list.push(m);
  }

  build(parent: THREE.Object3D, opts: { castShadow?: boolean; sway?: (path: string) => boolean } = {}): void {
    const tmp = new THREE.Matrix4();
    for (const [path, mats] of this.items) {
      for (const part of partsOf(path)) {
        const inst = new THREE.InstancedMesh(part.geometry, part.material, mats.length);
        mats.forEach((m, i) => inst.setMatrixAt(i, tmp.multiplyMatrices(m, part.local)));
        inst.castShadow = opts.castShadow ?? true;
        inst.receiveShadow = true;
        inst.instanceMatrix.needsUpdate = true;
        inst.computeBoundingSphere();
        parent.add(inst);
        if (opts.sway?.(path)) this.swaying.push(inst);
      }
    }
  }
}
