// The gym: one channel's house becomes a glass-walled hall you can walk into,
// with a bench press, a squat rack and a curl spot in front of a mirror. Its
// machines are training stations like the park's (world.ts `stations`), so
// several people train at once, each on their own machine.

import * as THREE from 'three';
import type { ExerciseKind } from './anim/exercises';
import { bitcoinSign } from './landmarks/signs';
import type { Building } from './buildings';
import type { LandmarkInterior } from './landmarks';
import type { Slot, Vec2 } from './layout';
import type { District } from './layout';

/** Channel names that are a gym. */
export const GYM_RE = /\bgym\b|gimnasio|fitness|\bfit\b|crossfit|pesas|weights|musculaci|powerlift|halterof/i;

/** Which channel gets the gym: one named like a gym (La Crypta's first), else
 *  the first sports-district text channel. Needs a slot two wide or more. */
export function pickGymChannel(
  groups: readonly { id: string; name: string; kind: string }[],
  districtFor: (id: string) => District,
  slotWidth: (id: string) => number,
): string | null {
  const ok = groups.filter((g) => !g.kind.startsWith('voice') && slotWidth(g.id) >= 2);
  const named = ok.filter((g) => GYM_RE.test(g.name));
  return (named.find((g) => /crypta/i.test(g.name)) ?? named[0] ?? ok.find((g) => districtFor(g.id) === 'sports'))?.id ?? null;
}

/** A machine, in the hall's local frame (front wall, with the door, at +z). */
export interface GymStation {
  at: Vec2;
  /** Which way the person faces (atan2(dx, dz), local). */
  face: number;
  /** Bench height (lying), or 0 (standing). */
  grip: number;
  kinds: ExerciseKind[];
  /** The bar resting on the machine, hidden while someone lifts it. */
  rest?: THREE.Object3D;
  /** Where you step to and from the machine (local). */
  approach: Vec2;
}

export interface GymBuild extends Building {
  interior: LandmarkInterior;
  stations: GymStation[];
  /** Furniture (local, axis-aligned): bump into it, jump on it. */
  solids: { x: number; z: number; hx: number; hz: number; top: number }[];
  /** The floor inside, and a ramp up through the doorway (local). */
  groundAt(local: Vec2): number;
}

/** The bench's height: the person lies on it. */
export const BENCH_TOP = 0.2;

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });

/** A barbell along x, `len` long, plates at both ends. */
export function buildBarbell(len = 0.62, plateR = 0.07): THREE.Group {
  const g = new THREE.Group();
  const steel = mat(0xb9c0c8, { metalness: 0.8, roughness: 0.3 });
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, len, 8), steel);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  const plate = mat(0x1d1f24, { roughness: 0.6 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(plateR, plateR, 0.03, 16), plate);
    p.rotation.z = Math.PI / 2;
    p.position.x = s * (len / 2 - 0.06);
    p.castShadow = true;
    g.add(p);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(plateR * 0.45, plateR * 0.45, 0.034, 12), mat(0xb4f953, { emissive: 0x2a3a10 }));
    rim.rotation.z = Math.PI / 2;
    rim.position.x = p.position.x;
    g.add(rim);
  }
  return g;
}

export function buildGym(slot: Slot, roofColor: number): GymBuild {
  const group = new THREE.Group();
  group.position.set(slot.pos.x, 0, slot.pos.z);
  group.rotation.y = slot.rot;
  const W = slot.w, D = slot.d;
  const H = 1.25;
  const T = 0.08; // wall thickness
  const add = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => {
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    group.add(o);
    return o;
  };
  const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

  // Floor: concrete slab, black rubber tiles inside.
  add(box(W + 0.2, 0.14, D + 0.2, mat(0x9a948c)), 0, 0.03, 0);
  const rubber = add(box(W - 0.1, 0.02, D - 0.1, mat(0x24262b, { roughness: 1 })), 0, 0.105, 0);
  rubber.castShadow = false;
  const F = 0.115; // floor level inside

  // Walls: brick back wall with a mirror, glass sides and front on a low brick base.
  const brick = mat(0xa4553f, { roughness: 0.9 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.22, roughness: 0.18, metalness: 0.1, depthWrite: false });
  const frame = mat(0x2b2e34, { metalness: 0.5, roughness: 0.4 });
  const walls: THREE.Mesh[] = [];
  walls.push(add(box(W, H, T, brick), 0, F + H / 2, -D / 2 + T / 2));
  const mirror = add(box(W * 0.7, 0.62, 0.012, mat(0xdfe8ee, { metalness: 0.9, roughness: 0.2 })), 0, F + 0.55, -D / 2 + T + 0.007);
  mirror.castShadow = false;
  const DOOR = 0.62;
  const glassWall = (x: number, z: number, w: number, d: number) => {
    walls.push(add(box(w, 0.28, d, brick), x, F + 0.14, z));
    const pane = add(box(w, H - 0.28, d * 0.4, glass), x, F + 0.28 + (H - 0.28) / 2, z);
    pane.castShadow = false;
    walls.push(add(box(w, 0.05, d, frame), x, F + H - 0.025, z));
  };
  glassWall(-W / 2 + T / 2, 0, T, D);
  glassWall(W / 2 - T / 2, 0, T, D);
  const side = (W - DOOR) / 2;
  glassWall(-W / 2 + side / 2, D / 2 - T / 2, side, T);
  glassWall(W / 2 - side / 2, D / 2 - T / 2, side, T);
  // Sliding glass door.
  const door = add(box(DOOR, H - 0.05, 0.03, glass), 0, F + (H - 0.05) / 2, D / 2 - T / 2);
  door.castShadow = false;
  // "Bitcoin accepted here" stuck on the glass beside the door.
  const btc = add(bitcoinSign(), DOOR / 2 + 0.2, F + 0.72, D / 2 - T * 0.3 + 0.004);
  btc.castShadow = false;
  for (const x of [-W / 2, W / 2, -DOOR / 2, DOOR / 2]) walls.push(add(box(0.06, H, 0.06, frame), x, F + H / 2, D / 2 - T / 2));

  // Flat roof with a deep fascia in the channel's colour and a neon GYM sign.
  const roofParts: THREE.Object3D[] = [];
  const roof = add(box(W + 0.3, 0.12, D + 0.3, mat(0x3a3d44)), 0, F + H + 0.06, 0);
  roof.name = 'roof';
  roofParts.push(roof);
  roofParts.push(add(box(W + 0.34, 0.2, 0.06, mat(roofColor)), 0, F + H + 0.02, D / 2 + 0.15));
  const sign = gymSign();
  sign.position.set(0, F + H + 0.3, D / 2 + 0.12);
  group.add(sign);
  roofParts.push(sign);

  const solids: GymBuild['solids'] = [];
  const stations: GymStation[] = [];
  const steel = mat(0x8d969e, { metalness: 0.7, roughness: 0.35 });
  const pad = mat(0x15161a, { roughness: 0.8 });
  const accent = mat(0xb4f953, { roughness: 0.5 });

  // Bench press: the bench runs front to back, the lifter lies with the feet
  // toward the door; uprights at the head hold the bar.
  {
    const x = -W / 4 + 0.02, z = -D / 4 + 0.15;
    const g = new THREE.Group();
    g.position.set(x, F, z);
    group.add(g);
    const bench = box(0.2, 0.05, 0.78, pad);
    bench.position.set(0, BENCH_TOP - 0.025, -0.1);
    bench.castShadow = true;
    g.add(bench);
    for (const lz of [-0.4, 0.22]) {
      const leg = box(0.16, BENCH_TOP - 0.05, 0.05, steel);
      leg.position.set(0, (BENCH_TOP - 0.05) / 2, lz);
      g.add(leg);
    }
    for (const sx of [-1, 1]) {
      const up = box(0.035, 0.52, 0.035, steel);
      up.position.set(sx * 0.27, 0.26, -0.42);
      up.castShadow = true;
      g.add(up);
      const hook = box(0.05, 0.02, 0.06, accent);
      hook.position.set(sx * 0.27, 0.44, -0.4);
      g.add(hook);
    }
    const rest = buildBarbell(0.68);
    rest.position.set(0, 0.465, -0.38);
    g.add(rest);
    solids.push({ x, z: z - 0.1, hx: 0.12, hz: 0.42, top: F + BENCH_TOP });
    // The lifter's hips sit on the bench's front half; the head toward the uprights.
    // Grip: the bench top above the floor you stand on (the floor is raised ground).
    stations.push({ at: { x, z: z + 0.12 }, face: 0, grip: BENCH_TOP, kinds: ['benchpress'], rest, approach: { x: x + 0.3, z: z + 0.15 } });
  }

  // Squat rack: four posts and safety bars, facing the mirror.
  {
    const x = W / 4 - 0.02, z = -D / 4 + 0.05;
    const g = new THREE.Group();
    g.position.set(x, F, z);
    group.add(g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const post = box(0.04, 1.0, 0.04, steel);
      post.position.set(sx * 0.3, 0.5, sz * 0.22);
      post.castShadow = true;
      g.add(post);
    }
    for (const sz of [-1, 1]) {
      const top = box(0.64, 0.04, 0.04, steel);
      top.position.set(0, 1.0, sz * 0.22);
      g.add(top);
    }
    for (const sx of [-1, 1]) {
      const safety = box(0.04, 0.03, 0.5, accent);
      safety.position.set(sx * 0.3, 0.3, 0);
      g.add(safety);
    }
    const rest = buildBarbell(0.72, 0.08);
    rest.position.set(0, 0.58, -0.2);
    g.add(rest);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) solids.push({ x: x + sx * 0.3, z: z + sz * 0.22, hx: 0.04, hz: 0.04, top: F + 1.0 });
    stations.push({ at: { x, z: z + 0.02 }, face: Math.PI, grip: 0, kinds: ['squat'], rest, approach: { x, z: z + 0.5 } });
  }

  // Dumbbell rack along the back wall, and a curl spot in front of the mirror.
  {
    const z = -D / 2 + T + 0.16;
    const rack = add(box(W * 0.5, 0.05, 0.18, steel), 0, F + 0.24, z);
    rack.castShadow = true;
    for (const lx of [-W * 0.23, W * 0.23]) add(box(0.04, 0.24, 0.16, steel), lx, F + 0.12, z);
    const bell = mat(0x1d1f24, { roughness: 0.55 });
    const n = Math.max(4, Math.round(W * 3));
    for (let i = 0; i < n; i++) {
      const lx = -W * 0.22 + (W * 0.44 * i) / (n - 1);
      const r = 0.026 + (i / n) * 0.016;
      for (const s of [-1, 1]) {
        const head = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 10), bell);
        head.rotation.x = Math.PI / 2;
        add(head, lx, F + 0.27 + r, z + s * 0.05);
      }
    }
    solids.push({ x: 0, z, hx: W * 0.25, hz: 0.1, top: F + 0.27 });
    stations.push({ at: { x: 0, z: D / 4 - 0.05 }, face: Math.PI, grip: 0, kinds: ['curl'], approach: { x: 0, z: D / 4 + 0.35 } });
    // Kettlebells in a corner.
    const kb = mat(0x2b2e34, { metalness: 0.4, roughness: 0.5 });
    for (let i = 0; i < 3; i++) {
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.045 + i * 0.008, 10, 8), kb);
      add(k, -W / 2 + 0.2 + i * 0.13, F + 0.05, D / 2 - 0.25);
    }
  }

  // A warm light inside for the evening.
  const lamp = new THREE.PointLight(0xfff1d6, 0, W * 1.6, 1.6);
  lamp.position.set(0, F + H - 0.15, 0);
  group.add(lamp);
  const windows: THREE.Mesh[] = [];

  let insideNow = false;
  const interior: LandmarkInterior = {
    rooms: [
      { minX: -W / 2 + T + 0.04, maxX: W / 2 - T - 0.04, minZ: -D / 2 + T + 0.04, maxZ: D / 2 - T - 0.04 },
      { minX: -DOOR / 2 + 0.06, maxX: DOOR / 2 - 0.06, minZ: D / 2 - 0.3, maxZ: D / 2 + 0.65 },
    ],
    door: { x: 0, z: D / 2 },
    setDoor(open) { door.position.x = open * DOOR * 0.9; },
    setInside(on) {
      if (on === insideNow) return;
      insideNow = on;
      for (const o of roofParts) o.visible = !on;
      brick.transparent = on;
      brick.opacity = on ? 0.3 : 1;
      brick.depthWrite = !on;
      brick.needsUpdate = true;
      for (const w of walls) w.castShadow = !on;
    },
  };
  group.userData.setNight = (night: number) => { lamp.intensity = night * 1.2; };
  const room = interior.rooms[0], doorway = interior.rooms[1];
  const groundAt = (l: Vec2): number => {
    if (l.x > room.minX && l.x < room.maxX && l.z > room.minZ && l.z < room.maxZ) return F;
    // The concrete slab's rim (top 0.1) eases up from its edge.
    const rim = Math.min(W / 2 + 0.1 - Math.abs(l.x), D / 2 + 0.1 - Math.abs(l.z));
    const slab = rim > 0 ? 0.1 * Math.min(1, rim / 0.1) : 0;
    if (l.x > doorway.minX && l.x < doorway.maxX && l.z > doorway.minZ && l.z < doorway.maxZ) {
      // A gentle ramp over the threshold, up to the floor just inside.
      const k = (doorway.maxZ - l.z) / (doorway.maxZ - (D / 2 - 0.1));
      return Math.max(slab, F * Math.min(1, Math.max(0, k)));
    }
    return slab;
  };
  return { group, windows, doorLocal: new THREE.Vector3(0, 0, D / 2 + 0.3), height: F + H + 0.5, roofColor, interior, stations, solids, groundAt };
}

/** "GYM" in lime neon on a dark board. */
function gymSign(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#16181d';
    g.fillRect(0, 0, 256, 96);
    g.font = '800 64px Inter, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#b4f953';
    g.shadowBlur = 18;
    g.fillStyle = '#d9ff9c';
    g.fillText('GYM', 128, 52);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.23), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
}
