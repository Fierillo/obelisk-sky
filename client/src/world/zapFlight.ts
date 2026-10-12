// A zap flying from one person to another: a glowing bolt with a short trail
// of sparks along an arc, and a burst of coins where it lands. Every zap
// shares one texture, sprite material, coin geometry and material, so a
// burst of zaps costs a handful of sprites and nothing to compile.

import * as THREE from 'three';
import { canvasTexture } from './landmarks/signs';

/** Seconds a zap is in the air over `dist` metres. */
export function flightTime(dist: number): number {
  return Math.min(2.2, Math.max(0.7, dist / 7));
}

/** Where the bolt is at `k` (0..1) between `a` and `b`: a lob whose height grows with the distance. */
export function arcPoint(a: THREE.Vector3, b: THREE.Vector3, k: number, out = new THREE.Vector3()): THREE.Vector3 {
  const lift = Math.min(3, 0.6 + a.distanceTo(b) * 0.25);
  return out.copy(a).lerp(b, k).setY(a.y + (b.y - a.y) * k + Math.sin(Math.PI * k) * lift);
}

/** How many coins burst out for `sats`. */
export function coinCount(sats: number): number {
  return Math.min(24, 6 + Math.round(Math.log10(Math.max(sats, 1)) * 5));
}

let shared: { bolt: THREE.SpriteMaterial; spark: THREE.SpriteMaterial; coinGeo: THREE.BufferGeometry; coinMat: THREE.MeshStandardMaterial } | null = null;

export function zapAssets() {
  if (!shared) {
    const map = canvasTexture(64, 64, (g) => {
      const glow = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      glow.addColorStop(0, 'rgba(255,240,150,0.95)');
      glow.addColorStop(0.45, 'rgba(255,200,60,0.45)');
      glow.addColorStop(1, 'rgba(255,170,0,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#fff6c0';
      g.beginPath();
      for (const [x, y] of [[36, 8], [20, 35], [31, 35], [26, 56], [45, 27], [34, 27], [40, 8]]) g.lineTo(x, y);
      g.closePath();
      g.fill();
    });
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;
    shared = {
      bolt: new THREE.SpriteMaterial({ map, color: 0xffe680, ...add }),
      spark: new THREE.SpriteMaterial({ map, color: 0xffb030, opacity: 0.7, ...add }),
      coinGeo: new THREE.CylinderGeometry(0.06, 0.06, 0.015, 10),
      coinMat: new THREE.MeshStandardMaterial({ color: 0xffc83d, emissive: 0xffa000, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 }),
    };
  }
  return shared;
}
