import { describe, it, expect } from 'vitest';
import { millSite, MILL, distToPolyline, type Vec2 } from './layout';

// A straight river running +z at x = 5, with a gentle bend near the start.
const river: Vec2[] = Array.from({ length: 61 }, (_, i) => ({ x: 5 + (i < 20 ? Math.sin(i / 3) * 0.6 : 0), z: -15 + i * 0.5 }));
const half = 0.71;

describe('millSite', () => {
  const s = millSite(river, half, { lo: 0.1, hi: 0.95 })!;
  it('picks the straight stretch', () => {
    expect(s.at.z).toBeGreaterThan(-5);
  });
  it('puts the house on the bank toward the island centre, on land', () => {
    expect(s.n.x).toBeLessThan(-0.99);
    expect(s.house.x).toBeLessThan(5 - half - MILL.houseDepth / 2);
    expect(distToPolyline(s.house, river)).toBeGreaterThan(half + MILL.houseDepth / 2);
  });
  it('puts the whole wheel in the water, its axle across the current', () => {
    expect(distToPolyline(s.wheel, river) + MILL.wheelWidth / 2).toBeLessThanOrEqual(half);
    expect(Math.abs(s.n.x * s.t.x + s.n.z * s.t.z)).toBeLessThan(1e-6);
    // Local +X turned by rot lands on n.
    expect(Math.cos(s.rot)).toBeCloseTo(s.n.x);
    expect(-Math.sin(s.rot)).toBeCloseTo(s.n.z);
  });
  it('spins so the bottom of the wheel moves downstream', () => {
    // Bottom velocity for spin ω about n is ω·(n.z, -n.x).
    const v = { x: s.spin * s.n.z, z: -s.spin * s.n.x };
    expect(v.x * s.t.x + v.z * s.t.z).toBeGreaterThan(0.99);
  });
  it('keeps clear of bridges and blocked ground', () => {
    const bridge = { x: 5, z: 5 };
    const s2 = millSite(river, half, { lo: 0.1, hi: 0.95, avoid: [bridge], blocked: (p) => p.z > 8 })!;
    expect(Math.hypot(s2.at.x - bridge.x, s2.at.z - bridge.z)).toBeGreaterThanOrEqual(2.2);
    expect(s2.house.z).toBeLessThanOrEqual(8);
  });
});
