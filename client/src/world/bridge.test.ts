import { describe, it, expect } from 'vitest';
import { archHeight, bridgeHeightAt, bridgeSpecs, BRIDGE_RISE, BRIDGE_WIDTH } from './bridge';
import { planIsland, buildNavGrid } from './layout';

describe('the bridge arch', () => {
  it('meets each bank flat, peaks mid-span and is smooth', () => {
    expect(archHeight(-1)).toBe(0);
    expect(archHeight(1)).toBe(0);
    expect(archHeight(1.5)).toBe(0);
    expect(archHeight(0)).toBeCloseTo(BRIDGE_RISE, 9);
    let last = archHeight(-1);
    for (let u = -1; u <= 1; u += 0.01) {
      const h = archHeight(u);
      expect(Math.abs(h - last)).toBeLessThan(0.01); // no step anywhere
      last = h;
    }
    // Flat where you step on: the slope vanishes at the banks.
    expect((archHeight(-0.99) - archHeight(-1)) / 0.01).toBeLessThan(0.05);
  });
});

describe('bridges on the island', () => {
  const plan = planIsland();
  const mid = (i: number) => plan.river[i];
  const specs = bridgeSpecs(plan, [mid(Math.floor(plan.river.length / 3))]);
  const b = specs[0];
  const n = { x: -b.t.z, z: b.t.x };
  const at = (across: number, along = 0) => ({ x: b.c.x + n.x * across + b.t.x * along, z: b.c.z + n.z * across + b.t.z * along });

  it('lifts you mid-span and is 0 off the deck', () => {
    expect(bridgeHeightAt(specs, at(0))).toBeCloseTo(BRIDGE_RISE, 6);
    expect(bridgeHeightAt(specs, at(b.half * 0.5))).toBeGreaterThan(0.1);
    expect(bridgeHeightAt(specs, at(b.half + 0.1))).toBe(0);
    expect(bridgeHeightAt(specs, at(0, BRIDGE_WIDTH))).toBe(0); // beside it, over the water
  });

  it('spans the whole walkable corridor, so it reaches the ground on both banks', () => {
    const grid = buildNavGrid(plan, [], specs.map((s) => s.c));
    for (const across of [-b.half - 0.3, b.half + 0.3]) expect(grid.isWalkable(at(across))).toBe(true);
    expect(grid.isWalkable(at(0))).toBe(true);
  });
});
