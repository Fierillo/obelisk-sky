// Fewer draw calls for things that never move: a channel's house is dozens of
// little Kenney pieces (walls, trims, doors), each drawn up to three times a
// frame (shadow, ambient occlusion, colour). Merging the pieces that share a
// material into one mesh draws the same house in a handful of calls.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merge `root`'s static meshes that share a material (and shadow flags) into
 * one mesh each, in `root`'s own frame. `keep` names meshes that must stay
 * separate (they move, hide or change on their own). Returns how many meshes
 * were folded away.
 */
export function mergeStatic(root: THREE.Object3D, keep: (m: THREE.Mesh) => boolean = () => false): number {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; meshes: THREE.Mesh[] }>();
  const hidden = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (!p.visible) return true; return false; };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    if (Array.isArray(m.material) || hidden(m) || keep(m)) return;
    const g = m.geometry;
    if (Object.keys(g.morphAttributes).length) return;
    // Quantised positions (int16, normalised) can't take a baked transform.
    if (!(g.attributes.position?.array instanceof Float32Array)) return;
    // A mirrored piece would turn inside out once baked: leave it be.
    if (m.matrixWorld.determinant() < 0) return;
    const attrs = Object.keys(g.attributes).sort().map((k) => `${k}${g.attributes[k].itemSize}${(g.attributes[k] as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute ? 'x' : ''}`).join(',');
    const key = `${m.material.uuid}|${attrs}|${g.index ? 'i' : 'n'}|${m.castShadow}|${m.receiveShadow}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: m.material, cast: m.castShadow, recv: m.receiveShadow, meshes: [] }));
    b.meshes.push(m);
  });
  let folded = 0;
  const local = new THREE.Matrix4();
  for (const b of buckets.values()) {
    if (b.meshes.length < 2 || b.meshes.some((m) => Object.keys(m.geometry.attributes).some((k) => (m.geometry.attributes[k] as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute))) continue;
    // One material per mesh: draw groups don't matter once merged.
    const geos = b.meshes.map((m) => { const g = m.geometry.clone().applyMatrix4(local.multiplyMatrices(inv, m.matrixWorld)); g.clearGroups(); return g; });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.name = 'merged';
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    root.add(mesh);
    for (const m of b.meshes) m.removeFromParent();
    folded += b.meshes.length - 1;
  }
  return folded;
}
