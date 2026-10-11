// Where a click-to-walk is taking you: a pin drops onto the spot with a
// bounce and a ring pulses out under it; it fades once you arrive or steer
// away. Red, briefly, where there's no way to get to.

import * as THREE from 'three';

const DROP_S = 0.45;
const FADE_S = 0.3;

/** The pin's height over the ground at time t (s): drops in, bounces, settles to a bob. */
export function pinHeight(t: number): number {
  if (t < DROP_S) {
    const k = t / DROP_S;
    // Fall from 1.2, a bounce at the end (ease-out-bounce, one hop).
    const fall = 1.2 * (1 - k * k);
    const hop = k > 0.7 ? Math.sin(((k - 0.7) / 0.3) * Math.PI) * 0.08 : 0;
    return 0.22 + fall + hop;
  }
  return 0.22 + Math.sin((t - DROP_S) * 3) * 0.025;
}

export class WalkPin {
  readonly group = new THREE.Group();
  private pin = new THREE.Group();
  private ring: THREE.Mesh;
  private mats: THREE.Material[] = [];
  private t = 0;
  private fade = -1;

  constructor(ok: boolean) {
    const color = ok ? 0xb4f953 : 0xff5b5b;
    const glow = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5, roughness: 0.4, transparent: true });
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    this.mats.push(glow, ringMat);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), glow);
    head.position.y = 0.16;
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.17, 12), glow);
    point.rotation.x = Math.PI; // tip down
    point.position.y = 0.06;
    this.pin.add(head, point);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.15, 28), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.group.add(this.pin, this.ring);
    this.group.renderOrder = 4;
    if (!ok) this.fade = 0.6; // a no-go: show it briefly
  }

  /** Start fading out (arrived, or steering by keys). */
  dismiss(): void {
    if (this.fade < 0) this.fade = FADE_S;
  }

  /** Advance; false once it has faded away. */
  update(dt: number): boolean {
    this.t += dt;
    let alpha = 1;
    if (this.fade >= 0) {
      this.fade -= dt;
      alpha = Math.max(0, Math.min(1, this.fade / FADE_S));
      if (this.fade <= 0) return false;
    }
    this.pin.position.y = pinHeight(this.t) - 0.22;
    this.pin.rotation.y += dt * 1.6;
    const k = (this.t % 1.1) / 1.1;
    this.ring.scale.setScalar(0.8 + k * 1.4);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k) * alpha;
    (this.mats[0] as THREE.MeshStandardMaterial).opacity = alpha;
    return true;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const m of this.mats) m.dispose();
  }
}
