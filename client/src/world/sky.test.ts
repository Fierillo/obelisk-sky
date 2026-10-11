import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DAY, DUSK, NIGHT } from './sky';

// Light a face turned away from the moon gets: the hemisphere's ground side.
const fill = (p: typeof NIGHT, c: THREE.Color) => {
  const lin = c.clone(); // THREE.Color stores linear values already
  return (0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b) * p.hemiI;
};

describe('fill light by day', () => {
  it('lights the side away from the sun (pets\' bellies, faces, building sides went black)', () => {
    for (const p of [DAY, DUSK]) expect(fill(p, p.hemiGround)).toBeGreaterThan(0.15);
  });
});

describe('night lighting', () => {
  it('keeps faces turned from the moon readable (people and building sides went black)', () => {
    expect(fill(NIGHT, NIGHT.hemiGround)).toBeGreaterThan(0.05);
    expect(fill(NIGHT, NIGHT.hemiSky)).toBeGreaterThan(0.2);
  });
  it('is still darker than the day', () => {
    expect(fill(NIGHT, NIGHT.hemiSky)).toBeLessThan(fill(DAY, DAY.hemiSky));
    expect(NIGHT.sunI).toBeLessThan(DAY.sunI);
  });
});
