import { describe, it, expect } from 'vitest';
import { clipPhase, emoteAnchor, emoteOf, EMOTES } from './emotes';

describe('emotes in step', () => {
  it('dances with music share one wall-clock grid; Sangreee follows the first one near; a nod is its own', () => {
    for (const e of EMOTES.filter((x) => x.music)) expect(emoteAnchor(e, 5000, [])).toBe(0);
    const sangre = emoteOf('sangre')!;
    expect(emoteAnchor(sangre, 5000, [])).toBe(5000);
    expect(emoteAnchor(sangre, 5000, [3000, null, 4000])).toBe(3000);
    expect(emoteAnchor(sangre, 2000, [3000])).toBe(2000);
    expect(emoteAnchor(emoteOf('yes')!, 5000, [1000])).toBeNull();
  });

  it('a clip is at the same place on every screen at the same wall time', () => {
    // Two screens, one 40 s later to start: the same phase at the same instant.
    const now = 1_700_000_123_456;
    expect(clipPhase(now, 0, 4)).toBeCloseTo(((now / 1000) % 4 + 4) % 4);
    expect(clipPhase(now, now - 9_500, 7)).toBeCloseTo(2.5);
    // Never negative (a start a moment in the future).
    expect(clipPhase(1000, 1500, 7)).toBeCloseTo(6.5);
  });
});
