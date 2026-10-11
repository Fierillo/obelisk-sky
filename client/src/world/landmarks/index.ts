// Landmarks: buildings that aren't channels. Each takes a building slot of
// the island plan (reserved before channels are assigned, so a channel never
// gets it) and builds itself facing the plaza like any channel would.
//
// A landmark's local frame matches the slot: the facade faces +z (toward
// the slot's yard and the plaza), `forward` moves it off the slot centre.

import * as THREE from 'three';
import type { Vec2 } from '../layout';
import { buildLaCryptaHouse } from '../lacrypta';
import { buildCoffeeShop } from './coffee';
import { buildParrilla } from './parrilla';
import { buildNostrWotHq } from './nostrwot';

export type LandmarkId = 'lacrypta' | 'nostrwot' | 'coffee' | 'parrilla';

/** What a seat at a landmark puts in your hand. */
export type SeatProp = 'mate' | 'coffee' | 'asado' | 'none';

export interface LandmarkSeat {
  pos: Vec2; face: number; y: number; prop: SeatProp;
  /** Put a (mock) laptop on the table in front of whoever sits here. */
  laptop?: boolean;
  /** Inside a building: only for the player, and only from inside. */
  indoor?: boolean;
}

export interface LandmarkBuild {
  group: THREE.Group;
  setNight(night: number, t: number): void;
  /** Where visitors walk to, in local space (in front of the door). */
  doorLocal: THREE.Vector3;
  seats?: LandmarkSeat[];
  /** Furniture you can't walk through but can jump on (local, axis-aligned). */
  solids?: { x: number; z: number; hx: number; hz: number; top: number }[];
  update?(dt: number, t: number): void;
  /** Raised ground the player walks on (stairs, a floor up a storey), local. */
  groundAt?(local: Vec2): number;
  /** Something nice happened in the village (a reaction, a zap). */
  pulse?(): void;
  /** Where the landmark's resident stands, local space, facing +z. */
  residentLocal?: Vec2;
  /** A building you can walk into (see world.ts: walkable rooms, doors, cutaway). */
  interior?: LandmarkInterior;
}

export interface LocalRect { minX: number; maxX: number; minZ: number; maxZ: number }

export interface LandmarkInterior {
  /** The room (first) and the doorway through the front wall: walkable for the player. */
  rooms: LocalRect[];
  /** The door's centre (local): it opens as someone comes close. */
  door: Vec2;
  setDoor(open: number): void;
  /** You're inside: hide the roof and upper floor, see through the walls. */
  setInside(inside: boolean): void;
}

export interface LandmarkDef {
  id: LandmarkId;
  /** Where it would like to be; the nearest slot of at least `minSize` wins. */
  want: Vec2 | 'plaza';
  minSize: number;
  /** Facade offset from the slot centre toward the yard. */
  forward: number;
  /** The building itself, local to the landmark (facade at z = 0): blocked for walking. */
  footprint: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Area in front kept free of plaza lanterns (along: 0..n toward the yard). */
  lawn?: { along: number; across: number };
  build(): LandmarkBuild;
}

/** In priority order: earlier ones pick their slot first. */
export const LANDMARKS: LandmarkDef[] = [
  { id: 'lacrypta', want: { x: 3.5, z: 5.5 }, minSize: 3, forward: 0.55, footprint: { minX: -2.55, maxX: 1.5, minZ: -2.15, maxZ: 0.15 }, lawn: { along: 3.4, across: 2.6 }, build: buildLaCryptaHouse },
  { id: 'nostrwot', want: 'plaza', minSize: 3, forward: 0.2, footprint: { minX: -1.4, maxX: 1.4, minZ: -2.05, maxZ: 0.1 }, lawn: { along: 2.6, across: 1.8 }, build: buildNostrWotHq },
  { id: 'coffee', want: { x: -6.5, z: 1 }, minSize: 2, forward: 0.25, footprint: { minX: -1.3, maxX: 1.3, minZ: -1.75, maxZ: 0.1 }, lawn: { along: 2.4, across: 1.6 }, build: buildCoffeeShop },
  { id: 'parrilla', want: { x: -7, z: 5.5 }, minSize: 2, forward: 0.1, footprint: { minX: -1.0, maxX: 1.0, minZ: -1.55, maxZ: -0.95 }, lawn: { along: 2.2, across: 1.6 }, build: buildParrilla },
];

/** Pick each landmark's slot: nearest to what it wants, never shared. */
export function reserveLandmarkSlots<S extends { index: number; pos: Vec2; w: number }>(
  slots: S[], plaza: Vec2, defs: LandmarkDef[] = LANDMARKS,
): Map<LandmarkId, S> {
  const out = new Map<LandmarkId, S>();
  const taken = new Set<number>();
  for (const d of defs) {
    const want = d.want === 'plaza' ? plaza : d.want;
    const best = slots
      .filter((s) => s.w >= d.minSize && !taken.has(s.index))
      .sort((a, b) => Math.hypot(a.pos.x - want.x, a.pos.z - want.z) - Math.hypot(b.pos.x - want.x, b.pos.z - want.z))[0];
    if (!best) continue;
    out.set(d.id, best);
    taken.add(best.index);
  }
  return out;
}
