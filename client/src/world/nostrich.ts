// Nostriches: Nostr's purple ostrich, built from boxes in the Kenney cube-pet
// style and animated in code (no model file). A few run wild about the
// island (the `Flock`), and anyone can take one as a pet (pet.ts).

import * as THREE from 'three';
import type { Vec2 } from './layout';

export const NOSTRICH_PURPLE = 0x9b5cff;

/** The bird's joints, posed every frame by `pose`. */
interface Rig {
  body: THREE.Group;
  neck: THREE.Group[];
  head: THREE.Group;
  tail: THREE.Group;
  wings: THREE.Group[];
  /** [hip, knee] for the left and right leg. */
  legs: [THREE.Group, THREE.Group][];
}

/** Its height, standing, in its own units (scale the root to size it). */
export const NOSTRICH_HEIGHT = 1.12;

/** The stride, in radians of leg swing per metre covered (a long-legged gait). */
const STRIDE = 7.5;

export type NostrichMode = 'idle' | 'walk' | 'run' | 'peck' | 'dance';

export class Nostrich {
  readonly root = new THREE.Group();
  private rig: Rig;
  /** Gait phase (radians) and how much of a run it is (0 walk … 1 sprint). */
  private phase = 0;
  private gait = 0;
  private peck = 0;
  private clock = Math.random() * 10;
  mode: NostrichMode = 'idle';

  constructor(color = NOSTRICH_PURPLE) {
    this.rig = buildRig(this.root, color);
  }

  /** Advance the animation; `speed` is how fast it is moving (m/s, in its own scale). */
  update(dt: number, speed: number): void {
    this.clock += dt;
    const r = this.rig;
    const running = this.mode === 'run' ? 1 : this.mode === 'walk' ? 0.35 : 0;
    this.gait = THREE.MathUtils.damp(this.gait, running, 8, dt);
    this.phase += speed * STRIDE * dt;
    const k = Math.min(1, speed * 1.5) * (0.5 + this.gait * 0.5);
    const swing = Math.sin(this.phase);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? swing : -swing;
      const [hip, knee] = r.legs[i];
      hip.rotation.x = s * 0.75 * k;
      // The foot folds up as the leg swings forward.
      knee.rotation.x = Math.max(0, (i === 0 ? Math.cos(this.phase) : -Math.cos(this.phase))) * 1.1 * k;
    }
    // Body bobs twice a stride, leans into a run.
    r.body.position.y = Math.abs(Math.sin(this.phase)) * 0.05 * k;
    r.body.rotation.x = this.gait * 0.25;
    // Pecking at the grass now and then while standing about.
    const pecking = this.mode === 'peck' ? Math.max(0, Math.sin(this.clock * 3.2)) ** 3 : 0;
    this.peck = THREE.MathUtils.damp(this.peck, pecking, 12, dt);
    const dance = this.mode === 'dance' ? Math.sin(this.clock * 9) : 0;
    // The neck stretches forward when running, bobs with the stride, dips to peck.
    const bob = Math.sin(this.phase * 2) * 0.12 * k;
    r.neck[0].rotation.x = 0.15 + this.gait * 0.55 + this.peck * 1.15 + bob;
    r.neck[1].rotation.x = -0.25 - this.gait * 0.2 + this.peck * 0.5;
    r.neck[2].rotation.x = -0.2 - this.gait * 0.25 + this.peck * 0.2 + dance * 0.3;
    r.head.rotation.x = -(r.neck[0].rotation.x + r.neck[1].rotation.x + r.neck[2].rotation.x) * 0.8 + this.peck * 0.6;
    r.head.rotation.z = dance * 0.25;
    // Tail fans up when running; wings flap for balance.
    r.tail.rotation.x = -0.5 - this.gait * 0.35 + Math.sin(this.clock * 2.1) * 0.05;
    const flap = this.mode === 'dance' ? 0.9 + Math.sin(this.clock * 14) * 0.5 : this.gait * (0.35 + Math.sin(this.phase * 2) * 0.25);
    r.wings[0].rotation.z = flap;
    r.wings[1].rotation.z = -flap;
  }
}

function buildRig(root: THREE.Group, color: number): Rig {
  const base = new THREE.Color(color);
  const m = (c: THREE.Color | number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true });
  const feathers = m(base);
  const light = m(base.clone().lerp(new THREE.Color(0xffffff), 0.35));
  const dark = m(base.clone().multiplyScalar(0.62));
  const skin = m(0xf3c6ff);
  const beak = m(0xffb347);
  const eye = m(0x14101c);
  const box = (w: number, h: number, d: number, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, y, z);
    b.castShadow = true;
    parent.add(b);
    return b;
  };
  const joint = (parent: THREE.Object3D, x: number, y: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  // Legs hang from the hips; the body sits on top of them.
  const HIP = 0.52;
  const legs: [THREE.Group, THREE.Group][] = [];
  for (const sx of [1, -1]) {
    const hip = joint(root, sx * 0.08, HIP, 0);
    box(0.09, 0.24, 0.1, feathers, hip, 0, -0.1, 0); // thigh, feathered
    const knee = joint(hip, 0, -0.24, 0.01);
    box(0.045, 0.26, 0.045, skin, knee, 0, -0.13, 0); // shank
    box(0.08, 0.03, 0.13, skin, knee, 0, -0.265, 0.035); // foot
    legs.push([hip, knee]);
  }

  const body = joint(root, 0, 0, 0);
  box(0.3, 0.24, 0.42, feathers, body, 0, HIP + 0.14, 0);
  box(0.24, 0.08, 0.32, light, body, 0, HIP + 0.02, 0.01); // belly
  const wings: THREE.Group[] = [];
  for (const sx of [1, -1]) {
    const w = joint(body, sx * 0.15, HIP + 0.22, -0.02);
    box(0.04, 0.16, 0.3, dark, w, sx * 0.02, -0.07, -0.02);
    wings.push(w);
  }
  const tail = joint(body, 0, HIP + 0.22, -0.2);
  for (const a of [-0.45, 0, 0.45]) {
    const plume = box(0.07, 0.04, 0.2, light, tail, Math.sin(a) * 0.08, 0.02, -0.08);
    plume.rotation.y = a;
  }

  // The neck: three segments, each a joint on the last, ending in the head.
  const neck: THREE.Group[] = [];
  let parent: THREE.Object3D = body;
  let at = new THREE.Vector3(0, HIP + 0.24, 0.17);
  for (let i = 0; i < 3; i++) {
    const n = joint(parent, at.x, at.y, at.z);
    box(0.075 - i * 0.008, 0.15, 0.075 - i * 0.008, i === 0 ? feathers : skin, n, 0, 0.075, 0);
    neck.push(n);
    parent = n;
    at = new THREE.Vector3(0, 0.15, 0);
  }
  const head = joint(parent, 0, 0.15, 0);
  box(0.11, 0.09, 0.14, skin, head, 0, 0.03, 0.02);
  box(0.06, 0.03, 0.09, beak, head, 0, 0.01, 0.13);
  for (const sx of [1, -1]) box(0.012, 0.025, 0.025, eye, head, sx * 0.056, 0.045, 0.05);
  box(0.03, 0.04, 0.05, feathers, head, 0, 0.09, -0.01); // a tuft
  return { body, neck, head, tail, wings, legs };
}

// ── the wild flock ────────────────────────────────────────────────────────

export interface FlockWorld {
  /** A walkable spot near `p` (within `r`), or null. */
  spotNear(p: Vec2, r: number): Vec2 | null;
  /** A walkable path, or null. */
  path(from: Vec2, to: Vec2): Vec2[] | null;
  groundAt(p: Vec2): number;
}

interface Bird {
  n: Nostrich;
  pos: Vec2;
  heading: number;
  path: Vec2[];
  speed: number;
  /** Seconds left pecking about before the next dash. */
  rest: number;
}

/** A wild nostrich stands a little taller than the people (0.72). */
export const WILD_HEIGHT = 0.8;
const WILD_SCALE = WILD_HEIGHT / NOSTRICH_HEIGHT;
const WALK = 0.55, RUN = 2.4, SPRINT = 3.4;
/** They scatter when someone runs at them closer than this. */
export const SCARE_RADIUS = 2.6;

/** Nostriches loose on the island: dash about in pairs, peck the grass, scatter from runners. */
export class Flock {
  readonly root = new THREE.Group();
  private birds: Bird[] = [];

  constructor(private world: FlockWorld, homes: Vec2[], perHome = 2, private rand = Math.random) {
    this.root.name = 'nostriches';
    for (const h of homes) {
      for (let i = 0; i < perHome; i++) {
        const pos = world.spotNear(h, 1.5) ?? h;
        const n = new Nostrich();
        n.root.scale.setScalar(WILD_SCALE);
        n.root.position.set(pos.x, world.groundAt(pos), pos.z);
        this.root.add(n.root);
        this.birds.push({ n, pos: { ...pos }, heading: rand() * Math.PI * 2, path: [], speed: 0, rest: 1 + rand() * 4 });
      }
    }
  }

  get count(): number {
    return this.birds.length;
  }

  positions(): Vec2[] {
    return this.birds.map((b) => ({ ...b.pos }));
  }

  /** `runners`: people moving fast nearby (they startle the birds). */
  update(dt: number, runners: Vec2[], visible: (p: Vec2) => boolean = () => true): void {
    for (const b of this.birds) {
      // Startled: sprint away from the nearest runner.
      const scare = runners.find((r) => Math.hypot(r.x - b.pos.x, r.z - b.pos.z) < SCARE_RADIUS);
      if (scare && b.speed < SPRINT * 0.9) {
        const ax = b.pos.x - scare.x, az = b.pos.z - scare.z;
        const l = Math.hypot(ax, az) || 1;
        const away = this.world.spotNear({ x: b.pos.x + (ax / l) * 6, z: b.pos.z + (az / l) * 6 }, 2);
        const p = away ? this.world.path(b.pos, away) : null;
        if (p?.length) { b.path = p; b.speed = SPRINT; b.rest = 0; }
      }
      if (!b.path.length) {
        b.rest -= dt;
        b.n.mode = b.rest > 0 ? 'peck' : 'idle';
        if (b.rest <= 0) {
          // Off somewhere: usually a dash, sometimes a stroll.
          const to = this.world.spotNear(b.pos, 3 + this.rand() * 9);
          const p = to ? this.world.path(b.pos, to) : null;
          if (p?.length) { b.path = p; b.speed = this.rand() < 0.65 ? RUN : WALK; }
          else b.rest = 1;
        }
      }
      let moved = 0;
      if (b.path.length) {
        const t = b.path[0];
        const dx = t.x - b.pos.x, dz = t.z - b.pos.z;
        const d = Math.hypot(dx, dz);
        const step = Math.min(d, b.speed * dt);
        if (d > 1e-4) {
          b.pos.x += (dx / d) * step;
          b.pos.z += (dz / d) * step;
          const want = Math.atan2(dx, dz);
          let da = want - b.heading;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          b.heading += da * Math.min(1, dt * 10);
        }
        moved = step;
        if (d - step < 0.05) b.path.shift();
        if (!b.path.length) { b.rest = 2 + this.rand() * 6; b.speed = 0; }
        b.n.mode = b.speed >= RUN ? 'run' : 'walk';
      }
      b.n.root.position.set(b.pos.x, this.world.groundAt(b.pos), b.pos.z);
      b.n.root.rotation.y = b.heading;
      // Off screen: keep moving, skip the posing.
      const show = visible(b.pos);
      b.n.root.visible = show;
      if (show) b.n.update(dt, dt > 0 ? moved / dt / WILD_SCALE : 0);
    }
  }
}
