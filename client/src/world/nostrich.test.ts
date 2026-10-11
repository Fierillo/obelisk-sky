import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Flock, Nostrich, NOSTRICH_HEIGHT, SCARE_RADIUS, WILD_HEIGHT, type FlockWorld } from './nostrich';
import type { Vec2 } from './layout';

describe('a nostrich', () => {
  it('stands about its nominal height, feet on the ground', () => {
    const n = new Nostrich();
    n.update(0.016, 0);
    n.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(n.root);
    expect(box.min.y).toBeGreaterThan(-0.03);
    expect(box.min.y).toBeLessThan(0.03);
    expect(Math.abs(box.max.y - NOSTRICH_HEIGHT)).toBeLessThan(0.2);
  });
  it('swings its legs in turn when it runs, and stands still when it doesn\'t', () => {
    const n = new Nostrich();
    const hip = (i: number) => (n.root.children[i] as THREE.Group).rotation.x;
    n.mode = 'idle';
    for (let i = 0; i < 30; i++) n.update(1 / 30, 0);
    expect(Math.abs(hip(0))).toBeLessThan(1e-6);
    n.mode = 'run';
    let opposite = 0;
    for (let i = 0; i < 60; i++) { n.update(1 / 30, 3); if (hip(0) * hip(1) < -0.01) opposite++; }
    expect(opposite).toBeGreaterThan(30);
  });
});

describe('the wild flock', () => {
  // An open field: anywhere is walkable, paths are straight lines.
  const field = (): FlockWorld => ({
    spotNear: (p, r) => ({ x: p.x + r * 0.7, z: p.z - r * 0.3 }),
    path: (_from, to) => [to],
    groundAt: () => 0,
  });
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  it('roams about rather than standing still', () => {
    const f = new Flock(field(), [{ x: 0, z: 0 }], 2, rand);
    const start = f.positions();
    for (let i = 0; i < 600; i++) f.update(1 / 30, []);
    const end = f.positions();
    expect(Math.max(...end.map((p, i) => Math.hypot(p.x - start[i].x, p.z - start[i].z)))).toBeGreaterThan(1);
  });

  it('scatters away from someone running at it', () => {
    const f = new Flock(field(), [{ x: 0, z: 0 }], 1, rand);
    const bird = f.positions()[0];
    const runner: Vec2 = { x: bird.x - SCARE_RADIUS * 0.5, z: bird.z };
    for (let i = 0; i < 20; i++) f.update(1 / 30, [runner]);
    const now = f.positions()[0];
    expect(Math.hypot(now.x - runner.x, now.z - runner.z)).toBeGreaterThan(Math.hypot(bird.x - runner.x, bird.z - runner.z) + 0.5);
  });

  it('is sized like a tall villager', () => {
    expect(WILD_HEIGHT).toBeGreaterThan(0.72);
    expect(WILD_HEIGHT).toBeLessThan(1);
  });
});
