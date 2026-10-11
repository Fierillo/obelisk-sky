import { describe, it, expect } from 'vitest';
import { WalkPin, pinHeight } from './walkPin';

describe('the walk-to pin', () => {
  it('drops from above, bounces, and settles into a small bob over the spot', () => {
    expect(pinHeight(0)).toBeGreaterThan(1);
    expect(pinHeight(0.3)).toBeLessThan(pinHeight(0.1));
    for (let t = 1; t < 5; t += 0.1) expect(Math.abs(pinHeight(t) - 0.22)).toBeLessThan(0.03);
  });
  it('stays until dismissed, then fades away', () => {
    const p = new WalkPin(true);
    for (let i = 0; i < 120; i++) expect(p.update(1 / 60)).toBe(true);
    p.dismiss();
    let alive = true;
    for (let i = 0; i < 60 && alive; i++) alive = p.update(1 / 60);
    expect(alive).toBe(false);
  });
  it('shows a no-go spot only briefly', () => {
    const p = new WalkPin(false);
    let frames = 0;
    while (p.update(1 / 60) && frames < 600) frames++;
    expect(frames).toBeLessThan(60);
  });
});
