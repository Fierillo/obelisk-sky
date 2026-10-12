import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FpHands, handsPose } from './fpHands';

describe('first-person hands', () => {
  it('rest low in the corners, one each side, still when you stand', () => {
    const a = handsPose({ phase: 0, amp: 0, airborne: false, t: 0 });
    const b = handsPose({ phase: 2, amp: 0, airborne: false, t: 0 });
    expect(a.left.x).toBeLessThan(0);
    expect(a.right.x).toBeGreaterThan(0);
    expect(a.right.y).toBeLessThan(0);
    expect(a.right.z).toBeLessThan(-0.1); // in front of you, past the near plane
    expect(b.right).toEqual(a.right);
  });

  it('swing opposite each other as you walk, by a few centimetres at most', () => {
    const p = handsPose({ phase: Math.PI / 2, amp: 0.007, airborne: false, t: 0 });
    expect(Math.sign(p.left.z - -0.16)).toBe(-Math.sign(p.right.z - -0.16));
    expect(Math.abs(p.right.z - -0.16)).toBeLessThan(0.03);
  });

  it('rise a little in a jump', () => {
    const g = handsPose({ phase: 0, amp: 0, airborne: false, t: 0 });
    const j = handsPose({ phase: 0, amp: 0, airborne: true, t: 0 });
    expect(j.right.y).toBeGreaterThan(g.right.y);
  });

  it('follow the camera and take your colours', () => {
    const h = new FpHands();
    h.group.visible = true;
    h.setColors('#a97c5f', '#3d7bd9');
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(1, 2, 3);
    h.update(cam, { phase: 0, amp: 0, airborne: false, t: 0 });
    expect(h.group.position.toArray()).toEqual([1, 2, 3]);
    const mats = new Set<string>();
    h.group.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m) mats.add(m.color.getHexString()); });
    expect(mats.has(new THREE.Color('#3d7bd9').getHexString())).toBe(true);
  });

  it('turn thumb-up (rolled inward, mirrored), not palm-down', () => {
    const p = handsPose({ phase: 0, amp: 0, airborne: false, t: 0 });
    expect(p.right.roll).toBeLessThan(-1);
    expect(p.left.roll).toBeCloseTo(-p.right.roll, 6);
  });

  it('curl the fingers into a loose fist', () => {
    const h = new FpHands();
    const bent: number[] = [];
    h.group.traverse((o) => { if ((o as THREE.Group).isGroup && o.rotation.x < -0.5) bent.push(o.rotation.x); });
    // Two bent joints per finger, four fingers, two hands.
    expect(bent.length).toBe(16);
  });
});
