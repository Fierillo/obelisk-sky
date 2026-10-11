// Pets (Kenney Cube Pets, CC0, animated) that follow their owner around,
// wander a little while the owner stands still, and dance when the owner
// gets a reaction or a zap. Plus the hats people pick in the creator.

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadGltf } from './assets';
import type { Character } from './character';
import { CHAR_HEIGHT } from './character';
import type { Hat } from '../nostr/avatars';

const PET_HEIGHT = 0.32;

export class Pet {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private wander: { x: number; z: number } | null = null;
  private danceFor = 0;
  private wanderIn = 2;
  readonly label: THREE.Sprite;

  private hopY = 0;

  constructor(readonly kind: string, readonly name: string, private owner: Character) {
    this.root.position.copy(owner.root.position).add(new THREE.Vector3(0.5, 0, 0.4));
    void loadGltf(`pets/${kind}`).then((g) => {
      const model = skeletonClone(g.scene);
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const s = PET_HEIGHT / Math.max(0.001, box.max.y - box.min.y);
      model.scale.setScalar(s);
      model.position.y = -box.min.y * s;
      model.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      this.root.add(model);
      this.mixer = new THREE.AnimationMixer(model);
      for (const clip of g.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
      this.play('idle');
    }).catch(() => { /* no model: no pet */ });
    this.label = nameTag(name);
    this.label.position.y = PET_HEIGHT + 0.16;
    if (name) this.root.add(this.label);
  }

  dance(seconds = 2.5): void {
    this.danceFor = seconds;
  }

  private play(name: string): void {
    const a = this.actions.get(name);
    if (!a || a === this.current) return;
    a.reset().fadeIn(0.2).play();
    this.current?.fadeOut(0.2);
    this.current = a;
  }

  /** `groundAt`: raised ground (a bridge's arch, steps) the pet walks on. */
  update(dt: number, groundAt: (p: { x: number; z: number }) => number = () => 0): void {
    const o = this.owner.root.position;
    const p = this.root.position;
    // Heel position: a little behind and to the side of the owner.
    const heading = this.owner.body.rotation.y;
    const heel = { x: o.x - Math.sin(heading) * 0.55 + Math.cos(heading) * 0.3, z: o.z - Math.cos(heading) * 0.55 - Math.sin(heading) * 0.3 };
    let target = heel;
    const ownerMoving = this.owner.path.length > 0 || !!this.owner.external?.moving;
    if (!ownerMoving) {
      this.wanderIn -= dt;
      if (this.wanderIn <= 0) {
        this.wanderIn = 3 + Math.random() * 5;
        const a = Math.random() * Math.PI * 2;
        this.wander = { x: o.x + Math.cos(a) * 0.9, z: o.z + Math.sin(a) * 0.9 };
      }
      if (this.wander) target = this.wander;
    } else this.wander = null;
    const dx = target.x - p.x, dz = target.z - p.z;
    const d = Math.hypot(dx, dz);
    this.danceFor = Math.max(0, this.danceFor - dt);
    if (d > 0.12) {
      const speed = d > 2.5 ? 3.4 : d > 1 ? 2.2 : 1.1;
      const step = Math.min(d, speed * dt);
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      this.root.rotation.y = Math.atan2(dx, dz);
      this.play(speed > 2 ? 'run' : 'walk');
      // A little hop while moving.
      p.y = groundAt(p) + Math.abs(Math.sin(performance.now() / 110)) * 0.04;
    } else {
      p.y = groundAt(p);
      this.play(this.danceFor > 0 ? 'dance' : 'idle');
    }
    // The owner jumps: the pet jumps along, a beat later and a bit lower.
    this.hopY = THREE.MathUtils.damp(this.hopY, this.owner.jumpY * 0.6, 14, dt);
    p.y += this.hopY;
    if (d > 8) p.set(heel.x, groundAt(heel), heel.z); // teleported owner: catch up at once
    this.mixer?.update(dt);
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.root.removeFromParent();
  }
}

function nameTag(name: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '600 30px Inter, system-ui, sans-serif';
  const w = Math.min(240, g.measureText(name).width + 28);
  g.fillStyle = 'rgba(16,16,20,0.75)';
  g.beginPath();
  g.roundRect((256 - w) / 2, 10, w, 44, 22);
  g.fill();
  g.fillStyle = '#fafafa';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, 128, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(0.5, 0.125, 1);
  return s;
}

/** A hat on top of a blocky head. */
export function buildHat(kind: Hat, color: string): THREE.Object3D | null {
  if (kind === 'none') return null;
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x171717, flatShading: true });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2c94c, metalness: 0.7, roughness: 0.3, flatShading: true });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  switch (kind) {
    case 'cap':
      add(new THREE.BoxGeometry(0.27, 0.07, 0.27), m, 0, 0.035, 0);
      add(new THREE.BoxGeometry(0.25, 0.015, 0.12), m, 0, 0.008, 0.18);
      break;
    case 'beanie':
      add(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 0, 0).scale.set(1, 0.8, 1);
      add(new THREE.CylinderGeometry(0.155, 0.155, 0.045, 12), m, 0, 0.0, 0);
      add(new THREE.SphereGeometry(0.035, 6, 4), m, 0, 0.13, 0);
      break;
    case 'tophat':
      add(new THREE.CylinderGeometry(0.18, 0.18, 0.015, 16), dark, 0, 0.008, 0);
      add(new THREE.CylinderGeometry(0.11, 0.11, 0.2, 16), dark, 0, 0.11, 0);
      add(new THREE.CylinderGeometry(0.112, 0.112, 0.035, 16), m, 0, 0.035, 0);
      break;
    case 'crown':
      add(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 10, 1, true), gold, 0, 0.03, 0);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(new THREE.ConeGeometry(0.03, 0.07, 4), gold, Math.cos(a) * 0.12, 0.09, Math.sin(a) * 0.12);
      }
      break;
    case 'headband':
      add(new THREE.CylinderGeometry(0.152, 0.152, 0.035, 12, 1, true), m, 0, -0.06, 0);
      break;
    case 'boina':
      add(new THREE.SphereGeometry(0.17, 12, 6), m, 0.02, 0.01, 0).scale.set(1, 0.32, 1);
      add(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 5), m, 0.02, 0.06, 0);
      break;
  }
  g.position.y = CHAR_HEIGHT + 0.005;
  return g;
}
