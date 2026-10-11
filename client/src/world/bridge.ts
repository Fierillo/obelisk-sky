// The footbridges over the river: a wooden arch you walk up and over. The
// shape is one pure function (`archHeight`), so the mesh, the player, the
// villagers and their pets all agree on how high the deck is.

import * as THREE from 'three';
import { riverTangentAt, type IslandPlan, type Vec2 } from './layout';

/** How high the deck rises at mid-span (m). */
export const BRIDGE_RISE = 0.45;
/** Deck width, along the river (the walkable corridor is a little narrower). */
export const BRIDGE_WIDTH = 1.1;

export interface BridgeSpec {
  /** Mid-span, on the river's centre line. */
  c: Vec2;
  /** The river's direction here (unit); the bridge crosses along its normal. */
  t: Vec2;
  /** Half the span, bank to bank. */
  half: number;
}

/** Height of the deck at u (−1 bank … 0 mid-span … 1 bank): flat where it
 *  meets each bank, so walking on and off has no ledge. */
export function archHeight(u: number): number {
  const a = Math.abs(u);
  if (a >= 1) return 0;
  const k = 1 - a * a;
  return BRIDGE_RISE * k * k;
}

/** One bridge per centre, spanning the river's blocked band and a bit more on
 *  each bank (the walk grid's corridor: layout.ts buildNavGrid). */
export function bridgeSpecs(plan: IslandPlan, centres: Vec2[]): BridgeSpec[] {
  const band = plan.riverWidth * 0.75 + 0.15;
  return centres.map((c) => ({ c, t: riverTangentAt(plan.river, c), half: band + 0.55 }));
}

/** Where p is relative to a bridge: `along` the river, `u` across (−1..1). */
function bridgeLocal(b: BridgeSpec, p: Vec2): { along: number; u: number } {
  const dx = p.x - b.c.x, dz = p.z - b.c.z;
  return { along: dx * b.t.x + dz * b.t.z, u: (-dx * b.t.z + dz * b.t.x) / b.half };
}

/** The deck under p, or 0 off every bridge. */
export function bridgeHeightAt(bridges: readonly BridgeSpec[], p: Vec2): number {
  let h = 0;
  for (const b of bridges) {
    const { along, u } = bridgeLocal(b, p);
    if (Math.abs(along) <= BRIDGE_WIDTH / 2 && Math.abs(u) < 1) h = Math.max(h, archHeight(u));
  }
  return h;
}

const WOOD = 0x9a6a43;
const WOOD_DARK = 0x6e4529;
const PLANKS = 17;

/** The mesh: planks following the arch on two curved beams, posts and a
 *  curved handrail on each side. */
export function buildBridge(b: BridgeSpec): THREE.Group {
  const g = new THREE.Group();
  g.name = 'bridge';
  // Local frame: x across the river (bank to bank), z along it.
  const n = { x: -b.t.z, z: b.t.x };
  g.position.set(b.c.x, 0, b.c.z);
  g.rotation.y = Math.atan2(-n.z, n.x);

  const plankMat = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.85 });
  const darkMat = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.9 });
  const span = b.half * 2;
  const step = span / PLANKS;
  const deckY = (x: number) => archHeight(x / b.half);

  // Planks: each sits on the arch, tilted to its slope, with a small gap.
  const plankGeo = new THREE.BoxGeometry(step * 0.86, 0.05, BRIDGE_WIDTH);
  // White base: each plank's instance colour is its wood tone.
  const planks = new THREE.InstancedMesh(plankGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), PLANKS);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  const tint = new THREE.Color();
  for (let i = 0; i < PLANKS; i++) {
    const x = -b.half + step * (i + 0.5);
    const slope = (deckY(x + 0.01) - deckY(x - 0.01)) / 0.02;
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan(slope));
    // A plank's top is the deck: the walk height.
    m.compose(new THREE.Vector3(x, deckY(x) - 0.025, 0), q, s);
    planks.setMatrixAt(i, m);
    planks.setColorAt(i, tint.setHex(WOOD).multiplyScalar(0.88 + ((i * 37) % 11) / 45));
  }
  planks.castShadow = planks.receiveShadow = true;
  g.add(planks);

  // Two beams under the deck and a handrail each side, following the arch.
  const curve = (z: number, lift: number, ends = 0) => new THREE.CatmullRomCurve3(
    Array.from({ length: 13 }, (_, i) => {
      const x = -b.half - ends + ((span + ends * 2) * i) / 12;
      return new THREE.Vector3(x, deckY(x) + lift, z);
    }),
  );
  const side = BRIDGE_WIDTH / 2 - 0.06;
  for (const z of [-side, side]) {
    const beam = new THREE.Mesh(new THREE.TubeGeometry(curve(z, -0.09, 0.1), 40, 0.055, 6), darkMat);
    beam.castShadow = true;
    g.add(beam);
    const rail = new THREE.Mesh(new THREE.TubeGeometry(curve(z, 0.62), 40, 0.035, 6), plankMat);
    rail.castShadow = true;
    g.add(rail);
  }

  // Posts from the deck to the rail, a pair every few planks, and a stout
  // newel at each corner.
  const postGeo = new THREE.BoxGeometry(0.07, 1, 0.07);
  const xs = [-b.half + 0.08, -b.half * 0.5, 0, b.half * 0.5, b.half - 0.08];
  const posts = new THREE.InstancedMesh(postGeo, darkMat, xs.length * 2);
  let k = 0;
  for (const x of xs) {
    for (const z of [-side, side]) {
      const end = Math.abs(x) > b.half - 0.1;
      const h = 0.62 + (end ? 0.12 : 0);
      m.compose(new THREE.Vector3(x, deckY(x) + h / 2, z), new THREE.Quaternion(), new THREE.Vector3(end ? 1.6 : 1, h, end ? 1.6 : 1));
      posts.setMatrixAt(k++, m);
    }
  }
  posts.castShadow = true;
  g.add(posts);
  return g;
}
