// A voice channel's place: a great shade tree (an ombú) with chairs round
// its trunk, where the people in the call sit together. The plaza's benches
// stand round the one nearest the plaza (world.ts `placeBenches`).

import * as THREE from 'three';
import { rng, type Vec2 } from './layout';

export interface TreeSeat {
  /** Local to the slot (door side, +z). */
  pos: Vec2;
  face: number;
  y: number;
}

export interface VoiceTree {
  group: THREE.Group;
  /** The chairs round the trunk, facing out. */
  seats: TreeSeat[];
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

  // Chairs round the trunk, backs to it, facing out.
  const seats: TreeSeat[] = [];
  const chairR = trunkR + 0.42 * k;
  const n = w >= 2 ? 8 : 5;
  const wood = flat(0x8a5a33), cushion = flat(accent);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    const pos = { x: Math.cos(a) * chairR, z: Math.sin(a) * chairR };
    const face = Math.atan2(Math.cos(a), Math.sin(a));
    group.add(chair(pos, face, wood, cushion));
    seats.push({ pos, face, y: 0.2 });
  }

  // Bench places: an outer ring on the yard side, facing the tree.
  const benchR = Math.min(w * 0.5 + 0.35, crown * 1.05);
  const benchSpots = [-0.95, 0, 0.95].map((da) => {
    const a = Math.PI / 2 + da;
    return { pos: { x: Math.cos(a) * benchR, z: Math.sin(a) * benchR }, face: Math.atan2(-Math.cos(a), -Math.sin(a)) };
  });
  return { group, seats, benchSpots, trunkR: trunkR * 1.45, height: 2.6 * k };
}

/** A small wooden chair at `pos` facing `face`, its seat 0.2 up. */
function chair(pos: Vec2, face: number, wood: THREE.Material, cushion: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.position.set(pos.x, 0, pos.z);
  g.rotation.y = face;
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    b.castShadow = true;
    g.add(b);
  };
  box(0.2, 0.025, 0.2, wood, 0, 0.18, 0);
  box(0.19, 0.02, 0.19, cushion, 0, 0.2, 0);
  box(0.2, 0.2, 0.025, wood, 0, 0.3, -0.09);
  for (const [x, z] of [[-0.085, -0.085], [0.085, -0.085], [-0.085, 0.085], [0.085, 0.085]]) box(0.025, 0.18, 0.025, wood, x, 0.09, z);
  return g;
}
