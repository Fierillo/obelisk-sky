// A zap flying from one person to another: a glowing bolt with a short trail
// of sparks along an arc, and a burst of coins where it lands. Every zap
// shares one texture, sprite material, coin geometry and material, so a
// burst of zaps costs a handful of sprites and nothing to compile.

import * as THREE from 'three';
import { canvasTexture } from './landmarks/signs';

/** Seconds a zap is in the air over `dist` metres. */
export function flightTime(dist: number): number {
  return Math.min(2.2, Math.max(0.7, dist / 7));
}

/** Where the bolt is at `k` (0..1) between `a` and `b`: a lob whose height grows with the distance. */
export function arcPoint(a: THREE.Vector3, b: THREE.Vector3, k: number, out = new THREE.Vector3()): THREE.Vector3 {
  const lift = Math.min(3, 0.6 + a.distanceTo(b) * 0.25);
  return out.copy(a).lerp(b, k).setY(a.y + (b.y - a.y) * k + Math.sin(Math.PI * k) * lift);
}

/** How many coins burst out for `sats`. */
export function coinCount(sats: number): number {
  return Math.min(24, 6 + Math.round(Math.log10(Math.max(sats, 1)) * 5));
}

let shared: { bolt: THREE.SpriteMaterial; spark: THREE.SpriteMaterial; coinGeo: THREE.BufferGeometry; coinMat: THREE.MeshStandardMaterial } | null = null;

export function zapAssets() {
  if (!shared) {
    const map = canvasTexture(64, 64, (g) => {
      const glow = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      glow.addColorStop(0, 'rgba(255,240,150,0.95)');
      glow.addColorStop(0.45, 'rgba(255,200,60,0.45)');
      glow.addColorStop(1, 'rgba(255,170,0,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#fff6c0';
      g.beginPath();
      for (const [x, y] of [[36, 8], [20, 35], [31, 35], [26, 56], [45, 27], [34, 27], [40, 8]]) g.lineTo(x, y);
      g.closePath();
      g.fill();
    });
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;
    shared = {
      bolt: new THREE.SpriteMaterial({ map, color: 0xffe680, ...add }),
      spark: new THREE.SpriteMaterial({ map, color: 0xffb030, opacity: 0.7, ...add }),
      coinGeo: new THREE.CylinderGeometry(0.06, 0.06, 0.015, 10),
      coinMat: new THREE.MeshStandardMaterial({ color: 0xffc83d, emissive: 0xffa000, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 }),
    };
  }
  return shared;
}

/** A zap queued longer than this (a hidden tab, Watch mode: the frame loop paused) no longer flies. */
export const ZAP_STALE_MS = 30_000;

export interface ZapFlightHooks {
  /** Ground height under (x, z): where the coins settle. */
  groundAt(x: number, z: number): number;
  /** The bolt reached `to` at `at`: cheer, pop the amount, ring the coin. */
  landed(to: string, at: THREE.Vector3, sats: number): void;
}

interface Bolt { to: string; start: THREE.Vector3; end: THREE.Vector3; aim: () => THREE.Vector3 | null; sats: number; age: number; life: number; group: THREE.Group; bolt: THREE.Sprite; sparks: THREE.Sprite[] }
interface Coin { mesh: THREE.Mesh; v: THREE.Vector3; floor: number; age: number }

const COIN_LIFE = 1.6;

/**
 * Every zap in the air and every coin on its way down. Pure three.js (no
 * renderer), so tests drive it frame by frame: `inFlight` and `coins` say
 * what's showing, `landed` fires once per zap.
 */
export class ZapFlights {
  private bolts: Bolt[] = [];
  private coinList: Coin[] = [];
  private p = new THREE.Vector3();

  constructor(private scene: THREE.Object3D, private hooks: ZapFlightHooks, private assets = zapAssets) {}

  get inFlight(): number { return this.bolts.length; }
  get coins(): number { return this.coinList.length; }

  /** Throw a zap from `start` at whatever `aim` says (the recipient's head, now). */
  launch(to: string, start: THREE.Vector3, aim: () => THREE.Vector3 | null, sats: number): void {
    const end = aim();
    if (!end) return;
    const { bolt: boltMat, spark: sparkMat } = this.assets();
    // Its own material: each bolt wobbles on its own (a shared one turns them all together).
    const bolt = new THREE.Sprite(boltMat.clone());
    bolt.scale.setScalar(0.5);
    const sparks = [0, 1, 2].map((i) => {
      const s = new THREE.Sprite(sparkMat);
      s.scale.setScalar(0.32 - i * 0.07);
      return s;
    });
    const group = new THREE.Group();
    group.add(bolt, ...sparks);
    this.scene.add(group);
    const b: Bolt = { to, start: start.clone(), end: end.clone(), aim, sats, age: 0, life: flightTime(start.distanceTo(end)), group, bolt, sparks };
    this.place(b);
    this.bolts.push(b);
  }

  tick(dt: number): void {
    for (const b of [...this.bolts]) {
      b.age += dt;
      const now = b.aim();
      if (now) b.end.copy(now);
      this.place(b);
      if (b.age < b.life) continue;
      this.bolts.splice(this.bolts.indexOf(b), 1);
      b.group.removeFromParent();
      (b.bolt.material as THREE.SpriteMaterial).dispose();
      this.burst(b.end, b.sats);
      this.hooks.landed(b.to, b.end.clone(), b.sats);
    }
    for (const c of [...this.coinList]) {
      c.age += dt;
      c.v.y -= 7 * dt;
      c.mesh.position.addScaledVector(c.v, dt);
      if (c.mesh.position.y < c.floor) { c.mesh.position.y = c.floor; c.v.multiplyScalar(0.4); c.v.y = Math.abs(c.v.y) * 0.5; }
      c.mesh.rotation.x += dt * 9;
      if (c.age >= COIN_LIFE) { c.mesh.removeFromParent(); this.coinList.splice(this.coinList.indexOf(c), 1); }
    }
  }

  /** Everything off the stage at once (a relay switch). */
  clear(): void {
    for (const b of this.bolts) { b.group.removeFromParent(); (b.bolt.material as THREE.SpriteMaterial).dispose(); }
    for (const c of this.coinList) c.mesh.removeFromParent();
    this.bolts = [];
    this.coinList = [];
  }

  private place(b: Bolt): void {
    const k = Math.min(1, b.age / b.life);
    const ease = k * k * (3 - 2 * k);
    b.bolt.position.copy(arcPoint(b.start, b.end, ease, this.p));
    (b.bolt.material as THREE.SpriteMaterial).rotation = Math.sin(b.age * 18) * 0.3;
    b.sparks.forEach((s, i) => s.position.copy(arcPoint(b.start, b.end, Math.max(0, ease - (i + 1) * 0.045), this.p)));
  }

  private burst(at: THREE.Vector3, sats: number): void {
    const { coinGeo, coinMat } = this.assets();
    const floor = this.hooks.groundAt(at.x, at.z) + 0.02;
    for (let i = 0; i < coinCount(sats); i++) {
      const mesh = new THREE.Mesh(coinGeo, coinMat);
      mesh.position.copy(at);
      this.scene.add(mesh);
      this.coinList.push({ mesh, floor, age: 0, v: new THREE.Vector3((Math.random() - 0.5) * 2.2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2.2) });
    }
  }
}
