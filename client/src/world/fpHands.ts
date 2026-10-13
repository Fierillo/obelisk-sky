// Your own hands in first person: two forearms and hands at the bottom
// corners of the view, in your skin tone with your top's sleeves. They move
// the way arms do: standing they hang loose and breathe, fingers relaxed;
// walking they swing opposite each other along an arc and dip with every
// step (lowest as they pass each other, up as they come
// forward); running the elbows bend, the fists close and pump higher and
// harder; in a jump they lift and spread, and settle back as you land;
// turning, they trail a little behind the look. They hang off the camera
// (World.setFirstPerson shows them; the self-view while you sit or train
// hides them, the body is drawn then).

import * as THREE from 'three';
import { BOB_WALK } from './fpFeel';

export interface HandsInput {
  /** Stride phase (radians) and bob amplitude, from FpFeel. */
  phase: number;
  amp: number;
  airborne: boolean;
  /** Seconds since start, for the idle breathing. */
  t: number;
  /** Running (not just walking). */
  running?: boolean;
}

/** What the pose is built from: the input eased into blends. */
export interface PoseState {
  phase: number;
  /** 0 standing … 1 a full walking stride. */
  walk: number;
  /** 0 walking … 1 running. */
  run: number;
  /** 0 on the ground … 1 in the air. */
  air: number;
  /** Look turning (rad/s), eased: the hands trail it. */
  turn: number;
  t: number;
}

export interface HandPose { x: number; y: number; z: number; pitch: number; yaw: number; roll: number; grip: number }

/** Camera-space rest (world units: people are 0.72 tall): low in the
 *  corners, loose hands turned thumb-up (rolled inward), so you see the
 *  backs of the fingers and the knuckles, never a flat palm. */
const REST = { x: 0.086, y: -0.09, z: -0.165, pitch: 0.22, roll: 1.15 } as const;
/** Running: elbows bent, the fists come up and in. */
const RUN = { x: 0.072, y: -0.075, z: -0.17, pitch: 0.42, roll: 1.3 } as const;

/** How far the hands drop and rise with every step (m): the body lands, the arms follow a beat later. */
const STEP_BOB = { walk: 0.011, run: 0.024 } as const;
/** How far each arm swings forward and back (m); the forward one rises on its arc. */
const SWING = { walk: 0.032, run: 0.05 } as const;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Each hand for this moment. Pure. */
export function handsPose(s: PoseState): { left: HandPose; right: HandPose } {
  const breathe = Math.sin(s.t * 1.3) * 0.0016 * (1 - s.walk);
  // Twice a stride both hands dip, lowest as the arms pass each other (a
  // beat late), and rise to the ends of their swing, like a pendulum; they
  // sway a little side to side too: the figure-8 of a walk.
  const bobK = lerp(STEP_BOB.walk, STEP_BOB.run, s.run) * s.walk * (1 - s.air);
  const drop = -bobK * (1 + Math.cos(2 * s.phase - 0.3)) * 0.5;
  const sway = Math.sin(s.phase + 0.3) * bobK * 0.45;
  const hand = (side: 1 | -1): HandPose => {
    // The arm on the side of the leg going back comes forward: opposite hands, opposite phase.
    const sw = Math.sin(s.phase) * side;
    const reach = lerp(SWING.walk, SWING.run, s.run) * s.walk * (1 - s.air * 0.7);
    // Forward (−z) when sw > 0; an arm swinging forward also rises on its arc
    // (running, the fist comes right up toward the chest).
    const fwd = sw * reach;
    const arc = Math.max(0, sw) * reach * lerp(0.55, 1.1, s.run);
    const base = {
      x: lerp(REST.x, RUN.x, s.run), y: lerp(REST.y, RUN.y, s.run), z: lerp(REST.z, RUN.z, s.run),
      pitch: lerp(REST.pitch, RUN.pitch, s.run), roll: lerp(REST.roll, RUN.roll, s.run),
    };
    // Turning: both hands lag the look (slide the other way, tilt with it).
    const lag = clamp(-s.turn * 0.006, -0.018, 0.018);
    return {
      x: side * base.x + side * s.air * 0.018 + lag + sway,
      y: base.y + breathe + drop + arc + s.air * 0.03,
      z: base.z - fwd + s.air * 0.01,
      pitch: base.pitch + sw * reach * 8 - s.air * 0.45,
      yaw: -side * s.air * 0.25 + lag * 6,
      roll: -side * (base.roll - s.air * 0.35),
      // Loose standing, half-closed walking, fists running; open a little in the air.
      grip: clamp(lerp(lerp(0.35, 0.55, s.walk), 1, s.run) - s.air * 0.4, 0, 1),
    };
  };
  return { left: hand(-1), right: hand(1) };
}

const damp = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt));

/** A finger: three bones, each curling by its share of the grip. */
interface Finger { bones: THREE.Group[]; curl: number[] }

export class FpHands {
  readonly group = new THREE.Group();
  private readonly left: THREE.Group;
  private readonly right: THREE.Group;
  private readonly fingers = new Map<THREE.Group, Finger[]>();
  private readonly skin = new THREE.MeshStandardMaterial({ roughness: 0.62 });
  private readonly sleeve = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  private s: PoseState = { phase: 0, walk: 0, run: 0, air: 0, turn: 0, t: 0 };
  private lastT = -1;
  private lastYaw: number | null = null;

  constructor() {
    this.group.name = 'fp-hands';
    this.group.visible = false;
    this.left = this.arm(-1);
    this.right = this.arm(1);
    this.group.add(this.left, this.right);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.frustumCulled = false;
      m.castShadow = false;
    });
  }

  /** Your look's colours: skin tone and top. */
  setColors(skin: string, top: string): void {
    this.skin.color.set(skin);
    this.sleeve.color.set(top);
    // A little of their own colour: right under your eyes they're often
    // backlit (the sun ahead, night), and a black glove reads as a bug.
    this.skin.emissive.copy(this.skin.color).multiplyScalar(0.16);
    this.sleeve.emissive.copy(this.sleeve.color).multiplyScalar(0.14);
  }

  /** Follow the camera and pose for this frame. */
  update(camera: THREE.Camera, i: HandsInput): void {
    if (!this.group.visible) return;
    this.group.position.copy(camera.position);
    this.group.quaternion.copy(camera.quaternion);
    const dt = this.lastT < 0 ? 0 : clamp(i.t - this.lastT, 0, 0.1);
    this.lastT = i.t;
    // How fast the look turns (yaw, rad/s), from the camera itself.
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    let turn = 0;
    if (this.lastYaw !== null && dt > 0) {
      let d = e.y - this.lastYaw;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      turn = d / dt;
    }
    this.lastYaw = e.y;
    const s = this.s;
    s.phase = i.phase;
    s.t = i.t;
    // A full walk at the walk's own bob (running's is bigger, still 1).
    s.walk = damp(s.walk, Math.min(1, i.amp / BOB_WALK), 8, dt);
    s.run = damp(s.run, i.running && i.amp > 0.002 ? 1 : 0, 5, dt);
    // Up quickly at take-off, down a little slower on landing.
    s.air = damp(s.air, i.airborne ? 1 : 0, i.airborne ? 10 : 6, dt);
    s.turn = damp(s.turn, clamp(turn, -6, 6), 6, dt);
    const p = handsPose(s);
    for (const [g, h] of [[this.left, p.left], [this.right, p.right]] as const) {
      g.position.set(h.x, h.y, h.z);
      g.rotation.set(h.pitch, h.yaw, h.roll, 'XYZ');
      this.curl(g, h.grip);
    }
  }

  /** Close the fingers by `grip` (0 loose … 1 a fist). */
  private curl(g: THREE.Group, grip: number): void {
    for (const f of this.fingers.get(g) ?? []) {
      f.bones.forEach((b, k) => { b.rotation.x = -f.curl[k] * (0.25 + 0.75 * grip); });
    }
  }

  /** One forearm reaching forward from the bottom corner, the hand at its tip. */
  private arm(side: 1 | -1): THREE.Group {
    const g = new THREE.Group();
    const fingers: Finger[] = [];
    // Forearm along +z (back toward you), wrist at the origin, thicker toward
    // the elbow; the sleeve and its cuff cover its back half.
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.0108, 0.0152, 0.13, 12), this.skin);
    fore.rotation.x = Math.PI / 2;
    fore.position.z = 0.062;
    fore.scale.set(1, 1, 0.82); // a forearm is flatter than it is wide
    g.add(fore);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.0182, 0.0205, 0.08, 12), this.sleeve);
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.z = 0.09;
    g.add(sleeve);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0024, 6, 16), this.sleeve);
    cuff.position.z = 0.05;
    g.add(cuff);
    // The wrist, and the hand: one rounded slab, wide and thin, the fingers
    // growing out of its front edge.
    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.0108, 12, 8), this.skin);
    wrist.scale.set(1.2, 0.78, 1);
    wrist.position.z = 0.002;
    g.add(wrist);
    const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.0068, 0.02, 4, 12), this.skin);
    palm.rotation.x = Math.PI / 2; // its length along z
    palm.scale.set(1.95, 1, 0.82); // wide; thinner back to front of the hand
    palm.position.set(0, 0, -0.016);
    g.add(palm);
    // Fingers from the knuckles: index (toward the thumb) … little finger.
    // Each bone's capsule is as long as the bone plus its own width, so
    // neighbours overlap: one smooth finger that bends, not a row of beads.
    const thumbSide = -side;
    const specs = [
      { len: [0.0112, 0.0074, 0.006], w: 0.0068 },
      { len: [0.0122, 0.008, 0.0064], w: 0.007 },
      { len: [0.0116, 0.0076, 0.006], w: 0.0066 },
      { len: [0.0092, 0.0062, 0.0052], w: 0.0058 },
    ];
    const curl = [0.95, 1.1, 0.7];
    specs.forEach((sp, f) => {
      const root = new THREE.Group();
      // The knuckle line curves: the middle finger furthest forward.
      root.position.set(thumbSide * (0.0099 - f * 0.0066), 0.0004, -0.031 - (f === 1 ? 0.0012 : f === 3 ? -0.0018 : 0));
      root.rotation.y = thumbSide * (f - 1.5) * -0.04; // fingers fan a little
      g.add(root);
      const bones: THREE.Group[] = [];
      let parent: THREE.Object3D = root;
      sp.len.forEach((len, k) => {
        const bone = new THREE.Group();
        if (k > 0) bone.position.z = -sp.len[k - 1];
        parent.add(bone);
        const r = (sp.w / 2) * (1 - k * 0.08);
        const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 8), this.skin);
        seg.rotation.x = Math.PI / 2;
        seg.position.z = -len / 2;
        seg.scale.set(1, 1, 0.86); // a finger is a touch flatter than round
        bone.add(seg);
        bones.push(bone);
        parent = bone;
      });
      fingers.push({ bones, curl });
    });
    // The thumb: from the heel of the palm on the inside, angled across, two bones.
    const tRoot = new THREE.Group();
    tRoot.position.set(thumbSide * 0.0125, -0.003, -0.006);
    tRoot.rotation.set(-0.3, thumbSide * 0.6, thumbSide * -0.45);
    g.add(tRoot);
    const meta = new THREE.Mesh(new THREE.CapsuleGeometry(0.0046, 0.011, 3, 8), this.skin);
    meta.rotation.x = Math.PI / 2;
    meta.position.z = -0.0065;
    tRoot.add(meta);
    const tBones: THREE.Group[] = [];
    let tp: THREE.Object3D = tRoot;
    [0.0088, 0.0074].forEach((len, k) => {
      const bone = new THREE.Group();
      bone.position.z = k === 0 ? -0.013 : -0.0088;
      tp.add(bone);
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.0041 - k * 0.0004, len, 3, 8), this.skin);
      seg.rotation.x = Math.PI / 2;
      seg.position.z = -len / 2;
      bone.add(seg);
      tBones.push(bone);
      tp = bone;
    });
    fingers.push({ bones: tBones, curl: [0.45, 0.65] });
    this.fingers.set(g, fingers);
    g.scale.setScalar(0.95);
    return g;
  }
}
