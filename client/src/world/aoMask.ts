// What ambient occlusion must not see. GTAO renders the scene once more with
// a normal material in place of every material: a sprite then becomes an
// opaque square (it isn't billboarded, its alpha is gone) that writes depth,
// and the AO darkens a square outline round every halo, badge and glow.
// GTAO itself only hides points and lines.

import * as THREE from 'three';

/** True for objects GTAO's normal/depth pass should skip. */
export function hiddenFromAo(o: THREE.Object3D): boolean {
  const any = o as THREE.Object3D & { isSprite?: boolean; isPoints?: boolean; isLine?: boolean; isLine2?: boolean; material?: THREE.Material | THREE.Material[] };
  if (any.isSprite || any.isPoints || any.isLine || any.isLine2) return true;
  const mat = any.material;
  if (!mat || Array.isArray(mat)) return false;
  // Glows and see-through overlays: drawn without depth, or added on top.
  return mat.transparent && (!mat.depthWrite || mat.blending === THREE.AdditiveBlending);
}

/** Make `pass` (a GTAOPass) hide everything `hiddenFromAo` names while it draws normals. */
export function maskAo(pass: { scene: THREE.Scene; _visibilityCache: THREE.Object3D[] }): void {
  (pass as unknown as { _overrideVisibility: () => void })._overrideVisibility = function () {
    const cache = pass._visibilityCache;
    pass.scene.traverse((o) => {
      if (o.visible && hiddenFromAo(o)) { o.visible = false; cache.push(o); }
    });
  };
}
