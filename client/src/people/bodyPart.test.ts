import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { bodyPart, headAndNeck, TORSO } from './people';

/** Three triangles, each moved by one bone: the head, the chest, a thigh. */
function body(): { geo: THREE.BufferGeometry; bones: string[] } {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(27).fill(0), 3));
  const idx = [0, 0, 0, 1, 1, 1, 2, 2, 2];
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx.flatMap((b) => [b, 0, 0, 0]), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(idx.flatMap(() => [1, 0, 0, 0]), 4));
  geo.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  return { geo, bones: ['Head', 'spine_02', 'thigh_l'] };
}

describe('cutting the body mesh', () => {
  it('keeps the head for everyone, and the chest for a man swimming shirtless, never the legs', () => {
    const { geo, bones } = body();
    expect([...headAndNeck(geo, bones).index!.array]).toEqual([0, 1, 2]);
    expect([...bodyPart(geo, bones, TORSO).index!.array]).toEqual([3, 4, 5]);
    // Cached per geometry and cut.
    expect(bodyPart(geo, bones, TORSO)).toBe(bodyPart(geo, bones, TORSO));
  });
});
