import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { hiddenFromAo, maskAo } from './aoMask';

describe('what ambient occlusion skips', () => {
  it('skips sprites, glows and lines, keeps solid and glass meshes', () => {
    const geo = new THREE.BoxGeometry();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    const halo = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending }));
    const overlay = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    const glass = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 }));
    const wall = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
    expect([sprite, halo, overlay, line].map(hiddenFromAo)).toEqual([true, true, true, true]);
    expect([glass, wall].map(hiddenFromAo)).toEqual([false, false]);
  });

  it('hides them during the pass and lets the pass restore them', () => {
    const scene = new THREE.Scene();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    const wall = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    scene.add(sprite, wall);
    const pass = { scene, _visibilityCache: [] as THREE.Object3D[] };
    maskAo(pass);
    (pass as unknown as { _overrideVisibility(): void })._overrideVisibility();
    expect(sprite.visible).toBe(false);
    expect(wall.visible).toBe(true);
    expect(pass._visibilityCache).toEqual([sprite]);
  });
});
