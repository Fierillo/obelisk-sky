// Your own hands in first person: two forearms and hands at the bottom
// corners of the view, in your skin tone with your top's sleeves, swinging
// gently with your stride (in step with fpFeel's bob), lifting a little in a
// jump. They hang off the camera (World.setFirstPerson shows them; the
// self-view while you sit or train hides them, the body is drawn then).

import * as THREE from 'three';

export interface HandsInput {
  /** Stride phase (radians) and bob amplitude, from FpFeel. */
  phase: number;
  amp: number;
  airborne: boolean;
  /** Seconds since start, for the idle breathing. */
  t: number;
}

export interface HandPose { x: number; y: number; z: number; pitch: number; roll: number }

/** Camera-space rest positions (world units: people are 0.72 tall): low in
 *  the corners, loose fists turned thumb-up (rolled inward), so you see the
 *  backs of the fingers and the knuckles, never a flat palm. */
const REST: HandPose = { x: 0.09, y: -0.097, z: -0.16, pitch: 0.2, roll: 1.2 };

/** Where each hand is (camera space): at rest low in the corners, swinging
 *  opposite to each other as you walk, raised a touch in the air. Pure. */
export function handsPose(i: HandsInput): { left: HandPose; right: HandPose } {
  // Swing scales with the bob: 0 standing, a few centimetres running.
  const k = Math.min(1, i.amp / 0.007);
  const swing = Math.sin(i.phase) * 0.012 * k;
  const lift = Math.abs(Math.cos(i.phase)) * 0.004 * k;
  const breathe = Math.sin(i.t * 1.3) * 0.0015;
  const air = i.airborne ? 0.012 : 0;
  const hand = (side: 1 | -1): HandPose => ({
    x: side * REST.x,
    y: REST.y + breathe + air + lift,
    z: REST.z + side * swing,
    pitch: REST.pitch + side * swing * 3 + (i.airborne ? -0.15 : 0),
    roll: -side * REST.roll,
  });
  return { left: hand(-1), right: hand(1) };
}

export class FpHands {
  readonly group = new THREE.Group();
  private readonly left: THREE.Group;
  private readonly right: THREE.Group;
  private readonly skin = new THREE.MeshStandardMaterial({ roughness: 0.62 });
  private readonly sleeve = new THREE.MeshStandardMaterial({ roughness: 0.9 });

  constructor() {
    this.group.name = 'fp-hands';
    this.group.visible = false;
    this.left = this.arm(-1);
    this.right = this.arm(1);
    this.group.add(this.left, this.right);
    this.left.scale.setScalar(0.95);
    this.right.scale.setScalar(0.95);
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
    const p = handsPose(i);
    for (const [g, h] of [[this.left, p.left], [this.right, p.right]] as const) {
      g.position.set(h.x, h.y, h.z);
      g.rotation.set(h.pitch, 0, h.roll);
    }
  }

  /** One forearm reaching forward from the bottom corner, the hand at its tip:
   *  a loose fist (fingers curled at two joints), the thumb along its top. */
  private arm(side: 1 | -1): THREE.Group {
    const g = new THREE.Group();
    // Forearm along +z (back toward you), wrist at the origin; the sleeve
    // covers its back half.
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0145, 0.12, 10), this.skin);
    fore.rotation.x = Math.PI / 2;
    fore.position.z = 0.058;
    g.add(fore);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.0175, 0.0195, 0.075, 10), this.sleeve);
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.z = 0.085;
    g.add(sleeve);
    const cuffEdge = new THREE.Mesh(new THREE.TorusGeometry(0.0172, 0.0022, 6, 14), this.sleeve);
    cuffEdge.position.z = 0.0475;
    g.add(cuffEdge);
    // The back of the hand (palm facing −y before the roll), a little rounded.
    const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.012, 3, 8), this.skin);
    palm.rotation.z = Math.PI / 2;
    palm.scale.set(1, 1, 1.45);
    palm.position.set(0, 0, -0.016);
    g.add(palm);
    // Fingers: from the knuckles, bent down toward the palm at two joints.
    const seg = (len: number, w: number) => new THREE.Mesh(new THREE.CapsuleGeometry(w / 2, len, 2, 6), this.skin);
    for (let f = 0; f < 4; f++) {
      const knuckle = new THREE.Group();
      knuckle.position.set(-0.009 + f * 0.006, -0.001, -0.029 + Math.abs(f - 1.5) * 0.0015);
      knuckle.rotation.x = -0.85;
      const first = seg(0.009, 0.0058);
      first.rotation.x = Math.PI / 2;
      first.position.z = -0.006;
      knuckle.add(first);
      const joint = new THREE.Group();
      joint.position.z = -0.012;
      joint.rotation.x = -1.1;
      const second = seg(0.007, 0.0054);
      second.rotation.x = Math.PI / 2;
      second.position.z = -0.005;
      joint.add(second);
      knuckle.add(joint);
      g.add(knuckle);
    }
    // The thumb rests along the inside of the fist.
    const thumb = seg(0.014, 0.0064);
    thumb.rotation.set(Math.PI / 2 - 0.35, side * 0.45, 0);
    thumb.position.set(-side * 0.0125, -0.004, -0.024);
    g.add(thumb);
    return g;
  }
}
