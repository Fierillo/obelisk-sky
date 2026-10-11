// A campfire to hang out round (under a voice channel's tree, ombu.ts): a
// ring of stones, crossed logs, flickering flames and a warm light; and the
// marshmallow on a stick people hold over it (world.ts gives it to whoever
// sits at the fire; Character.holdProp roasts and eats it).

import * as THREE from 'three';

export interface Campfire {
  group: THREE.Group;
  /** Flames flicker and the light breathes; `night` 0..1 brightens it. */
  update(t: number, night: number): void;
}

export function buildCampfire(seed = 1): Campfire {
  const g = new THREE.Group();
  g.name = 'campfire';
  const flat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...extra });
  const stone = flat(0x8a8580), log = flat(0x6b4a33), ember = flat(0x3a1c10, { emissive: 0xff5a1a, emissiveIntensity: 0.6 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06 + ((i * 7 + seed) % 3) * 0.008, 0), stone);
    s.position.set(Math.cos(a) * 0.24, 0.035, Math.sin(a) * 0.24);
    s.castShadow = true;
    g.add(s);
  }
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.34, 6), log);
    l.rotation.z = Math.PI / 2 - 0.35;
    l.rotation.y = (i / 3) * Math.PI;
    l.position.y = 0.07;
    l.castShadow = true;
    g.add(l);
  }
  const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 10), ember);
  bed.position.y = 0.02;
  g.add(bed);
  // Flames: three cones of fire colour that flicker out of step.
  const flames: THREE.Mesh[] = [];
  const colors = [0xffd27a, 0xff9a3a, 0xff6a1a];
  colors.forEach((c, i) => {
    const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9 - i * 0.15, depthWrite: false });
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.09 - i * 0.015, 0.34 - i * 0.05, 7), m);
    f.position.set(Math.cos(i * 2.1) * 0.04, 0.2, Math.sin(i * 2.1) * 0.04);
    g.add(f);
    flames.push(f);
  });
  const light = new THREE.PointLight(0xff8a3a, 0.6, 3.6, 1.6);
  light.position.y = 0.35;
  g.add(light);
  return {
    group: g,
    update(t, night) {
      flames.forEach((f, i) => {
        const k = 1 + Math.sin(t * (7 + i * 2.3) + i * 1.7) * 0.18 + Math.sin(t * (13 + i) + i) * 0.08;
        f.scale.set(1 / Math.sqrt(k), k, 1 / Math.sqrt(k));
        f.position.y = 0.17 * k;
        f.rotation.y = t * (0.6 + i * 0.3);
      });
      light.intensity = (0.5 + night * 1.4) * (1 + Math.sin(t * 11) * 0.08 + Math.sin(t * 17.3) * 0.05);
    },
  };
}

/** A marshmallow on a long stick, held at the near end; its far end (the
 *  marshmallow) is `userData.mouth` for eating, and it roasts golden. */
export function buildMarshmallow(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'marshmallow';
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.42, 5), new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 }));
  // Along +z (forward, toward the fire), from the hand.
  stick.rotation.x = Math.PI / 2;
  stick.position.z = 0.21;
  g.add(stick);
  const mallow = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.04, 10), new THREE.MeshStandardMaterial({ color: 0xf0d9a8, emissive: 0x6a2a00, emissiveIntensity: 0.15, roughness: 0.6 }));
  mallow.rotation.x = Math.PI / 2;
  mallow.position.z = 0.41;
  g.add(mallow);
  g.userData.mouth = new THREE.Vector3(0, 0, 0.41);
  g.userData.roast = true;
  return g;
}
