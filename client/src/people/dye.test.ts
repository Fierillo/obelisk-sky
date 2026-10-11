import { describe, it, expect } from 'vitest';
import { meanLinearLuma } from './people';

/** A 2×2 RGBA image: top row black, bottom row white. */
const img = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255]);

describe('cloth brightness for dyeing', () => {
  it('reads the texels a garment uses, in linear light', () => {
    expect(meanLinearLuma(img, 2, 2, [0.1, 0.1, 0.9, 0.2])).toBe(0);
    expect(meanLinearLuma(img, 2, 2, [0.1, 0.9])).toBeCloseTo(1, 5);
    expect(meanLinearLuma(img, 2, 2, [0.1, 0.1, 0.1, 0.9])).toBeCloseTo(0.5, 5);
  });
  it('treats mid-grey sRGB as linear ~0.21 (why the old ×1.9 lift went black)', () => {
    const grey = new Uint8ClampedArray([128, 128, 128, 255]);
    expect(meanLinearLuma(grey, 1, 1, [0.5, 0.5])).toBeCloseTo(0.216, 2);
  });
  it('wraps repeating UVs and ignores an empty list', () => {
    expect(meanLinearLuma(img, 2, 2, [1.1, 1.9])).toBeCloseTo(1, 5);
    expect(meanLinearLuma(img, 2, 2, [])).toBe(0);
  });
});
