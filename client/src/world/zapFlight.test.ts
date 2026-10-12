import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { arcPoint, coinCount, flightTime } from './zapFlight';

describe('a zap in flight', () => {
  const a = new THREE.Vector3(0, 2, 0), b = new THREE.Vector3(10, 2, 0);

  it('leaves the sender and lands on the recipient', () => {
    expect(arcPoint(a, b, 0).distanceTo(a)).toBeLessThan(1e-9);
    expect(arcPoint(a, b, 1).distanceTo(b)).toBeLessThan(1e-9);
  });

  it('arcs over the ground between them, higher for a longer throw', () => {
    expect(arcPoint(a, b, 0.5).y).toBeGreaterThan(3);
    expect(arcPoint(a, new THREE.Vector3(2, 2, 0), 0.5).y).toBeLessThan(arcPoint(a, b, 0.5).y);
  });

  it('takes longer the farther it goes, within limits', () => {
    expect(flightTime(1)).toBeCloseTo(0.7);
    expect(flightTime(10)).toBeGreaterThan(flightTime(5));
    expect(flightTime(100)).toBe(2.2);
  });

  it('bursts into more coins for more sats, capped', () => {
    expect(coinCount(1)).toBe(6);
    expect(coinCount(1000)).toBeGreaterThan(coinCount(10));
    expect(coinCount(1e9)).toBe(24);
  });
});
