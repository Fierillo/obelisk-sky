import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildObelisk, obeliskShape, LOGO_PROPORTIONS } from './obelisk';

describe('obelisk landmark', () => {
  it('has the logo proportions from obelisk-media (OB-01, alto = 3.73 × base)', () => {
    const s = obeliskShape(180);
    expect(s.base * 2).toBeCloseTo(48.21, 2);
    expect(s.top * 2).toBeCloseTo(28.93, 2);
    expect(s.shaftH).toBeCloseTo(157.5, 2);
    expect(s.apex - s.shaftH).toBeCloseTo(22.5, 2);
    expect(LOGO_PROPORTIONS.height / LOGO_PROPORTIONS.base).toBeCloseTo(3.73, 2);
  });
  it('keeps them at any size', () => {
    const s = obeliskShape(8);
    expect(s.apex / (s.base * 2)).toBeCloseTo(3.73, 2);
    expect(s.top / s.base).toBeCloseTo(28.93 / 48.21, 5);
    expect(s.shaftH / s.apex).toBeCloseTo(0.875, 5);
  });
});

describe('the plinth', () => {
  it('steps up three times and matches the walking grid', async () => {
    const { plinthSteps } = await import('./obelisk');
    const { PLINTH_HALF } = await import('./layout');
    const st = plinthSteps(8);
    expect(st.map((s) => s.top)).toEqual([0.16, 0.32, 0.5].map((v) => expect.closeTo(v, 5)));
    expect(st[0].half).toBeCloseTo(PLINTH_HALF, 2);
    expect(st[1].half).toBeLessThan(st[0].half);
  });
  it('draws the pale edge strips up the shaft and on to the point', () => {
    const o = buildObelisk(8);
    const edges: THREE.Mesh[] = [];
    o.group.traverse((m) => { if (m.name === 'edge') edges.push(m as THREE.Mesh); });
    expect(edges).toHaveLength(8);
    const { shaftH, apex } = obeliskShape(8);
    // Four reach the tip: centred between the shaft's top and the apex.
    const toTip = edges.filter((e) => Math.abs(e.position.y - (shaftH + apex) / 2) < 1e-6);
    expect(toTip).toHaveLength(4);
  });
});
