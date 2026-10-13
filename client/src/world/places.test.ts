import { describe, it, expect } from 'vitest';
import { HAUNT_SHARE, MAX_HAUNTS, PLACE_IDS, parseHaunts, pickIdle, toggleHaunt, type PlaceId } from './places';
import { rng } from './layout';

describe('parseHaunts', () => {
  it('keeps known places in order, without repeats, three at most', () => {
    expect(parseHaunts(['pond', 'nowhere', 'pond', 'plaza', 3, null, 'gym', 'park'])).toEqual(['pond', 'plaza', 'gym']);
    expect(parseHaunts(['coffee'])).toEqual(['coffee']);
    expect(MAX_HAUNTS).toBe(3);
  });
  it('reads anything else as none', () => {
    for (const x of [undefined, null, 'pond', { 0: 'pond' }, 4]) expect(parseHaunts(x)).toEqual([]);
  });
  it('knows every place it offers', () => {
    expect(parseHaunts([...PLACE_IDS])).toEqual(PLACE_IDS.slice(0, 3));
  });
});

describe('toggleHaunt', () => {
  it('adds, removes, and a fourth replaces the oldest', () => {
    let l: PlaceId[] = [];
    l = toggleHaunt(l, 'pond');
    l = toggleHaunt(l, 'gym');
    l = toggleHaunt(l, 'plaza');
    expect(l).toEqual(['pond', 'gym', 'plaza']);
    expect(toggleHaunt(l, 'market')).toEqual(['gym', 'plaza', 'market']);
    expect(toggleHaunt(l, 'gym')).toEqual(['pond', 'plaza']);
  });
});

describe('pickIdle', () => {
  const day = { daylight: true, night: false, hasHome: true };
  const night = { daylight: false, night: true, hasHome: true };
  const many = (ctx: Parameters<typeof pickIdle>[1], n = 4000) => {
    const r = rng(42);
    return Array.from({ length: n }, () => pickIdle(r, ctx));
  };

  it('never picks a haunt for someone without any', () => {
    expect(many({ ...day, haunts: [] }).every((x) => x.haunt === null)).toBe(true);
  });

  it('sends about two idle rolls in three to a haunt, spread over them', () => {
    const out = many({ ...day, haunts: ['pond', 'park'] });
    const hits = out.filter((x) => x.haunt).length / out.length;
    expect(hits).toBeGreaterThan(HAUNT_SHARE - 0.04);
    expect(hits).toBeLessThan(HAUNT_SHARE + 0.04);
    const pond = out.filter((x) => x.haunt === 'pond').length, park = out.filter((x) => x.haunt === 'park').length;
    expect(Math.abs(pond - park) / (pond + park)).toBeLessThan(0.1);
  });

  it('is the same roll from the same seed', () => {
    expect(many({ ...day, haunts: ['pond'] }, 50)).toEqual(many({ ...day, haunts: ['pond'] }, 50));
  });

  it('closes the café at night', () => {
    expect(many({ ...night, haunts: ['coffee'] }).every((x) => x.haunt === null)).toBe(true);
    expect(many({ ...night, haunts: ['coffee', 'campfire'] }).some((x) => x.haunt === 'coffee')).toBe(false);
    expect(many({ ...day, haunts: ['coffee'] }).some((x) => x.haunt === 'coffee')).toBe(true);
  });

  it('at night, home still wins as often as without haunts', () => {
    const out = many({ ...night, haunts: ['campfire'] });
    expect(out.filter((x) => x.roll < 0.35).every((x) => x.haunt === null)).toBe(true);
    expect(out.some((x) => x.haunt === 'campfire')).toBe(true);
    // Without a home there's nothing to go into: haunts get those rolls too.
    expect(many({ ...night, hasHome: false, haunts: ['campfire'] }).some((x) => x.roll < 0.35 && x.haunt)).toBe(true);
  });

  it('skips home for someone with no home', () => {
    expect(many({ ...day, hasHome: false, haunts: ['home'] }).every((x) => x.haunt === null)).toBe(true);
  });
});
