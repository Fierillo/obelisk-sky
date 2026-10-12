import { describe, it, expect } from 'vitest';
import { chooseLights, lampLevel, lightBudget, type LightSpot } from './lightBudget';

const at = (x: number, kind: 'point' | 'spot' = 'point', lit = true): LightSpot => ({ x, y: 0, z: 0, kind, lit });

describe('the light budget', () => {
  it('keeps the lit lights nearest where you look', () => {
    const lights = [at(10), at(1), at(5), at(2), at(30)];
    expect([...chooseLights(lights, { x: 0, y: 0, z: 0 }, { point: 2, spot: 0 })].sort()).toEqual([1, 3]);
  });

  it('prefers lit lights, then pads with dark ones so the count never changes', () => {
    const lights = [at(1, 'point', false), at(8, 'point', true), at(2, 'point', false)];
    const keep = chooseLights(lights, { x: 0, y: 0, z: 0 }, { point: 2, spot: 0 });
    expect(keep.has(1)).toBe(true);
    expect(keep.size).toBe(2);
    // Same count by day and by night: no shader recompiles.
    const day = chooseLights(lights.map((l) => ({ ...l, lit: false })), { x: 0, y: 0, z: 0 }, { point: 2, spot: 0 });
    expect(day.size).toBe(keep.size);
  });

  it('budgets point and spot lights separately', () => {
    const lights = [at(1, 'spot'), at(2, 'spot'), at(3), at(4), at(5)];
    const keep = chooseLights(lights, { x: 0, y: 0, z: 0 }, { point: 2, spot: 1 });
    expect([...keep].sort()).toEqual([0, 2, 3]);
  });

  it('gives phones and low quality fewer lights', () => {
    expect(lightBudget(true, 'high').point).toBeLessThan(lightBudget(false, 'high').point);
    expect(lightBudget(false, 'low').point).toBeLessThan(lightBudget(false, 'medium').point);
  });
});

describe('street lamps', () => {
  it('are off by day, fully on from early dusk, and rise smoothly between', () => {
    expect(lampLevel(0)).toBe(0);
    expect(lampLevel(0.1)).toBe(0);
    expect(lampLevel(0.45)).toBe(1);
    expect(lampLevel(1)).toBe(1);
    let last = 0;
    for (let n = 0; n <= 1; n += 0.01) {
      const v = lampLevel(n);
      expect(v).toBeGreaterThanOrEqual(last);
      expect(v - last).toBeLessThan(0.07);
      last = v;
    }
  });
});
