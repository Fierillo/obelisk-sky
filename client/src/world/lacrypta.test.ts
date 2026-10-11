import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { laCryptaGround, LA_CRYPTA_STAIRS, LA_CRYPTA_ROOM } from './lacrypta';

describe('La Crypta: the ground you walk on', () => {
  const { foot, top, lift } = LA_CRYPTA_STAIRS;
  it('is the street at the foot of the steps and the door level at the top', () => {
    expect(laCryptaGround(foot)).toBeLessThan(0.02);
    expect(laCryptaGround(top)).toBeCloseTo(lift, 5);
  });
  it('rises steadily up the steps, never a ledge to jump', () => {
    const up = [...LA_CRYPTA_STAIRS.path].reverse();
    let last = laCryptaGround(up[0]);
    for (const p of up.slice(1)) {
      const h = laCryptaGround(p);
      expect(h).toBeGreaterThanOrEqual(last);
      expect(h - last).toBeLessThan(0.06);
      last = h;
    }
    expect(last).toBeCloseTo(lift, 5);
  });
  it('eases off the side of the steps onto the grass without a ledge', () => {
    // (The landing by the door is a slab: off its side you hop down to the grass.)
    for (const p of LA_CRYPTA_STAIRS.path.filter((q) => q.z > 0.45)) {
      let last = laCryptaGround(p);
      for (let k = 1; k <= 40; k++) {
        const h = laCryptaGround({ x: p.x - k * 0.01, z: p.z });
        expect(Math.abs(h - last)).toBeLessThan(0.06);
        last = h;
      }
    }
  });
  it('is the raised floor inside, in the doorway and on the landing', () => {
    const r = LA_CRYPTA_ROOM;
    expect(laCryptaGround({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 })).toBe(lift);
    expect(laCryptaGround({ x: top.x, z: -0.03 })).toBe(lift);
    expect(laCryptaGround({ x: top.x, z: 0.2 })).toBe(lift);
  });
  it('is flat street in front of the set-back left wing and beside the house', () => {
    expect(laCryptaGround({ x: -2, z: 0.5 })).toBe(0);
    expect(laCryptaGround({ x: -2, z: -0.2 })).toBe(0);
    expect(laCryptaGround({ x: 3, z: 1 })).toBe(0);
  });
});

describe('La Crypta interior decals', () => {
  it('hang clear of the panelling and draw in front of it (they flickered at 6 mm)', async () => {
    const { DECAL_GAP, decal } = await import('./lacryptaInterior');
    expect(DECAL_GAP).toBeGreaterThanOrEqual(0.02);
    const m = decal(new THREE.MeshBasicMaterial());
    expect(m.polygonOffset).toBe(true);
    expect(m.polygonOffsetFactor).toBeLessThan(0);
  });
});
