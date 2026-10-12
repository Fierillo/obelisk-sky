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

/** Camera-space rest positions (world units: people are 0.72 tall). */
const REST: HandPose = { x: 0.08, y: -0.092, z: -0.16, pitch: 0.3, roll: 0.25 };

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
    roll: side * REST.roll,
  });
  return { left: hand(-1), right: hand(1) };
}

export class FpHands {
  readonly group = new THREE.Group();
  private readonly left: THREE.Group;
  private readonly right: THREE.Group;
  private readonly skin = new THREE.MeshStandardMaterial({ roughness: 0.75 });
  private readonly sleeve = new THREE.MeshStandardMaterial({ roughness: 0.9 });

  constructor() {
    this.group.name = 'fp-hands';
    this.group.visible = false;
    this.left = this.arm(-1);
    this.right = this.arm(1);
    this.group.add(this.left, this.right);
    this.left.scale.setScalar(0.85);
    this.right.scale.setScalar(0.85);
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
    this.skin.emissive.copy(this.skin.color).multiplyScalar(0.35);
    this.sleeve.emissive.copy(this.sleeve.color).multiplyScalar(0.3);
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

  /** One forearm reaching forward from the bottom corner, the hand at its tip. */
  private arm(side: 1 | -1): THREE.Group {
    const g = new THREE.Group();
    // Forearm along −z (away from you), wrist at the origin.
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.11, 8), this.skin);
    fore.rotation.x = Math.PI / 2;
    fore.position.z = 0.055;
    g.add(fore);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.018, 0.05, 8), this.sleeve);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.z = 0.1;
    g.add(cuff);
    // Hand: palm, four fingers curled a little, the thumb on the inside.
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.01, 0.03), this.skin);
    palm.position.set(0, 0, -0.016);
    g.add(palm);
    for (let f = 0; f < 4; f++) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.0055, 0.0065, 0.022), this.skin);
      finger.position.set(-0.0095 + f * 0.0063, -0.002, -0.04);
      finger.rotation.x = -0.35;
      g.add(finger);
    }
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.007, 0.018), this.skin);
    thumb.position.set(-side * 0.015, 0.001, -0.016);
    thumb.rotation.y = side * 0.6;
    g.add(thumb);
    return g;
  }
}
