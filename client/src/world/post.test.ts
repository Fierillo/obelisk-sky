import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { setSamples } from './post';

describe('changing MSAA between quality levels', () => {
  it('rebuilds every target whose sample count changes, and leaves the rest alone', () => {
    const a = new THREE.WebGLRenderTarget(4, 4, { samples: 4 });
    const b = a.clone();
    let disposed = 0;
    for (const t of [a, b]) t.addEventListener('dispose', () => { disposed++; });
    // "low" turns MSAA off on both of the composer's targets…
    expect(setSamples([a, b], 0)).toBe(2);
    expect([a.samples, b.samples]).toEqual([0, 0]);
    expect(disposed).toBe(2);
    // …and back up to "medium" rebuilds them again (this step used to throw).
    expect(setSamples([a, b], 4)).toBe(2);
    expect(disposed).toBe(4);
    expect(setSamples([a, b], 4)).toBe(0);
    expect(disposed).toBe(4);
  });
});
