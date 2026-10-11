import { describe, it, expect } from 'vitest';
import { obeliskShape, LOGO_PROPORTIONS } from './obelisk';

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
