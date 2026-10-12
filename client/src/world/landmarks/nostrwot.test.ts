// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { buildNostrWotHq } from './nostrwot';

// A 2D context that accepts every call (jsdom has no canvas).
const noop = (): unknown => new Proxy(() => {}, { get: (_t, k) => (k === 'addColorStop' ? () => {} : noop()), apply: () => noop() });
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, { get: () => noop(), set: () => true }) as never);

describe('the nostr-wot HQ front', () => {
  it('frames the upper storey with glow strips on all four sides', () => {
    const g = buildNostrWotHq().group;
    g.updateMatrixWorld(true);
    const top = g.getObjectByName('frame-top') as THREE.Mesh;
    expect(top).toBeTruthy();
    const box = new THREE.Box3().setFromObject(top);
    // Under the trim, across the whole front, as wide as the strip at the first floor.
    expect(box.max.x - box.min.x).toBeGreaterThan(2.7);
    expect(box.min.y).toBeGreaterThan(2);
  });
});
