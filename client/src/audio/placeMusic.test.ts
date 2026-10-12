import { describe, it, expect } from 'vitest';
import { nearestPlaces, trackOffset, PLACE_TRACKS, type Place } from './placeMusic';

describe('music at places', () => {
  const places: Place[] = [
    { kind: 'campfire', x: 8, z: 0 },
    { kind: 'campfire', x: 3, z: 0 },
    { kind: 'campfire', x: -4, z: 0 },
    { kind: 'parrilla', x: 0, z: 10 },
    { kind: 'parrilla', x: 0, z: 40 },
  ];

  it('only the nearest place plays: places never mix', () => {
    expect(nearestPlaces(places, { x: 0, z: 0 })).toEqual([{ kind: 'campfire', x: 3, z: 0 }]);
    // Halfway between a campfire and the parrilla: whichever is nearer for its reach, alone.
    expect(nearestPlaces(places, { x: 0, z: 8 })).toEqual([{ kind: 'parrilla', x: 0, z: 10 }]);
    expect(nearestPlaces(places, { x: 8, z: 1 })).toEqual([{ kind: 'campfire', x: 8, z: 0 }]);
  });

  it('the parrilla is heard further, but never in the café\'s or the HQ\'s ground', () => {
    // The village's layout: grill (-7, 5.5), café (-6, 0.5), nostr-wot HQ (-2, 5.5), La Crypta (3.5, 5).
    const grill = { kind: 'parrilla' as const, x: -7, z: 5.5 };
    const quiet = [{ x: -6, z: 0.5 }, { x: -2, z: 5.5 }, { x: 3.5, z: 5 }];
    expect(nearestPlaces([grill], { x: -10.8, z: 4.5 }, quiet)).toEqual([grill]); // 3.9 m out, past the old 3.5 m
    expect(nearestPlaces([grill], { x: -10.5, z: 6 }, quiet)).toEqual([grill]); // behind it
    expect(nearestPlaces([grill], { x: -6.3, z: 2 }, quiet)).toEqual([]); // nearer the café
    expect(nearestPlaces([grill], { x: -4, z: 5.5 }, quiet)).toEqual([]); // nearer the HQ
    expect(nearestPlaces([grill], { x: -7, z: 0.4 }, quiet)).toEqual([]); // past its reach
  });

  it('nothing past a track\'s reach', () => {
    expect(nearestPlaces(places, { x: 0, z: -40 })).toEqual([]);
    const edge = PLACE_TRACKS.campfire.reach;
    expect(nearestPlaces([{ kind: 'campfire', x: edge, z: 0 }], { x: 0, z: 0 })).toEqual([]);
    expect(nearestPlaces([{ kind: 'campfire', x: edge - 0.1, z: 0 }], { x: 0, z: 0 })).toHaveLength(1);
  });

  it('every screen is at the same point in the track at the same wall time', () => {
    expect(trackOffset(1_700_000_010_500, 30)).toBeCloseTo((1_700_000_010.5) % 30);
    expect(trackOffset(45_000, 30)).toBeCloseTo(15);
  });
});
