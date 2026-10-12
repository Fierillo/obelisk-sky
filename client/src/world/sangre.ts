// The "Sangreee..." emote's props (world/emotes.ts): a knife in each fist,
// its tip bloodied, and blood. A stain spreads on the neck, spurts leave it
// in pulses, the blades drip, and what lands pools at the feet; over the
// name badge, "SANGREEE... SANGREEE!" pops up and shakes. Everything
// lives in the body's own space (it stands still: moving ends the emote)
// and shares one set of geometries and materials; all the drops of one
// body are a single instanced mesh. Character makes one while the emote
// plays and throws it away when it ends.

import * as THREE from 'three';
import { canvasTexture } from './landmarks/signs';

/** Knives, drawn a little large so they read from the usual camera distance. */
const KNIFE_SCALE = 1.3;
/** Where the blade's tip is, in the knife's own space (+y runs up the blade). */
const TIP = new THREE.Vector3(0, 0.106, 0);
const MAX_DROPS = 48;
/** Gravity at the village's scale (people are 0.72 tall). */
const G = 4;
/** Spurts from the neck: every PULSE_S, DROPS_PER_PULSE drops. */
const PULSE_S = 0.42;
const DROPS_PER_PULSE = 4;
const DRIP_S = 0.7;
const PUDDLE_MAX = 0.085;
/** The shout over the name badge (which rides 0.3 over the head): its height over the head, and size. */
const SHOUT_ABOVE_HEAD = 0.56;
const SHOUT_W = 0.5;
const SHOUT_H = 0.25;

let shared: {
  steel: THREE.MeshStandardMaterial; wood: THREE.MeshStandardMaterial; blood: THREE.MeshStandardMaterial;
  blade: THREE.BufferGeometry; bladeBlood: THREE.BufferGeometry; handle: THREE.BufferGeometry; guard: THREE.BufferGeometry;
  drop: THREE.BufferGeometry; stain: THREE.BufferGeometry; puddle: THREE.BufferGeometry;
  shout: THREE.SpriteMaterial;
} | null = null;

/** "SANGREEE... / SANGREEE!" in blood red, dark outline, drips running off the letters. */
function shoutTexture(): THREE.Texture {
  return canvasTexture(512, 256, (g) => {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    const line = (text: string, y: number, px: number) => {
      // Shrunk to fit the canvas, outline included, whichever font the device has.
      g.font = `900 ${px}px Impact, "Arial Black", sans-serif`;
      const fit = Math.min(1, 470 / Math.max(1, g.measureText(text).width));
      px = Math.floor(px * fit);
      g.font = `900 ${px}px Impact, "Arial Black", sans-serif`;
      g.lineWidth = 14;
      g.strokeStyle = '#1a0000';
      g.strokeText(text, 256, y);
      g.fillStyle = '#c40000';
      g.fillText(text, 256, y);
      // Drips under the letters.
      const w = g.measureText(text).width;
      for (let i = 0; i < 7; i++) {
        const x = 256 - w / 2 + ((i * 0.37 + 0.11) % 1) * w;
        const len = 10 + ((i * 7) % 5) * 6;
        g.fillRect(x - 3, y + px * 0.32, 6, len);
        g.beginPath();
        g.arc(x, y + px * 0.32 + len, 5, 0, Math.PI * 2);
        g.fill();
      }
    };
    line('SANGREEE...', 72, 92);
    line('SANGREEE!', 180, 84);
  });
}

/** A blade's outline from `from` up to the point (x across, y along): a
 *  straight back, an edge that curves up to meet it at the tip. */
function bladeShape(from: number): THREE.Shape {
  const back = (y: number) => (y < 0.09 ? -0.005 : -0.005 + (y - 0.09) * 0.2);
  const edge = (y: number) => (y < 0.07 ? 0.0075 : 0.0075 - (y - 0.07) * 0.35);
  const ys: number[] = [];
  for (let y = from; y < 0.1; y += 0.005) ys.push(y);
  ys.push(0.1);
  const s = new THREE.Shape();
  s.moveTo(back(from), from);
  for (const y of ys) s.lineTo(edge(y), y);
  for (const y of ys.slice(0, -1).reverse()) s.lineTo(back(y), y);
  return s;
}

function assets() {
  if (!shared) {
    const extrude = (shape: THREE.Shape, depth: number) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
    shared = {
      steel: new THREE.MeshStandardMaterial({ color: 0xe4e8ee, metalness: 0.35, roughness: 0.3 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x3b2416, roughness: 0.8 }),
      blood: new THREE.MeshStandardMaterial({ color: 0x8a0606, emissive: 0x2a0000, roughness: 0.25, metalness: 0.1 }),
      blade: extrude(bladeShape(0.006), 0.002),
      bladeBlood: extrude(bladeShape(0.05), 0.0026),
      handle: new THREE.BoxGeometry(0.012, 0.045, 0.01).translate(0, -0.0165, 0),
      guard: new THREE.BoxGeometry(0.024, 0.005, 0.013).translate(0, 0.006, 0),
      drop: new THREE.IcosahedronGeometry(1, 0),
      stain: new THREE.SphereGeometry(1, 10, 8),
      puddle: new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
      shout: new THREE.SpriteMaterial({ map: shoutTexture(), transparent: true, depthWrite: false }),
    };
    // Shared by every body: first person must not hide them through these (world.ts setBodyDrawn).
    for (const m of [shared.steel, shared.wood, shared.blood, shared.shout]) m.userData.shared = true;
  }
  return shared;
}

/** A knife: the grip at the origin, the blade up +y, the top half of the blade bloodied. */
export function buildKnife(): THREE.Group {
  const a = assets();
  const g = new THREE.Group();
  g.name = 'knife';
  g.add(new THREE.Mesh(a.handle, a.wood), new THREE.Mesh(a.guard, a.steel), new THREE.Mesh(a.blade, a.steel), new THREE.Mesh(a.bladeBlood, a.blood));
  g.scale.setScalar(KNIFE_SCALE);
  return g;
}

/** Where the bones are this frame, in the body's space; null when the skeleton lacks one. */
export type BoneAt = (name: string, out: THREE.Vector3) => THREE.Vector3 | null;

const UP = new THREE.Vector3(0, 1, 0);

export class SangreFx {
  readonly group = new THREE.Group();
  readonly knives: [THREE.Group, THREE.Group] = [buildKnife(), buildKnife()];
  readonly drops: THREE.InstancedMesh;
  readonly stain: THREE.Mesh;
  readonly puddle: THREE.Mesh;
  readonly shout: THREE.Sprite;
  /** Seconds since it started. */
  t = 0;
  /** Drops that reached the ground (the puddle grows with them). */
  landed = 0;
  private pos: THREE.Vector3[] = [];
  private vel: THREE.Vector3[] = [];
  private size: number[] = [];
  private alive: boolean[] = [];
  private nextPulse = 0.9;
  private nextDrip = 1.2;
  private puddleAt = new THREE.Vector3();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private c = new THREE.Vector3();
  private neck = new THREE.Vector3();
  private fwd = new THREE.Vector3(0, 0, 1);

  constructor(private rand: () => number = Math.random) {
    const a = assets();
    this.group.name = 'sangre';
    this.drops = new THREE.InstancedMesh(a.drop, a.blood, MAX_DROPS);
    this.drops.count = 0;
    this.drops.frustumCulled = false;
    for (let i = 0; i < MAX_DROPS; i++) {
      this.pos.push(new THREE.Vector3());
      this.vel.push(new THREE.Vector3());
      this.size.push(0);
      this.alive.push(false);
    }
    this.stain = new THREE.Mesh(a.stain, a.blood);
    this.stain.scale.setScalar(0);
    this.puddle = new THREE.Mesh(a.puddle, a.blood);
    this.puddle.scale.setScalar(0);
    this.puddle.visible = false;
    this.shout = new THREE.Sprite(a.shout);
    this.shout.renderOrder = 7;
    this.shout.visible = false;
    this.group.add(...this.knives, this.drops, this.stain, this.puddle, this.shout);
  }

  /** One frame: the knives into the fists, the stain onto the neck, the blood flying. `ground`: the floor's height in body space. */
  update(dt: number, bone: BoneAt, ground: number): void {
    this.t += dt;
    for (const [i, sd] of (['l', 'r'] as const).entries()) {
      const k = this.knives[i];
      const wrist = bone(`hand_${sd}`, this.a), knuckle = bone(`middle_01_${sd}`, this.b);
      k.visible = !!(wrist && knuckle);
      if (!wrist || !knuckle) continue;
      // In the fist, the blade carrying on from the hand's line.
      k.position.copy(wrist).lerp(knuckle, 0.75);
      k.quaternion.setFromUnitVectors(UP, this.c.subVectors(knuckle, wrist).normalize());
    }
    const neck = bone('neck_01', this.a), head = bone('Head', this.b);
    if (neck && head) this.neck.copy(neck).lerp(head, 0.35).addScaledVector(this.fwd, 0.016);
    else if (head) this.neck.copy(head).addScaledVector(UP, -0.05).addScaledVector(this.fwd, 0.016);
    const grow = THREE.MathUtils.smoothstep(this.t, 0.6, 1.6);
    this.stain.visible = grow > 0;
    this.stain.position.copy(this.neck).addScaledVector(UP, -0.012 * grow);
    this.stain.scale.set(0.02 * grow, 0.03 * grow, 0.007 * grow);

    // The shout: pops up as the arms go up, then shakes with the scream.
    if (head) {
      const pop = THREE.MathUtils.smoothstep(this.t, 0.5, 0.8);
      const beat = 1 + 0.06 * Math.max(0, Math.sin(this.t * Math.PI * 4));
      this.shout.visible = pop > 0;
      this.shout.position.set(head.x + Math.sin(this.t * 37) * 0.008, head.y + SHOUT_ABOVE_HEAD + Math.sin(this.t * 29) * 0.006, head.z);
      this.shout.scale.set(SHOUT_W * pop * beat, SHOUT_H * pop * beat, 1);
    }

    // Spurts from the neck, forward and up; drips from both tips.
    if (this.t >= this.nextPulse) {
      this.nextPulse += PULSE_S;
      for (let n = 0; n < DROPS_PER_PULSE; n++) {
        const r = this.rand;
        this.spawn(this.neck, this.c.set((r() - 0.5) * 0.5, 0.5 + r() * 0.5, 0.45 + r() * 0.45), 0.006 + r() * 0.006);
      }
    }
    if (this.t >= this.nextDrip) {
      this.nextDrip += DRIP_S;
      for (const k of this.knives) if (k.visible) this.spawn(this.c.copy(TIP).multiplyScalar(KNIFE_SCALE).applyQuaternion(k.quaternion).add(k.position), this.b.set(0, -0.05, 0), 0.006);
    }
    let shown = 0;
    for (let i = 0; i < MAX_DROPS; i++) {
      if (!this.alive[i]) continue;
      const p = this.pos[i], v = this.vel[i];
      v.y -= G * dt;
      p.addScaledVector(v, dt);
      if (p.y <= ground) { this.alive[i] = false; this.land(p, ground); continue; }
      // Stretched along the fall.
      this.q.setFromUnitVectors(UP, this.c.copy(v).normalize());
      const s = this.size[i];
      this.m.compose(p, this.q, this.s.set(s, s * 1.6, s));
      this.drops.setMatrixAt(shown++, this.m);
    }
    this.drops.count = shown;
    this.drops.instanceMatrix.needsUpdate = true;
  }

  private spawn(at: THREE.Vector3, v: THREE.Vector3, size: number): void {
    const i = this.alive.indexOf(false);
    if (i < 0) return;
    this.alive[i] = true;
    this.pos[i].copy(at);
    this.vel[i].copy(v);
    this.size[i] = size;
  }

  /** A drop reached the floor: the pool moves toward it and spreads. */
  private land(p: THREE.Vector3, ground: number): void {
    this.landed++;
    if (this.landed === 1) this.puddleAt.set(p.x, 0, p.z);
    else this.puddleAt.lerp(this.c.set(p.x, 0, p.z), 1 / Math.min(this.landed, 12));
    const r = Math.min(PUDDLE_MAX, 0.02 + Math.sqrt(this.landed) * 0.01);
    this.puddle.visible = true;
    this.puddle.position.set(this.puddleAt.x, ground + 0.004, this.puddleAt.z);
    this.puddle.scale.set(r, 1, r * 0.85);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.drops.dispose();
  }
}
