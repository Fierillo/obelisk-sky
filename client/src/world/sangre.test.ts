// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SangreFx, buildKnife } from './sangre';

/** A body standing with both arms up (body space, people are 0.72 tall). */
const BONES: Record<string, [number, number, number]> = {
  hand_l: [0.2, 0.8, 0.02], middle_01_l: [0.22, 0.84, 0.02],
  hand_r: [-0.2, 0.8, 0.02], middle_01_r: [-0.22, 0.84, 0.02],
  neck_01: [0, 0.58, 0], Head: [0, 0.62, 0],
};
const bone = (n: string, out: THREE.Vector3) => (BONES[n] ? out.set(...BONES[n]) : null);

function run(fx: SangreFx, seconds: number, ground = 0) {
  for (let t = 0; t < seconds; t += 1 / 30) fx.update(1 / 30, bone, ground);
}

describe('the Sangreee... props', () => {
  it('puts a knife in each fist, blade carrying on from the hand', () => {
    const fx = new SangreFx(() => 0.5);
    fx.update(0.016, bone, 0);
    const [l, r] = fx.knives;
    expect(l.position.distanceTo(new THREE.Vector3(...BONES.hand_l))).toBeLessThan(0.05);
    expect(r.position.x).toBeLessThan(0);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(l.quaternion);
    expect(up.x).toBeGreaterThan(0);
    expect(up.y).toBeGreaterThan(0.8);
  });

  it('a knife is a handle, a guard, a blade and blood on its tip', () => {
    const k = buildKnife();
    expect(k.children).toHaveLength(4);
    const box = new THREE.Box3().setFromObject(k);
    expect(box.max.y).toBeGreaterThan(0.12);
    expect(box.min.y).toBeLessThan(-0.04);
  });

  it('bleeds: a stain on the neck, spurts that fly and fall, a pool that grows at the feet', () => {
    const fx = new SangreFx(() => 0.5);
    run(fx, 0.5);
    expect(fx.stain.visible).toBe(false);
    expect(fx.drops.count).toBe(0);
    run(fx, 1);
    expect(fx.stain.visible).toBe(true);
    expect(fx.drops.count).toBeGreaterThan(0);
    run(fx, 2);
    expect(fx.landed).toBeGreaterThan(4);
    expect(fx.puddle.visible).toBe(true);
    // On the floor, in front of the body (the spurts go forward).
    expect(fx.puddle.position.y).toBeCloseTo(0.004, 3);
    expect(fx.puddle.position.z).toBeGreaterThan(0.05);
    const r1 = fx.puddle.scale.x;
    run(fx, 3);
    expect(fx.puddle.scale.x).toBeGreaterThan(r1);
    expect(fx.puddle.scale.x).toBeLessThanOrEqual(0.085);
    // Never more drops in the air than the instanced mesh holds.
    expect(fx.drops.count).toBeLessThanOrEqual(fx.drops.instanceMatrix.count);
  });

  it('shouts SANGREEE over the name badge once the arms go up', () => {
    const fx = new SangreFx(() => 0.5);
    run(fx, 0.3);
    expect(fx.shout.visible).toBe(false);
    run(fx, 1.5);
    expect(fx.shout.visible).toBe(true);
    // Above the badge (0.3 over the head), centred over the head.
    expect(fx.shout.position.y).toBeGreaterThan(BONES.Head[1] + 0.45);
    expect(Math.abs(fx.shout.position.x)).toBeLessThan(0.02);
    expect(fx.shout.scale.x).toBeGreaterThan(0.45);
    expect((fx.shout.material as THREE.Material).userData.shared).toBe(true);
  });

  it('pools on the ground it is given', () => {
    const fx = new SangreFx(() => 0.5);
    run(fx, 3, -0.03);
    expect(fx.puddle.position.y).toBeCloseTo(-0.026, 3);
  });

  it('shares its materials, and marks them so first person never hides them for everyone', () => {
    const a = new SangreFx(), b = new SangreFx();
    expect((a.stain.material as THREE.Material)).toBe(b.stain.material);
    expect((a.stain.material as THREE.Material).userData.shared).toBe(true);
    const parent = new THREE.Group();
    parent.add(a.group);
    a.dispose();
    expect(a.group.parent).toBeNull();
  });
});
