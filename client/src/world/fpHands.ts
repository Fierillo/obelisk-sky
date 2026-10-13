// Your own arms in first person, in your skin tone with your top's sleeves.
// They move with your body: every frame the world hands over where your
// body's arm bones are (Character.armPose: shoulder, elbow, wrist, knuckles,
// how closed the fingers are), so the walk, jog and sprint swing, a jump's
// spread arms, a landing and an emote are the very clip the third-person
// body (and its shadow) plays. Those points are carried rigidly into the view
// (viewArm): the shoulders sit just under your eyes and the arm is tipped
// forward so it hangs into the bottom corners instead of out of sight by your
// hips, with the clip's forward swing and its spread a little compressed so
// a jog's fist comes up to the bottom of the view, not across your face.
// The arms hang off your eyes (World.eyeOf: they rise and fall with your
// body), turned with your look, but not with the camera's bob, landing dip or
// roll: those are your head's, not your shoulders'.
//
// Before the body has loaded there is no pose to follow: the hands then fall
// back to `handsPose`, a procedural loose hang and stride swing.
// (World.setFirstPerson shows them; the self-view while you sit or train
// hides them, the body is drawn then.)

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
  /** Your eyes without the camera's own bob, dip and sway (the arms' anchor);
   *  the camera's position when not given. */
  eye?: THREE.Vector3;
}

/** One of your body's arms, in the body's own frame (world units, +z
 *  forward, +x to the body's left), as Character.armPose reads it. */
export interface ArmPoints {
  shoulder: THREE.Vector3;
  elbow: THREE.Vector3;
  wrist: THREE.Vector3;
  /** The middle finger's knuckle. */
  knuckle: THREE.Vector3;
  /** The index and little fingers' knuckles (which way the hand is turned). */
  index: THREE.Vector3;
  pinky: THREE.Vector3;
  /** 0 an open hand … 1 a fist. */
  grip: number;
}
export interface ArmPose { left: ArmPoints; right: ArmPoints }

export function newArmPose(): ArmPose {
  const arm = (): ArmPoints => ({
    shoulder: new THREE.Vector3(), elbow: new THREE.Vector3(), wrist: new THREE.Vector3(),
    knuckle: new THREE.Vector3(), index: new THREE.Vector3(), pinky: new THREE.Vector3(), grip: 0,
  });
  return { left: arm(), right: arm() };
}

const inv = new THREE.Matrix4();
const fingerPts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const seg = new THREE.Vector3();
const seg2 = new THREE.Vector3();

/**
 * Read both arms off a skeleton (Unreal-mannequin bone names: upperarm_l,
 * lowerarm_l, hand_l, middle_01_l …) into `frame`'s space (the body group:
 * its yaw, its scale). False when a bone is missing.
 */
export function readArmPose(bone: (name: string) => THREE.Object3D | undefined, frame: THREE.Object3D, out: ArmPose): boolean {
  frame.updateMatrixWorld(true);
  inv.copy(frame.matrixWorld).invert();
  const at = (name: string, v: THREE.Vector3): boolean => {
    const b = bone(name);
    if (!b) return false;
    b.getWorldPosition(v).applyMatrix4(inv);
    return true;
  };
  for (const [s, a] of [['l', out.left], ['r', out.right]] as const) {
    if (!at(`upperarm_${s}`, a.shoulder) || !at(`lowerarm_${s}`, a.elbow) || !at(`hand_${s}`, a.wrist)
      || !at(`middle_01_${s}`, a.knuckle) || !at(`index_01_${s}`, a.index) || !at(`pinky_01_${s}`, a.pinky)) return false;
    // How closed the hand is: the bends along the middle finger, knuckle to tip.
    const [m2, m3, m4] = fingerPts;
    const tip = at(`middle_04_leaf_${s}`, m4);
    if (!at(`middle_02_${s}`, m2) || !at(`middle_03_${s}`, m3)) { a.grip = 0.4; continue; }
    const pts = tip ? [a.wrist, a.knuckle, m2, m3, m4] : [a.wrist, a.knuckle, m2, m3];
    let bend = 0;
    for (let i = 2; i < pts.length; i++) bend += seg.subVectors(pts[i - 1], pts[i - 2]).angleTo(seg2.subVectors(pts[i], pts[i - 1]));
    if (!tip) bend *= 1.5;
    // The first-person fingers curl 0.69 rad in all open, 2.75 closed (FpHands.curl).
    a.grip = Math.min(1, Math.max(0, (bend / 2.75 - 0.25) / 0.75));
  }
  return true;
}

/** How the body's arm is carried into the view. Angles in radians. */
export const VIEW = {
  /** The right shoulder under your eyes (view space: +x right, +y up, −z ahead); the left is mirrored. */
  pivot: { x: 0.072, y: -0.072, z: 0.01 },
  /** Where a hand hanging as it does standing ends up: tipped this far forward from straight down. */
  rest: 1.38,
  /** The body's hanging hand, as far forward of straight down (the idle clip's). */
  hang: -0.1,
  /** The clip's swing forward and back is kept at this share. */
  swing: 0.45,
  /** Arms raised out to the side (a jump) come in to this share of the spread past `spread0`. */
  spread: 0.25,
  spread0: 0.25,
  /** The whole arm, a touch smaller than the body's (it's right under your eyes). */
  scale: 0.85,
} as const;

/** An arm in view space (relative to the eyes, before the look turns it). */
export interface ViewArm {
  shoulder: THREE.Vector3; elbow: THREE.Vector3; wrist: THREE.Vector3;
  knuckle: THREE.Vector3; index: THREE.Vector3; pinky: THREE.Vector3; grip: number;
}
export function newViewArm(): ViewArm {
  return {
    shoulder: new THREE.Vector3(), elbow: new THREE.Vector3(), wrist: new THREE.Vector3(),
    knuckle: new THREE.Vector3(), index: new THREE.Vector3(), pinky: new THREE.Vector3(), grip: 0,
  };
}

const ARM_KEYS = ['elbow', 'wrist', 'knuckle', 'index', 'pinky'] as const;
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);
const hv = new THREE.Vector3();

/**
 * One body arm carried into the view. Pure. `side` is 1 for the right arm,
 * −1 for the left. Every point turns together (one rigid turn about the
 * shoulder, then the scale), so the arm keeps the clip's own bend, hand and
 * fingers; only how far the whole arm is tipped forward or out to the side
 * is eased toward the view.
 */
export function viewArm(a: ArmPoints, side: 1 | -1, out: ViewArm): ViewArm {
  // Body frame (+z ahead, +x left) → view frame (−z ahead, +x right): half a turn about up.
  for (const k of ARM_KEYS) out[k].set(-(a[k].x - a.shoulder.x), a[k].y - a.shoulder.y, -(a[k].z - a.shoulder.z));
  hv.copy(out.wrist);
  // Out to the side (in the plane across you): raised arms come in.
  const spread = Math.atan2(side * hv.x, -hv.y);
  const pull = Math.max(0, spread - VIEW.spread0) * (1 - VIEW.spread);
  qa.setFromAxisAngle(Z, -side * pull);
  hv.applyQuaternion(qa);
  // Forward of straight down (in the plane along you): tipped forward into view.
  const fwd = Math.atan2(-hv.z, -hv.y);
  const want = VIEW.rest + (fwd - VIEW.hang) * VIEW.swing;
  qb.setFromAxisAngle(X, want - fwd).multiply(qa);
  out.shoulder.set(side * VIEW.pivot.x, VIEW.pivot.y, VIEW.pivot.z);
  for (const k of ARM_KEYS) out[k].applyQuaternion(qb).multiplyScalar(VIEW.scale).add(out.shoulder);
  out.grip = a.grip;
  return out;
}

/** What the fallback pose is built from: the input eased into blends. */
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

/** The fallback (no body pose yet): each hand for this moment. Pure. */
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

/** The hand mesh's own wrist-to-knuckle length (its scale 1). */
const HAND_LEN = 0.031;
/** The forearm mesh's length at scale 1, and the fallback's forearm. */
const FORE_LEN = 0.13;
/** The hand and forearm meshes are drawn this size (not the body's: a hand right under your eyes at its true size fills the corner). */
const HAND_SCALE = 0.95;

/** One arm's pieces: the upper arm (a sleeve), the forearm (skin, the sleeve's end, a cuff), the hand. */
interface ArmRig { upper: THREE.Group; fore: THREE.Group; hand: THREE.Group; elbow: THREE.Mesh }

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const acrossV = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const eul = new THREE.Euler();

/** Turn `g` so its −z runs along `dir` and its +x leans toward `across` (both view space). */
function aim(g: THREE.Object3D, dir: THREE.Vector3, across: THREE.Vector3): void {
  const z = v1.copy(dir).normalize().negate();
  const x = v2.copy(across).addScaledVector(z, -across.dot(z));
  if (x.lengthSq() < 1e-10) x.set(1, 0, 0).addScaledVector(z, -z.x);
  x.normalize();
  const y = v3.crossVectors(z, x);
  g.quaternion.setFromRotationMatrix(m4.makeBasis(x, y, z));
}

export class FpHands {
  readonly group = new THREE.Group();
  private readonly left: ArmRig;
  private readonly right: ArmRig;
  private readonly fingers = new Map<THREE.Group, Finger[]>();
  private readonly skin = new THREE.MeshStandardMaterial({ roughness: 0.62 });
  private readonly sleeve = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  private s: PoseState = { phase: 0, walk: 0, run: 0, air: 0, turn: 0, t: 0 };
  private lastT = -1;
  private lastYaw: number | null = null;
  private readonly va = newViewArm();
  /** Whether the last update followed the body (else the fallback). */
  followingBody = false;

  constructor() {
    this.group.name = 'fp-hands';
    this.group.visible = false;
    this.left = this.arm(-1);
    this.right = this.arm(1);
    for (const r of [this.left, this.right]) this.group.add(r.upper, r.fore, r.hand);
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

  /** The right (1) or left (−1) hand's group: its wrist is the hand's position. */
  handOf(side: 1 | -1): THREE.Group {
    return (side === 1 ? this.right : this.left).hand;
  }

  /** The right (1) or left (−1) shoulder, in world space. */
  shoulderOf(side: 1 | -1, out = new THREE.Vector3()): THREE.Vector3 {
    return (side === 1 ? this.right : this.left).upper.getWorldPosition(out);
  }

  /** Follow your eyes and pose for this frame: as your body's arms when `body` is given, else the fallback. */
  update(camera: THREE.Camera, i: HandsInput, body?: ArmPose | null): void {
    if (!this.group.visible) return;
    // Hung off the eyes, turned with the look (yaw and pitch), not the camera's roll.
    this.group.position.copy(i.eye ?? camera.position);
    eul.setFromQuaternion(camera.quaternion, 'YXZ');
    const yaw = eul.y;
    eul.z = 0;
    this.group.quaternion.setFromEuler(eul);
    const dt = this.lastT < 0 ? 0 : clamp(i.t - this.lastT, 0, 0.1);
    this.lastT = i.t;
    // How fast the look turns (yaw, rad/s).
    let turn = 0;
    if (this.lastYaw !== null && dt > 0) {
      let d = yaw - this.lastYaw;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      turn = d / dt;
    }
    this.lastYaw = yaw;
    this.followingBody = !!body;
    if (body) {
      this.follow(this.right, viewArm(body.right, 1, this.va));
      this.follow(this.left, viewArm(body.left, -1, this.va));
      return;
    }
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
    for (const [r, h] of [[this.left, p.left], [this.right, p.right]] as const) {
      r.upper.visible = false;
      for (const g of [r.hand, r.fore]) {
        g.position.set(h.x, h.y, h.z);
        g.rotation.set(h.pitch, h.yaw, h.roll, 'XYZ');
        g.scale.setScalar(0.95);
      }
      this.fitFore(r, FORE_LEN);
      this.curl(r.hand, h.grip);
    }
  }

  /** Put an arm where the body's is. */
  private follow(r: ArmRig, a: ViewArm): void {
    const side = Math.sign(a.shoulder.x) as 1 | -1;
    r.upper.visible = true;
    // The hand: −z from the wrist to the knuckles, +x toward the little finger
    // on the right hand (the thumb toward −x), mirrored on the left.
    const across = acrossV.subVectors(a.pinky, a.index).multiplyScalar(side);
    r.hand.position.copy(a.wrist);
    aim(r.hand, v1.subVectors(a.knuckle, a.wrist), across);
    r.hand.scale.setScalar(HAND_SCALE);
    this.curl(r.hand, a.grip);
    // The forearm from the wrist back to the elbow, turned with the hand.
    r.fore.position.copy(a.wrist);
    aim(r.fore, v1.subVectors(a.wrist, a.elbow), across);
    r.fore.scale.setScalar(HAND_SCALE);
    this.fitFore(r, a.wrist.distanceTo(a.elbow) / r.fore.scale.x);
    // The upper arm: a sleeve from the shoulder to the elbow.
    r.upper.position.copy(a.shoulder);
    aim(r.upper, v1.subVectors(a.elbow, a.shoulder), across);
    r.upper.scale.set(r.fore.scale.x, r.fore.scale.x, a.elbow.distanceTo(a.shoulder));
  }

  /** Stretch the forearm's pieces to `len` (its own units) from the wrist back to the elbow. */
  private fitFore(r: ArmRig, len: number): void {
    const [skin, sleeve, cuff] = r.fore.children as THREE.Mesh[];
    skin.scale.set(1, len, 0.82);
    skin.position.z = len / 2;
    // The sleeve covers the forearm's back 55 %, its cuff at the edge.
    sleeve.scale.set(1, len * 0.55, 1);
    sleeve.position.z = len * (1 - 0.55 / 2);
    cuff.position.z = len * 0.45;
    r.elbow.position.z = len;
    r.elbow.visible = r.upper.visible;
  }

  /** Close the fingers by `grip` (0 loose … 1 a fist). */
  private curl(g: THREE.Group, grip: number): void {
    for (const f of this.fingers.get(g) ?? []) {
      f.bones.forEach((b, k) => { b.rotation.x = -f.curl[k] * (0.25 + 0.75 * grip); });
    }
  }

  /** One arm: an upper-arm sleeve, a forearm (wrist at its origin, the elbow
   *  along +z), and the hand at the wrist reaching along −z. */
  private arm(side: 1 | -1): ArmRig {
    // Upper arm: a sleeve of unit length along −z (scaled to the bone).
    const upper = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.0215, 0.024, 1, 12), this.sleeve);
    top.rotation.x = Math.PI / 2;
    top.position.z = -0.5;
    upper.add(top);
    // Forearm along +z (back toward the elbow), wrist at the origin, thicker
    // toward the elbow; the sleeve and its cuff cover its back half.
    const fore = new THREE.Group();
    const skin = new THREE.Mesh(new THREE.CylinderGeometry(0.0152, 0.0108, 1, 12), this.skin);
    skin.rotation.x = Math.PI / 2;
    fore.add(skin);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.0212, 0.0182, 1, 12), this.sleeve);
    sleeve.rotation.x = Math.PI / 2;
    fore.add(sleeve);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0024, 6, 16), this.sleeve);
    fore.add(cuff);
    // The elbow, where the sleeves meet.
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.0215, 12, 8), this.sleeve);
    fore.add(elbow);
    // The wrist, and the hand: one rounded slab, wide and thin, the fingers
    // growing out of its front edge.
    const g = new THREE.Group();
    const fingers: Finger[] = [];
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
      root.position.set(thumbSide * (0.0099 - f * 0.0066), 0.0004, -HAND_LEN - (f === 1 ? 0.0012 : f === 3 ? -0.0018 : 0));
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
    const rig: ArmRig = { upper, fore, hand: g, elbow };
    this.fitFore(rig, FORE_LEN);
    return rig;
  }
}
