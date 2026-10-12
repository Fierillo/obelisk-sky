import { describe, it, expect } from 'vitest';
import { planIsland, dist, distToPolyline } from './layout';
import { terrainHeight, heightGrid, smoothRiver, BUILDING_SINK } from './island';

describe('the lawn people walk on', () => {
  const plan = planIsland();
  const river = smoothRiver(plan);
  const footprints = plan.slots.map((s) => ({ pos: s.pos, r: s.w * 0.8 + 1.0 }));
  const height = terrainHeight(plan, river, footprints);
  const grid = heightGrid(plan, (p) => height(p));

  it('sinks under every building, so floors at ground level are never pierced', () => {
    for (const s of plan.slots) {
      for (const [dx, dz] of [[0, 0], [0.8, 0.6], [-0.9, -0.7], [1.2, -1.1]]) {
        const p = { x: s.pos.x + dx, z: s.pos.z + dz };
        if (dist(p, s.pos) >= s.w * 0.8 + 0.6) continue; // fully sunk inside r - 0.4
        expect(height(p)).toBeLessThanOrEqual(-BUILDING_SINK + 1e-9);
      }
    }
  });

  it('rolls gently elsewhere, flatter round the plaza', () => {
    let maxAbs = 0;
    for (let x = -8; x <= 8; x += 0.7) for (let z = -8; z <= 8; z += 0.7) maxAbs = Math.max(maxAbs, Math.abs(height({ x, z })));
    expect(maxAbs).toBeGreaterThan(0.01);
    const c = plan.plaza.c;
    expect(Math.abs(height({ x: c.x + plan.plaza.r * 0.5, z: c.z }))).toBeLessThan(0.012);
  });

  it('reads back from the grid within a few millimetres', () => {
    let worst = 0;
    for (let x = -9; x <= 9; x += 0.37) for (let z = -9; z <= 9; z += 0.41) {
      const p = { x, z };
      // The river banks, the pond's shore and the rim drop steeply (and are fenced off).
      if (distToPolyline(p, river) < plan.riverWidth * 0.62 + 0.8 || dist(p, plan.pond.c) < plan.pond.r + 0.8 || Math.abs(height(p)) > 0.1) continue;
      worst = Math.max(worst, Math.abs(grid(p) - height(p)));
    }
    expect(worst).toBeLessThan(0.006);
  });
});
