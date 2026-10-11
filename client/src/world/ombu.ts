// A voice channel's place: a great shade tree (an ombú) with a campfire in
// the clearing in front, logs round it where people sit, roast marshmallows
// and talk (the people in the call gather there). The plaza's benches stand
// round the fire of the tree nearest the plaza (world.ts `placeBenches`).

import * as THREE from 'three';
import { rng, type Vec2 } from './layout';
import { buildCampfire, type Campfire } from './campfire';

export interface TreeSeat {
  /** Local to the slot (door side, +z). */
  pos: Vec2;
  face: number;
  y: number;
  /** What you hold there: a marshmallow over the fire. */
  prop: 'marshmallow';
}

export interface VoiceTree {
  group: THREE.Group;
  /** The logs round the fire, facing it. */
  seats: TreeSeat[];
  /** The fire (flickers in `update`). */
  fire: Campfire;
  update(t: number, night: number): void;
  /** Where benches can stand, facing the tree (local). */
  benchSpots: { pos: Vec2; face: number }[];
  /** The trunk: the only thing you can't walk through (local centre 0,0). */
  trunkR: number;
  height: number;
}

const flat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });

/** The tree for a slot `w` wide; chairs' cushions in the channel's colour. */
export function buildVoiceTree(w: number, accent: number, seed = 1): VoiceTree {
  const group = new THREE.Group();
  group.name = 'voice-tree';
  const r = rng(seed);
  const k = Math.min(1.25, 0.65 + w * 0.25); // grows with the plot
  const bark = flat(0x6b4a33), barkDark = flat(0x553926);
  const greens = [0x3f8f4a, 0x4a9a52, 0x367f41, 0x55a35a].map(flat);

  // Trunk, a buttress of roots, and the main limbs.
  const trunkR = 0.24 * k;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.8, trunkR * 1.25, 1.55 * k, 9), bark);
  trunk.position.y = 0.775 * k;
  trunk.castShadow = true;
  group.add(trunk);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r() * 0.4;
    const root = new THREE.Mesh(new THREE.BoxGeometry(0.1 * k, 0.16 * k, 0.42 * k), barkDark);
    root.position.set(Math.cos(a) * trunkR * 1.3, 0.06 * k, Math.sin(a) * trunkR * 1.3);
    root.rotation.y = -a + Math.PI / 2;
    root.rotation.x = 0.25;
    root.castShadow = true;
    group.add(root);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * k, 0.1 * k, 0.9 * k, 6), bark);
    limb.position.set(Math.cos(a) * 0.28 * k, 1.65 * k, Math.sin(a) * 0.28 * k);
    limb.rotation.set(Math.sin(a) * 0.75, 0, -Math.cos(a) * 0.75);
    limb.castShadow = true;
    group.add(limb);
  }
  // A wide, low canopy of leafy clumps: shade over the chairs.
  const crown = 1.15 * k;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r();
    const d = i === 0 ? 0 : crown * (0.45 + r() * 0.45);
    const clump = new THREE.Mesh(new THREE.IcosahedronGeometry((0.5 + r() * 0.25) * k, 0), greens[i % greens.length]);
    clump.position.set(Math.cos(a) * d, (2.05 + r() * 0.45 - d * 0.18) * k, Math.sin(a) * d);
    clump.scale.y = 0.62;
    clump.rotation.y = r() * 3;
    clump.castShadow = true;
    group.add(clump);
  }
  // Packed earth under it, where people have sat for years.
  const ground = new THREE.Mesh(new THREE.CircleGeometry(crown * 1.15, 24), flat(0xa98d68));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.012;
  ground.receiveShadow = true;
  group.add(ground);

  // The campfire, in the clearing in front of the trunk.
  const fire = buildCampfire(seed);
  const fc = { x: 0, z: trunkR + 0.75 * k };
  fire.group.position.set(fc.x, 0, fc.z);
  group.add(fire.group);
  // Logs round it, facing the flames; none on the trunk's side.
  const seats: TreeSeat[] = [];
  const logR = 0.62;
  const logMat = flat(0x7a5236), cut = flat(0xc8a274);
  const n = w >= 2 ? 6 : 4;
  for (let i = 0; i < n; i++) {
    // Round the fire from −30° to 210° (from +x; the trunk is at −90°).
    const ang = (-30 + (240 * i) / (n - 1)) * (Math.PI / 180);
    const pos = { x: fc.x + Math.cos(ang) * logR, z: fc.z + Math.sin(ang) * logR };
    const face = Math.atan2(fc.x - pos.x, fc.z - pos.z);
    const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.36, 8), logMat);
    lg.rotation.z = Math.PI / 2;
    lg.rotation.y = -face;
    lg.position.set(pos.x, 0.08, pos.z);
    lg.castShadow = lg.receiveShadow = true;
    group.add(lg);
    for (const s of [-1, 1]) {
      const end = new THREE.Mesh(new THREE.CircleGeometry(0.074, 8), cut);
      end.position.set(pos.x + Math.cos(face) * 0.181 * s, 0.08, pos.z - Math.sin(face) * 0.181 * s);
      end.rotation.y = -face + (s > 0 ? Math.PI / 2 : -Math.PI / 2);
      group.add(end);
    }
    seats.push({ pos, face, y: 0.16, prop: 'marshmallow' });
  }
  void accent;

  // Bench places: an outer ring round the fire on the yard side, facing it.
  const benchR = logR + 0.55;
  const benchSpots = [-0.95, 0, 0.95].map((da) => {
    const a = Math.PI / 2 + da;
    const pos = { x: fc.x + Math.cos(a) * benchR, z: fc.z + Math.sin(a) * benchR };
    return { pos, face: Math.atan2(fc.x - pos.x, fc.z - pos.z) };
  });
  return { group, seats, benchSpots, fire, update: (t, night) => fire.update(t, night), trunkR: trunkR * 1.45, height: 2.6 * k };
}
