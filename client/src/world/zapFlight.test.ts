// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { arcPoint, coinCount, flightTime, zapAssets, ZapFlights } from './zapFlight';

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

describe('ZapFlights', () => {
  function stage() {
    const scene = new THREE.Scene();
    const landed: { to: string; sats: number; at: THREE.Vector3 }[] = [];
    const z = new ZapFlights(scene, { groundAt: () => 0, landed: (to, at, sats) => landed.push({ to, at, sats }) });
    return { scene, z, landed };
  }
  const run = (z: ZapFlights, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 30) z.tick(1 / 30); };

  it('flies to the recipient, lands once, bursts into coins that settle and go', () => {
    const { scene, z, landed } = stage();
    const head = new THREE.Vector3(10, 2, 0);
    z.launch('bob', new THREE.Vector3(0, 2, 0), () => head, 1000);
    expect(z.inFlight).toBe(1);
    expect(scene.children).toHaveLength(1);
    run(z, flightTime(10) + 0.05);
    expect(z.inFlight).toBe(0);
    expect(landed).toEqual([{ to: 'bob', sats: 1000, at: head }]);
    expect(z.coins).toBe(coinCount(1000));
    run(z, 2);
    expect(z.coins).toBe(0);
    expect(scene.children).toHaveLength(0);
    expect(landed).toHaveLength(1);
  });

  it('follows the recipient while in the air, and keeps the last place if they leave', () => {
    const { z, landed } = stage();
    const head = new THREE.Vector3(4, 2, 0);
    let here = true;
    z.launch('bob', new THREE.Vector3(0, 2, 0), () => (here ? head : null), 21);
    z.tick(0.1);
    head.set(6, 2, 0);
    z.tick(0.1);
    here = false;
    run(z, 3);
    expect(landed[0].at.x).toBeCloseTo(6);
  });

  it('gives each bolt its own material, so they wobble apart', () => {
    const { scene, z } = stage();
    z.launch('a', new THREE.Vector3(), () => new THREE.Vector3(5, 0, 0), 21);
    z.tick(0.05);
    z.launch('b', new THREE.Vector3(), () => new THREE.Vector3(5, 0, 0), 21);
    z.tick(0.03);
    const mats = scene.children.map((g) => ((g as THREE.Group).children[0] as THREE.Sprite).material);
    expect(mats[0]).not.toBe(mats[1]);
    expect(mats[0]).not.toBe(zapAssets().bolt);
    expect(mats[0].rotation).not.toBe(mats[1].rotation);
  });

  it('throws nothing at nobody', () => {
    const { z } = stage();
    z.launch('gone', new THREE.Vector3(), () => null, 21);
    expect(z.inFlight).toBe(0);
  });
});
